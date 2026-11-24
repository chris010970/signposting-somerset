"""Build the preview of the next design: /next/directory/, standalone from the live and test directories.

Usage: python build/next/build.py      (build_all.py runs it too)
Writes build/next/github/next/directory/index.html; copy it to docs/next/directory/index.html.

What's whose:
  build/next/template.html   the page itself (started as a copy of build/directory/template.html); change it freely
  build/next/next.css        the new design's styles, loaded after the directory's, so they win
  /*@next:...*/ markers      files from this folder; /*@page:...*/ still means build/directory/ (its scripts are
                             shared read-only), /*@core:...*/ build/core/

Kept out of search engines, no canonical link. The Places tab shows the test Places pages (/test/directory/places/),
since there are no Places pages for /next/ yet. Delete this folder, docs/next/ and its line in build_all.py when the
new design has gone live.
"""
import json, pathlib, re, sys

HERE = pathlib.Path(__file__).resolve().parent
DIRECTORY = HERE.parent / "directory"
sys.path.insert(0, str(HERE.parent / "shared"))
from core import inline_core
from page import LIVE, NOINDEX, STAMP, document, put
from site_config import BASE, SETTINGS, rebase

def own_files(text):
    """/*@next:name*/ and <!--@next:name--> markers: files from build/next/."""
    return re.sub(r"(?:/\*@next:([\w./-]+)\*/|<!--@next:([\w./-]+)-->)",
                  lambda m: (HERE / (m.group(1) or m.group(2))).read_text(encoding="utf-8"), text)

towns = json.loads((DIRECTORY / "towns.json").read_text(encoding="utf-8"))["TOWNS"]
sheet = (DIRECTORY / "sheet_url.txt").read_text().strip()
assert sheet, "build/directory/sheet_url.txt is empty"

page = inline_core(own_files((HERE / "template.html").read_text(encoding="utf-8")), DIRECTORY)
page = put(page, "/*LEAFLET_CSS*/", (DIRECTORY / "leaflet.css").read_text(encoding="utf-8"))
page = put(page, "/*TOWNS*/{}", json.dumps(towns, ensure_ascii=False))
page = put(page, "/*OUTLINE*/null", (DIRECTORY / "somerset-outline.json").read_text())
page = put(page, "/*SHEET_CSV_URL*/", sheet)
page = put(page, "/*SHEET_COPY_URL*/", BASE + SETTINGS["sheet_copy"])
page = put(page, "/*FEEDBACK_FORM_URL*/", SETTINGS.get("feedback_form_url", ""))
page = document(page)

page = put(page, "/*SITE_VERSION*/", f"next {STAMP}")
page = put(page, 'href="/tools/"', 'href="/test/tools/"')
page = put(page, "/*TOOLS_URL*/", BASE + "/test/tools/")
page = put(page, "<title>Signposting Somerset</title>", "<title>Signposting Somerset (next design)</title>")
page = put(page, "<!--ROBOTS-->", NOINDEX)
page = put(page, f'<link rel="canonical" href="{LIVE}/directory/">\n', "")
page = put(page, 'new URL("places/", location.href).pathname', json.dumps(BASE + "/test/directory/places/"))

out = HERE / "github" / "next" / "directory"
out.mkdir(parents=True, exist_ok=True)
(out / "index.html").write_text(rebase(page), encoding="utf-8")
print(f"{out.relative_to(HERE)}/index.html ({len(page) // 1024} KB)")
