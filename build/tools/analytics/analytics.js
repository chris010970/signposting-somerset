/* Analytics (tools page). From the directory's Analytics tab, v24 (commit 3d48734); see build/analytics/DESIGN.md.
   Uses: S (in-person records, set by tools.js), TOWNS, KINDS, kindOf, pinCol, nextText, supportOptions, esc, cap, $, copyToClipboard
   and the map pins (spotKey, clusterBg, areaClusters, AREA_ZOOM) from build/core/; setTab, tab, SITE_BASE and DIRECTORY_URL from tools.js; Leaflet (L). */
/* ---------- Analytics tab (desktop only: hidden below 760px wide) ----------
   Three columns: Explore (a chart and a ranked list of all 595 LSOAs) · Locate (the map) · Understand (the local support profile).
   One shared selection: picking an LSOA in the chart, the list or the map selects it everywhere. Filters recalculate without
   clearing the selection or moving the map. The LSOA file (assets/analytics-lsoa.geojson) loads only when the tab is first opened;
   distances and counts are worked out here from the live records, from each LSOA's postcode-weighted centre (where people live). */
// One colour per grid square, used on the map too. Rows: indicator band (0 = most need). Columns: distance fifth (0 = nearest).
const AN_LUT = [
  ["#176B55", "#236A55", "#356D54", "#547052", "#79694C"],
  ["#328D73", "#498F73", "#69916D", "#8D9065", "#A58356"],
  ["#70B7A0", "#8BB99E", "#A9BA94", "#C0B184", "#BD9870"],
  ["#B1D9C7", "#C4D8BD", "#D8D3AD", "#DDC49D", "#D5AF88"],
  ["#E9F3EC", "#E9EDE2", "#EEE9D8", "#EDE0C9", "#E9D2B8"]];
const AN_NODATA = "#D9D9D6";
const AN_RUC = { Urban: "#4E9C88", Rural: "#A08A5C" }, AN_A = "#7A2E8E", AN_B = "#1B5FA8";
const AN_N = 33755, AN_HALF = AN_N / 2;   // LSOAs in England (IMD 2025)
// One entry per indicator. Everything that differs between indicators lives here: the grid rows, the map shading and key,
// the ranking, the optional "higher half" filter, the profile tile, the compare row and the copy line all come from it.
// bands: most need first (the top row and the darkest shading). has: whether an LSOA has a value (otherwise "No data").
const aFmt = n => n.toLocaleString("en-GB"), aDec = r => Math.ceil(r / (AN_N / 10));
const aDecBands = k => [["Decile 1–2", "most deprived", 1], ["Decile 3–4", "", 3], ["Decile 5–6", "", 5], ["Decile 7–8", "", 7], ["Decile 9–10", "least deprived", 9]]
  .map(([label, sub, d]) => ({ label, sub, row: `${d}–${d + 1}`, test: p => p[k] === d || p[k] === d + 1 }));
