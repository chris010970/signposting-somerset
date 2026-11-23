"""Does the monitor (src/monitor.py) notice changes? Known alterations to a saved listing page, checked with no network.

Each test takes the same page, changes one thing the way a provider might (a time, the venue, a suspension notice,
next week's dates), tidies it exactly as the monitor does, and checks what the monitor reports for the record's quotes.
Run with the other build tests: python build/tests/run_tests.py
"""
import sys, unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))
import monitor                                            # noqa: E402
from detect import tidy, whole_page                       # noqa: E402

URL = "https://example.org/activities"
PAGE = """<html><body><nav>Home | About | Contact</nav><main>
<h2>Activities and groups</h2>
<p>Pilates - Monday - 14:30 - 15:30 - from £6.50</p>
<p>Coffee & Cake Club - Every Wednesday from 9am - 11am. Suggested donation of £2.00.</p>
<p>Upcoming dates: Monday 23 Nov 14:30, Monday 30 Nov 14:30</p>
<p>Address Henhayes Centre, South Street Car Park, Crewkerne, TA18 8DA</p>
</main><footer>Phone 01460 74340</footer></body></html>"""

RECIPES = [  # what check_sources.py saves when it verifies two records on that page
    {"record_id": "R0404", "name": "Pilates", "field": "days", "value": "Mon", "quote": "Pilates - Monday - 14:30 - 15:30"},
    {"record_id": "R0404", "name": "Pilates", "field": "times", "value": "14:30-15:30", "quote": "Pilates - Monday - 14:30 - 15:30"},
    {"record_id": "R0404", "name": "Pilates", "field": "address", "value": "Henhayes Centre",
     "quote": "Henhayes Centre, South Street Car Park, Crewkerne, TA18 8DA"},
    {"record_id": "R0416", "name": "Coffee & Cake Club", "field": "times", "value": "09:00-11:00", "quote": "Every Wednesday from 9am - 11am"},
    {"record_id": "R0416", "name": "Coffee & Cake Club", "field": "phone", "value": "01460 74340", "quote": "Phone 01460 74340"},
]
RECORDS = {"R0404": {"name": "Pilates", "eligibility": ""}, "R0416": {"name": "Coffee & Cake Club", "eligibility": ""}}


def check(html):
    """{(record, field): status} and the status alerts, as the monitor works them out for this page."""
    main, whole = monitor.plain(tidy(html, URL)), monitor.plain(whole_page(html))
    lines = {URL: [monitor.plain(l) for l in tidy(html, URL).split("\n") if l.strip()]}
    out = [{**r, "source_url": URL, "status": monitor.classify(r["quote"], main, whole, r["field"], r["value"])} for r in RECIPES]
    alerts = monitor.status_alerts([r for r in out if r["status"].startswith("found")], {URL: (main, whole, "")}, RECORDS, lines)
    return {(r["record_id"], r["field"]): r["status"] for r in out}, alerts


