"""Change detector: has any page on one website changed since the last run?

    python src/detect.py mindinsomerset.org.uk
    python src/detect.py mindinsomerset.org.uk --csv services.csv    # a saved copy of the sheet

Run it from the repo folder. It gathers every page on that site that a record points to (its url, the links in its
source column, or its rule's pages in src/sources.csv), fetches each one, and turns it into a tidy version of its
main content:
  - drops scripts, styles, navigation, header, footer, sidebars and cookie banners (drop_selectors in src/watch.json),
    plus anything listed for that site in site_drop_selectors (such as panels that appear on every page)
  - keeps <main> or <article> when the page has one (main_selectors), otherwise the body
  - one line per heading, paragraph, list item or table row; spaces and Unicode tidied; capitals, numbers,
    punctuation and order kept, so a change from Wednesday to Thursday, or £2 to £5, still shows
Then it fingerprints that (a SHA-256 hash) and compares it with the last run. It also keeps the old-style fingerprint
of the whole visible page, so you can see how much the tidying cuts false alarms.

Writes to results/watch/detect/<site>/:
  report.md   - read this first: what changed since the last run, and which records use each changed page
  state.json  - each page's fingerprints, when it was first seen, and when it last changed
  text/       - the tidied text of every page, one file each. Compare two runs' copies to see exactly what changed
                (or, if you commit them, GitHub Desktop shows the differences line by line)
  text-previous/ - the same, from the run before
Changes nothing in the sheet, the sources file or the site. Needs BeautifulSoup: pip install beautifulsoup4
"""
import argparse, csv, datetime, difflib, hashlib, json, re, shutil, sys, time, unicodedata, urllib.error, urllib.request
from pathlib import Path
from urllib.parse import urlparse

from bs4 import BeautifulSoup

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / "build" / "shared"))
from calendar_feed import ics_text   # a provider's public calendar feed (.ics)
from records import read_records   # reads the published sheet, or a saved copy

SETTINGS = json.loads((HERE / "watch.json").read_text(encoding="utf-8"))   # shared with check_sources.py and monitor.py
URL_RE = re.compile(r"https?://[^\s;,)\"']+")

def host(url):
    return urlparse(url).netloc.lower().removeprefix("www.")

def links(text):
    return [u.rstrip(".") for u in URL_RE.findall(text or "")]

def load_rules():
    """source_id -> the pages its rule names (src/sources.csv)."""
    with open(ROOT / SETTINGS["sources_file"], encoding="utf-8-sig") as fh:
        return {x["source_id"].strip(): links(x.get("where_to_look")) for x in csv.DictReader(fh) if (x.get("source_id") or "").strip()}

# words in a sources.csv 'confirms' column -> the record fields they cover. Same as check_sources.CONFIRM_WORDS
CONFIRM_WORDS = [("day", ["days"]), ("time", ["times"]), ("hour", ["times", "days"]), ("frequen", ["frequency"]),
                 ("date", ["dates"]), ("venue", ["address", "postcode"]), ("address", ["address", "postcode"]),
                 ("location", ["address", "postcode"]), ("phone", ["phone"]), ("email", ["email"]),
                 ("contact", ["phone", "email"]), ("cost", ["cost"]), ("free", ["cost"]), ("who", ["who"]),
                 ("everyone", ["who"]), ("mode", ["mode"]), ("access", ["access"]), ("referral", ["access"]),
                 ("registration", ["access"]), ("booking", ["access"])]

def source_scopes():
    """source_id -> the fields that source is trusted to confirm (src/sources.csv 'confirms'); a source that doesn't
    say covers every field, so it isn't listed."""
    with open(ROOT / SETTINGS["sources_file"], encoding="utf-8-sig") as fh:
        rows = list(csv.DictReader(fh))
    out = {}
    for x in rows:
        c = (x.get("confirms") or "").lower()
        fields = {f for w, fs in CONFIRM_WORDS if w in c for f in fs}
        if fields and (x.get("source_id") or "").strip():
            out[x["source_id"].strip()] = fields
    return out

def cf_decode(h):
    """An email address hidden by Cloudflare's email protection (data-cfemail), as check_sources.py decodes it."""
    try:
        k = int(h[:2], 16)
        return "".join(chr(int(h[i:i + 2], 16) ^ k) for i in range(2, len(h), 2))
    except Exception:
        return ""