const aNum = k => p => Number.isFinite(p[k]);
const AN_IND = {
  imd: { name: "Deprivation (IMD 2025)", short: "Deprivation", axis: "Deprivation decile", col: "IMD rank", has: aNum("imdr"), unit: "", hot: "most deprived",
    ends: ["Less deprived", "More deprived"], bands: aDecBands("imd"),
    hi: { lab: "Most deprived half", test: p => p.imdr <= AN_HALF }, cmp: (a, b) => a.imdr - b.imdr || b.pop - a.pop,
    val: p => aFmt(p.imdr), tile: p => [aFmt(p.imdr), "deprivation rank", "decile " + p.imd],
    copy: p => `rank ${aFmt(p.imdr)} of ${aFmt(AN_N)} in England (decile ${p.imd})`,
    note: "Ranked by the national deprivation rank (1 = most deprived LSOA in England)." },
  hdep: { name: "Health deprivation (IMD 2025)", short: "Health deprivation", axis: "Health deprivation decile", col: "Health rank", has: aNum("hr"), unit: "", hot: "most health-deprived",
    ends: ["Less deprived", "More deprived"], bands: aDecBands("hdep"),
    hi: { lab: "Most health-deprived half", test: p => p.hr <= AN_HALF }, cmp: (a, b) => a.hr - b.hr || b.pop - a.pop,
    val: p => aFmt(p.hr), tile: p => [aFmt(p.hr), "health rank", "decile " + p.hdep],
    copy: p => `rank ${aFmt(p.hr)} of ${aFmt(AN_N)} (decile ${p.hdep})`,
    note: "Ranked by the national health deprivation and disability rank (1 = most deprived in England)." },
  dis: { name: "Disabled people (Census 2021)", short: "Disabled people", axis: "Disabled residents", col: "Disabled", has: aNum("dis"), unit: "disabled", hot: "most disabled residents",
    ends: ["Fewer", "More disabled residents"],
    bands: [["24%+", "most disabled residents", 24, 101], ["21–24%", "", 21, 24], ["18–21%", "", 18, 21], ["15–18%", "", 15, 18], ["under 15%", "fewest", -1, 15, "<15%"]]
      .map(([label, sub, lo, hi, tick]) => ({ label, sub, tick, test: p => p.dis >= lo && p.dis < hi })),
    hi: { lab: "Above England median", test: p => p.dis > aDisMed }, cmp: (a, b) => b.dis - a.dis || b.disn - a.disn,
    val: p => p.dis.toFixed(1) + "%", tile: p => [p.dis.toFixed(1) + "%", "disabled", aFmt(p.disn) + " people"],
    copy: p => `${p.dis.toFixed(1)}% (${aFmt(p.disn)} people)`,
    note: "Ranked by the share of residents disabled under the Equality Act (highest first)." },
  dens: { name: "Population density (2022)", short: "Population density", axis: "People per km²", col: "Per km²", has: aNum("dens"), unit: "per km²", hot: "most sparsely populated",
    ends: ["Denser", "More sparsely populated"],
    bands: [["under 50", "sparsest", 0, 50, "<50"], ["50–250", "", 50, 250], ["250–1,000", "", 250, 1000, "250–1k"], ["1,000–4,000", "", 1000, 4000, "1k–4k"], ["4,000+", "densest", 4000, Infinity, "4k+"]]
      .map(([label, sub, lo, hi, tick]) => ({ label, sub, tick, test: p => p.dens >= lo && p.dens < hi })),
    hi: null, cmp: (a, b) => a.dens - b.dens || b.pop - a.pop,   // least dense first; no "higher half" filter
    val: p => aFmt(p.dens), tile: p => [aFmt(p.dens), "people per km²", ""],
    copy: p => `${aFmt(p.dens)} people per km²`,
    note: "Ranked by people per km², least dense first (sparse areas tend to be further from services)." },
};
// Accessibility: the grid's columns are fifths of residents by distance to the nearest matching support (cumulative %),
// worked out again whenever Support for / How often change, and labelled with their miles. Areas with no matching
// support anywhere go in a separate "None recorded" column. A count measure could replace this later with the same shape.
const AN_ACC = {
  title: () => "Miles to nearest support · fifths of residents",
  names: ["Nearest 20%", "20–40%", "40–60%", "60–80%", "Furthest 20%"],
  cols: [], br: [],
  none: "None recorded",
};
const aMiF = d => d < 1 ? d.toFixed(1) : d % 1 ? d.toFixed(1) : String(d);
function anBreaks() {   // cut points at 20/40/60/80% of residents, rounded to 0.1 mile under a mile and to half a mile above
  const rnd = d => d < 1 ? Math.max(.1, Math.round(d * 10) / 10) : Math.round(d * 2) / 2;
  const P = aGeo.features.map(f => f.properties).filter(p => p.nr).sort((a, b) => a.dist - b.dist), tot = P.reduce((t, p) => t + p.pop, 0);
  let br = [], cum = 0, k = 1;
  for (const p of P) { cum += p.pop; while (k <= 4 && cum >= tot * k / 5) { br.push(rnd(p.dist)); k++; } }
  if (br.length < 4) br = [.5, 1, 2, 5];
  for (let i = 1; i < 4; i++) if (br[i] <= br[i - 1]) br[i] = rnd(br[i - 1] + (br[i - 1] < 1 ? .1 : .5));
  AN_ACC.br = br;
  AN_ACC.cols = AN_ACC.names.map((label, j) => ({ label, mi: j === 0 ? "< " + aMiF(br[0]) : j === 4 ? aMiF(br[3]) + "+" : aMiF(br[j - 1]) + "–" + aMiF(br[j]),
    test: d => j === 4 || d < br[j] }));
}
let aReady = false, amap = null, aGeo = null, aAreas = null, aPins = null, aLegendEl = null, aScaleEl = null, aDisMed = 17;
let aInd = "imd", aShow = "all", aSort = { col: "rk", dir: 1 }, aFind = "", aSel = null, aCmp = false, aA = null, aB = null, aShownNow = [];
const aLocated = () => S.filter(s => !s.approx && !isNaN(s.lat) && !isNaN(s.lon));
const aR = p => p.ruc === "Urban" ? 1 : 3;   // search area: 1 mile urban, 3 miles rural (stated in the header)
const aMi = d => d >= 99 ? "–" : d < 10 ? d.toFixed(1) + " mi" : Math.round(d) + " mi";
const aShort = n => n.replace("Somerset West and Taunton", "Som. W & Taunton").replace("Bath and North East Somerset", "B&NES");
const aLA = la => la === "Bath and North East Somerset" ? "B&NES" : la;
const aSupL = () => { const v = $("an-support").value; return v ? cap(v).toLowerCase() : ""; };
function anMiles(a, b) { const r = Math.PI / 180, dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) ** 2; return 7917.6 * Math.asin(Math.sqrt(h)); }

// How often: from days + frequency. Blank frequency = weekly (as elsewhere on the site); no set days or "see website" can't be placed
function aFreq(s) {
  const f = (s.frequency || "").toLowerCase().trim();
  if (!s._days.size || /see website/.test(f)) return null;
  if (/fortnight|month/.test(f)) return "less";
  if (!f || f === "weekly") return s._days.size >= 5 ? "daily" : "weekly";
  return null;
}
function aOften(s, w) { if (!w) return true; const c = aFreq(s); return w === "weekly" ? c === "daily" || c === "weekly" : c === w; }
const aShown = () => { const sup = $("an-support").value, w = $("an-often").value;
  return aLocated().filter(s => kindOf(s) >= 0 && (!sup || s._sf.includes(sup)) && aOften(s, w)); };

// Nearest named place, from the site's own town list (street-like entries left out)
let aTowns = null;
function aNear(p) {
  aTowns = aTowns || Object.entries(TOWNS).filter(([n]) => !/\b(Way|Road|Street|Lane|Close|Estate|Park)\b/.test(n));
  let best = "", bd = 1e9; for (const [n, ll] of aTowns) { const d = anMiles(p.c, ll); if (d < bd) { bd = d; best = n; } } return best;
}
const aPlace = p => "near " + p.near;

/* ---------- calculations ---------- */
function anCompute() {   // after Support for / How often change: nearest matching service and matching count within the search area
  const rel = aShown(); aShownNow = rel;
  for (const f of aGeo.features) {
    const p = f.properties; let best = null, bd = 1e9, n = 0;
    for (const s of rel) { const d = anMiles(p.c, [s.lat, s.lon]); if (d < bd) { bd = d; best = s; } if (d <= aR(p)) n++; }
    p.dist = best ? bd : 99; p.nr = best; p.nIn = n;
  }
  anBreaks();
}
function anRank() {   // after the indicator changes: a stable rank 1–595 by the indicator alone (no distance in it)
  const I = AN_IND[aInd];
  aGeo.features.slice().sort((a, b) => (I.has(b.properties) - I.has(a.properties)) || (I.has(a.properties) ? I.cmp(a.properties, b.properties) : 0)).forEach((f, i) => f.properties.rk = i + 1);
}
const aKeep = p => { const I = AN_IND[aInd];
  const hi = I.hi && I.hi.test(p);
  return aShow === "all" || (aShow === "hi" && hi) || (aShow === "none" && !p.nIn) || (aShow === "both" && hi && !p.nIn); };

