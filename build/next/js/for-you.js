/* ---------- For you: what someone told the landing page, as a few picks and buttons into the directory ----------
   build/next/for-you.json has the rules and words; nothing here is AI. The landing page sends:
     in the address  the topics (?support=a,b,c, most important first) and the place (?town= or ?lat=&lon=&label=)
     in this tab's session (sessionStorage "ss-foryou", never the address: it can be shared)  what its AI read besides:
                     safety (urgent, at_risk, own_behaviour), preferences (contact, groups, get_out, when, travel, under_18,
                     help) and, when the place they typed wasn't the one used, that place (also)
   Safety first. Each safety group has a panel of services (sheet record ids, chosen by topic and age) and says whether the
   usual picks show beneath it: none (urgent, own_behaviour: one clear step), or relevant (at_risk: only their own topics, as
   they asked; nothing added, such as the gentle Five Ways pick).
   The picks, by simple rules:
     match    for each topic, the best in-person service: the lowest score (days until a session that suits them + miles x per_mile,
              plus a penalty if it isn't a good first step for the topic, or the kind of help they asked for (help), isn't open to
              all, or needs more than turning up or signing up; less if it has one of the topic's prefer_words). Within the first
              radius, then the next (radius_nearby for travel: nearby only); at the times they said (when), then any time
     phone    a topic with nothing in person, no place, or contact: phone or online: its best phone or online service
     gentle   for low mood, grief and the like, or when they want to get out: one nearby Five Ways activity
     another  one topic only: a second option for it
   Only services open to all (who: anyone or adults; or a group the topic suits, groups_ok: carers for caring for someone): we
   don't know who's asking, so never a men's or older people's group by guesswork (the buttons still lead to everything). Never a
   service with a notice that stops people joining, never one in the safety panel above, never two from one provider; one with
   eligibility conditions ranks lower; groups: avoid ranks peer groups far down. Beside the picks (below on phones): buttons into the directory set up from the same
   results (the kinds of help for each topic, the place, the distance), each checked so it never opens on an empty list. */
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
  let more = {};
  try { more = JSON.parse(sessionStorage.getItem("ss-foryou") || "{}") || {}; } catch (e) {}
  const safety = (Array.isArray(more.safety) ? more.safety : []).filter(g => g !== "note" && FY.safety[g]);
  // also: a place they typed that wasn't used ({ label, lat, lon }), offered in one tap
  const also = more.also && more.also.label && !isNaN(more.also.lat) && more.also.label !== (point && point.label) ? more.also : null;
  return { tags, point, safety, prefs: more.prefs || {}, also };
}
const fyFill = (tpl, v) => tpl.replace(/\{(\w+)\}/g, (m, k) => v[k] ?? "");
const fyTopic = t => (LABEL[t] || t).toLowerCase();
const fyTopicSet = t => FY.topics[t] || { line: cap(fyTopic(t)), first_step: [] };
// The safety group that leads (most serious first, in for-you.json's order)
const fySafety = c => Object.keys(FY.safety).find(g => g !== "note" && c.safety.includes(g)) || "";
// An icon for a topic line: the landing page's, where it has one
const fyIcon = t => { const h = HOME_TOPICS.find(x => x[0] === t);
  return L_ICON(h ? h[1] : '<path d="M12 3v18M12 5h6l2 2.5-2 2.5h-6M12 12H6l-2 2.5L6 17h6"/>'); };
// The sheet's types for the kinds of help they asked for (none: the topic's own first steps)
const fyHelpTypes = prefs => (prefs.help || []).flatMap(h => FY.help_types[h] || []);
// Does a session suit the times they said? (when: daytime, evenings, weekends; none said: any)
function fyWhenOK(start, when) {
  if (!when || !when.length) return true;
  const h = start.getHours(), wkend = FY.when_hours.weekend_days.includes(start.getDay());
  return when.some(w => w === "weekends" ? wkend : w === "daytime" ? !wkend && h >= FY.when_hours.daytime[0] && h < FY.when_hours.daytime[1]
    : w === "evenings" ? h >= FY.when_hours.evenings[0] && h < FY.when_hours.evenings[1] : true);
}

