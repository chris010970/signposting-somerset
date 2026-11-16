/* ---------- records as the pages use them ---------- */
// Each gets an id, a position (a town centre, marked approx, when there's no postcode), its support types (_sf) and its
// parsed schedule (_days, _times, _dates, _kind: see schedule.js). Services that have ended are left out.
function shapeRecords(rows) {
  return rows.map((s, id) => {
    let lat = parseFloat(s.lat), lon = parseFloat(s.lon), approx = false;
    if (isNaN(lat) && TOWNS[s.town]) { [lat, lon] = TOWNS[s.town]; approx = true; }
    return withSchedule({ ...s, id, lat, lon, approx, _sf: split(s.support_for) });
  }).filter(s => s._kind !== "ended");
}
// The "Support for" choices, grouped, offering only the types that appear in the list given
const supportOptions = list => `<option value="">Anything</option>` + GROUPS.map(([g, vals]) => {
  const v = vals.filter(x => list.some(s => s._sf.includes(x)));
  return v.length ? `<optgroup label="${g}">${v.map(x => `<option value="${x}">${esc(cap(x))}</option>`).join("")}</optgroup>` : "";
}).join("");
