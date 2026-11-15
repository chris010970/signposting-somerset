"""Stitch the shared code in build/core/ into a page.

A page template marks where each piece goes with a line such as /*@core:js/places.js*/ (in CSS and scripts)
or <!--@core:html/crisis.html--> (in HTML);
the line is replaced by the file's contents, exactly, so the built page is the same as if the code were written there.
"""
import re
from pathlib import Path

CORE = Path(__file__).resolve().parent.parent / "core"
_MARK = re.compile(r"(?:/\*@core:([\w./-]+)\*/|<!--@core:([\w./-]+)-->)\n")

def inline_core(text):
    def put(m):
        f = CORE / (m.group(1) or m.group(2))
        assert f.is_file(), f"core piece not found: {f}"
        return f.read_text(encoding="utf-8")
    return _MARK.sub(put, text)
