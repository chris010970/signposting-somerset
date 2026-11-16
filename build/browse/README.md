# Town pages (the directory's Places tab)

Plain pages by town, for people who prefer a simple list and for search engines: `/directory/places/` (choose a town) and `/directory/places/<town>/`.
Their tab row is the directory's: In person, Phone and online and Courses link back to the directory; Places is selected.
Under it are the same filter boxes as the directory's In person tab: 1. Support for (with counts), 2. Where? (the town) and
3. When? (Any time, Today, This evening, Tomorrow, This weekend, Next 7 days, Next 4 weeks; worked out in the browser,
so groups with no set times show only under Any time). Changing the town
swaps the page in place and keeps the support chosen; every town still has its own address, and plain links to the other towns sit at the foot of each page.
The Places page itself (no town chosen yet) is two cards: what to do, with plain links to every town, and the map to pick one from.

- `build_browse.py`: builds them from the sheet (a CSV path, or the published sheet if none is given). Writes `out/directory/places/` (live),
  `out/test/directory/places/` (test, not indexed) and `out/sitemap.xml`. Add `test` to build the test copy only.
- `towns.json`: which towns get a page, by area, and the radius. `categories.json`: the sections, headings and buttons, mapped from `support_for`.
- Styles, header and colours come from the directory's template and `build/core/` at build time, so they always match.
- Publish: `out/directory/places/` -> `docs/directory/places/`, `out/test/directory/places/` -> `docs/test/directory/places/`, `out/sitemap.xml` -> `docs/sitemap.xml`.
