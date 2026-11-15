# Core: code shared by the directory and the tools pages

One copy of each shared piece. A page template marks where a piece goes with a line such as
`/*@core:js/places.js*/` (inside a `<style>` or `<script>`) or `<!--@core:html/crisis.html-->` (in the HTML),
and the build replaces that line with the file, exactly (`build/shared/core.py`). The built page is the same as if the
code were written in the template.

| File | What it is |
|---|---|
| `css/base.css` | colours and fonts (CSS variables), page basics |
| `css/crisis.css`, `html/crisis.html` | the crisis bar and Quick exit |
| `css/header.css` | the header: title, tagline, watercolour strip |
| `css/cards.css` | service cards: badges, chips, kind tag, details, footer line |
| `css/helpline.css`, `html/helpline.html` | the 24/7 helpline bar at the bottom |
| `js/places.js` | town centres (records without a postcode), county outline, the "Where?" places |
| `js/text-time.js` | support-type vocabularies and labels, text helpers, schedule logic (next session, "Nth day of month", check dates), distances |
| `js/kinds.js` | kinds of service and their colours |
| `js/cards.js` | copy details, tap-to-call, directions |
| `js/sheet.js` | reading records from the published Google Sheet (CSV) |

Used by: `build/directory/template.html` (the directory) and, for the town pages' styles, `build/browse/build_browse.py`.
Next: the tools page (Assist, then insights) built from the same pieces.
