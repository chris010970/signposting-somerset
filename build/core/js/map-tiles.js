/* ---------- map background (tiles) for every map on the site ---------- */
// CARTO basemaps need an API key (free tier). Light (Positron) first; the directory's map falls back to Voyager if it fails.
const CARTO_KEY = "cb1_4v7b_1_0f5ea1a12b0919dd5e3cbbb7";
const TILE_URLS = [
  "https://basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png?key=" + CARTO_KEY,
  "https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=" + CARTO_KEY];
const TILE_CREDIT = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
