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

def whole_page(html_text):
    """The old-style fingerprint's text: everything visible, flattened. Kept only to compare against the tidied one."""
    soup = BeautifulSoup(html_text, "html.parser")
    for t in soup(["script", "style", "noscript", "template", "svg", "head"]):
        t.decompose()
    return re.sub(r"\s+", " ", soup.get_text(" ")).strip().lower()

BLOCKS = ["p", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "dt", "dd", "blockquote", "pre", "figcaption", "address",
          "div", "section", "article", "table", "ul", "ol", "dl"]

def drops_for(url):
    """Parts of the page to ignore: the general list, plus any for this site (site_drop_selectors in watch.json)."""
    h = host(url) if url else ""
    extra = [sel for site, sels in SETTINGS.get("site_drop_selectors", {}).items() if site in h for sel in sels]
    return SETTINGS["drop_selectors"] + extra

def tidy(html_text, url=""):
    """The page's main content as lines of text, with presentation removed and information kept."""
    soup = BeautifulSoup(html_text, "html.parser")
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
