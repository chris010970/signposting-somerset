// Tests for Assist's relay, the Cloudflare Worker (build/tools/assist/): the file built for pasting into Cloudflare (src/), run as
// Cloudflare runs it (on UTC), with the sheet and the AI service replaced by stand-ins. Nothing leaves this computer.
// Run: node --test build/tests/     (or python build/tests/run_tests.py, which runs everything)
process.env.TZ = "UTC";   // as on Cloudflare
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HERE = new URL(".", import.meta.url).pathname;
const ASSIST = join(HERE, "..", "tools", "assist");
const SHEET = readFileSync(join(HERE, "fixtures", "services.csv"), "utf8");
const ORIGIN = "https://example.test", CODE = "test-code";
const ENV = { ACCESS_CODE: CODE, ANTHROPIC_API_KEY: "k", SHEET_CSV_URL: "https://sheet.test/csv", ALLOWED_ORIGIN: ORIGIN };
const build = stamp => execFileSync(process.env.PYTHON || "python3", ["-c", `import sys; sys.path.insert(0, ${JSON.stringify(ASSIST)}); import build_worker; sys.stdout.write(build_worker.build(${JSON.stringify(stamp)}))`], { encoding: "utf8" });

// The clock: a fixed moment, set per test (the Worker reads it through Date)
let NOW = Date.parse("2026-11-16T10:30:00Z");   // Monday 16 November 2026, 10:30 in the UK (GMT)
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...a) { super(...(a.length ? a : [NOW])); }
  static now() { return NOW; }
};

// The sheet and the AI service: stand-ins that record what they were asked
let sheet = SHEET, ai = null, asked = [];
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url === ENV.SHEET_CSV_URL) return new Response(sheet);
  if (url.startsWith("https://api.anthropic.com/")) { const body = JSON.parse(init.body); asked.push(body); return ai(body); }
  throw new Error("unexpected fetch: " + url);
};
// An AI answer, streamed as the API streams it
const streamed = text => new Response([
  { type: "message_start", message: { usage: { input_tokens: 1 } } },
  { type: "content_block_start", content_block: { type: "text" } },
  { type: "content_block_delta", delta: { type: "text_delta", text } },
  { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } },
].map(e => `data: ${JSON.stringify(e)}\n`).join("\n"), { headers: { "Content-Type": "text/event-stream" } });
// The ids the prompt gave each service, by name
const idsIn = prompt => Object.fromEntries([...prompt.matchAll(/^(\d+) \| ([^|]+) \|/gm)].map(m => [m[2].trim(), +m[1]]));

let worker;
before(async () => {
  const dir = mkdtempSync(join(tmpdir(), "worker-"));
  writeFileSync(join(dir, "worker.mjs"), build("test"));
  worker = (await import(join(dir, "worker.mjs"))).default;
});
let ip = 0;   // each request from its own visitor, so the per-visitor limits don't carry between tests
const call = (path, body, { code = CODE, origin = ORIGIN, method = "POST" } = {}) => worker.fetch(new Request("https://relay.test" + path, {
  method, headers: { Origin: origin, "X-Access-Code": code, "Content-Type": "application/json", "CF-Connecting-IP": "10.0.0." + ++ip },
  body: method === "POST" ? JSON.stringify(body) : undefined }), ENV);
const ask = (body = {}) => call("/", { need: "Feeling low and isolated, would like to meet people", town: "__pt", lat: 51.209, lon: -2.645, radius: 5, ...body });

test("the file to paste into Cloudflare is up to date with its sources (rebuild: python build/tools/assist/build_worker.py)", () => {
  const stamp = s => s.replace(/const VERSION = "[^"]*"/, 'const VERSION = ""');
  assert.equal(stamp(readFileSync(join(HERE, "..", "..", "src", "cloudflare-worker.js"), "utf8")), stamp(build("x")));
});

test("the relay carries only code it uses (shared code it doesn't need belongs in the pages' own files: core/js/page-text.js, when.js, where.js, sheet-load.js)", () => {
  const code = build("x").replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "").replace(/\.\.\./g, " ");   // no comments; "...f(x)" uses f
  const names = [...code.matchAll(/^(?:const|let|var|async function\*?|function\*?)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1])
    .concat([...code.matchAll(/^const [^\n]*$/gm)].flatMap(l => [...l[0].matchAll(/,\s*([A-Za-z_$][\w$]*)\s*=/g)].map(m => m[1])));
  const uses = n => code.match(new RegExp(`(?<![\\w$.])${n.replace(/\$/g, "\\$")}(?![\\w$])`, "g")).length - 1;
  assert.deepEqual([...new Set(names)].filter(n => !uses(n)), []);
});

