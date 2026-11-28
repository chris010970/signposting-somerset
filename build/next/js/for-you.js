/* ---------- For you: what someone told the landing page, as a few picks and buttons into the directory ----------
   build/next/for-you.json has the rules and words; nothing here is AI. The landing page sends:
     in the address  the topics (?support=a,b,c, most important first) and the place (?town= or ?lat=&lon=&label=)
     in this tab's session (sessionStorage "ss-foryou", never the address: it can be shared)  what its AI read besides:
                     safety (urgent, at_risk, own_behaviour), preferences (contact, groups, get_out, when, travel, under_18,
                     help) and, when the place they typed wasn't the one used, that place (also)
   Safety first. Each safety group has a panel of services (sheet record ids, chosen by topic and age) and says whether the
   usual picks show beneath it: none (urgent, own_behaviour: one clear step), or relevant (at_risk: only their own topics, as
   they asked; nothing added, such as the gentle Five Ways pick).
   The picks, by simple rules, in two rows (fyPicks): someone you can talk to (each topic's established lines, talk_lines of them,
   only ones they can certainly use; none: no row), then places to go (up to max_picks, while there's a good one):
     line     a topic's next established phone or online line (main_lines), or its best phone or online service if it has none
     match    for each topic, the best in-person service: the lowest score (days until a session that suits them + miles x per_mile,
              plus a penalty if it isn't a good first step for the topic, or the kind of help they asked for (help), isn't open to
              all, or needs more than turning up or signing up; less if it has one of the topic's prefer_words). Within the first
              radius, then the next (radius_nearby for travel: nearby only); at the times they said (when), then any time
     online   no place, or contact: phone or online: an online group for the topic
     gentle   for low mood, grief and the like, or when they want to get out: one nearby Five Ways activity
   Only services open to all (who: anyone or adults; or a group the topic suits, groups_ok: carers for caring for someone): we
   don't know who's asking, so never a men's or older people's group by guesswork (the buttons still lead to everything). Never a
   service with a notice that stops people joining, never one in the safety panel above, never two from one provider; one with
   eligibility conditions ranks lower; groups: avoid ranks peer groups far down. Below the picks: links into the directory (In person, Phone
   and online, everything), where the picks wait at the top in a For you section (next-late.js). */
const FY = (/*@next:for-you.json*/);
const FY_Q = FY_SAVED_Q;   // the landing page's choices (this visit's request), kept in the address while this tab shows
// A new request from the landing page (not this tab again, or a reload): this visit's earlier directory choices go (filters,
// ticks, scroll positions, folds), so the other tabs start from this request, Phone and online with its topics as In person
// has. (Before links.js reads them; its key, STATE_KEY, is "ss-directory:" and the page's path.)
if (FOR_YOU) try {
  const req = (sessionStorage.getItem("ss-foryou") || "") + "|" + location.search, sup = START_ADDRESS.get("support");
  if (sessionStorage.getItem("ss-foryou-seen") !== req) {
    sessionStorage.setItem("ss-foryou-seen", req);
    sessionStorage.setItem("ss-directory:" + location.pathname, JSON.stringify(sup ? { talk: String(new URLSearchParams({ support: sup })) } : {}));
    ["near", "talk"].forEach(t => sessionStorage.removeItem("ss-foryou-fold-" + t));
  }
} catch (e) { /* (no storage: nothing saved to clear) */ }
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
  const acts = (Array.isArray(more.activities) ? more.activities : []).filter(a => typeof a === "string").slice(0, 3);
  // (their words without "group", "club" and the like: "walking group" matches "walks")
  const said = (Array.isArray(more.activity_terms) ? more.activity_terms : []).filter(t => typeof t === "string").map(t => t.toLowerCase()).slice(0, 3);
  const terms = said
    .map(t => t.toLowerCase().replace(new RegExp(FY.generic_words, "g"), "").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 3);
  const circumstances = (Array.isArray(more.circumstances) ? more.circumstances : []).filter(x => typeof x === "string");
  const age = Number.isInteger(more.age) ? more.age : null, prefs = { ...(more.prefs || {}) };
  if (age !== null && age < 18) prefs.under_18 = "yes";
  return { tags, point, safety, prefs, also, activities: acts, terms, said, circumstances, age, area: fyArea(point) };
}
const fyFill = (tpl, v) => tpl.replace(/\{(\w+)\}/g, (m, k) => v[k] ?? "");
const fyTopic = t => (LABEL[t] || t).toLowerCase();
const fyTopicSet = t => FY.topics[t] || { line: cap(fyTopic(t)), first_step: [] };
// The safety group that leads (most serious first, in for-you.json's order)
const fySafety = c => Object.keys(FY.safety).find(g => c.safety.includes(g)) || "";
// The sheet's types for the kinds of help they asked for (none: the topic's own first steps)
const fyHelpTypes = prefs => (prefs.help || []).flatMap(h => FY.help_types[h] || []);
// Does a session suit the times they said? (when: daytime, evenings, weekends; none said: any)
function fyWhenOK(start, when) {
  if (!when || !when.length) return true;
  const h = start.getHours(), wkend = FY.when_hours.weekend_days.includes(start.getDay());
  return when.some(w => w === "weekends" ? wkend : w === "daytime" ? !wkend && h >= FY.when_hours.daytime[0] && h < FY.when_hours.daytime[1]
    : w === "evenings" ? h >= FY.when_hours.evenings[0] && h < FY.when_hours.evenings[1] : true);
}