class MonitorNotices(unittest.TestCase):
    def test_unchanged_page_is_fine(self):
        got, alerts = check(PAGE)
        self.assertTrue(all(s.startswith("found") for s in got.values()), got)
        self.assertEqual(alerts, {})

    def test_footer_detail_still_counts(self):
        got, _ = check(PAGE)
        self.assertEqual(got[("R0416", "phone")], "found, footer")

    def test_changed_time_is_caught(self):
        got, _ = check(PAGE.replace("14:30 - 15:30", "15:00 - 16:00"))
        self.assertEqual(got[("R0404", "times")], "missing")

    def test_changed_day_is_caught(self):
        got, _ = check(PAGE.replace("Pilates - Monday", "Pilates - Tuesday"))
        self.assertEqual(got[("R0404", "days")], "missing")

    def test_moved_venue_is_caught(self):
        got, _ = check(PAGE.replace("Henhayes Centre, South Street Car Park", "Victoria Hall, Market Street"))
        self.assertEqual(got[("R0404", "address")], "missing")

    def test_removed_group_is_caught(self):
        got, _ = check(PAGE.replace("<p>Coffee & Cake Club - Every Wednesday from 9am - 11am. Suggested donation of £2.00.</p>", ""))
        self.assertEqual(got[("R0416", "times")], "missing")

    def test_suspension_next_to_unchanged_details_is_caught(self):
        _, alerts = check(PAGE.replace("from £6.50</p>", "from £6.50. Currently suspended until further notice.</p>"))
        self.assertIn("suspended", alerts.get("R0404", []))

    def test_full_group_is_caught(self):
        _, alerts = check(PAGE.replace("donation of £2.00.", "donation of £2.00. This group is currently full."))
        self.assertIn("currently full", alerts.get("R0416", []))

    def test_known_status_is_not_flagged_again(self):
        records = {**RECORDS, "R0416": {"name": "Coffee & Cake Club", "eligibility": "Currently full: referrals paused"}}
        page = PAGE.replace("donation of £2.00.", "donation of £2.00. This group is currently full.")
        main, whole = monitor.plain(tidy(page, URL)), monitor.plain(whole_page(page))
        recs = [{**r, "source_url": URL} for r in RECIPES]
        self.assertNotIn("R0416", monitor.status_alerts(recs, {URL: (main, whole, "")}, records))

    def test_neighbours_notice_is_not_put_on_this_group(self):
        _, alerts = check(PAGE.replace("donation of £2.00.", "donation of £2.00. This group is currently full."))
        self.assertNotIn("R0404", alerts)

    def test_suspension_heading_on_the_line_after_is_caught(self):
        _, alerts = check(PAGE.replace("from £6.50</p>", "from £6.50</p><p>Suspended over Christmas.</p>"))
        self.assertIn("suspended", alerts.get("R0404", []))

    def test_next_weeks_dates_are_not_a_change(self):
        got, _ = check(PAGE.replace("Monday 23 Nov 14:30, Monday 30 Nov 14:30", "Monday 7 Dec 14:30, Monday 14 Dec 14:30"))
        self.assertTrue(got[("R0404", "days")].startswith("found"))


class TimetableRows(unittest.TestCase):
    def test_short_quote_in_several_rows_uses_this_records_row(self):
        rows = ["Town: Frome · Class: Mature Movers · Venue: Medical Practice · When: Fridays at 10am · Status: Accepting new members",
                "Town: Queen Camel · Class: Tai Chi *CURRENTLY SUSPENDED · Venue: Village Hall · When: Fridays at 10am · Status: Currently full"]
        text = monitor.plain("\n".join(rows))
        recs = [{"record_id": "R0178", "source_url": URL, "quote": "When: Fridays at 10am"},
                {"record_id": "R0178", "source_url": URL, "quote": "Venue: Medical Practice"}]
        lines = {URL: [monitor.plain(l) for l in rows]}
        self.assertEqual(monitor.status_alerts(recs, {URL: (text, text, "")}, {"R0178": {}}, lines), {})

    def test_full_row_is_flagged(self):
        rows = ["Town: Wells · Class: Movement to Music · Venue: Town Hall · When: Tuesdays, 10.00am · Status: Currently full, please contact us"]
        text = monitor.plain(rows[0])
        recs = [{"record_id": "R0180", "source_url": URL, "quote": "Venue: Town Hall"}]
        got = monitor.status_alerts(recs, {URL: (text, text, "")}, {"R0180": {}}, {URL: [text]})
        self.assertIn("currently full", got.get("R0180", []))


    def test_spreadsheet_cell_over_two_lines_stays_in_its_row(self):
        from detect import csv_text
        raw = ('Town,Class,Venue,When,Status\n'
               'Castle Cary,Functional Fitness,"Caryford Hall, Maggs Lane\nBA7 7JJ",Tuesdays at 11:30am,Accepting new members\n'
               'Chard,Strong and Steady *CURRENTLY SUSPENDED,*,Tuesdays at 11:30am,No drop ins\n')
        text = csv_text(raw)
        self.assertEqual(len(text.split("\n")), 2)
        main = monitor.plain(text)
        recs = [{"record_id": "R0190", "source_url": URL, "quote": q} for q in ("Caryford Hall, Maggs Lane", "When: Tuesdays at 11:30am")]
        lines = {URL: [monitor.plain(l) for l in text.split("\n")]}
        self.assertEqual(monitor.status_alerts(recs, {URL: (main, main, "")}, {"R0190": {}}, lines), {})


