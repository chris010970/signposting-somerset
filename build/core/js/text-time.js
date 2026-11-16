/* ---------- vocabularies ---------- */
// Specialist: mental health, crisis, bereavement and other specific needs. Practical: housing, finances and life circumstances.
// Everyday wellbeing: connection, activity, learning, mindfulness and community.
const GROUPS = [["Specialist support", ["crisis prevention", "low mood", "anxiety", "bereavement", "hearing voices", "eating disorders", "long-term pain", "dementia", "addiction", "abuse", "caring for someone"]],
  ["Practical help and support", ["housing", "finances", "food"]],
  ["Everyday wellbeing", ["connect", "be active", "take notice", "keep learning", "giving"]]];
const LABEL = { "hearing voices": "Psychosis and hearing voices", "crisis prevention": "Crisis support", "addiction": "Addiction (alcohol, drugs, gambling)", "abuse": "Abuse (domestic, child or adult)" };
const cap = s => LABEL[s] || s[0].toUpperCase() + s.slice(1);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const split = s => (s || "").split(";").map(x => x.trim()).filter(Boolean);

/* ---------- time logic ---------- */
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const BANK = new Set(["2026-01-01","2026-04-03","2026-04-06","2026-05-04","2026-05-25","2026-08-31","2026-12-25","2026-12-28",
  "2027-01-01","2027-03-26","2027-03-29","2027-05-03","2027-05-31","2027-08-30","2027-12-27","2027-12-28"]);
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dayStart = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
function parseDays(str) {
  const out = new Set();
  for (const p of split(str)) {
    const m = p.match(/^(\w{3})-(\w{3})$/);
    if (m && DOW.includes(m[1]) && DOW.includes(m[2])) { let i = DOW.indexOf(m[1]); const j = DOW.indexOf(m[2]); for (;;) { out.add(i); if (i === j) break; i = (i + 1) % 7; } }
    else if (DOW.includes(p)) out.add(DOW.indexOf(p));
  }
  return out;
}
function parseTimes(t) { const m = (t || "").match(/^(\d\d):(\d\d)(?:-(\d\d):(\d\d))?$/); return m ? { s: +m[1] * 60 + +m[2], e: m[3] ? +m[3] * 60 + +m[4] : null } : null; }
function parseDates(str) {
  const list = [], ranges = [];
  for (const p of split(str)) { const r = p.match(/^(\d{4}-\d\d-\d\d) to (\d{4}-\d\d-\d\d)$/); if (r) ranges.push([r[1], r[2]]); else list.push(p); }
  return { list: new Set(list), ranges, last: [...list, ...ranges.map(r => r[1])].sort().pop() };
}
const ORD = { "1st": 1, "2nd": 2, "3rd": 3, "4th": 4 };
function nthOk(d, freq) {
  const m = freq.match(/^((?:1st|2nd|3rd|4th|last)(?: and (?:1st|2nd|3rd|4th|last))?) (\w{3}) of month$/i);
  if (!m) return null;
  const n = Math.ceil(d.getDate() / 7), last = addDays(d, 7).getMonth() !== d.getMonth();
  return m[1].split(" and ").some(w => w.toLowerCase() === "last" ? last : ORD[w.toLowerCase()] === n);
}
// Kind of schedule: dated (we can compute), check, website, appointment, ended
function schedKind(s) {
  const f = (s.frequency || "").toLowerCase();
  if (s.dates) return s._dates.last && s._dates.last < iso(new Date()) ? "ended" : "dated";
  if (f === "see website") return "website";
  if (!s.days) return ["book", "referral"].includes(s.access) ? "appointment" : "check";
  if (f === "fortnightly" || f.includes("dates vary")) return "check";
  if (f && nthOk(new Date(), f) === null) return "check";
  return "dated";
}
function runsOn(s, d) {
  if (!s._days.has(d.getDay()) && s._days.size) return false;
  if (s.dates) { const k = iso(d); return s._dates.list.has(k) || s._dates.ranges.some(([a, b]) => k >= a && k <= b); }
  return s.frequency ? nthOk(d, s.frequency) === true : true;
}
// occurrences from `from` for `days` days
function occurrences(s, from, days) {
  if (s._kind !== "dated") return [];
  const out = [], t = s._times;
  const noTimeEnd = split(s.mode).includes("in-person") ? 1080 : 1439;   // in person with no time: assume it's over by 6pm
  for (let i = 0; i < days; i++) {
    const d = addDays(dayStart(from), i);
    if (!runsOn(s, d)) continue;
    const st = new Date(d.getTime() + (t ? t.s : 0) * 60000), en = new Date(d.getTime() + (t ? (t.e ?? t.s + 90) : noTimeEnd) * 60000);
    out.push({ st, en, bank: BANK.has(iso(d)), timed: !!t });
  }
  return out;
}
const fmtT = m => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
function nextText(s, now, from = now) {   // from: start of the chosen time window (e.g. tomorrow), so the card shows that session
  if (s._kind === "website") return { cls: "chk", txt: "Times vary: see website" };
  if (s._kind === "appointment") return { cls: "chk", txt: "By appointment" };
  // Booked, phoned or referred with no set time: there's no session to turn up to, so give the days instead of a next date
  if (!s._times && s.days && ["book", "call", "referral"].includes(s.access) && !/group|community|course|volunteering/i.test(s.type || "")) return { cls: "chk", txt: `By appointment · ${s.days.replace(/;/g, ", ").replace(/-/g, "–")}` };
  if (s._kind === "check") return { cls: "chk", txt: `Check dates${s.frequency ? ` (${s.frequency})` : ""}${s.days ? ` · ${s.days} ${s.times}` : ""}` };
  const o = occurrences(s, from, 70).find(x => x.en > from);
  if (!o) return { cls: "chk", txt: "No upcoming dates" };
  const d0 = dayStart(now), dd = Math.round((dayStart(o.st) - d0) / 864e5);
  const day = dd === 0 ? "Today" : dd === 1 ? "Tomorrow" : o.st.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const t = s._times ? `, ${fmtT(s._times.s)}${s._times.e != null ? "–" + fmtT(s._times.e) : ""}` : split(s.mode).includes("in-person") ? " (time not given: check)" : " (no set time)";
  return { cls: dd === 0 ? "today" : "", txt: `${day}${t}${o.bank ? " (bank holiday: check it's running)" : ""}`, at: o.st };
}

