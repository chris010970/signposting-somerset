/* ---------- Phone and online ---------- */
// Status pill: { txt, open, when } (when: "today" or "week" for amber or blue, if it opens soon)
function openState(s, now) {
  if (!s.days && !s.dates && !s.phone && split(s.mode).includes("online")) return { txt: "No set hours", open: false };  // e.g. online application forms
  if (s._kind !== "dated") return { txt: s._kind === "website" ? "Times vary: see website" : "Check times", open: false };
  const allDay = s._days.size === 7 && s._times && s._times.s === 0 && s._times.e >= 1439;
  if (allDay) return { txt: "Open 24/7", open: true };
  const o = occurrences(s, now, 14), cur = o.find(x => x.st <= now && x.en > now);
  // Online sessions and some phone lines run on set days with no set time: say so, and don't count them as "open now"
  if (cur && !s._times) return { txt: "Today (no set time)", open: false, when: "today" };
  if (cur) return { txt: s.mode.includes("phone") ? `Open now until ${fmtT(s._times.e ?? s._times.s)}` : "Happening now", open: true };
  const nx = o.find(x => x.en > now), dd = nx ? Math.round((dayStart(nx.st) - dayStart(now)) / 864e5) : 99;
  return { txt: (s.mode.includes("phone") ? "Opens " : "Next ") + shortNext(s, o, now), open: false, when: dd === 0 ? "today" : dd < 7 ? "week" : "" };
}
// Compact "when" for the status pill: "today 20:00", "Fri 20:00", "24 Nov 19:00"
function shortNext(s, occ, now) {
  const o = occ.find(x => x.en > now) || occurrences(s, now, 70).find(x => x.en > now);
  if (!o) return "date to be confirmed";
  const dd = Math.round((dayStart(o.st) - dayStart(now)) / 864e5);
  const day = dd === 0 ? "today" : dd === 1 ? "tomorrow" : dd < 7 ? o.st.toLocaleDateString("en-GB", { weekday: "short" })
    : o.st.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return day + (s._times ? " " + fmtT(s._times.s) : " (no set time)") + (o.bank ? " (bank hol.)" : "");
}
// One card: how to reach it (the phone number, large), what it is, and whether it's open
function talkCard({ s, st }) {
  const modes = split(s.mode).filter(m => m !== "in-person").map(m => m === "phone" ? "Phone" : "Online")
    .sort((a, b) => a === "Phone" ? -1 : b === "Phone" ? 1 : 0).join(" · ");
  const tel = s.phone ? s.phone.split(" (")[0].split(" or ")[0].replace(/\s/g, "") : "";
  const reach = s.phone ? (/^text/i.test(s.phone) ? esc(s.phone) : `<a href="tel:${esc(tel)}">${esc(s.phone)}</a>`)
    : s.email ? `<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>` : "";
  const url = webUrl(s.url);
  return `<article class="tcard fold${foldAttrs(s)}">
      <div class="row1"><span class="mode" title="${modes} · ${s.area === "national" ? "UK-wide" : "Local"}">${modes} · ${s.area === "national" ? "UK-wide" : "Local"}</span><span class="chipr"><span class="openp ${st.open ? "yes" : st.when || "no"}">${esc(st.txt)}</span>${copyBtn(s)}</span></div>
      <div class="tname"><h3>${nameButton(s)}</h3>${checkedTick(s)}</div>
      ${reach ? `<div class="reach${s.phone ? "" : " email"}">${reach}</div>` : ""}
      <p class="desc">${esc(s.description)}</p>${restrictLine(s)}
      <div class="meta" style="margin:0">${esc(s.provider)} · ${esc(s.type)}${s.who && s.who !== "anyone" ? " · For " + esc(s.who) : ""}${s.eligibility ? " · " + esc(s.eligibility) : ""}</div>
      ${url ? `<div class="foot"><span><a href="${esc(url)}" target="_blank" rel="noopener">Website</a>${s.email && s.phone ? " · " + esc(s.email) : ""}</span></div>` : ""}
    </article>`;
}
// Tap a card, or its name button, to open or close it
$("talk-list").addEventListener("click", e => { const c = e.target.closest(".tcard"); if (c && !e.target.closest("a, button:not(.cbtn)")) toggleCard(c); });
function renderTalk() {
  setTimeout(syncLink, 0);   // keep the address bar in step with the filters
  if (!ALL.length) { panelMessage(liveMsg); return; }
  const now = new Date(), sup = $("t-support").value, onlyOpen = $("t-open").checked, area = $("t-area").value;
  $("q-tsupport").classList.toggle("on", !!sup); $("q-open").classList.toggle("on", onlyOpen); $("q-tarea").classList.toggle("on", !!area);
  let rows = T.filter(s => (!sup || s._sf.includes(sup)) && (!area || (area === "national") === (s.area === "national")))
    .map(s => ({ s, st: openState(s, now) }));
  if (onlyOpen) rows = rows.filter(r => r.st.open);
  // Grouped as the Support for choices are; each service under the first group it fits, open ones first
  const used = new Set(); let html = "";
  for (const [g, vals] of GROUPS) {
    const rs = rows.filter(r => !used.has(r.s.id) && r.s._sf.some(v => vals.includes(v)));
    rs.forEach(r => used.add(r.s.id));
    rs.sort((a, b) => (b.st.open - a.st.open) || a.s.name.localeCompare(b.s.name));
    if (rs.length) html += `<h2 class="gh">${g}<small>${rs.length}</small></h2><div class="tgrid">${rs.map(talkCard).join("")}</div>`;
  }
  const tips = [onlyOpen ? 'untick "Open now only"' : "", area ? 'choose "Local and UK-wide"' : "", sup ? 'choose "Anything" under Support for' : ""]
    .filter(Boolean).join(", or ").replace(/^./, c => c.toUpperCase());
  $("talk-list").innerHTML = html || `<div class="empty"><strong>${onlyOpen ? "Nothing open right now for this" : "Nothing listed for this"}</strong><br>` +
    `${tips || "Try again later"}, or call Samaritans on 116 123 at any time.</div>`;
}
$("t-support").onchange = renderTalk;
$("t-open").onchange = renderTalk;
$("t-area").onchange = renderTalk;
