/* ---------- places: town centres and distances (shared with the relay; core/js/where.js has the outline and "Where?" places) ---------- */
// Town centres (build/directory/towns.json): where a record with no postcode is pinned, marked approximate
const TOWNS = /*TOWNS*/{};

// Straight-line distance in miles between two { lat, lon } points
function miles(a, b) {
  const R = 3958.8, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
