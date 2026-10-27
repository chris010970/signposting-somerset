/**
 * Signposting Somerset: tools for the records sheet.
 *
 * Adds a "Signposting" menu with:
 *   - Check records: highlights problems (red = error, amber = warning), puts the reason in a
 *     note on the cell (hover to read it), and lists everything on a "Check report" tab.
 *   - Clear check marks: removes the highlights and notes.
 *   - Add / refresh dropdowns: dropdown lists for type, access and area. (who, support_for and mode
 *     can hold several values separated by ";", so they have no dropdown; any old dropdown is removed.)
 *
 * Install: Extensions → Apps Script → replace ALL the code with this file → Save → reload the sheet.
 * (This replaces the earlier dropdown-only script, which it includes.)
 *
 * The records must be on the FIRST tab (the one the website reads). The "Check report" tab is
 * always added at the end, so it never becomes the first tab.
 * Same rules as check.py.
 */

const LISTS = {
  type: ["Advocacy", "Community", "Peer group", "Activity group", "One-to-one support", "Course",
         "Practical support", "Counselling or therapy", "Volunteering"],
  access: ["drop in", "sign up", "book", "referral", "call"],
  area: ["Somerset", "national"],
};
// Columns that can hold several values separated by ";" (no dropdown; checked by "Check records")
const MULTI = {
  who: ["anyone", "adults", "older people", "new families", "young people", "carers", "men", "women",
        "LGBTQ+", "displaced people"],
  support_for: ["connect", "be active", "take notice", "keep learning", "crisis prevention", "bereavement",
                "caring for someone", "finances", "housing", "food", "long-term pain", "hearing voices",
                "eating disorders", "drugs and alcohol", "dementia"],
  mode: ["in-person", "phone", "online"],
};
const REQUIRED = ["name", "provider", "type", "access", "support_for", "mode", "who", "source", "last_checked"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const JS_DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const RED = "#F8D7DA", AMBER = "#FFF3CD";
const REPORT = "Check report";

function onOpen() {
  SpreadsheetApp.getUi().createMenu("Signposting")
    .addItem("Check records", "checkRecords")
    .addItem("Clear check marks", "clearCheckMarks")
    .addSeparator()
    .addItem("Add / refresh dropdowns", "addDropdowns")
    .addToUi();
}

/* ---------------- dropdowns ---------------- */
function addDropdowns() {
  const sheet = recordsSheet_();
  const headers = headers_(sheet);
  const rows = Math.max(sheet.getMaxRows() - 1, 1);
  const done = [], missing = [];
  for (const [name, values] of Object.entries(LISTS)) {
    const col = headers.indexOf(name) + 1;
    if (!col) { missing.push(name); continue; }
    const rule = SpreadsheetApp.newDataValidation().requireValueInList(values, true)
      .setAllowInvalid(false).setHelpText("Choose one of: " + values.join(", ")).build();
    sheet.getRange(2, col, rows, 1).setDataValidation(rule);
    done.push(name);
  }
  for (const name of Object.keys(MULTI)) {          // multi-value columns: make sure no dropdown blocks "a;b"
    const col = headers.indexOf(name) + 1;
    if (col) sheet.getRange(2, col, rows, 1).clearDataValidations();
  }
  toast_("Dropdowns added: " + done.join(", ") + (missing.length ? ". Not found: " + missing.join(", ") : ""));
}

/* ---------------- checking ---------------- */
function checkRecords() {
  const sheet = recordsSheet_();
  const lastRow = sheet.getLastRow(), lastCol = sheet.getLastColumn();
  if (lastRow < 2) { toast_("No records to check."); return; }
  const headers = headers_(sheet);
  const col = name => headers.indexOf(name);
  const range = sheet.getRange(2, 1, lastRow - 1, lastCol);
  const values = range.getDisplayValues();                       // what you see in the cells
  const bg = values.map(r => r.map(() => null));
  const notes = values.map(r => r.map(() => ""));
  const issues = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const seenNames = {};
  // postcode districts per town (to spot a postcode that doesn't belong to its town)
  const townDistricts = {};
  values.forEach(row => {
    const town = String(row[col("town")] || "").trim(), pc = String(row[col("postcode")] || "").trim().toUpperCase();
    if (town && pc) { townDistricts[town] = townDistricts[town] || {}; const d = pc.split(" ")[0]; townDistricts[town][d] = (townDistricts[town][d] || 0) + 1; }
  });
  const slots = {};

  values.forEach((row, i) => {
    const v = {}; headers.forEach((h, j) => v[h] = String(row[j] || "").trim());
    if (!v.name && row.every(c => !String(c).trim())) return;   // empty row
    const sheetRow = i + 2;
    const add = (sev, field, msg) => {
      issues.push([sev, sheetRow, v.name, field, msg]);
      const j = col(field) >= 0 ? col(field) : 0;
      if (bg[i][j] !== RED) bg[i][j] = sev === "error" ? RED : AMBER;
      notes[i][j] = (notes[i][j] ? notes[i][j] + "\n" : "") + (sev === "error" ? "ERROR: " : "Check: ") + msg;
    };

    REQUIRED.forEach(f => { if (col(f) >= 0 && !v[f]) add("error", f, "required field is blank"); });
    if (v.name) {
      const key = v.name.toLowerCase();
      if (seenNames[key]) add("error", "name", "same name as row " + seenNames[key]); else seenNames[key] = sheetRow;
    }
    for (const [f, ok] of Object.entries(LISTS)) if (v[f] && !ok.includes(v[f])) add("error", f, "not in the agreed list: " + v[f]);
    for (const [f, ok] of Object.entries(MULTI)) if (v[f]) {
      const bad = v[f].split(";").map(x => x.trim()).filter(x => x && !ok.includes(x));
      if (bad.length) add("error", f, "not in the agreed list: " + bad.join(", ") + " (separate values with ;)");
    }

    // when
    const days = parseDays_(v.days);
    if (days === null) add("error", "days", "can't read '" + v.days + "' (use Mon, Tue… or Mon-Fri, separated by ;)");
    const t = v.times.replace(/(\d\d:\d\d):\d\d/g, "$1").replace(/\s*-\s*/, "-");
    if (v.times && !/^([01]\d|2[0-3]):[0-5]\d(-([01]\d|2[0-3]):[0-5]\d)?$/.test(t)) add("error", "times", "use HH:MM or HH:MM-HH:MM (24 hour)");
    else if (t.includes("-") && t.split("-")[1] <= t.split("-")[0]) add("error", "times", "ends before it starts");
    if (v.days && !v.times) add("warn", "times", "days given but no times");
    const freqOk = /^(|fortnightly|monthly \(dates vary\)|dates vary|see website|((1st|2nd|3rd|4th|last)( and (1st|2nd|3rd|4th|last))? (Mon|Tue|Wed|Thu|Fri|Sat|Sun) of month))$/i;
    if (!freqOk.test(v.frequency)) add("error", "frequency", "not a recognised pattern");
    const fm = v.frequency.match(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun) of month/);
    if (fm && days && days.length && !days.includes(fm[1])) add("error", "frequency", "says " + fm[1] + " but days is " + v.days);
    if (v.mode.includes("in-person") && !v.days && !v.dates && !["book", "referral"].includes(v.access) && v.frequency.toLowerCase() !== "see website")
      add("warn", "days", "no days or dates: won't appear when a time is chosen");

    // dates
    if (v.dates) {
      const all = [];
      v.dates.split(";").map(d => d.trim()).filter(Boolean).forEach(d => {
        const range = d.match(/^(.+?) to (.+)$/);
        (range ? [range[1], range[2]] : [d]).forEach(x => {
          const dt = parseDate_(x);
          if (!dt) add("error", "dates", "can't read date '" + x + "' (use YYYY-MM-DD)");
          else { all.push(dt); if (!range && days && days.length && !days.includes(JS_DAY[dt.getDay()])) add("error", "dates", x + " is a " + JS_DAY[dt.getDay()] + ", but days is " + v.days); }
        });
      });
      if (all.length && Math.max(...all) < today) add("error", "dates", "all dates have passed: remove or update");
      if (v.frequency) add("warn", "frequency", "should be blank when dates is filled");
    }

    // where
    const withheld = /venue confirmed (on registration|once referred)|meeting point (varies|given on booking)/i.test(v.description + " " + v.address);
    if (v.mode.includes("in-person")) {
      if (!v.town && !withheld) add("warn", "town", "in person but no town");
      if (!v.address && !withheld) add("warn", "address", "in person but no address or venue");
    }
    if (v.postcode && !/^[A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2}$/.test(v.postcode.toUpperCase())) add("error", "postcode", "not a valid postcode format");
    else if (v.postcode && townDistricts[v.town]) {
      const d = v.postcode.toUpperCase().split(" ")[0], counts = townDistricts[v.town];
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      if (top[0] !== d && counts[d] === 1 && top[1] >= 2) add("warn", "postcode", d + " differs from other " + v.town + " records (" + top[0] + ")");
    }
    if (v.town && v.days && v.times) {
      const key = [v.town.toLowerCase(), v.days, v.times, v.address.toLowerCase().slice(0, 20)].join("|");
      if (slots[key] && slots[key].name !== v.name) add("warn", "name", "same town, day, time and venue as row " + slots[key].row + " (" + slots[key].name + "): duplicate?");
      else slots[key] = { row: sheetRow, name: v.name };
    }
    if (v.lat || v.lon) {
      const la = Number(v.lat), lo = Number(v.lon);
      if (isNaN(la) || isNaN(lo) || la < 49.8 || la > 52.5 || lo < -6 || lo > 0) add("warn", "lat", "lat/lon look wrong for the South West");
    }
    if (!v.mode.includes("in-person") && v.mode && !v.area) add("warn", "area", "phone/online service with no area (Somerset or national)");

    // contact and text
    if (!v.phone && !v.email && !v.url) add("warn", "phone", "no phone, email or website");
    if (v.email && !/^[^@\s;]+@[^@\s;]+\.[^@\s;]+$/.test(v.email)) add("error", "email", "doesn't look like an email address");
    if (v.url && !/^https?:\/\//.test(v.url)) add("error", "url", "should start with http:// or https://");
    if (!v.description) add("warn", "description", "blank");
    if (/\b(check|unconfirmed|as printed|possibly|looks wrong)\b/i.test(v.description.replace(/check (with|current dates|before)|suitability check/ig, "")))
      add("warn", "description", "description flags something to check");
    else if (v.description.length > 120) add("warn", "description", v.description.length + " characters: trim to 120 or fewer");

    // freshness
    if (v.last_checked) {
      const lc = parseDate_(v.last_checked);
      if (!lc) add("error", "last_checked", "use YYYY-MM-DD");
      else if ((today - lc) / 864e5 > 92) add("warn", "last_checked", Math.round((today - lc) / 864e5) + " days since it was checked");
    }
  });

  range.setBackgrounds(bg);
  range.setNotes(notes);
  writeReport_(issues);
  const e = issues.filter(x => x[0] === "error").length, w = issues.length - e;
  toast_(`Checked ${Object.keys(seenNames).length} records: ${e} errors (red), ${w} warnings (amber). Details on the "${REPORT}" tab.`);
}

function clearCheckMarks() {
  const sheet = recordsSheet_();
  if (sheet.getLastRow() < 2) return;
  const range = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn());
  range.setBackground(null);
  range.clearNote();
  toast_("Check highlights and notes cleared.");
}

