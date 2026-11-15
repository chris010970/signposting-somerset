# Analytics: design record

Where the Analytics work stood when it was taken out of the directory (15 Nov 2026), and why it looks the way it does.
The working code is kept here as `analytics-v24.js`, `analytics-v24.css` and `analytics-v24.html`; `analytics-v24.webp` is a screenshot.
It last ran as a tab in the directory (commit `3d48734`); it will become the standalone page `/analytics/`.

## Purpose and audience

- For link workers, commissioners, community organisations and the maintainer, not for people looking for help.
- Shows each small area (LSOA, about 1,500 people) beside the support recorded nearby in this directory.
- **Counts, not interpretation.** It never says an area is "underserved". Gaps may be gaps in the directory, not in provision; it says so.
- **Desktop only** (below 760px wide it isn't offered). On a phone, a future `/analytics/` page should show a short explanation instead, so it isn't an empty page to Google.

## Layout: three columns, one selection

- **Explore (left):** tabs **List** (sortable, searchable list of all 595 LSOAs) and **Chart** (the grid).
- **Locate (centre):** the map.
- **Understand (right):** the profile of the selected LSOA, or a summary of the selected group.
- One shared selection: picking in the grid, list or map selects everywhere. Filters recalculate without clearing the selection or moving the map.

Header filters: 1. Support for · 2. How often (most days / at least weekly / fortnightly or monthly) · 3. Compare areas by · Search area (fixed: 1 mile urban, 3 miles rural, by the ONS Rural-Urban Classification 2021).

## Indicators (config-driven)

One entry per indicator in `AN_IND`: bands (most need first), rank order, optional "higher half" filter, profile tile, compare row and copy line. The grid, map, key, list, profile, compare and copy all follow from it. Adding an indicator = one entry.

- Deprivation (IMD 2025) and Health deprivation: decile pairs 1–2 … 9–10.
- Disabled people (Census 2021): 24%+, 21–24%, 18–21%, 15–18%, under 15%.
- Population density (2022): under 50, 50–250, 250–1,000, 1,000–4,000, 4,000+ per km², least dense first; no "higher half" filter.
- Rank is by the indicator only, never by distance; ties go to the larger population.

## Distance

- Straight lines from each LSOA's **postcode-weighted centre** (where people live). ONS withdrew population-weighted centroids in 2026; centres come from the 2016 open postcode file (`make_analytics_data.py`).
- Grid columns are **fifths of residents** by distance to the nearest matching support (cumulative %), recalculated whenever Support for / How often change, and labelled with their miles (e.g. Bereavement: < 3.5, 3.5–6.5, 6.5–8, 8–13, 13+). Rounded to 0.1 mile under a mile, half a mile above, so columns are close to, not exactly, fifths.
- Known weakness: for very common support ("Anything") the "furthest" fifth can be under a mile away, so relative colours can look alarming. The mile labels carry that; a floor (nothing under ~1 mile counts as far) was discussed but not built.
- "None recorded" column appears only when an LSOA has no matching support anywhere; "No data" row only when an indicator value is missing.

## The grid (Chart tab)

- Rows = indicator bands, rotated axis label on the left; columns = distance fifths, under a "Miles to nearest support · fifths of residents" bar.
- Each square shows LSOAs (big) and people (small). Extra column: **% in the furthest 40%** per row, with the overall figure in the Total row as the baseline.
- **Selection:** click squares to add or remove; click a row label or column heading to select the whole row or column; hover lights up the row and column. Changing a filter keeps the selection and refills it; changing the indicator clears it. Stored as squares, not LSOA ids, so the meaning survives a filter change.
- Orange outline on the top two rows × furthest two columns. One-line summary under the grid, counts only, e.g. "31 of 51 LSOAs in the top band are in the furthest 40% … 51k people".
- Pure `anAggregate()` puts every LSOA in exactly one square; tests reconcile LSOA and population totals for every indicator and filter.

## Colour

- One 5 × 5 colour table (`AN_LUT`, rows = need, columns = distance), used for the grid squares **and** the map, so the grid is the map's key. Green (near, high need) to brown (far); chosen after trying orange, plain green, teal–purple and a computed green × ochre blend.
- The map key is a small 5 × 5 of the same colours.

## Map

- Service pins as on In person (area circles when zoomed out), matching services only, with a plain legend.
- Selection: everything else fades a little; selected areas keep full colour, get a thin white edge and lift with a shadow. No heavy outlines and no dashed line to the nearest service (both removed as too busy).

## Right panel

- One LSOA: figures (people, urban/rural, each indicator), matching support (nearest, count within the search area, or "None recorded… may be a gap in this directory"), all support within the search area by kind, then View services (opens the directory centred there), Copy, Compare (A/B).
- A group: count, people, median and range of distance, **by place** ("Weston-super-Mare 11 · Bridgwater 10 …"), then the list. "By place" is what showed that the most-deprived-and-furthest group for bereavement was mostly Weston: a directory gap, not a county-wide pattern.

## Findings so far (for the directory, not the tool)

- No recorded bereavement support within 5 miles of Taunton, Yeovil, Bridgwater, Weston or Bath.
- Taunton, Yeovil and Bridgwater show no in-person "low mood" or "anxiety" tags within 5 miles, probably tagging rather than absence.

## Parked ideas

- Support by day and time across the week (evenings and weekends against office hours).
- Directory health: records not checked recently, by area.
- The town × support-type grid from the Browse mockup.
- Coverage over time, once there's history.
- A count measure (how many services within reach) as an alternative to distance, using the same grid shape (`AN_ACC`).

## Moving to `/analytics/`

- Needs from the directory: the record loading and helpers listed at the top of `analytics-v24.js`; these should move to `build/shared/` rather than be copied.
- "View services" should open the directory with filters in the link (the planned deep links), not by setting the directory's variables.
- Keep the data file at `docs/assets/analytics-lsoa.geojson`, loaded only when the page opens.

## Now: a tab on the tools page (16 Nov 2026)

- Analytics is the **Analytics** tab of `/tools/` (desktop only: the tab is hidden below 760px wide). Code: `build/tools/analytics/`.
- The shared pieces it needs (records, kinds and colours, map pins and area circles, schedule logic) come from `build/core/`.
- "View services" opens the directory in a new tab, filtered by link (support, the LSOA's centre, 2 or 5 miles), instead of setting the directory's variables.
- The data file stays at `docs/assets/analytics-lsoa.geojson`, loaded only when the tab first opens.
