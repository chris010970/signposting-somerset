// Browser tests: the published pages in docs/, opened in a real browser (Chromium, through Playwright).
// The directory and tools pages read a small made-up sheet (fixtures/services.csv) with the clock fixed, so what they
// should show is known exactly; the Places pages are checked as built, from the real sheet.
// Also checked: the HTML (html-validate) and accessibility (axe-core) of every kind of page.
//
// Setup, once:  cd build/tests && npm install && npx playwright install chromium
// Run:          python build/tests/run_tests.py   (or: node --test build/tests/browser.test.mjs)
process.env.TZ = "Europe/London";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { HtmlValidate } from "html-validate";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(HERE, "..", "..");
const DOCS = join(ROOT, "docs");
const BASE = (JSON.parse(readFileSync(join(ROOT, "build", "site.json"), "utf8")).base_path || "").replace(/\/$/, "");
const SHEET = readFileSync(join(HERE, "fixtures", "services.csv"), "utf8");
const AXE = readFileSync(join(HERE, "node_modules", "axe-core", "axe.min.js"), "utf8");
const LEAFLET = process.env.TEST_LEAFLET ? readFileSync(process.env.TEST_LEAFLET, "utf8") : null;   // a local copy, where the internet can't be reached
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".geojson": "application/json",
  ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".xml": "application/xml" };
const MON = "2026-11-16T10:30:00";   // Monday 16 November 2026, mid-morning

let server, browser, H;
before(async () => {
  server = createServer((req, res) => {   // docs/, served from the site's folder as GitHub Pages does
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (!p.startsWith(BASE + "/")) { res.writeHead(404); return res.end(); }
    let f = join(DOCS, p.slice(BASE.length));
    if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html");
    if (!existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": TYPES[extname(f)] || "application/octet-stream" }); res.end(readFileSync(f));
  }).listen(0);
  H = `http://localhost:${server.address().port}${BASE}`;
  browser = await chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });   // real scrollbars, as on Windows
});
after(async () => { await browser?.close(); server?.close(); });