// Their area: their town's (the nearest of our towns to a point), else the default (Somerset)
function fyArea(point) {
  if (!point) return FY.restrictions.default_area;
  let best = null;
  for (const [area, places] of PLACES) for (const [n, lat, lon] of places) {
    const d = n === point.town ? -1 : miles(point, { lat, lon }); if (!best || d < best.d) best = { area, d }; }
  return best ? best.area : FY.restrictions.default_area;
}
// Can they go? (restricted_to: for-you.json's restrictions) null: never for a pick; else { line } (a line to show under it, or "")
// theirs: it's for people like them (a circumstance they said)
function fyRestrict(s, c) {
  const R = FY.restrictions, vals = split(s.restricted_to || ""), areas = vals.filter(v => R.area[v]);
  if (areas.length && !areas.some(v => R.area[v] === c.area)) return null;
  let line = "", theirs = false;
  for (const v of vals) {
    if (R.area[v] || (v === "GP practice" && areas.length)) continue;
    if ((c.circumstances || []).includes(v)) { theirs = true; continue; }
    const min = /^age (\d+)\+$/.exec(v);
    if (min && c.age !== null && c.age !== undefined) { if (c.age >= +min[1]) continue; return null; }
    if (min && c.prefs.under_18 === "yes") return null;
    if ((R.with_topic[v] || []).some(t => c.tags.includes(t))) continue;
    if (R.check[v]) { line = line || R.check[v]; continue; }
    return null;
  }
  return { line, theirs };
}
// Their own words for an activity, in a name or description (a plural matches too)
// Days until it runs, as the score counts them: within soon_days only per_day_soon a day, then a whole point a day
const fyDays = d => Math.min(d, FY.soon_days) * FY.score.per_day_soon + Math.max(0, d - FY.soon_days);
const fyRoot = w => w.replace(/(ing|s)$/, "");
const fyHasWords = (s, terms) => { const t = `${s.name} ${s.description}`.toLowerCase();
  return terms.some(w => t.includes(w) || t.includes(fyRoot(w))); };

