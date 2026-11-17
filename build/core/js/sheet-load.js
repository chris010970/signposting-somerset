/* ---------- loading the records in the browser: the site's copy of the sheet first, then the sheet itself (core/js/sheet.js reads the CSV) ---------- */
// The sheet's "Publish to web → CSV" link, from build/directory/sheet_url.txt (filled in by the build)
const SHEET_CSV_URL = "/*SHEET_CSV_URL*/";
// The copy of the sheet the nightly Places rebuild saves on the site (build/site.json sheet_copy): quick, and there when Google isn't
const SHEET_COPY_URL = "/*SHEET_COPY_URL*/";
// The records this browser last loaded, kept for the visit (this tab's session only), so coming back to the directory
// from the Places pages, or opening the tools page, shows them at once while the sheet is checked again in the background
const RECORDS_KEY = "ss-records";
function cachedRecords() {
  try { const v = JSON.parse(sessionStorage.getItem(RECORDS_KEY) || "null"); return v && Array.isArray(v.recs) && v.recs.length ? v.recs : null; }
  catch (e) { return null; }
}
function keepRecords(recs) { try { sessionStorage.setItem(RECORDS_KEY, JSON.stringify({ at: Date.now(), recs })); } catch (e) {} }
const sameRecords = (a, b) => !!a && !!b && JSON.stringify(a) === JSON.stringify(b);
// Records from a CSV address (rejects if it can't be reached within 15 seconds or looks wrong)
function fetchCSV(url) {
  const ctl = new AbortController(); setTimeout(() => ctl.abort(), 15000);
  return fetch(url, { cache: "no-cache", signal: ctl.signal })
    .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
    .then(text => {
      const { recs, error } = recordsFromCSV(text);
      if (error || recs.length < 10) throw new Error(error || "too few records");
      return recs;
    });
}
// The latest records from the published sheet, kept for the visit
const fetchRecords = () => fetchCSV(SHEET_CSV_URL).then(recs => { keepRecords(recs); return recs; });
// Show the records as soon as there are any, and again only when they change: those kept earlier in this visit, else the site's
// copy (at most a day old), then the sheet itself, for edits made since. fail(error) only if neither the copy nor the sheet loads.
function loadRecords(use, fail) {
  let shown = cachedRecords();
  const show = recs => { if (!sameRecords(recs, shown)) { shown = recs; use(recs); } };
  if (shown) use(shown);
  const copy = shown ? Promise.resolve() : fetchCSV(SHEET_COPY_URL).then(show, e => console.warn("Site copy of the sheet not loaded", e));
  return copy.then(fetchRecords).then(show, e => {
    console.error("Sheet load error", e);
    if (!shown && fail) fail(e);
  });
}
