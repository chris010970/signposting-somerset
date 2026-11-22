#!/usr/bin/env python3
"""
check_sources.py - check Signposting Somerset records against providers' own information.

Design: extract blind, compare in code.

  1. FETCH    Code fetches the record's url (no AI). Dead links, errors and redirects are recorded.
  2. EXTRACT  Claude reads the page WITHOUT seeing the record's details and writes out every
              service on it in the sheet's own format (days Tue, times 14:00-16:00, postcode,
              phone, email, cost, access...), with an exact quote for each value.
              Code checks every quote is really on the page; values without a verified quote
              are thrown away.
  3. FIND     If the service isn't on that page (or the page is dead or just a homepage),
              Claude is given only the service's name, provider and town - still not its
              details - and follows links on the site and searches the web to find it,
              then extracts it the same way.
  4. COMPARE  Code compares the extracted record with the sheet, field by field.
              Days, times, dates, postcode, phone and email are compared exactly.
              Only where free-text fields differ (address, cost, access, who, frequency, mode)
              is Claude asked whether it's the same thing worded differently or a real change.
  5. VERDICT  Worked out by code from the field results, never chosen by the AI.

Verdicts:
  confirmed       every detail the sheet holds matches the provider's page
  needs_update    something differs - see 'changes' (new values are in sheet format)
  possibly_stale  the page suggests it's paused, ended, or only shows past dates
  partly_checked  what was found matches, but some details aren't on the page
  wrong_url       the record's link is dead/irrelevant and the service wasn't found elsewhere
  cannot_verify   not found online - needs a phone call or email
A confirmation shows the record agrees with what the provider publishes,
not that the service is definitely still running.

Outputs:
  <out>.csv             one row per record
  <out>-fields.csv      one row per record per field (sheet value, page value, result, quote)
  <out>-new.csv         services found on checked pages that aren't in the sheet (candidates only)
  <out>-review.md       read this first: each record's problems in plain words, quoting the provider's page
  <out>-recipes.csv     for each watched field (days, times, place, contacts, mode, cost): the page and the exact
                        words that state it. src/monitor.py checks these later with no AI; run it once straight away
                        to check every quote can be found by a plain scraper
  <out>.jsonl           full detail, for auditing

Setup:
  pip install anthropic requests beautifulsoup4 pypdf
  export ANTHROPIC_API_KEY=...        (PowerShell:  $env:ANTHROPIC_API_KEY="...")
  Use a separate key with a low monthly spend limit, not the Assist key.

Usage:
  python check_sources.py --csv services_7.csv --sample 30 --out trial.csv
  python check_sources.py --csv services_7.csv --ids R0037,R0088,R0150-R0155 --out some.csv   (by record ID)
  python check_sources.py --csv services_7.csv --provider "Mind in Somerset" --out checks/mind.csv   (one organisation)
  python check_sources.py --csv services_7.csv --site mindinsomerset.org.uk --out checks/mind.csv    (one website)
  python check_sources.py --csv services_7.csv --out checks.csv            (everything)
  python check_sources.py --csv "https://docs.google.com/...pub?output=csv" --out checks.csv
Options:
  --model NAME   default claude-haiku-5-5 (claude-sonnet-5-5 is more careful, costs more)
  --no-search    only use the provider's own site
  --js           render JavaScript-heavy pages (Wix etc.): pip install playwright && playwright install chromium
"""
import argparse, csv, io, json, random, re, sys, time, datetime
from collections import defaultdict
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

UA = "Mozilla/5.0 (compatible; SignpostingSomerset-checker/3.0; +https://signpostingsomerset.org.uk)"
OFFLINE_SOURCES = {"flyer", "heads-up-flyers", "phone", "phone-call", "email", "direct"}
PAGE_CHARS = 40000
MAX_TURNS, MAX_FETCHES, MAX_SEARCHES = 10, 5, 3
TODAY = datetime.date.today()

# the sheet fields the checker extracts and compares
EXACT = ["days", "times", "dates", "postcode", "phone", "email"]
FUZZY = ["address", "cost", "access", "who", "frequency", "mode"]
FIELDS = EXACT + FUZZY

FIELD_GUIDE = """Write values in the directory's own format:
- days: three-letter days, ';' between them, or a range: Tue | Mon;Thu | Mon-Fri | Mon-Sun
- times: 24-hour HH:MM-HH:MM (or just HH:MM if only a start is given): 14:00-16:00 | 10:30
  "starts 7pm, lasts about 90 minutes" -> 19:00-20:30. Open all day and night -> Mon-Sun with 00:00-23:59
- frequency: only if not every week: fortnightly | 1st Wed of month | 3rd Thu of month | monthly (dates vary)
- dates: specific dates only (courses, one-off events), YYYY-MM-DD separated by ';'
- address: venue and street (no postcode); postcode: e.g. TA6 3NF
- phone / email: as shown; several separated by ';'
- cost: short, e.g. Free | £3 suggested donation | £6.00 per session
- access: exactly one of: drop in | sign up | call | referral | book
    drop in = just turn up; sign up = contact the service to join (by phone, email or form);
    call = the service IS a phone line or helpline; referral = needs a professional referral; book = book a place or appointment
- who: who it's for, short, e.g. adults 18+ | carers | men | young people 11-18
- mode: in-person | online | phone, ';' between several"""

# ======================================================================= fetching

def cf_decode(h):
    try:
        k = int(h[:2], 16)
        return "".join(chr(int(h[i:i + 2], 16) ^ k) for i in range(2, len(h), 2))
    except Exception:
        return ""

def parse_html(html, base):
    soup = BeautifulSoup(html, "html.parser")
    extra, links, seen = [], [], set()
    for e in soup.select("[data-cfemail]"):
        extra.append(cf_decode(e["data-cfemail"]))
    host = urlparse(base).netloc
    for a in soup.find_all("a", href=True):
        h = a["href"].strip()
        if h.lower().startswith(("mailto:", "tel:")):
            extra.append(h.split(":", 1)[1].split("?")[0])
            continue
        u = urljoin(base, h).split("#")[0]
        if urlparse(u).netloc == host and u not in seen and u != base:
            label = " ".join(a.get_text(" ").split())[:80]
            if label:
                seen.add(u)
                links.append((label, u))
    for t in soup(["script", "style", "noscript", "svg"]):
        t.decompose()
    text = " ".join(soup.get_text(" ").split())
    if extra:
        text += " [Contact links on page: " + ", ".join(x for x in extra if x) + "]"
    return text, links[:80]

_pw = None
def render_js(url):
    global _pw
    from playwright.sync_api import sync_playwright
    if _pw is None:
        _pw = sync_playwright().start().chromium.launch()
    p = _pw.new_page(user_agent=UA)
    try:
        # some sites (e.g. Wix) never go quiet on the network, so don't wait for that: load the page, then give its
        # scripts a few seconds to fill in what they load (e.g. Balsam's days)
        p.goto(url, timeout=45000, wait_until="domcontentloaded")
        try:
            p.wait_for_load_state("networkidle", timeout=8000)
        except Exception:
            pass
        p.wait_for_timeout(2000)
        return p.content(), p.url
    finally:
        p.close()

def is_csv(url, content_type=""):
    """A spreadsheet export: a .csv link, a published Google Sheet's output=csv link, or a CSV content type."""
    u = url.lower()
    return "text/csv" in content_type.lower() or u.split("?")[0].endswith(".csv") or "output=csv" in u

def csv_text(raw):
    """A CSV as readable lines, one per row: 'Class: Tai Chi · Venue: Village Hall · Day: Monday'. Same as detect.csv_text."""
    rows = list(csv.reader(io.StringIO(raw)))
    head = next((r for r in rows if sum(bool(c.strip()) for c in r) >= 2), None)   # first row with 2+ filled cells
    if not head:
        return " ".join(raw.split())
    lines = []
    for r in rows[rows.index(head) + 1:]:
        cells = [f"{h.strip()}: {c.strip()}" if h.strip() else c.strip() for h, c in zip(head, r) if c.strip()]
        if cells:
            lines.append(" · ".join(cells))
    return "\n".join(lines)

def data_url(src):
    """The download address in a source's 'where to look' when it's a spreadsheet export the checker can fetch itself."""
    return next((u.rstrip(".") for u in re.findall(r"https?://[^\s,;)\"']+", (src or {}).get("where_to_look") or "") if is_csv(u)), "")

_pages = {}
_warned_js = False
def fetch(url, use_js=False):
    """dict(status, final_url, text, links, ok). Cached."""
    if url in _pages:
        return _pages[url]
    out = {"status": "", "final_url": url, "text": "", "links": [], "ok": False}
    try:
        r = requests.get(url, headers={"User-Agent": UA}, timeout=30, allow_redirects=True)
        out["final_url"] = r.url
        if r.status_code >= 400:
            out["status"] = f"HTTP {r.status_code}"
        elif is_csv(url, r.headers.get("content-type", "")):
            out["text"], out["status"] = csv_text(r.content.decode("utf-8-sig", errors="replace")), "ok (csv)"
        elif "pdf" in r.headers.get("content-type", "").lower() or url.lower().split("?")[0].endswith(".pdf"):
            from pypdf import PdfReader
            pdf = PdfReader(io.BytesIO(r.content))
            out["text"] = " ".join(" ".join((pg.extract_text() or "").split()) for pg in pdf.pages)
            out["status"] = "ok (pdf)"
        else:
            out["text"], out["links"] = parse_html(r.text, r.url)
            out["status"] = "ok"
    except Exception as e:
        out["status"] = f"error: {type(e).__name__}"
    if use_js and not out["status"].startswith(("HTTP 4", "ok (pdf)", "ok (csv)")) and (use_js == "force" or len(out["text"]) < 800):
        try:
            html, final = render_js(url)
            out["text"], out["links"] = parse_html(html, final)
            out["final_url"], out["status"] = final, "ok (js)"
        except Exception as e:
            out["status"] = (out["status"] or "error") + f" (browser failed: {type(e).__name__})"
            global _warned_js
            if not _warned_js:
                _warned_js = True
                how = ("Install it with: pip install playwright, then: python -m playwright install chromium"
                       if isinstance(e, ImportError) or "Executable doesn't exist" in str(e) else "")
                print(f"WARNING: a page needs a real browser, but it failed ({type(e).__name__}: {str(e)[:120]}). "
                      f"Details loaded by script (e.g. Balsam's days) will show as not on the page. {how}", file=sys.stderr)
    if urlparse(out["final_url"]).path in ("", "/") and urlparse(url).path not in ("", "/"):
        out["status"] += " (redirected to homepage)"
    out["ok"] = out["status"].startswith("ok") and len(out["text"]) > 50
    _pages[url] = out
    if out["final_url"] != url:
        _pages.setdefault(out["final_url"], out)
    time.sleep(0.5)
    return out