function fyPicker(c, now, shown = []) {
  const { point, prefs } = c, used = new Set(shown), providers = new Set(), W = FY.score;
  // Open to all: who is empty, or has anyone or adults (young people too for under-18s), or a group the topic suits
  // (under 18: young people's services, never adults only; 60 or over by their own word: older people's too)
  const young = prefs.under_18 === "yes", old = c.age !== null && c.age !== undefined && c.age >= 60;
  const openTo = (s, tag) => { const w = split(s.who), ok = [...FY.open_to_all.filter(x => !(young && x === "adults")), ...(fyTopicSet(tag).groups_ok || []),
    ...(young ? ["young people"] : []), ...(old ? ["older people"] : [])];
    return !w.length || w.some(x => ok.includes(x)); };
  // (their own words for the group, "men's shed", "walking football for over 50s": who it's for is theirs to judge; restricted_to still holds)
  const R = FY.restrictions, named = w => c.terms.some(t => new RegExp(R.who_words[w] || "^$", "i").test(t));
  const whoOK = (s, tag, activity) => openTo(s, tag) || split(s.who).some(w => (R.who_check[w] && !young) || (activity && named(w)));
  // When they said what the addiction is: never a service only for another kind (addiction_words)
  const AW = FY.addiction_words, kinds = (prefs.addiction || []).filter(k => AW[k]);
  const kindOK = (s, tag) => { if (tag !== "addiction" || !kinds.length) return true;
    const t = `${s.name} ${s.description}`.toLowerCase(), is = k => new RegExp(AW[k], "i").test(t);
    return kinds.some(is) || !Object.keys(AW).filter(k => k !== "_about" && !kinds.includes(k)).some(is); };
  const free = (s, tag, activity) => !used.has(s.id) && !(s.provider && providers.has(s.provider.toLowerCase())) && !noticeText(s)
    && whoOK(s, tag, activity) && fyRestrict(s, c) && kindOK(s, tag) && !(prefs.groups === "avoid" && s.type === "Peer group");
  const whoLine = (s, tag) => openTo(s, tag) ? "" : (split(s.who).map(w => R.who_check[w]).find(Boolean) || "");
  const take = (r, why, topic, note) => { used.add(r.s.id); if (r.s.provider) providers.add(r.s.provider.toLowerCase());
    return { ...r, why, topic, note: note || (r.relaxed ? FY.lines.relaxed : ""), check: fyRestrict(r.s, c).line || whoLine(r.s, topic) }; };
  const horizon = now.getTime() + FY.days_ahead * 864e5, asked = fyHelpTypes(prefs);
  // The lower the better: days until it runs (in person) or open now (phone), distance, and a penalty for each way it fits less well
  function score(r, tag, activity) {
    const set = fyTopicSet(tag), s = r.s, text = `${s.name} ${s.description}`.toLowerCase();
    const firstStep = asked.length ? asked : set.first_step;
    let v = r.st ? (r.st.open ? 0 : W.phone_closed) + (s.area === "national" ? W.uk_wide : 0)   // phone or online
      : fyDays((r.at - now) / 864e5) + r.d * W.per_mile + (FY.easy_access.includes(s.access) ? 0 : W.not_easy_access)   // in person
        + ([...sessions(s, now, 28)].length < 4 ? W.not_weekly : 0);
    if (activity) { if (fyHasWords(s, c.terms)) v += W.exact_words;
      if (!FY.activity_types.includes(s.type)) v += W.activity_on_the_side;
      if ([...c.terms, ...c.activities].some(w => s.name.toLowerCase().includes(fyRoot(w)))) v += W.in_name; }
    else if (firstStep.length && !firstStep.includes(s.type)) v += W.not_first_step;
    if (split(s.who).length && !split(s.who).some(w => FY.open_to_all.includes(w))) v += W.not_open_to_all;   // (a group the topic suits: after open ones)
    if (s.area !== "national" && s.area !== c.area) v += W.other_area;
    if (fyRestrict(s, c).line || whoLine(s, tag)) v += W.check_first;
    if (fyRestrict(s, c).theirs) v += W.theirs;
    if (young && split(s.who).includes("young people")) v += W.young;
    if ((set.prefer_words || []).some(w => text.includes(w))) v += W.prefer_words;
    if (prefs.groups === "avoid" && s.type === "Peer group") v += FY.avoid_groups_penalty;
    return v;
  }
  // Best first: the score, then their own area, then nearer, then the name (so a tie is never just the alphabet)
  const order = (a, b) => (a.v - b.v) || ((a.s.area === c.area) ? -1 : (b.s.area === c.area) ? 1 : 0) || ((a.d || 0) - (b.d || 0)) || a.s.name.localeCompare(b.s.name);
  // The first session that suits the times they said, within days_ahead (null: none)
  const suits = (s, when) => { for (const o of sessions(s, now, FY.days_ahead)) if (o.en > now && fyWhenOK(o.st, when)) return o.st; return null; };
  // The best in-person service for a topic (or for an activity), or null: within each radius in turn, at their times first, then
  // (unless strict) any time, marked relaxed
  function inPerson(tag, { activity = false, strict = false } = {}) {
    if (!point) return null;
    const fits = s => activity ? split(s.activities || "").some(a => c.activities.includes(a)) : s._sf.includes(tag);
    const near = S.filter(s => fits(s) && free(s, tag, activity) && !isNaN(s.lat)).map(s => ({ s, d: miles(point, s) }));
    // (an activity: only the first distance, then an honest "couldn't find"; their own area has this kind of thing at all, even
    // already picked: never another area's)
    const radii = (prefs.travel === "nearby only" ? FY.radius_nearby : FY.radius_miles).slice(0, activity ? 1 : 2);
    const ownHas = r => S.some(s => fits(s) && (s.area === c.area || s.area === "national") && !isNaN(s.lat) && miles(point, s) <= r);
    const times = prefs.when && prefs.when.length ? (strict ? [prefs.when] : [prefs.when, null]) : [null];
    for (const when of times)
      for (const radius of radii) {
        // (one for people like them with no set times, such as a monthly meet-up: still a pick, its card says to check the times)
        let ok = near.filter(x => x.d <= radius).map(x => ({ ...x, at: suits(x.s, when) || (fyRestrict(x.s, c).theirs && !(x.s.times || "").trim() ? new Date(now.getTime() + 14 * 864e5) : null) }))
          .filter(x => x.at && x.at.getTime() <= horizon)
          .map(x => ({ ...x, nx: nextText(x.s, now), relaxed: !!prefs.when && !!prefs.when.length && !when })).map(x => ({ ...x, v: score(x, tag, activity) })).sort(order);
        if (ownHas(radius)) ok = ok.filter(x => x.s.area === c.area || x.s.area === "national");   // (another area's only when their own has none)
        if (ok.length) return ok[0];
      }
    return null;
  }
  // The best phone or online service for a topic (or an activity), scored the same way
  // (sure: for the talk row: one they can certainly use, nothing to check first, and not a group)
  const sureOf = (s, tag) => !fyRestrict(s, c).line && !whoLine(s, tag) && !isGroupType(s);
  function byPhone(tag, { activity = false, sure = false, group = false } = {}) {
    const fits = s => activity ? split(s.activities || "").some(a => c.activities.includes(a)) : s._sf.includes(tag);
    const all = T.filter(s => fits(s) && free(s, tag, activity) && (!sure || sureOf(s, tag)) && (!group || isGroupType(s))).map(s => ({ s, st: openState(s, now) })).map(x => ({ ...x, v: score(x, tag, activity) }));
    return all.sort(order)[0] || null;
  }
  // When nothing in person suits their times: an online or phone group in their area (or UK-wide) at those times, if any
  function onlineAt(tag) {
    if (!prefs.when || !prefs.when.length) return null;
    const all = T.filter(s => s._sf.includes(tag) && free(s, tag) && isGroupType(s)).map(s => ({ s, at: suits(s, prefs.when), st: openState(s, now) }))
      .filter(x => x.at && x.at.getTime() <= horizon && (x.s.area === c.area || x.s.area === "national")).map(x => ({ ...x, v: score(x, tag) }));
    return all.sort(order)[0] || null;
  }
  // The topic's next main line for their area, then national ones (main_lines), if it's there and open to them
  // (first: lines for people like them, then young people's for under-18s, when they fit the topic)
  function line(tag, { sure = false } = {}) {
    const L = FY.main_lines[tag] || {}, U = FY.under_18_lines;
    const fit = id => { const s = ALL.find(x => x.record_id === id); return s && s._sf.includes(tag) ? id : null; };
    const ids = [...(c.circumstances || []).flatMap(x => FY.circumstance_lines[x] || []).filter(fit),
      ...(young ? [...(U[c.area] || []), ...(U.national || [])].filter(fit) : []), ...(L[c.area] || []), ...(L.national || [])];
    for (const id of ids) {
      const s = ALL.find(x => x.record_id === id);
      if (s && free(s, tag) && (!sure || sureOf(s, tag))) return { s, st: openState(s, now) };
    }
    return null;
  }
  return { inPerson, byPhone, onlineAt, line, take };
}

