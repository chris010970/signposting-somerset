/* ---------- In person: the map, its pins, and the key (which doubles as a filter) ----------
   Pins and area circles: core/js/map-pins.js; kinds and colours: core/js/kinds.js; tiles: core/js/map-tiles.js */
let map = null, layer = null, ring = null, opin = null;
let markers = {};       // record id -> its marker (several records can share one)
let lastDraw = null;    // the last drawMap arguments, to redraw when zooming in or out changes the clustering
const kindsOff = new Set();          // kinds hidden with the key
let kindCounts = null, legendEl = null;
// The key starts open on wider screens and folded on phones; a viewer's choice is remembered on their device
let legendOpen = !matchMedia("(max-width: 700px)").matches;
try { const v = localStorage.getItem("keyOpen"); if (v) legendOpen = v === "1"; } catch (_) {}
const mapVisible = () => $("map").offsetWidth > 0;

function initMap() {
  if (map || !window.L) return;
  map = L.map("map", { zoomControl: false, zoomSnap: 0.25, zoomDelta: 0.5 }).setView([51.1, -2.95], 9);
  L.control.zoom({ position: "topright" }).addTo(map);
  const legend = L.control({ position: "topleft" });
  legend.onAdd = () => {
    const d = L.DomUtil.create("div", "maplegend");
    L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d);   // clicks here mustn't set a search point
    d.addEventListener("click", e => keyClick(e, d));
    drawLegend(d); return d;
  };
  legend.addTo(map);
  // Tiles: if the first map style keeps failing, try the next; if none load, say so (the pins still work)
  let failed = 0, which = 0;
  const tiles = L.tileLayer(TILE_URLS[0], { maxZoom: 19, attribution: TILE_CREDIT })
    .on("tileerror", () => {
      if (++failed < 4) return;
      failed = 0;
      if (++which < TILE_URLS.length) tiles.setUrl(TILE_URLS[which]); else $("tilenote").hidden = false;
    }).addTo(map);
  if (OUTLINE) try {
    const rings = OUTLINE.coordinates.map(p => p[0].map(([x, y]) => [y, x]));
    // light wash outside the county, then a dashed edge; neither takes clicks
    L.polygon([[[60, -12], [60, 5], [48, 5], [48, -12]], ...rings], { stroke: false, fillColor: "#5B6B60", fillOpacity: .07, interactive: false }).addTo(map);
    L.polygon(rings, { color: "#3D6C53", weight: 1.6, opacity: .7, dashArray: "6 5", fill: false, interactive: false }).addTo(map);
    map.attributionControl.addAttribution("County outline: ONS, contains OS data © Crown copyright");
  } catch (e) { console.error("Couldn't draw the county outline", e); }
  layer = L.layerGroup().addTo(map);
  map.on("zoomend", () => { if (lastDraw && !fitPending) drawMap(...lastDraw); });
  // Tapping the map searches around that point
  map.on("click", e => {
    searchPoint = { lat: e.latlng.lat, lon: e.latlng.lng, label: "the point on the map" };
    setPtLabel("Point on map"); $("f-town").value = "__pt"; sortBy = "near"; fitPending = true; render();
  });
}