function fyPicker(c, now, shown = []) {
  const { point, prefs } = c, used = new Set(shown), providers = new Set(), W = FY.score;
  // Open to all: who is empty, or has anyone or adults (young people too for under-18s), or a group the topic suits
  const openTo = (s, tag) => { const w = split(s.who), ok = [...FY.open_to_all, ...(fyTopicSet(tag).groups_ok || []), ...(prefs.under_18 === "yes" ? ["young people"] : [])];
    return !w.length || w.some(x => ok.includes(x)); };
  const free = (s, tag) => !used.has(s.id) && !(s.provider && providers.has(s.provider.toLowerCase())) && !noticeText(s) && openTo(s, tag);
  const take = (r, why, topic) => { used.add(r.s.id); if (r.s.provider) providers.add(r.s.provider.toLowerCase()); return { ...r, why, topic }; };
  const horizon = now.getTime() + FY.days_ahead * 864e5, asked = fyHelpTypes(prefs);
  function score(r, tag) {
    const set = fyTopicSet(tag), s = r.s, who = split(s.who), text = `${s.name} ${s.description}`.toLowerCase();
    const firstStep = asked.length ? asked : set.first_step;
    let v = r.st ? (r.st.open ? 0 : W.phone_closed) + (s.area === "national" ? W.uk_wide : 0)   // phone or online
      : (r.at - now) / 864e5 + r.d * W.per_mile;                                                  // in person
    if (firstStep.length && !firstStep.includes(s.type)) v += W.not_first_step;
    if (who.length && !who.some(w => FY.open_to_all.includes(w))) v += W.not_open_to_all;   // (a group the topic suits: allowed, but after open ones)
    if ((s.eligibility || "").trim()) v += W.eligibility;   // (conditions to join: "people with MS", "Somerset Council area only")
    if (!FY.easy_access.includes(s.access)) v += W.not_easy_access;
    if ((set.prefer_words || []).some(w => text.includes(w))) v += W.prefer_words;
    if (prefs.groups === "avoid" && s.type === "Peer group") v += FY.avoid_groups_penalty;
    return v;
  }
  // The first session that suits the times they said, within days_ahead (null: none)
  const suits = (s, when) => { for (const o of sessions(s, now, FY.days_ahead)) if (o.en > now && fyWhenOK(o.st, when)) return o.st; return null; };
  // The best in-person service for a topic, or null: within each radius in turn, at their times first, then any time
  function inPerson(tag) {
    if (!point) return null;
    const near = S.filter(s => s._sf.includes(tag) && free(s, tag) && !isNaN(s.lat)).map(s => ({ s, d: miles(point, s) }));
    const radii = prefs.travel === "nearby only" ? FY.radius_nearby : FY.radius_miles;
    for (const when of prefs.when && prefs.when.length ? [prefs.when, null] : [null])
      for (const radius of radii) {
        const ok = near.filter(x => x.d <= radius).map(x => ({ ...x, at: suits(x.s, when) })).filter(x => x.at && x.at.getTime() <= horizon)
          .map(x => ({ ...x, nx: nextText(x.s, now) })).map(x => ({ ...x, v: score(x, tag) })).sort((a, b) => a.v - b.v);
        if (ok.length) return ok[0];
      }
    return null;
  }
  // The best phone or online service for a topic, scored the same way (open now, local, a good first step, open to all)
  function byPhone(tag) {
    const all = T.filter(s => s._sf.includes(tag) && free(s, tag)).map(s => ({ s, st: openState(s, now) })).map(x => ({ ...x, v: score(x, tag) }));
    all.sort((a, b) => (a.v - b.v) || a.s.name.localeCompare(b.s.name));
    return all[0] || null;
  }
  return { inPerson, byPhone, take };
}

function fyPicks(c, now = new Date(), shown = []) {
  const P = fyPicker(c, now, shown), picks = [], room = () => picks.length < FY.max_picks, g = fySafety(c);
  if (g && FY.safety[g].picks === "none") return [];
  // Under a panel, no picks for what it already covers: the crisis lines, and its topics' services (abuse: the abuse lines)
  const tags = c.tags.filter(t => !(g && (t === FY.crisis_tag || (FY.safety[g].by_topic || {})[t])));
  const phoneFirst = c.prefs.contact === "phone or online";
  for (const t of tags) {
    if (!room()) break;
    const r = phoneFirst ? P.byPhone(t) || P.inPerson(t) : P.inPerson(t) || (c.prefs.contact === "in person" && c.point ? null : P.byPhone(t));
    if (r) picks.push(P.take(r, r.st && !phoneFirst && c.point ? "phone" : "match", t));
  }
  if (g) return picks;   // at_risk: only their own topics, nothing added
  if (c.point && room() && !phoneFirst && (c.prefs.get_out === "yes" || tags.some(t => FY.gentle_for.includes(t))))
    for (const w of FY.five_ways.filter(w => !tags.includes(w))) { const r = P.inPerson(w); if (r) { picks.push(P.take(r, "gentle", w)); break; } }
  if (room() && tags.length === 1) { const r = phoneFirst ? P.byPhone(tags[0]) : P.inPerson(tags[0]) || P.byPhone(tags[0]); if (r) picks.push(P.take(r, "another", tags[0])); }
  return picks;
}

