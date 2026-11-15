/* ---------- live data: read records from a published Google Sheet (CSV) ---------- */
// Paste the sheet's "Publish to web → CSV" link between the quotes. Leave empty to use the built-in copy only.
const SHEET_CSV_URL = "";
const BUILT = "/*BUILT*/";
function parseCSV(text) {
  text = text.replace(/^﻿/, "");
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
    else f += c;
  }
  if (f !== "" || row.length) { row.push(f); rows.push(row); }
  return rows;
}
// Undo what spreadsheets do to values: 25/10/2026 -> 2026-10-25, 10:00:00 -> 10:00
const fixDate = v => v.replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g, (m, d, mo, y) => `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`);
const fixTime = v => v.replace(/\b(\d{1,2}):(\d\d)(?::\d\d)?\b/g, (m, h, mi) => `${h.padStart(2, "0")}:${mi}`).replace(/\s*-\s*/g, "-");
function recordsFromCSV(text) {
  const rows = parseCSV(text), head = (rows[0] || []).map(h => h.trim().toLowerCase());
  const missing = ["name", "type", "mode"].filter(k => !head.includes(k));
  if (missing.length) return { error: `no ${missing.join(", ")} column` };
  const recs = [];
  for (const r of rows.slice(1)) {
    const o = {}; head.forEach((h, i) => { if (h) o[h] = String(r[i] ?? "").trim(); });
    if (!o.name) continue;
    if (o.dates) o.dates = fixDate(o.dates);
    if (o.last_checked) o.last_checked = fixDate(o.last_checked);
    if (o.times) o.times = fixTime(o.times);
    recs.push(o);
  }
  return { recs };
}
// The records this browser last loaded, kept for the visit (this tab's session only), so coming back to the directory
// from the town pages, or opening the tools page, shows them at once while the sheet is checked again in the background
const RECORDS_KEY = "ss-records";
function cachedRecords() { try { const v = JSON.parse(sessionStorage.getItem(RECORDS_KEY) || "null"); return v && Array.isArray(v.recs) && v.recs.length ? v.recs : null; } catch (e) { return null; } }
function keepRecords(recs) { try { sessionStorage.setItem(RECORDS_KEY, JSON.stringify({ at: Date.now(), recs })); } catch (e) {} }
const sameRecords = (a, b) => !!a && !!b && JSON.stringify(a) === JSON.stringify(b);
// The latest records from the published sheet (rejects if it can't be reached or looks wrong); remembered for the visit
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
