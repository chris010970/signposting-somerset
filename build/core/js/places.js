const TOWNS = /*TOWNS*/{};
const APPROX_TOWNS = /*APPROX*/[];
// Outline of the historic county (Somerset, North Somerset, Bath and North East Somerset), simplified from ONS boundaries
const OUTLINE = /*OUTLINE*/null;
/* Places in the "Where?" dropdown: fixed centre points. With "within 10 miles" these cover almost all of the county;
   anywhere else is reached with the location button or by tapping the map. Joint entries sit between the two towns. */
const PLACES = [
  ["Somerset", [["Taunton", 51.015, -3.103], ["Yeovil", 50.942, -2.633], ["Bridgwater", 51.128, -3.003], ["Frome", 51.228, -2.322],
    ["Wells", 51.209, -2.645], ["Glastonbury and Street", 51.137, -2.727], ["Burnham-on-Sea", 51.238, -2.997], ["Minehead", 51.204, -3.475],
    ["Dulverton", 51.041, -3.551], ["Chard", 50.872, -2.964], ["Wincanton", 51.056, -2.410], ["Langport", 51.038, -2.828]]],
  ["North Somerset", [["Weston-super-Mare", 51.346, -2.977], ["Nailsea and Clevedon", 51.435, -2.805]]],
  ["Bath and North East Somerset", [["Bath", 51.381, -2.359], ["Midsomer Norton and Radstock", 51.288, -2.465]]]];
const PLACE = Object.fromEntries(PLACES.flatMap(([, ps]) => ps.map(([n, la, lo]) => [n, [la, lo]])));