// The picks, in two rows of at most max_picks each. Someone you can talk to (talk): the topics' established phone and online lines
// (talk_lines of them for each topic, in turn; the best phone or online service if a topic has no line left), only what fits: no
// padding. Places to go (meet): an activity they asked for first (or an honest gap and somewhere to meet people instead), then the
// best in person for each topic in turn, filled while there's a good one; the gentle Five Ways pick for low mood and the like. No
// place, or they'd rather phone: places by phone or online too (an online group stays a place to meet people). Under a safety panel:
// no talk row (the panel is it), and only their own topics. Each pick has its row (fyRow).
const fyRow = p => isGroupType(p.s) || !p.st ? "meet" : "talk";
function fyPicks(c, now = new Date(), shown = []) {
  const P = fyPicker(c, now, shown), picks = [], g = fySafety(c), max = FY.max_picks;
  if (g && FY.safety[g].picks === "none") return [];
  // Under a panel, no picks for what it already covers: the crisis lines, and its topics' services (abuse: the abuse lines)
  let tags = c.tags.filter(t => !(g && (t === FY.crisis_tag || (FY.safety[g].by_topic || {})[t])));
  const phoneFirst = c.prefs.contact === "phone or online", inPersonOnly = c.prefs.contact === "in person" && c.point;
  const n = row => picks.filter(p => fyRow(p) === row).length, room = row => n(row) < max;
  const add = (r, why, t, note) => { if (!room(fyRow(r)) || (g && fyRow(r) === "talk")) return false; picks.push(P.take(r, why, t, note)); return true; };
  const what = (c.said || [])[0] || c.terms[0] || c.activities[0] || "";   // (their words as they said them, for the line)
  let gap = "";
  if (c.activities.length) {
    const at = tags[0] || "connect", r = phoneFirst || !c.point ? P.byPhone(at, { activity: true }) || P.inPerson(at, { activity: true }) : P.inPerson(at, { activity: true });
    // (a craft group when they asked for knitting: say so)
    const related = x => c.terms.length && !fyHasWords(x.s, c.terms), say = x => fyFill(related(x) ? FY.lines.activity_related : FY.lines.activity,
      { what, place: c.point ? c.point.label : "", activity: split(x.s.activities).find(a => c.activities.includes(a)) || what });
    if (r) add(r, "activity", at, say(r));
    // A second one like it: for a light request (no topic), or when the first is only related (two to choose from, as neither is quite it)
    if (r && (!tags.length || related(r))) { const r2 = c.point ? P.inPerson(at, { activity: true }) : P.byPhone(at, { activity: true });
      if (r2 && related(r2) === related(r)) add(r2, "activity", at, say(r2)); }
    if (!r) gap = fyFill(c.point ? FY.lines.gap : FY.lines.gap_anywhere, { what, place: c.point ? c.point.label : "" });
    if ((!tags.length || gap) && !g) tags = gap ? ["connect", ...tags.filter(t => t !== "connect")] : [...tags, "connect"];   // a light request, or no match: somewhere to meet people (first, after a gap, so the line says why)
  }
  // Someone you can talk to: each topic's lines in turn
  if (!g && !inPersonOnly)
    for (let i = 0; i < max && room("talk"); i++)
      for (const t of tags) {
        if (!room("talk") || i >= (FY.talk_lines[t] || 0)) continue;
        // (only what fits: nothing to check first; the best phone or online service only for a topic with no lines of its own)
        const r = P.line(t, { sure: true }) || (FY.main_lines[t] ? null : P.byPhone(t, { sure: true }));
        if (r) add(r, "line", t);
      }
  // Places to go: the best for each topic in turn, while there's one (by phone or online when there's no place, or they'd rather)
  const byPhone = phoneFirst || !c.point;
  for (let found = true; found && room(byPhone ? "talk" : "meet");) {
    found = false;
    for (const t of tags) {
      if (!room(byPhone ? "talk" : "meet")) break;
      let r = byPhone ? P.byPhone(t, { group: true }) || P.inPerson(t) : P.inPerson(t), why = "match";   // (by phone: groups online; the talk row has the lines)
      const o = r && r.relaxed && !inPersonOnly ? P.onlineAt(t) : null;   // (an online group at their times beats a daytime one in person)
      if (o) { r = o; why = "online"; }
      if (r && add(r, why, t, t === "connect" && gap && !picks.some(p => p.topic === "connect" && fyRow(p) === "meet" && p.why !== "activity") ? gap : "")) found = true;
    }
  }
  if (g) return picks;   // at_risk: only their own topics, nothing added
  if (c.point && room("meet") && !phoneFirst && (c.prefs.get_out === "yes" || tags.some(t => FY.gentle_for.includes(t))))
    for (const w of FY.five_ways.filter(w => !tags.includes(w))) { const r = P.inPerson(w, { strict: true }); if (r) { add(r, "gentle", w); break; } }
  return picks;
}

