"""Build the tools page (/tools/): Assist and Analytics, from template.html, its own code and build/core/.

Usage: python build_tools.py         (or run build/build_all.py)
Writes out/tools/index.html (published at /tools/) and out/test/tools/index.html (published at /test/tools/).
The page's own code: tools.js (tabs, About, records); assist/ (assist.html: tab, filter bar and panel; assist.css;
assist.js; scrub.js) and analytics/ (analytics.html: tab, filter bar, panel and its About section; analytics.css; analytics.js).
"""
import json, pathlib, sys

HERE = pathlib.Path(__file__).resolve().parent
DIR = HERE.parent / "directory"
sys.path.insert(0, str(HERE.parent / "shared"))
from core import inline_core
from page import LIVE, NOINDEX, STAMP, document, put, section
from site_config import BASE, rebase

towns = json.loads((DIR / "towns.json").read_text(encoding="utf-8"))
sheet = (DIR / "sheet_url.txt").read_text().strip()
worker_url = (HERE / "assist" / "worker_url.txt").read_text().strip()
assist_html = (HERE / "assist" / "assist.html").read_text(encoding="utf-8")
analytics_html = (HERE / "analytics" / "analytics.html").read_text(encoding="utf-8")

page = inline_core((HERE / "template.html").read_text(encoding="utf-8"), HERE)
page = put(page, "/*LEAFLET_CSS*/", (DIR / "leaflet.css").read_text(encoding="utf-8"))
page = put(page, "/*TOWNS*/{}", json.dumps(towns["TOWNS"], ensure_ascii=False))
page = put(page, "/*OUTLINE*/null", (DIR / "somerset-outline.json").read_text())
page = put(page, "/*SHEET_CSV_URL*/", sheet)
page = put(page, "/*ANALYTICS_ABOUT*/", section(analytics_html, "ABOUT"))
page = put(page, "/*WORKER_URL*/", worker_url)
for name in ("TAB", "HDR", "PANEL"):
    page = put(page, f"<!--ASSIST_{name}-->\n", section(assist_html, name))
    page = put(page, f"<!--ANALYTICS_{name}-->\n", section(analytics_html, name))
page = document(page)

for name, directory in (("tools", "/directory/"), ("test/tools", "/test/directory/")):
    test = name.startswith("test")
    out_page = (page.replace("/*SITE_VERSION*/", f"{name.split('/')[0]} {STAMP}")   # (on the About tab, and in Assist)
                    .replace("/*SITE_URL*/", LIVE).replace("/*DIRECTORY*/", directory)
                    .replace("/*DIRECTORY_URL*/", BASE + directory).replace("/*SITE_BASE*/", BASE))
    out_page = put(out_page, "<!--ROBOTS-->", NOINDEX if test else "")
    out_page = put(out_page, "<!--CANONICAL-->", "" if test else f'<link rel="canonical" href="{LIVE}/tools/">')
    if test: out_page = put(out_page, "<title>Signposting Somerset: tools</title>", "<title>Signposting Somerset: tools (test)</title>")
    out = HERE / "out" / name
    out.mkdir(parents=True, exist_ok=True)
    (out / "index.html").write_text(rebase(out_page), encoding="utf-8")
    print(f"out/{name}/index.html ({len(out_page) // 1024} KB, Assist relay: {worker_url or 'NOT SET'})")
