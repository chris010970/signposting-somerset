# Shared

Pieces used by more than one part of the site.

- `site_config.py`: reads `build/site.json` (where the site is served) and `rebase()`, which adds the site's folder to links and images that start with `/`. Every build that writes pages calls it last.

Coming: the common code for the directory and the tools pages (data loading, distances, schedules, service cards, header).