// The 3. When? choices as a time window [from, to): today, this evening, tomorrow, this weekend, next 7 days, next 4 weeks
function windowFor(v, now) {
  const d0 = dayStart(now);
  if (v === "today") return [now, addDays(d0, 1)];
  if (v === "evening") return [new Date(Math.max(now, d0.getTime() + 17 * 3600e3)), addDays(d0, 1)];
  if (v === "tomorrow") return [addDays(d0, 1), addDays(d0, 2)];
  if (v === "weekend") { const dow = now.getDay(); const sat = dow === 0 ? addDays(d0, -1) : addDays(d0, 6 - dow); return [new Date(Math.max(now, sat)), addDays(sat, 2)]; }
  if (v === "week") return [now, addDays(d0, 7)];
  if (v === "month") return [now, addDays(d0, 28)];
  return null;
}
// Does it meet in that window? (only services whose dates can be worked out)
const meetsIn = (s, win) => s._kind === "dated" && occurrences(s, win[0], Math.ceil((win[1] - dayStart(win[0])) / 864e5)).some(o => o.en > win[0] && o.st < win[1]);
// The schedule parts of a record, parsed (days, times, dates), and its kind of schedule
function withSchedule(o) { o._days = parseDays(o.days); o._times = parseTimes(o.times); o._dates = parseDates(o.dates); o._kind = schedKind(o); return o; }

/* ---------- distance ---------- */
function miles(a, b) { const R = 3958.8, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }

