# Core: code shared by the directory, the tools page and the Places pages

One copy of each shared piece. A page template marks where a piece goes with a marker such as
`/*@core:js/schedule.js*/` (inside a `<style>` or `<script>`) or `<!--@core:html/crisis.html-->` (in the HTML),
and the build replaces it with the file, exactly (`build/shared/core.py`). The built page is the same as if the
code were written in the template. A page's own files are put in the same way with `@page:` (e.g. `/*@page:js/map.js*/`
in `build/directory/template.html` is `build/directory/js/map.js`).

| File | What it is |
|---|---|
| `html/head.html` | icons and web fonts for the page's head |
| `css/base.css` | colours and fonts (CSS variables), page basics |
| `css/crisis.css`, `html/crisis.html` | the crisis bar and Quick exit |
| `css/header.css`, `html/brand.html` | the header: title, tagline, watercolour strip |
| `css/page.css` | page frame, the filter boxes (1. Support for, 2. Where?), the tab row, the About page |
| `css/cards.css` | service cards: badges, chips, kind tag, details, footer line |
| `css/helpline.css`, `html/helpline.html`, `js/helpline-height.js` | the 24/7 helpline bar at the bottom (and keeping content clear of it) |
| `js/text.js` | the support types and their labels, and text helpers (`esc`, `split`, `webUrl`) |
| `js/schedule.js` | schedule rules: next session, "1st Tue of month", the 3. When? windows, bank holidays |
| `js/places.js` | town centres (records without a postcode), county outline, the 2. Where? places, distances |
| `js/records.js` | records as the pages use them (`shapeRecords`), and the grouped 1. Support for choices (`supportOptions`) |
| `js/sheet.js` | reading the records from the published Google Sheet (`fetchRecords()`), kept for the visit |
| `js/kinds.js` | kinds of service and their colours |
| `js/map-tiles.js` | the map background (CARTO tiles and their credit) for every map |
| `css/pins.css`, `js/map-pins.js` | map pins, numbered spots and area circles (directory map and Analytics map) |
| `js/cards.js` | copy details, tap-to-call, directions |
| `data/where.json` | the 2. Where? places and their centre points |
| `data/bank-holidays.json` | bank holiday dates. **Add the next year's** before they run out (the tests warn six months ahead) |

Used by: `build/directory/template.html` (the directory), `build/tools/template.html` (the tools page) and the Places pages
(`build/places/build_places.py`: the styles, crisis and helpline bars, and `js/text.js` + `js/schedule.js` for next sessions and 3. When?).
The schedule rules and the sheet clean-up are tested in `build/tests/schedule.test.mjs`.