test("only this site, with the access code", async () => {
  assert.equal((await call("/", {}, { method: "OPTIONS" })).status, 204);
  assert.equal((await call("/verify", {}, { origin: "https://elsewhere.test" })).status, 403);
  const bad = await call("/verify", {}, { code: "wrong" });
  assert.deepEqual([bad.status, (await bad.json()).error], [401, "bad_code"]);
  const ok = await (await call("/verify", {})).json();
  assert.deepEqual([ok.ok, ok.version], [true, "test"]);
});

test("a plan: chosen only from the services within reach, with the site's schedule rules, and only real records come back", async () => {
  sheet = SHEET; NOW = Date.parse("2026-11-16T10:30:00Z");
  ai = body => {
    const ids = idsIn(body.messages[0].content);
    return streamed(JSON.stringify({ reading: "r", core_needs: ["isolation"], core_covered: "yes", picks: [
      { id: ids["Test Weekly Drop-in"], step: "First step", why: "a held space" }, { id: 9999, step: "Next step", why: "made up" },
      { id: ids["Test Online Group"], step: "Next step", why: "from home" }] }));
  };
  const res = await (await ask()).json();
  const prompt = asked.at(-1).messages[0].content;
  assert.match(prompt, /It is now Monday,? 16 November 2026 at 10:30 \(UK time\)/);
  const line = name => prompt.split("\n").find(l => l.includes(`| ${name} |`)) || "";
  assert.match(line("Test Weekly Drop-in"), /\| Wed 10:00-12:00 \| Wed,? 18 Nov, 10:00–12:00 \| Wells \(0\.\d mi\) \|/, "the next session as the directory shows it");
  assert.match(line("Test One-off Outreach"), /dates: 2026-12-17 10:00-12:00 \| Thu,? 17 Dec, 10:00–12:00/);
  assert.match(line("Test Counselling"), /\| By appointment \|/);
  assert.match(line("Test 24/7 Line"), /\| Today, 00:00–23:59 \|/);
  for (const far of ["Test Monthly Group", "Test Evening Group", "Test Saturday Walk"]) assert.equal(line(far), "", `${far}: not within 5 miles`);
  assert.equal(line("Test Ended Group"), "", "all its dates have passed");
  assert.deepEqual(res.picks.map(p => [p.step, p.record.name]), [["First step", "Test Weekly Drop-in"], ["Next step", "Test Online Group"]], "an id that wasn't offered is dropped");
  assert.equal(res.picks[0].record.description, "A made-up service for the tests.", "the card's details come from the sheet");
  assert.ok(!("_days" in res.picks[0].record) && !("lat" in res.picks[0].record), "only the public fields go back");
  assert.equal(res.scope.place, "within 5 miles of Wells (Somerset Council area)");
});

