/* ---------- tabs: In person, Phone and online, Courses, About (Places and Tools → are links to other pages) ---------- */
const SITE_TABS = ["talk", "near", "course", "about"];
function setSiteTab(t) {
  if (t !== tab && recordsIn && $(SCROLLERS[tab]).offsetParent) scrollPos[tab] = $(SCROLLERS[tab]).scrollTop;   // where the tab being left was
  tab = t;
  try { $("tab-" + t).scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (e) {}
  for (const k of SITE_TABS) { currentTab($("tab-" + k), k === t); $("panel-" + k).hidden = k !== t; $("hdr-" + k).hidden = k !== t; }
  if (t === "talk") renderTalk();
  else if (t === "course") renderCourses();
  else if (t === "about") renderAbout();
  else { initMap(); setTimeout(() => { map && map.invalidateSize(); fitPending = true; render(); }, 30); }
  restoreScroll(t);
  syncLink();
  try { localStorage.setItem("ss-tab", t); } catch (e) {}
}
for (const k of SITE_TABS) $("tab-" + k).onclick = () => setSiteTab(k);
// Phones: a fade at the right edge of the tab row while more tabs are hidden off-screen
{
  const nav = document.querySelector(".sitetabs");
  const edge = () => nav.classList.toggle("more", nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 2);
  nav.addEventListener("scroll", edge, { passive: true }); addEventListener("resize", edge); setTimeout(edge, 0);
}
addEventListener("resize", () => map && map.invalidateSize());
// Places: back to the page last looked at there in this visit (a town, with its choices), if any (saved by build/places/places.js)
$("tab-places").onclick = e => {
  try {
    const home = new URL("places/", location.href).pathname, p = JSON.parse(sessionStorage.getItem("ss-places:" + home) || "null");
    if (p && p.url && p.url.startsWith(home)) { e.preventDefault(); location.href = p.url; }
  } catch (_) {}
};