class ContactLinks(unittest.TestCase):
    def test_hidden_and_linked_emails_count(self):
        html = ('<main><p>Contact us</p></main><footer><a href="mailto:info@example.org">Email</a>'
                '<a class="__cf_email__" data-cfemail="0c7e636e696b6d4c69746d617c6069226375">[email protected]</a></footer>')
        whole = monitor.plain(whole_page(html))
        self.assertIn("info@example.org", whole)
        self.assertEqual(monitor.classify("info@example.org", monitor.plain(tidy(html, URL)), whole, "email", ""), "found, footer")


class OtherKindsOfSource(unittest.TestCase):
    """Session listings with dates (Balsam), published spreadsheets (Age UK), PDF listings (Somerset Carers)."""

    def sessions(self, html, quote, field, value):
        main, whole = monitor.plain(tidy(html, URL)), monitor.plain(whole_page(html))
        return monitor.classify(quote, main, whole, field, value)

    LISTING = "<main><p>Monday 23 Nov 14:00</p><p>Friday 27 Nov 13:00</p></main>"
    QUOTE = "Monday 23 Nov 14:00 Friday 27 Nov 13:00"   # one quote covering two sessions, each its own record

    def test_dated_listing_reads_the_same_next_week(self):
        nxt = "<main><p>Monday 30 Nov 14:00</p><p>Friday 4 Dec 13:00</p></main>"
        self.assertEqual(self.sessions(nxt, self.QUOTE, "days", "Mon"), "found")

    def test_other_session_moving_is_not_this_ones_change(self):
        moved = self.LISTING.replace("Friday 27 Nov 13:00", "Thursday 26 Nov 13:00")
        self.assertEqual(self.sessions(moved, self.QUOTE, "days", "Mon"), "found")
        self.assertEqual(self.sessions(moved, self.QUOTE, "days", "Fri"), "missing")

    def test_spreadsheet_row_change_is_caught(self):
        rows = "Class: Tai Chi · Venue: Village Hall · Day: Monday · Time: 10:00\nClass: Yoga · Venue: Church Hall · Day: Tuesday · Time: 11:00"
        q = "Class: Tai Chi · Venue: Village Hall · Day: Monday · Time: 10:00"
        self.assertEqual(monitor.classify(q, monitor.plain(rows), monitor.plain(rows), "address", "Village Hall"), "found")
        changed = monitor.plain(rows.replace("Village Hall", "Scout Hut"))
        self.assertEqual(monitor.classify(q, changed, changed, "address", "Village Hall"), "missing")

    def test_pdf_text_time_change_is_caught(self):
        pdf = monitor.plain("Street The Crispin Centre BA16 0HP 2nd Monday of the month 10.30am to 12.00 noon Glastonbury Care Home")
        self.assertEqual(monitor.classify("10.30am to 12.00 noon", pdf, pdf, "times", "10:30-12:00"), "found")
        moved = pdf.replace("10.30am to 12.00 noon", "1pm to 2.30pm")
        self.assertEqual(monitor.classify("10.30am to 12.00 noon", moved, moved, "times", "10:30-12:00"), "missing")

    def test_shared_wording_counts_as_found(self):
        page = monitor.plain("Yoga from £3 Pilates from £3")
        self.assertEqual(monitor.classify("from £3", page, page, "cost", "£3"), "found, shared")


@unittest.skipUnless(__import__("importlib").util.find_spec("requests"), "needs requests")
class CheckerSavesThePagesWording(unittest.TestCase):
    """check_sources.py saves quotes in the page's own wording, so the monitor can find them later."""

    def setUp(self):
        import check_sources
        self.cs = check_sources
        self.cs._pages["t"] = {"ok": True, "text": "PhysioFit - Monday 10:00am - 11:00am / Thursday 10:30am - 11:30am. "
                                                   "Phone: 03000 120 120 or email hubs@example.org"}

    def test_phone_spaced_differently(self):
        self.assertEqual(self.cs.phone_on_page("03000 120120", "t"), "03000 120 120")
        self.assertTrue(self.cs.on_page("03000 120120", "t"))
        self.assertEqual(self.cs.phone_on_page("01963 31842", "t"), "")

    def test_times_in_the_pages_own_words(self):
        self.assertEqual(self.cs.times_on_page("10:30-11:30", "t"), "thursday 10:30am - 11:30am")
        self.assertEqual(self.cs.times_on_page("10:00-11:00", "t"), "monday 10:00am - 11:00am")
        self.assertEqual(self.cs.times_on_page("12:00-13:00", "t"), "")


