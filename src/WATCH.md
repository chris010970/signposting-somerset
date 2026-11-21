# Watch

Keeping the records up to date without reading every page by hand. Three scripts, all in `src/`, run on your own computer from the repo folder (`pip install requests beautifulsoup4`):

- `check_sources.py` (AI, once per record): checks a record against its provider's page and writes the exact words that confirmed each detail: the evidence, and the recipe the scraper uses.
- `monitor.py` (no AI, as often as you like): checks every quote is still on its page.
- `detect.py` (no AI): shows what changed on a whole website since its last run, line by line.

`watch.json` holds their shared settings: how they introduce themselves to websites, timeouts, the pause between pages on one site, which parts of a page to ignore (menus, footers, cookie banners, plus panels repeated on a particular site), and which record details the scraper watches (`watch_fields`).

## Checking an organisation (AI)

    python src/check_sources.py --csv verified/services.csv --provider "Mind in Somerset" --out checks/mind.csv
    python src/monitor.py checks/mind-recipes.csv

`--provider`, `--site` (e.g. `mindinsomerset.org.uk`) or `--ids` (e.g. `R0016,R0020-R0030`) picks the records. Read `checks/mind-review.md`; the monitor run straight after confirms the scraper can find every quote it took. Who a service is for and how to join are checked here, once, not watched.

## Routine check (no AI)

    python src/monitor.py verified/evidence.csv

It writes `monitor-evidence.md`, one line per record under:
- **Needs you**: the page failed to load, or a detail's wording has gone from the page (changed or removed). Look at the page, or re-check those records with `check_sources.py`: the report gives the command, with their IDs.
- **Check by hand**: details the scraper can't check (not on the record's own page, e.g. only on a flyer; or shared by several records).
- **Fine**: every watched detail is still on its page, word for word.

`--site` or `--ids` checks only some records.

## Whole-site changes

    python src/detect.py mindinsomerset.org.uk

It writes `results/watch/detect/<site>/report.md`, the tidied text of every page, and the text from the run before, so the report shows each change line by line. The first run only records how things are.
