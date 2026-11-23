# Assist: choosing candidates (retrieval)

**Status: proposal, not yet implemented (23 Nov 2026).** This describes what we plan to build and how we will test it. Nothing here is live. The benchmark results and the settings finally chosen will be recorded in a separate section at the end once measured; the HANDBOOK changes only when something goes live.

## Why

Assist sends Claude a list of candidate services and asks it to choose a few and explain why. Today the list is every in-person service within the chosen distance, every phone and online service in the sheet, and area-wide services with no fixed venue (`candidates()` in `worker-template.js`). With the verified sheet at about 1,600 records, a busy town at 10 miles gives 150+ in-person lines plus every phone and online line. That costs more per plan and gives the model a cluttered list.

The aim: send fewer lines **without losing the services that ought to be considered**. Cost is the reason for doing it; not losing good options is the test it must pass.

## Who decides what

- **Code** decides what a person can reach and is eligible for, keeps the list varied, finds lines that match the words of the description, and keeps within a budget.
- **The model** judges what suits the person and writes the plan. HANDBOOK rule 12 (no hard-coded suitability filters) still holds: the code narrows by reach, coverage and wording, never by what it thinks suits someone.
- **Safety** stays outside all of this: the risk-word check, the safety line and crisis numbers are added whatever the candidates are.

## The pipeline (version C/D)

1. **Reach and eligibility, including the specialist stretch**
   - In person: services within the chosen distance. For specialist tags (below), if fewer than `min` distinct eligible providers are within the distance, look out to `factor` × the distance, capped at `max_miles`, and mark those services as stretched.
   - The stretch is skipped when the worker unticks "Include specialist support a bit further away" (the authoritative control) or when the description contains a transport-limit phrase (a conservative backstop; see Limits).
   - Area-wide services with no fixed venue, as now.
   - Phone and online services, except those whose `eligibility` limits them to another area (e.g. "North Somerset residents only"). The `area` column is not used to cut: it records where a service is, not who can use it (SARSAS is "Somerset" but covers Avon too).
   - Ended services removed, as now.
2. **Coverage pool: nearest N per support tag.** For each support tag, the nearest `per_tag` services (with per-tag overrides), at most `per_provider` from any one provider in a tag, so one provider's split sessions can't fill the slots. Stretched services take part on the same terms.
3. **Relevance pool: keyword match.** BM25 search of the worker's description and follow-ups against each reachable record's name, description, support tags, who and eligibility; the top `relevance_top_k`. This catches a well-matched service that the coverage pool missed (the accessible seated group at 6 miles behind eight closer coffee mornings).
4. **Merge and budget.** Combine the pools, remove duplicates, and keep the candidate lines under `token_budget`. A share (`specialist_reserve`) is kept for specialist-tag services and is never trimmed. Over budget, trim the furthest coverage-pool lines first; relevance picks next; reserved specialist lines never.
5. **Prompt order.** Fixed instructions first, then (versions A to C) the national phone and online services in a fixed order with a cache breakpoint, then the need, the place and the local candidates. Stretched lines carry their label, e.g. "Further than your chosen 5 miles (8 mi): specialist, fewer options nearby", so the plan can say so.

**Specialist tags (starting list):** bereavement, eating disorders, hearing voices, abuse, addiction, dementia, long-term pain, crisis prevention.

## Settings: `build/tools/assist/assist.json`

Every number lives here; `build_worker.py` builds it into the worker, and Assist's About tab shows the values in use.

```json
{
  "per_tag": 8,
  "per_tag_overrides": { "connect": 10, "be active": 8, "food": 5 },
  "per_provider": 2,
  "relevance_top_k": 20,
  "wider": {
    "tags": ["bereavement", "eating disorders", "hearing voices", "abuse", "addiction", "dementia", "long-term pain", "crisis prevention"],
    "min": 3, "factor": 2, "max_miles": 20
  },
  "transport_phrases": ["no car", "doesn't drive", "does not drive", "can't drive", "can't travel", "cannot travel", "housebound", "mobility", "wheelchair", "can't get out"],
  "token_budget": 12000,
  "specialist_reserve": 0.15,
  "national_block": "all"
}
```