/* ---------- map ---------- */
const aLutRow = (i, n) => Math.round(i * (AN_LUT.length - 1) / Math.max(1, n - 1));
function anFill(p) {   // the square's colour: indicator band × distance fifth (no matching support anywhere = furthest)
  const [r, c] = aCellOf(p), n = AN_IND[aInd].bands.length;
  return r >= n ? AN_NODATA : AN_LUT[aLutRow(r, n)][Math.min(c, 4)];
}
// Selection: everything else fades a little; the selected areas keep full colour, get a thin white edge and lift (shadow)
const anOn = f => f === (aCmp ? aA : aSel) || (aCmp && f === aB) || (aCells.size > 0 && aInCell(f));
function anStyle(f) {
  const any = !!((aCmp ? aA : aSel) || aCells.size), on = anOn(f), cmp = aCmp && (f === aA || f === aB);
  return { fillColor: anFill(f.properties), fillOpacity: any ? (on ? 1 : .45) : .9, opacity: 1, dashArray: null,
    color: cmp ? (f === aA ? AN_A : AN_B) : on ? "#fff" : "rgba(255,255,255,.55)", weight: cmp ? 2.5 : on ? 1.5 : .35 };
}
function anScale() {   // the map key: the same 5 × 5 colours as the grid
  if (!aScaleEl) return;
  const I = AN_IND[aInd], miss = aGeo.features.some(f => !I.has(f.properties));
  aScaleEl.innerHTML = `<b>${esc(I.short)} × distance</b><div class="an-bik">${AN_LUT.map(r => r.map(c => `<i style="background:${c}"></i>`).join("")).join("")}</div>` +
    `<div class="an-bil"><span>near → far</span><span>↑ ${esc(I.ends[1].toLowerCase())}</span></div>` + (miss ? `<div class="an-bil"><span><i class="an-nod"></i>No data</span></div>` : "");
}
function anLegendPlain() {   // a plain legend: the filters live in the header, not on the map
  if (!aLegendEl) return;
  const has = KINDS.map((_, i) => aShownNow.some(s => kindOf(s) === i)), sup = aSupL();
  aLegendEl.innerHTML = `<b>Services${sup ? " · " + esc(sup) : ""}</b>` + KINDS.map((k, i) => has[i] ? `<span><i style="background:${k[1]}"></i>${esc(k[0])}</span>` : "").join("");
}
function anDrawPins() {
  if (!aPins) return;
  aPins.clearLayers();
  const now = new Date(), spots = new Map();
  for (const s of aShownNow) { const k = spotKey(s); if (!spots.has(k)) spots.set(k, []); spots.get(k).push(s); }
  const link = s => s.url ? `<a class="plink" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>`
    : s.phone ? `${esc(s.name)} · <a href="tel:${esc(s.phone.replace(/[^\d+]/g, ""))}">${esc(s.phone)}</a>` : esc(s.name);
  let list = [...spots.entries()];
  if (amap.getZoom() <= AREA_ZOOM) {   // zoomed out: merge nearby pins into area circles, as on In person
    list = [];
    for (const c of areaClusters(spots, amap)) {
      if (c.spots.length === 1) { list.push(c.spots[0]); continue; }
      const all = c.spots.flatMap(([, g]) => g);
      const lat = all.reduce((x, s) => x + s.lat, 0) / all.length, lon = all.reduce((x, s) => x + s.lon, 0) / all.length;
      const towns = {}; all.forEach(s => towns[s.town] = (towns[s.town] || 0) + 1);
      const town = Object.entries(towns).sort((x, y) => y[1] - x[1])[0][0], bd = L.latLngBounds(all.map(s => [s.lat, s.lon]));
      L.marker([lat, lon], { icon: L.divIcon({ className: "", html: `<div class="cpin area" style="background:${clusterBg(all)}"><span>${all.length}</span></div>`, iconSize: [34, 34], iconAnchor: [17, 17] }), title: `${all.length} services around ${town}` })
        .bindTooltip(`<strong>${all.length} services</strong><br>around ${esc(town)} · click to zoom in`, { direction: "top", offset: [0, -14] })
        .on("click", () => amap.flyToBounds(bd.pad(0.15), { maxZoom: AREA_ZOOM + 2, duration: .5 })).addTo(aPins);
    }
  }
  for (const [, g] of list) {
    const s0 = g[0], place = esc(s0.address || s0.town || "");
    (g.length === 1
      ? L.marker([s0.lat, s0.lon], { icon: L.divIcon({ className: "", html: `<div class="pin" style="background:${pinCol(s0)}"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] }), title: s0.name })
          .bindTooltip(`<strong>${esc(s0.name)}</strong><br>${esc(s0.town || "")}`, { direction: "top", offset: [0, -6] })
          .bindPopup(`<div class="plist"><div class="plist-h">${place}</div><ul><li>${link(s0)}<br><span class="an-pnext">${esc(nextText(s0, now).txt)}</span></li></ul></div>`, { maxWidth: 280 })
      : L.marker([s0.lat, s0.lon], { icon: L.divIcon({ className: "", html: `<div class="cpin" style="background:${clusterBg(g)}"><span>${g.length}</span></div>`, iconSize: [28, 28], iconAnchor: [14, 14] }), title: `${g.length} services` })
          .bindTooltip(`<strong>${g.length} services</strong><br>${place}`, { direction: "top", offset: [0, -12] })
          .bindPopup(`<div class="plist"><div class="plist-h">${g.length} services · ${place}</div><ul>${g.map(s => `<li>${link(s)}</li>`).join("")}</ul></div>`, { maxWidth: 280 })
    ).addTo(aPins);
  }
}

/* ---------- chart (left, top): indicator up, distance to the nearest matching support across ---------- */
// The grid: LSOAs counted by indicator band (rows, most need at the top) and distance to the nearest matching support (columns).
// Clicking a square selects that group: outlined on the map, the only rows in the list, listed in the right panel.
// Rows: the indicator's bands (plus "No data" only if some LSOA has no value). Columns: AN_ACC (plus "None recorded" only if needed).
// Row and column numbers are fixed per indicator (No data = bands.length, None recorded = cols.length), so a selection
// keeps its meaning when the filters change ("most deprived, furthest fifth") and only its members are recalculated.
const aRowOf = p => { const I = AN_IND[aInd]; return I.has(p) ? I.bands.findIndex(b => b.test(p)) : -1; };
const aColOf = p => p.nr ? AN_ACC.cols.findIndex(c => c.test(p.dist)) : -1;
// Pure: puts every feature in exactly one cell. -1 from rowOf/colOf goes to the extra row/column.
function anAggregate(F, rowOf, colOf, nR, nC) {
  const cells = Array.from({ length: nR + 1 }, () => Array.from({ length: nC + 1 }, () => ({ ls: [], pop: 0 })));
  for (const f of F) {
    const p = f.properties, r0 = rowOf(p), c0 = colOf(p), x = cells[r0 < 0 ? nR : r0][c0 < 0 ? nC : c0];
    x.ls.push(f); x.pop += p.pop || 0;
  }
  const sum = l => l.reduce((t, c) => ({ n: t.n + c.ls.length, pop: t.pop + c.pop }), { n: 0, pop: 0 });
  const rows = cells.map(sum), cols = cells[0].map((_, j) => sum(cells.map(r => r[j])));
  return { cells, rows, cols, total: sum(cells.flat()), missing: rows[nR].n, none: cols[nC].n, nR, nC };
}
const anAgg = () => anAggregate(aGeo.features, aRowOf, aColOf, AN_IND[aInd].bands.length, AN_ACC.cols.length);
// The selection is a set of squares ("row,col"). Squares, whole rows and whole columns can be clicked on and off.
let aCells = new Set(), aVisR = [], aVisC = [];
const aCellOf = p => { const r = aRowOf(p), c = aColOf(p); return [r < 0 ? AN_IND[aInd].bands.length : r, c < 0 ? AN_ACC.cols.length : c]; };
const aInCell = f => aCells.has(aCellOf(f.properties).join(","));
const aCellList = () => aCells.size ? aGeo.features.filter(aInCell) : [];
function aCellLabel() {
  const I = AN_IND[aInd], nR = I.bands.length, nC = AN_ACC.cols.length, ks = [...aCells].map(k => k.split(",").map(Number));
  const rows = new Set(ks.map(k => k[0])), cols = new Set(ks.map(k => k[1]));
  const rl = r => r < nR ? I.bands[r].label + (I.unit ? " " + I.unit : "") : "no data";
  const cl = c => c < nC ? `${AN_ACC.cols[c].label.toLowerCase()} (${AN_ACC.cols[c].mi} mi)` : "no matching support recorded";
  if (ks.length === 1) return rl(ks[0][0]) + " · " + cl(ks[0][1]);
  if (rows.size === 1) return rl([...rows][0]) + " · " + (aVisC.every(c => aCells.has(ks[0][0] + "," + c)) ? "any distance" : ks.length + " distance bands");
  if (cols.size === 1) return cl([...cols][0]) + " · " + (aVisR.every(r => aCells.has(r + "," + ks[0][1])) ? "all bands" : ks.length + " bands");
  return ks.length + " squares";
}
const k1 = n => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "") + "k" : String(n);
function anChart() {
  const box = $("an-svg"); if (!aReady || !box || !box.clientWidth) return;
  const I = AN_IND[aInd], sup = aSupL(), A = anAgg(), nR = A.nR, nC = A.nC;
  aVisR = [...I.bands.map((_, i) => i), ...(A.missing ? [nR] : [])];
  aVisC = [...AN_ACC.cols.map((_, j) => j), ...(A.none ? [nC] : [])];
  const far = r => A.cells[r].slice(nC - 2).reduce((t, c) => t + c.ls.length, 0);   // furthest two fifths + none recorded
  const pc = (a, b) => b ? Math.round(100 * a / b) + "%" : "–";
  const mine = aCmp ? aA : aSel, me = mine ? aCellOf(mine.properties) : [-1, -1];
  const rowLab = i => i < nR ? (I.bands[i].row || I.bands[i].label) : "No data";
  const fill = (i, j) => i < nR ? AN_LUT[aLutRow(i, nR)][Math.min(j, 4)] : AN_NODATA;
  $("an-ctitle").textContent = `${I.short} and distance to the nearest ${sup ? sup + " " : ""}support`;
  box.innerHTML = `<table class="g2"><thead><tr class="band"><td colspan="2"></td><th colspan="${aVisC.length}">${esc(AN_ACC.title(sup))}</th><td colspan="2"></td></tr>` +
    `<tr><td colspan="2"></td>${aVisC.map(j => j < nC ? `<th class="ch" data-col="${j}" title="Select this column"><span>${esc(AN_ACC.cols[j].label)}</span>${esc(AN_ACC.cols[j].mi)}</th>`
      : `<th class="ch" data-col="${j}"><span>None</span>recorded</th>`).join("")}<th class="tt">Total</th><th class="tt" title="Share of the row in the furthest two fifths (or with no matching support)">% in<br>furthest<br>40%</th></tr></thead><tbody>` +
    aVisR.map((i, ri) => `<tr>${ri ? "" : `<th class="vax" rowspan="${aVisR.length}">${esc(I.axis)}</th>`}<th class="rl" data-row="${i}" title="Select this row">${esc(rowLab(i))}${i < nR && I.bands[i].sub ? `<small>${esc(I.bands[i].sub.replace(" residents", ""))}</small>` : ""}</th>` +
      aVisC.map(j => { const c = A.cells[i][j], n = c.ls.length, k = i + "," + j;
        return `<td class="c${n ? "" : " z"}${i <= 1 && i < nR && j >= nC - 2 ? " hot" : ""}${aCells.has(k) ? " on" : ""}${i === me[0] && j === me[1] ? " me" : ""}" data-r="${i}" data-c="${j}" style="background:${fill(i, j)};color:${i <= 1 && i < nR ? "#fff" : "var(--b900)"}" title="${n} LSOAs, ${aFmt(c.pop)} people"><b>${n || "–"}</b>${n ? `<span>${k1(c.pop)}</span>` : ""}</td>`; }).join("") +
      `<td class="t">${A.rows[i].n}</td><td class="t pc">${pc(far(i), A.rows[i].n)}</td></tr>`).join("") +
    `<tr class="tot"><td></td><th class="rl">Total</th>${aVisC.map(j => `<td class="t">${A.cols[j].n}</td>`).join("")}<td class="t">${A.total.n}</td><td class="t pc">${pc(aVisR.reduce((t, i) => t + far(i), 0), A.total.n)}</td></tr></tbody></table>`;
  const top = I.bands[0], tf = A.cells[0].slice(nC - 2).reduce((t, c) => ({ n: t.n + c.ls.length, pop: t.pop + c.pop }), { n: 0, pop: 0 });
  $("an-cap").innerHTML = `<div class="an-gkey"><span>Square colour = map colour · big figure: LSOAs · small: people</span><span><i class="hotk"></i>${esc(I.hot)}, furthest 40%</span></div>` +
    `<p class="an-take"><b>${tf.n} of ${A.rows[0].n}</b> LSOAs in the top band (${esc(top.label.toLowerCase())}${I.unit ? " " + I.unit : ""}, ${esc(top.sub)}) are in the furthest 40% of residents from ${esc(sup ? sup + " " : "")}support (${aMiF(AN_ACC.br[2])}+ miles, or none recorded): <b>${k1(tf.pop)} people</b>.</p>`;
}
function anGridHover(f) {   // map hover → ring the square that LSOA belongs to
  document.querySelectorAll("#an-svg td.hov").forEach(td => td.classList.remove("hov")); if (!f || $("an-pchart").hidden) return;
  const [r, c] = aCellOf(f.properties), td = document.querySelector(`#an-svg td[data-r="${r}"][data-c="${c}"]`); if (td) td.classList.add("hov");
}
function anToggle(keys) {   // add them all, or remove them all if they're all selected already
  const all = keys.every(k => aCells.has(k)); keys.forEach(k => all ? aCells.delete(k) : aCells.add(k));
  if (aCells.size) { aSel = null; aCmp = false; aA = aB = null; }
  anSync();
  const l = aCellList(); if (l.length) amap.fitBounds(L.featureGroup(l.map(f => f.__l)).getBounds().pad(.2), { maxZoom: 12 });
}
/* ---------- list (left, below the chart) ---------- */
function anListHead() {
  const I = AN_IND[aInd], sup = aSupL(), F = aGeo.features;
  const hi = p => I.hi && I.hi.test(p);
  const c = { all: F.length, hi: F.filter(f => hi(f.properties)).length, none: F.filter(f => !f.properties.nIn).length,
    both: F.filter(f => hi(f.properties) && !f.properties.nIn).length };
  const chip = (k, t) => `<button type="button" data-show="${k}" aria-pressed="${aShow === k}">${esc(t)} <em>${c[k]}</em></button>`;
  $("an-chips").innerHTML = chip("all", "All") + (I.hi ? chip("hi", I.hi.lab) : "") + chip("none", `No ${sup ? sup + " " : ""}support nearby`) + (I.hi ? chip("both", "Both") : "");
  $("an-rule").textContent = I.note;
  const arrow = k => aSort.col === k ? (aSort.dir > 0 ? " ↑" : " ↓") : "";
  $("an-thead").innerHTML = `<tr><th data-sort="rk">Rank${arrow("rk")}</th><th data-sort="near">Place · LSOA${arrow("near")}</th>` +
    `<th class="r" data-sort="ind">${esc(I.col)}${arrow("ind")}</th><th class="r" data-sort="pop">People${arrow("pop")}</th><th class="r" data-sort="dist">Nearest${arrow("dist")}</th></tr>`;
}
function anList() {
  const I = AN_IND[aInd], q = aFind.trim().toLowerCase(), sel = aCmp ? aA : aSel;
  const match = p => !q || p.near.toLowerCase().includes(q) || p.name.toLowerCase().includes(q);
  const key = { rk: p => p.rk, near: p => p.near, ind: p => p.rk, pop: p => -p.pop, dist: p => -p.dist }[aSort.col];
  const keep = f => aCells.size ? aInCell(f) : aKeep(f.properties);
  const rows = aGeo.features.filter(f => (keep(f) && match(f.properties)) || f === sel || f === aB);
  rows.sort((a, b) => { const x = key(a.properties), y = key(b.properties); return (x < y ? -1 : x > y ? 1 : a.properties.rk - b.properties.rk) * aSort.dir; });
  $("an-cellbar").hidden = !aCells.size; if (aCells.size) $("an-cellbar").innerHTML = `Showing <b>${aCellList().length}</b> LSOAs: ${esc(aCellLabel())} <button type="button" class="an-link" data-clear="1">Clear</button>`;
  $("an-tbody").innerHTML = rows.length ? rows.map(f => { const p = f.properties, out = !(keep(f) && match(p));
    return `<tr data-c="${p.code}" class="${f === sel ? "sel" : ""}${f === aB ? " selb" : ""}${out ? " out" : ""}"><td>${p.rk}</td>` +
      `<td><b>${esc(aPlace(p))}</b><small>${esc(aShort(p.name))} · ${p.ruc.toLowerCase()}${out ? " · <em>selected, not in this filter</em>" : ""}</small></td>` +
      `<td class="r">${I.has(p) ? I.val(p) : "–"}</td><td class="r">${p.pop.toLocaleString("en-GB")}</td><td class="r${p.nIn ? "" : " far"}">${aMi(p.dist)}</td></tr>`; }).join("")
    : `<tr><td colspan="5" class="an-empty">No LSOAs match. Try another filter or place name.</td></tr>`;
  anListScroll();
}
function anListScroll() {
  const tr = document.querySelector("#an-tbody tr.sel"), sc = $("an-scroll"); if (!tr || !sc) return;
  const top = tr.offsetTop - sc.querySelector("thead").offsetHeight;
  if (top < sc.scrollTop || tr.offsetTop + tr.offsetHeight > sc.scrollTop + sc.clientHeight) sc.scrollTop = Math.max(0, top - 40);
}

/* ---------- profile (right): read-only, shows the shared selection ---------- */
function anKindsWithin(p) {
  const R = aR(p), inR = aLocated().filter(s => anMiles(p.c, [s.lat, s.lon]) <= R);
  return KINDS.map((k, i) => [k, i, inR.filter(s => kindOf(s) === i).sort((a, b) => a.name.localeCompare(b.name))]);
}
const aOpenKinds = new Set();
let aProfKey = "";
function anProfile() {
  const el = $("an-prof"), sup = aSupL(), oft = $("an-often").value;
  const key = [aSel, aA, aB].map(f => f ? f.properties.code : "").join("|") + aCmp;
  if (key !== aProfKey) { aProfKey = key; el.scrollTop = 0; }   // a new selection starts at the top of the profile
  const supTitle = (sup ? cap($("an-support").value) + " support" : "Any support") + (oft ? ", " + $("an-often").selectedOptions[0].text.toLowerCase() : "");
  if (aCmp) return anCompare(el, supTitle);
  if (!aSel && aCells.size) {
    const l = aCellList().sort((x, y) => x.properties.rk - y.properties.rk), n = l.reduce((s, f) => s + f.properties.pop, 0);
    const ds = l.filter(f => f.properties.nr).map(f => f.properties.dist).sort((a, b) => a - b), med = ds.length ? ds[Math.floor((ds.length - 1) / 2)] : null;
    const towns = {}; l.forEach(f => towns[f.properties.near] = (towns[f.properties.near] || 0) + 1);
    const tl = Object.entries(towns).sort((a, b) => b[1] - a[1]), shown = tl.slice(0, 6);
    el.innerHTML = `<div class="an-dh"><h2>${l.length} area${l.length === 1 ? "" : "s"} selected</h2><button type="button" class="an-btn" data-a="clearcells">Clear</button></div>` +
      `<div class="an-psub">${esc(aCellLabel())}</div>` +
      `<div class="an-tiles t3"><div><b>${l.length}</b>LSOAs</div><div><b>${k1(n)}</b>people</div><div><b>${med === null ? "–" : aMi(med)}</b>median to nearest${ds.length > 1 ? `<br>${aMi(ds[0])} to ${aMi(ds[ds.length - 1])}` : ""}</div></div>` +
      (l.length ? `<div class="an-sech">By place<span>nearest named place</span></div><p class="an-towns">${shown.map(([t, c]) => `${esc(t)} <b>${c}</b>`).join(" · ")}${tl.length > 6 ? ` · ${tl.length - 6} more` : ""}</p>` : "") +
      `<div class="an-sech">Areas in this selection<span>${esc(sup || "matching")} support</span></div>` +
      `<table class="an-kv an-glist">${l.map(f => `<tr data-pick="${f.properties.code}"><td>${esc(aPlace(f.properties))}<small>${esc(f.properties.name)}</small></td><td class="r">${aMi(f.properties.dist)}</td></tr>`).join("")}</table>` +
      `<p class="an-fine">Click an area to see its profile. Click squares, a row or a column in the Chart to add or remove them.</p>`; return;
  }
  if (!aSel) { el.innerHTML = `<div class="an-pempty"><h2>Local support profile</h2><p>Select a place from the chart, the list or the map to see its figures and the support recorded nearby.</p></div>`; return; }
  const p = aSel.properties, R = aR(p), mi = R + " mile" + (R > 1 ? "s" : ""), kinds = anKindsWithin(p), total = kinds.reduce((t, [, , l]) => t + l.length, 0);
  const tiles = [[aFmt(p.pop), "people", ""], [p.ruc, p.rucc.replace(/^[^:]*: /, "").replace("Nearer to", "near").replace("Further from", "far from"), ""],
    ...Object.values(AN_IND).map(I => I.has(p) ? I.tile(p) : ["–", I.short.toLowerCase(), "no data"])];
  el.innerHTML = (aCells.size ? `<button type="button" class="an-link an-back" data-a="group">← Back to the ${aCellList().length} LSOAs (${esc(aCellLabel())})</button>` : "") + `<h2>${esc(aPlace(p))}</h2><div class="an-psub">${esc(p.name)} · ${esc(aLA(p.la))} · ${p.ruc.toLowerCase()}</div>
    <div class="an-tiles">${tiles.map(([b, l, sub]) => `<div><b>${esc(b)}</b>${esc(l)}${sub ? "<br>" + esc(sub) : ""}</div>`).join("")}</div>
    <div class="an-match"><div class="an-sech">${esc(supTitle)}<span>matches your filters</span></div>
      <table class="an-kv"><tr><td>Nearest${p.nr ? `<small>${esc(p.nr.name)}</small>` : ""}</td><td class="r">${aMi(p.dist)}</td></tr><tr><td>Within ${mi}</td><td class="r">${p.nIn}</td></tr></table>` +
      (p.nIn ? "" : `<div class="an-none"><b>None recorded within ${mi}</b>That may be a gap in this directory rather than in local provision.</div>`) + `</div>
    <div class="an-all"><div class="an-sech">All support within ${mi}<span>any kind · ${total}</span></div>` +
      kinds.filter(([, i, l]) => i < 4 || l.length).map(([k, i, l]) => { const open = aOpenKinds.has(i), sh = open ? l : l.slice(0, 2);
        return `<div class="an-kind"><div class="t"><span><i style="background:${k[1]}"></i>${esc(k[0])}</span><b>${l.length}</b></div>` +
          (l.length ? `<ul>${sh.map(s => `<li>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>` : esc(s.name)}</li>`).join("")}</ul>` +
            (l.length > 2 ? `<button type="button" class="an-link" data-kind="${i}">${open ? "Show fewer" : "Show all " + l.length}</button>` : "") : "") + `</div>`; }).join("") + `</div>
    <div class="an-pacts"><button type="button" class="an-pri" data-a="view">View services</button><button type="button" class="an-btn" data-a="copy">Copy</button><button type="button" class="an-btn" data-a="cmp">Compare</button></div>
    <p class="an-fine">Search area: ${mi} from where people live (postcode-weighted), as the crow flies. Indicators describe the area; they don't measure need for mental health support.</p>`;
}
function anCompare(el, supTitle) {
  const cols = [aA, aB].filter(Boolean), rows = [
    ["Place", p => esc(aPlace(p))], ["LSOA", p => esc(aShort(p.name))], ["Urban or rural", p => p.ruc], ["People", p => p.pop.toLocaleString("en-GB")],
    ...Object.values(AN_IND).map(I => [I.col, p => I.has(p) ? I.val(p) : "–"]), [supTitle + ": nearest", p => aMi(p.dist)], ["…within search area", p => p.nIn],
    ["All support within search area", p => anKindsWithin(p).reduce((t, [, , l]) => t + l.length, 0)]];
  el.innerHTML = `<div class="an-dh"><h2>Comparing places</h2><button type="button" class="an-btn" data-a="clear">Clear</button></div>` +
    `<table class="an-cmp"><thead><tr><th></th><th><i class="sw" style="background:${AN_A}"></i>A</th><th>${aB ? `<i class="sw" style="background:${AN_B}"></i>B` : ""}</th></tr></thead><tbody>` +
    rows.map(([lab, fn]) => `<tr><th>${esc(lab)}</th>${cols.map(f => `<td>${fn(f.properties)}</td>`).join("")}${aB ? "" : "<td></td>"}</tr>`).join("") + `</tbody></table>` +
    (aB ? `<div class="an-pacts"><button type="button" class="an-btn" data-a="copy">Copy</button></div>` : `<p class="an-hint">Now select another place, from the chart, the list or the map, to compare.</p>`);
}
function anCopyText() {
  const sup = $("an-support").selectedOptions[0].text, oft = $("an-often").selectedOptions[0].text, line = p => {
    const R = aR(p), k = anKindsWithin(p);
    return [`${aPlace(p)} (${p.name}, ${aLA(p.la)}, ${p.ruc.toLowerCase()})`, `People: ${aFmt(p.pop)}`, ...Object.values(AN_IND).map(I => `${I.short}: ${I.has(p) ? I.copy(p) : "no data"}`),
      `Matching support (${sup}, ${oft.toLowerCase()}): nearest ${aMi(p.dist)}${p.nr ? " (" + p.nr.name + ")" : ""}; ${p.nIn} within ${R} mile${R > 1 ? "s" : ""}`,
      `All support within ${R} mile${R > 1 ? "s" : ""}: ` + (k.filter(([, , l]) => l.length).map(([kk, , l]) => `${kk[0]} ${l.length}`).join(", ") || "none recorded")].join("\n"); };
  const ps = aCmp ? [aA, aB].filter(Boolean).map((f, i) => "AB"[i] + ": " + line(f.properties)) : [line(aSel.properties)];
  return ps.join("\n\n") + `\n\nStraight-line distances from where people live; search area 1 mile (urban) or 3 miles (rural). Signposting Somerset, ${new Date().toLocaleDateString("en-GB")}: ${location.origin}${location.pathname}#analytics`;
}

/* ---------- shared selection ---------- */
function anSelect(f, from) {
  if (aCmp) { if (!aA) aA = f; else if (f !== aA) aB = f; }
  else aSel = f;
  aOpenKinds.clear();
  anSync();
  if (f && from !== "map") {   // centre on it; never zoom out to fit a distant service
    amap.setView(f.properties.c, Math.max(amap.getZoom(), 10.5), { animate: true, duration: .4 });
  }
}
function anSync() {
  aAreas.setStyle(anStyle);
  aAreas.eachLayer(l => { const on = anOn(l.feature), el = l.getElement && l.getElement(); if (el) el.classList.toggle("an-lift", on); if (on) l.bringToFront(); });
  anChart(); anList(); anProfile();
}
function anRefilter() { anCompute(); anListHead(); anLegendPlain(); anDrawPins(); anSync(); }   // keeps the selected squares; their members are recalculated   // Support for / How often
function anReindicator() { aCells.clear(); if (!AN_IND[aInd].hi && (aShow === "hi" || aShow === "both")) aShow = "all"; anRank(); anScale(); anListHead(); anSync(); }                          // Compare areas by

async function initAnalytics() {
  if (amap) { setTimeout(() => { amap.invalidateSize(); anChart(); }, 30); return; }
  if (typeof L === "undefined") { $("an-loading").textContent = "The map library couldn't load."; return; }
  amap = L.map("amap", { zoomControl: false, zoomSnap: .25, zoomDelta: .5 });
  L.control.zoom({ position: "topright" }).addTo(amap);
  L.tileLayer("https://basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png?key=cb1_4v7b_1_0f5ea1a12b0919dd5e3cbbb7", { maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a> · Data: ONS, MHCLG (OGL)' }).addTo(amap);
  amap.setView([51.1, -2.9], 9);
  try {
    const r = await fetch(SITE_BASE + "/assets/analytics-lsoa.geojson", { cache: "no-cache" });
    if (!r.ok) throw new Error(r.status);
    aGeo = await r.json();
  } catch (e) { $("an-loading").textContent = "The LSOA data couldn't load. It works on the website itself."; return; }
  for (let i = 0; !S.length && i < 100; i++) await new Promise(r => setTimeout(r, 300));   // wait for the sheet if it's still loading
  aDisMed = (aGeo.meta && aGeo.meta.dis_median_england) || 17;
  aGeo.features.forEach(f => f.properties.near = aNear(f.properties));
  aAreas = L.geoJSON(aGeo, { style: anStyle, onEachFeature: (f, l) => {
    f.__l = l;
    l.bindTooltip(() => `<b>${esc(aPlace(f.properties))}</b><br>${esc(AN_IND[aInd].col)}: ${esc(AN_IND[aInd].has(f.properties) ? AN_IND[aInd].val(f.properties) : "no data")}`, { sticky: true, direction: "top", offset: [0, -10], className: "an-tt" });
    l.on("mouseover", () => { anGridHover(f); if (anStyle(f).weight < 1) l.setStyle({ weight: 1.5, color: "#1B3126", dashArray: "3 3", fillOpacity: .9 }); });
    l.on("mouseout", () => { aAreas.resetStyle(l); anGridHover(null); });
    l.on("click", () => anSelect(f, "map"));
  } }).addTo(amap);
  aPins = L.layerGroup().addTo(amap);   // markers sit above the LSOA shapes
  amap.on("zoomend", anDrawPins);
  const legend = L.control({ position: "topleft" });
  legend.onAdd = () => { aLegendEl = L.DomUtil.create("div", "an-legend"); return aLegendEl; };
  legend.addTo(amap);
  const scale = L.control({ position: "bottomright" });
  scale.onAdd = () => { aScaleEl = L.DomUtil.create("div", "an-scale"); L.DomEvent.disableClickPropagation(aScaleEl); return aScaleEl; };
  scale.addTo(amap);
  const whole = L.control({ position: "topright" });
  whole.onAdd = () => { const b = L.DomUtil.create("button", "an-whole"); b.type = "button"; b.textContent = "Whole area"; L.DomEvent.disableClickPropagation(b);
    b.onclick = () => { aSel = aA = aB = null; aCmp = false; aCells.clear(); anSync(); amap.fitBounds(aAreas.getBounds(), { padding: [8, 8] }); }; return b; };
  whole.addTo(amap);
  // controls
  $("an-support").innerHTML = supportOptions(S);
  $("an-ind").innerHTML = Object.entries(AN_IND).map(([k, v]) => `<option value="${k}">${esc(v.name)}</option>`).join("");
  $("an-support").onchange = $("an-often").onchange = () => { $("q-asupport").classList.toggle("on", !!$("an-support").value); $("q-aoften").classList.toggle("on", !!$("an-often").value); anRefilter(); };
  $("an-ind").onchange = e => { aInd = e.target.value; anReindicator(); };
  $("an-how").onclick = e => { e.preventDefault(); setTab("about"); setTimeout(() => { const h = $("how-analytics"); if (h) h.scrollIntoView({ block: "start" }); }, 60); };
  $("an-chips").onclick = e => { const b = e.target.closest("button"); if (!b) return; aShow = b.dataset.show; anListHead(); anList(); anChart(); };
  // List / Chart tabs in the left column (remembered on the device)
  const ltab = t => { document.querySelectorAll(".an-ltabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.lt === t));
    $("an-plist").hidden = t !== "list"; $("an-pchart").hidden = t !== "chart"; $("an-chipsrow").hidden = t === "chart";   // the grid already splits by need and distance
    try { localStorage.setItem("anLeft", t); } catch (_) {}
    if (t === "chart") anChart(); else anListScroll(); };
  document.querySelector(".an-ltabs").onclick = e => { const b = e.target.closest("button"); if (b) ltab(b.dataset.lt); };
  let lt0 = "list"; try { lt0 = localStorage.getItem("anLeft") || "list"; } catch (_) {} ltab(lt0);
  $("an-find").oninput = e => { aFind = e.target.value; anList(); };
  $("an-thead").onclick = e => { const th = e.target.closest("th"); if (!th) return; const k = th.dataset.sort;
    aSort = aSort.col === k ? { col: k, dir: -aSort.dir } : { col: k, dir: 1 }; anListHead(); anList(); };
  $("an-tbody").onclick = e => { const tr = e.target.closest("tr[data-c]"); if (!tr) return; anSelect(aGeo.features.find(f => f.properties.code === tr.dataset.c), "list"); };
  $("an-svg").onclick = e => {
    const td = e.target.closest("td[data-r]"), rh = e.target.closest("th[data-row]"), ch = e.target.closest("th[data-col]");
    if (td && !td.classList.contains("z")) anToggle([td.dataset.r + "," + td.dataset.c]);
    else if (rh) anToggle(aVisC.map(c => rh.dataset.row + "," + c));
    else if (ch) anToggle(aVisR.map(r => r + "," + ch.dataset.col));
  };
  $("an-svg").onmouseover = e => {   // light up the row and column under the pointer
    const t = e.target.closest("td[data-r], th[data-row], th[data-col]"); document.querySelectorAll("#an-svg .hl").forEach(x => x.classList.remove("hl")); if (!t) return;
    const r = t.dataset.r ?? t.dataset.row, c = t.dataset.c ?? t.dataset.col;
    document.querySelectorAll("#an-svg td[data-r]").forEach(x => { if ((r !== undefined && x.dataset.r === r) || (c !== undefined && x.dataset.c === c)) x.classList.add("hl"); });
  };
  $("an-svg").onmouseleave = () => document.querySelectorAll("#an-svg .hl").forEach(x => x.classList.remove("hl"));
  $("an-cellbar").onclick = e => { if (e.target.closest("[data-clear]")) { aCells.clear(); anSync(); } };
  $("an-prof").onclick = e => {
    const k = e.target.closest("[data-kind]"); if (k) { const i = +k.dataset.kind; aOpenKinds.has(i) ? aOpenKinds.delete(i) : aOpenKinds.add(i); anProfile(); return; }
    const pk = e.target.closest("tr[data-pick]"); if (pk) { anSelect(aGeo.features.find(f => f.properties.code === pk.dataset.pick), "list"); return; }
    const b = e.target.closest("button[data-a]"); if (!b) return;
    if (b.dataset.a === "group") { aSel = null; anSync(); return; }
    if (b.dataset.a === "clearcells") { aCells.clear(); anSync(); return; }
    if (b.dataset.a === "cmp") { aCmp = true; aA = aSel; aB = null; aSel = null; anSync(); }
    else if (b.dataset.a === "clear") { aSel = aA; aCmp = false; aA = aB = null; anSync(); }
    else if (b.dataset.a === "copy") { copyToClipboard(anCopyText()); b.textContent = "Copied"; clearTimeout(b._t); b._t = setTimeout(() => b.textContent = "Copy", 1600); }
    else if (b.dataset.a === "view") {   // In person (in the directory), centred on where people live in this LSOA, with the same Support for
      const p = aSel.properties, lab = aPlace(p), sup = $("an-support").value;
      const q = new URLSearchParams(sup ? { support: sup } : {});
      q.set("lat", p.c[0].toFixed(4)); q.set("lon", p.c[1].toFixed(4)); q.set("label", lab); q.set("within", aR(p) <= 1 ? "2" : "5");
      window.open(DIRECTORY_URL + "?" + q + "#near", "_blank", "noopener");   // the directory, opened filtered in a new tab
    }
  };
  addEventListener("resize", () => { clearTimeout(initAnalytics._t); initAnalytics._t = setTimeout(() => tab === "analytics" && anChart(), 150); });
  amap.fitBounds(aAreas.getBounds(), { padding: [8, 8] });
  anCompute(); anRank(); anScale(); anListHead(); anLegendPlain(); anDrawPins();
  aSel = aGeo.features.find(f => f.properties.rk === 1);   // start with the top of the list, so the profile isn't empty
  aReady = true; anSync();
  $("an-loading").hidden = true;
  setTimeout(() => { amap.invalidateSize(); anChart(); anListScroll(); }, 30);
}

