/* ---------- the map's county outline and the "2. Where?" places (the pages; core/js/places.js has towns and distances) ---------- */
// Outline of the historic county (Somerset, North Somerset, Bath and North East Somerset), simplified from ONS boundaries
const OUTLINE = /*OUTLINE*/null;
// The "2. Where?" places, by area: [area, [[name, lat, lon], ...]] (build/core/data/where.json)
const PLACES = (/*@core:data/where.json*/).areas.map(a => [a.area, a.places]);
const PLACE = Object.fromEntries(PLACES.flatMap(([, ps]) => ps.map(([n, la, lo]) => [n, [la, lo]])));
