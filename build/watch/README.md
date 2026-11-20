# Watch

Keeping the records up to date: finding out, without reading every page by hand, which records can be checked automatically, and which pages have changed.

- `survey.py`: the first step. For each record it uses its rule in `src/sources.csv` (the source column names a source_id) to decide where to look; records with no rule are looked for on the links in their source column, then their url. Rules done by hand (PDFs, flyers or exports supplied by a person) aren't fetched: those records are listed with the date they're next due. On every page it fetches, it looks for the record's own details (postcode, days, start time, phone, email).
- `watch.json`: its settings: how it introduces itself to websites, timeouts, the pause between pages on one site, which rule methods mean "done by hand".

What it reports, in `results/watch/`:
- `survey.md`: the summary to read first.
- `survey.csv`: one row per record: its rule, the page its details were found on, the result.
- `rules.csv`: one row per rule in `src/sources.csv`: does it still work, how many records are past their recheck date.
- `sources-proposed.csv`: new rules in `src/sources.csv`'s format, one per page that shows records with no rule yet. `sources-proposed-records.csv` says which records each covers. Review them, add the ones you want to `src/sources.csv`, and add the source_id to those records' source column.
- `pages.json`: a fingerprint (hash) of each page's text. The next run compares them, so the summary says how many pages changed in between.

Run it from GitHub: Actions → "Survey pages" → Run workflow. It takes a few minutes, then commits the reports; pull in GitHub Desktop to see them. It changes nothing in the sheet, the sources file or the site.
