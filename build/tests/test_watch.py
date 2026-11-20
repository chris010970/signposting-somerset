"""The page survey's matching (build/watch/survey.py): reading a page's visible text, and finding a record's details in it."""
import sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "watch"))
import survey as s

PAGE = """<html><head><script>var x = "Tuesday";</script><style>p{}</style></head><body>
<p>Every other Thursday (10.30 am &ndash; 12 pm), Townsend Road, Minehead TA24&nbsp;5RG.</p>
<p>Call 01458 251 541 or email Somerset@Alzheimers.org.uk</p></body></html>"""

class Survey(unittest.TestCase):
    def setUp(self): self.norm = s.normalise(s.page_text(PAGE))

    def test_visible_text_only(self):
        self.assertNotIn("tuesday", self.norm, "words inside scripts aren't part of the page")
        self.assertIn("ta24 5rg", self.norm, "non-breaking spaces become ordinary spaces")

    def test_finds_the_records_details(self):
        r = {"days": "Thu", "times": "10:30-12:00", "postcode": "TA24 5RG", "phone": "01458 251541", "email": "somerset@alzheimers.org.uk"}
        self.assertEqual(s.found_on_page(r, self.norm), {"postcode": True, "days": True, "time": True, "phone": True, "email": True})

    def test_a_different_session_is_not_found(self):
        f = s.found_on_page({"days": "Tue", "times": "14:00-15:00", "postcode": "TA24 5RG"}, self.norm)
        self.assertEqual(f, {"postcode": True, "days": False, "time": False})
        self.assertEqual(s.verdict({"kind": "page"}, f), "some details found")

    def test_how_pages_write_times_and_days(self):
        self.assertIn("2pm", s.time_forms("14:00")); self.assertIn("2.30 pm", s.time_forms("14:30")); self.assertIn("noon", s.time_forms("12:00"))
        self.assertEqual(s.day_words("Mon-Fri"), ["mon", "fri"]); self.assertEqual(s.day_words("Tue;Thu"), ["tue", "thu"])
        self.assertEqual(s.phone_numbers("0800 31 68 600 (freephone) or 01823 331 222"), ["08003168600", "01823331222"])

    def test_same_words_same_fingerprint(self):
        a = s.fingerprint(s.normalise(s.page_text("<p>Open  Tuesdays</p>")))
        self.assertEqual(a, s.fingerprint(s.normalise(s.page_text("<div>open\nTuesdays</div>"))))
        self.assertNotEqual(a, s.fingerprint(s.normalise(s.page_text("<p>Open Wednesdays</p>"))))

    def test_due_date_from_the_rule(self):
        self.assertEqual(s.due({"last_checked": "2026-11-19"}, {"recheck_every": "3 months"}), "2027-02-19")
        self.assertEqual(s.due({"last_checked": "2026-11-19"}, {"recheck_every": "each term"}), "", "not a number of months: no date")

    def test_rules_in_the_sources_file(self):
        rules = s.load_sources()
        self.assertTrue(rules, "src/sources.csv has rules")
        kinds = {r["kind"] for r in rules.values()}
        self.assertIn("manual", kinds, "rules done by hand (a PDF supplied by a person) are recognised")
        self.assertIn("web", kinds)
        self.assertEqual(s.rule_ids({"source": "mind-website ; https://example.org"}, rules), ["mind-website"])

if __name__ == "__main__":
    unittest.main()
