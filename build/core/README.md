# Core: code shared by the directory, the tools page and the Places pages

One copy of each shared piece. Assist's relay (`build/tools/assist/`) includes only the files marked **shared with the relay** below, so they hold just what it uses; anything only the pages need goes in the pages-only files beside them (a test fails if the built relay carries code it doesn't use: `build/tests/worker.test.mjs`). A page template marks where a piece goes with a marker such as
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
| `js/page-flow.js` | phones and short screens (a laptop zoomed in): the whole page scrolls instead of only the results (directory, Places pages) |
| `js/text.js` | card wording (`CARD_TEXT`, `isGroupType`) and `split`: **shared with Assist's relay** |
| `js/page-text.js` | the support types and their labels (`cap`), and page helpers (`esc`, `webUrl`, `currentTab`): pages only |
| `js/schedule.js` | schedule rules: next session, "1st Tue of month", term time, bank holidays: **shared with the relay** |
| `js/when.js` | the 3. When? windows (`windowFor`, `meetsIn`) and lists of sessions (`occurrences`): pages only |
| `js/places.js` | town centres (records without a postcode) and distances: **shared with the relay** |
| `js/where.js` | the map's county outline and the 2. Where? places: pages only |
| `js/records.js` | records as the pages use them (`shapeRecords`), and the grouped 1. Support for choices (`supportOptions`) |
| `js/sheet.js` | reading the published Google Sheet's CSV (`recordsFromCSV`): **shared with the relay** |
| `js/sheet-load.js` | fetching the records in the browser (`fetchRecords()`), kept for the visit: pages only |
| `js/kinds.js` | kinds of service and their colours |
| `js/map-tiles.js` | the map background (CARTO tiles and their credit) for every map |
| `css/pins.css`, `js/map-pins.js` | map pins, numbered spots and area circles (directory map and Analytics map) |
| `js/cards.js` | copy details, tap-to-call, directions |
| `js/service-card.js` | the card for a service with a place: the In person tab and the Places pages |
| `js/places-view.js`, `css/places-content.css` | the Places listings (filter boxes, sections, cards, switching town): the directory's Places tab and the standalone Places pages |
| `data/where.json` | the 2. Where? places and their centre points |
| `data/support-types.json` | the support types, their three groups and their labels (pages, Places build, tests) |
| `data/kinds.json` | kinds of service and their colours (map pins, map key, cards) |
| `data/card-text.json` | card wording: the access badges ("Just turn up"…), also used in Copy details |
| `data/bank-holidays.json` | bank holiday dates. **Add the next year's** before they run out (the tests warn six months ahead) |

Data files are read by the pages and by the Places build (Python) alike, so wording and colours are set once.

Used by: `build/directory/template.html` (the directory), `build/tools/template.html` (the tools page) and the Places pages
(`build/places/build_places.py`: the styles, crisis and helpline bars, the data files, and the card, schedule and copy code).
The schedule rules and the sheet clean-up are tested in `build/tests/schedule.test.mjs`.