/* The key: tap a kind to hide or show it */
function keyClick(e, d) {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.k === "toggle") {
    legendOpen = !legendOpen;
    try { localStorage.setItem("keyOpen", legendOpen ? "1" : "0"); } catch (_) {}
    setTimeout(() => drawLegend(d), 0); return;
  }
  if (b.dataset.k === "all") kindsOff.clear();
  else {
    const k = +b.dataset.k;
    kindsOff.has(k) ? kindsOff.delete(k) : kindsOff.add(k);
    // everything there is hidden: show it all again
    if (KINDS.every((_, i) => kindsOff.has(i) || !S.some(x => kindOf(x) === i))) kindsOff.clear();
  }
  setTimeout(() => render(), 0);   // redraw after the click finishes, so the map knows it came from the key
}
function drawLegend(d) {
  legendEl = d;
  const has = KINDS.map((_, i) => S.some(x => kindOf(x) === i));      // kinds that ever appear on this map
  const n = kindCounts || KINDS.map((_, i) => S.filter(x => kindOf(x) === i).length);
  d.classList.toggle("closed", !legendOpen);
  const chev = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>`;
  const dots = KINDS.map((k, i) => has[i] && !kindsOff.has(i) ? `<i style="background:${k[1]}"></i>` : "").join("");
  const head = `<button type="button" class="lghead" data-k="toggle" aria-expanded="${legendOpen}" title="${legendOpen ? "Hide the key" : "Show the key"}">What it is ` +
    (legendOpen ? `<span>tap to filter</span>` : `<span class="dots">${dots}</span>${kindsOff.size ? `<span>· filtered</span>` : ""}`) + chev + `</button>`;
  if (!legendOpen) { d.innerHTML = head; return; }
  const row = (k, i) => `<button type="button"${n[i] ? "" : ' class="zero"'} data-k="${i}" aria-pressed="${!kindsOff.has(i)}">
      <i style="--c:${k[1]}"></i><span class="lt">${esc(k[0])}<small>${esc(k[2].filter(t => S.some(x => x.type === t)).join(", "))}</small></span><em>${n[i]}</em></button>`;
  d.innerHTML = head + KINDS.map((k, i) => has[i] ? row(k, i) : "").join("") +
    (kindsOff.size ? `<button type="button" class="all" data-k="all">Show all</button>` : "");
}

/* Pins */
const divIcon = (html, size) => L.divIcon({ className: "", html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
// Zoomed out: one numbered circle for an area's services; clicking it zooms in
function drawArea(c) {
  const all = c.spots.flatMap(([, g]) => g);
  const lat = all.reduce((a, s) => a + s.lat, 0) / all.length, lon = all.reduce((a, s) => a + s.lon, 0) / all.length;
  const towns = {}; all.forEach(s => towns[s.town] = (towns[s.town] || 0) + 1);
  const town = Object.entries(towns).sort((a, b) => b[1] - a[1])[0][0];
  const b = L.latLngBounds(all.map(s => [s.lat, s.lon]));
  const m = L.marker([lat, lon], { icon: divIcon(`<div class="cpin area" style="background:${clusterBg(all)}"><span>${all.length}</span></div>`, 34),
      title: `${all.length} services around ${town}` })
    .bindTooltip(`<strong>${all.length} services</strong><br>around ${esc(town)} · click to zoom in`, { direction: "top", offset: [0, -14] })
    .on("click", () => map.flyToBounds(b.pad(0.15), { maxZoom: AREA_ZOOM + 2, duration: .5 }));
  m.addTo(layer); all.forEach(s => markers[s.id] = m);
  return [lat, lon];
}
// One pin for a single service; a numbered pin with a list for several at the same spot
function drawSpot(k, g) {
  const s0 = g[0], ll = [s0.lat, s0.lon], approx = g.every(s => s.approx);
  let m;
  if (g.length === 1) {
    m = L.marker(ll, { icon: divIcon(`<div class="pin${approx ? " approx" : ""}" data-k="${k}" style="background:${pinCol(s0)}"></div>`, 14), title: s0.name })
      .bindTooltip(`<strong>${esc(s0.name)}</strong><br>${esc(s0.town)}`, { direction: "top", offset: [0, -6] })
      .on("click", () => showCard(s0.id));
  } else {
    const place = approx ? `${esc(s0.town)} (town centre)` : esc(s0.address || s0.town);
    const list = g.map(s => `<li><button type="button" class="plink" data-id="${s.id}">${esc(s.name)}</button></li>`).join("");
    m = L.marker(ll, { icon: divIcon(`<div class="cpin${approx ? " approx" : ""}" data-k="${k}" style="background:${clusterBg(g)}"><span>${g.length}</span></div>`, 28),
        title: `${g.length} services` })
      .bindTooltip(`<strong>${g.length} services</strong><br>${place}`, { direction: "top", offset: [0, -12] })
      .bindPopup(`<div class="plist"><div class="plist-h">${g.length} services · ${place}</div><ul>${list}</ul></div>`, { maxWidth: 280 });
  }
  m.addTo(layer);
  g.forEach(s => markers[s.id] = m);
  return ll;
}
function drawMap(rows, rad) {
  if (!map) return;
  lastDraw = [rows, rad];
  layer.clearLayers(); markers = {};
  const pts = [], groups = new Map();   // groups: services at the same spot
  rows.forEach(({ s }) => {
    if (isNaN(s.lat)) return;
    const k = spotKey(s); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s);
  });
  let spots = [...groups.entries()];
  if (map.getZoom() <= AREA_ZOOM) {
    spots = [];
    for (const c of areaClusters(groups, map)) {
      if (c.spots.length === 1) { spots.push(c.spots[0]); continue; }
      try { drawArea(c); c.spots.forEach(([, g]) => pts.push([g[0].lat, g[0].lon])); }
      catch (e) { console.error("Couldn't draw an area cluster", e); }
    }
  }
  for (const [k, g] of spots) {
    try { pts.push(drawSpot(k, g)); }
    catch (e) { console.error("Couldn't draw a map pin for", g.map(s => s.name).join("; "), e); }
  }
  // The search point and its radius
  if (ring) { map.removeLayer(ring); ring = null; }
  if (opin) { map.removeLayer(opin); opin = null; }
  if (searchPoint) {
    opin = L.marker([searchPoint.lat, searchPoint.lon], { icon: divIcon('<div class="opin"></div>', 16), interactive: false }).addTo(map);
    if (rad) ring = L.circle([searchPoint.lat, searchPoint.lon], { radius: rad * 1609.34, color: "#3D6C53", weight: 1.5, dashArray: "5 5", fillColor: "#3D6C53", fillOpacity: .06, interactive: false }).addTo(map);
    pts.push([searchPoint.lat, searchPoint.lon]);
  }
  if (fitPending && mapVisible()) {
    fitPending = false;
    // Fit snugly, leaving room for the key on the left (when it's beside the pins rather than over them)
    const key = document.querySelector(".maplegend"), kw = key && map.getSize().x > 700 ? key.offsetWidth + 20 : 0;
    if (pts.length > 1) map.flyToBounds(L.latLngBounds(pts), { paddingTopLeft: [Math.min(kw, 120) || 30, 30], paddingBottomRight: [30, 30], maxZoom: 14, duration: .6 });
    else if (pts.length === 1) map.flyTo(pts[0], 13, { duration: .6 });
    else map.flyTo([51.1, -2.95], 9, { duration: .6 });
  }
}
// A pin was clicked: show its card (on phones, switching to the list first)
function showCard(id) {
  const c = $("c" + id); if (!c) return;
  if (innerWidth < 900) setView("list");
  c.scrollIntoView({ behavior: "smooth", block: "center" });
  c.classList.add("flash"); setTimeout(() => c.classList.remove("flash"), 1200);
}
$("map").addEventListener("click", e => { const b = e.target.closest(".plink"); if (b) { map && map.closePopup(); showCard(b.dataset.id); } });
