/* ---------- The next design's pages: one template, four pages (build/next/build.py builds it once for each) ----------
   home       /next/            a stand-in for the landing page: links to everything (the text box and Where? come later)
   directory  /next/directory/  In person, Phone and online, Places (For you joins them with the Welcome work)
   courses    /next/courses/    Courses, and Training (a placeholder until there are records)
   about      /next/about/      About
   The title and the illustration go home from every page. Runs after tabs.js, before links.js opens the page. */
const NEXT_PAGE = "/*NEXT_PAGE*/";
const PAGE_URL = { home: "/*HOME_URL*/", courses: "/*COURSES_URL*/", about: "/*ABOUT_URL*/", directory: "/*DIRECTORY_URL*/" };
const PAGE_TABS = { home: ["home"], directory: ["near", "talk", "places"], courses: ["course", "training"], about: ["about"] }[NEXT_PAGE];
// Old links to the directory's Courses or About tab: to their own pages, with their filters
if (NEXT_PAGE === "directory" && ["#course", "#about"].includes(location.hash))
  location.replace((location.hash === "#course" ? PAGE_URL.courses : PAGE_URL.about) + location.search + location.hash);
document.body.dataset.page = NEXT_PAGE;
// Only this page's tabs: the others' buttons go (their panels stay, hidden, as the shared code expects them)
for (const k of [...SITE_TABS, "training", "home"]) if (!PAGE_TABS.includes(k)) { $("tab-" + k)?.remove(); $("panel-" + k).hidden = $("hdr-" + k).hidden = true; }
SITE_TABS.splice(0, SITE_TABS.length, ...PAGE_TABS);
// The tabs this design adds (Training, Home) have no list of their own: shown here. Any other tab name opens the page's first.
{
  const shared = setSiteTab;
  setSiteTab = t => {
    if (!SITE_TABS.includes(t)) t = SITE_TABS[0];
    if (t === "training" || t === "home") {
      tab = t;
      for (const k of SITE_TABS) { if ($("tab-" + k)) currentTab($("tab-" + k), k === t); $("panel-" + k).hidden = k !== t; $("hdr-" + k).hidden = k !== t; }
      (t === "home" ? drawHome : drawTraining)();
      try { history.replaceState(null, "", location.pathname + (t === "home" ? "" : "#" + t)); } catch (e) {}
      return;
    }
    if (tab === "training" || tab === "home") tab = t;   // (nothing to remember about where those were scrolled)
    shared(t);
  };
}
const tabTraining = $("tab-training");
if (tabTraining) tabTraining.onclick = () => setSiteTab("training");
function drawTraining() {
  $("training").innerHTML = `<div class="soon"><h1 class="bt">Training</h1>
    <p>Training for people who support others: support workers, volunteers, carers and employers. For example, Mental Health First
    Aid, suicide awareness and safeguarding. Coming soon.</p></div>`;
}
// ---------- Home: the landing page (a first working version; the look comes last) ----------
// Someone says what's going on in their own words; the worker's tags task (Haiku) turns it into topics, a place and flags;
// they can change the topics and the place; "Show me" opens the directory with those set. What they type goes only to the
// worker, isn't kept, and never goes in an address. While the tags task is tested it needs the access code: asked once in
// this browser tab, kept in this tab only (as Assist).
const TAGS_URL = "/*WORKER_URL*/".replace(/\/$/, "") + "/tags";
const ALL_TAGS = GROUPS.flatMap(g => g[1]);
let home = { busy: false, text: "", where: null, note: "", risk: false };   // where: the town chosen, or their location
const homeCode = { get: () => { try { return sessionStorage.getItem("assist-code") || ""; } catch (e) { return ""; } },
  set: v => { try { v ? sessionStorage.setItem("assist-code", v) : sessionStorage.removeItem("assist-code"); } catch (e) {} } };
// Small line icons for the landing page (topics and the ways in)
const L_ICON = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const HOME_TOPICS = [   // "Or explore by topic": a few to tap without typing (More shows them all)
  ["connect", '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M14.5 14.6c.8-.4 1.6-.6 2.5-.6 2.3 0 4 1.5 4.5 4.5"/>'],
  ["low mood", '<path d="M5 19c0-8 6-13 14-14-1 8-6 14-14 14z"/><path d="M5 19l7-7"/>'],
  ["finances", '<ellipse cx="12" cy="6.5" rx="6" ry="2.5"/><path d="M6 6.5v4c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4M6 10.5v4c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4M6 14.5v3c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-3"/>'],
  ["bereavement", '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>'],
  ["be active", '<path d="M4 16c3 0 4-1 6-4l2-3c1 2 3 3 5 3h3v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-1z"/><path d="M4 16v1"/>']];
