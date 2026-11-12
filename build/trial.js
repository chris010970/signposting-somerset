/* ---------- TRIAL ONLY: load a different records CSV from your computer ---------- */
(function () {
  const css = document.createElement("style");
  css.textContent = `#trialbar{position:fixed;left:16px;bottom:72px;z-index:2000;background:#fff;border:2px dashed #B45309;border-radius:12px;
    padding:10px 12px;box-shadow:0 4px 16px rgba(0,0,0,.15);font:14px system-ui,sans-serif;max-width:min(420px,calc(100vw - 32px))}
    #trialbar b{color:#B45309}#trialbar button{margin-top:6px;padding:7px 12px;border-radius:8px;border:1px solid #B45309;background:#FFF7ED;
    font:600 14px system-ui,sans-serif;cursor:pointer}#trialmsg{margin-top:6px;color:#57534E;font-size:13px;white-space:pre-line}
    body.trialdrag::after{content:"Drop the CSV to load it";position:fixed;inset:0;z-index:3000;display:grid;place-items:center;
    background:rgba(180,83,9,.15);font:700 24px system-ui,sans-serif;color:#7C2D12}
    #trialmin{position:absolute;top:4px;right:6px;margin:0!important;padding:0 8px!important;border:0!important;background:none!important;font-size:18px!important}
    #trialbar.min .tx,#trialbar.min #trialmsg,#trialbar.min #trialmin{display:none}#trialbar.min{padding:4px 8px}`;
  document.head.appendChild(css);
  const bar = document.createElement("div");
  bar.id = "trialbar";
  bar.innerHTML = `<button id="trialmin" type="button" title="Minimise">–</button><span class="tx"><b>Trial version</b>: test any records file with the same columns as services.csv.<br></span>
    <button id="trialbtn" type="button">Load records (CSV)…</button><input id="trialfile" type="file" accept=".csv,text/csv" hidden>
    <div id="trialmsg">Showing the ${DATA.length} built-in records. You can also drag a CSV onto the page.</div>`;
  document.body.appendChild(bar);

  function load(text, fname) {
    const { recs, error } = recordsFromCSV(text);
    if (error) { $("trialmsg").textContent = `Couldn't use ${fname}: ${error}. Is it a services.csv-style file?`; return; }
    applyRecords(recs);
    showSource("");
    const ended = recs.length - ALL.length;
    const unpinned = S.filter(s => isNaN(s.lat)).map(s => s.name);
    let msg = `Showing ${recs.length} records from ${fname}: ${T.length} phone/online, ${S.length} in person, ${C.length} courses.`;
    if (ended) msg += `\n${ended} hidden because their dates have passed.`;
    if (unpinned.length) msg += `\n${unpinned.length} in person but not on the map (no lat/lon and town not recognised): ${unpinned.slice(0, 5).join("; ")}${unpinned.length > 5 ? "…" : ""}`;
    $("trialmsg").textContent = msg;
  }
  function readFile(file) {
    if (!file) return;
    const fr = new FileReader();
    fr.onload = () => load(String(fr.result), file.name);
    fr.onerror = () => { $("trialmsg").textContent = `Couldn't read ${file.name}.`; };
    fr.readAsText(file, "utf-8");
  }
  $("trialmin").onclick = () => bar.classList.add("min");
  $("trialbtn").onclick = () => { if (bar.classList.contains("min")) { bar.classList.remove("min"); return; } $("trialfile").click(); };
  $("trialfile").onchange = e => { readFile(e.target.files[0]); e.target.value = ""; };
  addEventListener("dragover", e => { e.preventDefault(); document.body.classList.add("trialdrag"); });
  addEventListener("dragleave", e => { if (!e.relatedTarget) document.body.classList.remove("trialdrag"); });
  addEventListener("drop", e => { e.preventDefault(); document.body.classList.remove("trialdrag"); readFile(e.dataTransfer.files[0]); });
})();
