/* ---------- Places: the town listings, as a tab of the directory ----------
   Each town's listing is its standalone Places page (built from the sheet by build/places/build_places.py, for search
   engines); this tab shows that page's filter boxes and listings inside the directory, with the shared Places code
   (core/js/places-view.js). Opens on the link's town (?place=wells#places), else the town last looked at this visit, here
   or on a standalone Places page. The address bar follows the town and filters, so the view can be copied as a link. */
const PLACES_URL = new URL("places/", location.href).pathname;   // the Places pages beside this copy of the directory
let placesOpened = false;
const places = placesView({
  main: $("places-main"), hdr: $("hdr-towns"), scroller: $("panel-places"),
  onChange: () => setTimeout(syncLink, 0),   // remembered with the other tabs' choices
  onLink: u => {   // links from Places to the directory's other tabs open them here
    if (u.pathname !== location.pathname) return false;
    const t = u.hash.slice(1);
    if (t === "near" && u.search) {   // "On the map →": In person, with that town and support, from the top
      applyLinkNear(new URLSearchParams(u.search)); userChanged = true; setSiteTab("near"); return true;
    }
    if (SITE_TABS.includes(t)) { setSiteTab(t); return true; }
    return false;
  },
});
// This visit's place: the directory's own, else the standalone Places pages' (build/places/places.js)
function placesSaved() {
  if (SAVED.places && SAVED.places.href) return SAVED.places;
  try { return JSON.parse(sessionStorage.getItem("ss-places:" + PLACES_URL) || "null") || {}; } catch (_) { return {}; }
}
const placesState = () => placesOpened ? places.state() : SAVED.places;
// A town's page address and its name in links ("wells"): the town pages are /places/<name>/
const placeName = href => href && href.startsWith(PLACES_URL) ? href.slice(PLACES_URL.length).replace(/\/$/, "") : "";
const placeHref = name => /^[a-z0-9-]+$/.test(name || "") ? PLACES_URL + name + "/" : PLACES_URL;
function placesQuery(q) {   // the tab's town and filters, for the address (links.js); the defaults are left out
  const s = placesState() || {};
  if (placeName(s.href)) q.set("place", placeName(s.href));
  if (s.support && s.support !== "all") q.set("support", s.support);
  if (s.when && s.when !== "any") q.set("when", s.when);
}
// Opening from a link: its town and filters; a town that isn't there opens the choose-a-town page
function placesFromLink() {
  const q = new URLSearchParams(location.search);
  return { href: placeHref(q.get("place")), support: q.get("support") || "all", when: q.get("when") || undefined };
}
// The first time the tab opens: the remembered town (or the choose-a-town page), where it was left
async function showPlaces() {
  if (placesOpened) { $("panel-places").scrollTop = scrollPos.places || 0; return; }   // back to it: where it was
  placesOpened = true;
  const p = LINK_TAB === "places" ? placesFromLink() : placesSaved();
  const href = p.href && p.href.startsWith(PLACES_URL) ? p.href : PLACES_URL;
  const opts = { support: p.support, when: p.when, scroll: LINK_TAB === "places" ? 0 : scrollPos.places || p.scroll || 0 };
  if (!await places.show(href, opts) && href !== PLACES_URL) await places.show(PLACES_URL, opts);
  scrollRestored.add("places");
}
