// Records as the pages use them: a town-centre position when there's no postcode (marked approx), parsed days, times
// and dates, support types (_sf) and the kind of schedule (_kind). Services that have ended are left out.
function shapeRecords(rows) {
  return rows.map((s, id) => {
    let lat = parseFloat(s.lat), lon = parseFloat(s.lon), approx = false;
    if (isNaN(lat) && TOWNS[s.town]) { [lat, lon] = TOWNS[s.town]; approx = true; }
    return withSchedule({ ...s, id, lat, lon, approx, _sf: split(s.support_for) });
  }).filter(s => s._kind !== "ended");
}
// "Support for" choices, grouped, offering only the types that appear in the list given
const supportOptions = list => `<option value="">Anything</option>` + GROUPS.map(([g, vals]) => {
  const v = vals.filter(x => list.some(s => s._sf.includes(x))); return v.length ? `<optgroup label="${g}">${v.map(x => `<option value="${x}">${esc(cap(x))}</option>`).join("")}</optgroup>` : ""; }).join("");