def contact_links(soup):
    """Email addresses and phone numbers the page gives only as links (mailto:, tel:) or hides from scrapers
    (Cloudflare shows '[email protected]'). check_sources.py reads these too, so its quotes can be one of them."""
    out = [cf_decode(e["data-cfemail"]) for e in soup.select("[data-cfemail]")]
    for a in soup.find_all("a", href=True):
        h = a["href"].strip()
        if h.lower().startswith(("mailto:", "tel:")):
            out.append(h.split(":", 1)[1].split("?")[0])
    return [x for x in out if x]

def uncloak(soup):
    """Cloudflare-hidden email addresses back in the text where the page shows them, as a visitor's browser does:
    the checker reads pages with the address in place, so its quotes carry it (batch19 R1438 'Participant Enquiries: ...')."""
    for e in soup.select("[data-cfemail]"):
        e.replace_with(cf_decode(e["data-cfemail"]))
    return soup

def whole_page(html_text):
    """Everything visible on the page, flattened, plus the contact links it gives (see contact_links): where the monitor
    looks for a quote that isn't in the main content ('found, footer')."""
    soup = BeautifulSoup(html_text, "html.parser")
    for sel in SETTINGS.get("hidden_selectors", []):   # old content kept in the page but never shown to visitors
        for e in soup.select(sel):
            e.decompose()
    extra = contact_links(soup)
    uncloak(soup)
    for t in soup(["script", "style", "noscript", "template", "svg", "head"]):
        t.decompose()
    return re.sub(r"\s+", " ", soup.get_text(" ") + " " + " ".join(extra)).strip().lower()

BLOCKS = ["p", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "dt", "dd", "blockquote", "pre", "figcaption", "address",
          "div", "section", "article", "table", "ul", "ol", "dl"]

def drops_for(url):
    """Parts of the page to ignore: the general list, plus any for this site (site_drop_selectors in watch.json)."""
    h = host(url) if url else ""
    extra = [sel for site, sels in SETTINGS.get("site_drop_selectors", {}).items() if site in h for sel in sels]
    return SETTINGS["drop_selectors"] + SETTINGS.get("hidden_selectors", []) + extra

def tidy(html_text, url=""):
    """The page's main content as lines of text, with presentation removed and information kept."""
    soup = uncloak(BeautifulSoup(html_text, "html.parser"))
    for t in soup.select(", ".join(drops_for(url))):
        t.decompose()
    main = None
    for sel in SETTINGS["main_selectors"]:
        main = soup.select_one(sel)
        if main: break
    main = main or soup.body or soup
    for br in main.find_all("br"):
        br.replace_with("\n")
    for t in main.find_all(BLOCKS):
        t.insert_before("\n"); t.insert_after("\n")
    lines = []
    for line in main.get_text().split("\n"):
        line = re.sub(r"\s+", " ", unicodedata.normalize("NFKC", line)).strip()
        if line: lines.append(line)
    return "\n".join(lines) + "\n"

def fp(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]

def is_csv(url, content_type=""):
    """A spreadsheet export: a .csv link, a published Google Sheet's output=csv link, or a CSV content type."""
    u = url.lower()
    return "text/csv" in content_type.lower() or u.split("?")[0].endswith(".csv") or "output=csv" in u

def csv_text(raw):
    """A CSV as readable lines, one per row: 'Class: Tai Chi · Venue: Village Hall · Day: Monday' (as check_sources.py reads it)."""
    import io
    rows = list(csv.reader(io.StringIO(raw)))
    head = next((r for r in rows if sum(bool(c.strip()) for c in r) >= 2), None)
    if not head:
        return " ".join(raw.split())
    lines = []
    for r in rows[rows.index(head) + 1:]:
        # a cell can run over several lines (an address with its postcode below): keep each row on one line
        cells = [(f"{h.strip()}: {c.strip()}" if h.strip() else c.strip()).replace("\n", " ") for h, c in zip(head, r) if c.strip()]
        if cells:
            lines.append(" · ".join(cells))
    return "\n".join(lines)

