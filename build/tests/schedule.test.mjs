// Tests for the schedule rules and the sheet clean-up the pages use (build/core/js/schedule.js, text.js, sheet.js).
// Run: node --test build/tests/     (or python build/tests/run_tests.py, which runs everything)
// Times are UK time, as for the site's visitors.
process.env.TZ = "Europe/London";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const BUILD = new URL("../", import.meta.url);
const read = p => readFileSync(new URL(p, BUILD), "utf8");
// The core files as the build stitches them (data files go in where their markers are)
const stitch = p => read(p).replace(/\/\*@core:(data\/[\w.-]+)\*\//g, (m, f) => read("core/" + f).trimEnd());
const ctx = vm.createContext({ console });
vm.runInContext(["core/js/text.js", "core/js/page-text.js", "core/js/schedule.js", "core/js/when.js", "core/js/sheet.js"].map(stitch).join("\n") +
  "\nthis.api = { split, webUrl, parseDays, parseTimes, nthOk, withSchedule, occurrences, nextText, windowFor, meetsIn, BANK, TERMS, iso, fixDate, fixTime, parseCSV, recordsFromCSV };", ctx);
const S = ctx.api;
const at = s => new Date(s);   // a local (UK) time, e.g. "2026-11-16T10:30"
const rec = (o, now) => S.withSchedule({ mode: "in-person", access: "drop in", type: "Peer group", ...o }, now);
const MON = at("2026-11-16T10:30");   // Monday 16 November 2026, mid-morning

test("days: ranges, lists and ranges that wrap round the week", () => {
  assert.deepEqual([...S.parseDays("Mon-Fri")], [1, 2, 3, 4, 5]);
  assert.deepEqual([...S.parseDays("Tue;Thu")], [2, 4]);
  assert.deepEqual([...S.parseDays("Sat-Mon")], [6, 0, 1]);
  assert.equal(S.parseDays("").size, 0);
});

test("times: start and end, start only, anything else", () => {
  assert.deepEqual({ ...S.parseTimes("10:00-12:30") }, { s: 600, e: 750 });
  assert.deepEqual({ ...S.parseTimes("19:00") }, { s: 1140, e: null });
  assert.equal(S.parseTimes("mornings"), null);
});

test("Nth weekday of the month", () => {
  assert.equal(S.nthOk(at("2026-11-03T12:00"), "1st Tue of month"), true);
  assert.equal(S.nthOk(at("2026-11-10T12:00"), "1st Tue of month"), false);
  assert.equal(S.nthOk(at("2026-11-24T12:00"), "last Tue of month"), true);
  assert.equal(S.nthOk(at("2026-11-24T12:00"), "2nd and 4th Tue of month"), true);
  assert.equal(S.nthOk(at("2026-11-24T12:00"), "fortnightly"), null);
});

test("kinds of schedule", () => {
  assert.equal(rec({ days: "Wed", times: "10:00-12:00" }, MON)._kind, "dated");
  assert.equal(rec({ days: "Wed", frequency: "fortnightly" }, MON)._kind, "check");
  assert.equal(rec({ frequency: "see website" }, MON)._kind, "website");
  assert.equal(rec({ access: "book" }, MON)._kind, "appointment");
  assert.equal(rec({ access: "drop in" }, MON)._kind, "check");
  assert.equal(rec({ dates: "2026-10-01" }, MON)._kind, "ended");
  assert.equal(rec({ dates: "2026-12-17" }, MON)._kind, "dated");
});

test("next session: a weekly group", () => {
  const s = rec({ days: "Wed", times: "10:00-12:00" }, MON);
  assert.equal(S.nextText(s, MON).txt, "Wed 18 Nov, 10:00–12:00");
  assert.equal(S.nextText(s, at("2026-11-18T09:00")).txt, "Today, 10:00–12:00");
  assert.equal(S.nextText(s, at("2026-11-17T09:00")).txt, "Tomorrow, 10:00–12:00");
});

test("a one-off date (e.g. a monthly outreach session) shows only when it's in the window", () => {
  const s = rec({ days: "Thu", times: "10:00-12:00", dates: "2026-12-17" }, MON);
  assert.equal(S.meetsIn(s, S.windowFor("week", MON)), false);
  assert.equal(S.meetsIn(s, S.windowFor("month", MON)), false);   // four weeks from 16 Nov ends 14 Dec
  const tue = at("2026-12-15T09:00");
  assert.equal(S.meetsIn(s, S.windowFor("week", tue)), true);
  assert.equal(S.nextText(s, tue).txt, "Thu 17 Dec, 10:00–12:00");
});

test("a dated record written the spreadsheet's way still works once cleaned up", () => {
  const { recs } = S.recordsFromCSV("name,type,mode,days,times,dates\nOutreach,Peer group,in-person,Thu,10:00:00-12:00:00,17/12/2026\n");
  assert.equal(recs[0].dates, "2026-12-17");
  assert.equal(recs[0].times, "10:00-12:00");
  const s = rec(recs[0], MON);
  assert.equal(S.meetsIn(s, S.windowFor("week", at("2026-12-15T09:00"))), true);
});

test("monthly: the 1st Tuesday", () => {
  const s = rec({ days: "Tue", times: "14:00-16:00", frequency: "1st Tue of month" }, MON);
  assert.equal(S.nextText(s, MON).txt, "Tue 1 Dec, 14:00–16:00");
  assert.equal(S.meetsIn(s, S.windowFor("week", MON)), false);
  assert.equal(S.meetsIn(s, S.windowFor("month", MON)), true);
});

test("the When? windows", () => {
  const wed = at("2026-11-18T12:00");
  const [a, b] = S.windowFor("weekend", wed);
  assert.equal(S.iso(a), "2026-11-21"); assert.equal(S.iso(b), "2026-11-23");
  const [e1] = S.windowFor("evening", wed);
  assert.equal(e1.getHours(), 17);
  const [t0, t1] = S.windowFor("tomorrow", wed);
  assert.equal(S.iso(t0), "2026-11-19"); assert.equal(S.iso(t1), "2026-11-20");
  assert.equal(S.windowFor("any", wed), null);
  const evening = rec({ days: "Wed", times: "18:30-20:00" }, wed), morning = rec({ days: "Wed", times: "10:00-11:00" }, wed);
  assert.equal(S.meetsIn(evening, S.windowFor("evening", wed)), true);
  assert.equal(S.meetsIn(morning, S.windowFor("evening", wed)), false);
});

test("bank holidays are flagged", () => {
  const s = rec({ days: "Mon", times: "10:00-12:00" }, MON);
  assert.match(S.nextText(s, at("2026-12-27T12:00")).txt, /bank holiday/);
});

test("bank holiday dates: at least six months still listed (add next year's to core/data/bank-holidays.json)", () => {
  const last = [...S.BANK].sort().pop(), soon = new Date(); soon.setMonth(soon.getMonth() + 6);
  assert.ok(last >= S.iso(soon), `the last bank holiday listed is ${last}`);
});

test("term time: no sessions in the school holidays of the record's area; the rest of the frequency still applies", () => {
  const wk = rec({ days: "Mon", times: "09:00-10:00", frequency: "term time", area: "Somerset" }, MON);   // (today's is over by 10:30)
  assert.equal(wk._kind, "dated", "worked out, not 'Check dates'");
  assert.match(S.nextText(wk, MON).txt, /^Mon,? 23 Nov, 09:00–10:00 \(term time\)$/);
  assert.match(S.nextText(wk, at("2026-12-20T12:00")).txt, /^Mon,? 4 Jan, 09:00–10:00 \(term time\)$/, "the Christmas holiday is skipped");
  // "3rd Mon of month, term time": the 3rd Monday, in term (15 Feb 2027, half term, is skipped: 15 Mar is next)
  const nth = rec({ days: "Mon", times: "10:00-11:00", frequency: "3rd Mon of month, term time" }, MON);
  assert.match(S.nextText(nth, at("2027-02-01T12:00")).txt, /^Mon,? 15 Mar, /);
  // said in the eligibility ("Term time only"), and B&NES's own terms (it goes back on Wed 2 Sep, Somerset on Thu 3 Sep)
  const elig = rec({ days: "Wed", times: "16:00-17:00", eligibility: "Ages 13-19; term time only", area: "Bath and North East Somerset" }, MON);
  assert.equal(S.occurrences(elig, at("2026-12-21T09:00"), 14).length, 0, "nothing in the Christmas holiday");
  assert.ok(S.occurrences(elig, at("2026-11-16T09:00"), 7).length === 1, "in term: as usual");
  // with no term time, the holidays don't matter
  assert.equal(S.occurrences(rec({ days: "Mon", times: "10:00-11:00" }, MON), at("2026-12-21T09:00"), 14).length, 2);
});

test("school terms: at least three months still listed for each area (add the next school year to core/data/term-dates.json)", () => {
  const soon = new Date(); soon.setMonth(soon.getMonth() + 3);
  for (const [area, terms] of Object.entries(S.TERMS.areas)) assert.ok(terms.at(-1)[1] >= S.iso(soon), `${area}: the last term listed ends ${terms.at(-1)[1]}`);
});

test("web links: only http and https addresses", () => {
  assert.equal(S.webUrl("https://example.org/a"), "https://example.org/a");
  assert.equal(S.webUrl("HTTP://example.org"), "HTTP://example.org");
  assert.equal(S.webUrl("javascript:alert(1)"), "");
  assert.equal(S.webUrl("www.example.org"), "");
  assert.equal(S.webUrl(""), "");
});

test("sheet clean-up: the shared cases (the builds' clean-up is checked against the same ones)", () => {
  const cases = JSON.parse(read("tests/cleanup-cases.json"));
  for (const [v, want] of cases.dates) assert.equal(S.fixDate(v), want, v);
  for (const [v, want] of cases.times) assert.equal(S.fixTime(v), want, v);
});

test("CSV: quoted fields with commas, quotes and line breaks", () => {
  const rows = S.parseCSV('﻿a,b\n"x, y","say ""hi"""\r\n"two\nlines",z');
  assert.deepEqual(JSON.parse(JSON.stringify(rows)), [["a", "b"], ["x, y", 'say "hi"'], ["two\nlines", "z"]]);
  assert.match(S.recordsFromCSV("name,town\nA,Frome").error, /no type, mode column/);
});