IMG = ("https://images.squarespace-cdn.com/content/v1/694fc93540963e6d6090eecc/"
       "27f5b2a2-54e8-41cc-9d98-4e2590f12bde/What%27s+On+Aug+26.jpg?format=1500w")


class TimetableImages(unittest.TestCase):
    """A timetable that is only a picture (Chard Community Hub's What's On): the checker's AI reads it; the monitor
    watches that the page still shows the same picture."""

    def test_same_image_on_the_page_is_found(self):
        import detect
        html = '<img data-src="https://images.squarespace-cdn.com/content/v1/694fc93540963e6d6090eecc/' \
               '27f5b2a2-54e8-41cc-9d98-4e2590f12bde/What%27s+On+Aug+26.jpg" alt="">'
        self.assertTrue(detect.is_image(IMG))
        self.assertTrue(detect.image_on_page(IMG, html))

    def test_new_timetable_image_is_noticed(self):
        import detect
        html = '<img data-src="https://images.squarespace-cdn.com/content/v1/694fc93540963e6d6090eecc/' \
               '9b1c0e44-1111-4222-8333-944455556666/What%27s+On+Dec+26.jpg" alt="">'
        self.assertFalse(detect.image_on_page(IMG, html))

    def test_image_found_by_file_name_when_no_long_folder(self):
        import detect
        url = "https://example.org/files/timetable-nov.png"
        self.assertTrue(detect.image_on_page(url, '<img src="/files/timetable-nov.png">'))
        self.assertFalse(detect.image_on_page(url, '<img src="/files/timetable-dec.png">'))

    @unittest.skipUnless(__import__("importlib").util.find_spec("requests"), "needs requests")
    def test_checker_reads_an_image_source_with_the_ai(self):
        import check_sources as cs
        self.assertEqual(cs.data_url({"where_to_look": f"{IMG} (shown on https://example.org/whatson)"}), IMG)

        class Resp:                                   # what requests.get returns for the picture
            status_code, url, content = 200, IMG, b"\xff\xd8 picture"
            headers = {"content-type": "image/jpeg"}
        old_get, old_read, old_client, old_sleep = cs.requests.get, cs.read_image, cs._client, cs.time.sleep
        try:
            cs.requests.get = lambda *a, **k: Resp()
            cs.read_image = lambda content, mt: "MONDAY\nCommunity Café 10am - 12pm"
            cs._client, cs.time.sleep = object(), lambda s: None
            cs._pages.pop(IMG, None)
            page = cs.fetch(IMG)
        finally:
            cs.requests.get, cs.read_image, cs._client, cs.time.sleep = old_get, old_read, old_client, old_sleep
        self.assertEqual(page["status"], "ok (image)")
        self.assertIn("Community Café 10am - 12pm", page["text"])
        self.assertTrue(page["ok"] or len(page["text"]) <= 50)


@unittest.skipUnless(__import__("importlib").util.find_spec("requests"), "needs requests")
class CheckerMatchesRecords(unittest.TestCase):
    """Records the checker missed in batch 8, though their entries were on the page."""

    def svc(self, name, provider, town, **f):
        return {"name": name, "provider": provider, "town": town, "fields": {k: {"value": v, "quote": v} for k, v in f.items()}}

    def test_accented_name_matches(self):
        import check_sources as cs
        rec = {"name": "Portway Annexe Community Café", "provider": "Health Connections Mendip / The Portway Annexe",
               "town": "Wells", "days": "Fri", "times": "10:00-12:00"}
        s = self.svc("Talking Cafe - Wells (Portway Annexe)", "Health Connections Mendip", "Wells", days="Fri", times="10:00-12:00")
        self.assertIs(cs.best_match(rec, [s]), s)

    def test_day_written_differently_in_names_matches(self):
        import check_sources as cs
        rec = {"name": "Bereavement Support Keynsham (Wed)", "provider": "Bereavement Support Keynsham", "town": "Keynsham",
               "days": "Wed", "times": "17:30-19:00"}
        mon = self.svc("Bereavement Support Keynsham – fourth Monday drop-in", "Bereavement Support Keynsham", "Keynsham", days="Mon", times="14:00-16:00")
        wed = self.svc("Bereavement Support Keynsham – first Wednesday drop-in", "Bereavement Support Keynsham", "Keynsham", days="Wed", times="17:30-19:00")
        self.assertIs(cs.best_match(rec, [mon, wed]), wed)

    def test_days_still_read_from_wording(self):
        import check_sources as cs                     # a name clash once broke this for a whole batch
        self.assertEqual(cs.days_in("every tuesday 10am - 12pm"), {"tue"})
        self.assertEqual(cs.days_in("mondays and thursdays"), {"mon", "thu"})

    def test_different_meeting_same_town_still_rejected(self):
        import check_sources as cs
        rec = {"name": "Alcoholics Anonymous: Weston-super-Mare Came To Believe", "provider": "Alcoholics Anonymous",
               "town": "Weston-super-Mare", "days": "Tue"}
        s = self.svc("Weston-super-Mare Safe Harbour", "Alcoholics Anonymous", "Weston-super-Mare", days="Tue")
        self.assertIsNone(cs.best_match(rec, [s]))



