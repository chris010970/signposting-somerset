"""Stitch shared pieces into a page.

A template marks where a piece goes with a marker such as /*@core:js/schedule.js*/ (in CSS and scripts) or
<!--@core:html/crisis.html--> (in HTML). The marker is replaced by the file's contents, exactly, so the built page is the
same as if the code were written there.

  @core:<path>   a file in build/core/ (code shared by the directory, the tools page and the Places pages)
  @page:<path>   a file beside the template (the page's own code, kept in separate files so each stays readable)

Files under data/ are JSON: they are put in without their final newline, so they can sit inside a line of code,
e.g. const BANK = new Set(/*@core:data/bank-holidays.json*/);
"""
import re
from pathlib import Path

CORE = Path(__file__).resolve().parent.parent / "core"
_MARK = re.compile(r"(?:/\*@(core|page):([\w./-]+)\*/|<!--@(core|page):([\w./-]+)-->)(\n?)")

def inline_core(text, page_dir=None):
    """text with every @core: (and, given the template's folder, @page:) marker replaced by its file."""
    def put(m):
        kind, name = m.group(1) or m.group(3), m.group(2) or m.group(4)
        assert kind == "core" or page_dir, f"@page: marker ({name}) but no page folder given"
        f = (CORE if kind == "core" else Path(page_dir)) / name
        assert f.is_file(), f"piece not found: {f}"
        body = f.read_text(encoding="utf-8")
        if name.startswith("data/"):
            return body.rstrip("\n") + m.group(5)
        return body
    for _ in range(5):   # pieces can hold markers of their own (schedule.js holds data/bank-holidays.json)
        text, n = _MARK.subn(put, text)
        if not n: return text
    raise AssertionError("markers nested too deeply (does a piece include itself?)")
