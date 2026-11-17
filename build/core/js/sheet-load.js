/* ---------- loading the records in the browser: the sheet's address, a copy kept for the visit (core/js/sheet.js reads the CSV) ---------- */
// The sheet's "Publish to web → CSV" link, from build/directory/sheet_url.txt (filled in by the build)
const SHEET_CSV_URL = "/*SHEET_CSV_URL*/";
// The records this browser last loaded, kept for the visit (this tab's session only), so coming back to the directory
// from the Places pages, or opening the tools page, shows them at once while the sheet is checked again in the background
const RECORDS_KEY = "ss-records";
function cachedRecords() {
  try { const v = JSON.parse(sessionStorage.getItem(RECORDS_KEY) || "null"); return v && Array.isArray(v.recs) && v.recs.length ? v.recs : null; }
  catch (e) { return null; }
}
function keepRecords(recs) { try { sessionStorage.setItem(RECORDS_KEY, JSON.stringify({ at: Date.now(), recs })); } catch (e) {} }
const sameRecords = (a, b) => !!a && !!b && JSON.stringify(a) === JSON.stringify(b);
// The latest records from the published sheet (rejects if it can't be reached within 15 seconds or looks wrong)
function fetchRecords() {
  const ctl = new AbortController(); setTimeout(() => ctl.abort(), 15000);
  return fetch(SHEET_CSV_URL, { cache: "no-store", signal: ctl.signal })
    .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
    .then(text => {
      const { recs, error } = recordsFromCSV(text);
      if (error || recs.length < 10) throw new Error(error || "too few records");
      keepRecords(recs);
      return recs;
    });
}
