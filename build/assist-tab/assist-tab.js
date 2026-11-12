/* ---------- Assist tab (v2 only) ----------
   Locked until a valid access code is entered. The code is checked by the Worker (server side);
   this page only remembers it for the current browser session. */
(() => {
const WORKER_URL = "/*WORKER_URL*/";
const PAGE_VERSION = "/*SITE_VERSION*/";
let relayVersion = "";
// The version line is at the bottom of the About tab: "Version: test 2026-11-06 11:30 · Assist relay 2026-11-06 11:07"
window.assistRelayVersion = () => relayVersion ? ` · Assist relay ${relayVersion}` : "";
function showVersion(v) { if (v) relayVersion = v; const el = document.getElementById("site-version"); if (el) el.textContent = `Version: ${PAGE_VERSION}${window.assistRelayVersion()}`; }
// "About Assist" section on the About tab: how it works, privacy, the lock button and the version
window.assistAbout = () => `<section>
    <h3>About Assist</h3>
    <p>Assist is a trial for invited support workers and volunteers. Describe someone's situation and it suggests a short plan of support, with the easiest steps first.</p>
    <ul>
      <li>Suggestions come from the services listed here, and every detail on those cards comes from the checked record itself.</li>
      <li>With <strong>Search online</strong> switched on, it also looks online for anything the directory doesn't cover. Those finds are marked <em>Found online, not checked</em>.</li>
      <li>Names, phone numbers and email addresses are removed before anything is sent, and the description itself is never sent to the online search: only a short search phrase and the nearest town.</li>
      <li>Please confirm details with the service before going, and use your own judgement, as always.</li>
    </ul>
    ${code ? `<p><button type="button" class="btn ghost" id="a-forget">Lock Assist on this device</button></p>` : ""}
    </section>`;
const SITE = "/*SITE_URL*/";   // the plan always points people to the public site
const RISK = /suicid|kill (my|him|her|them)sel|end (my|his|her|their) life|self[- ]?harm|cutting (my|him|her)|overdos|want(s|ed)? to die|no reason to live|better off dead/i;
const $a = id => document.getElementById(id);
const e_ = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// Code: this browser session only.
const sess = { get: k => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch {} } };
try { localStorage.removeItem("assist-code"); } catch {}   // never keep the code long-term

let code = sess.get("assist-code") || "";
let state = null;   // { need, town, radius, remote, followups: [], previous: [] }
const connected = WORKER_URL && !WORKER_URL.startsWith("/*");

document.body.append($a("a-printplan"));
function setLocked(locked) {
  $a("hdr-assist").classList.toggle("a-locked", locked);
  $a("tab-assist").classList.toggle("unlocked", !locked);
  $a("tab-assist-sr").textContent = locked ? " (access code needed)" : "";
  $a("tab-assist").title = locked ? "Assist: for invited support workers (access code needed)" : "Assist: AI-assisted support planning";
}
setLocked(!code);

// Called by the site when the tab is opened. The filter bar is always usable; the form needs the code.
window.assistShow = () => {
  if (!connected) { $a("a-noworker").hidden = false; return; }
  if (code) showApp(); else { pullFromMain(); showGate(); }
};
const WIDE = window.matchMedia("(min-width: 1000px)");
function mapIfWide() { if (WIDE.matches && !$a("a-app").hidden) { initAMap(); setTimeout(() => { if (amap) { amap.invalidateSize(); syncMap(); } }, 30); } }
WIDE.addEventListener?.("change", mapIfWide);
function showApp() { $a("a-gate").hidden = true; $a("a-app").hidden = false; setLocked(false); pullFromMain(); mapIfWide(); }
function showGate(msg) {
  $a("a-app").hidden = true; $a("a-gate").hidden = false; setLocked(true);
  $a("a-gateErr").hidden = !msg; $a("a-gateErr").textContent = msg || "";
  setTimeout(() => $a("a-code").focus(), 50);
}

// ---- unlock: the Worker checks the code without using the AI ----
$a("a-gate").onsubmit = async e => {
  e.preventDefault();
  const c = $a("a-code").value.trim(); if (!c) return;
  $a("a-codeBtn").disabled = true; $a("a-gateErr").hidden = true;
  try {
    const r = await fetch(WORKER_URL.replace(/\/$/, "") + "/verify", { method: "POST", headers: { "Content-Type": "application/json", "X-Access-Code": c }, body: "{}" });
    const d = await r.json().catch(() => ({}));
    showVersion(d.version);
    if (r.ok && d.ok) { code = c; sess.set("assist-code", c); $a("a-code").value = ""; showApp(); $a("a-need").focus(); }
    else showGate(d.error === "rate_limited" ? "Too many tries. Please wait an hour and try again." : d.error === "bad_code" ? "That code wasn't accepted." : "Couldn't check the code just now. Please try again.");
  } catch { showGate("Couldn't reach Assist. Check your connection and try again."); }
  finally { $a("a-codeBtn").disabled = false; }
};
// The lock button lives on the About tab, which is redrawn each time it opens
document.addEventListener("click", e => {
  if (!e.target.closest || !e.target.closest("#a-forget")) return;
  sess.set("assist-code", null); code = ""; state = null; $a("a-out").hidden = true; setLocked(true);
  if (typeof renderAbout === "function") renderAbout();
});

// ---- set up the form ----
function note(t) { $a("a-err").textContent = t; $a("a-err").hidden = !t; }
function busy(on, t) { $a("a-status").hidden = !on; $a("a-statusText").textContent = t || "Thinking..."; $a("a-ask").disabled = on || webBusy; }   // also stays off while an online search runs

// ---- where: the same places, distances and "Support for" as the In person tab, shared between the two tabs ----
// place = { kind: "place" | "pt" | "", name, lat, lon, label }. Only a rounded point is ever sent.
const round2 = x => Math.round(x * 100) / 100;          // about 1 km
const MILE = 1609.34;
let place = { kind: "" };
$a("a-town").innerHTML = '<option value="">Choose a place…</option><option value="__pt" hidden>Point on the map</option>'
  + PLACES.map(([g, ps]) => `<optgroup label="${e_(g)}">${ps.map(([n]) => `<option value="${e_(n)}">${e_(n)}</option>`).join("")}</optgroup>`).join("");
function nearest(p) {
  let best = null, bd = 1e9;
  for (const [t, c] of Object.entries(TOWNS)) { const d = Math.hypot((c[0] - p[0]) * 69, (c[1] - p[1]) * 43.5); if (d < bd) { bd = d; best = t; } }
  return best ? (bd < 1 ? best : `about ${Math.round(bd)} mile${Math.round(bd) === 1 ? "" : "s"} from ${best}`) : "on the map";
}
function setPlace(p) {
  place = p; clearPins();                                      // the pins belonged to the old place
  const sel = $a("a-town"), ptOpt = sel.querySelector('option[value="__pt"]');
  if (p.kind === "pt") { ptOpt.hidden = false; ptOpt.textContent = p.label; sel.value = "__pt"; }
  else { ptOpt.hidden = true; sel.value = p.kind === "place" ? p.name : ""; }
  $a("aq-where").classList.toggle("on", !!p.kind);
  syncMap(); pushToMain();
}
const placeByName = n => PLACE[n] ? { kind: "place", name: n, lat: PLACE[n][0], lon: PLACE[n][1] } : null;
$a("a-town").addEventListener("change", e => {
  const v = e.target.value;
  if (v === "__pt") return;                                   // already set by the map or location button
  setPlace(placeByName(v) || { kind: "" });
});
$a("a-rad").addEventListener("change", () => { syncMap(); pushToMain(); });
$a("a-support").addEventListener("change", () => { $a("aq-support").classList.toggle("on", !!$a("a-support").value); pushToMain(); });
// 3. How? All services (default), in person only, or phone/online only. Phone or online needs no place or distance.
const mode = () => $a("a-mode").value;
function syncMode() {
  const remoteOnly = mode() === "remote";
  for (const id of ["a-town", "a-rad", "a-uselocation"]) $a(id).disabled = remoteOnly;
  $a("aq-where").classList.toggle("a-off", remoteOnly);
  $a("aq-remote").classList.toggle("on", mode() !== "either");
}
$a("a-mode").addEventListener("change", syncMode);
syncMode();

// Shared with In person: what's chosen on one tab is there on the other
function pushToMain() {
  try {
    fs.value = $a("a-support").value;
    $a("within").value = $a("a-rad").value;
    if (place.kind === "place") { $a("f-town").value = place.name; origin = { lat: place.lat, lon: place.lon, label: place.name }; }
    else if (place.kind === "pt") {
      const lab = place.label === "Your location" ? "your location" : "the point on the map";
      setPtLabel(place.label); $a("f-town").value = "__pt"; origin = { lat: place.lat, lon: place.lon, label: lab }; }
    else { $a("f-town").value = ""; origin = null; }
    sortBy = origin ? "near" : "soon"; fitPending = true;
  } catch (e) { /* the In person tab isn't ready yet: nothing to share */ }
}
function pullFromMain() {
  $a("a-support").innerHTML = fs.innerHTML; $a("a-support").value = fs.value;
  $a("aq-support").classList.toggle("on", !!fs.value);
  const w = $a("within").value; $a("a-rad").value = w === "0" ? "20" : w;
  const t = $a("f-town").value;
  if (origin && PLACE[t]) place = placeByName(t);
  else if (origin) place = { kind: "pt", lat: round2(origin.lat), lon: round2(origin.lon), label: origin.label === "your location" ? "Your location" : "Point on the map (" + nearest([origin.lat, origin.lon]) + ")" };
  else place = { kind: "" };
  setPlace(place);
}

// ---- location button: rounded before use, like a map click ----
(() => {
  const btn = $a("a-uselocation");
  if (!("geolocation" in navigator)) return;
  btn.hidden = false;
  btn.onclick = () => {
    btn.disabled = true;
    navigator.geolocation.getCurrentPosition(p => {
      btn.disabled = false;
      setPlace({ kind: "pt", lat: round2(p.coords.latitude), lon: round2(p.coords.longitude), label: "Your location" });
    }, err => { btn.disabled = false; note(err.code === 1 ? "Location wasn't allowed. Choose a place or click the map instead." : "Location couldn't be found. Choose a place or click the map instead."); },
    { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 });
  };
})();

// ---- map: click roughly where the person is ----
let amap = null, marker = null, circle = null, pinLayer = null;
function initAMap() {
  if (amap || !window.L) return;
  amap = L.map("a-map", { zoomSnap: 0.25 }).setView([51.1, -2.95], 8);
  L.tileLayer("https://basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png?key=cb1_4v7b_1_0f5ea1a12b0919dd5e3cbbb7",
    { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>' }).addTo(amap);
  if (typeof OUTLINE !== "undefined" && OUTLINE) L.geoJSON(OUTLINE, { interactive: false, style: { color: "#3D6C53", weight: 1.5, dashArray: "4 4", fill: false } }).addTo(amap);
  amap.on("click", e => {
    const p = [round2(e.latlng.lat), round2(e.latlng.lng)];
    setPlace({ kind: "pt", lat: p[0], lon: p[1], label: "Point on the map (" + nearest(p) + ")" }); note("");
  });
}
function syncMap() {
  if (!amap) return;
  const c = place.kind === "place" || place.kind === "pt" ? [place.lat, place.lon] : null;
  if (!c) { if (marker) { marker.remove(); circle.remove(); marker = circle = null; } amap.setView([51.1, -2.95], 8); return; }
  const r = +$a("a-rad").value * MILE;
  if (!marker) { marker = L.circleMarker(c, { radius: 7, color: "#fff", weight: 2, fillColor: "#2F5441", fillOpacity: 1 }).addTo(amap); circle = L.circle(c, { radius: r, color: "#3D6C53", weight: 1.5, fillColor: "#528368", fillOpacity: .08, interactive: false }).addTo(amap); }
  else { marker.setLatLng(c); circle.setLatLng(c).setRadius(r); }
  amap.fitBounds(circle.getBounds(), { padding: [20, 20] });
}
$a("a-mapbtn").onclick = () => {
  const open = $a("a-mapbox").hidden;
  $a("a-mapbox").hidden = !open; $a("a-mapbtn").setAttribute("aria-expanded", open);
  if (open) { initAMap(); setTimeout(() => { amap && amap.invalidateSize(); syncMap(); }, 30); }
};

// ---- remove identifying details before anything is sent ----
/*SCRUB*/
function scrubAll(st) {
  const tally = {}, add = r => Object.entries(r).forEach(([k, v]) => tally[k] = (tally[k] || 0) + v);
  const a = scrub(st.need); add(a.removed);
  const f = st.followups.map(x => { const r = scrub(x); add(r.removed); return r.text; });
  const msg = Object.entries(tally).map(([k, v]) => `${v} ${k}${v > 1 ? "s" : ""}`).join(", ");
  $a("a-scrubnote").textContent = msg ? `Removed before sending: ${msg}.` : ""; $a("a-scrubnote").hidden = !msg;
  return { ...st, need: a.text, followups: f };
}

// ---- ask ----
// chat-style keys: Enter sends, Shift+Enter is a new line (touch screens keep Enter as a new line)
const touchOnly = matchMedia("(hover: none), (pointer: coarse)").matches;
$a("a-need").addEventListener("keydown", e => {
  if (e.key !== "Enter" || e.shiftKey || e.isComposing || touchOnly) return;
  e.preventDefault();
  if (!$a("a-ask").disabled) $a("a-form").requestSubmit();
});
$a("a-form").onsubmit = e => {
  e.preventDefault();
  const need = $a("a-need").value.trim();
  if (!need) return note("Describe the need first.");
  if (need.replace(/[^a-z]/gi, "").length < 12 || !/[aeiou]/i.test(need)) return note("Please describe the person's situation in a few words, e.g. what's going on and what might help.");
  if (mode() !== "remote" && !place.kind) return note("Choose a place above or click the map first.");
  state = { need, radius: +$a("a-rad").value, remote: mode() !== "inperson", support: $a("a-support").value, online: onlineOn(), followups: [], previous: [] };
  if (mode() === "remote") state.town = "__remote";
  else { state.town = "__pt"; state.lat = round2(place.lat); state.lon = round2(place.lon); }
  run();
};
// "Search online" toggle in the prompt box: off by default, remembered only on this page
const onlineOn = () => $a("a-online").getAttribute("aria-pressed") === "true";
$a("a-online").onclick = () => { const on = !onlineOn(); $a("a-online").setAttribute("aria-pressed", on); if (state) state.online = on; };

const ERRORS = {
  bad_code: "That access code wasn't accepted.", rate_limited: "Too many requests from here in the last hour. Please try again later.",
  busy: "The AI service is busy. Please try again in a minute.", sheet_unavailable: "The records couldn't be loaded just now. Please try again shortly.",
  bad_town: "Please choose a town from the list.", bad_answer: "The answer came back in an unexpected shape. Please try again.",
  forbidden: "This page isn't allowed to use the relay.",
};
// The relay sends short progress lines while the AI works, then the finished plan as the last line.
// Only the waiting message changes until then: the plan is shown whole, once it's complete and checked.
// (An older relay sends the plan in one go; that still works.)
async function readPlan(r) {
  if (!(r.headers.get("Content-Type") || "").includes("ndjson") || !r.body) return r.json().catch(() => ({ error: "bad_answer" }));
  const reader = r.body.getReader(), dec = new TextDecoder();
  let buf = "", last = { error: "bad_answer" };
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      let m; try { m = JSON.parse(line); } catch { continue; }
      if (m.done) last = { ...m.result, version: m.version };
      else if (m.error) last = m;
      else if (m.stage === "thinking") busy(true, "Thinking about what would help…");
      else if (m.stage === "writing") busy(true, m.picks ? `Choosing services: ${m.picks} so far…` : "Choosing services…");
    }
    if (done) break;
  }
  return last;
}

async function run() {
  note(""); clearPins();
  // a new request replaces the old plan straight away, so an old plan is never mistaken for the answer
  $a("a-out").hidden = true; $a("a-out").innerHTML = ""; lastResult = null; lastPicks = [];
  $a("a-crisis").hidden = !RISK.test([state.need, ...state.followups].join(" "));
  const where = state.town === "__remote" ? "phone and online services" : `services within ${state.radius} miles of ${place.kind === "place" ? place.name : place.label.replace(/^Point on the map \((.*)\)$/, "$1")}`;
  busy(true, state.followups.length ? "Updating the suggestions…" : `Reading the need and looking through ${where}…`);
  try {
    const r = await fetch(WORKER_URL, { method: "POST", headers: { "Content-Type": "application/json", "X-Access-Code": code }, body: JSON.stringify({ ...scrubAll(state), stream: true }) });
    const data = await readPlan(r);
    showVersion(data.version);
    if (data.error) {
      if (data.error === "bad_code") { sess.set("assist-code", null); code = ""; showGate(ERRORS.bad_code); return; }
      if (data.error === "ai_error") return note("The AI service returned an error" + (data.status ? ` (${data.status})` : "") + (data.detail ? `: ${data.detail}` : "."));
      return note(ERRORS[data.error] || `Something went wrong (${data.error}). Please try again.`);
    }
    show(data);
  } catch { note("Couldn't reach the service. Check your connection and try again."); }
  finally { busy(false); }
}

let lastPicks = [];
const STEPS = ["First step", "Next step", "When ready"];
const normStep = s => STEPS.find(x => x.toLowerCase() === String(s).toLowerCase()) || "Next step";
const HOW = { "drop in": "Just turn up", "sign up": "Contact to join", "book": "Book first", "referral": "Needs a referral", "call": "Phone line" };
const HOWCLS = { "drop in": "ab-drop", "sign up": "ab-sign", "book": "ab-book", "referral": "ab-ref", "call": "ab-ref" };

let lastResult = null;
function show(r, keepScroll) {
  lastResult = r;
  if (r.risk) $a("a-crisis").hidden = false;
  state.previous = r.picks.map(p => p.record.name);   // (updated below once the plan is final)
  const sc = r.scope || {};
  // Directory picks, or (after an online search) the merged plan: the directory picks it kept plus the online finds, at most 8
  let dir = r.picks.map(p => ({ ...p, step: normStep(p.step) }));
  if (r.web?.keep) dir = r.web.keep.map(k => dir[k.n - 1] && { ...dir[k.n - 1], step: k.step || dir[k.n - 1].step }).filter(Boolean);
  // (the Worker has already applied the rules: directory first steps kept, online finds never first when the directory has one, 8 at most)
  const web = (r.web?.items || []).map(w => ({ step: normStep(w.step), why: w.why, web: w, record: webRecord(w), distance: null }));
  lastPicks = STEPS.flatMap(st => [...dir.filter(p => p.step === st), ...web.filter(p => p.step === st)]);
  lastPicks.forEach((p, i) => { p.n = i + 1; p.ll = p.web ? null : pinPos(p.record); });
  state.previous = lastPicks.map(p => p.web ? p.web.name : p.record.name);   // same numbers as the plan
  let m = `<div class="a-reshead"><h2>Suggestions</h2>`;
  if (lastPicks.length) m += `<div class="a-planbar"><button type="button" class="a-btn small" id="a-copyPlan">Copy plan</button>${navigator.share ? `<button type="button" class="a-btn small ghost" id="a-sharePlan">Share</button>` : ""}<button type="button" class="a-btn small ghost" id="a-printPlan">Print</button><span class="a-copied" id="a-copied" role="status"></span></div>`;
  m += `</div>`;
  if (r.reading && !r.off_topic) m += `<p class="a-readas"><b>Read as:</b> ${e_(r.reading)}</p>`;
  if (r.safety) m += `<p class="a-safety" role="note"><b>Safety:</b> ${e_(r.safety)} <span>(this goes at the top of the plan)</span></p>`;
  if (r.off_topic) m += `<p class="a-gaps">That doesn't look like a description of someone's situation, so no suggestions were made. Describe what's going on for the person and what might help.</p>`;
  else if (!lastPicks.length) m += `<p>No suitable services were found for this need and area. Try a wider distance.</p>`;
  else {
    m += `<ol class="a-ladder">`;
    STEPS.forEach((st, i) => {
      const list = lastPicks.filter(p => p.step === st); if (!list.length) return;
      m += `<li class="a-rung"><span class="a-rdot" aria-hidden="true">${i + 1}</span><h3>${st}</h3>${list.map(card).join("")}</li>`;
    });
    m += `</ol>`;
  }
  if (r.gaps) m += `<p class="a-gaps"><b>Not covered by the directory:</b> ${e_(r.gaps)}</p>`;
  m += webBar(r);
  if (r.questions?.length) m += `<div class="a-qs"><b>Questions that might help</b><ul>${r.questions.map(q => `<li>${e_(q)}</li>`).join("")}</ul></div>`;
  m += `<p class="a-scope">Chose from ${sc.total} of ${sc.records} services: ${[sc.near ? `${sc.near} in person ${e_(sc.place)}` : "", sc.remote ? `${sc.remote} phone or online` : ""].filter(Boolean).join(" and ")}.</p>`;
  // Test page only: how long each step took, to measure speed changes
  if (/\/test\//.test(location.pathname) && sc.timing) {
    const t = sc.timing, sec = ms => ms !== undefined ? (ms / 1000).toFixed(1) + "s" : "-";
    m += `<p class="a-scope">Timing: total ${sec(t.total_ms)} · AI ${sec(t.plan_ms)}: first output after ${sec(t.first_block_ms)}, writing started ${sec(t.text_start_ms)} · ${t.plan_in || "?"} tokens in, ${t.plan_out || "?"} out (${t.text_chars || 0} characters of answer${t.thinking_chars ? `, ${t.thinking_chars} of thinking` : ""}; ${e_(t.blocks || "")}) · ${e_(t.model || "")} (${e_(t.settings || "defaults")})</p>`;
  }
  const side = lastPicks.length ? `<aside class="a-preview" aria-label="Support plan"><div class="a-pv-label">Support plan</div><div class="a-pv-body">${plan().html}</div><p class="a-pv-hint">Copy it into an email or letter, share it by text, or print it.</p></aside>` : "";
  $a("a-out").innerHTML = `<div class="a-results"><div class="a-maincol">${m}</div>${side}</div>`;
  $a("a-out").hidden = false;
  if (lastPicks.length) {
    $a("a-copyPlan").onclick = copyPlan;
    $a("a-printPlan").onclick = () => { $a("a-printplan").innerHTML = plan().html; document.body.classList.add("a-printing"); window.print(); };
    if ($a("a-sharePlan")) $a("a-sharePlan").onclick = () => navigator.share({ title: "Things that might help", text: plan().text }).catch(() => {});
    $a("a-out").querySelectorAll(".a-preview a").forEach(a => { a.target = "_blank"; a.rel = "noopener"; });
  }
  showPins();
  if (!keepScroll) $a("a-out").scrollIntoView({ behavior: "smooth", block: "start" });
  // "Search online" is on: look online, then merge the finds into one plan
  if (!keepScroll && !r.web && state.online && !r.off_topic) searchWeb();
}

// ---- online search for the gap: only a short search phrase and the nearest town leave the page ----
let webBusy = false;
function webBar(r) {
  const q = r.web?.query || r.search_for || "";
  if (webBusy) return `<div class="a-webbar busy" role="status"><span class="a-spin" aria-hidden="true"></span>Searching online for: <i>${e_(q)}</i>…</div>`;
  if (!r.web) return "";
  const n = r.web.items.length;
  return `<div class="a-webbar" role="status">${n ? `Searched online for <i>${e_(q)}</i>: ${n} added, marked <span class="a-webtag">Found online, not checked</span>.` : `Searched online for <i>${e_(q)}</i>: ${e_(r.web.note || "nothing better was found.")}`}${r.web.error ? ` ${e_(r.web.error)}` : ""}</div>`;
}
async function searchWeb() {
  const r = lastResult; if (!r || webBusy) return;
  const q = scrub(r.search_for || (r.core_needs || []).join(" ") + " support " + (r.place || "Somerset")).text;
  webBusy = true; $a("a-ask").disabled = true; r.search_for = q; show(r, true);   // one request at a time: wait for the search
  let web;
  try {
    const res = await fetch(WORKER_URL.replace(/\/$/, "") + "/web", { method: "POST", headers: { "Content-Type": "application/json", "X-Access-Code": code },
      body: JSON.stringify({ search_for: q, core_needs: r.core_needs || [], constraints: scrub(r.constraints || "").text, place: r.place || "", gaps: r.gaps || "", remote: state.remote, core_covered: r.core_covered,
        picks: r.picks.map(p => ({ name: p.record.name, step: normStep(p.step), what: p.record.description || "" })) }) });
    const d = await res.json().catch(() => ({ error: "bad_answer" }));
    web = d.error ? { items: [], keep: null, query: q, error: d.error === "busy" ? "The online search is busy; try again in a minute." : d.error === "rate_limited" ? ERRORS.rate_limited : "The online search didn't work this time." } : { items: d.items || [], keep: d.keep || null, note: d.note, query: d.query || q };
  } catch { web = { items: [], keep: null, query: q, error: "Couldn't reach the online search." }; }
  webBusy = false; $a("a-ask").disabled = false;
  if (lastResult !== r) return;          // a newer request has replaced these results
  r.web = web; show(r, true);
}
// An online find arrives in the same fields as a sheet record, so it is shown with the same card and plan lines
function webRecord(w) {
  return { name: w.name, provider: w.provider || w.source || "", type: "", access: w.access || "", mode: w.mode || "online",
    days: w.days || "", times: w.times || "", frequency: w.frequency || "", dates: "", address: w.address || "", town: w.town || "", postcode: "",
    phone: w.phone || "", email: w.email || "", url: w.url, cost: w.cost || "", eligibility: w.eligibility || "", who: "",
    description: w.what || "", support_for: "", last_checked: "", note: w.note || "" };
}

// ---- picks on the small map: numbered like the cards and the plan ----
// Coordinates come from the site's own copy of the sheet (matched by name and postcode), so the AI never handles locations.
function pinPos(s) {
  if (!(s.mode || "").includes("in-person") || typeof ALL === "undefined") return null;
  const m = ALL.find(x => x.name === s.name && (x.postcode || "") === (s.postcode || "")) || ALL.find(x => x.name === s.name && x.town === s.town);
  return m && !isNaN(m.lat) ? { lat: m.lat, lon: m.lon, approx: !!m.approx } : null;
}
// same colours as the In person map key (by kind of service)
const kindCol = s => typeof pinCol === "function" ? pinCol(s) : "#64748B";
function clearPins() { if (pinLayer) { pinLayer.remove(); pinLayer = null; } }
function showPins() {
  clearPins();
  const pins = lastPicks.filter(p => p.ll); if (!amap || !pins.length) return;
  pinLayer = L.layerGroup().addTo(amap);
  pins.forEach(p => {
    const icon = L.divIcon({ className: "", html: `<span class="a-pin${p.ll.approx ? " approx" : ""}" style="--pc:${kindCol(p.record)}"><b>${p.n}</b></span>`, iconSize: [26, 26], iconAnchor: [13, 30] });
    L.marker([p.ll.lat, p.ll.lon], { icon, title: p.record.name, keyboard: true, riseOnHover: true })
      .bindTooltip(e_(p.record.name) + (p.ll.approx ? " (town centre: exact spot not listed)" : ""), { direction: "top", offset: [0, -28] })
      .on("click", () => { const d = document.getElementById("a-pick-" + p.n); if (d) { d.open = true; d.scrollIntoView({ behavior: "smooth", block: "center" }); d.classList.add("a-flash"); setTimeout(() => d.classList.remove("a-flash"), 1200); } })
      .addTo(pinLayer);
  });
  const pts = pins.map(p => [p.ll.lat, p.ll.lon]); if (place.lat) pts.push([place.lat, place.lon]);
  amap.fitBounds(L.latLngBounds(pts).pad(0.2), { maxZoom: 13 });
}
window.addEventListener("afterprint", () => document.body.classList.remove("a-printing"));

// Dates read as "Thu 26 Nov, Thu 11 Feb 2027" (year only when it isn't this year); past dates are left out
function shortDate(d) {
  const t = new Date(d + "T12:00:00"); if (isNaN(t)) return d;
  const o = { weekday: "short", day: "numeric", month: "short" }; if (t.getFullYear() !== new Date().getFullYear()) o.year = "numeric";
  return t.toLocaleDateString("en-GB", o).replace(",", "").replace("Sept", "Sep");
}
function datesText(raw) {
  const today = new Date().toISOString().slice(0, 10);
  const parts = raw.split(";").map(x => x.trim()).filter(Boolean)
    .filter(x => (x.split(" to ").pop()) >= today)
    .map(x => x.includes(" to ") ? x.split(" to ").map(shortDate).join(" to ") : shortDate(x));
  return parts.length > 5 ? parts.slice(0, 5).join(", ") + "…" : parts.join(", ");
}
// "Mon-Fri 09:00-20:00" reads as "Mon to Fri, 9am to 8pm"; "Mon-Sun 00:00-23:59" as "Every day, 24 hours"
const DAYN = { Mon: "Mon", Tue: "Tue", Wed: "Wed", Thu: "Thu", Fri: "Fri", Sat: "Sat", Sun: "Sun" };
function clock(t) { const m = /^(\d\d):(\d\d)$/.exec(t); if (!m) return t; const h = +m[1], mi = +m[2]; if (h === 12 && !mi) return "noon"; return `${h % 12 || 12}${mi ? ":" + m[2] : ""}${h < 12 ? "am" : "pm"}`; }
function timesText(t) { if (!t) return ""; if (/^00:00-23:59$/.test(t)) return "24 hours"; return t.split(/\s*[;,]\s*/).map(x => x.split("-").map(clock).join(" to ")).join(", "); }
function daysText(d) {
  d = (d || "").trim(); if (!d) return "";
  if (d === "Mon-Sun") return "Every day"; if (d === "Mon-Fri") return "Mon to Fri"; if (d === "Sat-Sun" || d === "Sat;Sun") return "Weekends";
  return d.split(";").map(x => x.trim().replace(/^(\w{3})-(\w{3})$/, "$1 to $2")).join(", ");
}
function whenText(s) {
  if (s.dates) { const d = datesText(s.dates); return d ? (d.includes(",") ? "Dates: " : "") + d + (s.times ? ", " + timesText(s.times) : "") : ""; }
  const f = (s.frequency || "").trim();
  if (/^see website$/i.test(f) && !s.days) return "Times on the website";
  return [[daysText(s.days), timesText(s.times)].filter(Boolean).join(", "), f && !/^see website$/i.test(f) ? f : ""].filter(Boolean).join(", ");
}
const telOf = s => s.phone ? s.phone.split(" (")[0].split(" or ")[0].replace(/\s/g, "") : "";
const isUrl = u => /^https?:\/\//.test(u || "");
const ICON = {
  phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>',
  online: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-6l1 2h2v2H7v-2h2l1-2H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm1 2v8h14V7z"/></svg>',
  place: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7zm0 4.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"/></svg>',
  web: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7h-2V6.4l-9.3 9.3-1.4-1.4L17.6 5H14zM5 5h6v2H6v11h11v-5h2v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/></svg>',
  person: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 11c4.4 0 8 2.2 8 5v2H4v-2c0-2.8 3.6-5 8-5z"/></svg>',
  cost: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 3A5.5 5.5 0 0 1 20 8.5h-2A3.5 3.5 0 0 0 14.5 5 3.5 3.5 0 0 0 11 8.5V11h5v2h-5v4h8v2H6v-2h3v-4H6v-2h3V8.5A5.5 5.5 0 0 1 14.5 3z"/></svg>',
  dirs: '<svg viewBox="0 0 24 24" aria-hidden="true" style="fill:none;stroke:currentColor;stroke-width:2.2;stroke-linejoin:round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>',
  mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm1 3.2V17h16V8.2l-8 5-8-5zM5.2 7 12 11.3 18.8 7z"/></svg>',
};
function actions(s) {
  const a = [];
  if (s.phone) {
    const text = /^text\s/i.test(s.phone);
    const num = text ? s.phone.replace(/^text\s*/i, "").replace(/\s/g, "") : telOf(s);
    const label = text ? `Text ${num}` : s.phone.split(" (")[0].split(" or ")[0];
    a.push(`<a class="a-act" href="${text ? "sms:" : "tel:"}${e_(num)}">${ICON.phone}${e_(label)}</a>`);
  }
  const pp = pinPos(s), dh = pp && typeof dirHref === "function" ? dirHref({ ...pp, postcode: s.postcode }) : "";
  if (dh) a.push(`<a class="a-act" href="${e_(dh)}" target="_blank" rel="noopener" aria-label="Directions to ${e_(s.name)}">${ICON.dirs}Directions</a>`);
  if (isUrl(s.url)) a.push(`<a class="a-act" href="${e_(s.url)}" target="_blank" rel="noopener">${ICON.web}Website</a>`);
  else if (s.email) a.push(`<a class="a-act" href="mailto:${e_(s.email)}">${ICON.mail}Email</a>`);
  return a.join("");
}
const NICE = { "hearing voices": "Psychosis and hearing voices", "crisis prevention": "Crisis support", "addiction": "Addiction", "abuse": "Abuse" };
function niceDate(d) { const t = new Date(d + "T12:00:00"); return isNaN(t) ? d : t.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
function tile(icon, label, html, cls = "") { return `<div class="a-pb-tile ${cls}"><div class="a-pb-lab">${ICON[icon] || ""}${label}</div><div class="a-pb-val">${html}</div></div>`; }
function card(p) {
  const s = p.record, w = whenText(s), mode = s.mode || "";
  const inPerson = mode.includes("in-person");
  const where = [s.address, s.town, s.postcode].filter(Boolean).join(", ");
  const dist = p.distance !== null && s.address ? ` (${p.distance} miles)` : "";
  const contact = [s.phone && `<a href="tel:${e_(telOf(s))}">${e_(s.phone)}</a>`, s.email && `<a href="mailto:${e_(s.email)}">${e_(s.email)}</a>`, isUrl(s.url) && `<a href="${e_(s.url)}" target="_blank" rel="noopener">Website</a>`].filter(Boolean).join(" · ");
  const modeBit = inPerson
    ? `<span class="a-m">${ICON.place}${e_(p.distance !== null && s.address ? `${p.distance} mi` : s.town)}</span>`
    : `<span class="a-m">${mode.includes("phone") ? ICON.phone : ""}${mode.includes("online") ? ICON.online : ""}${e_(mode.replace(/;/g, " / ").replace("phone", "Phone").replace("online", "Online"))}</span>`;
  const badges = (p.web ? `<span class="a-webtag">Found online, not checked</span>` : "") +
    (s.access ? `<span class="a-badge ${HOWCLS[s.access] || "ab-ref"}">${e_(HOW[s.access] || s.access)}</span>` : "") +
    `<span class="a-chip dist">${modeBit}</span>` + (s.cost ? `<span class="a-chip">${e_(s.cost)}</span>` : "");
  return `<details class="a-pick${p.web ? " a-webpick" : ""}" id="a-pick-${p.n}">
    <summary>
      <span class="a-pk-name">${p.ll ? `<span class="a-pk-num" style="--pc:${kindCol(s)}" title="Number ${p.n} on the map">${ICON.place}${p.n}</span>` : ""}${e_(s.name)}</span>
      <span class="a-pk-badges">${badges}</span>
      ${w ? `<span class="a-pk-when"><span class="a-wl">When</span>${e_(w)}</span>` : ""}
      <span class="a-pk-why">${e_(p.why)}</span>
      <span class="a-pk-acts">${actions(s)}</span>
    </summary>
    <div class="a-pk-body">
      ${s.provider || s.type ? `<div class="a-pb-prov">${e_(s.provider)}${s.type ? `<span>${e_(s.type)}</span>` : ""}</div>` : ""}
      <p class="a-pb-desc">${e_(s.description)}</p>
      <div class="a-pb-grid">
        ${inPerson && where ? tile("place", "Where", `${e_(where)}${dist}${s.address ? `<br><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(where)}" target="_blank" rel="noopener">Open in maps</a>` : ""}`) : ""}
        ${!inPerson ? tile(mode.includes("phone") ? "phone" : "online", "How", e_(mode.replace(/;/g, ", ").replace("phone", "Phone").replace("online", "Online"))) : ""}
        ${s.who || s.eligibility ? tile("person", "For", e_([s.who && s.who.replace(/;/g, ", "), s.eligibility].filter(Boolean).join(". ")), s.eligibility ? "warn" : "") : ""}
        ${s.cost ? tile("cost", "Cost", e_(s.cost)) : ""}
        ${contact ? tile("mail", "Contact", contact, "wide") : ""}
        ${s.note ? tile("person", "Note", e_(s.note), "wide warn") : ""}
      </div>
      <div class="a-pb-foot">${p.web ? `<span class="a-pb-tags">Found by an online search (${e_(p.web.source)}). Signposting Somerset hasn't checked it: please confirm the details with the service.</span>` : `
        <span class="a-pb-tags">${(s.support_for || "").split(";").filter(Boolean).map(t => `<span class="a-tag">${e_(NICE[t] || t[0].toUpperCase() + t.slice(1))}</span>`).join("")}</span>
        ${s.last_checked ? `<span class="a-pb-checked">Checked ${e_(niceDate(s.last_checked))}</span>` : ""}`}
      </div>
    </div>
  </details>`;
}

// ---- the plan: a short summary to give to the person (email, text, print) ----
const STEP_TITLE = { "First step": "A good place to start", "Next step": "Next", "When ready": "When you feel ready" };
const FOOT = "Please check with the service before going, as details can change. Anything marked \"found online\" hasn't been checked by Signposting Somerset. If things get worse, call Samaritans any time on 116 123 (free), or 999 in an emergency.";
function plan() {
  let html = `<h3 style="margin:0 0 6px">Things that might help</h3>`, text = "Things that might help\n";
  const safety = lastResult?.safety;
  if (safety) { html += `<p style="margin:6px 0 8px;padding:8px 10px;border-left:4px solid #B45309;background:#FFF7ED"><b>Read first:</b> ${e_(safety)}</p>`; text += `\nREAD FIRST: ${safety}\n`; }
  let n = 0;
  for (const st of STEPS) {
    const list = lastPicks.filter(p => p.step === st); if (!list.length) continue;
    html += `<p style="margin:12px 0 4px"><b>${STEP_TITLE[st]}</b></p><ol start="${n + 1}" style="margin:0;padding-left:22px">`;
    text += `\n${STEP_TITLE[st]}\n`;
    for (const p of list) {
      n++;
      const s = p.record, inPerson = (s.mode || "").includes("in-person");
      const when = whenText(s), where = inPerson ? [s.address, s.town, s.postcode].filter(Boolean).join(", ") : "";
      const how = [HOW[s.access] || s.access, s.cost].filter(Boolean).join(". ");
      // Not in person: say how to take part, so a plan line is never just a time with no place
      const modes = (s.mode || "").split(";").map(m => m.trim());
      const remoteHow = inPerson ? "" : [modes.includes("online") && "online", modes.includes("phone") && "by phone"].filter(Boolean).join(" or ").replace(/^./, c => c.toUpperCase());
      const whereT = where || remoteHow;
      const lines = [when && whereT ? `${when}, ${whereT}` : when || whereT, how, s.note].filter(Boolean);
      const contactH = [s.phone && `<a href="tel:${e_(telOf(s))}">${e_(s.phone)}</a>`, s.email && `<a href="mailto:${e_(s.email)}">${e_(s.email)}</a>`].filter(Boolean).join(" · ");
      const contactT = [s.phone, s.email].filter(Boolean).join(" · ");
      const name = (isUrl(s.url) ? `<a href="${e_(s.url)}"><b>${e_(s.name)}</b></a>` : `<b>${e_(s.name)}</b>`) + (p.web ? ` <i style="font-size:12px">(found online, not checked)</i>` : "");
      html += `<li style="margin:0 0 8px">${name}<br>${lines.map(e_).join("<br>")}${contactH ? `<br>${contactH}` : ""}</li>`;
      text += `${n}. ${s.name}${p.web ? " (found online, not checked)" : ""}\n` + lines.map(l => `   ${l}\n`).join("") + (contactT ? `   ${contactT}\n` : "") + (isUrl(s.url) ? `   ${s.url}\n` : "");
    }
    html += `</ol>`;
  }
  html += `<p style="margin:12px 0 4px"><i>${e_(FOOT)}</i></p><p style="margin:0;font-size:12px">From Signposting Somerset: <a href="${SITE}">${SITE}</a></p>`;
  text += `\n${FOOT}\nFrom Signposting Somerset: ${SITE}\n`;
  html = html.replace(/<a href=/g, '<a style="color:#2F5441" href=');   // the site's green when pasted into an email or printed
  return { html, text };
}
async function copyPlan() {
  const { html, text } = plan();
  let ok = false;
  try {
    if (window.ClipboardItem && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]);
      ok = true;
    }
  } catch {}
  if (!ok) { try { await navigator.clipboard.writeText(text); ok = true; } catch {} }
  const btn = $a("a-copyPlan"); if (!btn) return;
  btn.style.minWidth = btn.offsetWidth + "px";      // keep the width, so nothing moves
  btn.textContent = ok ? "Copied ✓" : "Couldn't copy";
  $a("a-copied").textContent = ok ? "Plan copied" : "Couldn't copy the plan";   // for screen readers only
  clearTimeout(copyPlan.t); copyPlan.t = setTimeout(() => { btn.textContent = "Copy plan"; $a("a-copied").textContent = ""; }, 2000);
}

showVersion();
// If the page opened straight onto the Assist tab (e.g. #assist), show it now that everything is ready
if (typeof tab !== "undefined" && tab === "assist") window.assistShow();
if (typeof tab !== "undefined" && tab === "about" && typeof renderAbout === "function") renderAbout();
})();
