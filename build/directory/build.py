"""Build the directory's published pages from template.html and the shared code in build/core/.

Usage: python build.py [services.csv] [test]      (or run build/build_all.py)
Writes github/directory/index.html (live, published at /directory/) and github/test/directory/index.html (test, at /test/directory/);
with "test", only the test copy.

The pages carry no records: they read them live from the published Google Sheet (sheet_url.txt). A CSV, if given, is only
checked for towns that have no town-centre position in towns.json (records there without a postcode wouldn't get a pin).
Assist is on the tools page (build/tools/); the directory links to it ("Tools →").
"""
import csv, datetime, json, pathlib, sys, zoneinfo

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "shared"))
from core import inline_core
from site_config import rebase, BASE

LIVE = "https://signpostingsomerset.org.uk"
STAMP = datetime.datetime.now(zoneinfo.ZoneInfo("Europe/London")).strftime("%Y-%m-%d %H:%M")
args = [a for a in sys.argv[1:] if a != "test"]
towns = json.loads((HERE / "towns.json").read_text(encoding="utf-8"))
TOWNS, APPROX = towns["TOWNS"], towns["APPROX_TOWNS"]

if args:   # the CSV: just check every town has a centre
    rows = [r for r in csv.DictReader(open(args[0], encoding="utf-8-sig")) if (r.get("name") or "").strip()]
    missing = sorted({(r.get("town") or "").strip() for r in rows} - set(TOWNS) - {""})
    if missing: print("WARNING: towns with no town-centre entry in towns.json (won't pin without lat/lon):", ", ".join(missing))

sheet = (HERE / "sheet_url.txt").read_text().strip()
assert sheet, "sheet_url.txt is empty: the directory needs the published sheet's link"
page = (inline_core((HERE / "template.html").read_text(encoding="utf-8"))
        .replace("/*LEAFLET_CSS*/", (HERE / "leaflet.css").read_text(encoding="utf-8"))
        .replace("/*DATA*/[]", "[]")
        .replace("/*TOWNS*/{}", json.dumps(TOWNS, ensure_ascii=False))
        .replace("/*APPROX*/[]", json.dumps(sorted(set(APPROX)), ensure_ascii=False))
        .replace("/*OUTLINE*/null", (HERE / "somerset-outline.json").read_text())
        .replace("/*BUILT*/", "").replace("/*TRIAL*/", "")
        .replace('const SHEET_CSV_URL = "";', f'const SHEET_CSV_URL = "{sheet}";')
        .replace("const LIVE_ONLY = false;", "const LIVE_ONLY = true;"))

def document(pg):   # the full document: head (up to the end of the styles), then the body
    k = pg.rfind("</style>", 0, pg.find("<div")) + len("</style>")
    return ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            + pg[:k] + "\n</head>\n<body>\n" + pg[k:] + "\n</body>\n</html>\n")
page = document(page)

TARGETS = (("directory", "Signposting Somerset"), ("test", "Signposting Somerset (test)"))
if "test" in sys.argv[1:]: TARGETS = TARGETS[1:]
for name, title in TARGETS:
    out_page = page.replace("/*SITE_URL*/", LIVE).replace("/*SITE_VERSION*/", f"{name} {STAMP}")
    tools = "/test/tools/" if name == "test" else "/tools/"   # the tools page beside this copy
    out_page = out_page.replace('href="/tools/"', f'href="{tools}"').replace("/*TOOLS_URL*/", BASE + tools)
    out_page = out_page.replace("<title>Signposting Somerset</title>", f"<title>{title}</title>", 1)
    out_page = out_page.replace("<!--ROBOTS-->", '<meta name="robots" content="noindex, nofollow">' if name == "test" else "", 1)   # test: kept out of search engines
    if name == "test":   # noindex page: no canonical, so the signals don't conflict
        out_page = out_page.replace(f'<link rel="canonical" href="{LIVE}/directory/">\n', "", 1)
    out = HERE / "github" / ("test/directory" if name == "test" else name)
    out.mkdir(parents=True, exist_ok=True)
    (out / "index.html").write_text(rebase(out_page), encoding="utf-8")
    print(f"{out.relative_to(HERE)}/index.html ({len(out_page) // 1024} KB)")
