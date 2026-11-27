/* ---------- For you: 2-3 picks for what someone told the landing page (build/next/for-you.json has the rules and words) ----------
   The landing page sends the topics (?support=a,b,c, most important first), the place (?town= or ?lat=&lon=&label=) and, in this
   tab only, whether the words suggested risk (sessionStorage "ss-risk"). The picks are made by simple rules, no AI:
     risk     a phone line for crisis support first
     match    for each topic, the best in-person service: open to them, within the first radius (then the next), the easiest to
              get to first (drop in, sign up...), then the soonest, then the nearest
     phone    a topic with nothing in person nearby: its best phone or online service (open now or 24/7 first)
     gentle   for low mood, grief and the like, one nearby Five Ways activity (connect, be active, take notice)
     another  one topic only: a second option for it
   Never a service with a notice that stops people joining ("Currently full..."), as the cards show it (core/js/cards.js).
   Never two picks from the same provider. Under the picks: links to every service for each topic, with the filters set. */
const FY = (/*@next:for-you.json*/);
const FY_Q = FOR_YOU ? location.search.slice(1) : "";   // the landing page's choices, kept in the address while this tab shows
{ const shared = linkFor; linkFor = t => t === "foryou" ? FY_Q : shared(t); }

function fyChoices() {
  const q = new URLSearchParams(FY_Q);
  const tags = (q.get("support") || "").split(",").map(t => t.trim().toLowerCase()).filter(t => LABEL[t] || GROUPS.some(g => g[1].includes(t)));
  let point = null;
  const town = q.get("town"), lat = parseFloat(q.get("lat")), lon = parseFloat(q.get("lon"));
  if (town && PLACE[town]) point = { lat: PLACE[town][0], lon: PLACE[town][1], label: town, town };
  else if (lat > 50.5 && lat < 51.7 && lon > -4.2 && lon < -1.9)
    point = { lat, lon, label: (q.get("label") || "your location").replace(/[<>"]/g, "").slice(0, 60) };
  let risk = false; try { risk = sessionStorage.getItem("ss-risk") === "1"; } catch (e) {}
  return { tags, point, risk };
}
const fyFill = (tpl, v) => tpl.replace(/\{(\w+)\}/g, (m, k) => v[k] ?? "");
const fyTopic = t => (LABEL[t] || t).toLowerCase();

function fyPicker(point, now) {
  const used = new Set(), providers = new Set();
  const youthOnly = s => { const w = split(s.who); return w.length && w.every(x => FY.leave_out_who_only.includes(x)); };
  const free = s => !used.has(s.id) && !(s.provider && providers.has(s.provider.toLowerCase())) && !noticeText(s) && !youthOnly(s);
  const take = (r, why, topic) => { used.add(r.s.id); if (r.s.provider) providers.add(r.s.provider.toLowerCase()); return { ...r, why, topic }; };
  const rank = s => { const i = FY.access_order.indexOf(s.access); return i < 0 ? FY.access_order.length : i; };
  const horizon = now.getTime() + FY.days_ahead * 864e5;
  // The best in-person service for a topic, or null
  function inPerson(tag) {
    const all = S.filter(s => s._sf.includes(tag) && free(s)).map(s => ({ s, d: point && !isNaN(s.lat) ? miles(point, s) : null, nx: nextText(s, now) }))
      .filter(r => r.nx.at && r.nx.at.getTime() <= horizon);
    const order = (a, b) => (FY.easy_access.includes(b.s.access) - FY.easy_access.includes(a.s.access)) || (a.nx.at - b.nx.at) || ((a.d ?? 0) - (b.d ?? 0)) || (rank(a.s) - rank(b.s));
    for (const r of point ? FY.radius_miles : [Infinity]) {
      const near = all.filter(x => !point || (x.d != null && x.d <= r)).sort(order);
      if (near.length) return near[0];
    }
    return null;
  }
  // The best phone or online service for a topic: open now or 24/7 first, local before UK-wide
  function byPhone(tag) {
    const all = T.filter(s => s._sf.includes(tag) && free(s)).map(s => ({ s, st: openState(s, now) }));
    all.sort((a, b) => (b.st.open - a.st.open) || ((a.s.area === "national") - (b.s.area === "national")) || a.s.name.localeCompare(b.s.name));
    return all[0] || null;
  }
  return { inPerson, byPhone, take };
}

function fyPicks({ tags, point, risk }, now = new Date()) {
  const P = fyPicker(point, now), picks = [], room = () => picks.length < FY.max_picks;
  if (risk) { const r = P.byPhone(FY.crisis_tag); if (r) picks.push(P.take(r, "risk", FY.crisis_tag)); }
  for (const t of tags) {
    if (!room()) break;
    const r = P.inPerson(t);
    if (r) picks.push(P.take(r, "match", t));
    else { const p = P.byPhone(t); if (p) picks.push(P.take(p, "phone", t)); }
  }
  if (room() && tags.some(t => FY.gentle_for.includes(t)))
    for (const w of FY.five_ways.filter(w => !tags.includes(w))) { const r = P.inPerson(w); if (r) { picks.push(P.take(r, "gentle", w)); break; } }
  if (room() && tags.length === 1) { const r = P.inPerson(tags[0]); if (r) picks.push(P.take(r, "another", tags[0])); }
  return picks;
}

// The line above a pick: why it's there (the card under it says when, where and how)
const fySentence = p => fyFill(FY.sentences[p.why], { topic: esc(fyTopic(p.topic)) });

function drawForYou() {
  const box = $("foryou");
  if (!ALL.length) { box.innerHTML = `<div class="empty">${liveMsg}</div>`; return; }
  const c = fyChoices(), picks = fyPicks(c);
  const intro = fyFill(FY.intro, { near: c.point ? fyFill(FY.near, { place: esc(c.point.label) }) : "" });
  const cards = picks.map(p => `<section class="fypick"><h2 class="fywhy">${fySentence(p)}</h2>${p.st ? talkCard(p) : serviceCard(p, "h2", false)}</section>`).join("");
  const q = t => { const u = new URLSearchParams(); u.set("support", t);
    if (c.point && c.point.town) u.set("town", c.point.town);
    else if (c.point) { u.set("lat", c.point.lat.toFixed(4)); u.set("lon", c.point.lon.toFixed(4)); u.set("label", c.point.label); }
    return PAGE_URL.directory + "?" + u + "#near"; };
  const links = c.tags.map(t => `<li><b>${esc(fyFill(FY.see_all, { Topic: cap(fyTopic(t)) }))}</b> <a href="${q(t)}">${
    c.point ? fyFill(FY.see_near, { place: esc(c.point.label) }) : esc(FY.see_anywhere)}</a> · <a href="${PAGE_URL.directory}?support=${encodeURIComponent(t)}#talk">${esc(FY.see_phone)}</a></li>`).join("");
  box.innerHTML = `<div class="fyhead"><h1 class="bt">${esc(FY.heading)}</h1><p>${intro}</p></div>` +
    (picks.length ? `<div class="fypicks">${cards}</div>` : `<div class="empty">${esc(FY.none)}</div>`) +
    (links ? `<ul class="fylinks">${links}</ul>` : "");
}
// A card opens and closes as in the other tabs (links, Copy and Directions do their own thing)
$("foryou").addEventListener("click", e => { const c = e.target.closest(".card"); if (c && !e.target.closest("a, button:not(.cbtn)")) toggleCard(c); });
