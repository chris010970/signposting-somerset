"""Build the tools page (/tools/): Assist on its own, from the shared code in build/core/.

Usage: python build_tools.py         (or run build/build_all.py)
Writes out/tools/index.html (published at /tools/) and out/test/tools/index.html (published at /test/tools/).
Assist's own files are in assist/ (assist.html: tab, filter bar and panel; assist.css; assist.js), and Analytics's in analytics/
(analytics.html: tab, filter bar, panel and its About section; analytics.css; analytics.js).
"""
import datetime, json, pathlib, re, sys, zoneinfo

HERE = pathlib.Path(__file__).resolve().parent
BUILD = HERE.parent
DIR = BUILD / "directory"
sys.path.insert(0, str(BUILD / "shared"))
from core import inline_core
from site_config import rebase, BASE

LIVE = "https://signpostingsomerset.org.uk"
STAMP = datetime.datetime.now(zoneinfo.ZoneInfo("Europe/London")).strftime("%Y-%m-%d %H:%M")
towns = json.loads((DIR / "towns.json").read_text(encoding="utf-8"))
sheet = (DIR / "sheet_url.txt").read_text().strip()
worker_url = (DIR / "assist" / "worker_url.txt").read_text().strip()
parts = (HERE / "assist" / "assist.html").read_text(encoding="utf-8")
assist_css = (HERE / "assist" / "assist.css").read_text(encoding="utf-8")
assist_js = (HERE / "assist" / "assist.js").read_text(encoding="utf-8").replace("/*SCRUB*/", (DIR / "assist" / "scrub.js").read_text(encoding="utf-8"))

def part(name):   # one piece of assist.html (TAB, HDR or PANEL)
    m = re.search(rf"<!--{name}-->\n(.*?)(?=\n<!--[A-Z]+-->|\Z)", parts, re.S)
    return m.group(1).rstrip() + "\n"

def put(page, marker, text):
    assert page.count(marker) == 1, f"marker {marker} found {page.count(marker)} times"
    return page.replace(marker, text)

page = inline_core((HERE / "template.html").read_text(encoding="utf-8"))
page = put(page, "/*LEAFLET_CSS*/", (DIR / "leaflet.css").read_text(encoding="utf-8"))
page = put(page, "/*TOWNS*/{}", json.dumps(towns["TOWNS"], ensure_ascii=False))
page = put(page, "/*APPROX*/[]", json.dumps(sorted(set(towns["APPROX_TOWNS"])), ensure_ascii=False))
page = put(page, "/*OUTLINE*/null", (DIR / "somerset-outline.json").read_text())
page = put(page, 'const SHEET_CSV_URL = "";', f'const SHEET_CSV_URL = "{sheet}";')
page = page.replace("/*BUILT*/", "")
an_parts = (HERE / "analytics" / "analytics.html").read_text(encoding="utf-8")
def an_part(name):   # one piece of analytics.html (TAB, HDR, PANEL or ABOUT)
    m = re.search(rf"<!--{name}-->\n(.*?)(?=\n<!--[A-Z]+-->|\Z)", an_parts, re.S)
    return m.group(1).rstrip() + "\n"
page = put(page, "/*TOOLS_JS*/\n", (HERE / "tools.js").read_text(encoding="utf-8").replace("/*ANALYTICS_ABOUT*/", an_part("ABOUT"))
           + (HERE / "analytics" / "analytics.js").read_text(encoding="utf-8"))
for name in ("TAB", "HDR", "PANEL"):
    page = put(page, f"<!--ANALYTICS_{name}-->\n", an_part(name))
for name in ("TAB", "HDR", "PANEL"):
    page = put(page, f"<!--ASSIST_{name}-->\n", part(name))
i = page.rfind("</style>"); page = page[:i] + assist_css + (HERE / "analytics" / "analytics.css").read_text(encoding="utf-8") + page[i:]
j = page.rfind("</script>") + len("</script>")
page = page[:j] + "\n<script>\n" + assist_js.replace("/*WORKER_URL*/", worker_url) + "</script>\n" + page[j:]

def document(pg):   # the full document: head (up to the end of the styles), then the body
    k = pg.rfind("</style>", 0, pg.find("<div")) + len("</style>")
    return ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            + pg[:k] + "\n</head>\n<body>\n" + pg[k:] + "\n</body>\n</html>\n")

for name, directory, robots, canonical in (
        ("tools", "/directory/", "", f'<link rel="canonical" href="{LIVE}/tools/">'),
        ("test/tools", "/test/directory/", '<meta name="robots" content="noindex, nofollow">', "")):
    out_page = (page.replace("/*SITE_URL*/", LIVE).replace("/*SITE_VERSION*/", f"{name.split('/')[0]} {STAMP}")
                    .replace("/*DIRECTORY*/", directory).replace("/*DIRECTORY_URL*/", BASE + directory).replace("/*SITE_BASE*/", BASE))
    out_page = put(put(out_page, "<!--ROBOTS-->", robots), "<!--CANONICAL-->", canonical)
    if name.startswith("test"): out_page = out_page.replace("<title>Signposting Somerset: tools</title>", "<title>Signposting Somerset: tools (test)</title>", 1)
    out = HERE / "out" / name
    out.mkdir(parents=True, exist_ok=True)
    (out / "index.html").write_text(rebase(document(out_page)), encoding="utf-8")
    print(f"out/{name}/index.html ({len(out_page) // 1024} KB, Assist relay: {worker_url or 'NOT SET'})")