def page_block(url, page):
    links = "\n".join(f"- {l} -> {u}" for l, u in page["links"])
    return (f"PAGE {url}\nFetch status: {page['status']}; final address: {page['final_url']}\n"
            f"--- page text ---\n{page['text'][:PAGE_CHARS] or '(no text)'}\n--- end of page text ---\n"
            f"Links on this page (same site):\n{links or '(none)'}")

# ======================================================================= normalising + quote checks

def squash(s):
    for a, b in ((" ", " "), ("–", "-"), ("—", "-"), ("’", "'"), ("‘", "'"),
                 ("“", '"'), ("”", '"'), ("…", "...")):
        s = s.replace(a, b)
    return re.sub(r"\s+", " ", s).strip().lower()

def page_text(url):
    p = _pages.get(url)
    return squash(p["text"]) if p else ""

def on_page(quote, url):
    q = squash(quote or "").strip(' ."\'')
    if len(q) < 2 or not url:
        return False
    t = page_text(url)
    if q in t:
        return True
    parts = [x.strip() for x in q.split("...") if len(x.strip()) >= 3]
    return len(parts) > 1 and all(x in t for x in parts)

DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
def day_set(s):
    s, out = (s or "").lower(), set()
    for a, b in re.findall(r"(mon|tue|wed|thu|fri|sat|sun)\w*\s*-\s*(mon|tue|wed|thu|fri|sat|sun)", s):
        i, j = DAYS.index(a), DAYS.index(b)
        out.update(DAYS[i:j + 1] if i <= j else DAYS[i:] + DAYS[:j + 1])
    out.update(re.findall(r"(mon|tue|wed|thu|fri|sat|sun)", s))
    return out

def time_pair(s):
    t = [f"{int(h):02d}:{m}" for h, m in re.findall(r"(\d{1,2})[:.](\d{2})", s or "")]
    return (t[0] if t else "", t[1] if len(t) > 1 else "")

DAYNAME = {"monday": "Mon", "tuesday": "Tue", "wednesday": "Wed", "thursday": "Thu", "friday": "Fri", "saturday": "Sat", "sunday": "Sun"}
def day_time_pairs(q):
    """[('Mon', '14:00'), ...] from session listings like 'Monday 23 Nov 14:00 Friday 27 Nov 13:00'."""
    out = []
    for d, t in re.findall(r"\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b[^|]{0,25}?(\d{1,2}[:.]\d{2}\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))", (q or "").lower()):
        tt = times_in(t)
        if tt:
            out.append((DAYNAME[d], sorted(tt)[0]))
    return out

def fix_am_typo(t):
    """'10:00-00:30' is a page typo ('10am - 12.30am') for 10:00-12:30: an end in the small hours, before a daytime start."""
    m = re.match(r"\s*(\d{2}):(\d{2})-00:(\d{2})\s*$", t or "")
    return f"{m[1]}:{m[2]}-12:{m[3]}" if m and 6 <= int(m[1]) <= 12 else t

def phones(s):
    out = set()
    for part in re.split(r"[;,/]|\bor\b|\(|\)|text", s or "", flags=re.I):
        d = re.sub(r"\D", "", part)
        if d.startswith("44") and len(d) in (12, 13):
            d = "0" + d[2:]
        if len(d) >= 10 or d in ("111", "999", "116123"):
            out.add(d)
    return out

