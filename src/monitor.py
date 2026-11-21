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

Run it straight after check_sources.py to verify the recipes work; after that, run it whenever you like: a quote
that was "found" and is now "missing" is a change to look at. Writes <out>.csv (one row per quote) and
<out>.md: each record under Needs you (page failed, or a detail changed or removed), Can't be watched (a detail
only in the footer, or shared), or Fine, with the check_sources command to re-check the ones that need you. Needs BeautifulSoup: pip install beautifulsoup4
"""
import argparse, csv, os, re, sys, time
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from detect import SETTINGS, fetch_html, host, tidy, whole_page

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

def classify(quote, main, whole):
    q = plain(quote)
    if not q:
        return "no quote"
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

    pages, last_host = {}, {}
    urls = sorted({r["source_url"] for r in recipes})
    print(f"{len(recipes)} quotes for {len({(key(r), r['name']) for r in recipes})} records, on {len(urls)} pages.")
    for u in urls:
        h = host(u)
        if h in last_host:
            time.sleep(max(0, SETTINGS["delay_s"] - (time.time() - last_host[h])))
        status, html_text, note = fetch_html(u)
        last_host[h] = time.time()
        pages[u] = (plain(tidy(html_text, u)), plain(whole_page(html_text)), "") if html_text is not None else ("", "", note or f"status {status}")
        print(f"  {'ok    ' if html_text is not None else 'FAILED'} {u} {note}")

    out = []
    for r in recipes:
        main_t, whole_t, problem = pages[r["source_url"]]
        out.append({**r, "status": f"page failed: {problem}" if problem else classify(r["quote"], main_t, whole_t)})
    with open(stem + ".csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(recipes[0]) + ["status"]); w.writeheader(); w.writerows(out)

    hand = by_hand(a, files, recipes)
    Path(stem + ".md").write_text(report(out, files, a.services, stem, hand), encoding="utf-8")
    print(f"\nReport: {stem}.md")

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
            missing = [LABEL.get(f, f) for f in watched if (r.get(f) or "").strip() and f not in have[i]]
            if missing:
                out[i] = (r.get("name", ""), [f"{', '.join(missing)}: no quote from its page (not stated there, e.g. only on a flyer; or not yet captured)"])
    return out

def report(out, files, services, stem, hand=None):
    """One line per record, sorted by what needs doing: Needs you / Can't be watched / Fine."""
    by_rec = defaultdict(list)
    for x in out:
        by_rec[(key(x), x["name"])].append(x)
    need, cant, fine = [], [], []
    for (k, name), xs in sorted(by_rec.items(), key=lambda kv: str(kv[0][0])):
        failed = next((x["status"] for x in xs if x["status"].startswith("page failed")), "")
        gone = [x for x in xs if x["status"] == "missing"]
        if failed:
            need.append((k, f"- **{k} {name}**: {failed.replace('page failed: ', 'page failed to load (')})" + f" {xs[0]['source_url']}"))
            continue
        if gone and len(gone) == len(xs):
            need.append((k, f"- **{k} {name}**: none of its details are on the page any more: it may have moved or ended. {xs[0]['source_url']}"))
            continue
        if gone:
            bits = "; ".join(f"{LABEL.get(x['field'], x['field'])} changed or removed (was \"{x['quote']}\")" for x in gone)
            need.append((k, f"- **{k} {name}**: {bits}. {xs[0]['source_url']}"))
        weak = [x for x in xs if x["status"] in ("found, shared", "no quote")]
        extra = (hand or {}).pop(str(k).upper(), (None, []))[1]
        if weak or extra:
            why = {"found, shared": "on the page more than once, so can't show a change to this record alone",
                   "no quote": "no quote to look for"}
            grouped = defaultdict(list)
            for x in weak:
                grouped[x["status"]].append(LABEL.get(x["field"], x["field"]))
            bits = "; ".join([f"{', '.join(fs)}: {why[st]}" for st, fs in grouped.items()] + extra)
            cant.append(f"- {k} {name}: {bits}")
        if not gone and not weak and not extra:
            fine.append(k)
    for k, (name, why) in (hand or {}).items():          # records with no quotes at all
        cant.append(f"- {k} {name}: {'; '.join(why)}")
    cant.sort()
    today = time.strftime("%d %B %Y").lstrip("0")
    md = [f"# Monitor: {today}, {len(need) + len(cant) + len(fine)} records", "",
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
    md += ["", f"## Fine ({len(fine)})", "", ", ".join(map(str, fine)) or "None."]
    return "\n".join(md) + "\n"

if __name__ == "__main__":
    main()