const FY_ICONS = {
  people: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M14.5 14.6c.8-.4 1.6-.6 2.5-.6 2.3 0 4 1.5 4.5 4.5"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  pin: '<path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.3"/>' };
// The line above a pick, said to the person: what they'd get there, never their need (someone else may see the screen). An
// activity they asked for: "A place to enjoy singing"; otherwise by the kind of service (the card under it says when, where and
// how). A line to check first (who it's for) stays under it.
function fySubtitle(p, c) {
  // (any pick with an activity they asked for: a second walk as well as the first)
  const A = FY.subtitles, act = split(p.s.activities || "").find(a => c.activities.includes(a)) || (p.why === "activity" ? c.activities[0] : "");
  return act ? A.activity_words[act] || fyFill(A.activity, { activity: act }) : fyMeets(p) ? A.meet : A.by_type[p.s.type] || A.listen;
}
const fyMeets = p => isGroupType(p.s) || (!p.st && !FY.subtitles.by_type[p.s.type]);   // (a place to meet people: a group, a drop-in, an activity, online too)
function fyLine(p, c) {
  const check = p.check ? `<p class="fycheck">${esc(p.check)}</p>` : "";
  return `<div class="fyhd"><h3 class="fywhy">${L_ICON(p.st && !fyMeets(p) ? FY_ICONS.phone : FY_ICONS.people)}<span>${esc(fySubtitle(p, c))}</span></h3>${check}</div>`;
}
// A row's title with its fold button (all open when the page loads; the click handler at the foot folds them)
const fyRowHead = (tag, title, fold = true) => `<div class="fyrowhd"><${tag} class="bt">${esc(title)}</${tag}>${fold ?
  `<button type="button" class="cbtn fyfold" aria-expanded="true" aria-label="${esc(FY.rows.fold)}: ${esc(title)}">${CHEV}</button>` : ""}</div>`;


// The safety panel: the group's words and its services (by record id: under-18s first, then by topic, then the group's own),
// one per provider (the one open now, else the first), at most max_picks
function fyPanelRecs(c, g, now) {
  if (!g) return [];
  const P = FY.safety[g], ids = [...(c.prefs.under_18 === "yes" ? P.under_18 || [] : []), ...c.tags.flatMap(t => (P.by_topic || {})[t] || []), ...P.services];
  const recs = [];
  for (const s of ids.map(id => ALL.find(x => x.record_id === id)).filter(Boolean)) {
    const k = (s.provider || s.name).toLowerCase(), st = openState(s, now), at = recs.findIndex(r => (r.s.provider || r.s.name).toLowerCase() === k);
    if (at < 0) recs.push({ s, st }); else if (st.open && !recs[at].st.open) recs[at] = { s, st };
  }
  return recs.slice(0, FY.max_picks);   // (a row of at most three, as the picks: Samaritans is always in the bar at the foot)
}
function fyPanel(g, recs) {
  if (!g) return "";
  const P = FY.safety[g];
  const call999 = P.call999 ? `<a class="fy999" href="tel:999">${L_ICON(FY_ICONS.phone)}<span>${esc(P.call999)}</span></a>` : "";
  return `<section class="fypanel fy-${g}">${fyRowHead("h1", P.heading, g !== "urgent")}${call999}${P.text ? `<p>${esc(P.text)}</p>` : ""}` +
    `<div class="fypicks">${recs.map(r => talkCard(r)).join("")}</div></section>`;
}

// The buttons, always three: In person and Phone and online, each set to their topics (the picks wait at the top of each, in a
// For you section), then the full directory. Each also set to what they said: only the kinds of help they asked for (In person's
// line names them), no peer groups if they'd avoid groups; In person a short distance if they'd stay nearby, a wider one when
// there's nothing within it. Urgent, own_behaviour: Phone and online first.
function fyButtons(c, g) {
  // (the kinds they asked for; else, for an activity, where activities happen: activity_kinds)
  const E = FY.explore, place = c.point ? c.point.label : "", nearby = c.prefs.travel === "nearby only";
  const asked = fyHelpTypes(c.prefs).length ? fyHelpTypes(c.prefs) : c.activities.length ? KINDS.filter(k => E.activity_kinds.includes(k[0])).flatMap(k => k[2]) : [];
  const tags = (c.tags.length ? c.tags : c.activities.length ? ["connect"] : []).filter(t => !(g && t === FY.crisis_tag));
  // The kinds for a tab's records (all, unless they asked for some or would avoid groups); null: all of them
  const kindsFor = recs => {
    const present = KINDS.map((k, i) => i).filter(i => KINDS[i][2].some(t => recs.some(s => s.type === t)));
    let kinds = asked.length ? present.filter(i => KINDS[i][2].some(t => asked.includes(t))) : present;
    if (c.prefs.groups === "avoid") kinds = kinds.filter(i => !KINDS[i][2].includes("Peer group"));
    return kinds.length && kinds.length < present.length ? kinds : null;
  };
  const nearKinds = kindsFor(S), talkKinds = fyHelpTypes(c.prefs).length || c.prefs.groups === "avoid" ? kindsFor(T) : null   /* (an activity: In person only) */, typesOf = kinds => kinds && kinds.flatMap(i => KINDS[i][2]);
  // In person's distance: the first that finds something
  const has = r => S.some(s => (!tags.length || tags.some(t => s._sf.includes(t))) && (!nearKinds || nearKinds.some(i => KINDS[i][2].includes(s.type))) &&
    !isNaN(s.lat) && c.point && miles(c.point, s) <= r && !noticeText(s));
  const [r1, r2] = nearby ? FY.radius_nearby : FY.radius_miles, within = c.point ? (has(r1) ? r1 : has(r2) ? r2 : nearby ? r1 : 0) : 0;
  const href = (tab, topics = [], o = {}) => { const u = new URLSearchParams();
    if (topics.length) u.set("support", topics.join(","));
    if (tab === "near" && c.point && c.point.town) u.set("town", c.point.town);
    else if (tab === "near" && c.point) { u.set("lat", c.point.lat.toFixed(4)); u.set("lon", c.point.lon.toFixed(4)); u.set("label", c.point.label); }
    if (o.types) u.set("types", o.types.join(","));
    if (tab === "near" && c.point && o.within && o.within !== 10) u.set("within", o.within);
    return PAGE_URL.directory + (String(u) ? "?" + u : "") + "#" + tab; };
  const button = (url, icon, title, text) => `<a class="hway fyx" href="${url}">${L_ICON(icon)}<span><b>${esc(title)}</b><span>${esc(text)}</span></span></a>`;   // (as the landing page's)
  // In person's title: what it's set to and where ("Activities near Wincanton", "Peer groups near Bridgwater", "Places near Wells")
  const what = !nearKinds || !asked.length ? E.in_person.places : !fyHelpTypes(c.prefs).length ? E.in_person.activities :   // (no groups only: still "Places")
    cap(nearKinds.map(i => E.kind_names[KINDS[i][0]] || KINDS[i][0]).join(" and "));
  const inPerson = button(href("near", tags, { types: typesOf(nearKinds), within }), FY_ICONS.people,
    fyFill(place ? E.in_person.title_near : E.in_person.title_anywhere, { what, place: E.short_names[place] || place }), E.in_person.text);   // (a long town name shortened: short_names)
  const phone = button(href("talk", tags, { types: typesOf(talkKinds) }), FY_ICONS.phone, E.phone.title, E.phone.text);
  const browse = button(href("near"), FY_ICONS.search, E.browse.title, place ? fyFill(E.browse.text_near, { place }) : E.browse.text_anywhere);
  return (g === "urgent" || g === "own_behaviour" ? [phone, inPerson, browse] : [inPerson, phone, browse]).join("");
}

function drawForYou() {
  const box = $("foryou");
  if (!ALL.length) { box.innerHTML = `<div class="empty">${liveMsg}</div>`; return; }
  const now = new Date(), c = fyChoices(), g = fySafety(c), panel = fyPanelRecs(c, g, now), picks = fyPicks(c, now, panel.map(r => r.s.id));
  fySavePicks(panel, picks);
  box.style.setProperty("--fy-details", JSON.stringify(FY.details));
  const card = p => `<section class="fypick">${fyRow(p) === "talk" ? "" : fyLine(p, c)}${p.st ? talkCard(p) : serviceCard(p, "h2", false)}</section>`;
  const E = FY.explore, place = c.point ? c.point.label : "";
  // No place: a town picker (it reopens this tab with the town); a place they typed that wasn't used: one tap to it
  // (the note above it says the same, so the words only for screen readers then)
  const towns = place ? "" : `<label class="fytown">${g ? esc(E.choose_place) : ""}<select id="fy-town" aria-label="${esc(E.choose_place)}"><option value="">Choose a town</option>${
    Object.keys(PLACE).sort().map(n => `<option>${esc(n)}</option>`).join("")}</select></label>`;
  const also = c.also ? `<p class="fyalso">${esc(fyFill(FY.also, { place, also: c.also.label }))} <a href="#" id="fy-also">${esc(fyFill(FY.also_link, { also: c.also.label }))}</a></p>` : "";
  const explore = `<aside class="fyexplore">${fyButtons(c, g)}</aside>`;
  // The rows: someone to talk to (phone and online: no line above each, the card says it all), then places to go; with nothing by phone, a one-to-one service in person goes
  // up to the first row. The second row's title from what's in it; the notes on their place under the first row
  let talk = picks.filter(p => fyRow(p) === "talk"), meet = picks.filter(p => fyRow(p) === "meet");
  if (!talk.length && !g) { talk = meet.filter(p => !fyMeets(p)); meet = meet.filter(fyMeets); }
  const notes = (g ? "" : `${c.point ? "" : `<p class="fynote">${esc(FY.no_place)}</p>`}${also}`) + towns;   // (the town picker too: the buttons stay in view)
  const rows = [[FY.rows.talk, talk], [!c.point ? FY.rows.online : fyFill(meet.every(fyMeets) ? FY.rows.groups : FY.rows.mixed, { place: c.point.town || c.point.label }), meet]].filter(r => r[1].length)
    .map(([title, list], i) => `<section class="fyrow">${fyRowHead(i || g ? "h2" : "h1", title)}${i ? "" : notes}<div class="fypicks">${list.map(card).join("")}</div></section>`).join("");
  const list = rows || (g && !towns ? "" : `<section class="fyrow">${notes}${g ? "" : `<div class="empty">${esc(FY.none)}</div>`}</section>`);
  box.innerHTML = `<div class="fysage"><div class="fymain">${fyPanel(g, panel)}${list}</div>${explore}</div>`;   // (the sage panel: inside the page's gutters, lined up with the title and tabs)
  fyFoot(); requestAnimationFrame(fyFoot); if (document.fonts) document.fonts.ready.then(fyFoot);   // (again once laid out and the fonts are in)
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
// (both kinds: in-person cards and the phone and online ones, in the picks and the safety panel)
// The picks, for the For you section at the top of In person and Phone and online (next-late.js): in person there, the rest
// (the safety panel's lines first) on Phone and online. For this visit only, as what they said is.
function fySavePicks(panel, picks) {
  const id = x => x.s.record_id;
  try { sessionStorage.setItem("ss-foryou-picks", JSON.stringify({ near: picks.filter(p => !p.st).map(id), talk: [...panel, ...picks.filter(p => p.st)].map(id) })); } catch (e) { /* (no storage: no section) */ }
}
// The buttons stay in view on computers, just above the helpline bar at the foot (its height: --fy-foot)
// The buttons' titles on one line: a long one ("One-to-one support near Weston-super-Mare") a little smaller, down to 13px, then cut
function fyFoot() {
  const f = document.querySelector("footer.help"); if (f) $("foryou").style.setProperty("--fy-foot", f.offsetHeight + "px");
  document.querySelectorAll("#foryou .fyexplore .hway b").forEach(b => {
    b.style.fontSize = ""; let size = parseFloat(getComputedStyle(b).fontSize);
    while (b.scrollWidth > b.clientWidth + 1 && size > 13) { size -= 0.5; b.style.fontSize = size + "px"; }
  });
}
addEventListener("resize", fyFoot);
// A row folds to its title (its button, or the title itself)
$("foryou").addEventListener("click", e => {
  const hd = e.target.closest(".fyrowhd");
  if (hd) { const b = hd.querySelector(".fyfold"); if (!b) return; const sec = hd.parentElement, folded = sec.classList.toggle("fyfolded");
    b.setAttribute("aria-expanded", String(!folded)); b.setAttribute("aria-label", `${folded ? FY.rows.unfold : FY.rows.fold}: ${hd.querySelector(".bt").textContent}`); return; }
  const c = e.target.closest(".card, .tcard"); if (c && !e.target.closest("a, button:not(.cbtn)")) toggleCard(c); });
