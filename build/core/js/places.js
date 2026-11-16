/* ---------- places: town centres, the county outline, the "Where?" places, distances ---------- */
// Town centres (build/directory/towns.json): where a record with no postcode is pinned, marked approximate
const TOWNS = /*TOWNS*/{};
// Outline of the historic county (Somerset, North Somerset, Bath and North East Somerset), simplified from ONS boundaries
const OUTLINE = /*OUTLINE*/null;
// The "2. Where?" places, by area: [area, [[name, lat, lon], ...]] (build/core/data/where.json)
const PLACES = (/*@core:data/where.json*/).areas.map(a => [a.area, a.places]);
const PLACE = Object.fromEntries(PLACES.flatMap(([, ps]) => ps.map(([n, la, lo]) => [n, [la, lo]])));

// Straight-line distance in miles between two { lat, lon } points
function miles(a, b) {
  const R = 3958.8, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
