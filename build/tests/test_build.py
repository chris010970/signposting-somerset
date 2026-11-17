"""Tests for the builds: the records clean-up, the settings files, and stitching the pages together.

Run: python build/tests/run_tests.py (everything), or python -m unittest discover build/tests
"""
import json, re, sys, unittest
from pathlib import Path

BUILD = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BUILD / "shared"))
from core import inline_core
from page import put, section
from records import clean, fix_date, fix_time, web_url

load = lambda p: json.loads((BUILD / p).read_text(encoding="utf-8"))
# The support types the site knows (core/data/support-types.json)
VOCAB = {t for g in load("core/data/support-types.json")["groups"] for t in g["types"]}


class Records(unittest.TestCase):
    def test_cleanup_matches_the_pages(self):   # the same cases are checked against core/js/sheet.js in schedule.test.mjs
        cases = load("tests/cleanup-cases.json")
        for v, want in cases["dates"]: self.assertEqual(fix_date(v), want, v)
        for v, want in cases["times"]: self.assertEqual(fix_time(v), want, v)

    def test_clean_row(self):
        r = clean({" Name ": " A group ", "Dates": "17/12/2026", "times": "10:00:00-12:00:00", "last_checked": "1/11/2026", "": "x"})
        self.assertEqual(r, {"name": "A group", "dates": "2026-12-17", "times": "10:00-12:00", "last_checked": "2026-11-01"})

    def test_web_url(self):
        self.assertEqual(web_url("https://example.org"), "https://example.org")
        for bad in ("javascript:alert(1)", "www.example.org", "", None):
            self.assertEqual(web_url(bad), "")


class Settings(unittest.TestCase):
    def test_places_towns_have_centres(self):
        towns, places = load("directory/towns.json")["TOWNS"], load("places/towns.json")
        names = [t for a in places["areas"] for t in a["towns"]]
        self.assertEqual(sorted(set(names)), sorted(names), "a town is listed twice")
        for t in names + places.get("label_left", []):
            self.assertIn(t, towns, f"{t} has no centre in directory/towns.json")
        for t in places.get("label_left", []):
            self.assertIn(t, names, f"label_left: {t} has no Places page")

    def test_support_types_unique(self):   # also the Places sections (each its own page anchor)
        types = [t for g in load("core/data/support-types.json")["groups"] for t in g["types"]]
        self.assertEqual(len(types), len(set(types)), "a support type is in two groups")
        slugs = {re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-") for t in types}
        self.assertEqual(len(slugs), len(types), "two support types make the same Places section id")

    def test_analytics_types(self):   # the types Analytics maps (tools/analytics/types.json) are the sheet's own
        types = load("tools/analytics/types.json")["types"]
        self.assertTrue(types and set(types) <= VOCAB, f"not a support type: {set(types) - VOCAB}")
        self.assertEqual(len(types), len(set(types)))

    def test_where_places(self):
        for a in load("core/data/where.json")["areas"]:
            for name, lat, lon in a["places"]:
                self.assertTrue(50.5 < lat < 51.7 and -4.2 < lon < -1.9, f"{name} is outside the area")

    def test_site_settings(self):
        s = load("site.json")
        self.assertTrue(s["base_path"] == "" or re.fullmatch(r"/[\w-]+", s["base_path"]), "base_path: \"\" or /folder")
        self.assertTrue(not s.get("feedback_form_url") or web_url(s["feedback_form_url"]))


class Stitching(unittest.TestCase):
    def test_templates_stitch_completely(self):
        for t in ("directory/template.html", "tools/template.html"):
            page = inline_core((BUILD / t).read_text(encoding="utf-8"), (BUILD / t).parent)
            self.assertNotRegex(page, r"@(core|page):", t)

    def test_missing_piece_stops_the_build(self):
        with self.assertRaises(AssertionError): inline_core("/*@core:js/no-such-file.js*/\n")
        with self.assertRaises(AssertionError): inline_core("/*@page:x.js*/\n")   # no page folder given

    def test_data_files_fit_inside_a_line(self):
        out = inline_core("const B = (/*@core:data/bank-holidays.json*/).dates;")
        self.assertTrue(out.startswith("const B = ({") and out.endswith("}).dates;"))

    def test_put_and_section(self):
        self.assertEqual(put("a /*X*/ b", "/*X*/", "1"), "a 1 b")
        with self.assertRaises(AssertionError): put("a b", "/*X*/", "1")
        with self.assertRaises(AssertionError): put("/*X*/ /*X*/", "/*X*/", "1")
        self.assertEqual(section("<!--TAB-->\none\n<!--HDR-->\ntwo\n", "HDR"), "two\n")


if __name__ == "__main__":
    unittest.main()