def fetch_csv(url):
    """(status, text or None, note): a published spreadsheet, as csv_text lines."""
    import requests
    try:
        r = requests.get(url, headers={"User-Agent": SETTINGS["user_agent"]}, timeout=SETTINGS["timeout_s"])
    except Exception as e:
        return None, None, f"unreachable ({type(e).__name__})"
    if r.status_code >= 400:
        return r.status_code, None, f"unreachable ({r.status_code})"
    if "html" in r.headers.get("Content-Type", "").lower():        # e.g. the sheet was unpublished: a sign-in page comes back
        return r.status_code, None, "not a spreadsheet any more (unpublished or moved?)"
    return r.status_code, csv_text(r.content.decode("utf-8-sig", errors="replace")), "(spreadsheet)"

def fetch_ics(url):
    """(status, text or None, note): a provider's public calendar feed, as calendar_feed.ics_text lines."""
    import requests
    try:
        r = requests.get(url, headers={"User-Agent": SETTINGS["user_agent"]}, timeout=SETTINGS["timeout_s"])
    except Exception as e:
        return None, None, f"unreachable ({type(e).__name__})"
    if r.status_code >= 400:
        return r.status_code, None, f"unreachable ({r.status_code}): the calendar may no longer be public"
    if "BEGIN:VCALENDAR" not in r.text[:2000]:
        return r.status_code, None, "not a calendar any more (made private or moved?)"
    return r.status_code, ics_text(r.text, days_ahead=int(SETTINGS.get("ics_days_ahead") or 90)), "(calendar)"

def is_pdf(url):
    return (url or "").lower().split("?")[0].endswith(".pdf")

IMAGE_EXT = (".jpg", ".jpeg", ".png", ".webp", ".gif")
def is_image(url):
    """A picture of a timetable (e.g. Chard Community Hub's monthly What's On)."""
    return (url or "").lower().split("?")[0].endswith(IMAGE_EXT)

def image_key(url):
    """What identifies a timetable image on the page that shows it: its folder when that's a long unique id (as on
    Squarespace), otherwise its file name. A new timetable is a new image, so this disappears from the page."""
    from urllib.parse import unquote
    parts = [x for x in unquote(urlparse(url).path).split("/") if x]
    if "media" in parts[:-1]:                      # Wix: /media/<file id>/v1/fill/w_846,.../name.png (the size part varies)
        return parts[parts.index("media") + 1]
    if len(parts) >= 2 and len(parts[-2]) >= 16:
        return parts[-2]
    return parts[-1] if parts else url

def image_page(url):
    """The web page that shows a timetable image: the other link in the 'where to look' of the source that names
    the image (src/sources.csv), or '' if none does."""
    try:
        with open(ROOT / SETTINGS["sources_file"], encoding="utf-8-sig") as fh:
            for x in csv.DictReader(fh):
                ls = links(x.get("where_to_look"))
                # by the image's own id, not the whole link: a link with commas in it (Wix) is cut short in the text
                pics = [u for u in ls if image_key(u) == image_key(url)]
                if pics:
                    return next((u for u in ls if u not in pics and not is_image(u)), "")
    except OSError:
        pass
    return ""

def image_on_page(url, html_text):
    """Is this timetable image still the one the page shows?"""
    from urllib.parse import unquote
    k = image_key(url)
    return bool(html_text) and (k in html_text or k in unquote(html_text) or k.replace(" ", "+") in unquote(html_text))

def fetch_pdf(url):
    """(status, text or None, note): a PDF listing, as text read the same way check_sources.py reads it."""
    import io, requests
    try:
        r = requests.get(url, headers={"User-Agent": SETTINGS["user_agent"]}, timeout=SETTINGS["timeout_s"])
    except Exception as e:
        return None, None, f"unreachable ({type(e).__name__})"
    if r.status_code >= 400:
        return r.status_code, None, f"unreachable ({r.status_code}): a new version may have replaced it"
    if "html" in r.headers.get("Content-Type", "").lower():
        return r.status_code, None, "not a PDF any more (moved or replaced?)"
    from pypdf import PdfReader
    import logging; logging.getLogger("pypdf").setLevel(logging.ERROR)   # quiet its "odd-length line" warnings
    pdf = PdfReader(io.BytesIO(r.content))
    return r.status_code, " ".join(" ".join((pg.extract_text() or "").split()) for pg in pdf.pages), "(pdf)"