class ToolAnswersAsText(unittest.TestCase):
    """The AI sometimes sends a tool answer's details as JSON text instead of an object (batch19: 29 records lost
    as "the answer had no service details")."""
    def setUp(self):
        import check_sources
        self.cs = check_sources

    def test_service_sent_as_text_is_read(self):
        got = self.cs.as_service('{"name": "Dance 4 Parkinson\'s", "fields": {"days": {"value": "Thu"}}}')
        self.assertIsInstance(got, dict)
        self.assertEqual(got["fields"]["days"]["value"], "Thu")

    def test_fenced_text_and_objects(self):
        self.assertIsInstance(self.cs.as_service('```json\n{"name": "x"}\n```'), dict)
        self.assertEqual(self.cs.as_service({"name": "x"}), {"name": "x"})
        self.assertEqual(self.cs.as_service("not json"), "not json")

    def test_unstring_tool_input(self):
        got = self.cs.unstring({"found": True, "service": '{"name": "x"}', "services": '[{"name": "y"}]', "notes": "fine"})
        self.assertEqual(got["service"], {"name": "x"})
        self.assertEqual(got["services"], [{"name": "y"}])
        self.assertEqual(got["notes"], "fine")

if __name__ == "__main__":
    unittest.main()


class MonitorRunFixes(unittest.TestCase):
    """False alarms from the first full run (23/11/2026), each kept from coming back."""

    def test_wix_image_found_by_its_file_id(self):
        import detect
        url = ("https://static.wixstatic.com/media/9220ea_418cb23c89f5427c8c9c8fdf6ad3d3a7~mv2.png/v1/fill/"
               "w_846,h_1200,al_c,q_90/Flyer.png")
        self.assertEqual(detect.image_key(url), "9220ea_418cb23c89f5427c8c9c8fdf6ad3d3a7~mv2.png")
        page = '<img src="https://static.wixstatic.com/media/9220ea_418cb23c89f5427c8c9c8fdf6ad3d3a7~mv2.png/v1/fill/w_420,h_600/Flyer.png">'
        self.assertTrue(detect.image_on_page(url, page))

    def test_wix_image_page_found_although_its_link_has_commas(self):
        import detect
        url = ("https://static.wixstatic.com/media/9220ea_418cb23c89f5427c8c9c8fdf6ad3d3a7~mv2.png/v1/fill/"
               "w_846,h_1200,al_c,q_90,usm_0.66_1.00_0.01,enc_avif,quality_auto/Blue%20Green%20Red%20Music%20Icons%20Open%20Mic%20Night%20Flyer.png")
        self.assertEqual(detect.image_page(url), "https://www.stmarysbridgwater.org/about-5-1")

    def test_quote_with_a_gap_is_found_part_by_part(self):
        main = monitor.plain("For more information please contact the Health Walks Team on: walks@sasp.co.uk 01823 653990")
        q = "please contact the Health Walks Team on: ... walks@sasp.co.uk 01823 653990"
        self.assertEqual(monitor.classify(q, main, main, "phone", "01823 653990"), "found")
        self.assertEqual(monitor.classify(q, main.replace("653990", "653999"), main.replace("653990", "653999"), "phone"), "missing")

    def test_contact_link_marker_means_the_address(self):
        html = '<html><body><main><p>Workshops</p></main><footer><a href="mailto:hello@acearts.co.uk">Email us</a></footer></body></html>'
        main, whole = monitor.plain(tidy(html, URL)), monitor.plain(whole_page(html))
        self.assertTrue(monitor.classify("Contact links on page: hello@acearts.co.uk", main, whole, "email").startswith("found"))

    def test_page_wide_notice_by_a_shared_contact_line_is_not_put_on_every_walk(self):
        text = ("Westhay Thursday Fortnightly 10am for 10.15 start\nwalks@sasp.co.uk\n"
                "Street Monday 2pm start\nwalks@sasp.co.uk\n"
                "Walks may be cancelled due to leader availability or adverse weather. walks@sasp.co.uk")
        main = monitor.plain(text)
        lines = {URL: [monitor.plain(l) for l in text.split("\n")]}
        recs = [{"record_id": "R0233", "source_url": URL, "quote": "Thursday Fortnightly 10am for 10.15 start"},
                {"record_id": "R0233", "source_url": URL, "quote": "walks@sasp.co.uk"}]
        self.assertNotIn("R0233", monitor.status_alerts(recs, {URL: (main, main, "")}, {}, lines))
        cancelled = text.replace("10.15 start\n", "10.15 start - cancelled\n", 1)
        main2 = monitor.plain(cancelled)
        lines2 = {URL: [monitor.plain(l) for l in cancelled.split("\n")]}
        self.assertIn("cancelled", monitor.status_alerts(recs, {URL: (main2, main2, "")}, {}, lines2).get("R0233", []))

    def test_general_cancel_notice_is_ignored(self):
        # R0254: the SASP PDF's standing notice sits near the Ilminster evening walk, with no line breaks
        text = ("Ilminster Thursday 6.30pm Summer months only March to October Ilminster Evening Health Walk "
                "Somerset Health Walks may be cancelled due to Health Walk Leader availability or adverse weather.")
        main = monitor.plain(text)
        recs = [{"record_id": "R0254", "source_url": URL, "quote": "Ilminster Thursday 6.30pm"}]
        self.assertEqual(monitor.status_alerts(recs, {URL: (main, main, "")}, {}), {})
        real = text + " Ilminster evening walk cancelled."
        m2 = monitor.plain(real)
        self.assertIn("cancelled", monitor.status_alerts(recs, {URL: (m2, m2, "")}, {}).get("R0254", []))

    def test_facebook_page_goes_to_check_by_hand(self):
        out = [{"record_id": "R0747", "name": "The Monday Club", "field": "days", "quote": "Monday",
                "source_url": "https://www.facebook.com/langportdementiaalliance/", "status": "can't read"}]
        md = monitor.report(out, [Path("evidence.csv")], "verified/services.csv", "x", {}, {})
        need = md.split("## Check by hand")[0]
        self.assertNotIn("R0747", need)
        self.assertIn("R0747", md.split("## Check by hand")[1])

    def test_next_spreadsheet_row_is_another_groups(self):
        url = "https://docs.google.com/spreadsheets/d/e/x/pub?gid=0&single=true&output=csv"
        rows = ["castle cary functional fitness caryford community hall a mix of seated exercise tuesdays at 11:30am £6.00 accepting new members",
                "chard strong and steady *currently suspended * to improve strength and balance marion £6.00 no drop ins"]
        main = " ".join(rows)
        recs = [{"record_id": "R0190", "source_url": url, "quote": "caryford community hall"}]
        self.assertNotIn("R0190", monitor.status_alerts(recs, {url: (main, main, "")}, {}, {url: rows}))
        rows[0] += " currently suspended"
        main = " ".join(rows)
        self.assertIn("R0190", monitor.status_alerts(recs, {url: (main, main, "")}, {}, {url: rows}))


