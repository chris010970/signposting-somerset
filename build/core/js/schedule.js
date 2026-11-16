/* ---------- schedules: when a service next meets ----------
   Used by the directory, the tools page and the Places pages, so they always agree. A record's schedule is its
   days ("Mon-Fri", "Tue;Thu"), times ("10:00-12:00" or a start time), frequency (blank = every week,
   "1st Tue of month", "last Fri of month", "fortnightly", "see website" ...) and dates ("2026-12-17", or
   "2026-11-02 to 2026-12-14" for a course). Tests: build/tests/schedule.test.mjs */
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const BANK = new Set((/*@core:data/bank-holidays.json*/).dates);
// School terms, for services that run in term time only (core/data/term-dates.json)
const TERMS = (/*@core:data/term-dates.json*/), TERM_TIME = new RegExp(TERMS.match, "i");
const inTerm = (s, d) => { const k = iso(d); return (TERMS.areas[s.area] || TERMS.areas[TERMS.default]).some(([a, b]) => k >= a && k <= b); };
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dayStart = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const fmtT = m => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const DAY_DATE = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });   // "Wed, 18 Nov" (one formatter: making one per date is slow)

// "Mon-Fri;Sun" -> the set of day numbers {1, 2, 3, 4, 5, 0} (ranges can wrap round the week: "Sat-Mon")
function parseDays(str) {
  const out = new Set();
  for (const p of split(str)) {
    const m = p.match(/^(\w{3})-(\w{3})$/);
    if (m && DOW.includes(m[1]) && DOW.includes(m[2])) {
      for (let i = DOW.indexOf(m[1]), j = DOW.indexOf(m[2]); ; i = (i + 1) % 7) { out.add(i); if (i === j) break; }
    } else if (DOW.includes(p)) out.add(DOW.indexOf(p));
  }
  return out;
}
// "10:00-12:30" -> { s: 600, e: 750 } in minutes; a start time alone has e: null; anything else is null
function parseTimes(t) {
  const m = (t || "").match(/^(\d\d):(\d\d)(?:-(\d\d):(\d\d))?$/);
  return m ? { s: +m[1] * 60 + +m[2], e: m[3] ? +m[3] * 60 + +m[4] : null } : null;
}
// "2026-12-17; 2027-01-14" or "2026-11-02 to 2026-12-14" -> single dates, ranges, and the last date of all
function parseDates(str) {
  const list = [], ranges = [];
  for (const p of split(str)) {
    const r = p.match(/^(\d{4}-\d\d-\d\d) to (\d{4}-\d\d-\d\d)$/);
    if (r) ranges.push([r[1], r[2]]); else list.push(p);
  }
  return { list: new Set(list), ranges, last: [...list, ...ranges.map(r => r[1])].sort().pop() };
}
// Does day d fit "1st Tue of month", "2nd and 4th Wed of month", "last Fri of month"? (null: not that kind of frequency)
const ORD = { "1st": 1, "2nd": 2, "3rd": 3, "4th": 4 };
function nthOk(d, freq) {
  const m = freq.match(/^((?:1st|2nd|3rd|4th|last)(?: and (?:1st|2nd|3rd|4th|last))?) (\w{3}) of month$/i);
  if (!m) return null;
  const n = Math.ceil(d.getDate() / 7), last = addDays(d, 7).getMonth() !== d.getMonth();
  return m[1].split(" and ").some(w => w.toLowerCase() === "last" ? last : ORD[w.toLowerCase()] === n);
}
// The kind of schedule: "dated" (its sessions can be worked out), "check" (times to check with the service),
// "website" (see website), "appointment" (booked or referred, no set days) or "ended" (all its dates have passed)
function schedKind(s, now = new Date()) {
  const f = s._freq.toLowerCase();
  if (s.dates) return s._dates.last && s._dates.last < iso(now) ? "ended" : "dated";
  if (f === "see website") return "website";
  if (!s.days) return ["book", "referral"].includes(s.access) ? "appointment" : "check";
  if (f === "fortnightly" || f.includes("dates vary")) return "check";
  if (f && nthOk(now, f) === null) return "check";
  return "dated";
}
// The schedule parts of a record, parsed, and its kind of schedule (the record itself is returned, with these added)
function withSchedule(o, now = new Date()) {
  o._days = parseDays(o.days); o._times = parseTimes(o.times); o._dates = parseDates(o.dates);
  // "term time" (in the frequency or the eligibility): only in school terms; the rest of the frequency is the pattern ("3rd Mon of month")
  o._term = TERM_TIME.test(o.frequency || "") || TERM_TIME.test(o.eligibility || "");
  o._freq = (o.frequency || "").replace(new RegExp(`,?\\s*${TERMS.match}(\\s+only)?`, "i"), "").trim();
  o._kind = schedKind(o, now);
  return o;
}
// Does it meet on day d?
function runsOn(s, d) {
  if (s._days.size && !s._days.has(d.getDay())) return false;
  if (s.dates) { const k = iso(d); return s._dates.list.has(k) || s._dates.ranges.some(([a, b]) => k >= a && k <= b); }
  if (s._term && !inTerm(s, d)) return false;   // a school holiday
  return s._freq ? nthOk(d, s._freq) === true : true;
}
// Its sessions over `days` days from the start of `from`'s day, in order: { st, en, bank, timed }
function* sessions(s, from, days) {
  if (s._kind !== "dated") return;
  const t = s._times, start = dayStart(from);
  const noTimeEnd = split(s.mode).includes("in-person") ? 1080 : 1439;   // in person with no time: assume it's over by 6pm
  for (let i = 0; i < days; i++) {
    const d = addDays(start, i);
    if (!runsOn(s, d)) continue;
    const st = new Date(d.getTime() + (t ? t.s : 0) * 60000);
    const en = new Date(d.getTime() + (t ? (t.e ?? t.s + 90) : noTimeEnd) * 60000);   // a start time alone: allow 1½ hours
    yield { st, en, bank: BANK.has(iso(d)), timed: !!t };
  }
}
const occurrences = (s, from, days) => [...sessions(s, from, days)];
// The "Next" line on a card. from: the start of the chosen time window (e.g. tomorrow), so the card shows that session.
// Returns { cls, txt, at } (at: when the next session starts, for sorting; missing when there's no date to give)
function nextText(s, now, from = now) {
  if (s._kind === "website") return { cls: "chk", txt: "Times vary: see website" };
  if (s._kind === "appointment") return { cls: "chk", txt: "By appointment" };
  // Booked, phoned or referred with no set time: there's no session to turn up to, so give the days instead of a next date
  if (!s._times && s.days && ["book", "call", "referral"].includes(s.access) && !isGroupType(s))
    return { cls: "chk", txt: `By appointment · ${s.days.replace(/;/g, ", ").replace(/-/g, "–")}` };
  if (s._kind === "check") return { cls: "chk", txt: `Check dates${s.frequency ? ` (${s.frequency})` : ""}${s.days ? ` · ${s.days} ${s.times}` : ""}` };
  let o = null; for (const x of sessions(s, from, 70)) if (x.en > from) { o = x; break; }   // the first one not over yet
  if (!o) return { cls: "chk", txt: "No upcoming dates" };
  const dd = Math.round((dayStart(o.st) - dayStart(now)) / 864e5);
  const day = dd === 0 ? "Today" : dd === 1 ? "Tomorrow" : DAY_DATE.format(o.st);
  const t = s._times ? `, ${fmtT(s._times.s)}${s._times.e != null ? "–" + fmtT(s._times.e) : ""}`
    : split(s.mode).includes("in-person") ? " (time not given: check)" : " (no set time)";
  return { cls: dd === 0 ? "today" : "", txt: `${day}${t}${o.bank ? " (bank holiday: check it's running)" : ""}${s._term ? " (term time)" : ""}`, at: o.st };
}

// The "3. When?" choices as a time window [from, to): today, this evening, tomorrow, this weekend, next 7 days, next 4 weeks
// ("any" and "now" have no window: null)
function windowFor(v, now) {
  const d0 = dayStart(now);
  if (v === "today") return [now, addDays(d0, 1)];
  if (v === "evening") return [new Date(Math.max(now, d0.getTime() + 17 * 3600e3)), addDays(d0, 1)];
  if (v === "tomorrow") return [addDays(d0, 1), addDays(d0, 2)];
  if (v === "weekend") {
    const dow = now.getDay(), sat = dow === 0 ? addDays(d0, -1) : addDays(d0, 6 - dow);
    return [new Date(Math.max(now, sat)), addDays(sat, 2)];
  }
  if (v === "week") return [now, addDays(d0, 7)];
  if (v === "month") return [now, addDays(d0, 28)];
  return null;
}
// Does it meet in that window? (only services whose sessions can be worked out)
const meetsIn = (s, win) => s._kind === "dated" &&
  occurrences(s, win[0], Math.ceil((win[1] - dayStart(win[0])) / 864e5)).some(o => o.en > win[0] && o.st < win[1]);
