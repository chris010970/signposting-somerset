# Core: code shared by the directory and the tools pages

One copy of each shared piece. A page template marks where a piece goes with a line such as
`/*@core:js/places.js*/` (inside a `<style>` or `<script>`) or `<!--@core:html/crisis.html-->` (in the HTML),
and the build replaces that line with the file, exactly (`build/shared/core.py`). The built page is the same as if the
code were written in the template.

| File | What it is |
|---|---|
| `html/head.html` | icons and web fonts for the page's head |
| `css/base.css` | colours and fonts (CSS variables), page basics |
| `css/crisis.css`, `html/crisis.html` | the crisis bar and Quick exit |
| `css/header.css`, `html/brand.html` | the header: title, tagline, watercolour strip |
| `css/page.css` | page frame, the filter boxes (1. Support for, 2. Where?), the tab row, the About page |
| `css/cards.css` | service cards: badges, chips, kind tag, details, footer line |
| `css/helpline.css`, `html/helpline.html`, `js/helpline-height.js` | the 24/7 helpline bar at the bottom (and keeping content clear of it) |
| `js/places.js` | town centres (records without a postcode), county outline, the "Where?" places |
| `js/text-time.js` | support-type vocabularies and labels, text helpers, schedule logic (next session, "Nth day of month", check dates), distances |
| `js/records.js` | records as the pages use them (`shapeRecords`), and the grouped "Support for" choices (`supportOptions`) |
| `css/pins.css`, `js/map-pins.js` | map pins, numbered spots and area circles (directory map and Analytics map) |
| `js/kinds.js` | kinds of service and their colours |
| `js/cards.js` | copy details, tap-to-call, directions |
| `js/sheet.js` | reading records from the published Google Sheet (CSV): `fetchRecords()` |

Used by: `build/directory/template.html` (the directory), `build/tools/template.html` (the tools page) and the Places pages (`build/places/build_places.py`: the styles, and `js/text-time.js` for next sessions and 3. When?).
