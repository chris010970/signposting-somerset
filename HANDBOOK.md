# Signposting Somerset: handbook

How the directory is built, what the data means, and the rules for adding to it. Written so that anyone (a person or an AI assistant) can pick the work up without the history of how it got here. **Update this file whenever a rule or process changes.**

Last updated: 15 November 2026.

---

## 1. What it is

- **The site:** https://signpostingsomerset.org.uk. The directory is at `/directory/`, with its Places pages (town guides) at `/directory/places/`; the root and the old `/main/` address forward to it (keeping any tab, e.g. `/main/#about`). Tools for professionals (Assist; community insights to come) are at `/tools/`. `/test/` mirrors the site for trying changes first (`/test/directory/`, `/test/directory/places/`, `/test/tools/`; not indexed by Google; `/test/` itself forwards to `/test/directory/`).
- **Coverage:** Somerset (Somerset Council area), North Somerset, and Bath and North East Somerset (B&NES), plus national phone and online services.
- **Audience:** support workers, volunteers and anyone looking for help, activities or community connections.
- **Data:** one Google Sheet (published as CSV). The site reads it live; nothing needs rebuilding when the sheet changes.
- **Assist:** an AI tab for invited support workers. It sends a described need to a Cloudflare Worker, which reads the live sheet, picks candidate services and asks Claude to write a short, ordered plan from them. It never invents services: every pick is a sheet record.

## 2. Where things live

| What | Where |
|---|---|
| Live pages | repo `docs/directory/index.html` (live), `docs/test/directory/index.html` (test); `docs/directory/places/` and `docs/test/directory/places/` (town pages); `docs/tools/` and `docs/test/tools/` (tools page); `docs/index.html` and `docs/main/index.html` are forwarders to `/directory/` |
| Site assets | `docs/assets/` (icons, `share.png` link-preview image), `docs/favicon.ico`, `docs/sitemap.xml` |
| Build sources | repo `build/`, one folder per part of the site (see section 7) |
| Worker | Cloudflare: Workers & Pages → `signposting-assist`. Copy of the code in `src/cloudflare-worker.js` and `build/directory/assist/` |
| Secrets | **Only in Cloudflare** (Settings → Variables and Secrets): `ANTHROPIC_API_KEY`, access code. Never in the repo, never in a chat |
| Tools | `src/`: `run_scenarios.py` and the `scenarios-*.json` files, `check_sources.py`, `church_events.py`, `geocode.py`, `services-sheet-tools.gs` (not part of the site build) |
| Search | Google Search Console (property for signpostingsomerset.org.uk; sitemap submitted) |

## 3. The data: 25 columns

One row per service **session pattern**. If a group meets at different times on different days, or at different venues, it gets one row per pattern (for example "Greenlinks gardening (Monksdale, Tuesday)" and "(Monksdale, Thursday)").

