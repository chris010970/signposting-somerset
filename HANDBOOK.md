# Signposting Somerset: handbook

How the directory is built, what the data means, and the rules for adding to it. Written so that anyone (a person or an AI assistant) can pick the work up without the history of how it got here. **Update this file whenever a rule or process changes.**

Last updated: 12 November 2026.

---

## 1. What it is

- **The site:** https://signpostingsomerset.org.uk. The root forwards to `/main/`. `/test/` is the test copy (not indexed by Google).
- **Coverage:** Somerset (Somerset Council area), North Somerset, and Bath and North East Somerset (B&NES), plus national phone and online services.
- **Audience:** support workers, volunteers and anyone looking for help, activities or community connections.
- **Data:** one Google Sheet (published as CSV). The site reads it live; nothing needs rebuilding when the sheet changes.
- **Assist:** an AI tab for invited support workers. It sends a described need to a Cloudflare Worker, which reads the live sheet, picks candidate services and asks Claude to write a short, ordered plan from them. It never invents services: every pick is a sheet record.

## 2. Where things live

| What | Where |
|---|---|
| Live pages | repo `docs/main/index.html`, `docs/test/index.html`, `docs/index.html` (forwarder) |
| Site assets | `docs/assets/` (icons, `share.png` link-preview image), `docs/favicon.ico`, `docs/sitemap.xml` |
| Build sources | repo `build/` (see section 7) |
| Worker | Cloudflare: Workers & Pages → `signposting-assist`. Copy of the code in `src/cloudflare-worker.js` and `build/assist/` |
| Secrets | **Only in Cloudflare** (Settings → Variables and Secrets): `ANTHROPIC_API_KEY`, access code. Never in the repo, never in a chat |
| Tools | `src/run_scenarios.py`, `src/check_sources.py`, `src/geocode.py`, `src/services-sheet-tools.gs` |
| Search | Google Search Console (property for signpostingsomerset.org.uk; sitemap submitted) |

## 3. The data: 25 columns

One row per service **session pattern**. If a group meets at different times on different days, or at different venues, it gets one row per pattern (for example "Greenlinks gardening (Monksdale, Tuesday)" and "(Monksdale, Thursday)").

| Column | Meaning and format |
|---|---|
| `name` | Short, specific name. Add the place in brackets when the same group runs in several places: `Talking Café Brean`, `SoBS Support Group (Bath)`. Make ambiguous places explicit: `(Weston, Bath)` not just `Weston`. |
| `provider` | Organisation that runs it. |
| `type` | One of: `Activity group`, `Peer group`, `Community`, `Practical support`, `One-to-one support`, `Advocacy`, `Course`, `Counselling or therapy`, `Helpline`, `Volunteering`. |
| `access` | One of: `drop in` (just turn up), `sign up` (contact or register first), `book`, `call`, `referral` (needs a professional). |
| `support_for` | One or more, separated by `;`: `connect`, `be active`, `take notice`, `keep learning`, `giving`, `low mood`, `anxiety`, `crisis prevention`, `bereavement`, `addiction`, `dementia`, `caring for someone`, `long-term pain`, `eating disorders`, `hearing voices`, `abuse`, `food`, `finances`, `housing`. |
| `mode` | One or more of `in-person`, `phone`, `online` (`;` separated). |
| `url` | The provider's page for this service. |
| `description` | Plain English, **under 128 characters**. What happens, for whom. No hype. |
| `who` | One or more: `anyone`, `adults`, `older people`, `young people`, `carers`, `men`, `women`, `new families`, `LGBTQ+`, `refugees and asylum seekers`, `displaced people`. |
| `eligibility` | Who can go and what to do first: age, area, "contact first for the venue", "currently full", "faith content". Area limits use the exact phrase `Somerset Council area only` (only when the service really is limited). |
| `days` | `Mon`, `Tue`, `Wed`, `Thu`, `Fri`, `Sat`, `Sun`. Ranges `Mon-Fri`; lists `Mon;Wed;Fri`. 24/7 lines: `Mon-Sun`. |
| `times` | `HH:MM-HH:MM` (24-hour), or a start time only `10:00` if no end is published. 24/7: `00:00-23:59`. Never `00:00` as an end time. |
| `frequency` | Blank or `weekly` for weekly. Otherwise e.g. `fortnightly`, `1st Tue of month`, `last Fri of month`, `monthly (dates vary)`, `see website`, `6-week courses through the year (see website)`. |
| `dates` | Specific dates for one-off courses or term-time limits, if needed. |
| `address` | Venue name and street. Leave blank when the venue isn't published. |
| `town` | Town or village. Must be one the site knows (see `build/towns.json`); add new ones there. Leave blank for services with no single place (area-wide). |
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

The site pages are generated from `build/`:

```
cd build
python build_all.py path/to/services.csv          # builds main and test
python build_all.py path/to/services.csv test     # test only
python build_assist.py                             # rebuilds the worker: assist/cloudflare-worker.js
```