_browser = None
def render_html(url):
    """(status, html or None, note) from a real browser (Playwright), for pages whose details are loaded by script.
    Waits for the page to load, then a few seconds for its scripts (some sites, e.g. Wix, never go quiet)."""
    global _browser
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return None, None, "needs a browser: pip install playwright, then: python -m playwright install chromium"
    try:
        if _browser is None:
            _browser = sync_playwright().start().chromium.launch()
        page = _browser.new_page(user_agent=SETTINGS["user_agent"])
        try:
            resp = page.goto(url, timeout=45000, wait_until="domcontentloaded")
            try:
                page.wait_for_load_state("networkidle", timeout=8000)
            except Exception:
                pass
            page.wait_for_timeout(2000)
            status = resp.status if resp else 200
            return status, (page.content() if status < 400 else None), "(browser)" if status < 400 else f"HTTP {status}"
        finally:
            page.close()
    except Exception as e:
        return None, None, f"browser failed ({type(e).__name__})"

def browser_hosts():
    """Websites whose rule in sources.csv says they need a real browser (method mentions 'browser' or 'script')."""
    out = set()
    try:
        with open(ROOT / SETTINGS["sources_file"], encoding="utf-8-sig") as fh:
            for x in csv.DictReader(fh):
                if re.search(r"browser|script", x.get("method") or "", re.I):
                    out |= {host(u) for u in links(x.get("where_to_look"))}
    except OSError:
        pass
    return out

def fetch_html(url):
    """(status, html or None, note). Uses the requests library when it's installed (as check_sources.py does): it carries
    its own up-to-date certificate list, so it reaches sites whose security setup Python's built-in fetcher rejects."""
    try:
        import requests
    except ImportError:
        requests = None
    if requests:
        try:
            r = requests.get(url, headers={"User-Agent": SETTINGS["user_agent"], "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
                                           "Accept-Language": "en-GB,en;q=0.9"}, timeout=SETTINGS["timeout_s"])
        except Exception as e:   # timeouts, refused connections, certificate problems
            return None, None, f"unreachable ({type(e).__name__})"
        if r.status_code >= 400:
            return r.status_code, None, f"unreachable ({r.status_code})"
        ctype = r.headers.get("Content-Type", "")
        if "html" not in ctype.lower():
            return r.status_code, None, f"not a web page ({ctype.split(';')[0]})"
        if "charset" not in ctype.lower():   # no stated encoding: requests would assume Latin-1 and garble dashes; read the page's own
            r.encoding = r.apparent_encoding or "utf-8"
        return r.status_code, r.text, ""
    req = urllib.request.Request(url, headers={"User-Agent": SETTINGS["user_agent"], "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
                                               "Accept-Language": "en-GB,en;q=0.9"})
    try:
        with urllib.request.urlopen(req, timeout=SETTINGS["timeout_s"]) as res:
            ctype = res.headers.get("Content-Type", "")
            if "html" not in ctype.lower():
                return res.status, None, f"not a web page ({ctype.split(';')[0]})"
            return res.status, res.read(3_000_000).decode(res.headers.get_content_charset() or "utf-8", errors="replace"), ""
    except urllib.error.HTTPError as e:
        return e.code, None, f"unreachable ({e.code})"
    except Exception as e:   # timeouts, refused connections, certificate problems
        return None, None, f"unreachable ({type(e).__name__})"

def slug(url):
    path = re.sub(r"[^a-z0-9]+", "-", url.split("://", 1)[-1].split("/", 1)[-1].lower()).strip("-")[:80] or "home"
    return f"{path}-{fp(url)[:6]}.txt"

def pages_for(site, recs, rules):
    """Every page on the site that a record points to, with the names of the records that use it."""
    use = {}
    for r in recs:
        urls = links(r.get("source")) + [r.get("url", "")]
        for sid in (t.strip() for t in (r.get("source") or "").split(";")):
            urls += rules.get(sid, [])
        for u in urls:
            if u and site in host(u):
                use.setdefault(u, []).append(r["name"])
    return {u: sorted(set(n)) for u, n in sorted(use.items())}

