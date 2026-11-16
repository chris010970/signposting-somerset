/* ---------- Courses ---------- */
// { order (for sorting), when (the sessions, as text), status (the pill), join (can someone still start it?) }
function courseInfo(s, now) {
  const today = iso(now);
  if (!s.dates) return { order: 9e15, when: `${s.days ? s.days + " " + s.times + " · " : ""}Rolling course: ask for the next start date`, status: "Rolling", join: true };
  const ds = [];   // every session date, from single dates and ranges (a range counts only its course days)
  for (const p of split(s.dates)) {
    const r = p.match(/^(\d{4}-\d\d-\d\d) to (\d{4}-\d\d-\d\d)$/);
    if (!r) { ds.push(p); continue; }
    for (let d = new Date(r[1]); iso(d) <= r[2]; d = addDays(d, 1)) if (!s._days.size || s._days.has(d.getDay())) ds.push(iso(d));
  }
  ds.sort();
  const first = ds[0], last = ds[ds.length - 1], left = ds.filter(d => d >= today).length;
  const f = d => new Date(d + "T12:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const span = `${ds.length} sessions · ${f(first)} to ${f(last)}${s.times ? " · " + s.days + " " + s.times.replace("-", "–") : ""}`;
  if (first > today) return { order: +new Date(first), when: span, status: `Starts ${f(first)}`, join: true };
  return { order: +new Date(first), when: span, status: `Running now: ${left} of ${ds.length} sessions left`, join: false };
}
function courseCard({ s, ci }) {
  const url = webUrl(s.url);
  return `<article class="tcard">
      <div class="row1"><span class="mode">${split(s.mode).includes("online") ? "Online" : esc(s.town || "In person")}</span><span class="chipr"><span class="openp ${ci.join ? "yes" : "no"}">${esc(ci.status)}</span>${copyBtn(s, ci.when)}</span></div>
      <div class="tname"><h3>${esc(s.name)}</h3>${checkedTick(s)}</div>
      <div class="meta" style="margin:0;color:var(--ink);font-weight:600">${esc(ci.when)}</div>
      <p class="desc" style="-webkit-line-clamp:3">${esc(s.description)}</p>
      <div class="meta" style="margin:0">${esc(s.provider)}${s.cost ? " · " + esc(s.cost) : ""}${s.eligibility ? " · " + esc(s.eligibility) : ""}</div>
      <div class="foot">${[url ? `<a href="${esc(url)}" target="_blank" rel="noopener">Website</a>` : "", esc(s.phone), esc(s.email)].filter(Boolean).join(" · ")}</div>
    </article>`;
}
function renderCourses() {
  setTimeout(syncLink, 0);   // keep the address bar in step with the filters
  if (!ALL.length) { panelMessage(liveMsg); return; }
  const now = new Date(), sup = $("c-support").value, fmt = $("c-fmt").value, canJoin = $("c-book").checked;
  $("q-csupport").classList.toggle("on", !!sup); $("q-cfmt").classList.toggle("on", !!fmt); $("q-cbook").classList.toggle("on", canJoin);
  let rows = C.filter(s => (!sup || s._sf.includes(sup)) && (!fmt || split(s.mode).includes(fmt))).map(s => ({ s, ci: courseInfo(s, now) }));
  if (canJoin) rows = rows.filter(r => r.ci.join);
  rows.sort((a, b) => (b.ci.join - a.ci.join) || (a.ci.order - b.ci.order));   // upcoming or rolling first, then by start date
  $("courses").innerHTML = rows.length ? `<h2 class="gh">Courses<small>${rows.length}</small></h2><div class="tgrid">${rows.map(courseCard).join("")}</div>`
    : `<div class="empty"><strong>No courses match</strong><br>Try "Anything", or untick "Upcoming or rolling".</div>`;
}
$("c-support").onchange = renderCourses;
$("c-fmt").onchange = renderCourses;
$("c-book").onchange = renderCourses;
