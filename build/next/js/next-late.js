/* ---------- The next design's code that replaces the directory's own (build/directory/js/): loaded last, so these win ----------
   The kinds row: under the filter boxes, since it filters the list as well as the map. Tick boxes in each kind's colour,
   ticked = shown. Phones show the short names from build/next/kind-short.json (at switch-over these move into kinds.json). The map's own key box isn't used. Same filter as before (keyClick in map.js). */
function drawLegend() {
  const KIND_SHORT = (/*@next:kind-short.json*/);   // (inside: the map draws its key before the lines below have run)
  const KEY_TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>';
  const d = $("kindrow"); legendEl = d;
  const has = KINDS.map((_, i) => S.some(x => kindOf(x) === i));      // kinds that ever appear here
  const n = kindCounts || KINDS.map((_, i) => S.filter(x => kindOf(x) === i).length);
  d.innerHTML = KINDS.map((k, i) => { if (!has[i]) return ""; const on = !kindsOff.has(i);
    return `<button type="button" role="checkbox" aria-checked="${on}" data-k="${i}"${n[i] ? "" : ' class="zero"'} style="--c:${k[1]}">` +
      `<i>${on ? KEY_TICK : ""}</i><span class="lt">${esc(k[0])}</span><span class="st" aria-hidden="true">${esc(KIND_SHORT[k[0]] || k[0])}</span></button>`; }).join("");
}
(() => { const d = $("kindrow"); d.addEventListener("click", e => keyClick(e, d)); drawLegend(); })();