class CalendarFeeds(unittest.TestCase):
    """A provider's public calendar (Elim Church Wells' Community Connect, a Google Calendar): its .ics feed read as
    one line per regular session, so a change of day or time shows and next week's dates don't."""
    FEED = "\r\n".join([
        "BEGIN:VCALENDAR", "VERSION:2.0",
        "BEGIN:VEVENT", "DTSTART;TZID=Europe/London:20250106T100000", "DTEND;TZID=Europe/London:20250106T120000",
        "RRULE:FREQ=WEEKLY;BYDAY=MO", "SUMMARY:Breakfast Drop-in", "LOCATION:Elim Church\\, Wells", "END:VEVENT",
        "BEGIN:VEVENT", "DTSTART:20250108T140000Z", "DTEND:20250108T150000Z",
        "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=WE", "SUMMARY:Wellbeing Drop-in", "END:VEVENT",
        "BEGIN:VEVENT", "DTSTART;TZID=Europe/London:20250103T103000", "DTEND;TZID=Europe/London:20250103T120000",
        "RRULE:FREQ=MONTHLY;BYDAY=1FR", "SUMMARY:Coffee Morning", "END:VEVENT",
        "BEGIN:VEVENT", "DTSTART;TZID=Europe/London:20240101T100000", "RRULE:FREQ=WEEKLY;UNTIL=20240601T000000Z",
        "SUMMARY:Old group", "END:VEVENT",
        "BEGIN:VEVENT", "DTSTART;TZID=Europe/London:20261217T180000", "DTEND;TZID=Europe/London:20261217T190000",
        "SUMMARY:Carols", "END:VEVENT",
        "BEGIN:VEVENT", "DTSTART;TZID=Europe/London:20251201T100000", "SUMMARY:Last year's party", "END:VEVENT",
        "BEGIN:VEVENT", "DTSTART;TZID=Europe/London:20261130T100000", "RECURRENCE-ID;TZID=Europe/London:20261130T100000",
        "SUMMARY:Breakfast Drop-in (moved)", "END:VEVENT",
        "END:VCALENDAR", ""])
    TODAY = __import__("datetime").date(2026, 11, 23)

    def text(self, feed=None):
        from calendar_feed import ics_text
        return ics_text(feed or self.FEED, today=self.TODAY)

    def test_regular_sessions_with_their_repeat_rule(self):
        t = self.text()
        self.assertIn("Breakfast Drop-in · Monday 10:00-12:00 · every week · Elim Church, Wells", t)
        self.assertIn("Wellbeing Drop-in · Wednesday 14:00-15:00 · every 2 weeks", t)   # UTC in winter = London
        self.assertIn("Coffee Morning · Friday 10:30-12:00 · 1st Friday of the month", t)

    def test_ended_series_past_events_and_moved_dates_left_out(self):
        t = self.text()
        self.assertNotIn("Old group", t)
        self.assertNotIn("Last year's party", t)
        self.assertNotIn("(moved)", t)
        self.assertIn("Carols · Thursday 17 December 2026 18:00-19:00", t)

    def test_time_change_in_the_calendar_is_caught(self):
        main = monitor.plain(self.text())
        q = "Breakfast Drop-in · Monday 10:00-12:00 · every week"
        self.assertEqual(monitor.classify(q, main, main, "times", "10:00-12:00"), "found")
        moved = monitor.plain(self.text(self.FEED.replace("T100000\r\nDTEND;TZID=Europe/London:20250106T120000",
                                                           "T103000\r\nDTEND;TZID=Europe/London:20250106T120000")))
        self.assertEqual(monitor.classify(q, moved, moved, "times", "10:00-12:00"), "missing")

    def test_feed_link_is_a_calendar(self):
        from calendar_feed import is_ics
        self.assertTrue(is_ics("https://calendar.google.com/calendar/ical/connectcentrewebcal%40gmail.com/public/basic.ics"))
        self.assertFalse(is_ics("https://www.connect-centre.org.uk/calendar"))


class HiddenOldContent(unittest.TestCase):
    """Citizens Advice Somerset keeps its 2023 session list in the page, hidden on every device: neither the checker
    nor the monitor should read it."""
    HTML = ('<html><body><main><div class="elementor-widget"><p>Taunton: Community access point: Monday and Thursday, 10am to 2pm</p></div>'
            '<div class="elementor-element elementor-hidden-desktop elementor-hidden-tablet elementor-hidden-mobile">'
            '<p>Taunton: Monday, Tuesday, Thursday, Friday 10am to 2pm</p></div></main></body></html>')

    def test_monitor_skips_it(self):
        self.assertNotIn("friday", monitor.plain(tidy(self.HTML, URL)))
        self.assertNotIn("friday", monitor.plain(whole_page(self.HTML)))
        self.assertIn("monday and thursday", monitor.plain(tidy(self.HTML, URL)))

    @unittest.skipUnless(__import__("importlib").util.find_spec("anthropic"), "needs the checker's packages")
    def test_checker_skips_it(self):
        import check_sources
        text, _ = check_sources.parse_html(self.HTML, URL)
        self.assertNotIn("Friday", text)
        self.assertIn("Monday and Thursday", text)
