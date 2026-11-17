/* ---------- the records: from the published sheet (core/js/sheet.js) ---------- */
// Put a set of records in place, keeping a place chosen while they were loading, then the link's (or this visit's) choices
function applyRecords(recs) {
  const keepTown = $("f-town").value, keepPoint = searchPoint;
  prepare(recs);
  fitPending = true;
  if (keepPoint && (keepTown === "__pt" || PLACE[keepTown])) {
    if (keepTown === "__pt") setPtLabel(keepPoint.label === "your location" ? "Your location" : "Point on map");
    $("f-town").value = keepTown; searchPoint = keepPoint;
  } else { $("f-town").value = ""; searchPoint = null; sortBy = "soon"; }
  applyLink();
  if (!userChanged && !location.search && SAVED.sort && searchPoint) sortBy = SAVED.sort;   // Soonest or Nearest, as it was
  recordsIn = true;
  setSiteTab(tab);   // redraw the tab showing (and the About counts)
}
// A line under the title, only when something has gone wrong
function showSource(txt) { const el = $("datasrc"); el.textContent = txt; el.hidden = !txt; }

// Records loaded earlier in this visit, or else the site's copy of the sheet, show straight away; the sheet is still checked,
// and only a change redraws the page (core/js/sheet-load.js)
if (!cachedRecords()) panelMessage(liveMsg);
loadRecords(
  recs => {
    try { applyRecords(recs); showSource(""); }
    catch (e) {
      console.error("Display error", e);
      showSource(`${recs.length} services loaded, but something went wrong showing them (${e && e.message}). Please send this message to the maintainer.`);
    }
  },
  e => {
    panelMessage(liveMsg = `<strong>Services can't be loaded right now.</strong><br>Please <a href="" onclick="location.reload();return false">try again</a> in a moment. ` +
      `If you need to talk to someone now, call Samaritans on <a href="tel:116123">116 123</a>.` +
      `<br><small style="color:#6B645F">Technical detail: ${esc(String(e && e.message || e))}</small>`);
  });
// Every five minutes, redraw: "open now", "today" and the next sessions move on with the clock
setInterval(() => {
  if (!ALL.length) return;
  tab === "talk" ? renderTalk() : tab === "course" ? renderCourses() : tab === "places" ? places.pick() : render();
}, 5 * 60 * 1000);
