"""The scraper: are the quotes that confirmed each record still on its page? No AI.

    python src/monitor.py check-pilot-recipes.csv
    python src/monitor.py check-pilot-recipes.csv --out monitor-pilot
    python src/monitor.py checks                      # every -recipes.csv in the checks folder
    python src/monitor.py verified/evidence.csv       # the new sheet's evidence: the quotes that confirmed each record
    python src/monitor.py verified/evidence.csv --site mindinsomerset.org.uk    # one website
    python src/monitor.py verified/evidence.csv --ids R0016,R0018               # particular records

The recipes file comes from src/check_sources.py: one row per record and field (the watch_fields in
src/watch.json), with the page and the exact words on it that confirmed the value. This fetches each page once, tidies
it the same way as src/detect.py (menus, footers and banners removed), and looks for each quote:

  found            in the page's main content, exactly once: this field is unchanged
  found, shared    in the main content, but more than once (e.g. "6pm - 11pm" for five places): it can't show a
                   change to this record alone; a longer quote is needed
  found, footer    not in the main content, but elsewhere on the page (e.g. a footer listing the hubs' addresses):
                   it's still there, so this field is unchanged
  missing          not on the page: either the details changed, or the quote never matched the page's own text.
                   Run straight after check_sources.py, every "missing" is the second kind: a recipe to fix
  page failed      the page couldn't be fetched (blocked, needs a browser, gone)
  found, image     the quote came from a timetable image (read by the checker's AI). The monitor can't read images,
                   so it checks the web page still shows the same image; a new image means a new timetable, and the
                   record goes under Needs you

Pages on sites whose rule in src/sources.csv says they need a real browser (e.g. Balsam's, whose days load by script)
are opened in one (Playwright). For days and times, calendar dates are ignored: 'Monday 23 Nov 10:00' is looked for as
'Monday 10:00', so a list of upcoming sessions reads the same from week to week.

Run it straight after check_sources.py to verify the recipes work; after that, run it whenever you like: a quote
that was "found" and is now "missing" is a change to look at. Writes <out>.csv (one row per quote) and
<out>.md: each record under Needs you (page failed, or a detail changed or removed), Can't be watched (a detail
only in the footer, or shared), or Fine, with the check_sources command to re-check the ones that need you. Needs BeautifulSoup: pip install beautifulsoup4
"""
import argparse, csv, os, re, sys, time
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from calendar_feed import is_ics   # noqa: E402
from detect import SETTINGS, browser_hosts, fetch_csv, fetch_ics, fetch_html, fetch_pdf, host, image_on_page, image_page, is_csv, is_image, is_pdf, render_html, source_scopes, tidy, whole_page

def parse_ids(text):
    """'R0001,R0005-R0009' -> {'R0001', 'R0005', ..., 'R0009'}"""
    out = set()
    for part in (x.strip().upper() for x in (text or "").split(",") if x.strip()):
        m = re.fullmatch(r"R(\d+)\s*-\s*R?(\d+)", part)
        if m:
            out.update(f"R{n:0{len(m[1])}d}" for n in range(int(m[1]), int(m[2]) + 1))
        else:
            out.add(part)
    return out

def key(x):
    """How a quote's record is named in the report: its ID when it has one."""
    return x.get("record_id") or x.get("town") or x.get("row", "")

def plain(s):
    """Both sides tidied the same way before comparing: lower case, plain dashes and quotes, single spaces."""
    s = s.lower().replace("\xa0", " ")
    s = re.sub(r"[‐‑‒–—−]", "-", s)
    s = re.sub(r"[‘’′]", "'", s)
    s = re.sub(r"[“”″]", '"', s)
    s = re.sub(r"\s*-\s*", " - ", s)          # "10am–12pm" and "10am - 12pm" read the same
    return re.sub(r"\s+", " ", s).strip()

