# Shared

Pieces used by more than one part of the site.

- `site_config.py`: reads `build/site.json` (where the site is served) and `rebase()`, which adds the site's folder to links and images that start with `/`. Every build that writes pages calls it last.

- `core.py`: `inline_core()`, which stitches the shared code in `build/core/` into a page (see `build/core/README.md`).
