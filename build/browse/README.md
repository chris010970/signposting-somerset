# Town pages (the directory's By town tab)

Plain pages by town, for people who prefer a simple list and for search engines: `/directory/towns/` (choose a town) and `/directory/towns/<town>/`.
Their tab row is the directory's: In person, Phone and online and Courses link back to the directory; By town is selected.

- `build_browse.py`: builds them from the sheet (a CSV path, or the published sheet if none is given). Writes `out/directory/towns/` (live),
  `out/test/directory/towns/` (test, not indexed) and `out/sitemap.xml`. Add `test` to build the test copy only.
- `towns.json`: which towns get a page, by area, and the radius. `categories.json`: the sections, headings and buttons, mapped from `support_for`.
- Styles, header and colours come from the directory's template and `build/core/` at build time, so they always match.
- Publish: `out/directory/towns/` -> `docs/directory/towns/`, `out/test/directory/towns/` -> `docs/test/directory/towns/`, `out/sitemap.xml` -> `docs/sitemap.xml`.