// The four ways in, below the topics: the directory (its tabs lead everywhere in it), courses and training, support planning, analytics
const HOME_WAYS = [
  [() => PAGE_URL.directory, "Directory", "Groups, drop-ins, helplines and activities near you", '<path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.3"/>'],
  [() => PAGE_URL.courses, "Courses and training", "Opportunities for learning and personal development", '<path d="M2 9l10-4 10 4-10 4z"/><path d="M6 11v5c0 1 2.7 3 6 3s6-2 6-3v-5M22 9v5"/>'],
  [() => TOOLS_URL + "#assist", "Support planning", "Personalised support plans for support workers and volunteers", '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.3 2.8-5.2 5.5-5.2s4.9 1.9 5.5 5.2"/><path d="M15.5 11.5l2 2 4-4.5"/>'],
  [() => TOOLS_URL + "#analytics", "Analytics", "Explore maps of mental health and wellbeing support", '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>']];
function drawHome() {
  document.body.classList.add("landing");
  $("home").innerHTML = `<section class="lhero"><div class="heroart" role="img" aria-label="A watercolour of Somerset: Glastonbury Tor above fields, a path with map pins, people meeting and walking, two people talking under the trees, and a signpost saying Connect, Be active and Take notice"></div>
      <div class="herotitle"><a class="homelink" href="${PAGE_URL.home}">Signposting Somerset</a><span>Local mental health and wellbeing support across Somerset</span></div>
      <div class="ask" id="ask" aria-live="polite"></div></section>
    <section class="hexplore" id="hexplore"><p class="hor"><span>Or explore by topic</span></p><div class="htopics">
      ${HOME_TOPICS.map(([t, i]) => `<button type="button" class="htopic" data-t="${esc(t)}">${L_ICON(i)}${esc(cap(t))}</button>`).join("")}
      <button type="button" class="htopic" data-t="">${L_ICON('<path d="M12 5v14M5 12h14"/>')}More</button></div></section>
    <section class="hways">${HOME_WAYS.map(([url, title, text, i]) => `<a class="hway" href="${url()}">${L_ICON(i)}<span><b>${title}</b><span>${text}</span></span></a>`).join("")}</section>`;
  // A topic: straight to the directory with it (and the town, if they've chosen one); More: everything
  $("hexplore").querySelectorAll(".htopic").forEach(b => b.onclick = () => goShow(b.dataset.t ? [b.dataset.t] : [], home.where));
  // The helpline bar at the foot gains the links that aren't ways in
  const help = document.querySelector("#help .inner");
  if (help && !help.querySelector(".hlinks")) help.insertAdjacentHTML("beforeend", `<nav class="hlinks" aria-label="More">
    <a href="${PAGE_URL.about}">About this directory</a><a href="${PAGE_URL.about}">How we keep it up to date</a><a href="${TOOLS_URL}">For support workers</a></nav>`);
  drawAsk();
}
function drawAsk() {
  const box = $("ask"), h = home;
  const towns = [...$("f-town").options].filter(o => PLACE[o.value]).map(o => o.value);
  const crisis = h.risk ? `<div class="hcrisis"><b>If you or someone else is in danger now, call 999.</b> For urgent mental health support, call
    NHS 111 and choose option 2, or talk to Samaritans any time, free, on <a href="tel:116123">116 123</a>. Under 19? Childline: <a href="tel:08001111">0800 1111</a>.
    <div class="askrow"><button type="button" class="tbtn pri" id="h-go">See support near you</button></div></div>` : "";
  box.innerHTML = `${crisis}<form id="ask-form"${h.risk ? " hidden" : ""}><label for="ask-text" class="askh big">What would help you today?</label>
    <p class="hsub">Tell us in your own words and we'll suggest places nearby.</p>
    <div class="askbox"><textarea id="ask-text" rows="2" maxlength="500" placeholder="For example: I've recently been bereaved, I feel alone and money is tight">${esc(h.text)}</textarea>
      <button type="submit" class="askgo" aria-label="Find support and activities" title="Find support and activities" ${h.busy ? "disabled" : ""}>${h.busy
        ? L_ICON('<path d="M12 3a9 9 0 1 0 9 9"/>') : L_ICON('<path d="M5 12h14M13 6l6 6-6 6"/>')}</button></div>
    <div class="hwhere">${L_ICON('<path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.3"/>')}<label for="h-town">Near</label>
      <select id="h-town"><option value="">All of Somerset</option>${h.where && h.where.lat && !h.where.town ? `<option value="__me" selected>Your location</option>` : ""}${towns.map(t => `<option${h.where && h.where.town === t ? " selected" : ""}>${esc(t)}</option>`).join("")}</select>
      <button type="button" class="hloc" id="h-loc">${L_ICON('<circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7.5"/>')}Use my location</button></div>
    ${h.note ? `<p class="asknote">${h.note}</p>` : ""}
    <p class="askfine">${L_ICON('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>')}We don't keep what you type.</p>
    ${h.needCode ? `<p class="askcode"><label>Access code (while we test) <input id="ask-code" type="password" autocomplete="off"></label></p>` : ""}</form>`;
  $("ask-form").onsubmit = e => { e.preventDefault(); askTags(); };
  $("ask-text").oninput = e => { h.text = e.target.value; };
  $("ask-text").onkeydown = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); askTags(); } };   // Enter sends; Shift+Enter, a new line
  $("h-town").onchange = e => { const t = e.target.value; if (t !== "__me") h.where = t ? { town: t, lat: PLACE[t][0], lon: PLACE[t][1] } : null; };
  $("h-loc").onclick = () => navigator.geolocation && navigator.geolocation.getCurrentPosition(p => {
    h.where = { lat: p.coords.latitude, lon: p.coords.longitude }; drawAsk(); },
    () => { h.note = "We couldn't get your location: choose a town instead."; drawAsk(); }, { timeout: 10000 });
  if ($("h-go")) $("h-go").onclick = () => goShow(h.tags, h.place);
}
async function askTags() {
  const h = home, text = h.text.trim();
  if (!text) { h.note = "Tell us a little about what's going on, or choose a topic below."; drawAsk(); return; }
  if ($("ask-code")?.value) homeCode.set($("ask-code").value.trim());
  h.busy = true; h.note = ""; drawAsk();
  let d = {}, status = 0;
  try { const r = await fetch(TAGS_URL, { method: "POST", headers: { "Content-Type": "application/json", "X-Access-Code": homeCode.get() }, body: JSON.stringify({ text }) });
    status = r.status; d = await r.json().catch(() => ({})); } catch (e) { d = { error: "offline" }; }
  h.busy = false;
  if (status === 401 || d.error === "bad_code" || d.error === "no_code") { homeCode.set(""); Object.assign(h, { needCode: true, note: "This is being tested: enter the access code." }); drawAsk(); return; }
  if (d.error) { h.note = d.error === "rate_limited" ? "Lots of requests just now: please try again in a few minutes, or choose a topic below." : "Sorry, that didn't work. Please try again, or choose a topic below."; drawAsk(); return; }
  if (d.off_topic) { h.note = "We couldn't find anything in that we can help with. Try telling us what's going on, or choose a topic below."; drawAsk(); return; }
  // Where: a place in their words wins (it's probably what they meant), then the town or location they chose, else anywhere
  const said = d.place && d.place.lat ? { town: d.place.town, lat: d.place.lat, lon: d.place.lon } : null;
  Object.assign(h, { tags: d.tags || [], place: said || h.where, risk: !!d.risk });
  try { if (h.risk) sessionStorage.setItem("ss-risk", "1"); } catch (e) {}
  if (h.risk) { drawAsk(); $("ask").scrollIntoView({ block: "nearest" }); return; }   // the crisis note first, then on
  goShow(h.tags, h.place);
}
// To the directory with the topics and the place (none: everything, anywhere). For you will take this over.
function goShow(tags, where) {
  const q = new URLSearchParams();
  if (tags && tags.length) q.set("support", tags.join(","));
  if (where && where.town && [...$("f-town").options].some(o => o.value === where.town)) q.set("town", where.town);
  else if (where && where.lat) { q.set("lat", (+where.lat).toFixed(3)); q.set("lon", (+where.lon).toFixed(3)); q.set("label", where.town || "your location"); }
  location.href = PAGE_URL.directory + (String(q) ? "?" + q : "") + "#near";
}