/* ---------------- helpers ---------------- */
function recordsSheet_() { return SpreadsheetApp.getActiveSpreadsheet().getSheets()[0]; }
function headers_(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map(h => String(h).trim().toLowerCase());
}
function toast_(msg) { SpreadsheetApp.getActiveSpreadsheet().toast(msg, "Signposting", 10); }

function parseDays_(s) {
  if (!s) return [];
  const out = [];
  for (const part of s.split(";").map(x => x.trim()).filter(Boolean)) {
    const m = part.match(/^(\w{3})-(\w{3})$/);
    if (m && DAYS.includes(m[1]) && DAYS.includes(m[2])) {
      let i = DAYS.indexOf(m[1]); const j = DAYS.indexOf(m[2]);
      for (;;) { out.push(DAYS[i]); if (i === j) break; i = (i + 1) % 7; }
    } else if (DAYS.includes(part)) out.push(part);
    else return null;
  }
  return out;
}

// Accepts 2026-11-26 or 26/11/2026 (how Sheets may display a converted date)
function parseDate_(s) {
  let m = String(s).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  return null;
}

function writeReport_(issues) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let rep = ss.getSheetByName(REPORT);
  if (!rep) rep = ss.insertSheet(REPORT, ss.getSheets().length);   // always at the end, never the first tab
  rep.clear();
  const order = { error: 0, warn: 1 };
  issues.sort((a, b) => order[a[0]] - order[b[0]] || a[1] - b[1]);
  const rows = [["severity", "row", "name", "field", "issue"]].concat(issues.length ? issues : [["", "", "No problems found", "", ""]]);
  rep.getRange(1, 1, rows.length, 5).setValues(rows);
  rep.getRange(1, 1, 1, 5).setFontWeight("bold");
  rep.getRange(1, 1, 1, 5).offset(0, 0).getSheet().setFrozenRows(1);
  rep.getRange(1, 6).setValue("Checked " + new Date().toLocaleString("en-GB"));
  rep.autoResizeColumns(1, 5);
}
