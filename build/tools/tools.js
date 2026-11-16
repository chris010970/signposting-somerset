/* ---------- tools page: tabs, About, and the records Assist and Analytics use ---------- */
// Analytics (analytics/analytics.js) follows this script; Assist (assist/assist.js) is added after it.
const SITE_BASE = "/*SITE_BASE*/";           // the folder the site is served from ("" on signpostingsomerset.org.uk)
const DIRECTORY_URL = "/*DIRECTORY_URL*/";   // the directory beside this page (Analytics opens it filtered)
const TABS = ["assist", "analytics", "about"];
const wideEnough = () => matchMedia("(min-width: 760px)").matches;   // Analytics is desktop only
let tab = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "assist";
if (tab === "analytics" && !wideEnough()) { tab = "assist"; try { history.replaceState(null, "", location.pathname + location.search + "#assist"); } catch (e) {} }
function showTab(t) {
  for (const k of TABS) { currentTab($("tab-" + k), k === t); $("panel-" + k).hidden = k !== t; $("hdr-" + k).hidden = k !== t; }
  document.documentElement.classList.toggle("noflow", t === "analytics"); pageFit();   // Analytics keeps its fixed layout (core/js/page-flow.js)
}
$("skip").onclick = e => { e.preventDefault(); $("panel-" + tab).focus(); };   // Skip to results: past the tabs and filters
function setTab(t) {
  if (t === "analytics" && !wideEnough()) t = "assist";
  tab = t; showTab(t);
  if (t === "about") renderAbout(); else if (t === "analytics") initAnalytics(); else if (window.assistShow) window.assistShow();
  try { history.replaceState(null, "", location.pathname + location.search + "#" + t); } catch (e) {}
}
for (const k of TABS) $("tab-" + k).onclick = () => setTab(k);
showTab(tab);
// Assist's script, added after this one, opens Assist or About (see the end of assist.js); Analytics opens once its code has run
if (tab === "analytics") setTimeout(initAnalytics, 0);
addEventListener("resize", () => { if (tab === "analytics" && !wideEnough()) setTab("assist"); });

function renderAbout() {
  $("about-page").innerHTML = `<article class="aboutpage">
    <h2>Tools</h2>
    <div class="acols"><div class="acol">
    <section>
    <h3>Who these are for</h3>
    <p>Support workers, volunteers and community organisations. To find support for yourself or someone else,
      <a href="/*DIRECTORY*/">search the directory</a>: it's the same checked records, on a map and by phone and online.</p>
    </section>
    ${typeof window.assistAbout === "function" ? window.assistAbout() : ""}
    </div><div class="acol">
/*ANALYTICS_ABOUT*/    </div></div>
    <p class="small" id="site-version">Version: /*SITE_VERSION*/${typeof window.assistRelayVersion === "function" ? window.assistRelayVersion() : ""}</p>
  </article>`;
}

// Records: Assist suggests from the Worker's own copy; here they give its "Support for" choices and map pins, and Analytics' services.
let S = [];   // in-person services (not courses), as on the directory's In person tab
function useRecords(recs) {
  ALL = shapeRecords(recs);
  S = ALL.filter(s => s.type !== "Course" && split(s.mode).includes("in-person"));
  const sel = $("a-support"), v = sel.value;
  sel.innerHTML = supportOptions(ALL); sel.value = v;
  try { if (aReady) anRefilter(); } catch (e) {}   // Analytics already open: recount with the latest records (before its code has run, aReady isn't there yet)
}
if (SHEET_CSV_URL) {
  const kept = cachedRecords();   // loaded earlier in this visit (e.g. in the directory): use at once
  if (kept) useRecords(kept);
  fetchRecords().then(recs => { if (!sameRecords(recs, kept)) useRecords(recs); }).catch(e => console.error("Sheet load error", e));
}
