/* ---------- In person: the list of cards (the card itself: core/js/service-card.js; the map: map.js) ---------- */
function render() {
  setTimeout(syncLink, 0);   // keep the address bar in step with the filters
  if (!ALL.length) { panelMessage(liveMsg); return; }
  const now = new Date(), sup = fs.value, when = $("f-when").value, rad = +$("within").value;
  $("q-support").classList.toggle("on", !!sup);
  $("q-where").classList.toggle("on", !!searchPoint);
  $("q-when").classList.toggle("on", when !== "week");
  $("within").disabled = !searchPoint;
  $("s-near").disabled = !searchPoint; if (!searchPoint && sortBy === "near") sortBy = "soon";
  $("s-soon").setAttribute("aria-pressed", sortBy === "soon"); $("s-near").setAttribute("aria-pressed", sortBy === "near");
  $("pointnote").textContent = locMsg;  // only short location messages; floats below the box so the filters never change height

  // rows: what meets in the chosen time; checkRows: no set times, so shown below as "Times to check"
  const win = windowFor(when, now), from = win ? new Date(Math.max(win[0], now)) : now;
  let rows = S.filter(s => !sup || s._sf.includes(sup)).map(s => ({
    s, d: searchPoint && !isNaN(s.lat) ? miles(searchPoint, s) : null, nx: nextText(s, now, from) }));
  if (searchPoint && rad) rows = rows.filter(r => r.d != null && r.d <= rad);
  const base = rows;   // before the time filter: used to count what meets later in the month
  let checkRows = [];
  if (when === "now") rows = rows.filter(r => r.s.access === "drop in" && occurrences(r.s, now, 1).some(o => o.timed && o.st <= now && o.en > now));
  else if (win) { checkRows = rows.filter(r => r.s._kind !== "dated"); rows = rows.filter(r => meetsIn(r.s, win)); }
  else { checkRows = rows.filter(r => !r.nx.at); rows = rows.filter(r => r.nx.at); }
  // Counts for the map key follow every filter except the key itself
  const ofKind = (list, i) => list.filter(r => kindOf(r.s) === i).length;
  kindCounts = KINDS.map((_, i) => ofKind(rows, i) + ofKind(checkRows, i));
  if (kindsOff.size) { rows = rows.filter(r => !kindsOff.has(kindOf(r.s))); checkRows = checkRows.filter(r => !kindsOff.has(kindOf(r.s))); }
  if (legendEl) drawLegend(legendEl);
  const bySoon = (a, b) => (a.nx.at - b.nx.at) || ((a.d ?? 0) - (b.d ?? 0));
  const byNear = (a, b) => ((a.d ?? 1e9) - (b.d ?? 1e9)) || ((a.nx.at ?? 9e15) - (b.nx.at ?? 9e15));
  rows.sort(sortBy === "near" ? byNear : bySoon);
  checkRows.sort(searchPoint ? byNear : (a, b) => a.s.name.localeCompare(b.s.name));

  // "Next 7 days" hides monthly groups in the weeks they don't meet: count what meets in the following three weeks
  let later = 0;
  if (when === "week") {
    const shown = new Set(rows.map(r => r.s.id)), wEnd = win[1], mEnd = addDays(dayStart(now), 28);
    later = base.filter(r => r.s._kind === "dated" && !shown.has(r.s.id) && !kindsOff.has(kindOf(r.s)) &&
      occurrences(r.s, wEnd, 21).some(o => o.st >= wEnd && o.st < mEnd)).length;
  }
  const moreLine = later ? `<div class="morehint"><span><b>${later}</b> more ${later === 1 ? "meets" : "meet"} later this month (many groups meet monthly).</span>` +
    `<button type="button" id="show-month">Show next 4 weeks</button></div>` : "";

  const total = rows.length + checkRows.length;
  $("summary").innerHTML = `Showing <b>${total}</b> ${total === 1 ? "service" : "services"}` +
    (sup ? ` for <strong>${esc(cap(sup))}</strong>` : "") +
    (searchPoint ? (rad ? ` within ${rad} miles of ${esc(searchPoint.label)}` : ` by distance from ${esc(searchPoint.label)}`) : "") +
    (checkRows.length ? ` · ${checkRows.length} need times checking` : "");
  if (!total) $("list").innerHTML = moreLine
    ? `<div class="empty"><strong>Nothing in the next 7 days</strong><br>But there are groups later this month.</div>` + moreLine
    : `<div class="empty"><strong>No matches</strong><br>Try a wider distance or a different time, or use the 24/7 helplines below.</div>`;
  else $("list").innerHTML = rows.map(r => serviceCard(r)).join("") + moreLine +
    (checkRows.length ? `<div class="groupline">Times to check${win ? " (may also run then)" : ""}</div>` + checkRows.map(r => serviceCard(r)).join("") : "");
  $("help").classList.toggle("urgent", total <= 2);
  $("help-title").textContent = total <= 2 ? "Nothing suitable right now? Talk to someone straight away" : "Always available: 24/7 helplines";
  drawMap([...rows, ...checkRows], rad);
}

