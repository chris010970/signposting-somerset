// For you on the real page code, for each case in src/scenarios-foryou.json: the safety panel, the picks (what each is for,
// any line under it) and the buttons, with checks. No AI: each case says what the landing page's AI would have read.
// Run: node build/tests/run_foryou.mjs [--ids F01,F05] [--date 2026-11-30T10:00]   (needs: cd build/tests && npm install &&
// npx playwright install chromium; and python build/next/build.py first). Writes foryou-<date>.md beside the scenarios.
// The data is docs/assets/services.csv (the nightly copy of the sheet); the pages are build/next/github/next/.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
const { chromium } = createRequire(import.meta.url)("playwright");   // (build/tests/node_modules, or one installed for all)

const HERE = new URL(".", import.meta.url).pathname, ROOT = join(HERE, "..", "..");
const args = process.argv.slice(2), opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const all = JSON.parse(readFileSync(join(ROOT, "src", "scenarios-foryou.json"), "utf8")).scenarios;
const want = (opt("--ids") || "").split(",").filter(Boolean);
const cases = want.length ? all.filter(s => want.some(w => s.id === w || (w.endsWith("*") && s.id.startsWith(w.slice(0, -1))))) : all;
const when = opt("--date") || "2026-11-30T10:00";   // a Monday morning, so "soonest" means the same every run

const NEXT = join(ROOT, "build", "next", "github", "next"), CSV = join(ROOT, "docs", "assets", "services.csv");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png" };
const browser = await chromium.launch(), page = await browser.newPage();
await page.clock.setFixedTime(new Date(when));
await page.route("**/*", r => {
  const u = new URL(r.request().url());
  if (u.pathname.endsWith("services.csv") || u.hostname === "docs.google.com") return r.fulfill({ path: CSV, contentType: "text/csv" });
  if (u.hostname !== "fy.test") return r.fulfill({ status: 204, body: "" });   // (fonts, map tiles: not needed)
  let p = u.pathname.startsWith("/next/") ? join(NEXT, u.pathname.slice(6)) : join(ROOT, "docs", u.pathname);
  if (p.endsWith("/")) p += "index.html";
  return existsSync(p) ? r.fulfill({ path: p, contentType: TYPES[extname(p)] || "application/octet-stream" }) : r.fulfill({ status: 404, body: "" });
});
await page.goto("http://fy.test/next/directory/?fy=1#foryou");
await page.waitForFunction(() => typeof ALL !== "undefined" && ALL.length > 0, null, { timeout: 30000 });

const rows = [];
let passed = 0, goodN = 0, goodOf = 0;
for (const sc of cases) {
  const out = await page.evaluate(sc => {
    const point = sc.town && PLACE[sc.town] ? { lat: PLACE[sc.town][0], lon: PLACE[sc.town][1], label: sc.town, town: sc.town } : null;
    // (as fyChoices reads the landing page's session)
    sessionStorage.setItem("ss-foryou", JSON.stringify({ safety: sc.safety || [], prefs: sc.prefs || {}, activities: sc.activities || [],
      activity_terms: sc.terms || [], circumstances: sc.circumstances || [], age: sc.age ?? null }));
    const c = { ...fyChoices(), tags: sc.tags || [], point, also: null };
    c.area = fyArea(point);
    const now = new Date(), g = fySafety(c), panel = fyPanelRecs(c, g, now), picks = fyPicks(c, now, panel.map(r => r.s.id));
    const buttons = [...new DOMParser().parseFromString(fyButtons(c, g), "text/html").querySelectorAll("a.fyx")]
      .map(a => a.querySelector("b").textContent + ": " + a.querySelector("span span").textContent);
    const info = s => ({ id: s.record_id, name: s.name, provider: s.provider, type: s.type, area: s.area, who: s.who, restricted: s.restricted_to || "",
      activities: s.activities || "", miles: point && !isNaN(s.lat) && split(s.mode).includes("in-person") ? Math.round(miles(point, s) * 10) / 10 : null, out: !fyRestrict(s, c) });
    return { area: c.area, g, panel: panel.map(r => info(r.s)),
      picks: picks.map(p => ({ ...info(p.s), why: p.why, note: p.note || "", check: p.check || "", when: (p.nx && p.nx.txt) || (p.st ? (p.st.open ? "open now" : "closed now") : ""),
        hasActivity: split(p.s.activities || "").some(a => c.activities.includes(a)) })), buttons };
  }, sc);
  // The checks
  const notes = [];
  if (out.picks.some(p => p.out)) notes.push("a pick they can't go to");
  const provs = out.picks.map(p => (p.provider || p.name).toLowerCase());
  if (new Set(provs).size < provs.length) notes.push("two from one provider");
  if ((sc.activities || []).length && out.g !== "urgent" && out.g !== "own_behaviour" && !(out.picks[0] && out.picks[0].hasActivity) && !out.picks.some(p => /couldn't find/.test(p.note)))
    notes.push("the activity isn't first and no gap is said");
  const far = out.picks.filter(p => p.miles !== null && p.area !== "national" && p.area !== out.area);
  if (far.length) notes.push("from another area: " + far.map(p => p.name).join(", "));
  const good = sc.good || [], hit = out.picks.filter(p => good.includes(p.id)).length;
  if (good.length) { goodN += hit; goodOf += Math.min(good.length, 3); }
  passed += !notes.length;
  const line = p => `${p.why}${p.note ? ` ("${p.note}")` : ""}: ${p.name} [${p.id}] (${p.type}; ${p.area}${p.miles !== null ? `; ${p.miles} mi` : ""}${p.when ? `; ${p.when}` : ""})${p.check ? ` <${p.check}>` : ""}${good.includes(p.id) ? " *" : ""}`;
  console.log(`\n${sc.id} ${notes.length ? "FAIL" : "pass"}  ${sc.text}\n  area ${out.area}${out.g ? `; panel ${out.g}: ${out.panel.map(p => p.name).join(", ")}` : ""}`);
  out.picks.forEach((p, i) => console.log(`  ${i + 1}. ${line(p)}`));
  if (!out.picks.length) console.log("  (no picks)");
  console.log(`  buttons: ${out.buttons.join(" | ")}`);
  if (good.length) console.log(`  reference picks: ${hit} of ${Math.min(good.length, 3)}`);
  if (notes.length) console.log("  <- " + notes.join("; "));
  rows.push(`| ${sc.id} | ${notes.length ? "**fail**" : "pass"} | ${sc.text} | ${out.g ? `${out.g}: ${out.panel.map(p => p.name).join(", ")}` : ""} | ${out.picks.map((p, i) => `${i + 1}. ${line(p)}`).join("<br>") || "none"} | ${out.buttons.join("<br>")} | ${good.length ? `${hit}/${Math.min(good.length, 3)}` : ""} | ${notes.join("; ")} |`);
}
await browser.close();
const summary = `${passed} of ${cases.length} passed the checks; reference picks found: ${goodN} of ${goodOf}`;
console.log("\n" + summary);
const path = join(ROOT, "src", `foryou-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "")}.md`);
writeFileSync(path, `# For you, as of ${when}: ${summary}\n\n* = one of the reference picks\n\n| id | result | what they said | safety panel | picks | buttons | reference | notes |\n|---|---|---|---|---|---|---|---|\n${rows.join("\n")}\n`);
console.log("Saved", path);
