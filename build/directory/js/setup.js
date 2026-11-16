/* ---------- the directory: records and the state every tab shares ----------
   The page's script is these files in build/directory/js/, in the order template.html lists them, with the shared
   code from build/core/js/. They share these top-level names:
     ALL          every current record (shapeRecords in core/js/records.js); C courses, S in person, T phone and online
     tab          the tab showing: "near" (In person), "talk" (Phone and online), "course" or "about"
     searchPoint  In person's search point { lat, lon, label } (a town, the map, a link or "your location"), or null
     sortBy       In person's order: "soon" or "near";  fitPending: the map should fit the pins at its next draw
     locMsg       a short note under 2. Where? ("Finding your location…") */
const $ = id => document.getElementById(id);
const fs = $("f-support");   // In person's 1. Support for
let liveMsg = "<strong>Loading services…</strong>";   // shown in the lists until the records arrive (or if they can't)

let ALL = [], C = [], S = [], T = [];
// Sort the records into the tabs, and fill each tab's 1. Support for (and In person's 2. Where?) with what's there
function prepare(rows) {
  ALL = shapeRecords(rows);
  C = ALL.filter(s => s.type === "Course");
  S = ALL.filter(s => s.type !== "Course" && split(s.mode).includes("in-person"));
  T = ALL.filter(s => s.type !== "Course" && !split(s.mode).includes("in-person"));  // services with a place live on the In person tab
  fs.innerHTML = supportOptions(S);
  $("t-support").innerHTML = supportOptions(T);
  $("c-support").innerHTML = supportOptions(C);
  $("f-town").innerHTML = `<option value="">All of Somerset</option>` +
    PLACES.map(([g, ps]) => `<optgroup label="${esc(g)}">` +
      [...ps].sort((x, y) => x[0].localeCompare(y[0])).map(([n]) => `<option>${esc(n)}</option>`).join("") + `</optgroup>`).join("") +
    `<option value="__pt" hidden>Point on map</option>`;
}
prepare([]);   // the empty choices, until the records arrive (live.js)
$("today").textContent = new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

let tab = "talk";
let searchPoint = null, sortBy = "soon", fitPending = true, locMsg = "";
// In the lists while the records load, or if they can't be loaded
function panelMessage(html) {
  for (const id of ["talk", "courses", "list"]) $(id).innerHTML = `<div class="empty">${html}</div>`;
  $("summary").textContent = "";
}