- Edit `template.html` (site), `assist-tab/` (Assist tab), `assist/worker-template.js` (worker and AI prompt). Never edit the generated files.
- Each build stamps a version (`main 2026-11-12 06:49`), visible on the site and in Assist, so you can tell which build is live.
- **Deploy the site:** copy `github/main/index.html` → repo `docs/main/index.html` and `github/test/index.html` → `docs/test/index.html`, commit, push. GitHub Pages updates in a few minutes.
- **Deploy the worker:** Cloudflare → `signposting-assist` → Edit code → paste `assist/cloudflare-worker.js` → Deploy. Also copy it to `src/`. Check the version shown on the Assist tab.
- Test on `/test/` first, then build main.
- Setup from scratch: `build/assist/ASSIST-SETUP.md`.

## 8. Testing Assist

```
set ASSIST_CODE=your-code             (Windows; never write the code into a file)
python run_scenarios.py --list
python run_scenarios.py --ids S25,S26
python run_scenarios.py --scenarios scenarios-banes.json --all
```

- Up to 28 plans run without waiting; more wait ~2 minutes each (rate limit 30/hour).
- Outputs `plans-<date>.md` (readable) and `.json` (full detail, for review).
- What to look for: right services first for the need; area eligibility respected; safety line present when there's risk (Samaritans 116 123; Childline for under-19s; "don't stop drinking suddenly"); gaps honest; no invented details.
- Typical scores in Nov 2026: 8–9.5 out of 10. Each plan costs roughly 15–20p (about 50k input tokens with ~1,000 records).

## 9. Decisions on record

- **Crisis line in the site footer, plan footer and Assist safety note:** Samaritans 116 123 (not Mindline Somerset, which is Somerset-only).
- **Directions** link only for records with a postcode; Apple Maps on iPhone/iPad, Google Maps elsewhere. Phone numbers are tap-to-call.
- **Search:** meta description "Discover mental health and wellbeing support across Somerset, North Somerset and B&NES: what's on, when and where. Built for anyone looking for help, activities or community connections."; canonical `/main/`; test page `noindex`.
- **Assist answer limit:** `max_tokens` 8000 (lower values cut long plans off).

- **Analytics tab:** **desktop only** (decided Nov 2026): the tab is hidden on screens narrower than 760px (phones), a link to #analytics on a phone opens In person instead, and the LSOA data file is only downloaded when the tab is actually opened. About says so. the 595 LSOAs (2021 Lower Layer Super Output Areas, small census areas of about 1,500 people) shaded by one layer at a time: two from the directory, worked out live from the sheet (distance to the nearest service; services nearby, i.e. within the Neighbourhood distance), in teal; and three need layers in warm colours (IMD 2025 deprivation and health deprivation, Census 2021 disability). Header: Support for · How often (most days, at least weekly, fortnightly or monthly; a blank frequency counts as weekly) · Neighbourhood (½–5 miles or 1–10 km; also sets miles or km for the tab, remembered on the device). Left column: a "Shade the map by" panel that folds to one line like the map key (remembered on the device); only the selected dataset shows its description, which must be **80 characters or fewer**; the colour scale sits on the map, bottom right, then two tabs: **This LSOA** (the default; live, it updates as you hover over or tap the map and flashes when it changes; one LSOA against the area median for its council area, with "Compare with another" for an A/B table) and **All LSOAs** (a chart of every LSOA, need up against distance across; urban and rural LSOAs are each judged against the middle LSOA of their own kind, with All/Urban/Rural buttons; hovering and tapping link to the map). The "What it is" key on the map filters services as on In person, and the service pins behave exactly as on In person (same code): zoomed out, nearby pins merge into area circles (click to zoom in); zoomed in, services at the same spot share one numbered pin. Popups link to each service's own website (or phone), as there are no cards on this tab. LSOAs have no floating hover box (it covered the pins); the This LSOA panel beside the map shows the figures. **Distances are measured from a postcode-weighted centre** (the average position of the postcodes in each LSOA, i.e. roughly where the homes are), not the middle of the shape: ONS withdrew its own LSOA 2021 population-weighted centroids from public access in 2026. It uses a 2016 open postcode file, so it counts postcodes rather than people and misses newer estates; it moves 61 large rural LSOAs by more than half a mile. Urban/rural is the ONS Rural-Urban Classification 2021. Data file: `docs/assets/analytics-lsoa.geojson`, loaded only when the tab is opened; rebuild with `build/tools/make_analytics_data.py` (fetches everything from GitHub). Straight-line distances, not travel time. A talking point, not a needs assessment: a gap may be a gap in the directory.

## 10. Known gaps and to-dos (Nov 2026)

- B&NES and North Somerset still thinner than Somerset; Bristol is out of scope.
- Services needing times or checks: Talk Club Bath, EcoWild Lakeside/Woodland/Men's Woodland, Bath Organic Group, Share and Repair, the Bath Shed (Friday?), Genesis Lifeline (address/hours conflict), Quantock Foodbank (no times).
- Ideas not yet done: more places in the location dropdown for North Somerset and B&NES; Cloudflare Web Analytics; an Open Referral UK export.
