"""Build the directory's published pages from template.html, its own code (directory.css, js/) and build/core/.

Usage: python build.py [services.csv] [test]      (or run build/build_all.py)
Writes github/directory/index.html (live, published at /directory/) and github/test/directory/index.html (test, at /test/directory/);
with "test", only the test copy.

The pages carry no records: they read them live from the published Google Sheet (sheet_url.txt). A CSV, if given, is only
checked for towns that have no town-centre position in towns.json (records there without a postcode wouldn't get a pin).
"""
import json, pathlib, sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "shared"))
from core import inline_core
from page import LIVE, NOINDEX, STAMP, document, put
from records import read_records
from site_config import BASE, SETTINGS, rebase

args = [a for a in sys.argv[1:] if a != "test"]
towns = json.loads((HERE / "towns.json").read_text(encoding="utf-8"))
TOWNS = towns["TOWNS"]

if args:   # the CSV: just check every town has a centre
    missing = sorted({r.get("town", "") for r in read_records(args[0])} - set(TOWNS) - {""})
    if missing: print("WARNING: towns with no town-centre entry in towns.json (won't pin without lat/lon):", ", ".join(missing))

sheet = (HERE / "sheet_url.txt").read_text().strip()
assert sheet, "sheet_url.txt is empty: the directory needs the published sheet's link"
page = inline_core((HERE / "template.html").read_text(encoding="utf-8"), HERE)
page = put(page, "/*LEAFLET_CSS*/", (HERE / "leaflet.css").read_text(encoding="utf-8"))
page = put(page, "/*TOWNS*/{}", json.dumps(TOWNS, ensure_ascii=False))
page = put(page, "/*OUTLINE*/null", (HERE / "somerset-outline.json").read_text())
page = put(page, "/*SHEET_CSV_URL*/", sheet)
page = put(page, "/*FEEDBACK_FORM_URL*/", SETTINGS.get("feedback_form_url", ""))
page = document(page)

TARGETS = (("directory", "Signposting Somerset"), ("test", "Signposting Somerset (test)"))
if "test" in sys.argv[1:]: TARGETS = TARGETS[1:]
for name, title in TARGETS:
    tools = "/test/tools/" if name == "test" else "/tools/"   # the tools page beside this copy
    out_page = put(page, "/*SITE_VERSION*/", f"{name} {STAMP}")
    out_page = put(out_page, 'href="/tools/"', f'href="{tools}"')
    out_page = put(out_page, "/*TOOLS_URL*/", BASE + tools)
    out_page = put(out_page, "<title>Signposting Somerset</title>", f"<title>{title}</title>")
    out_page = put(out_page, "<!--ROBOTS-->", NOINDEX if name == "test" else "")   # test: kept out of search engines
    if name == "test":   # noindex page: no canonical, so the signals don't conflict
        out_page = put(out_page, f'<link rel="canonical" href="{LIVE}/directory/">\n', "")
    out = HERE / "github" / ("test/directory" if name == "test" else name)
    out.mkdir(parents=True, exist_ok=True)
    (out / "index.html").write_text(rebase(out_page), encoding="utf-8")
    print(f"{out.relative_to(HERE)}/index.html ({len(out_page) // 1024} KB)")
