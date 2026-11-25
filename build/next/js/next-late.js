/* ---------- The next design's code that replaces the directory's own (build/directory/js/): loaded last, so these win ----------
   The kinds row: under the filter boxes, since it filters the list as well as the map. Tick boxes in each kind's colour,
   ticked = shown. Phones show the short names from build/next/kind-short.json (at switch-over these move into kinds.json). The map's own key box isn't used. Same filter as before (keyClick in map.js). */
function drawLegend() { const d = $("kindrow"); legendEl = d; d.innerHTML = kindChips(S, kindsOff); }
// The tick boxes for the kinds that appear in a list of records (off: the kinds unticked)
function kindChips(list, off) {
  const KEY_TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>';
  const KIND_SHORT = (/*@next:kind-short.json*/);   // (inside: the map draws its key before the lines below have run)
  return KINDS.map((k, i) => { if (!list.some(x => kindOf(x) === i)) return ""; const on = !off.has(i);
    return `<button type="button" role="checkbox" aria-checked="${on}" data-k="${i}" style="--c:${k[1]}">` +
      `<i>${on ? KEY_TICK : ""}</i><span class="lt">${esc(k[0])}</span><span class="st" aria-hidden="true">${esc(KIND_SHORT[k[0]] || k[0])}</span></button>`; }).join("");
}
(() => { const d = $("kindrow"); d.addEventListener("click", e => keyClick(e, d)); drawLegend(); })();

/* The count, on the map: "Showing 245 services" in a pill at the top left (the map's key used to sit there). It copies the
   number from the screen readers' summary line (in-person.js), so the two always agree */
(() => {
  const pill = document.createElement("div"); pill.className = "mapcount"; pill.setAttribute("aria-hidden", "true");
  $("mapwrap").appendChild(pill);
  const show = () => { const n = $("summary").querySelector("b")?.textContent; pill.hidden = !n; if (n) pill.textContent = `Showing ${n} ${n === "1" ? "service" : "services"}`; };
  new MutationObserver(show).observe($("summary"), { childList: true, subtree: true, characterData: true }); show();
})();
/* ---------- Phone and online: the ticket card (replaces talkCard in phone-online.js) ----------
   The stub says when you can get through (open now, 24/7, when it opens); the rest is on the right. Stub colour: the kind */