| Column | Meaning and format |
|---|---|
| `name` | Short, specific name. Add the place in brackets when the same group runs in several places: `Talking Café Brean`, `SoBS Support Group (Bath)`. Make ambiguous places explicit: `(Weston, Bath)` not just `Weston`. |
| `provider` | Organisation that runs it. |
| `type` | One of: `Activity group`, `Peer group`, `Community`, `Practical support`, `One-to-one support`, `Advocacy`, `Course`, `Counselling or therapy`, `Volunteering` (the sheet's dropdown; nothing else). Helplines are `One-to-one support`, or `Practical support` for advice lines. |
| `access` | One of: `drop in` (just turn up), `sign up` (contact or register first), `book`, `call`, `referral` (needs a professional). |
| `support_for` | One or more, separated by `;`: `connect`, `be active`, `take notice`, `keep learning`, `giving`, `low mood`, `anxiety`, `crisis prevention`, `bereavement`, `addiction`, `dementia`, `caring for someone`, `long-term pain`, `eating disorders`, `hearing voices`, `abuse`, `food`, `finances`, `housing`. |
| `mode` | One or more of `in-person`, `phone`, `online` (`;` separated). |
| `url` | The provider's page for this service. |
| `description` | Plain English, **under 128 characters**. What happens, for whom. No hype. |
| `who` | One or more: `anyone`, `adults`, `older people`, `young people`, `carers`, `men`, `women`, `new families`, `LGBTQ+`, `refugees and asylum seekers`, `displaced people`. |
| `eligibility` | Who can go and what to do first: age, area, "contact first for the venue", "currently full", "faith content". Area limits use the exact phrase `Somerset Council area only` (only when the service really is limited). |
| `days` | `Mon`, `Tue`, `Wed`, `Thu`, `Fri`, `Sat`, `Sun`. Ranges `Mon-Fri`; lists `Mon;Wed;Fri`. 24/7 lines: `Mon-Sun`. |
| `times` | `HH:MM-HH:MM` (24-hour), or a start time only `10:00` if no end is published. 24/7: `00:00-23:59`. Never `00:00` as an end time. |
| `frequency` | Free text. **Leave blank for weekly** (days + times alone mean every week; the word `weekly` stops the site and Assist working out next dates). The site computes dates only from `1st Tue of month`, `last Fri of month`, `1st and 3rd Wed of month` (weekday must match `days`, no extra words). Anything else (e.g. `fortnightly`, `monthly (dates vary)`, `term time`, `see website`) shows as "Check dates" with the wording, which is fine when that's all that's known. |
| `dates` | Specific dates for one-off courses or term-time limits, if needed. |
| `address` | Venue name and street. Leave blank when the venue isn't published. |
| `town` | Town or village. Must be one the site knows (see `build/directory/places.json`); add new ones there. Leave blank for services with no single place (area-wide). |
| `area` | One of `Somerset`, `North Somerset`, `Bath and North East Somerset`, `national`. |
| `postcode` | Venue postcode, if published. |
| `phone`, `email` | Public contact details only. |
| `cost` | `Free`, `£3`, `£4 per session`, `Suggested donation £3`, `Pay for own drinks or activity`, etc. |
| `source` | Where the details were checked (ideally the provider's own page). |
| `last_checked` | `DD/MM/YYYY`. |
| `lat`, `lon` | Six decimal places, **only from a real postcode or venue**. See section 5. |

## 4. Rules for what goes in

These are decisions, not accidents. Keep to them unless deliberately changed (and update this list if so).

1. **Verify, don't guess.** Every detail comes from the provider's own page, a council directory (Somerset Council, Livewell B&NES), the NHS directory, or a leaflet the provider published. If a value can't be confirmed, leave it out and say so. Never fill gaps from memory or from another AI's summary.
2. **Regular times only.** A service needs a recurring day and time, *or* it must be a phone/online/referral service people contact directly (helplines, NHS teams). One-off events and courses with no published dates are left out.
3. **No paid private services.** Private therapists, paid day clubs and commercial classes are out. Small charges for charity groups (£2–£5) are fine; state them in `cost`.
4. **Secular where possible.** Worship, Bible study and church services are out. Community activities run by churches (cafés, toddler groups, warm spaces) are in. Café churches and groups with prayer or a "Christian thought" are in but flagged in `eligibility` (e.g. "Includes a short Christian reflection").
5. **Safety and privacy.** Never publish Crisis Safe Space or similar evening crisis-space addresses (record the town only; venue is given on booking). Leave out personal emails and mobiles of named volunteers; use organisational contacts.
6. **Toddler and youth groups are in scope.**
7. **Eligibility by area only when needed.** Mark `Somerset Council area only` (or the B&NES equivalent) only where the provider says so. Assist reads this and leaves out services the person can't use.
8. **Full or paused groups** stay in, with `Currently full: referrals paused` at the start of `eligibility`.
9. **No hard-coded filters in Assist.** Judgements about suitability are left to the AI prompt, not code.
10. **One record per pattern** (section 3), no catch-all records that duplicate individual groups.

## 5. Locations: the rule

- **lat/lon only from a postcode** (use `src/geocode.py`, which looks up postcodes and skips rows without one).
- **No postcode → no lat/lon.** Never fill in a town centre as if it were a venue.
- What happens then (already built in):
  - **Website:** a record with a town but no lat/lon is shown at the town centre with a dashed pin, "approx. location" and an "approx." distance. No directions link.
  - **Assist:** it uses the town to judge what's near, but shows the town and "venue not listed" instead of a distance.
  - **No town and no lat/lon:** treated as area-wide ("venues vary"); not on the map.

## 6. Adding records: the process

1. **Find candidates** (provider pages, council directories, other plans). Check each against the current sheet first (name, provider, phone/email) to avoid duplicates.
2. **Verify** each on its own source (rule 1). Note conflicts between sources rather than picking silently; prefer the provider's own page and the most recent date.
3. **Write rows** with the 25 columns in order, using only the allowed values in section 3. Check descriptions are under 128 characters.
4. **Collect them in one append CSV** (UTF-8, with header). Paste into the sheet **without the header row** (a pasted header becomes a junk record).
5. **Geocode** new rows with postcodes (`python src/geocode.py`).
6. **Spot-check** with Assist or `run_scenarios.py` (section 8).

## 7. Building and deploying

`build/` has one folder per part of the site:

| Folder | What |
|---|---|
| `build/directory/` | The directory: `template.html` (site), `assist/worker-template.js` (Assist's worker and AI prompt), `towns.json`, build scripts |
| `build/analytics/` | Analytics: `DESIGN.md` (decisions so far), the v24 code, `make_analytics_data.py` (rebuilds `docs/assets/analytics-lsoa.geojson`) |
| `build/tools/` | The tools page (`/tools/`): Assist (`assist/`), About. `build_tools.py`, `template.html`, `tools.js`. The directory links to it ("For professionals →"); old `#assist` links forward there |
| `build/core/` | Code shared by the directory and the tools pages (styles, crisis and helpline bars, places, schedules, cards, sheet loading); see its README |
| `build/browse/` | Town pages (the directory's Places tab, `/directory/places/`): `build_browse.py`, `towns.json`, `categories.json` |
| `build/shared/` | Build helpers: `site_config.py` (base path), `core.py` (stitches `build/core/` into pages) |

```
cd build
python build_all.py path/to/services.csv          # builds the live directory and test
python build_all.py path/to/services.csv test     # test only
python directory/build_assist.py                   # rebuilds the worker: directory/assist/cloudflare-worker.js
```

- Edit the sources above; never edit the generated files.
- Each build stamps a version (`directory 2026-11-15 12:50`), visible on the site and in Assist, so you can tell which build is live.
- **Deploy the site:** copy `build/directory/github/directory/index.html` → repo `docs/directory/index.html` and `build/directory/github/test/directory/index.html` → `docs/test/directory/index.html`, and `build/tools/out/tools/index.html` → `docs/tools/index.html`, `build/tools/out/test/tools/index.html` → `docs/test/tools/index.html`, commit, push. GitHub Pages updates in a few minutes.
- **Deploy the worker:** Cloudflare → `signposting-assist` → Edit code → paste `build/directory/assist/cloudflare-worker.js` → Deploy. Also copy it to `src/`. Check the version shown on the Assist tab.
- Test on `/test/directory/` first, then build the live directory.
- **Where the site is served:** `build/site.json` → `base_path`. It is `"/signposting-somerset-v2"` while this repo is previewed on github.io, and must be `""` on signpostingsomerset.org.uk. Every build adds it to links and images that start with `/` (`build/shared/site_config.py`).
- Setup from scratch: `build/directory/assist/ASSIST-SETUP.md`.
- The domain's DNS is at 123-reg and points straight at GitHub Pages (no Cloudflare in front), so redirects are small forwarding pages, not server redirects.

## 8. Testing Assist

```
cd src
set ASSIST_CODE=your-code             (Windows; never write the code into a file)
python run_scenarios.py --list
python run_scenarios.py --ids S25,S26
python run_scenarios.py --scenarios scenarios-banes.json --all
python run_scenarios.py --scenarios scenarios-helpline.json --all   # local 24/7 line only where the area has one
```

- Up to 28 plans run without waiting; more wait ~2 minutes each (rate limit 30/hour).
- Outputs `plans-<date>.md` (readable) and `.json` (full detail, for review).
- What to look for: right services first for the need; area eligibility respected; safety line present when there's risk (Samaritans 116 123; Childline for under-19s; "don't stop drinking suddenly"); gaps honest; no invented details.
- Typical scores in Nov 2026: 8–9.5 out of 10. Each plan costs roughly 15–20p (about 50k input tokens with ~1,000 records).

## 9. Decisions on record

- **Crisis line in the site footer, plan footer, Assist crisis message and Assist safety note:** Samaritans 116 123 (not Mindline Somerset, which is Somerset-only). Neither B&NES nor North Somerset has a local 24/7 line (their NHS route is 111 option 2). Planned: when there is risk, Assist adds a local 24/7 helpline from the records matching the person's area (Mindline Somerset today), rather than naming it in the code.
- **Filter labels:** the questions that narrow results are numbered (1. Support for, 2. Where?, 3. When?, 2. Coverage, 2. Format); display controls are not (Sort, checkboxes). All site tabs have the same weight.
- **Directions** link only for records with a postcode; Apple Maps on iPhone/iPad, Google Maps elsewhere. Phone numbers are tap-to-call.
- **Search:** meta description "Discover mental health and wellbeing support across Somerset, North Somerset and B&NES: what's on, when and where. Built for anyone looking for help, activities or community connections."; canonical `/directory/`; test page `noindex`; sitemap lists `/directory/`.
- **Assist answer limit:** `max_tokens` 8000 (lower values cut long plans off).

- **Analytics:** taken out of the directory on 15 Nov 2026, to be rebuilt as its own page `/analytics/` (desktop only). What was decided and why, the last working code and a screenshot are in `build/analytics/` (start with `DESIGN.md`). Data file: `docs/assets/analytics-lsoa.geojson`.

## 10. Known gaps and to-dos (Nov 2026)

- B&NES and North Somerset still thinner than Somerset; Bristol is out of scope.
- Services needing times or checks: Talk Club Bath, EcoWild Lakeside/Woodland/Men's Woodland, Bath Organic Group, Share and Repair, the Bath Shed (Friday?), Genesis Lifeline (address/hours conflict), Quantock Foodbank (no times).
- Gaps found by Analytics and the browse counts: no recorded bereavement support within 5 miles of Taunton, Yeovil, Bridgwater, Weston or Bath; Taunton, Yeovil and Bridgwater show no in-person "low mood" or "anxiety" tags within 5 miles (probably tagging, not absence).
- Site structure, planned in this order: links that open the directory already filtered (e.g. `/directory/?town=Frome&support=bereavement#near`), `/analytics/`, then a `/browse/` pilot (towns listed on the left, each town's support grouped by type on the right, same header as the directory without the tabs).
- Possible: a check in `services-sheet-tools.gs` that flags `weekly` in frequency and values outside the dropdowns.
- Ideas not yet done: more places in the location dropdown for North Somerset and B&NES; Cloudflare Web Analytics; an Open Referral UK export.