const FY_ICONS = {
  people: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M14.5 14.6c.8-.4 1.6-.6 2.5-.6 2.3 0 4 1.5 4.5 4.5"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  pin: '<path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.3"/>' };
// The line above a pick: what it's for (the card under it says when, where and how)
function fyLine(p) {
  const line = fyTopicSet(p.topic).line;
  const text = p.why === "match" ? line : fyFill(FY.lines[p.why], { line });
  return `<h2 class="fywhy">${fyIcon(p.why === "gentle" ? "low mood" : p.topic)}<span>${esc(text)}</span></h2>`;
}

// The safety panel: the group's words and its services (by record id: under-18s first, then by topic, then the group's own),
// one per provider (the one open now, else the first)
function fyPanelRecs(c, g, now) {
  if (!g) return [];
  const P = FY.safety[g], ids = [...(c.prefs.under_18 === "yes" ? P.under_18 || [] : []), ...c.tags.flatMap(t => (P.by_topic || {})[t] || []), ...P.services];
  const recs = [];
  for (const s of ids.map(id => ALL.find(x => x.record_id === id)).filter(Boolean)) {
    const k = (s.provider || s.name).toLowerCase(), st = openState(s, now), at = recs.findIndex(r => (r.s.provider || r.s.name).toLowerCase() === k);
    if (at < 0) recs.push({ s, st }); else if (st.open && !recs[at].st.open) recs[at] = { s, st };
  }
  return recs;
}
function fyPanel(g, recs) {
  if (!g) return "";
  const P = FY.safety[g];
  const call999 = P.call999 ? `<a class="fy999" href="tel:999">${L_ICON(FY_ICONS.phone)}<span>${esc(P.call999)}</span></a>` : "";
  return `<section class="fypanel fy-${g}"><h1 class="bt">${esc(P.heading)}</h1>${call999}<p>${esc(P.text)}</p>` +
    `<div class="fypicks">${recs.map(r => talkCard(r)).join("")}</div><p class="fynote">${esc(FY.safety.note)}</p></section>`;
}

// The buttons: the directory set up from the same results. For each topic, the kinds of help that suit it (asked for, else its
// first steps; no peer groups if they'd avoid groups; activities first if they want to get out), near their place at their
// distance (the next distance if nothing's there; no button if still nothing), and its phone and online support; at most
// max_links; "Browse the full directory" last. With a safety group: plainer (urgent, own_behaviour: no topics at all).
function fyButtons(c, g) {
  const E = FY.explore, place = c.point ? c.point.label : "", nearby = c.prefs.travel === "nearby only";
  const radius = nearby ? FY.radius_nearby[1] : FY.radius_miles[0], wide = nearby ? FY.radius_miles[0] : FY.radius_miles[1];
  const kindOfType = t => KINDS.findIndex(k => k[2].includes(t));
  const near = (s, r) => !c.point || (!isNaN(s.lat) && miles(c.point, s) <= r);
  const href = (tab, o = {}) => { const u = new URLSearchParams();
    if (o.topic) u.set("support", o.topic);
    if (tab === "near" && c.point && c.point.town) u.set("town", c.point.town);
    else if (tab === "near" && c.point) { u.set("lat", c.point.lat.toFixed(4)); u.set("lon", c.point.lon.toFixed(4)); u.set("label", c.point.label); }
    if (tab === "near" && o.types) u.set("types", o.types.join(","));
    if (tab === "near" && c.point && o.within && o.within !== 10) u.set("within", o.within);
    return PAGE_URL.directory + (String(u) ? "?" + u : "") + "#" + tab; };
  const button = (url, icon, title, text) => `<a class="fyx" href="${url}">${L_ICON(icon)}<span><b>${esc(title)}</b><span>${esc(text)}</span></span>${L_ICON('<path d="M9 6l6 6-6 6"/>')}</a>`;
  // An in-person button for a topic and kind, at the first distance that finds something (none: no button)
  const kindButton = (t, k) => {
    const types = KINDS[k][2], has = r => S.some(s => s._sf.includes(t) && types.includes(s.type) && near(s, r) && !noticeText(s));
    const within = has(radius) ? radius : has(wide) ? wide : 0;
    return within ? button(href("near", { topic: t, types, within }), FY_ICONS.people, FY.kind_titles[KINDS[k][0]] || KINDS[k][0],
      `${fyTopicSet(t).line}, ${fyFill(E.near, { place })}`) : "";
  };
  const phoneButton = t => T.some(s => s._sf.includes(t)) ? button(href("talk", { topic: t }), FY_ICONS.phone, E.phone.title, fyFill(E.phone.text, { line: fyTopicSet(t).line })) : "";
  const links = [];
  if (g === "urgent" || g === "own_behaviour") links.push(button(href("talk"), FY_ICONS.phone, E.safety_phone.title, E.safety_phone.text));
  else {
    const tags = c.tags.filter(t => !(g && t === FY.crisis_tag));
    if (g) links.push(phoneButton(c.tags.includes(FY.crisis_tag) || !tags[0] ? FY.crisis_tag : tags[0]));   // at_risk: the lines first
    tags.forEach((t, i) => {
      const types = fyHelpTypes(c.prefs).length ? fyHelpTypes(c.prefs) : fyTopicSet(t).first_step;
      let kinds = [...new Set(types.map(kindOfType).filter(k => k >= 0))];
      if (c.prefs.groups === "avoid") kinds = kinds.filter(k => !KINDS[k][2].includes("Peer group"));
      if (c.prefs.get_out === "yes") kinds.sort((a, b) => KINDS[b][2].includes("Activity group") - KINDS[a][2].includes("Activity group"));
      const mine = c.point ? kinds.slice(0, i ? 1 : 2).map(k => kindButton(t, k)).filter(Boolean) : [];
      const phone = c.prefs.contact !== "in person" && (i === 0 || !mine.length) ? [phoneButton(t)] : [];
      links.push(...(c.prefs.contact === "phone or online" ? [...phone, ...mine] : [...mine, ...phone]));
    });
  }
  const shown = [...new Set(links.filter(Boolean))].slice(0, E.max_links);
  shown.push(button(href("near"), FY_ICONS.search, E.browse.title, place ? fyFill(E.browse.text_near, { place }) : E.browse.text_anywhere));
  return shown.join("");
}

function drawForYou() {
  const box = $("foryou");
  if (!ALL.length) { box.innerHTML = `<div class="empty">${liveMsg}</div>`; return; }
  const now = new Date(), c = fyChoices(), g = fySafety(c), panel = fyPanelRecs(c, g, now), picks = fyPicks(c, now, panel.map(r => r.s.id));
  box.style.setProperty("--fy-details", JSON.stringify(FY.details));
  const cards = picks.map(p => `<section class="fypick">${fyLine(p)}${p.st ? talkCard(p) : serviceCard(p, "h2", false)}</section>`).join("");
  const E = FY.explore, place = c.point ? c.point.label : "";
  // No place: a town picker (it reopens this tab with the town); a place they typed that wasn't used: one tap to it
  const towns = place ? "" : `<label class="fytown">${esc(E.choose_place)}<select id="fy-town"><option value="">Choose a town</option>${
    Object.keys(PLACE).sort().map(n => `<option>${esc(n)}</option>`).join("")}</select></label>`;
  const also = c.also ? `<p class="fyalso">${esc(fyFill(FY.also, { place, also: c.also.label }))} <a href="#" id="fy-also">${esc(fyFill(FY.also_link, { also: c.also.label }))}</a></p>` : "";
  const heading = g ? E.heading_safety : place ? fyFill(E.heading_near, { place }) : E.heading_anywhere;
  const explore = `<aside class="fyexplore"><h2>${L_ICON(FY_ICONS.pin)}${esc(heading)}</h2>${towns}${fyButtons(c, g)}</aside>`;
  const head = g ? "" : `<div class="fyhead"><h1 class="bt">${esc(FY.heading)}</h1><p>${esc(FY.intro)}</p>${c.point ? "" : `<p class="fynote">${esc(FY.no_place)}</p>`}${also}</div>`;
  const list = picks.length ? (g ? `<h2 class="fysub">${esc(FY.also_heading)}</h2>` : "") + `<div class="fypicks">${cards}</div>` : g ? "" : `<div class="empty">${esc(FY.none)}</div>`;
  box.innerHTML = `<div class="fymain">${fyPanel(g, panel)}${head}${list}</div>${explore}`;
  const pick = $("fy-town");
  if (pick) pick.onchange = () => { if (!pick.value) return; const q = new URLSearchParams(FY_Q); q.set("town", pick.value); q.delete("lat"); q.delete("lon"); q.delete("label");
    location.href = location.pathname + "?" + q + "#foryou"; };
  const swap = $("fy-also");
  if (swap) swap.onclick = e => { e.preventDefault(); const q = new URLSearchParams(FY_Q); ["town", "lat", "lon", "label"].forEach(k => q.delete(k));
    if (PLACE[c.also.label]) q.set("town", c.also.label);
    else { q.set("lat", (+c.also.lat).toFixed(3)); q.set("lon", (+c.also.lon).toFixed(3)); q.set("label", c.also.label); }
    try { const m = JSON.parse(sessionStorage.getItem("ss-foryou") || "{}"); m.also = c.point ? { label: c.point.label, lat: c.point.lat, lon: c.point.lon } : null;
      sessionStorage.setItem("ss-foryou", JSON.stringify(m)); } catch (_) {}
    location.href = location.pathname + "?" + q + "#foryou"; };
}
// A card opens and closes as in the other tabs (links, Copy and Directions do their own thing)
$("foryou").addEventListener("click", e => { const c = e.target.closest(".card"); if (c && !e.target.closest("a, button:not(.cbtn)")) toggleCard(c); });