function talkStub(s, st, now) {
  const SI = p => `<svg class="sic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const CAL = '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>';
  if (st.txt === "Open 24/7") return `<span class="live">Open now</span><b class="big w">24/7</b><span class="sm">any time</span>`;
  if (st.txt === "No set hours") return SI('<path d="M4 5.5h16v10H9l-5 4z"/>') + `<span class="rule"></span><span class="tm">Any time</span>`;
  if (s._kind === "website") return SI('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.6 2.6 14.4 0 17M12 3.5c-2.6 2.6-2.6 14.4 0 17"/>') + `<span class="rule"></span><span class="tm">Times vary</span>`;
  if (s._kind !== "dated") return SI(CAL) + `<span class="rule"></span><span class="tm">${askFor(s)}</span>`;
  const o = occurrences(s, now, 70).find(x => x.en > now);
  if (!o) return SI(CAL + '<path d="M9.5 13.5l5 5M14.5 13.5l-5 5"/>') + `<span class="rule"></span><span class="tm">No dates yet</span>`;
  // Set hours: as on In person (the day, the date, then the start and end times); "Open now" in place of "Today" when it is
  const html = ticketStub(s, { at: o.st, txt: "" });
  return st.open ? html.replace('<span class="live">Today</span>', `<span class="live">${s.mode.includes("phone") ? "Open now" : "On now"}</span>`) : html;
}
function talkCard({ s, st }) {   // Phone and online: the ticket card (next.js ticketCard) with when you can get through in the stub
  const k = KINDS[kindOf(s)];
  const modes = split(s.mode).filter(m => m !== "in-person").map(m => m === "phone" ? "Phone" : "Online").sort((a, b) => a === "Phone" ? -1 : 1);
  const how = [...modes, s.area === "national" ? "UK-wide" : "Local"].join(" · ");
  const tel = s.phone ? s.phone.split(" (")[0].split(" or ")[0].replace(/\s/g, "") : "";
  const reach = s.phone ? (/^text/i.test(s.phone) ? esc(s.phone) : `<a href="tel:${esc(tel)}">${esc(s.phone)}</a>`)
    : s.email ? `<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>` : "";
  return ticketCard(s, { cls: "tcard", stub: talkStub(s, st, new Date()), tag: `<span class="mline" title="${how}">${how}</span>`,
    sub: reach ? `<div class="reach${s.phone ? "" : " email"}">${reach}</div>` : "", sr: st.txt, afterDesc: restrictLine(s),
    acts: contactButtons(s) });
}

/* ---------- Phone and online: the kinds row (as on In person) with "Open now only" at its end, and headings that say what's
   chosen ("Bereavement · 12 services"). Replaces renderTalk in phone-online.js ---------- */
// (kept on window, so renderTalk can run before this line has: the page may draw this tab while it is still starting)
function talkOff() { return (window.TALK_KINDS_OFF ||= new Set()); }
$("kindrow-talk").addEventListener("click", e => {
  const b = e.target.closest("button[data-k]"); if (!b) return;
  const k = +b.dataset.k, off = talkOff(); off.has(k) ? off.delete(k) : off.add(k);
  if (KINDS.every((_, i) => off.has(i) || !T.some(x => kindOf(x) === i))) off.clear();   // all unticked: show all
  renderTalk();
});
function nServices(n) { return `${n} ${n === 1 ? "service" : "services"}`; }
function renderTalk() {
  setTimeout(syncLink, 0);   // keep the address bar in step with the filters
  if (!ALL.length) { panelMessage(liveMsg); return; }
  const now = new Date(), sup = $("t-support").value, hours = $("t-when").value, onlyOpen = hours === "now", area = $("t-area").value, talkKindsOff = talkOff();
  $("t-open").checked = onlyOpen;   // (the hidden tick box the shared code saves)
  $("q-tsupport").classList.toggle("on", !!sup); $("q-twhen").classList.toggle("on", !!hours); $("q-tarea").classList.toggle("on", !!area);
  $("kindrow-talk").innerHTML = kindChips(T, talkKindsOff); needsLabel("talk");
  let rows = T.filter(s => (!sup || s._sf.includes(sup)) && (!area || (area === "national") === (s.area === "national")) && !talkKindsOff.has(kindOf(s)))
    .map(s => ({ s, st: openState(s, now) }));
  if (hours) rows = rows.filter(r => talkWhen(r, hours, now));
  const order = (a, b) => (b.st.open - a.st.open) || a.s.name.localeCompare(b.s.name);
  let html = "";
  const head = (title, n) => `<h2 class="gh">${esc(title)}<small>${n} ${n === 1 ? "service" : "services"} found</small></h2>`;
  const several = sup.startsWith("__multi") ? GROUPS.flatMap(([, v]) => v).filter(v => needsOf("talk").has(v)) : null;
  if (several) {   // several needs ticked: a section for each, in the dropdown's order (a service that fits two shows in both)
    rows.sort(order);
    for (const n of several) { const rs = rows.filter(r => r.s._sf.includes(n));
      html += head(cap(n), rs.length) + (rs.length ? `<div class="tgrid">${rs.map(talkCard).join("")}</div>` : ""); }
  } else if (sup) {   // one need chosen: its name and how many were found, even none
    rows.sort(order);
    html = head(cap(sup), rows.length) + (rows.length ? `<div class="tgrid">${rows.map(talkCard).join("")}</div>` : "");
  } else {     // Anything: grouped as the Support for choices are; each service under the first group it fits, open ones first
    const used = new Set();
    for (const [g, vals] of GROUPS) {
      const rs = rows.filter(r => !used.has(r.s.id) && r.s._sf.some(v => vals.includes(v)));
      rs.forEach(r => used.add(r.s.id)); rs.sort(order);
      if (rs.length) html += head(g, rs.length) + `<div class="tgrid">${rs.map(talkCard).join("")}</div>`;
    }
    if (!html) html = head("Anything", 0);
  }
  // None found: under the heading, what to change (from whatever is filtering the list), Samaritans always, and "Show all" if the
  // boxes above caused it
  if (!rows.length) {
    const tips = [hours ? 'choose "Any time" under When' : "", talkKindsOff.size ? "tick all the boxes above" : "", area ? 'choose "Local and UK-wide"' : "",
      sup ? 'choose "Anything" under Support for' : ""].filter(Boolean).join(", or ").replace(/^./, c => c.toUpperCase());
    html += `<div class="empty"><strong>${onlyOpen ? "Nothing open right now for this" : "Nothing listed for this"}</strong><br>` +
      `${tips || "Try again later"}, or call Samaritans on 116 123 at any time.` +
      (talkKindsOff.size ? `<br><button type="button" class="showall" id="talk-showall">Show all</button>` : "") + `</div>`;
  }
  $("talk-list").innerHTML = html;
}
// The big number (or email) on a card: tap to call on phones and tablets; with a mouse or trackpad, a click there opens or
// closes the card like the rest of it (a "tel:" link on a computer makes the browser ask which app should call). The Call
// button in the opened card still calls; so does the keyboard (Enter on the number)
const FINE_POINTER = matchMedia("(hover: hover) and (pointer: fine)");
$("talk-list").addEventListener("click", e => {
  if (!e.detail || !FINE_POINTER.matches || !e.target.closest(".reach a")) return;
  e.preventDefault();
  if (!String(getSelection())) toggleCard(e.target.closest(".tcard"));   // (not when the number was being selected to copy)
}, true);
// "Show all" in the empty message: tick all the boxes again
$("talk-list").addEventListener("click", e => { if (e.target.closest("#talk-showall")) { talkOff().clear(); renderTalk(); } });

/* ---------- Support for, with tick boxes (In person, Phone and online) ----------
   A button that looks like the dropdown opens a panel of tick boxes, in the dropdown's three groups. Nothing ticked: Anything;
   one: that need (the dropdown is set to it, so links work as before); several: services for any of them. For several, each
   record that fits gets a hidden tag ("__multi_near", "__multi_talk") and the dropdown is set to that tag, so the tabs' own
   filtering (s._sf.includes(sup)) works unchanged. Courses keeps its dropdown. */
// (Functions, not constants: the shared code can call pickOpt, and so these, while the page is still starting, before
// the lines of this file have run)
function needsUI(tab) {
  return { near: { sel: () => fs, list: () => S, box: "q-support", redraw: () => refit() },
           talk: { sel: () => $("t-support"), list: () => T, box: "q-tsupport", redraw: () => renderTalk() },
           course: { sel: () => $("c-support"), list: () => C, box: "q-csupport", redraw: () => renderCourses() } }[tab];
}
function needsOf(tab) { return (window.NEEDS ||= { near: new Set(), talk: new Set(), course: new Set() })[tab]; }
function applyNeeds(tab) { setNeedsSel(tab); needsUI(tab).redraw(); }
function setNeedsSel(tab) {   // the dropdown (and the hidden tags) to match the ticked needs
  const u = needsUI(tab), sel = u.sel(), set = needsOf(tab), tag = "__multi_" + tab;
  ALL.forEach(s => { s._sf = s._sf.filter(v => v !== tag); });
  if (set.size > 1) {
    ALL.forEach(s => { if (s._sf.some(v => set.has(v))) s._sf.push(tag); });
    if (![...sel.options].some(o => o.value === tag)) sel.insertAdjacentHTML("beforeend", `<option value="${tag}" hidden></option>`);
    LABEL[tag] = [...set].map(cap).join(" or ");
    sel.value = tag;
  } else sel.value = set.size ? [...set][0] : "";
  needsLabel(tab);
}
function needsLabel(tab) {   // the button's text: Anything; one need's name; on a computer as many names as fit, then "and 3 others";
                             // on a phone, "3 needs chosen"
  const u = needsUI(tab), b = $(u.box).querySelector(".msel span"), set = needsOf(tab), sel = u.sel();
  if (!set.size && sel.value && !sel.value.startsWith("__multi")) set.add(sel.value);   // a link or saved choice set the dropdown
  if (!b) return;
  const order = GROUPS.flatMap(([, v]) => v), names = [...set].sort((x, y) => order.indexOf(x) - order.indexOf(y)).map(cap);
  if (names.length < 2) { b.innerHTML = names[0] ? paren(names[0]) : "Anything"; return; }
  if (matchMedia("(max-width: 760px)").matches) { b.textContent = `${names.length} needs chosen`; return; }
  for (let k = names.length; k >= 1; k--) {   // the most names that fit
    const rest = names.length - k;
    b.textContent = names.slice(0, k).join(", ") + (rest ? ` and ${rest} ${rest === 1 ? "other" : "others"}` : "");
    if (b.scrollWidth <= b.clientWidth || k === 1) return;
  }
}
// A label's part in brackets, e.g. "Addiction (alcohol, drugs, gambling)", is left off on phones (class "paren")
function paren(t) { const i = t.indexOf(" ("); return i < 0 ? esc(t) : `${esc(t.slice(0, i))}<span class="paren">${esc(t.slice(i))}</span>`; }
function needsPanel(tab) {
  const u = needsUI(tab), set = needsOf(tab), list = u.list();
  const groups = GROUPS.map(([g, vals]) => [g, vals.filter(v => list.some(s => s._sf.includes(v)))]).filter(([, v]) => v.length);
  return `<div class="mgroups">${groups.map(([g, vals]) => `<fieldset><legend>${esc(g)}</legend>` +
    vals.map(v => `<label><input type="checkbox" value="${esc(v)}"${set.has(v) ? " checked" : ""}><span>${paren(cap(v))}</span></label>`).join("") + `</fieldset>`).join("")}</div>` +
    `<div class="mfoot"><button type="button" class="mclear">Clear</button><button type="button" class="mdone">Done</button></div>`;
}
(() => {
  const CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  for (const tab of ["near", "talk", "course"]) {
    const u = needsUI(tab), box = $(u.box), sel = u.sel();
    sel.hidden = true; sel.setAttribute("aria-hidden", "true"); sel.tabIndex = -1;
    box.querySelector("label").removeAttribute("for");
    box.insertAdjacentHTML("beforeend", `<button type="button" class="msel" aria-haspopup="true" aria-expanded="false"><span>Anything</span>${CHEV}</button><div class="mpanel" hidden></div>`);
    const btn = box.querySelector(".msel"), panel = box.querySelector(".mpanel");
    const close = () => { panel.hidden = true; btn.setAttribute("aria-expanded", "false"); };
    // Fixed to the window, under the box (the header would otherwise cut it off), and no taller than the space below it
    const place = () => { const r = box.getBoundingClientRect(); panel.style.left = Math.max(16, Math.min(r.left, innerWidth - 16 - panel.offsetWidth)) + "px";
      panel.style.top = r.bottom + 6 + "px"; panel.style.setProperty("--room", Math.max(200, innerHeight - r.bottom - 90) + "px"); };
    addEventListener("resize", () => { if (!panel.hidden) place(); needsLabel(tab); });
    document.addEventListener("scroll", () => { if (!panel.hidden) place(); }, true);
    btn.addEventListener("click", () => {
      if (!panel.hidden) return close();
      needsLabel(tab); panel.innerHTML = needsPanel(tab); panel.hidden = false; place(); btn.setAttribute("aria-expanded", "true");
      panel.querySelector("input")?.focus({ preventScroll: true });
    });
    panel.addEventListener("change", e => {
      const i = e.target; if (i.type !== "checkbox") return;
      const set = needsOf(tab); i.checked ? set.add(i.value) : set.delete(i.value); applyNeeds(tab);
    });
    panel.addEventListener("click", e => {
      if (e.target.closest(".mclear")) { needsOf(tab).clear(); panel.querySelectorAll("input").forEach(i => { i.checked = false; }); applyNeeds(tab); }
      if (e.target.closest(".mdone")) { close(); btn.focus(); }
    });
    document.addEventListener("click", e => { if (!panel.hidden && !box.contains(e.target)) close(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !panel.hidden) { close(); btn.focus(); } });
  }
  // Keep the buttons' text in step when a link, Back or the saved choices set the dropdowns (after each draw)
  new MutationObserver(() => needsLabel("near")).observe($("summary"), { childList: true, subtree: true });
})();

// Links and saved choices: several needs travel as "support=anxiety,finances"; one as before
function linkFor(t) {   // (replaces links.js's: the same, with the ticked needs)
  const q = new URLSearchParams(), needs = tab2 => [...needsOf(tab2)].join(",");
  if (t === "near") {
    if (needs("near")) q.set("support", needs("near"));
    const n = $("f-town").value;
    if (PLACE[n]) q.set("town", n);
    else if (n === "__pt" && searchPoint && searchPoint.link) { q.set("lat", searchPoint.lat.toFixed(4)); q.set("lon", searchPoint.lon.toFixed(4)); q.set("label", searchPoint.label); }
    if (searchPoint && $("within").value !== "10") q.set("within", $("within").value);
    if ($("f-when").value !== "week") q.set("when", $("f-when").value);
  } else if (t === "places") placesQuery(q);
  else if (t === "talk" && needs("talk")) q.set("support", needs("talk"));
  else if (t === "course" && needs("course")) q.set("support", needs("course"));
  return q.toString();
}
function pickOpt(sel, v) {   // (replaces links.js's: the same, and for Support for one or several needs)
  if (!sel || v == null || String(v).trim() === "") return false;
  const tab = sel === fs ? "near" : sel.id === "t-support" ? "talk" : sel.id === "c-support" ? "course" : "";
  const ok = x => [...sel.options].find(o => !o.hidden && o.value.toLowerCase() === x);
  if (tab) {
    // Needs come only from the address: opening the page without "support=" starts with nothing ticked (not this visit's
    // earlier choices)
    if (!START_ADDRESS.has("support")) return false;
    const vals = String(v).split(",").map(x => x.trim().toLowerCase()).filter(ok);
    if (!vals.length) return false;
    const set = needsOf(tab); set.clear(); vals.forEach(x => set.add(ok(x).value)); setNeedsSel(tab);
    return true;
  }
  const o = ok(String(v).trim().toLowerCase());
  if (o) sel.value = o.value;
  return !!o;
}
// The records arriving again (the sheet's refresh) rebuild the dropdowns: put the ticked needs back
for (const tab of ["near", "talk", "course"]) new MutationObserver(() => {
  if (needsOf(tab).size > 1 && !needsUI(tab).sel().value.startsWith("__multi")) { setNeedsSel(tab); needsUI(tab).redraw(); }
}).observe(needsUI(tab).sel(), { childList: true });

/* Phone and online, 3. When?: open now, open 24/7, open in the evening (after 5pm) or at the weekend in the next 7 days.
   Services with no set hours show only under "Any time" (we can't say when they're open) */
function talkWhen(r, hours, now) {
  const s = r.s;
  if (hours === "now") return r.st.open;
  if (hours === "247") return r.st.txt === "Open 24/7";
  if (s._kind !== "dated" || !s._times) return false;
  const o = occurrences(s, now, 7);
  if (hours === "evening") return o.length > 0 && (s._times.e ?? s._times.s) > 17 * 60;
  if (hours === "weekend") return o.some(x => [0, 6].includes(x.st.getDay()));
  return true;
}
$("t-when").onchange = renderTalk;
// When? in links and saved choices ("hours=evening": not "when", which is In person's)
(() => {
  const was = linkFor;
  linkFor = function (t) { const q = new URLSearchParams(was(t)); if (t === "talk" && $("t-when").value) q.set("hours", $("t-when").value); return q.toString(); };
  let v = "";
  try { v = new URLSearchParams(LINK_TAB === "talk" ? location.search : SAVED.talk || "").get("hours") || ""; } catch (e) {}
  if (!v && SAVED.open) v = "now";   // saved before When? existed
  if ([...$("t-when").options].some(o => o.value === v)) $("t-when").value = v;
})();

/* ---------- In person: the map moves only when asked ----------
   Opening or closing a card leaves the map alone (the list's own click handler in in-person.js flies the map to the card's
   pin: a listener that runs just before it switches that off). The pin button by Copy shows the service on the map
   instead: the map flies to its spot (on phones, switching to the map first) and its pin's label opens once the map has
   stopped (zooming redraws the pins). */
function steadyMap() {   // once: the list's own fly is skipped while SKIP_FLY is set
  if (!map || map._fly) return;
  map._fly = map.flyTo.bind(map);
  map.flyTo = (ll, z, o) => window.SKIP_FLY ? map : map._fly(ll, z, o);
}
function showOnMap(id) {
  const s = recordById(id); if (!s || isNaN(s.lat) || !map) return;
  steadyMap();
  // How close: street level for an exact address; the town for a town-centre (approximate) spot. Never further out
  const z = Math.max(map.getZoom(), s.approx ? 14 : 16), here = map.latLngToContainerPoint(map.getCenter()), there = map.latLngToContainerPoint([s.lat, s.lon]);
  const moving = Math.abs(z - map.getZoom()) > .01 || here.distanceTo(there) > 40;
  window.PIN_TIP = id;
  const show = () => { if (window.PIN_TIP === id) { markers[id]?.openTooltip(); window.PIN_TIP = null; } };
  if (moving) { map.once("moveend", () => setTimeout(show, 50)); map._fly([s.lat, s.lon], z, { duration: .5 }); setTimeout(show, 900); }
  else setTimeout(show, 0);
}
$("list").addEventListener("click", e => {
  const pin = e.target.closest(".tpin");
  if (pin) {   // the pin button: show on the map, and don't open or close the card
    e.stopPropagation();
    const id = pin.closest(".card").dataset.id;
    if (!mapVisible()) { setView("map"); setTimeout(() => showOnMap(id), 700); }   // phones: the map first (it fits itself, then flies)
    else showOnMap(id);
    return;
  }
  if (e.target.closest("a, .copy, #show-month")) return;
  if (!e.target.closest(".card")) return;
  steadyMap(); window.SKIP_FLY = true; setTimeout(() => { window.SKIP_FLY = false; }, 0);
}, true);
// The pin button (next.js's serviceCard puts it by Copy, for services with a place on the map)
function pinButton(s) {
  return isNaN(s.lat) ? "" : `<button type="button" class="tpin" aria-label="Show ${esc(s.name)} on the map" data-tip="Show on map">` +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.3"/></svg></button>';
}

/* One label on the map at a time: a pin's label opening closes any other (hover, or a card's), and a list of services
   opening (a numbered pin clicked) closes the labels. Set up once the map exists (it's made when first shown) */
function oneLabel() {
  if (!map || map._oneLabel) return;
  map._oneLabel = true;
  map.options.zoomDelta = 1;   // the + and - buttons and keys: a whole level a press (the map's own fitting keeps its quarter levels)
  // Pins: no browser hover text (it doubled the map's own label); screen readers get the same words as a label
  map.on("layeradd", e => { const el = e.layer.getElement && e.layer.getElement();
    if (el && el.title) { el.setAttribute("aria-label", el.title); el.removeAttribute("title"); } });
  layer.eachLayer(l => { const el = l.getElement && l.getElement(); if (el && el.title) { el.setAttribute("aria-label", el.title); el.removeAttribute("title"); } });
  const closeAll = keep => layer.eachLayer(l => { if (l !== keep && l.isTooltipOpen && l.isTooltipOpen()) l.closeTooltip(); });
  map.on("tooltipopen", e => closeAll(e.layer || e.tooltip?._source));
  map.on("popupopen", () => closeAll(null));
}
new MutationObserver(oneLabel).observe($("summary"), { childList: true, subtree: true });

/* Display names, for the cards' titles (In person, Phone and online): the sheet's name without the bracketed parts that
   repeat what the card shows elsewhere, i.e. the record's own town, its days or its times. The full name stays in Copy
   details, the map's labels and Assist. "Suicide Bereavement Peer Support Group (Yeovil)" becomes
   "Suicide Bereavement Peer Support Group"; "Tai Chi QiGong (Ash, Martock)" becomes "Tai Chi QiGong (Ash)"; a venue stays */
function displayName(s) {
  const m = s.name.match(/^(.*\S)\s*\(([^()]*)\)\s*$/); if (!m) return s.name;
  const DAY = "(mon|tue|wed|thu|fri|sat|sun)[a-z]*", town = (s.town || "").toLowerCase();
  const repeats = p => { const x = p.trim().toLowerCase();
    return x === town || new RegExp(`^${DAY}(\\s*[-–]\\s*${DAY})?(\\s+(morning|afternoon|evening)s?)?$`).test(x) || /^(morning|afternoon|evening)s?$/.test(x) ||
      /^\d{1,2}(:\d\d)?\s*(am|pm)$/.test(x) || /^\d{1,2}:\d\d(\s*[-–]\s*\d{1,2}:\d\d)?$/.test(x); };
  const keep = m[2].split(",").filter(p => !repeats(p));
  return keep.length ? `${m[1]} (${keep.map(p => p.trim()).join(", ")})` : m[1];
}

/* ---------- Courses: three boxes (Support for with tick boxes, Where?, When?) and ticket cards. Replaces courseCard and
   renderCourses in courses.js (courseInfo there still works out the dates). Stub colour: the Courses kind ---------- */
function courseStub(s, ci, now) {
  const SI = p => `<svg class="sic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const t = s._times ? fmtT(s._times.s) + (s._times.e != null ? "–" + fmtT(s._times.e) : "") : "";
  if (ci.status === "Rolling")   // a loop: starts whenever you ask
    return SI('<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 3.5V8h4.5"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20.5V16h-4.5"/>') +
      `<span class="rule"></span><span class="tm">Rolling</span>` + (s.days ? `<span class="sm">${esc(split(s.days).join(", ").replace(/-/g, "–"))}</span>` : "") + (t ? `<span class="sm">${t}</span>` : "");
  const first = new Date(ci.order), lead = ci.join ? "Starts" : "Started";
  return `<span class="wd">${lead}</span><b class="big">${first.getDate()}</b><span class="sm">${first.toLocaleDateString("en-GB", { month: "short" })}</span>` +
    `<span class="rule"></span><span class="tm">${t || askFor(s)}</span>`;
}
function courseCard({ s, ci }) {   // Courses: the ticket card (next.js ticketCard) with when it starts in the stub
  const modes = split(s.mode);
  const where = modes.includes("online") && !modes.includes("in-person") ? "Online" : [modes.includes("online") ? "In person or online" : "In person", s.town].filter(Boolean).join(" · ");
  const when = (ci.status === "Rolling" ? "Rolling course: ask for the next start date" : ci.when).replace(/^1 sessions/, "1 session");
  return ticketCard(s, { cls: "tcard", stub: courseStub(s, ci, new Date()), tag: `<span class="mline" title="${esc(where)}">${esc(where)}</span>`, copy: ci.when,
    pill: ci.join ? "" : `<span class="cpill closed">Running now: not taking new people</span>`,   // the stub already says when it starts
    sub: `<div class="cwhen">${esc(when)}</div>`, afterDesc: restrictLine(s), prov: s.provider || "", acts: contactButtons(s) });
}
function courseWhen(ci, when, now) {
  if (when === "join") return ci.join;
  if (when === "rolling") return ci.status === "Rolling";
  if (when === "soon") return ci.join && ci.status !== "Rolling" && ci.order - now < 28 * 864e5;
  return true;
}
function renderCourses() {
  setTimeout(syncLink, 0);   // keep the address bar in step with the filters
  if (!ALL.length) { panelMessage(liveMsg); return; }
  const now = new Date(), sup = $("c-support").value, where = $("c-where").value, when = $("c-when").value;
  $("q-csupport").classList.toggle("on", !!sup); $("q-cwhere").classList.toggle("on", !!where); $("q-cwhen").classList.toggle("on", !!when);
  $("c-book").checked = when === "join"; $("c-fmt").value = where === "online" ? "online" : "";   // (the hidden boxes the shared code saves)
  needsLabel("course");
  const at = s => where === "online" ? split(s.mode).includes("online") : split(s.mode).includes("in-person") && s.area === where;
  let rows = C.filter(s => (!sup || s._sf.includes(sup)) && (!where || at(s))).map(s => ({ s, ci: courseInfo(s, now) }));
  rows = rows.filter(r => courseWhen(r.ci, when, now));
  rows.sort((a, b) => (b.ci.join - a.ci.join) || (a.ci.order - b.ci.order));   // can join first, then by start date
  const head = (title, n) => `<h2 class="gh">${esc(title)}<small>${n} ${n === 1 ? "course" : "courses"} found</small></h2>`;
  const several = sup.startsWith("__multi") ? GROUPS.flatMap(([, v]) => v).filter(v => needsOf("course").has(v)) : null;
  let html = "";
  if (several) for (const n of several) { const rs = rows.filter(r => r.s._sf.includes(n));
    html += head(cap(n), rs.length) + (rs.length ? `<div class="tgrid">${rs.map(courseCard).join("")}</div>` : ""); }
  else html = head(sup ? cap(sup) : "Courses", rows.length) + (rows.length ? `<div class="tgrid">${rows.map(courseCard).join("")}</div>` : "");
  if (!rows.length) {
    const tips = [when ? 'choose "Any time" under When' : "", where ? 'choose "Anywhere" under Where' : "", sup ? 'choose "Anything" under Support for' : ""]
      .filter(Boolean).join(", or ").replace(/^./, c => c.toUpperCase());
    html += `<div class="empty"><strong>No courses match</strong><br>${tips || "Try again later"}.</div>`;
  }
  $("courses").innerHTML = html;
}
$("c-where").onchange = renderCourses;
$("c-when").onchange = renderCourses;
// The course card's number on computers: opens the card, as on Phone and online
$("courses").addEventListener("click", e => {
  if (!e.detail || !FINE_POINTER.matches || !e.target.closest(".reach a")) return;
  e.preventDefault(); if (!String(getSelection())) toggleCard(e.target.closest(".tcard"));
}, true);
// Where? and When? in links and saved choices ("cwhere", "cwhen")
(() => {
  const was = linkFor;
  linkFor = function (t) { const q = new URLSearchParams(was(t));
    if (t === "course") { if ($("c-where").value) q.set("cwhere", $("c-where").value); if ($("c-when").value) q.set("cwhen", $("c-when").value); }
    return q.toString(); };
  let q = new URLSearchParams();
  try { q = new URLSearchParams(LINK_TAB === "course" ? location.search : SAVED.course || ""); } catch (e) {}
  for (const [id, key] of [["c-where", "cwhere"], ["c-when", "cwhen"]]) { const v = q.get(key) || ""; if ([...$(id).options].some(o => o.value === v)) $(id).value = v; }
  if (!q.get("cwhen") && SAVED.book) $("c-when").value = "join";   // saved before When? existed
})();