/* ---------- In person's controls ---------- */
const refit = () => { fitPending = true; render(); };
fs.onchange = refit;
$("f-when").onchange = refit;
$("within").onchange = refit;
$("f-town").onchange = e => {
  const t = e.target.value; locMsg = "";
  searchPoint = t && PLACE[t] ? { lat: PLACE[t][0], lon: PLACE[t][1], label: t } : null;
  sortBy = searchPoint ? "near" : "soon"; refit();
};
$("s-soon").onclick = () => { sortBy = "soon"; render(); };
$("s-near").onclick = () => { sortBy = "near"; render(); };
// The 2. Where? box's hidden last choice names a point that isn't a town: "Point on map" or "Your location"
function setPtLabel(txt) { const o = $("f-town").querySelector('option[value="__pt"]'); if (o) o.textContent = txt; }
// "Use my location": optional, asks only when pressed; the position never leaves the browser
(() => {
  const btn = $("uselocation");
  if (!btn || !("geolocation" in navigator)) return;
  btn.hidden = false;
  btn.onclick = () => {
    btn.disabled = true; locMsg = "Finding your location…"; render();
    navigator.geolocation.getCurrentPosition(p => {
      btn.disabled = false; locMsg = "";
      searchPoint = { lat: p.coords.latitude, lon: p.coords.longitude, label: "your location" };
      setPtLabel("Your location"); $("f-town").value = "__pt"; sortBy = "near"; refit();
    }, err => {
      btn.disabled = false;
      locMsg = err.code === 1 ? "Location not allowed" : "Location not found"; render();
      setTimeout(() => { locMsg = ""; render(); }, 5000);
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 });
  };
})();
// Hovering a card lights up its pin; clicking it opens its details and flies the map to it
$("list").addEventListener("mouseover", e => {
  const c = e.target.closest(".card");
  document.querySelectorAll(".pin.hot, .cpin.hot").forEach(p => p.classList.remove("hot"));
  const m = c && markers[c.dataset.id];
  if (m) m.getElement()?.firstElementChild?.classList.add("hot");
});
$("list").addEventListener("click", e => {
  if (e.target.closest("#show-month")) { $("f-when").value = "month"; refit(); return; }
  if (e.target.closest("a, .copy")) return;
  const c = e.target.closest(".card"); if (!c) return;
  c.classList.toggle("open");
  const m = markers[c.dataset.id];
  if (m && map && mapVisible()) { map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 15), { duration: .5 }); m.openTooltip(); }
});
// Phones: the List / Map switch
function setView(v) {
  $("main").classList.toggle("show-map", v === "map");
  $("t-list").setAttribute("aria-pressed", v === "list"); $("t-map").setAttribute("aria-pressed", v === "map");
  if (v === "map" && map) setTimeout(() => { map.invalidateSize(); refit(); }, 30);
}
$("t-list").onclick = () => setView("list");
$("t-map").onclick = () => setView("map");
