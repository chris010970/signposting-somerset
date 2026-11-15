# Browse

Plain pages by town, for people who prefer a simple list and for search engines: `/browse/` (choose a town) and `/browse/<town>/`.

- `build_browse.py`: builds them from the sheet (a CSV path, or the published sheet if none is given). Writes `out/browse/` (live),
  `out/test/browse/` (test, not indexed) and `out/sitemap.xml`. Add `test` to build the test copy only.
- `towns.json`: which towns get a page, by area, and the radius. `categories.json`: the sections and buttons, mapped from `support_for`.
- The header and colours come from the directory's own template at build time, so they always match.
- Publish: `out/browse/` -> `docs/browse/`, `out/test/browse/` -> `docs/test/browse/`, `out/sitemap.xml` -> `docs/sitemap.xml`.
