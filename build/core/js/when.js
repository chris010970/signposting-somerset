/* ---------- the "3. When?" filter and lists of sessions (the directory and the Places pages; core/js/schedule.js has the rules) ---------- */
// Its sessions over `days` days, as a list
const occurrences = (s, from, days) => [...sessions(s, from, days)];
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