DATE = re.compile(r"\b\d{1,2}(st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?(\s+\d{4})?\b")
PAIR = re.compile(r"\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b\W{0,3}"
                  r"(\d{1,2}[:.]\d{2}\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))")
def undated(t):
    """Text without calendar dates: 'Monday 23 Nov 10:00' -> 'monday 10:00', so a listing of upcoming sessions reads the
    same from one week to the next."""
    return re.sub(r"\s+", " ", DATE.sub(" ", t)).strip()

def _hhmm(t):
    m = re.match(r"(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?", t.strip())
    h, mi = int(m[1]), int(m[2] or 0)
    h += 12 if m[3] == "pm" and h < 12 else 0
    h -= 12 if m[3] == "am" and h == 12 else 0
    return f"{h:02d}:{mi:02d}"

ANCHOR_NOISE = {"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "mondays", "tuesdays",
                "wednesdays", "thursdays", "fridays", "saturdays", "sundays", "every", "each", "from", "until", "with",
                "noon", "midday", "time", "times", "date", "dates", "upcoming", "month", "week", "weekly", "session",
                "sessions", "duration", "hour", "hours", "minutes"}
def _near_anchor(rx, text, q):
    """Is the day-and-time pair on the page where this record's entry is? The quote's own words ('Pilates', 'Tai
    Chi') mark the entry; the pair has to be within the quote's length of one of them. Otherwise 'Monday 14:30' in a
    list of upcoming dates further down would hide Pilates moving to Tuesday. A quote of only days and times has no
    such words, so there the pair may be anywhere on the page, as before."""
    anchors = [w for w in re.findall(r"[a-z][a-z&']{3,}", q) if w not in ANCHOR_NOISE]
    if not anchors:
        return bool(rx.search(text))
    span = len(q) + 20
    for a in anchors:
        for m in re.finditer(rf"\b{re.escape(a)}", text):
            if rx.search(text, max(0, m.start() - span), m.start() + span):
                return True
    return False

MARKER = re.compile(r"^\[?contact links on page:\s*|\]$")
def classify(quote, main, whole, field=None, value=None):
    q = MARKER.sub("", plain(quote)).strip()      # the checker's '[Contact links on page: x]' means x, given as a link
    if not q:
        return "no quote"
    parts = [p.strip() for p in re.split(r"\s*(?:\.\.\.|…)\s*", q) if p.strip()]
    if len(parts) > 1:                             # 'contact the team on: ... 01823 653990': each part, word for word
        got = [classify(p, main, whole, field, value) for p in parts]
        if "missing" in got:
            return "missing"
        return "found" if all(g == "found" for g in got) else "found, footer" if "found, footer" in got else "found, shared"
    if field in ("days", "times"):
        # session listings carry dates that change every week: check the day-and-time pairs, without the dates
        q, main, whole = undated(q), undated(main), undated(whole)
        pairs = PAIR.findall(q)
        if pairs:
            mine = pairs
            if field == "days" and value:
                want = {d.strip()[:3].lower() for d in re.split(r"[;,]", value)}
                mine = [p for p in pairs if p[0][:3] in want] or pairs
            if field == "times" and value and re.match(r"\d{1,2}:\d{2}", value):
                mine = [p for p in pairs if _hhmm(p[1]) == value[:5]] or pairs
            rx = [re.compile(rf"\b{d}s?\W{{0,3}}{re.escape(t)}") for d, t in mine]
            if all(_near_anchor(r, main, q) for r in rx):
                return "found"
            if all(_near_anchor(r, whole, q) for r in rx):
                return "found, footer"
            return "missing"
    n = main.count(q)
    if n == 1:
        return "found"
    if n > 1:
        return "found, shared"
    if q in whole or q.replace(" ", "") in whole.replace(" ", ""):
        return "found, footer"
    return "missing"

def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("recipes", nargs="+", help="-recipes.csv files from check_sources.py, or a folder of them (e.g. checks)")
    ap.add_argument("--site", help="only quotes on this website, e.g. mindinsomerset.org.uk")
    ap.add_argument("--ids", help="only these records, e.g. R0016,R0018 or R0020-R0030")
    ap.add_argument("--services", default="verified/services.csv", help="the records file, for the re-check command in the report")
    ap.add_argument("--out", help="name for the results (default: monitor-<recipes name>)")
    a = ap.parse_args()
    files = []
    for x in a.recipes:
        p = Path(x)
        files += sorted(p.glob("*-recipes.csv")) if p.is_dir() else [p]
    recipes = []
    for f in files:
        with open(f, encoding="utf-8-sig") as fh:
            recipes += list(csv.DictReader(fh))
    if a.site:
        recipes = [r for r in recipes if a.site.lower() in host(r["source_url"])]
    if a.ids:
        want = parse_ids(a.ids)
        recipes = [r for r in recipes if (r.get("record_id") or "").upper() in want]
    watched = SETTINGS.get("watch_fields")
    if watched:                                    # older recipe files may hold fields no longer watched (e.g. postcode)
        recipes = [r for r in recipes if r.get("field") in watched]
    if not recipes:
        sys.exit("No recipes found (for that site or those IDs).")
    label = files[0].stem.removesuffix("-recipes") if len(files) == 1 else Path(a.recipes[0]).name.strip("/\\") or "all"
    stem = a.out or "monitor-" + label

    pages, last_host, lines, images = {}, {}, {}, set()
    js_hosts = browser_hosts()                     # sites sources.csv says load their details by script
    unreadable = {x.lower().removeprefix("www.") for x in SETTINGS.get("unwatchable_hosts") or []}
    urls = sorted({r["source_url"] for r in recipes})
    print(f"{len(recipes)} quotes for {len({(key(r), r['name']) for r in recipes})} records, on {len(urls)} pages.")
    for u in urls:
        h = host(u)
        if h in last_host:
            time.sleep(max(0, SETTINGS["delay_s"] - (time.time() - last_host[h])))
        if h in unreadable:                        # e.g. Facebook: shows a log-in wall, not the page
            pages[u], lines[u] = ("", "", "unreadable"), []
            print(f"  skip   {u} (in watch.json's unwatchable_hosts)")
            continue
        if is_image(u):                            # a timetable image: is the page still showing this one?
            pg = image_page(u)
            if not pg:
                status, html_text, note = None, None, "no page for this image in sources.csv"
            else:
                status, html_text, note = render_html(pg) if host(pg) in js_hosts else fetch_html(pg)
                if html_text is not None and not image_on_page(u, html_text):
                    html_text, note = None, f"timetable image no longer on {pg}: a new one may be out (copy its link into sources.csv, then re-check)"
            pages[u] = ("", "", "") if html_text is not None else ("", "", note or f"status {status}")
            lines[u] = []
            if html_text is not None:
                images.add(u)
        elif is_csv(u) or is_pdf(u) or is_ics(u):  # a published spreadsheet (e.g. Age UK's timetable), a PDF listing or a calendar feed
            status, text, note = (fetch_csv if is_csv(u) else fetch_ics if is_ics(u) else fetch_pdf)(u)
            pages[u] = (plain(text), plain(text), "") if text is not None else ("", "", note or f"status {status}")
            lines[u] = [plain(l) for l in (text or "").split("\n") if l.strip()]
            html_text = text
        else:
            status, html_text, note = render_html(u) if h in js_hosts else fetch_html(u)
            pages[u] = (plain(tidy(html_text, u)), plain(whole_page(html_text)), "") if html_text is not None else ("", "", note or f"status {status}")
            lines[u] = [plain(l) for l in tidy(html_text, u).split("\n") if l.strip()] if html_text is not None else []
        last_host[h] = time.time()
        print(f"  {'ok    ' if html_text is not None else 'FAILED'} {u} {note}")

    out = []
    for r in recipes:
        main_t, whole_t, problem = pages[r["source_url"]]
        st = ("can't read" if problem == "unreadable" else f"page failed: {problem}" if problem else
              ("found, image" if r.get("quote") else "no quote") if r["source_url"] in images else
              classify(r["quote"], main_t, whole_t, r.get("field"), r.get("value") or r.get("sheet_value")))
        out.append({**r, "status": st})
    with open(stem + ".csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(recipes[0]) + ["status"]); w.writeheader(); w.writerows(out)

    hand = by_hand(a, files, recipes)
    records = {}
    if Path(a.services).exists():
        with open(a.services, encoding="utf-8-sig") as fh:
            records = {(r.get("record_id") or "").upper(): r for r in csv.DictReader(fh)}
    alerts = status_alerts([r for r in out if r["status"].startswith("found")], pages, records, lines)
    Path(stem + ".md").write_text(report(out, files, a.services, stem, hand, alerts), encoding="utf-8")
    print(f"\nReport: {stem}.md")

ENTRY = re.compile(r"\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b|\b\d{1,2}([:.]\d{2})?\s*(am|pm)\b|\b\d{1,2}:\d{2}\b")
def status_alerts(recipes, pages, records, lines=None):
    """{record ID: [status words]}: wording from watch.json's status_words ('suspended', 'currently full', ...) on the
    page close to the record's own quotes (within status_window characters), so a group that is suspended or full while
    its day and time are still listed doesn't pass as Fine. Words the record already carries (in its name, description,
    eligibility, access or dates) and those in status_ignore for it are left out, as are words inside a status_ignore_phrases
    phrase (a general notice such as 'may be cancelled'). pages: url -> (main text, ...);
    records: ID -> the record's row; lines: url -> the page's main text line by line (paragraphs, list items, table
    rows), when it has them. Then 'near' means the quote's own line and the one after it (unless that's the next
    entry, with its own day or time), so a neighbouring group's 'currently full' isn't put on this one; a page with no lines (a PDF) uses the character window."""
    words = [plain(w) for w in SETTINGS.get("status_words") or []]
    win = int(SETTINGS.get("status_window") or 250)
    ignore = {k.upper(): {plain(w) for w in v} for k, v in (SETTINGS.get("status_ignore") or {}).items()}
    general = [plain(w) for w in SETTINGS.get("status_ignore_phrases") or []]
    out = defaultdict(set)
    groups = defaultdict(list)                     # one record's quotes on one page
    for r in recipes:
        groups[(str(key(r)).upper(), r["source_url"])].append(plain(r.get("quote", "")))
    for (k, url), qs in groups.items():
        main = (pages.get(url) or ("",))[0]
        qs = [q for q in qs if q and q in main]
        # only the record's own wording marks where it is: a quote the page has more than once (a shared contact line,
        # 'walks@sasp.co.uk') would put a page-wide notice ('walks may be cancelled in bad weather') on every walk
        qs = [q for q in qs if main.count(q) == 1]
        if not qs:
            continue
        ls = (lines or {}).get(url) or []
        # the record's own line(s): the ones holding the most of its quotes. A short quote ('When: Fridays at 10am')
        # can sit in several rows of a timetable; the row that also has its venue is this record's
        score = [sum(q in l for q in qs) for l in ls]
        best = max(score) if score else 0
        if len(ls) > 1 and best:
            at = [n for n, sc in enumerate(score) if sc == best]
            # the line after counts too ('Suspended over Christmas.'), unless it's the next entry, which gives a day or time
            # (not in a spreadsheet: there each row is its own entry, so the next row is another group's: Age UK's
            # 'Strong and Steady *CURRENTLY SUSPENDED' under Functional Fitness)
            nxt = not (is_csv(url) or is_ics(url))
            near = " ".join(ls[n] + (" " + ls[n + 1] if nxt and n + 1 < len(ls) and not ENTRY.search(ls[n + 1]) else "") for n in at)
        else:
            near = " ".join(main[max(0, main.find(q) - win): main.find(q) + len(q) + win] for q in qs)
        for ph in general:                         # general notices: 'walks may be cancelled in bad weather'
            near = near.replace(ph, " ")
        rec = records.get(k, {})
        known = plain(" ".join(rec.get(f, "") or "" for f in ("name", "description", "eligibility", "access", "dates")))
        for w in words:
            if re.search(rf"\b{re.escape(w)}\b", near) and w not in known and w not in ignore.get(k, set()):
                out[k].add(w)
    return {k: sorted(v) for k, v in out.items()}

LABEL = {"days": "days", "times": "times", "dates": "dates", "address": "address", "phone": "phone", "email": "email",
         "mode": "how it runs", "cost": "cost", "postcode": "postcode"}

def by_hand(a, files, recipes):
    """What the records file holds that has no quote to watch: {id: (name, [reasons])}. A whole record with nothing to
    watch (e.g. not verified yet), or single details with no quote (e.g. times only on a flyer). Only when checking
    the records file's own evidence (it sits beside it, e.g. verified/evidence.csv)."""
    sp = Path(a.services)
    if not sp.exists() or not any(f.resolve().parent == sp.resolve().parent for f in files):
        return {}
    status = {}
    st = sp.parent / "status.csv"
    if st.exists():
        with open(st, encoding="utf-8-sig") as fh:
            status = {r["record_id"]: r for r in csv.DictReader(fh)}
    have = defaultdict(set)
    for r in recipes:
        have[(r.get("record_id") or "").upper()].add(r.get("field"))
    watched = SETTINGS.get("watch_fields") or sorted({r.get("field") for r in recipes})
    skip = set(SETTINGS.get("by_hand_skip") or [])
    scopes = source_scopes()
    want = parse_ids(a.ids) if a.ids else None
    out = {}
    with open(sp, encoding="utf-8-sig") as fh:
        for r in csv.DictReader(fh):
            i = (r.get("record_id") or "").upper()
            if not i or (want and i not in want) or (a.site and a.site.lower() not in host(r.get("url") or "x")):
                continue
            stage = status.get(i, {}).get("status", "")
            if not have[i]:
                why = f"not verified yet ({stage})" if stage in ("not checked yet", "rerun pending") else "nothing on its page the scraper can watch"
                out[i] = (r.get("name", ""), [why])
                continue
            # a detail with no quote is listed only if it matters (not in by_hand_skip) and the record's source is meant
            # to confirm it: AA's meeting pages, say, never give the cost, so that isn't something to check by hand
            trusted = scopes.get((r.get("source") or "").strip())
            missing = [LABEL.get(f, f) for f in watched if (r.get(f) or "").strip() and f not in have[i]
                       and f not in skip and (trusted is None or f in trusted)]
            if missing:
                out[i] = (r.get("name", ""), [f"{', '.join(missing)}: no quote from its page (not stated there, e.g. only on a flyer; or not yet captured)"])
    return out

def report(out, files, services, stem, hand=None, alerts=None):
    """One line per record, sorted by what needs doing: Needs you / Can't be watched / Fine."""
    by_rec = defaultdict(list)
    for x in out:
        by_rec[(key(x), x["name"])].append(x)
    need, cant, fine, minor = [], [], [], []
    for (k, name), xs in sorted(by_rec.items(), key=lambda kv: str(kv[0][0])):
        if all(x["status"] == "can't read" for x in xs):
            (hand or {}).pop(str(k).upper(), None)
            cant.append(f"- {k} {name}: its page can't be read by the scraper ({host(xs[0]['source_url'])} needs a log-in): look at it yourself {xs[0]['source_url']}")
            continue
        failed = next((x["status"] for x in xs if x["status"].startswith("page failed")), "")
        gone = [x for x in xs if x["status"] == "missing"]
        if failed:
            need.append((k, f"- **{k} {name}**: {failed.replace('page failed: ', 'page failed to load (')})" + f" {xs[0]['source_url']}"))
            continue
        if gone and len(gone) == len(xs):
            need.append((k, f"- **{k} {name}**: none of its details are on the page any more: it may have moved or ended. {xs[0]['source_url']}"))
            continue
        said = (alerts or {}).get(str(k).upper(), [])
        # cost and 'how it runs' wording (by_hand_skip) changing is listed, but doesn't need you
        quiet = set(SETTINGS.get("by_hand_skip") or [])
        small = [x for x in gone if x["field"] in quiet]
        gone = [x for x in gone if x["field"] not in quiet]
        if small:
            minor.append(f"- {k} {name}: " + "; ".join(f"{LABEL.get(x['field'], x['field'])} wording changed (was \"{x['quote']}\")" for x in small))
        if gone or said:
            bits = [f"{LABEL.get(x['field'], x['field'])} changed or removed (was \"{x['quote']}\")" for x in gone]
            bits += [f"the page now says \"{w}\" near its details" for w in said]
            need.append((k, f"- **{k} {name}**: {'; '.join(bits)}. {xs[0]['source_url']}"))
        # 'found, shared': the wording is still there, but other records use it too (e.g. '£3' across a timetable, or the
        # same hours for every Crisis Safe Space). Counted as fine: a change to one of them alone may not show
        weak = [x for x in xs if x["status"] == "no quote" and x["field"] not in set(SETTINGS.get("by_hand_skip") or [])]
        extra = (hand or {}).pop(str(k).upper(), (None, []))[1]
        if weak or extra:
            why = {"no quote": "no quote to look for"}
            grouped = defaultdict(list)
            for x in weak:
                grouped[x["status"]].append(LABEL.get(x["field"], x["field"]))
            bits = "; ".join([f"{', '.join(fs)}: {why[st]}" for st, fs in grouped.items()] + extra)
            cant.append(f"- {k} {name}: {bits}")
        if not gone and not said and not weak and not extra:   # small changes alone still count as fine
            fine.append(k)
    waiting = []
    for k, (name, why) in (hand or {}).items():          # records with no quotes at all
        if why and why[0].startswith("not verified yet"):
            waiting.append(k)                            # still to be checked: counted, not listed one by one
        else:
            cant.append(f"- {k} {name}: {'; '.join(why)}")
    cant.sort()
    today = time.strftime("%d %B %Y").lstrip("0")
    md = [f"# Monitor: {today}, {len(need) + len(cant) + len(fine) + len(waiting)} records", "",
          f"Checked against {', '.join(f.name for f in files)}. Fine means every watched detail is still on the page, word for word. "
          "Monitor can't say what a new value is: for anything under Needs you, look at the page or run check_sources on it.", "",
          f"## Needs you ({len(need)})", ""] + ([l for _, l in need] or ["Nothing."])
    if need:
        sep = "\\" if os.name == "nt" else "/"
        ids = ",".join(str(k) for k, _ in need)
        md += ["", "To re-check these with check_sources (AI, a few pence each):", "", "```",
               f"python src{sep}check_sources.py --csv {services.replace('/', sep)} --ids {ids} --out checks{sep}recheck-{time.strftime('%Y-%m-%d')}.csv",
               "```"]
    md += ["", f"## Check by hand ({len(cant)})", "",
           "The scraper can't check these (or these details of them): check them yourself now and then.", ""] + (cant or ["Nothing."])
    if minor:
        md += ["", f"## Small changes ({len(minor)})", "", "Cost or 'how it runs' wording has changed: worth a look when you're next updating these records.", ""] + minor
    md += ["", f"## Fine ({len(fine)})", "", ", ".join(map(str, fine)) or "None."]
    if waiting:
        md += ["", f"## Not checked yet ({len(waiting)})", "", "In the records file but not yet verified, so nothing to watch: "
               + ", ".join(map(str, sorted(waiting)))]
    return "\n".join(md) + "\n"

if __name__ == "__main__":
    main()