def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("site", help="part of the web address, e.g. mindinsomerset.org.uk")
    ap.add_argument("--csv", help="a saved copy of the sheet (default: the published sheet)")
    a = ap.parse_args()

    recs, rules = read_records(a.csv), load_rules()
    pages = pages_for(a.site.lower(), recs, rules)
    if not pages:
        sys.exit(f"No records point to a page on {a.site}.")
    out = ROOT / "results" / "watch" / "detect" / re.sub(r"[^a-z0-9.-]+", "-", a.site.lower())
    text_dir, prev_dir = out / "text", out / "text-previous"
    state_file = out / "state.json"
    old = json.loads(state_file.read_text(encoding="utf-8")) if state_file.exists() else {}
    prev = old.get("pages", {})
    if text_dir.exists():
        shutil.rmtree(prev_dir, ignore_errors=True); shutil.copytree(text_dir, prev_dir)
    text_dir.mkdir(parents=True, exist_ok=True)

    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    print(f"{len(pages)} pages on {a.site}, used by {len({n for v in pages.values() for n in v})} records.")
    state, rows = {}, []
    for i, (u, names) in enumerate(pages.items()):
        if i: time.sleep(SETTINGS["delay_s"])
        status, html_text, note = fetch_html(u)
        p = prev.get(u, {})
        s = {"status": status, "note": note, "records": names, "file": slug(u),
             "first_seen": p.get("first_seen", now), "last_changed": p.get("last_changed", "")}
        if html_text is not None:
            text = tidy(html_text, u)
            (text_dir / s["file"]).write_text(text, encoding="utf-8")
            s["main"], s["whole"], s["lines"] = fp(text), fp(whole_page(html_text)), text.count("\n")
            if p.get("main") and p["main"] != s["main"]: s["last_changed"] = now
        state[u] = s
        main_changed = bool(p.get("main") and s.get("main") and p["main"] != s["main"])
        whole_changed = bool(p.get("whole") and s.get("whole") and p["whole"] != s["whole"])
        rows.append((u, s, main_changed, whole_changed, bool(p)))
        print(f"  {'CHANGED' if main_changed else 'ok     ' if s.get('main') else 'FAILED '} {u} {note}")
    state_file.write_text(json.dumps({"run": now, "previous_run": old.get("run", ""), "pages": state}, indent=1), encoding="utf-8")

    ok = [r for r in rows if r[1].get("main")]
    md = [f"# Changes on {a.site}, {now}", "",
          f"Previous run: {old.get('run') or 'none (this is the first run, so nothing can show as changed yet)'}.", "",
          f"{len(rows)} pages, used by {len({n for r in rows for n in r[1]['records']})} records. {len(ok)} read, {len(rows) - len(ok)} couldn't be read.", ""]
    if old:
        mc, wc = sum(r[2] for r in rows), sum(r[3] for r in rows)
        md += ["| Fingerprint | Pages changed |", "|---|---|",
               f"| Main content, tidied (the new one) | {mc} |", f"| Whole visible page | {wc} |", "",
               "If the second number is much bigger than the first, the tidying is removing noise. Changes in the first are worth reading.", ""]
        for u, s, mchg, _, _ in rows:
            if not mchg: continue
            md += [f"## Changed: {u}", "", "Records: " + "; ".join(s["records"]), "", "```diff"]
            before = (prev_dir / s["file"]).read_text(encoding="utf-8").splitlines() if (prev_dir / s["file"]).exists() else []
            after = (text_dir / s["file"]).read_text(encoding="utf-8").splitlines()
            diff = [d for d in difflib.unified_diff(before, after, lineterm="", n=1)][2:]
            md += diff[:80] + (["... (more)"] if len(diff) > 80 else []) + ["```", ""]
    bad = [r for r in rows if not r[1].get("main")]
    if bad:
        md += ["## Couldn't be read", ""] + [f"- {u}: {s['note']} ({len(s['records'])} records)" for u, s, *_ in bad] + [""]
    md += ["## All pages", "", "| Page | Lines | Records | Last changed |", "|---|---|---|---|"]
    md += [f"| {u} | {s.get('lines', '')} | {len(s['records'])} | {s['last_changed'] or 'not since first seen'} |" for u, s, *_ in rows]
    (out / "report.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print(f"\nReport: {(out / 'report.md').relative_to(ROOT)}")

if __name__ == "__main__":
    main()