test("bank holidays, as the directory shows them", async () => {
  NOW = Date.parse("2026-12-21T10:30:00Z");   // Monday 21 December
  sheet = SHEET + "\nTest Friday Group,Test Provider,Peer group,drop in,low mood,in-person,https://example.org/,A made-up service for the tests.,anyone,,,Fri,10:00-12:00,,,,Wells,Somerset,BA5 1AA,,,,test,16/11/2026,51.2100,-2.6450";
  ai = () => streamed(JSON.stringify({ picks: [] }));
  await ask({ need: "Feeling low, would like a group nearby" });
  assert.match(asked.at(-1).messages[0].content, /\| Test Friday Group \|.*\| Fri,? 25 Dec, 10:00–12:00 \(bank holiday: check it's running\) \|/);
});

test("UK time, though Cloudflare runs on UTC: just after midnight in summer it's already the next day", async () => {
  NOW = Date.parse("2027-07-07T23:30:00Z");   // 00:30 on Thursday 8 July 2027 in the UK (BST): later than the other tests, as the sheet is kept 5 minutes
  sheet = SHEET; ai = () => streamed(JSON.stringify({ picks: [] }));
  await ask();
  const prompt = asked.at(-1).messages[0].content;
  assert.match(prompt, /It is now Thursday,? 8 July 2027 at 00:30 \(UK time\)/);
  assert.match(prompt, /\| Test Weekly Drop-in \|.*\| Wed,? 14 Jul, 10:00–12:00 \|/, "Wednesday 7 July is over");
});

test("online search: personal details removed from the search; only real, contactable services from the pages found; the plan's rules kept", async () => {
  NOW = Date.parse("2026-11-16T10:30:00Z");
  const find = (over = {}) => ({ name: "Example Support Group", provider: "Example", what: "A peer group for people with anxiety", access: "drop in", mode: "in-person",
    days: "Tue", times: "10:00-12:00", address: "Hall, 1 High Street", town: "Wells", phone: "01234 567890", email: "info@example.org", url: "https://example.org/group", step: "First step", why: "fits", ...over });
  ai = () => new Response(JSON.stringify({ stop_reason: "end_turn", content: [
    { type: "web_search_tool_result", content: [{ url: "https://www.example.org/a" }, { url: "https://safe.example.org/b" }] },
    { type: "text", text: JSON.stringify({ keep: [{ n: 2, step: "Next step" }], items: [
      find({ phone: "07700 900123", email: "someone@gmail.com" }),                      // a mobile and a personal email: not shown
      find({ name: "Not From The Search", url: "https://invented.test/x" }),              // a page the search didn't return: dropped
      find({ name: "Crisis Safe Space Wells", url: "https://safe.example.org/b", step: "Next step" }),   // its address is never shown
      find({ name: "Fourth", step: "When ready" }), find({ name: "Fifth", step: "When ready" }),          // at most 3 online finds
    ] }) }] }), { headers: { "Content-Type": "application/json" } });
  const r = await call("/web", { search_for: "bereavement support for client John Smith 07700 900123 near Wells", core_needs: ["grief"], place: "Wells", core_covered: "partly",
    picks: [{ name: "Test Weekly Drop-in", step: "First step", what: "a group" }, { name: "Test Online Group", step: "Next step", what: "online" }] });
  const res = await r.json(), prompt = asked.at(-1).messages[0].content;
  assert.ok(!/John Smith|07700/.test(prompt), "no name or phone number reaches the search");
  assert.deepEqual(res.items.map(i => i.name), ["Example Support Group", "Crisis Safe Space Wells", "Fourth"]);
  assert.deepEqual([res.items[0].phone, res.items[0].email], ["", ""]);
  assert.equal(res.items[1].address, "");
  assert.equal(res.items[0].step, "Next step", "the directory has a first step, so an online find isn't one");
  assert.deepEqual(res.keep.map(k => [k.n, k.step]), [[1, "First step"], [2, "Next step"]], "the directory's first step stays");
});

test("tasks: each address does one job; each task can have its own model; the request to the AI service is as before", async () => {
  NOW = Date.parse("2026-11-16T10:30:00Z"); sheet = SHEET;
  ai = () => streamed(JSON.stringify({ picks: [] }));
  for (const path of ["/", "/plan", "/anything-else"]) {   // a plan, at its own address or (as the Assist page has always asked) any other
    const r = await call(path, { need: "Feeling low, would like a group nearby", town: "__pt", lat: 51.209, lon: -2.645, radius: 5 });
    assert.equal(r.status, 200, path);
    assert.ok("picks" in await r.json(), path);
  }
  const sent = asked.at(-1);
  assert.deepEqual([sent.model, sent.max_tokens, sent.stream, sent.messages.length], ["claude-sonnet-5-5", 8000, true, 1]);
  const withEnv = (extra, body) => worker.fetch(new Request("https://relay.test/plan", { method: "POST",
    headers: { Origin: ORIGIN, "X-Access-Code": CODE, "Content-Type": "application/json", "CF-Connecting-IP": "10.0.1." + ++ip }, body: JSON.stringify(body) }), { ...ENV, ...extra });
  const body = { need: "Feeling low", town: "__pt", lat: 51.209, lon: -2.645, radius: 5 };
  await withEnv({ MODEL: "model-all" }, body); assert.equal(asked.at(-1).model, "model-all");
  await withEnv({ MODEL: "model-all", MODEL_PLAN: "model-plan" }, body); assert.equal(asked.at(-1).model, "model-plan", "MODEL_PLAN wins for plans");
});