def emails(s):
    return {e.lower() for e in re.findall(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+", s or "")}

def pc(s):
    return re.sub(r"\s", "", s or "").upper()

def future_dates(s):
    return {d for d in re.findall(r"\d{4}-\d{2}-\d{2}", s or "") if d >= TODAY.isoformat()}

# ======================================================================= AI calls

SERVICE_SCHEMA = {
    "type": "object",
    "properties": {
        "name": {"type": "string"},
        "name_quote": {"type": "string", "description": "The exact words on the page that name this service (its heading or entry title)."},
        "provider": {"type": "string"},
        "town": {"type": "string"},
        "fields": {
            "type": "object",
            "description": "Only details the page actually states. Each: {value, quote}. Omit anything not on the page.",
            "properties": {f: {"type": "object", "properties": {"value": {"type": "string"}, "quote": {"type": "string"}},
                               "required": ["value", "quote"]} for f in FIELDS},
        },
        "stale_signs": {"type": "string", "description": "Exact quote if the SERVICE as a whole is paused, closed, ended, on a long break, or only lists past dates. A single cancelled session or holiday closure is NOT stale: leave empty. Empty if none."},
    },
    "required": ["name", "fields"],
}

EXTRACT_SYSTEM = """You extract structured records from web pages for Signposting Somerset, a directory of local mental health and wellbeing support (groups, drop-ins, courses, helplines, practical help). Today is {today}.

Read the page and list every distinct service on it: each group, session, course or helpline that a person could attend or contact. A page about one group gives one service; a timetable or listing gives one per entry (the same group in two towns, or on two different days at different venues, counts as two). Ignore news items, job adverts, donation appeals and general information.

{guide}

Evidence rules - checked by code, and values that fail are discarded:
- Every value needs "quote": the exact words copied from the page that state it (5-25 words is best). Never paraphrase inside a quote.
- Give name_quote: the exact words on the page that name the service (its heading or listing entry).
- On a page listing several services, every quote must come from that service's own entry, not from another entry or a general section.
- Only record what the page says about THAT service. Organisation-wide contact details count if the page gives them for contacting the service.
- If the page doesn't say something, leave it out. Never guess or fill gaps from general knowledge.
Also say what kind of page it is."""

FIND_SYSTEM = """You find a specific service's own published information for Signposting Somerset, a directory of local mental health and wellbeing support. Today is {today}.

You're given only the service's name, provider and town (not its details - those are being checked). Find the page where the provider (or a partner such as a council or venue) publishes its details, then extract them.
- Start from the page you're given: follow relevant links with fetch_page ("Groups", "What's on", "Timetable", "Find a group", the service's own page).
- If that fails, search the web (name + provider + town). Prefer the provider's own site; then a council, NHS or venue page. Ignore general directories that copy text.
- You may fetch at most {fetches} pages and search at most {searches} times. Stop when you've found it.
- Only use pages you have read with fetch_page as evidence (not search snippets).
- If you can't find it, say found=false. Don't extract a different service instead.

{guide}

Evidence rules - checked by code: every value needs an exact quote from the page in source_url. Leave out anything the page doesn't state. Never guess.
Finish by calling submit_service exactly once."""

JUDGE_SYSTEM = """You compare details in Signposting Somerset's directory with what a provider's page says. For each pair decide:
- same: the same thing, worded differently ("Free" vs "No charge"; "drop in" vs "just turn up"; "Taunton Library" vs "Library, Paul Street, Taunton")
- page_more_specific: consistent, but the page adds useful detail the directory lacks
- different: a real change or conflict a visitor would need to know about
Be strict: if a visitor following the directory would turn up at the wrong place, on the wrong terms, or pay a different amount, it's different.
For "access", the directory's values mean: drop in = just turn up; sign up = contact the service to join (by phone, email or a form); call = the service itself is a phone line or helpline; referral = needs a professional referral; book = book a place. So a group the page says to "call us to join" is "sign up": that is the same, not different.
For "mode" and contact details: a page that mentions only some of the ways in (e.g. only the phone number, when the service also has text or online chat) is the same, not different, unless the page says "only" or that the other way has stopped (e.g. "remote only", "no longer face to face").
For "who": a specialist service that says it is "for anyone" usually means anyone within its own group (e.g. an LGBT+ helpline "for anyone" means anyone LGBT+ or questioning; a carers' line "for anyone" means any carer). That is the same, not different.
Narrower is different: if the page sets a limit the directory doesn't have - an age ("13-18", "aged 14+", "60 and over"), an area ("must live in...", "Somerset residents"), membership or a gate ("invite only", "by referral only", "members only"), or only one way in ("face-to-face only", "remote only") - that is different, never page_more_specific. A visitor going by the directory could be turned away.
But a description of who a service is aimed at, or what it's about, is not a limit: "for anyone experiencing poor mental health", "for people who hear voices", "for adults affected by mental health issues and those supporting them" describe the audience of a mental health group and turn nobody away. Those are the same as the directory's "adults" or "anyone"."""

def ask(client, **kw):
    """One AI call. Streamed, because the Anthropic library refuses long requests otherwise;
    the answer is collected and returned whole, exactly like a normal call."""
    with client.messages.stream(**kw) as s:
        return s.get_final_message()

def usage_add(total, resp):
    u = resp.usage
    for k in ("input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"):
        total[k] += getattr(u, k, 0) or 0
    st = getattr(u, "server_tool_use", None)
    if st:
        total["web_searches"] += getattr(st, "web_search_requests", 0) or 0

def forced_tool_call(client, model, system, content, tool, total, max_tokens=16000):
    resp = ask(client, model=model, max_tokens=max_tokens, system=system, tools=[tool],
                                  tool_choice={"type": "tool", "name": tool["name"]},
                                  messages=[{"role": "user", "content": content}])
    usage_add(total, resp)
    for b in resp.content:
        if b.type == "tool_use":
            return b.input, resp.stop_reason
    return None, resp.stop_reason

_extracted = {}
def rules_block(rules):
    return ("\n\nThe directory maintainer's rules for this source (follow them):\n" + rules) if rules else ""

def extract_page(client, model, url, page, total, rules=""):
    """All services on a page, quote-verified. Cached per url."""
    if url in _extracted:
        return _extracted[url]
    tool = {"name": "page_services", "description": "Report the services on this page.",
            "input_schema": {"type": "object", "properties": {
                "page_kind": {"type": "string", "enum": ["one_service", "listing", "homepage_or_general", "not_relevant"]},
                "services": {"type": "array", "items": SERVICE_SCHEMA}}, "required": ["page_kind", "services"]}}
    system = [{"type": "text", "text": EXTRACT_SYSTEM.format(today=TODAY.strftime("%A %d %B %Y"), guide=FIELD_GUIDE),
               "cache_control": {"type": "ephemeral"}}]
    data, stop = forced_tool_call(client, model, system, page_block(url, page) + rules_block(rules), tool, total, max_tokens=32000)
    data = data or {"page_kind": "not_relevant", "services": []}
    data["truncated"] = stop == "max_tokens"
    data["services"] = [s for s in data.get("services") or [] if isinstance(s, dict)]   # the AI sometimes lists a bare name
    for s in data["services"]:
        verify(s, url, listing=data.get("page_kind") == "listing" or len(data.get("services", [])) > 1)
    _extracted[url] = data
    return data

# ---- does the value actually follow from the quote? (code reads the quote itself)

DAY_WORDS = {"mon": r"mon(day)?s?", "tue": r"tue(s|sday)?s?", "wed": r"wed(s|nesday)?s?", "thu": r"thu(r|rs|rsday)?s?",
             "fri": r"fri(day)?s?", "sat": r"sat(urday)?s?", "sun": r"sun(day)?s?"}
ALL_WEEK = r"every ?day|daily|7 days|7-days?|seven days|24\s*/\s*7|24 hours|24-hours?|day or night|any ?time|365 days|round the clock"

def days_in(q):
    q, out = squash(q), set()
    if re.search(ALL_WEEK, q):
        out.update(DAYS)
    if re.search(r"weekdays?|monday\s*(-|to|until)\s*friday|mon\s*(-|to)\s*fri", q):
        out.update(DAYS[:5])
    if re.search(r"weekends?", q):
        out.update(["sat", "sun"])
    for a, b in re.findall(r"\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\s*(?:-|to|until)\s*(mon|tue|wed|thu|fri|sat|sun)", q):
        i, j = DAYS.index(a), DAYS.index(b)
        out.update(DAYS[i:j + 1] if i <= j else DAYS[i:] + DAYS[:j + 1])
    for d, rx in DAY_WORDS.items():
        if re.search(rf"\b{rx}\b", q):
            out.add(d)
    return out

def _h24(h, m, suf):
    h, m = int(h), int(m or 0)
    if suf:
        suf = suf.replace(".", "")
        if suf in ("noon", "midday"):
            suf = "pm"
        if suf == "pm" and h < 12:
            h += 12
        if suf == "am" and h == 12:
            h = 0
    return f"{h:02d}:{m:02d}"

AMPM = r"(am|pm|a\.m\.|p\.m\.|noon|midday)"
def times_in(q):
    q, out = squash(q), set()
    if re.search(ALL_WEEK, q):
        out.update({"00:00", "23:59"})
    if re.search(r"\b(12\s*)?(noon|midday)\b", q):
        out.add("12:00")
    if "midnight" in q:
        out.update({"00:00", "23:59"})
    for h1, m1, s1, h2, m2, s2 in re.findall(
            rf"\b(\d{{1,2}})(?:[:.](\d{{2}}))?\s*{AMPM}?\s*(?:-|to|till|until)\s*(\d{{1,2}})(?:[:.](\d{{2}}))?\s*{AMPM}?", q):
        if not (s1 or s2 or m1 or m2):
            continue                                   # '2-4' with no am/pm or minutes: not a time
        end = _h24(h2, m2, s2)
        suf1 = s1 or s2
        if not s1 and s2 in ("pm", "p.m.", "noon", "midday") and int(h1) > int(h2) % 12 and int(h1) != 12:
            suf1 = "am"                                # 11-1pm -> 11am
        out.update({_h24(h1, m1, suf1), end})
    for h, m, suf in re.findall(rf"\b(\d{{1,2}})(?:[:.](\d{{2}}))?\s*{AMPM}", q):
        out.add(_h24(h, m, suf))
    for h, m in re.findall(r"\b([01]?\d|2[0-3])[:.]([0-5]\d)\b", q):
        out.add(f"{int(h):02d}:{m}")
    return out

NUM = {"one": 1, "two": 2, "three": 3, "four": 4, "an": 1, "a": 1}
def duration_mins(q):
    q = squash(q)
    if re.search(r"hour and a half|one and a half hours|1\.5 hours", q):
        return 90
    if re.search(r"half an hour", q):
        return 30
    m = re.search(r"\b(\d+|one|two|three|four|an|a)\s*(minutes|mins|hours?|hrs?)\b", q)
    if not m:
        return None
    n = int(m.group(1)) if m.group(1).isdigit() else NUM[m.group(1)]
    return n if m.group(2).startswith("m") else n * 60

MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
def date_in(d, q):
    y, mo, dd = d.split("-")
    q = squash(q)
    day = rf"\b0?{int(dd)}(st|nd|rd|th)?\b"
    return bool(re.search(day, q)) and (MONTHS[int(mo) - 1] in q or re.search(rf"\b0?{int(dd)}[/.]0?{int(mo)}\b", q))

def follows(f, val, q):
    """'' if the value follows from the quote, else the reason it doesn't."""
    if f == "days":
        need, have = day_set(val), days_in(q)
        return "" if need and need <= have else f"quote doesn't say {', '.join(sorted(need - have)) or val}"
    if f == "times":
        start, end = time_pair(val)
        have = times_in(q)
        if start not in have:
            return f"quote doesn't give the start time {start}"
        if end and end not in have:
            dur = duration_mins(q)
            if dur is None:
                return f"quote doesn't give the end time {end}"
            h, m = map(int, start.split(":"))
            t = h * 60 + m + dur
            if f"{t // 60 % 24:02d}:{t % 60:02d}" != end:
                return f"end time {end} doesn't follow from the quote"
        return ""
    if f == "dates":
        bad = [d for d in re.findall(r"\d{4}-\d{2}-\d{2}", val) if not date_in(d, q)]
        return f"quote doesn't give {', '.join(bad)}" if bad else ""
    return ""

# ---- is the quote next to this service on the page? (for pages listing several services)

def positions(quote, url):
    t = page_text(url)
    q = squash(quote or "").strip(' ."\'')
    q = max((x.strip() for x in q.split("...")), key=len) if "..." in q else q
    out, i = [], t.find(q) if q else -1
    while i >= 0 and len(out) < 50:
        out.append(i)
        i = t.find(q, i + 1)
    return out

def anchors(service, url):
    """Where the service itself appears on the page: its name as written there, and its postcode."""
    pts = positions(service.get("name_quote", ""), url) if len(squash(service.get("name_quote", ""))) >= 4 else []
    pcv = service.get("fields", {}).get("postcode", {}).get("value", "")
    rx = pc_regex_text(pcv)
    if rx:
        pts += [m.start() for m in rx.finditer(page_text(url))]
    return pts

def pc_regex_text(v):
    p = pc(v)
    return re.compile(re.escape(p[:-3].lower()) + r"\s?" + re.escape(p[-3:].lower())) if len(p) >= 5 else None

def near(quote, url, pts, window):
    return any(abs(q - a) <= window for q in positions(quote, url) for a in pts)

def verify(service, url, listing=False):
    """Code checks on the AI's extraction. A value is kept only if
       1. its quote is on the page (or, for contacts/postcodes, the value itself is),
       2. for days/times/dates, the value actually follows from the quote, and
       3. on a page listing several services, the quote sits next to this service's entry."""
    service["source_url"] = url
    kept, dropped = {}, []
    for f, v in (service.get("fields") or {}).items():
        if f not in FIELDS or not isinstance(v, dict) or not str(v.get("value", "")).strip():
            continue
        val, q = str(v["value"]).strip(), v.get("quote", "")
        if re.fullmatch(r"<.*>|unknown|n/?a|none|not (stated|given|shown|on page)|-+", val, re.I):
            continue                                   # a placeholder, not a value
        if f == "email" and "@" not in val:
            dropped.append("email (not an email address)")
            continue
        literal = f in ("phone", "email", "postcode") and all(on_page(x, url) for x in re.split(r"\s*;\s*", val) if x)
        if not (on_page(q, url) or literal):
            dropped.append(f"{f} (quote not on page)")
            continue
        why = follows(f, val, q)
        if why:
            dropped.append(f"{f} ({why})")
            continue
        kept[f] = {"value": val, "quote": q}
    service["fields"] = kept
    # proximity: on long or multi-service pages, details must come from this service's own entry
    text_len = len(page_text(url))
    if listing or text_len > 6000:
        window = 1200 if listing else 2500
        tmp = dict(service, fields=kept)
        pts = anchors(tmp, url)
        if not pts:
            if listing:
                service["unanchored"] = True       # can't tie the details to this entry: never 'confirmed'
        else:
            for f in list(kept):
                if f == "postcode" or near(kept[f]["quote"], url, pts, window) or \
                        (f in ("phone", "email") and not listing):
                    continue
                dropped.append(f"{f} (quote is elsewhere on the page, not by this service)")
                kept.pop(f)
    service["unverified"] = dropped
    st = service.get("stale_signs", "")
    if st and not on_page(st, url):
        service["stale_signs_unverified"] = st
        service["stale_signs"] = ""
    return service

def find_service(client, model, rec, start_url, allow_search, use_js, total, log, src=None):
    tools = [{"name": "fetch_page", "description": "Read a web page. Returns its text and same-site links.",
              "input_schema": {"type": "object", "properties": {"url": {"type": "string"}}, "required": ["url"]}},
             {"name": "submit_service", "description": "Submit what you found. Call once, at the end.",
              "input_schema": {"type": "object", "properties": {
                  "found": {"type": "boolean"}, "source_url": {"type": "string"},
                  "service": SERVICE_SCHEMA, "notes": {"type": "string"}}, "required": ["found"]}}]
    if allow_search:
        tools.append({"type": "web_search_20250305", "name": "web_search", "max_uses": MAX_SEARCHES,
                      "user_location": {"type": "approximate", "country": "GB", "timezone": "Europe/London"}})
    system = [{"type": "text", "text": FIND_SYSTEM.format(today=TODAY.strftime("%A %d %B %Y"), guide=FIELD_GUIDE,
                                                         fetches=MAX_FETCHES, searches=MAX_SEARCHES),
               "cache_control": {"type": "ephemeral"}}]
    ident = f"Service: {rec.get('name','')}\nProvider: {rec.get('provider','')}\nTown: {rec.get('town','') or rec.get('area','')}\n"
    if src:
        ident += f"Where the maintainer says to look: {src.get('where_to_look','')}\n" + rules_block(src.get("instructions", "").strip()) + "\n"
    start = _pages.get(start_url)
    first = ident + (f"\nThe directory's link for it:\n{page_block(start_url, start)}" if start and start["ok"]
                     else f"\nThe directory's link for it ({start_url}) didn't work: {start['status'] if start else 'no link'}.")
    messages = [{"role": "user", "content": first}]
    fetches = 0
    for _ in range(MAX_TURNS):
        resp = ask(client, model=model, max_tokens=8000, system=system, tools=tools, messages=messages)
        usage_add(total, resp)
        messages.append({"role": "assistant", "content": resp.content})
        if resp.stop_reason == "pause_turn":
            continue
        results = []
        for b in resp.content:
            if b.type != "tool_use":
                continue
            if b.name == "submit_service":
                out = b.input
                if out.get("found") and out.get("service") and not isinstance(out.get("service"), dict):
                    log.append("find: the answer had no service details")
                    return None
                if out.get("found") and out.get("service"):
                    src = str(out.get("source_url", "")).strip()
                    if src not in _pages:
                        # the AI left the page out, or named one it only saw in search results: try the pages
                        # the checker actually read in this search, and use the one that backs the most quotes
                        read = [x[6:] for x in log if x.startswith("fetch ")] + [start_url]
                        quotes = [str(v.get("quote", "")) for v in (out["service"].get("fields") or {}).values() if isinstance(v, dict)]
                        best = max(read, key=lambda u: sum(on_page(q, u) for q in quotes), default="")
                        if best and best in _pages and any(on_page(q, best) for q in quotes):
                            log.append(f"find: source given as '{src or 'blank'}'; using {best}, which the checker read")
                            src = best
                        else:
                            log.append(f"find: source '{src or 'blank'}' wasn't read by the checker - rejected")
                            return None
                    if not isinstance(out.get("service"), dict):
                        log.append("find: the answer had no service details")
                        return None
                    return verify(out["service"], src)
                log.append("find: not found. " + str(out.get("notes", ""))[:200])
                return None
            if b.name == "fetch_page":
                url = str(b.input.get("url", "")).strip()
                if fetches >= MAX_FETCHES:
                    txt = "Limit reached. Submit now."
                elif not url.startswith("http"):
                    txt = "Not a web address."
                else:
                    fetches += 1
                    log.append(f"fetch {url}")
                    txt = page_block(url, fetch(url, use_js))
                results.append({"type": "tool_result", "tool_use_id": b.id, "content": txt})
        messages.append({"role": "user", "content": results or "Please finish by calling submit_service."})
    log.append("find: ran out of turns")
    return None

def judge(client, model, pairs, total):
    """pairs: {field: (sheet_value, page_value, quote)} -> {field: (verdict, reason)}"""
    if not pairs:
        return {}
    tool = {"name": "judgements", "description": "Your judgement for each field.",
            "input_schema": {"type": "object", "properties": {f: {"type": "object", "properties": {
                "reason": {"type": "string", "description": "Your reasoning, written first. End with the conclusion it reaches."},
                "verdict": {"type": "string", "enum": ["same", "page_more_specific", "different"],
                            "description": "The conclusion your reasoning reached."}}, "required": ["reason", "verdict"]} for f in pairs},
                "required": list(pairs)}}
    body = "\n\n".join(f"{f}:\n  directory: {a}\n  page: {b}\n  page wording: \"{q}\"" for f, (a, b, q) in pairs.items())
    data, _ = forced_tool_call(client, model, JUDGE_SYSTEM, body, tool, total, max_tokens=2000)
    out = {}
    for f in pairs:
        d = (data or {}).get(f, {})
        if not d:                                  # no answer for this field: unknown, not different
            out[f] = ("page_more_specific", "the checker gave no verdict for this: check it")
            continue
        d = _unjson(d)
        if isinstance(d, dict):
            d = {k: _unjson(v) for k, v in d.items()}
            if isinstance(d.get("reason"), dict):          # the whole answer was put inside "reason"
                d = {**d, **d["reason"]}
            d = {k: (v if isinstance(v, str) else json.dumps(v)) for k, v in d.items() if k in ("reason", "verdict")}
        if isinstance(d, str):        # the model sometimes answers a field with just the word, or just its reasoning
            d = {"verdict": d} if d in ("same", "page_more_specific", "different") else {"reason": d}
        v, why = d.get("verdict") or conclusion(d.get("reason", "")) or "different", d.get("reason", "")
        said = conclusion(why)
        if said and said != v:   # the reasoning concluded one thing and the label says another: don't trust either
            v, why = "different", why + f" [check this: the reasoning concludes '{said}' but was labelled '{v}']"
        out[f] = (v, why)
    return out

def _unjson(v):
    """The model sometimes writes its answer as JSON text inside a field: read it as the object it is."""
    if isinstance(v, str) and v.strip().startswith("{"):
        try:
            return json.loads(v)
        except ValueError:
            m = re.search(r'"reason"\s*:\s*"((?:[^"\\]|\\.)*)', v)           # cut off part-way: keep the reasoning
            return {"reason": m.group(1)} if m else v
    return v

def conclusion(why):
    """What the reasoning's last sentence concludes, when it says so plainly: same / page_more_specific / different."""
    last = re.split(r"(?<=[.!?])\s+", (why or "").strip())[-1].lower() if why else ""
    if re.search(r"\b(verdict|so|therefore|thus)\b.{0,30}\bsame\b|\bthey match\b|\bnot (a )?(conflict|different)\b", last):
        return "same"
    if re.search(r"\b(verdict|so|therefore|thus)\b.{0,30}\bdifferent\b|\breal (change|difference|conflict)\b", last):
        return "different"
    return ""

# ======================================================================= matching + comparing

STOP = set("the a an and of for in at on with group groups session sessions club cafe café community support wellbeing".split())
def words(s):
    return {w for w in re.findall(r"[a-z0-9]+", (s or "").lower()) if w not in STOP and len(w) > 1}

def match_score(rec, s):
    a, b = words(rec.get("name")), words(s.get("name"))
    name = len(a & b) / max(1, len(a | b))
    f = s.get("fields", {})
    score = 2 * name
    if pc(rec.get("postcode")) and pc(rec.get("postcode")) == pc(f.get("postcode", {}).get("value")):
        score += 2
    town = (rec.get("town") or "").lower()
    if town and (town == (s.get("town") or "").lower() or town in words(s.get("name")) | words(f.get("address", {}).get("value"))):
        score += 1
    if day_set(rec.get("days")) & day_set(f.get("days", {}).get("value")):
        score += 0.5
    return score, name

NAME_NOISE = {"alcoholics", "anonymous", "aa", "meeting", "group", "session", "class", "the", "and", "of", "for", "in", "at"}
def best_match(rec, services):
    best, top = None, 0
    rp = words(rec.get("provider")) - {"somerset", "uk", "trust", "nhs", "the", "and", "of"}
    tw = words(rec.get("town")) - {"on", "the", "super", "mare"} or words(rec.get("town"))
    for s in services:
        sc, nm = match_score(rec, s)
        # a service the page places in another town isn't this one (e.g. 'Tai Chi QiGong' in Frome for the Berrow class)
        where = words(s.get("town")) | words(s.get("fields", {}).get("address", {}).get("value")) | words(s.get("name"))
        if tw and (s.get("town") or s.get("fields", {}).get("address", {}).get("value")) and not tw <= where:
            continue
        # on a long listing many entries share the town and provider (e.g. ten AA meetings in Weston-super-Mare): the
        # words that make the name distinctive ('Safe Harbour', 'Came To Believe') have to agree when both have them
        own = words(rec.get("name")) - rp - words(rec.get("town")) - NAME_NOISE
        theirs = words(s.get("name")) - rp - words(rec.get("town")) - NAME_NOISE
        if own and theirs and not own & theirs:
            continue
        # place and day alone aren't enough: on a venue's listing page every session shares them
        # (e.g. a Money Cafe matched to 'Free welfare checks' at the same town hall on Thursdays)
        kin = nm > 0 or bool(rp & (words(s.get("provider")) | words(s.get("name"))))
        if sc > top and (nm >= 0.25 or sc >= 2.5 and kin):
            best, top = s, sc
    return best if top >= 1.2 else None

def same_provider(a, b):
    wa, wb = words(a) - {"somerset", "uk", "trust", "nhs"}, words(b) - {"somerset", "uk", "trust", "nhs"}
    return not wa or not wb or bool(wa & wb)

def owner_elsewhere(field, sheet_value, svc, rec_provider=""):
    """Another service on the same page, run by a DIFFERENT provider, that the page gives this
    phone/email for (e.g. Mindline's number on an Open Mental Health page). A provider's own
    central line shared by its groups is fine."""
    if field not in ("phone", "email") or not sheet_value:
        return ""
    norm = phones if field == "phone" else emails
    mine = norm(sheet_value)
    for other in (_extracted.get(svc.get("source_url"), {}) or {}).get("services", []):
        if other is svc or same_provider(rec_provider, other.get("provider", "")):
            continue
        theirs = norm(other.get("fields", {}).get(field, {}).get("value", ""))
        if mine and mine & theirs:
            return other.get("name", "another service")
    return ""

def compare(rec, svc, client, model, total):
    """Field-by-field: match / differs / refine / not_on_page / add / -"""
    pf = svc.get("fields", {})
    res, fuzzy = {}, {}
    for f in FIELDS:
        sheet = (rec.get(f) or "").strip()
        if f == "who" and (rec.get("eligibility") or "").strip():
            sheet = f"{sheet} (eligibility: {rec['eligibility'].strip()})"   # limits are kept in the eligibility column
        page = pf.get(f, {}).get("value", "")
        quote = pf.get(f, {}).get("quote", "")
        if not sheet and not page:
            continue
        if not page:
            # contacts and postcodes: a match if the sheet's value is printed on the page -
            # unless the page gives that value for a DIFFERENT service (e.g. a helpline's number)
            other = owner_elsewhere(f, sheet, svc, rec.get("provider", ""))
            if other:
                res[f] = ("differs", sheet, "", f"on the page, but given for '{other}', not this service")
            elif f in ("phone", "email", "postcode") and sheet and all(on_page(x, svc["source_url"]) for x in re.split(r"\s*;\s*", sheet)):
                res[f] = ("match", sheet, "", "value appears on the page")
            else:
                res[f] = ("not_on_page", sheet, "", "")
            continue
        if not sheet:
            if f in ("address", "postcode") and "in-person" not in (rec.get("mode") or ""):
                continue          # an office or postal address isn't useful for a phone or online service
            res[f] = ("add", sheet, page, quote)
            continue
        if f == "days":
            ok = day_set(sheet) == day_set(page)
            if not ok and day_set(sheet) and day_set(sheet) < day_set(page):
                # a page listing several sessions (e.g. Tai Chi on Monday and Friday, each its own record): fine if the
                # quote pairs this record's day with this record's start time
                start = time_pair(rec.get("times"))[0]
                if start and any(d in day_set(sheet) and t == start for d, t in day_time_pairs(quote)):
                    res[f] = ("match", sheet, page, quote + "  [the page lists other sessions too; this one's day and time are there]")
                    continue
                res[f] = ("refine", sheet, page, quote + "  [the page lists other days too: another session, or a new day?]")
                continue
        elif f == "times":
            page = fix_am_typo(page)
            (s1, e1), (s2, e2) = time_pair(sheet), time_pair(page)
            ok = s1 == s2 and (not e1 or not e2 or e1 == e2)
            if not ok and s1 and s1 in times_in(page_text(svc["source_url"])) and (not e1 or e1 in times_in(page_text(svc["source_url"]))):
                # the page also lists the sheet's own times (e.g. morning, afternoon and evening sessions): the AI matched
                # this record to another session, so this isn't a change. Treat it as found, but not tied to its entry.
                res[f] = ("match", sheet, "", f"value appears on the page  [the page lists several sessions; this one's times {sheet} are among them]")
                continue
        elif f == "dates":
            ok = future_dates(sheet) <= future_dates(page) or not future_dates(page)
        elif f == "postcode":
            ok = pc(sheet) == pc(page)
        elif f == "phone":
            ok = phones(sheet) <= phones(page) or bool(phones(page)) and phones(page) <= phones(sheet)
            if not ok and all(on_page(x, svc["source_url"]) for x in re.split(r"\s*;\s*", sheet)):
                res[f] = ("match", sheet, "", "value appears on the page")   # the sheet's number is printed there (e.g. the centre's)
                continue
        elif f == "email":
            ok = emails(sheet) <= emails(page)
            if not ok and emails(sheet) and all(on_page(x, svc["source_url"]) for x in emails(sheet)):
                res[f] = ("match", sheet, "", "value appears on the page")
                continue
        elif f == "mode":
            ok = {x.strip() for x in re.split(r"[;,]", sheet) if x.strip()} == {x.strip() for x in re.split(r"[;,]", page) if x.strip()}
            if not ok:
                fuzzy[f] = (sheet, page, quote)
                continue
        elif f == "address" and "postcode" in res and res["postcode"][0] == "match":
            ok = True
        else:
            ok = squash(sheet) == squash(page)
            if not ok:
                fuzzy[f] = (sheet, page, quote)
                continue
        res[f] = ("match" if ok else "differs", sheet, page, quote)
    for f, (v, why) in judge(client, model, fuzzy, total).items():
        sheet, page, quote = fuzzy[f]
        st = {"same": "match", "page_more_specific": "refine"}.get(v, "differs")
        if st == "differs":
            st, why = second_look(f, sheet, page, quote, why, svc["source_url"])
        res[f] = (st, sheet, page, quote + (f"  [{why}]" if why else ""))
    # details the AI didn't pull out, but which the page does give
    quotes = " | ".join(str(v.get("quote", "")) for v in pf.values() if isinstance(v, dict))
    for f, r in list(res.items()):
        if r[0] != "not_on_page":
            continue
        if f == "days" and day_set(r[1]) and day_set(r[1]) <= days_in(quotes):
            res[f] = ("match", r[1], "", f"value appears on the page  [in the page's wording: {quotes[:150]}]")
        elif f == "times" and time_pair(r[1])[0] and time_pair(r[1])[0] in times_in(quotes) \
                and (not time_pair(r[1])[1] or time_pair(r[1])[1] in times_in(quotes)):
            res[f] = ("match", r[1], "", next((q for q in quotes.split(" | ") if time_pair(r[1])[0] in times_in(q)), quotes)[:300])
        elif f == "times" and time_pair(r[1]) == ("00:00", "23:59") and re.search(ALL_WEEK, page_text(svc["source_url"])):
            res[f] = ("match", r[1], "", re.search(ALL_WEEK, page_text(svc["source_url"])).group(0))
        elif f == "address" and street_on_page(r[1], svc["source_url"]):
            res[f] = ("match", r[1], "", street_on_page(r[1], svc["source_url"]))
    # backstop for the rule above: wording that restricts ("only", "must", "invite") is never just extra detail
    for f, r in list(res.items()):
        if r[0] in ("refine", "match") and f in RESTRICT_FIELDS and RESTRICTS.search(r[3].split("  [")[0] + " " + r[2]) \
                and not RESTRICTS.search(r[1]):
            res[f] = ("differs", r[1], r[2], r[3] + "  [flagged by code: the page's wording restricts this service; check it]")
    # the service's own heading can restrict it ("Taunton * Invite only"): that counts as a difference in how to join
    head = (svc.get("name_quote") or "") + " " + (svc.get("name") or "")
    if RESTRICTS.search(head) and not RESTRICTS.search((rec.get("access") or "") + " " + (rec.get("eligibility") or "")):
        word = RESTRICTS.search(head).group(0)
        res["access"] = ("differs", rec.get("access", ""), f"see heading ('{word}')",
                         (svc.get("name_quote") or svc.get("name") or "") + "  [flagged by code: the service's heading restricts it]")
    for f, r in list(res.items()):
        if r[0] == "add" and not worth_adding(f, r[2], r[3]):
            del res[f]
    # postcode helps confirm the address (above) but isn't reported on its own: it only changes when the address does
    if "postcode" not in WATCH:
        res.pop("postcode", None)
    # never suggest a named person's email or a mobile number (directory rule): note it, don't offer it
    for f, r in list(res.items()):
        if r[0] == "add" and ((f == "email" and personal_email(r[2])) or (f == "phone" and re.sub(r"\D", "", r[2]).startswith("07"))):
            res[f] = ("not_suggested", r[1], r[2], r[3] + "  [a named person's email or a mobile: not suggested]")
        elif r[0] == "add" and f == "email" and re.fullmatch(r"[a-z]+", r[2].split("@")[0], re.I) and len(r[2].split("@")[0]) > 3:
            res[f] = ("add", r[1], r[2], r[3] + "  [check this isn't one person's address before adding]")
    return res

RESTRICT_FIELDS = {"who", "access", "mode", "cost", "frequency"}

# ---- a second look, in code, at what the AI judged different (it is often over-strict on these)

LIMIT = re.compile(r"\b\d{1,2}\s*\+|\b(\d{1,2}\s*(-|–|to)\s*\d{1,2}|(aged|over|under)\s+(\d{1,2}|eighteen|sixteen|sixty|fifty|sixty-five)|between (the )?ages|"
                   r"only|must|invite|invitation|members?|referr\w*|live[sd]? in|living in|residents?|registered with)\b", re.I)
ACCESS_CUES = {"drop in": r"drop[ -]?in|just (turn|come|pop) (up|along)|no need to book|come along",
               "book": r"\bbook|reserve", "sign up": r"contact|call|ring|phone|email|register|sign[ -]?up|join|referral form|get in touch",
               "call": r"\b(call|ring|phone|text|chat|helpline|line)\b", "referral": r"referr"}
def second_look(f, sheet, page, quote, why, url=""):
    """(status, why) for a field the AI judged different. Only a real limit or a real conflict stays 'differs'."""
    q = quote.split("  [")[0]
    sheet_l = sheet.lower()
    if f == "who":
        # a limit counts only if the page says it: in the quote, or (the AI's value) printed on the page. The AI's value
        # alone can carry a limit it made up ('adults 18+' from 'All welcome.')
        said = q + " " + " ".join(m.group(0) for m in LIMIT.finditer(page) if on_page(m.group(0), url))
        limits = [m.group(0) for m in LIMIT.finditer(said)]
        new = [x for x in limits if not _limit_known(x, sheet_l)]
        groups = {g for g, rx in WHO_GROUPS.items() if re.search(rx, said, re.I) and not re.search(rx, sheet_l, re.I)}
        if "lgbtq+" in sheet_l:
            groups.discard("lgbtq+")
        if not new and not groups:
            return "match", "[code: the page describes who it's for, but sets no limit the record lacks]"
    if f == "access":
        cue = ACCESS_CUES.get(sheet_l.strip())
        if cue and re.search(cue, q, re.I) and not RESTRICTS.search(q):
            return "match", f"[code: the page's wording fits '{sheet}']"
        own = ACCESS_CUES.get(page.lower().strip())
        if own and not re.search(own, q, re.I):
            return "match", f"[code: the page's wording doesn't say '{page}' (nothing to change)]"
    if f == "mode":
        a = {x.strip() for x in re.split(r"[;,]", sheet_l) if x.strip()}
        b = {x.strip() for x in re.split(r"[;,]", page.lower()) if x.strip()}
        if b and b < a and not RESTRICTS.search(q) and not re.search(r"no longer|stopped|moved (online|to)", q, re.I):
            return "match", "[code: the page mentions only some of the ways in, and doesn't say the others have stopped]"
    return "differs", why

def _limit_known(limit, sheet_l):
    """True if the record already carries this limit (in who or eligibility), or it's what 'adults' means."""
    l = limit.lower()
    nums = re.findall(r"\d+", l)
    if nums and ("adults" in sheet_l and nums in (["18"],) and not re.search(r"under|-|to", l)):
        return True                                      # over 18 / 18+ is what adults means
    words = {"eighteen": "18", "sixteen": "16", "fifty": "50", "sixty": "60", "sixty-five": "65"}
    nums += [words[w] for w in re.findall(r"eighteen|sixteen|sixty-five|sixty|fifty", l)]
    if nums and ("adults" in sheet_l and nums == ["18"] and not re.search(r"\d\s*(-|to)|between", l)):
        return True                                      # over/under 18 with adults: what adults means
    if nums and all(n in sheet_l for n in nums):
        return True
    if re.search(r"live|living|resident", l) and re.search(r"somerset|bath|area|only", sheet_l):
        return True
    return bool(nums) is False and l in sheet_l

WHO_GROUPS = {"women": r"\bwomen|\bfemale|\bladies", "men": r"(?<!wo)\bmen\b|\bmale\b", "carers": r"\bcarers?\b|caring for",
              "young people": r"young (people|person)|youth|\bteen(s|age|ager|agers)?\b|children|\bkids", "older people": r"older|over 50|over 60|over 65|retired",
              "lgbtq+": r"lgbt|trans\b|non-binary|gender", "refugees and asylum seekers": r"refugee|asylum",
              "new families": r"parents?\b|mums?\b|dads?\b|new families|babies|toddlers", "veterans": r"veteran|armed forces"}
FREQ_OK = re.compile(r"fortnightly|monthly \(dates vary\)|see website|(1st|2nd|3rd|4th|last) (mon|tue|wed|thu|fri|sat|sun) of month", re.I)
COST_WORDS = re.compile(r"free|no charge|no cost|£|\bcost|charge|donation|pay|fee|price", re.I)
def worth_adding(f, value, quote):
    """Drop suggestions that don't stand up: a frequency outside the sheet's words (or 'weekly', which is the
    default), and a cost whose quote says nothing about cost."""
    q = quote.split("  [")[0]
    if f == "frequency":
        return bool(FREQ_OK.fullmatch(value.strip()))
    if f == "cost":
        return bool(COST_WORDS.search(q))
    return True

ABBR = [(r"\bstreet\b", "st"), (r"\broad\b", "rd"), (r"\blane\b", "ln"), (r"\bavenue\b", "ave"), (r"\bplace\b", "pl"),
        (r"\bsquare\b", "sq"), (r"\bclose\b", "cl"), (r"\bdrive\b", "dr"), (r"\bterrace\b", "ter")]
def _abbr(s):
    s = re.sub(r"[^a-z0-9 ]", " ", squash(s))
    for a, b in ABBR:
        s = re.sub(a, b, s)
    return re.sub(r"\s+", " ", s).strip()
def street_on_page(address, url):
    """The street part of the sheet's address (the part with a number or a street word), if the page prints it.
    'Yeovil Foyer, Peter Street' -> 'peter st'; '... Hub, 57C High Street' -> '57c high st'."""
    t = page_text(url)
    full = {b: a.strip(r"\b") for a, b in ABBR}           # st -> street, rd -> road ...
    for part in reversed([p for p in re.split(r"\s*,\s*", address or "") if p]):
        a = _abbr(part)
        if (re.search(r"\d", a) or any(re.search(rf"\b{b}$", a) for _, b in ABBR)) and len(a) > 4:
            # each word as written on the page: 'peter st' matches 'Peter St', 'Peter St.' or 'Peter Street'
            rx = r"[\s,]+".join(rf"(?:{full[w]}|{w}\.?)" if w in full else re.escape(w) for w in a.split())
            m = re.search(rf"\b{rx}(?![a-z])", t)
            return m.group(0) if m else ""             # the page's own words, so the scraper can find them again
    return ""
RESTRICTS_RX = re.compile(r"\b(only|must|invite|invitation|referral required|members? only)\b", re.I)
NOT_A_GATE = re.compile(r"\bterm[- ]?time[- ]only\b|\bduring term[- ]?time only\b", re.I)   # when it runs, not who may come
class _Restricts:
    """RESTRICTS.search(text), ignoring wording about when a service runs ('term-time only')."""
    def search(self, text):
        return RESTRICTS_RX.search(NOT_A_GATE.sub(" ", text or ""))
RESTRICTS = _Restricts()
WEBMAIL = re.compile(r"@(gmail|googlemail|hotmail|outlook|live|yahoo|icloud|me|aol|btinternet|sky|talktalk|virginmedia)\.", re.I)
def personal_email(addr):
    """An address that is clearly one person's: a personal webmail account, or first.last@."""
    local = (addr or "").split("@")[0]
    return bool(WEBMAIL.search(addr or "")) or bool(re.fullmatch(r"[a-z]+[._][a-z]+\d*", local, re.I))


def verdict(found, res, svc, record_url_ok):
    if not found:
        return "cannot_verify" if record_url_ok else "wrong_url"
    if svc.get("stale_signs"):
        return "possibly_stale"
    if any(r[0] == "differs" for r in res.values()):
        return "needs_update"
    if not any(r[0] == "match" for r in res.values()):
        return "cannot_verify"
    if any(r[0] == "not_on_page" for r in res.values()) or svc.get("unanchored"):
        return "partly_checked"
    return "confirmed"

# ======================================================================= the sources file

SOURCES, LOCAL_FILES = {}, {}

def load_sources(path):
    for s in csv.DictReader(open(path, encoding="utf-8-sig")):
        if s.get("source_id"):
            SOURCES[s["source_id"].strip()] = s

def source_for(rec):
    """The sources-file entry for a record (its 'source' may hold several labels and urls)."""
    for part in re.split(r"\s*;\s*", rec.get("source", "") or ""):
        if part.strip() in SOURCES:
            return SOURCES[part.strip()]
    return None

def is_manual(src):
    m = (src.get("method") or "").lower()
    return ("supplied" in m or m.strip() == "maintainer" or "image" in m or "copied" in m) and "web page" not in m

CONFIRM_WORDS = [("day", ["days"]), ("time", ["times"]), ("hour", ["times", "days"]), ("frequen", ["frequency"]),
                 ("date", ["dates"]), ("venue", ["address", "postcode"]), ("address", ["address", "postcode"]),
                 ("location", ["address", "postcode"]), ("phone", ["phone"]), ("email", ["email"]),
                 ("contact", ["phone", "email"]), ("cost", ["cost"]), ("free", ["cost"]), ("who", ["who"]),
                 ("everyone", ["who"]), ("mode", ["mode"]), ("access", ["access"]), ("referral", ["access"]),
                 ("registration", ["access"]), ("booking", ["access"])]

def scope(src):
    """Fields this source is trusted to confirm (all fields if the file doesn't say)."""
    c = (src or {}).get("confirms", "").lower()
    out = {f for w, fs in CONFIRM_WORDS if w in c for f in fs}
    return out or set(FIELDS)

def recheck_days(s):
    s = (s or "").lower()
    m = re.search(r"(\d+)\s*(month|week|day)", s)
    if m:
        return int(m.group(1)) * {"month": 30, "week": 7, "day": 1}[m.group(2)]
    if "term" in s or "quarter" in s or "season" in s:
        return 90
    if "october" in s or "winter" in s or "year" in s:
        return 365
    return 90

def parse_date(s):
    s = (s or "").strip()
    for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None

def due(rec, src):
    last = parse_date(rec.get("last_checked"))
    if not last:
        return "yes (no valid last_checked)"
    nxt = last + datetime.timedelta(days=recheck_days((src or {}).get("recheck_every")))
    return "yes" if nxt <= TODAY else f"no (next {nxt.isoformat()})"

def first_url(s):
    m = re.search(r"https?://[^\s,;)\"']+", s or "")
    return m.group(0).rstrip(".") if m else ""

def is_crisis_safe_space(rec, src):
    """Crisis Safe Spaces, and other evening crisis spaces such as Youth SAFE Space: never suggest an address (directory rule)."""
    return bool(re.search(r"safe ?space", (rec.get("name", "") + " " + rec.get("type", "")).lower())) or \
           "crisis-safe-space" in ((src or {}).get("source_id", ""))

# ======================================================================= main

def load_csv(src):
    if src.startswith("http"):
        r = requests.get(src, headers={"User-Agent": UA}, timeout=60)
        r.raise_for_status()
        data = r.content.decode("utf-8-sig")
    else:
        data = open(src, encoding="utf-8-sig").read()
    return list(csv.DictReader(io.StringIO(data)))

def on_site(rec, site):
    """Does the record point to a page on this site: its url, the links in its source column, or its rule's pages?"""
    src = source_for(rec)
    urls = [rec.get("url", "")] + re.findall(r"https?://[^\s;,)]+", rec.get("source", "") + " " + ((src or {}).get("where_to_look") or ""))
    return any(site in urlparse(u).netloc.lower() for u in urls if u)

def rid(rec):
    """The record's ID (the sheet's record_id column, e.g. R0105), or its row number on an older sheet without one."""
    return (rec.get("record_id") or "").strip() or f"row {rec['_row']}"

def parse_ids(text):
    """'R0001,R0005-R0009' -> {'R0001', 'R0005', ..., 'R0009'}"""
    out = set()
    for part in (x.strip().upper() for x in (text or "").split(",") if x.strip()):
        m = re.fullmatch(r"R(\d+)\s*-\s*R?(\d+)", part)
        if m:
            width = len(m[1])
            out.update(f"R{n:0{width}d}" for n in range(int(m[1]), int(m[2]) + 1))
        else:
            out.add(part)
    return out

def pick(recs, a):
    if a.ids:
        want = parse_ids(a.ids)
        found = [r for r in recs if (r.get("record_id") or "").strip().upper() in want]
        missing = want - {(r.get("record_id") or "").strip().upper() for r in found}
        if missing:
            print(f"not in the sheet: {', '.join(sorted(missing))}", file=sys.stderr)
        return found
    if a.provider:
        recs = [r for r in recs if (r.get("provider") or "").strip().lower() == a.provider.strip().lower()]
        print(f"{len(recs)} records from {a.provider}", file=sys.stderr)
        if not a.rows and not a.sample and not a.site and not a.ids:
            return recs
    if a.site:
        recs = [r for r in recs if on_site(r, a.site.lower())]
        print(f"{len(recs)} records on {a.site}", file=sys.stderr)
        if not a.rows and not a.sample:
            return recs
    if a.rows:
        want = {int(x) for x in a.rows.split(",") if x.strip()}
        return [r for r in recs if r["_row"] in want]
    if a.sample:
        random.seed(a.seed)
        pool = [r for r in recs if r.get("url", "").startswith("http")]
        one = {}
        for r in random.sample(pool, len(pool)):
            one.setdefault(r["url"].strip(), r)
        return sorted(random.sample(list(one.values()), min(a.sample, len(one))), key=lambda r: r["_row"])
    return recs

def local_page(src):
    """A file the maintainer supplied for a source (--files DIR/<source_id>.pdf|.txt|.html|.csv)."""
    path = LOCAL_FILES.get(src["source_id"]) if src else None
    if not path:
        return None, None
    key = "file:" + path
    if key not in _pages:
        if path.lower().endswith(".pdf"):
            from pypdf import PdfReader
            text = " ".join(" ".join((pg.extract_text() or "").split()) for pg in PdfReader(path).pages)
            links = []
        elif path.lower().endswith((".html", ".htm")):
            text, links = parse_html(open(path, encoding="utf-8", errors="replace").read(), "file://" + path)
        else:
            text, links = " ".join(open(path, encoding="utf-8", errors="replace").read().split()), []
        _pages[key] = {"status": "ok (supplied file)", "final_url": key, "text": text, "links": links, "ok": bool(text.strip())}
    return key, _pages[key]

def check_one(client, a, rec, total):
    url, log = (rec.get("url") or "").strip(), []
    src = source_for(rec)
    rules = (src or {}).get("instructions", "").strip()
    extra = {}
    if src:
        extra = {"source_id": src["source_id"], "source_method": src.get("method", ""), "due": due(rec, src)}
    # sources the file says can't be read automatically (supplied PDFs, images, first-hand)
    if src and is_manual(src):
        key, page = local_page(src)
        if not page:
            return dict(extra, verdict="cannot_verify", found_via="not checked",
                        fetch=f"source is '{src.get('method')}'",
                        notes=(src.get("if_unavailable") or "Needs the maintainer's copy of the source.") +
                              f" (Put it in the --files folder as {src['source_id']}.pdf/.txt to check it.)"), {}, None
        url = key
    elif data_url(src):
        # a published spreadsheet (e.g. Age UK's exercise timetable): download it and read its rows. A big sheet is too
        # long to read whole, so give the AI only the rows for this record's town (it then matches the class by name)
        needs_js = False
        url = data_url(src)
        page = fetch(url)
        town = (rec.get("town") or "").strip()
        if page["ok"] and town:
            rows = [l for l in page["text"].split("\n") if town.lower() in l.lower()]
            if rows:
                key = f"{url}#{town}"
                _pages[key] = dict(page, text="\n".join(rows), final_url=url)
                url, page = key, _pages[key]
    else:
        # sources the file says need a real browser (content loaded by script) get one, if Playwright is installed
        needs_js = "force" if re.search(r"browser|script", (src or {}).get("method", ""), re.I) else a.js
        page = fetch(url, needs_js) if url.startswith("http") else {"status": "no url", "ok": False}
        alt = first_url((src or {}).get("where_to_look"))
        if not page["ok"] and alt and alt != url:
            log.append(f"record's link failed; trying the sources file's 'where to look': {alt}")
            url, page = alt, fetch(alt, needs_js)
    svc, how = None, ""
    if page["ok"]:
        ex = extract_page(client, a.model, url, page, total, rules)
        svc = best_match(rec, ex["services"])
        how = f"record's page ({ex['page_kind']}{', truncated' if ex.get('truncated') else ''})"
        thin = svc and not ({"days", "times", "dates"} & set(svc["fields"])) and (rec.get("days") or rec.get("times"))
        if svc and not thin:
            pass
        else:
            if thin:
                log.append("matched on the record's page, but no days/times there; looking further")
            found = find_service(client, a.model, rec, url, not a.no_search, needs_js, total, log, src)
            if found and (not svc or len(found["fields"]) >= len(svc["fields"])):
                svc, how = found, "found by following links/search"
    else:
        found = find_service(client, a.model, rec, url, not a.no_search, needs_js, total, log, src)
        if found:
            svc, how = found, "record's link failed; found by search"
    if svc and svc.get("unverified"):
        log.append("AI values discarded by code checks: " + "; ".join(svc["unverified"]))
    if svc and svc.get("unanchored"):
        log.append("listing page: couldn't tie the details to this service's own entry, so not marked confirmed")
    res = compare(rec, svc, client, a.model, total) if svc else {}
    # the sources file says which fields this source is trusted for: other differences are noted, not counted
    sc = scope(src)
    for f, r in list(res.items()):
        if f == "who" and r[0] == "differs":
            continue      # who a service is for is checked once, now: a page that limits it always counts, whatever the source's scope
        if f not in sc and r[0] in ("differs", "add", "refine", "not_on_page"):
            res[f] = ("outside_source", r[1], r[2], r[3])
    # safeguarding: never suggest an address for a Crisis Safe Space
    if is_crisis_safe_space(rec, src):
        for f in ("address", "postcode"):
            res.pop(f, None)
        if svc:
            for f in ("address", "postcode"):
                svc["fields"].pop(f, None)
    v = verdict(bool(svc), res, svc or {}, page["ok"])
    if not svc and src and src.get("if_unavailable"):
        log.append("sources file says: " + src["if_unavailable"])
    better = svc["source_url"] if svc and svc["source_url"] not in (url, page.get("final_url")) else ""
    changes = [f"{f}: {r[2] or r[3]}" for f, r in res.items() if r[0] == "differs"]
    if better and not page["ok"]:
        changes.append(f"url: {better}")
    return dict(extra, **{
        "outside_source": "; ".join(f"{f}: {r[2] or 'not on page'}" for f, r in res.items() if r[0] == "outside_source"),
        "verdict": v,
        "changes": "; ".join(changes),
        "could_add": "; ".join(f"{f}: {r[2]}" for f, r in res.items() if r[0] in ("add", "refine")),
        "matched": ", ".join(f for f, r in res.items() if r[0] == "match"),
        "not_on_page": ", ".join(f for f, r in res.items() if r[0] == "not_on_page"),
        "stale_signs": (svc or {}).get("stale_signs", ""),
        "better_url": better,
        "found_via": how if svc else "not found",
        "fetch": page["status"],
        "pages_read": "; ".join(x[6:] for x in log if x.startswith("fetch ")),
        "notes": "; ".join(x for x in log if not x.startswith("fetch ")),
    }), res, svc

# ======================================================================= the review: what each result means, in words

LABEL = {"days": "Days", "times": "Times", "dates": "Dates", "postcode": "Postcode", "phone": "Phone", "email": "Email",
         "address": "Address", "cost": "Cost", "access": "How to join", "who": "Who it's for", "frequency": "How often", "mode": "How it runs"}

def _q(quote):
    q, _, why = (quote or "").partition("  [")
    return q.strip(), why.rstrip("]").strip()

def _short(why, n=2):
    """The first sentences of the checker's reasoning: enough to see why, without the whole working."""
    parts = re.split(r"(?<=[.!?])\s+", why.strip())
    return " ".join(parts[:n]) + (" ..." if len(parts) > n else "")

def issue_lines(res):
    """One line per field that needs attention: the sheet, the page's own words, and why it was flagged."""
    out = []
    for f, (st, sheet, page, quote) in res.items():
        q, why = _q(quote)
        said = f' Page: "{q.rstrip(".")}".' if q and not q.startswith(("[", "value appears")) else ""
        note = f" Why: {_short(why)}" if why else ""
        name = LABEL.get(f, f)
        if st == "differs":
            out.append(f"- **{name}: doesn't match.** Sheet: \"{sheet or 'blank'}\". Should probably be: \"{page}\".{said}{note}")
        elif st == "not_on_page" and f in WATCH:
            out.append(f"- **{name}: not on the page.** The sheet's \"{sheet}\" couldn't be confirmed: it may be on another page, or out of date.")
        elif st == "add":
            out.append(f"- **{name}: could be added:** \"{page}\".{said}{note}")
        elif st == "refine" and f in ("who", "access", "cost"):
            out.append(f"- {name}: the page is more specific: \"{page}\".{said}")
        elif st == "not_suggested":
            out.append(f"- {name}: the page gives a named person's email or a mobile ({page}); left out, as the directory's rules say.")
    return out

def review_md(reviews, a):
    groups = {"act": [], "look": [], "cant": [], "ok": []}
    for base, res, svc in reviews:
        v = base["verdict"]
        key = "act" if v in ("needs_update", "wrong_url", "possibly_stale") else "cant" if v in ("cannot_verify", "error") \
            else "look" if v == "partly_checked" or any(r[0] in ("add",) for r in res.values()) else "ok"
        groups[key].append((base, res, svc))
    summary = (f"Checked {TODAY:%d %B %Y}, {len(reviews)} records. {len(groups['act'])} need action, {len(groups['look'])} are worth a look, "
               f"{len(groups['cant'])} couldn't be checked, {len(groups['ok'])} match their page.")
    md = [f"# Check results: {a.provider or a.site or a.ids or a.rows or 'records'}", "", summary, "",
          "Nothing here has been changed in the sheet. Each point quotes the provider's page; check it before changing anything.", ""]

    def head(base):
        return f"### {base['record_id']}: {base['name']}"

    def where(base, svc):
        u = (svc or {}).get("source_url") or base.get("url", "")
        return f"Checked against: {u}" if u else ""

    if groups["act"]:
        md += ["## Need action", ""]
        for base, res, svc in groups["act"]:
            md += [head(base), ""]
            if base["verdict"] == "wrong_url":
                fetch = base.get("fetch", "")
                if fetch.startswith("ok"):          # the page loads; the service just isn't on it (or the page can't be read, e.g. Facebook)
                    md += ["- **The service isn't on its linked page**, and couldn't be found elsewhere on the provider's site. "
                           "It may have ended or moved, or the page may not be readable automatically (e.g. Facebook): check it by hand."]
                else:
                    md += [(f"- **The link doesn't work** ({fetch}), and the service couldn't be found elsewhere on the provider's site."
                            " It may have ended, or moved. Ring or email the provider before removing it.")]
            elif base["verdict"] == "possibly_stale":
                md += [f"- **The page may be out of date:** {base.get('stale_signs', '')}"]
            md += issue_lines(res)
            if base.get("better_url"):
                md += [f"- **Better link found:** {base['better_url']}"]
            md += ["", where(base, svc), ""]
    if groups["look"]:
        md += ["## Worth a look", ""]
        for base, res, svc in groups["look"]:
            md += [head(base), ""] + (issue_lines(res) or ["- Partly confirmed: " + (base.get("matched") or "nothing") + " matched; " +
                                                             (base.get("not_on_page") or "nothing else") + " not on the page."])
            if base.get("better_url"):
                md += [f"- **Better link found:** {base['better_url']}"]
            md += ["", where(base, svc), ""]
    if groups["cant"]:
        md += ["## Couldn't be checked", ""]
        for base, _, _ in groups["cant"]:
            why = base.get("notes") or base.get("fetch") or ""
            md += [f"- {base['record_id']}, {base['name']}: {why[:300]}"]
        md += [""]
    if groups["ok"]:
        md += ["## Match their page", ""] + [f"- {b['record_id']}, {b['name']}: {b.get('matched', '')} confirmed" for b, _, _ in groups["ok"]] + [""]
    return "\n".join(md) + "\n"

# ======================================================================= recipes for the scraper (src/monitor.py)

# fields that change, and so get scraper recipes: watch_fields in src/watch.json (who/access are checked once;
# postcode isn't watched, as it only changes with the address)
try:
    WATCH = json.loads((Path(__file__).resolve().parent / "watch.json").read_text(encoding="utf-8"))["watch_fields"]
except (OSError, KeyError, ValueError):
    WATCH = ["days", "times", "dates", "phone", "email", "address", "mode", "cost"]
RECIPE_COLS = ["record_id", "name", "town", "field", "sheet_value", "result", "source_url", "quote", "checked_on"]

def recipe_rows(rec, res, svc):
    """For each watched field the page states: the page and the exact words to look for next time.
    A field that only matched because its value is printed somewhere on the page gets the value itself as its quote."""
    out = []
    if not svc or not svc.get("source_url", "").startswith("http"):
        return out
    for f in WATCH:
        r = res.get(f)
        if not r or r[0] in ("not_on_page", "outside_source", "not_suggested"):
            continue
        quote = r[3].split("  [")[0].strip()
        if not quote or quote.startswith("[") or quote.startswith("on the page, but"):
            continue
        if quote == "value appears on the page":
            quote = r[1].split(";")[0].strip()
        out.append({"record_id": rid(rec), "name": rec.get("name", ""), "town": rec.get("town", ""), "field": f, "sheet_value": r[1], "result": r[0],
                    "source_url": svc["source_url"], "quote": quote, "checked_on": TODAY.isoformat()})
    return out

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--csv", required=True)
    ap.add_argument("--out", default="checks.csv")
    ap.add_argument("--sample", type=int)
    ap.add_argument("--seed", type=int, default=20261107)
    ap.add_argument("--ids", help="records by ID, e.g. R0016,R0018 or a range R0020-R0030")
    ap.add_argument("--rows", help="(older) records by sheet row number; --ids is safer, as row numbers change")
    ap.add_argument("--provider", help="only one organisation's records, by the sheet's provider column, e.g. \"Age UK Somerset\"")
    ap.add_argument("--site", help="only the records whose url, source links or rule point to this site, e.g. mindinsomerset.org.uk")
    ap.add_argument("--model", default="claude-haiku-5-5")
    ap.add_argument("--no-search", action="store_true")
    ap.add_argument("--js", action="store_true")
    ap.add_argument("--sources", help="the sources file (default: sources-merged.csv or sources.csv next to --csv)")
    ap.add_argument("--files", help="folder of maintainer-supplied copies, named <source_id>.pdf/.txt/.html/.csv")
    ap.add_argument("--due-only", action="store_true", help="only check records due a recheck (per the sources file)")
    a = ap.parse_args()

    import os, glob
    sp = a.sources
    if not sp and not a.csv.startswith("http"):
        here = os.path.dirname(os.path.abspath(a.csv))
        sp = next((p for p in (os.path.join(here, "sources-merged.csv"), os.path.join(here, "sources.csv")) if os.path.exists(p)), None)
    if sp:
        load_sources(sp)
        print(f"sources file: {sp} ({len(SOURCES)} sources)", file=sys.stderr)
    else:
        print("no sources file found: checking without per-source rules (use --sources)", file=sys.stderr)
    if a.files:
        for p in glob.glob(os.path.join(a.files, "*")):
            LOCAL_FILES.setdefault(os.path.splitext(os.path.basename(p))[0], p)

    import anthropic
    client = anthropic.Anthropic(max_retries=5)
    recs = load_csv(a.csv)
    for i, r in enumerate(recs):
        r["_row"] = i + 2
    todo = pick(recs, a)
    if a.due_only:
        todo = [r for r in todo if due(r, source_for(r)).startswith("yes")]
        print(f"{len(todo)} records due a recheck", file=sys.stderr)
    stem = re.sub(r"\.csv$", "", a.out)
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    jl = open(stem + ".jsonl", "w", encoding="utf-8")
    rows, frows, recipes, reviews, tally, total = [], [], [], [], defaultdict(int), defaultdict(int)

    for n, rec in enumerate(todo, 1):
        print(f"[{n}/{len(todo)}] {rid(rec)}: {rec.get('name','')}", file=sys.stderr)
        base = {"record_id": rid(rec), "name": rec.get("name", ""), "provider": rec.get("provider", ""),
                "url": rec.get("url", ""), "source": rec.get("source", ""),
                "last_checked": rec.get("last_checked", ""), "checked_on": TODAY.isoformat()}
        try:
            out, res, svc = check_one(client, a, rec, total)
        except Exception as e:
            import traceback
            where = traceback.extract_tb(e.__traceback__)[-1]
            out, res, svc = {"verdict": "error", "notes": f"{type(e).__name__}: {e} (check_sources.py line {where.lineno}, in {where.name})"}, {}, None
        if out["verdict"] == "cannot_verify" and rec.get("source", "").strip().lower() in OFFLINE_SOURCES:
            out["notes"] = (out.get("notes", "") + f" Record came from an offline source ({rec['source']}).").strip()
        base.update(out)
        rows.append(base)
        tally[base["verdict"]] += 1
        for f, (st, sheet, page, quote) in res.items():
            frows.append({"record_id": rid(rec), "name": rec.get("name", ""), "field": f, "result": st,
                          "sheet_value": sheet, "page_value": page, "page_wording": quote,
                          "source_url": (svc or {}).get("source_url", "")})
        recipes += recipe_rows(rec, res, svc)
        reviews.append((base, res, svc))
        jl.write(json.dumps({"record_id": rid(rec), "result": base, "fields": res, "extracted": svc}, ensure_ascii=False) + "\n")
        jl.flush()

    cols = ["record_id", "name", "provider", "verdict", "changes", "could_add", "matched", "not_on_page", "outside_source",
            "stale_signs", "better_url", "found_via", "fetch", "pages_read", "notes", "url", "source", "source_id",
            "source_method", "due", "last_checked", "checked_on"]
    with open(a.out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore"); w.writeheader(); w.writerows(rows)
    with open(stem + "-fields.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["record_id", "name", "field", "result", "sheet_value", "page_value", "page_wording", "source_url"])
        w.writeheader(); w.writerows(frows)

    Path(stem + "-review.md").write_text(review_md(reviews, a), encoding="utf-8")
    with open(stem + "-recipes.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=RECIPE_COLS); w.writeheader(); w.writerows(recipes)

    # services on checked pages that don't match anything in the sheet
    new = []
    for url, ex in _extracted.items():
        for s in ex["services"]:
            if s["fields"] and not any(best_match(r, [s]) for r in recs if (r.get("provider") or "")[:6].lower() in
                                       (s.get("provider") or r.get("provider") or "").lower() or r.get("url", "").strip() == url):
                row = {"name": s.get("name", ""), "provider": s.get("provider", ""), "town": s.get("town", ""), "source_url": url}
                row.update({f: s["fields"].get(f, {}).get("value", "") for f in FIELDS})
                if re.search(r"safe ?space", (s.get("name") or "").lower()):
                    row["address"] = row["postcode"] = ""        # safeguarding: never record these
                new.append(row)
    with open(stem + "-new.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["name", "provider", "town", "source_url"] + FIELDS); w.writeheader(); w.writerows(new)

    print(f"\nRead first: {stem}-review.md", file=sys.stderr)
    print(f"{len(rows)} records -> {a.out}, {stem}-fields.csv, {stem}-recipes.csv ({len(recipes)} quotes to watch), "
          f"{stem}-new.csv ({len(new)} possible new services)", file=sys.stderr)
    print(f"  Next: python src/monitor.py {stem}-recipes.csv   (checks the scraper finds every quote)", file=sys.stderr)
    for k in ("confirmed", "partly_checked", "needs_update", "possibly_stale", "wrong_url", "cannot_verify", "error"):
        if tally[k]:
            print(f"  {k:15} {tally[k]}", file=sys.stderr)
    print(f"  tokens in {total['input_tokens']:,} (+{total['cache_read_input_tokens']:,} cached), "
          f"out {total['output_tokens']:,}; web searches {total['web_searches']}", file=sys.stderr)

if __name__ == "__main__":
    main()