`national_block`: `all` puts every national phone and online service in the cached block (versions A to C); `relevance` sends them through steps 2 to 4 like everything else (version D). Starting values are guesses; don't tune them before the benchmark.

## Versions to compare

| Version | Candidates |
|---|---|
| A | Today's: everything in reach |
| B | Steps 1, 2, 4, 5 (coverage pool and stretch, no keyword match) |
| C | B plus the relevance pool (step 3) |
| D | C, with national services also chosen by relevance instead of all being sent |

Same scenarios, same model, same prompt and same scoring for all four, so only the candidate choice differs. B is allowed to win: if keyword matching doesn't earn its keep, we don't ship it.

## Testing

**Two kinds of test:**

1. **Retrieval only (no AI, run here, free).** A script runs the selection code in Node against `verified/services.csv` for every scenario in `src/scenarios-*.json`, for each version, and reports:
   - candidate lines and estimated prompt tokens;
   - **candidate recall:** the share of the scenario's reference list still in the candidate set;
   - **critical-service recall:** whether the starred must-keep services survived (pass/fail);
   - the full decision trace (below).
   Planned file: `build/tools/assist/retrieval_bench.mjs`, using the same code the worker is built from, so the test can't drift from what runs live.
2. **Plans (uses the API, run by Chris).** `run_scenarios.py` against a test worker per version: plan scores, whether distance and transport limits were respected, cost per plan and response time.

**Reference lists:** `build/tools/assist/reference-lists.json`. For each scenario, a list of services from the full sheet that ought to be considered, drafted by Claude and checked by Chris, who stars one or two that must survive. For safety-sensitive scenarios, losing a starred service is an outright fail, whatever the averages.

**Scenarios to add** (the 73 existing ones mostly cover towns): rural (Exmoor, Somerton, villages around Wincanton), specialist (eating disorder, hearing voices, young-onset dementia), transport-limited (including the phrasings the keyword check misses, below), mixed needs, and a few safety-sensitive cases.

**Decision trace.** In tests, and when switched on to investigate a live request, one line per record per stage:

```json
{ "id": "R0123", "stage": "coverage", "decision": "excluded", "reason": "outside_nearest_n", "tag": "connect", "miles": 7.4 }
```

Live requests keep counts only (how many dropped at each stage and why), with nothing from the description stored.

## Limits we know about

- **Transport phrases are brittle.** They miss "I rely on the bus", "I can't get out much", "recovering from surgery", "I struggle to walk far", and can misfire on "transport isn't a problem". A miss means a labelled stretched suggestion the worker can ignore; a false match means no stretch, which is the safe way to be wrong. The tick box is the real control. The missed phrasings go into the test set so the behaviour is visible.
- **Distance is a proxy.** Ten straight-line miles across rural Somerset can be much harder than ten along a bus corridor. Not addressed here.
- **Tags are only as good as the data.** A badly tagged service can fall out of the coverage pool; the relevance pool is the backstop. The benchmark's exclusion traces will show where tagging needs fixing.
- **Records without coordinates** keep today's handling (town only, "venue not listed") and must not drop out; the benchmark checks this.

## Order of work

1. Switch the site to `verified/services.csv`; run version A on it for a baseline (plans and retrieval).
2. Claude drafts the reference lists and new scenarios; Chris checks and stars.
3. Build `assist.json`, steps 1, 2, 4, 5 and the trace: version B. Retrieval benchmark.
4. Add step 3: version C; then D. Retrieval benchmark.
5. Plan runs for the versions that pass retrieval; keep the winner; tune the numbers.
6. Record the results below; update the HANDBOOK (rule 12 wording and section 8) when it goes live.

## Results

Not yet measured.
