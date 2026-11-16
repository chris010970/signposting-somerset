/* ---------- links that open the directory already filtered ----------
   e.g. /directory/?support=bereavement&town=Frome#near · ?lat=51.21&lon=-3.6&label=near%20Porlock#near · ?support=anxiety#talk
   · ?place=wells&support=low-mood#places
   support (any tab), town or lat + lon (+ label), within and when (In person); place, support and when (Places: places-tab.js). Unknown values are ignored, so a bad link still
   opens the normal page. The address bar follows the filters, so any view can be copied as a link (never "Use my location"). */
// The choices made earlier in this visit come back (kept in this browser tab only, never "Use my location"), so reloading
// doesn't reset them. A link's own choices win for the tab it opens.
const STATE_KEY = "ss-directory:" + location.pathname;   // the live and test copies keep their own
const SAVED = (() => {   // { near, talk, course: each tab's filters as a link; sort, area, open, fmt, book; scroll; places } (saveState)
  try { return JSON.parse(sessionStorage.getItem(STATE_KEY) || "null") || {}; } catch (e) { return {}; }
})();
const LINK_TAB = location.search ? location.hash.slice(1) || "near" : "";   // the tab a link opened, with its filters in the address
const LINK = (() => {   // In person's filters to open with: the address's (a link to In person, Phone and online or Courses), or this visit's
  try { return new URLSearchParams(LINK_TAB && LINK_TAB !== "places" ? location.search : SAVED.near || ""); } catch (e) { return new URLSearchParams(); }
})();
let recordsIn = false;   // nothing is remembered until the records (and so every choice) are in place
let userChanged = false;   // once the person changes a filter, a late-arriving sheet doesn't put the link's choices back
document.addEventListener("change", e => { if (e.isTrusted) userChanged = true; }, true);
function pickOpt(sel, v) {
  if (!sel || v == null || String(v).trim() === "") return false;
  const o = [...sel.options].find(o => !o.hidden && o.value.toLowerCase() === String(v).trim().toLowerCase());
  if (o) sel.value = o.value;
  return !!o;
}
function applyLink() {   // after the records are ready, and again when the live sheet arrives, until the person changes something
  if (userChanged) return;
  applyLinkNear(LINK);
  if (SAVED.near !== undefined) restoreOthers();   // after: In person's choices also set the other tabs' Support for
}
function applyLinkNear(link) {   // In person's filters from a link's settings (URLSearchParams)
  if (![...link.keys()].length) return;
  const sup = link.get("support");
  pickOpt(fs, sup); pickOpt($("t-support"), sup); pickOpt($("c-support"), sup);
  const lat = parseFloat(link.get("lat")), lon = parseFloat(link.get("lon"));
  if (pickOpt($("f-town"), link.get("town")) && PLACE[$("f-town").value]) {
    const n = $("f-town").value; searchPoint = { lat: PLACE[n][0], lon: PLACE[n][1], label: n }; sortBy = "near";
  } else if (lat > 50.5 && lat < 51.7 && lon > -4.2 && lon < -1.9) {   // a point in or near the area
    const label = (link.get("label") || "").replace(/[<>"]/g, "").trim().slice(0, 60) || "the point on the map";
    searchPoint = { lat, lon, label, link: true }; setPtLabel(cap(label)); $("f-town").value = "__pt"; sortBy = "near";
  }
  pickOpt($("within"), link.get("within")); pickOpt($("f-when"), link.get("when"));
  fitPending = true;
}
function restoreOthers() {   // the other tabs' choices from earlier in this visit (In person's come back through LINK)
  const sup = (sel, q) => { const v = new URLSearchParams(q || "").get("support"); if (!pickOpt(sel, v)) sel.value = ""; };
  if (LINK_TAB !== "talk") sup($("t-support"), SAVED.talk);   // the tab a link opened: its support stays the link's
  if (LINK_TAB !== "course") sup($("c-support"), SAVED.course);
  if (SAVED.area !== undefined) pickOpt($("t-area"), SAVED.area) || ($("t-area").value = "");
  if (SAVED.fmt !== undefined) pickOpt($("c-fmt"), SAVED.fmt) || ($("c-fmt").value = "");
  $("t-open").checked = !!SAVED.open; $("c-book").checked = !!SAVED.book;
}
function saveState() {
  if (!recordsIn) return;
  const state = { near: linkFor("near"), talk: linkFor("talk"), course: linkFor("course"), sort: sortBy,
    area: $("t-area").value, open: $("t-open").checked, fmt: $("c-fmt").value, book: $("c-book").checked, scroll: scrollPos,
    places: placesState() };
  try { sessionStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) {}
}
function linkFor(t) {   // the current filters, as the part of the address after "?"
  const q = new URLSearchParams();
  if (t === "near") {
    if (fs.value) q.set("support", fs.value);
    const n = $("f-town").value;
    if (PLACE[n]) q.set("town", n);
    else if (n === "__pt" && searchPoint && searchPoint.link) { q.set("lat", searchPoint.lat.toFixed(4)); q.set("lon", searchPoint.lon.toFixed(4)); q.set("label", searchPoint.label); }
    if (searchPoint && $("within").value !== "10") q.set("within", $("within").value);
    if ($("f-when").value !== "week") q.set("when", $("f-when").value);
  } else if (t === "places") placesQuery(q);
  else if (t === "talk" && $("t-support").value) q.set("support", $("t-support").value);
  else if (t === "course" && $("c-support").value) q.set("support", $("c-support").value);
  return q.toString();
}
// The address bar shows the current tab's filters (and they're remembered for the visit)
function syncLink() {
  try { const q = linkFor(tab); history.replaceState(null, "", location.pathname + (q ? "?" + q : "") + "#" + tab); } catch (e) {}
  saveState();
}


/* ---------- scroll positions: each tab stays where it was, for the visit ---------- */
// Switching tabs, going to Places and back, or reloading: each tab's list is where it was left (In person's list starts at
// the top again when its filters change). Kept with the other choices; a link that opens the directory filtered starts at the top.
const SCROLLERS = { near: "list", talk: "panel-talk", course: "panel-course", places: "panel-places", about: "panel-about" };
const scrollPos = (() => {   // this visit's positions; a link opens its list at the top (e.g. "On the map" from Places: In person)
  try {
    const all = { ...(JSON.parse(sessionStorage.getItem(STATE_KEY) || "null") || {}).scroll };
    if (LINK_TAB) delete all[LINK_TAB === "places" ? "places" : "near"];
    return all;
  } catch (e) { return {}; }
})();
let lastListKey = null;          // In person's filters at its last draw (in-person.js)
const scrollRestored = new Set();   // tabs whose remembered position has been put back since the page opened
let scrollSaving = 0;
for (const [t, id] of Object.entries(SCROLLERS)) $(id).addEventListener("scroll", () => {
  if (!$(id).offsetParent) return;   // being hidden (a hidden list reads as scrolled to the top)
  if (t === "near" ? lastListKey === null : !scrollRestored.has(t)) return;   // still loading: keep the remembered position
  scrollPos[t] = $(id).scrollTop;
  clearTimeout(scrollSaving); scrollSaving = setTimeout(saveState, 250);
}, { passive: true });
addEventListener("pagehide", saveState);
// After a tab's content is drawn (setSiteTab): put back where it was, once (In person does this as it draws its list)
function restoreScroll(t) {   // (In person and Places do this as their lists arrive)
  if (t === "near" || t === "places" || !recordsIn || scrollRestored.has(t)) return;
  scrollRestored.add(t);
  if (scrollPos[t]) $(SCROLLERS[t]).scrollTop = scrollPos[t];
}

/* ---------- opening the page ---------- */
// Opens on In person; a link with #near, #talk, #course or #about opens that tab. Old links to #assist go to the tools page.
(function () {
  if (location.hash === "#assist") { location.replace(TOOLS_URL + "#assist"); return; }
  applyLink();
  const fromHash = SITE_TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "";
  setSiteTab(fromHash || "near");
})();

