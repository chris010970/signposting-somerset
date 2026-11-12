"""Build the site with the Assist tab, for both places it is published.

Run build.py first (it makes github/index.html), then: python build_v2.py
(or run build_all.py, which does both).
Writes github/main/index.html (the live site) and github/test/index.html (the test copy).
Plans always link to the live site.
"""
import pathlib, re

HERE = pathlib.Path(__file__).parent
base = (HERE / "github" / "index.html").read_text(encoding="utf-8")
parts = (HERE / "assist-tab" / "assist-tab.html").read_text(encoding="utf-8")
css = (HERE / "assist-tab" / "assist-tab.css").read_text(encoding="utf-8")
js = (HERE / "assist-tab" / "assist-tab.js").read_text(encoding="utf-8").replace("/*SCRUB*/", (HERE / "assist" / "scrub.js").read_text(encoding="utf-8"))
worker_url = (HERE / "assist" / "worker_url.txt").read_text().strip()

def part(name):
    m = re.search(rf"<!--{name}-->\n(.*?)(?=\n<!--[A-Z]+-->|\Z)", parts, re.S)
    return m.group(1).rstrip() + "\n"

def put(page, marker, text):
    assert page.count(marker) == 1, f"marker {marker} found {page.count(marker)} times"
    return page.replace(marker, text)

page = base
page = put(page, "<!--ASSIST_TAB-->", part("TAB"))
page = put(page, "<!--ASSIST_HDR-->", part("HDR"))
page = put(page, "<!--ASSIST_PANEL-->", part("PANEL"))
page = put(page, '"about"/*ASSIST_TABNAME*/]', '"about", "assist"]')
# styles: after the page's own style block; script: after the page's last script
i = page.rfind("</style>")
page = page[:i] + "\n" + css + page[i:]
j = page.rfind("</script>") + len("</script>")
page = page[:j] + "\n<script>\n" + js.replace("/*WORKER_URL*/", worker_url) + "</script>\n" + page[j:]
LIVE = "https://signpostingsomerset.org.uk"
import datetime, zoneinfo
STAMP = datetime.datetime.now(zoneinfo.ZoneInfo("Europe/London")).strftime("%Y-%m-%d %H:%M")
js_built = page
import sys
TARGETS = (("main", "Signposting Somerset"), ("test", "Signposting Somerset (test)"))
if "test" in sys.argv[1:]: TARGETS = TARGETS[1:]   # python build_v2.py test : only the test copy
for name, title in TARGETS:
    out_page = js_built.replace("/*SITE_URL*/", LIVE).replace("/*SITE_VERSION*/", f"{name} {STAMP}")
    out_page = out_page.replace("<title>Signposting Somerset</title>", f"<title>{title}</title>", 1)
    # keep the test copy out of search engines
    out_page = out_page.replace("<!--ROBOTS-->", '<meta name="robots" content="noindex, nofollow">' if name == "test" else "", 1)
    if name == "test":   # noindex page: no canonical, so the signals don't conflict
        out_page = out_page.replace('<link rel="canonical" href="https://signpostingsomerset.org.uk/main/">\n', "", 1)
    out = HERE / "github" / name
    out.mkdir(parents=True, exist_ok=True)
    (out / "index.html").write_text(out_page, encoding="utf-8")
    print(f"github/{name}/index.html", f"({len(out_page) // 1024} KB, Assist relay: {worker_url or 'NOT SET'})")
