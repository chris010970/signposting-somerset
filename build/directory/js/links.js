/* ---------- links that open the directory already filtered ----------
   e.g. /directory/?support=bereavement&town=Frome#near · ?lat=51.21&lon=-3.6&label=near%20Porlock#near · ?support=anxiety#talk
   support (any tab), town or lat + lon (+ label), within and when (In person). Unknown values are ignored, so a bad link still
   opens the normal page. The address bar follows the filters, so any view can be copied as a link (never "Use my location"). */
// Without a link, the choices made earlier in this visit come back (kept in this browser tab only, never "Use my location"),
// so going to Places and back, or reloading, doesn't reset them.
const STATE_KEY = "ss-directory:" + location.pathname;   // the live and test copies keep their own
const SAVED = (() => {   // { near, talk, course: each tab's filters as a link; sort, area, open, fmt, book } (saveState)
  try { return location.search ? {} : JSON.parse(sessionStorage.getItem(STATE_KEY) || "null") || {}; } catch (e) { return {}; }
})();
const LINK = (() => {   // In person's filters to open with: the address's, or this visit's
  try { return new URLSearchParams(location.search || SAVED.near || ""); } catch (e) { return new URLSearchParams(); }
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
  applyLinkNear();
  if (SAVED.near !== undefined) restoreOthers();   // after: In person's choices also set the other tabs' Support for
}
function applyLinkNear() {
  if (![...LINK.keys()].length) return;
  const sup = LINK.get("support");
  pickOpt(fs, sup); pickOpt($("t-support"), sup); pickOpt($("c-support"), sup);
  const lat = parseFloat(LINK.get("lat")), lon = parseFloat(LINK.get("lon"));
  if (pickOpt($("f-town"), LINK.get("town")) && PLACE[$("f-town").value]) {
    const n = $("f-town").value; searchPoint = { lat: PLACE[n][0], lon: PLACE[n][1], label: n }; sortBy = "near";
  } else if (lat > 50.5 && lat < 51.7 && lon > -4.2 && lon < -1.9) {   // a point in or near the area
    const label = (LINK.get("label") || "").replace(/[<>"]/g, "").trim().slice(0, 60) || "the point on the map";
    searchPoint = { lat, lon, label, link: true }; setPtLabel(cap(label)); $("f-town").value = "__pt"; sortBy = "near";
  }
  pickOpt($("within"), LINK.get("within")); pickOpt($("f-when"), LINK.get("when"));
  fitPending = true;
}
function restoreOthers() {   // the other tabs' choices from earlier in this visit (In person's come back through LINK)
  const sup = (sel, q) => { const v = new URLSearchParams(q || "").get("support"); if (!pickOpt(sel, v)) sel.value = ""; };
  sup($("t-support"), SAVED.talk); sup($("c-support"), SAVED.course);
  if (SAVED.area !== undefined) pickOpt($("t-area"), SAVED.area) || ($("t-area").value = "");
  if (SAVED.fmt !== undefined) pickOpt($("c-fmt"), SAVED.fmt) || ($("c-fmt").value = "");
  $("t-open").checked = !!SAVED.open; $("c-book").checked = !!SAVED.book;
}
function saveState() {
  if (!recordsIn) return;
  const state = { near: linkFor("near"), talk: linkFor("talk"), course: linkFor("course"), sort: sortBy,
    area: $("t-area").value, open: $("t-open").checked, fmt: $("c-fmt").value, book: $("c-book").checked };
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
  } else if (t === "talk" && $("t-support").value) q.set("support", $("t-support").value);
  else if (t === "course" && $("c-support").value) q.set("support", $("c-support").value);
  return q.toString();
}
// The address bar shows the current tab's filters (and they're remembered for the visit)
function syncLink() {
  try { const q = linkFor(tab); history.replaceState(null, "", location.pathname + (q ? "?" + q : "") + "#" + tab); } catch (e) {}
  saveState();
}


/* ---------- opening the page ---------- */
// Opens on In person; a link with #near, #talk, #course or #about opens that tab. Old links to #assist go to the tools page.
(function () {
  if (location.hash === "#assist") { location.replace(TOOLS_URL + "#assist"); return; }
  applyLink();
  const fromHash = SITE_TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "";
  setSiteTab(fromHash || "near");
})();

