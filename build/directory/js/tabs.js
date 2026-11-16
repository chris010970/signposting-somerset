/* ---------- tabs: In person, Phone and online, Courses, Places, About (Tools → is a link to the tools page) ---------- */
const SITE_TABS = ["talk", "near", "course", "places", "about"];
function setSiteTab(t) {
  if (t !== tab && recordsIn && (pageFlows() || $(SCROLLERS[tab]).offsetParent)) scrollPos[tab] = scroller(tab).scrollTop;   // where the tab being left was
  tab = t; tabSwitchedAt = performance.now();
  showInRow($("tab-" + t));
  for (const k of SITE_TABS) { currentTab($("tab-" + k), k === t); $("panel-" + k).hidden = k !== t; $("hdr-" + k).hidden = k !== t; }
  if (t === "talk") renderTalk();
  else if (t === "course") renderCourses();
  else if (t === "about") renderAbout();
  else if (t === "places") showPlaces();
  else { initMap(); setTimeout(() => { map && map.invalidateSize(); fitPending = true; render(); }, 30); }
  restoreScroll(t);
  syncLink();
  try { localStorage.setItem("ss-tab", t); } catch (e) {}
}
for (const k of SITE_TABS) $("tab-" + k).onclick = () => setSiteTab(k);
// Phones: the chosen tab in view in the tab row. The row itself scrolls: scrollIntoView would also move the keyboard's starting
// point to the tab, so the first Tab on opening the page would pass over Skip to results and the crisis bar.
function showInRow(b) {
  const nav = b.closest(".sitetabs"), r = b.getBoundingClientRect(), n = nav.getBoundingClientRect();
  if (r.left < n.left) nav.scrollLeft -= n.left - r.left; else if (r.right > n.right) nav.scrollLeft += r.right - n.right;
}
// "Skip to results": into the tab showing (its panel takes the focus; the address keeps its #tab)
$("skip").onclick = e => { e.preventDefault(); $("panel-" + tab).focus(); };
// Phones: a fade at the right edge of the tab row while more tabs are hidden off-screen
{
  const nav = document.querySelector(".sitetabs");
  const edge = () => nav.classList.toggle("more", nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 2);
  nav.addEventListener("scroll", edge, { passive: true }); addEventListener("resize", edge); setTimeout(edge, 0);
}
addEventListener("resize", () => map && map.invalidateSize());
