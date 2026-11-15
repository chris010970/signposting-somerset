"""Make the directory's two published copies from github/index.html: live and test.

Run build.py first (it makes github/index.html), then: python build_v2.py
(or run build_all.py, which does both).
Writes github/directory/index.html (the live site, published at /directory/) and github/test/directory/index.html (the test copy, published at /test/directory/).
Assist is on the tools page now (build/tools/); the directory links to it ("Tools →").
"""
import pathlib, re, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "shared"))
from site_config import rebase, BASE

HERE = pathlib.Path(__file__).parent
js_built = (HERE / "github" / "index.html").read_text(encoding="utf-8")
LIVE = "https://signpostingsomerset.org.uk"
import datetime, zoneinfo
STAMP = datetime.datetime.now(zoneinfo.ZoneInfo("Europe/London")).strftime("%Y-%m-%d %H:%M")
import sys
TARGETS = (("directory", "Signposting Somerset"), ("test", "Signposting Somerset (test)"))
if "test" in sys.argv[1:]: TARGETS = TARGETS[1:]   # python build_v2.py test : only the test copy
for name, title in TARGETS:
    out_page = js_built.replace("/*SITE_URL*/", LIVE).replace("/*SITE_VERSION*/", f"{name} {STAMP}")
    tools = "/test/tools/" if name == "test" else "/tools/"   # the tools page beside this copy
    out_page = out_page.replace('href="/tools/"', f'href="{tools}"').replace("/*TOOLS_URL*/", BASE + tools)
    out_page = out_page.replace("<title>Signposting Somerset</title>", f"<title>{title}</title>", 1)
    # keep the test copy out of search engines
    out_page = out_page.replace("<!--ROBOTS-->", '<meta name="robots" content="noindex, nofollow">' if name == "test" else "", 1)
    if name == "test":   # noindex page: no canonical, so the signals don't conflict
        out_page = out_page.replace('<link rel="canonical" href="https://signpostingsomerset.org.uk/directory/">\n', "", 1)
    out = HERE / "github" / ("test/directory" if name == "test" else name)
    out.mkdir(parents=True, exist_ok=True)
    (out / "index.html").write_text(rebase(out_page), encoding="utf-8")
    print(f"{out.relative_to(HERE)}/index.html", f"({len(out_page) // 1024} KB)")
