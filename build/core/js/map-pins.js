// Map pins shared by the directory's map and the tools page's Analytics map.
// Services at the same spot share one numbered pin; zoomed out, nearby pins merge into one area circle coloured by kind.
const spotKey = s => s.lat.toFixed(4) + "," + s.lon.toFixed(4);
function clusterBg(g) {
  const n = new Array(KINDS.length + 1).fill(0);
  g.forEach(s => { const i = kindOf(s); n[i < 0 ? KINDS.length : i]++; });
  const cols = [...KINDS.map(k => k[1]), KIND_DATA.other];
  let at = 0; const stops = [];
  n.forEach((c, i) => { if (c) { const to = at + c / g.length * 360; stops.push(`${cols[i]} ${at}deg ${to}deg`); at = to; } });
  return stops.length === 1 ? stops[0].split(" ")[0] : `conic-gradient(${stops.join(", ")})`;
}
const AREA_ZOOM = 11, AREA_PX = 52;   // at zoom 11 or less, pins within ~52px merge into one numbered circle
function areaClusters(groups, m) {   // m: the Leaflet map the pins are on
  // Greedy merge of same-spot groups by on-screen distance; biggest spots seed the clusters
  const z = m.getZoom(), cl = [];
  [...groups.entries()].sort((a, b) => b[1].length - a[1].length).forEach(([k, g]) => {
    const p = m.project([g[0].lat, g[0].lon], z);
    const c = cl.find(c => c.p.distanceTo(p) < AREA_PX);
    if (c) { c.spots.push([k, g]); c.n += g.length; } else cl.push({ p, spots: [[k, g]], n: g.length });
  });
  return cl;
}
