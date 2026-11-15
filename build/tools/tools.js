/* ---------- tools page: tabs, About, and the records Assist's pins and "Support for" come from ---------- */
// Assist itself (assist/assist.js) is added after this script.
const TABS = ["assist", "about"];
let tab = location.hash === "#about" ? "about" : "assist";
function setTab(t) {
  tab = t;
  for (const k of TABS) { $("tab-" + k).setAttribute("aria-selected", k === t); $("panel-" + k).hidden = k !== t; $("hdr-" + k).hidden = k !== t; }
  if (t === "about") renderAbout(); else if (window.assistShow) window.assistShow();
  try { history.replaceState(null, "", location.pathname + location.search + "#" + t); } catch (e) {}
}
for (const k of TABS) $("tab-" + k).onclick = () => setTab(k);
for (const k of TABS) { $("tab-" + k).setAttribute("aria-selected", k === tab); $("panel-" + k).hidden = k !== tab; $("hdr-" + k).hidden = k !== tab; }
// (Assist's script, added after this one, opens itself or the About tab: see the end of assist.js)

function renderAbout() {
  $("about").innerHTML = `<article class="aboutpage">
    <h2>Tools</h2>
    <div class="acols"><div class="acol">
    <section>
    <h3>Who these are for</h3>
    <p>Support workers, volunteers and community organisations. To find support for yourself or someone else,
      <a href="/*DIRECTORY*/">search the directory</a>: it's the same checked records, on a map and by phone and online.</p>
    </section>
    ${typeof window.assistAbout === "function" ? window.assistAbout() : ""}
    </div><div class="acol">
    <section>
    <h3>Coming next</h3>
    <p>Community insights: local support set against need (deprivation, disability, distance to the nearest service). Desktop only.</p>
    </section>
    </div></div>
    <p class="small" id="site-version">Version: /*SITE_VERSION*/${typeof window.assistRelayVersion === "function" ? window.assistRelayVersion() : ""}</p>
  </article>`;
}

// Records: Assist suggests from the Worker's own copy; here they give the "Support for" choices and the map pins.
function useRecords(recs) {
  ALL = shapeRecords(recs);
  const sel = $("a-support"), v = sel.value;
  sel.innerHTML = supportOptions(ALL); sel.value = v;
}
if (SHEET_CSV_URL) fetchRecords().then(useRecords).catch(e => console.error("Sheet load error", e));