// A page with the clock fixed and the made-up sheet; fonts and map tiles are left out (not needed, and slow)
async function open(path, { when = MON, width = 1400, js = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, javaScriptEnabled: js, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();
  page.errors = []; page.on("pageerror", e => page.errors.push(String(e)));
  if (js) await page.clock.setFixedTime(new Date(when));
  await page.route("**/*", r => {
    const u = r.request().url();
    if (/docs\.google|googleusercontent/.test(u)) return r.fulfill({ status: 200, contentType: "text/csv", body: SHEET });
    if (LEAFLET && /leaflet\.js$/.test(u)) return r.fulfill({ status: 200, contentType: "text/javascript", body: LEAFLET });
    if (u.startsWith("http://localhost") || /cdnjs\.cloudflare\.com/.test(u)) return r.continue();
    return r.abort();
  });
  await page.goto(H + path); await page.waitForTimeout(js ? 800 : 100);
  page.done = () => ctx.close();
  return page;
}
const text = (page, sel) => page.$eval(sel, e => e.textContent.replace(/\s+/g, " ").trim());
const cards = (page, sel = "#list .card") => page.$$eval(sel, cs => cs.map(c => c.querySelector(".cname").textContent));

test("In person: what shows for each When? choice", async () => {
  const p = await open("/test/directory/#near");
  const expect = {   // [summary, cards], Monday 10:30
    week: ["Showing 7 services · 3 need times checking", ["Test Evening Group", "Test Weekly Drop-in", "Test Town Centre Group", "Test Saturday Walk"]],
    today: ["Showing 4 services · 3 need times checking", ["Test Evening Group"]],
    evening: ["Showing 4 services · 3 need times checking", ["Test Evening Group"]],
    tomorrow: ["Showing 3 services · 3 need times checking", []],
    weekend: ["Showing 4 services · 3 need times checking", ["Test Saturday Walk"]],
    month: ["Showing 8 services · 3 need times checking", ["Test Evening Group", "Test Weekly Drop-in", "Test Town Centre Group", "Test Saturday Walk", "Test Monthly Group"]],
    any: ["Showing 9 services · 3 need times checking", ["Test Evening Group", "Test Weekly Drop-in", "Test Town Centre Group", "Test Saturday Walk", "Test Monthly Group", "Test One-off Outreach"]],
  };
  for (const [w, [summary, names]] of Object.entries(expect)) {
    await p.selectOption("#f-when", w);
    assert.equal(await text(p, "#summary"), summary, w);
    const shown = await cards(p), checks = ["Test Fortnightly Group", "Test Website Group", "Test Counselling"];
    assert.deepEqual(shown.filter(n => !checks.includes(n)), names, w);
    assert.deepEqual(shown.filter(n => checks.includes(n)).sort(), [...checks].sort(), w + ": times to check");
  }
  await p.selectOption("#f-when", "week");
  assert.match(await text(p, ".morehint"), /1 more meets later this month/);
  assert.ok(!(await cards(p)).includes("Test Ended Group"), "a group whose dates have passed is hidden");
  assert.deepEqual(p.errors, []);
  await p.done();
});

test("In person: a one-off date shows in its week, and dates written the spreadsheet's way work", async () => {
  const p = await open("/test/directory/#near", { when: "2026-12-15T09:00:00" });
  assert.ok((await cards(p)).includes("Test One-off Outreach"));
  assert.equal(await p.$eval("#c2 .next .val", e => e.textContent), "Thu, 17 Dec, 10:00–12:00");
  await p.done();
});

test("In person: a town, distances, the card's details and Copy details", async () => {
  const p = await open("/test/directory/#near");
  await p.selectOption("#f-town", "Wells");
  assert.equal(await text(p, "#summary"), "Showing 3 services within 10 miles of Wells · 1 need times checking");
  assert.deepEqual(await cards(p), ["Test Weekly Drop-in", "Test Town Centre Group", "Test Counselling"]);
  const c = await p.$("#c0");
  assert.match(await c.innerText(), /Just turn up[\s\S]*FREE[\s\S]*Test Weekly Drop-in[\s\S]*GROUPS AND COMMUNITY[\s\S]*Low mood, Anxiety[\s\S]*Wed, 18 Nov, 10:00–12:00/);
  assert.ok(await p.$("#c0 a.dirs"), "directions for a service with a postcode");
  assert.ok(!(await p.$("#c9 a.dirs")), "no directions for a town-centre (approximate) place");
  assert.match(await text(p, "#c9 .foot"), /approx\. location/);
  await p.click("#c0 button.copy");
  assert.match(await p.evaluate(() => navigator.clipboard.readText()), /^Test Weekly Drop-in \(Test Provider\)\nEvery Wed, 10am–12pm · Just turn up · Free/);
  await p.selectOption("#f-town", "");
  await p.selectOption("#f-when", "any");
  assert.ok(!(await p.$("#c7 .foot a[href^='javascript']")), "a javascript: address never becomes a link");
  await p.done();
});

test("Phone and online, and Courses", async () => {
  const p = await open("/test/directory/#talk");
  assert.match(await text(p, "#talk-list"), /Open 24\/7 Test 24\/7 Line/);
  assert.match(await text(p, "#talk-list"), /Next tomorrow 19:00.*Test Online Group/);
  await p.check("#t-open");
  assert.deepEqual(await p.$$eval("#talk-list .tcard h3", hs => hs.map(h => h.textContent)), ["Test 24/7 Line"]);
  await p.click("#tab-course");
  assert.match(await text(p, "#courses"), /Starts 23 Nov.*Test Course.*4 sessions · 23 Nov to 14 Dec/);
  assert.match(await text(p, "#courses"), /Rolling.*Test Rolling Course/);
  assert.deepEqual(p.errors, []);
  await p.done();
});

test("Links and remembered choices", async () => {
  const p = await open("/test/directory/?support=bereavement&town=Wells&when=any#near");
  assert.equal(await text(p, "#summary"), "Showing 1 service for Bereavement within 10 miles of Wells");
  await p.selectOption("#f-support", ""); await p.selectOption("#within", "5"); await p.selectOption("#f-when", "week");
  await p.click("#tab-talk"); await p.selectOption("#t-support", "anxiety");
  await p.goto(H + "/test/directory/"); await p.waitForTimeout(800);   // back later in the visit, without a link
  assert.deepEqual(await p.evaluate(() => ["f-town", "within", "f-when", "t-support"].map(i => document.getElementById(i).value)), ["Wells", "5", "week", "anxiety"]);
  await p.done();
});

test("Scroll positions: each tab, and Places, are where they were left", async () => {
  const p = await open("/test/directory/#talk");
  const top = id => p.evaluate(i => document.getElementById(i).scrollTop, id);
  const scroll = async (id, y) => { await p.evaluate(([i, v]) => { document.getElementById(i).scrollTop = v; }, [id, y]); await p.waitForTimeout(300); };
  await p.setViewportSize({ width: 1400, height: 400 });   // short, so the made-up sheet's lists scroll
  await scroll("panel-talk", 120);
  await p.click("#tab-near"); await p.waitForTimeout(300); await scroll("list", 300);
  await p.click("#tab-talk"); assert.equal(await top("panel-talk"), 120, "Phone and online, after In person");
  await p.click("#tab-near"); await p.waitForTimeout(300); assert.equal(await top("list"), 300, "In person, after Phone and online");
  await p.selectOption("#f-when", "month"); assert.equal(await top("list"), 0, "In person: new filters start at the top");
  await scroll("list", 250);
  await p.goto(H + "/test/directory/places/wells/"); await p.waitForTimeout(600);
  await p.evaluate(() => { document.querySelector(".bw").scrollTop = 900; }); await p.waitForTimeout(300);
  await p.click('.sitetabs a[href$="#talk"]'); await p.waitForTimeout(800);
  assert.equal(await top("panel-talk"), 120, "Phone and online, coming back from Places");
  await p.click("#tab-near"); await p.waitForTimeout(300); assert.equal(await top("list"), 250, "In person, coming back from Places");
  await p.click("#tab-places"); await p.waitForTimeout(800);   // the directory's Places tab: the town and place left on the Places page
  assert.match(await text(p, "#places-main .bt"), /Wells/, "Places tab opens on the town from the Places page");
  assert.equal(await top("panel-places"), 900, "Places tab, where the Places page was left");
  await scroll("panel-places", 600);
  await p.click("#tab-talk"); await p.click("#tab-places"); assert.equal(await top("panel-places"), 600, "Places tab, after Phone and online");
  // "On the map →": In person, filtered, from the top (clicked as it is, without scrolling it into view first)
  await p.evaluate(() => document.querySelector("#places-main .bsec a.bmap").click()); await p.waitForTimeout(800);
  assert.equal(await top("list"), 0, "In person, opened by On the map");
  await p.click("#tab-talk"); assert.equal(await top("panel-talk"), 120, "Phone and online still where it was");
  await p.click("#tab-places"); assert.equal(await top("panel-places"), 600, "Places tab still where it was");
  await p.done();
});

test("Alignment: on every tab and Places, nothing moves sideways or up and down (with real scrollbars, as on Windows; narrow windows too)", async () => {
  const tops = {};
  for (const width of [837, 1000, 1400, 1464, 1920]) for (const path of ["/test/directory/#near", "/test/directory/#talk", "/test/directory/#course",
      "/test/directory/#places", "/test/directory/#about", "/test/directory/places/", "/test/directory/places/wells/", "/test/tools/#about"]) {
    const p = await open(path, { width });
    const off = await p.evaluate(() => {
      const el = document.querySelector("#panel-near:not([hidden]) #list .card, main:not([hidden]) .tcard, main:not([hidden]) .aboutpage, .bmain > :first-child");
      return Math.round(el.getBoundingClientRect().left - document.querySelector("header .inner").getBoundingClientRect().left);
    });
    assert.equal(off, 0, `${width}px ${path}`);
    // Up and down: About has no filter boxes, so its header is shorter by design; under 900px the filter boxes stack
    // (In person has four, the others three), so there only the sideways position is the same
    if (!path.endsWith("#about") && width >= 900) {
      const at = await p.evaluate(() => {
        const text = e => { const r = document.createRange(); r.selectNodeContents(e); return r.getBoundingClientRect().top; };
        return [text(document.querySelector(".sitetabs button, .sitetabs a.tab")), document.querySelector("header.top").getBoundingClientRect().bottom,
          document.querySelector("#panel-near:not([hidden]) #list .card, main:not([hidden]) .talk > :first-child, .bmain > :first-child").getBoundingClientRect().top].map(v => Math.round(v * 10) / 10);
      });
      tops[width] ??= at;
      assert.deepEqual(at, tops[width], `${width}px ${path}: the tab titles, the header's foot and the content start at the same height as on the other tabs`);
    }
    assert.ok(await p.evaluate(() => document.documentElement.scrollHeight <= innerHeight), `${width}px ${path}: the page itself has nothing to scroll`);
    await p.done();
  }
});

test("Tools page: Assist asks for the access code; Analytics opens", async () => {
  const p = await open("/test/tools/#assist");
  assert.ok(await p.isVisible("#a-gate"), "the access code form");
  await p.click("#tab-about");
  assert.match(await text(p, "#about-page"), /About Assist/);
  await p.click("#tab-analytics"); await p.waitForTimeout(1500);
  assert.match(await text(p, "#panel-analytics"), /Most deprived half/);
  assert.deepEqual(p.errors, []);
  await p.done();
});

test("Places tab: the town listings inside the directory, with no page reload", async () => {
  const p = await open("/test/directory/#near");
  let loads = 0; p.on("load", () => loads++);
  const tabText = () => p.evaluate(() => [...document.querySelectorAll(".sitetabs button")].map(b => { const r = document.createRange(); r.selectNodeContents(b); return Math.round(r.getBoundingClientRect().top * 10) / 10; }));
  const before = await tabText();
  await p.click("#tab-places"); await p.waitForTimeout(600);
  assert.deepEqual(await tabText(), before, "the tab titles don't move");
  assert.equal(await text(p, "#places-main .bt"), "Places", "opens on the choose-a-town page");
  await p.selectOption("#b-town", { label: "Wells" }); await p.waitForTimeout(600);
  assert.match(await text(p, "#places-main .bhead .bt"), /Support in and around Wells/);
  assert.ok(await p.$$eval("#places-main li[data-i]:not([hidden]) .card button.copy", bs => bs.length) > 10, "cards with Copy details");
  await p.click("#places-main li[data-i]:not([hidden]) .card button.copy");
  assert.ok((await p.evaluate(() => navigator.clipboard.readText())).length > 20, "Copy details copies the service");
  await p.selectOption("#b-support", "bereavement"); await p.selectOption("#b-when", "week");
  await p.click("#tab-talk"); await p.click("#tab-places");
  assert.deepEqual(await p.evaluate(() => ["b-town", "b-support", "b-when"].map(i => document.getElementById(i).selectedOptions[0].textContent)),
    ["Wells", await p.$eval("#b-support", s => s.selectedOptions[0].textContent), "Next 7 days"]);
  const link = await p.evaluate(() => location.search + location.hash);
  assert.match(link, /^\?place=wells&support=bereavement&when=week#places$/, "the address names the town and its filters");
  await p.click('#places-main a[href$="#talk"]'); assert.equal(await p.evaluate(() => tab), "talk", "phone and online link opens that tab");
  assert.equal(loads, 0, "no page loads");
  assert.deepEqual(p.errors, []);
  await p.done();
  // That address, opened afresh (a shared link): the same town and filters
  const q = await open("/test/directory/" + link);
  assert.match(await text(q, "#places-main .bhead .bt"), /Support in and around Wells/, "a shared link opens its town");
  assert.deepEqual(await q.evaluate(() => [document.getElementById("b-support").value, document.getElementById("b-when").value]), ["bereavement", "week"]);
  assert.equal(await q.evaluate(() => location.search + location.hash), link, "and keeps its address");
  assert.deepEqual(q.errors, []);
  await q.done();
  const bad = await open("/test/directory/?place=nowhere#places");
  assert.equal(await text(bad, "#places-main .bt"), "Places", "an unknown town opens the choose-a-town page");
  await bad.done();
});

test("Back to the directory: every tab's filters are as they were (the browser doesn't put back old values)", async () => {
  const p = await open("/test/directory/#near");
  await p.selectOption("#f-town", "Taunton"); await p.selectOption("#f-support", "low mood"); await p.selectOption("#within", "5"); await p.selectOption("#f-when", "month");
  await p.click("#tab-talk"); await p.selectOption("#t-area", "local"); await p.check("#t-open");
  await p.click("#tab-places"); await p.waitForTimeout(600); await p.selectOption("#b-town", { label: "Frome" }); await p.waitForTimeout(600);
  await p.click(".sitetabs a.tolink"); await p.waitForTimeout(600);
  await p.goBack(); await p.waitForTimeout(1200);
  assert.equal(await p.evaluate(() => document.getElementById("b-town").selectedOptions[0].textContent), "Frome", "Places");
  await p.click("#tab-near"); await p.waitForTimeout(300);
  assert.deepEqual(await p.evaluate(() => ["f-town", "f-support", "within", "f-when"].map(i => document.getElementById(i).value)), ["Taunton", "low mood", "5", "month"], "In person");
  assert.match(await text(p, "#summary"), /Low mood within 5 miles of Taunton/, "and its list matches its filters");
  await p.click("#tab-talk");
  assert.deepEqual(await p.evaluate(() => [document.getElementById("t-area").value, document.getElementById("t-open").checked]), ["local", true], "Phone and online");
  assert.deepEqual(p.errors, []);
  await p.done();
});

test("On the map → from Places: In person at the same town, support, distance and 3. When?", async () => {
  const p = await open("/test/directory/#places"); await p.waitForTimeout(400);
  await p.selectOption("#b-town", { label: "Taunton" }); await p.waitForTimeout(600);
  await p.selectOption("#b-when", "week");
  await p.evaluate(() => document.querySelector("#places-main .bsec:not([hidden]) a.bmap").click()); await p.waitForTimeout(800);
  assert.equal(await p.evaluate(() => tab), "near");
  const within = await p.$eval("#within", s => s.value);
  assert.ok(+within >= 8, `a distance covering the Places page's 8 miles (${within})`);
  assert.deepEqual(await p.evaluate(() => [document.getElementById("f-town").value, document.getElementById("f-when").value]), ["Taunton", "week"]);
  await p.done();
});

test("Quick exit: leaves the site, and Back doesn't return to it", async () => {
  const p = await open("/test/directory/#near");
  await p.route("https://www.bbc.co.uk/**", r => r.fulfill({ status: 200, contentType: "text/html", body: "<title>Weather</title>" }));
  await p.click(".crisis a.exit"); await p.waitForURL(/bbc\.co\.uk/);
  await p.goBack().catch(() => {}); await p.waitForTimeout(300);
  assert.ok(!/signposting|localhost/.test(p.url()), `Back goes to before the site, not to it (${p.url()})`);
  await p.done();
});

// The Places pages, as built from the real sheet
const TOWN_PAGES = readdirSync(join(DOCS, "test", "directory", "places")).filter(t => existsSync(join(DOCS, "test", "directory", "places", t, "index.html")));

test("Places: every card is the In person card, and matches the plain card search engines read", async () => {
  const fields = c => ({ badge: c.querySelector(".badge")?.textContent, chips: [...c.querySelectorAll(".chip")].map(x => x.textContent).join("|"),
    name: c.querySelector(".cname")?.textContent, kind: c.querySelector(".kind")?.textContent || "", meta: c.querySelector(".meta")?.textContent,
    desc: c.querySelector(".desc")?.textContent, who: c.querySelector(".who")?.textContent || "", foot: c.querySelector(".foot")?.innerHTML.replace(/\s+/g, " ") });
  const read = page => page.$$eval("li[data-i] .card", (cs, f) => cs.map(new Function("return " + f)()), fields.toString());
  for (const town of TOWN_PAGES) {
    const plain = await open(`/test/directory/places/${town}/`, { js: false }), live = await open(`/test/directory/places/${town}/`);
    const [a, b] = [await read(plain), await read(live)];
    assert.equal(b.length, a.length, town);
    a.forEach((x, i) => assert.deepEqual(b[i], x, `${town}: ${x.name}`));
    assert.equal(await live.$$eval("li[data-i] .card", cs => cs.filter(c => !c.querySelector("button.copy")).length), 0, `${town}: every card has Copy details`);
    assert.deepEqual(live.errors, [], town);
    await plain.done(); await live.done();
  }
});

test("Places: the counts match the cards shown, for every When? choice; switching town keeps it", async () => {
  const p = await open("/test/directory/places/wells/");
  for (const w of ["any", "today", "evening", "tomorrow", "weekend", "week", "month"]) {
    await p.selectOption("#b-when", w);
    const bad = await p.$$eval(".bsec:not([hidden])", ss => ss.filter(s => +s.querySelector(".bsh h2 span").textContent !==
      new Set([...s.querySelectorAll("li[data-i]:not([hidden])")].map(li => li.dataset.i)).size).map(s => s.id));
    assert.deepEqual(bad, [], w);
  }
  await p.selectOption("#b-when", "tomorrow");
  await p.evaluate(() => document.querySelector(".bw").scrollTop = 1500);
  assert.equal(await p.evaluate(() => document.querySelector("header.top").getBoundingClientRect().top > 0 && document.scrollingElement.scrollTop), 0, "the header stays; only the listings scroll");
  assert.ok(await p.evaluate(() => document.documentElement.scrollHeight <= innerHeight), "the page itself has nothing to scroll");
  assert.equal(await p.evaluate(() => Math.round(document.querySelector(".bmain").getBoundingClientRect().left - document.querySelector("header .inner").getBoundingClientRect().left)), 0, "the cards line up with the header");
  await p.selectOption("#b-town", { label: "Frome" }); await p.waitForTimeout(500);
  assert.deepEqual(await p.evaluate(() => [location.pathname.endsWith("/frome/"), document.getElementById("b-when").value, document.querySelector(".bw").scrollTop]), [true, "tomorrow", 0]);
  await p.done();
});

// Every kind of page: valid HTML (as built), and no serious accessibility problems (as shown, after the script has run)
const PAGES = ["/", "/directory/", "/test/directory/#near", "/test/directory/#talk", "/test/directory/#course", "/test/directory/#places", "/test/directory/#about",
  "/test/directory/places/", "/test/directory/places/wells/", "/test/tools/#assist", "/test/tools/#about", "/test/tools/#analytics"];

test("HTML: every published page is valid", async () => {
  const v = new HtmlValidate({ extends: ["html-validate:recommended"],
    rules: { "tel-non-breaking": "off", "no-inline-style": "off", "doctype-style": "off", "long-title": "off" } });   // matters of style, not correctness
  const walk = d => readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith(".html") && !e.name.startsWith("google") ? [join(d, e.name)] : []);
  const problems = [];
  for (const f of walk(DOCS)) {
    const r = await v.validateFile(f);
    for (const res of r.results) for (const m of res.messages) problems.push(`${f.slice(DOCS.length)}:${m.line}: ${m.message} (${m.ruleId})`);
  }
  assert.deepEqual(problems, []);
});

test("Accessibility: no serious problems on any kind of page, on a computer or a phone", async () => {
  const problems = [];
  for (const width of [1400, 390]) for (const path of PAGES) {
    const p = await open(path, { width });
    if (path.endsWith("#analytics") && width < 760) { await p.done(); continue; }   // Analytics is desktop only
    await p.waitForTimeout(700);
    await p.addScriptTag({ content: AXE });
    const v = await p.evaluate(async () => (await axe.run(document, { resultTypes: ["violations"] })).violations
      .filter(x => x.impact === "serious" || x.impact === "critical").map(x => `${x.id}: ${x.nodes.slice(0, 2).map(n => n.target.join(" ")).join(", ")}`));
    v.forEach(x => problems.push(`${width}px ${path}: ${x}`));
    await p.done();
  }
  assert.deepEqual(problems, []);
});
