/* ---------- The next design's code (build/next/): loaded after build/core/js/service-card.js, so it replaces serviceCard ----------
   The ticket card: the day and time in a stub on the left, tinted with the kind's colour (the same as its map pin); everything
   else on the right. Uses the shared helpers in core/js/cards.js, schedule.js, kinds.js and page-text.js unchanged. */

// The address the page was opened with (before the page rewrites it to follow the filters): Support for comes only from here
const START_ADDRESS = new URLSearchParams(location.search);

// The kinds (build/next/kinds.json): replace the shared list in place, before anything uses it
KINDS.splice(0, KINDS.length, ...(/*@next:kinds.json*/).kinds.map(k => [k.kind, k.colour, k.types]));

// The map: CARTO's Voyager style first (clearer roads and place names, warmer colours), Positron as the fallback
TILE_URLS.reverse();

const T_ICON = {
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
  web: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
};

// The stub: what goes in the left-hand column for this service's next session (nx: nextText's answer)
function ticketStub(s, nx) {
  const tm = s._times ? `${fmtT(s._times.s)}${s._times.e != null ? "–" + fmtT(s._times.e) : ""}` : "";
  const allWeek = /^00:00-23:5\d$/.test(s.times || "") && /^mon-sun$/i.test(s.days || "") && !(s.frequency || "").trim();
  if (allWeek) return `<b class="big w">24/7</b><span class="sm">any time</span>`;
  if (nx.at) {
    const d = nx.at, dd = Math.round((dayStart(d) - dayStart(new Date())) / 864e5);
    const tag = dd === 0 ? "Today" : dd === 1 ? "Tomorrow" : "";
    const wd = tag ? "" : `<span class="wd">${d.toLocaleDateString("en-GB", { weekday: "short" })}</span>`;
    return (tag ? `<span class="live">${tag}</span>` : "") + wd +
      `<b class="big">${d.getDate()}</b><span class="sm">${d.toLocaleDateString("en-GB", { month: "short" })}</span>` +
      `<span class="rule"></span><span class="tm">${tm || askFor(s)}</span>`;
  }
  // No date to show: an icon and a short label, in the same places as a date's number and time
  const SI = p => `<svg class="sic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const CAL = '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>';
  if (s._kind === "check") {
    const day = split(s.days)[0] || "";
    if (day) return `<b class="big w">${esc(day.replace(/-/g, "–"))}</b>` + (freqShort(s) ? `<span class="sm">${freqShort(s)}</span>` : "") +
      `<span class="rule"></span><span class="tm">${tm || askFor(s)}</span>`;
    return SI(CAL + '<path d="M9.6 13.6a2.5 2.5 0 1 1 3.2 2.4c-.5.2-.8.6-.8 1.1M12 19.6v.1"/>') + `<span class="rule"></span><span class="tm">Dates vary</span>`;
  }
  const appt = s._kind === "appointment" || /^By appointment/.test(nx.txt);
  const days = /^By appointment · /.test(nx.txt) ? nx.txt.split(" · ")[1] : "";
  if (appt) return SI(CAL + '<circle cx="15.5" cy="15.5" r="3.2" fill="var(--stubbg)"/><path d="M15.5 14v1.6l1 .8"/>') +
    `<span class="rule"></span><span class="tm">Appt only</span>` + (days ? `<span class="sm">${esc(days)}</span>` : "");
  if (s._kind === "website") return SI('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.6 2.6 14.4 0 17M12 3.5c-2.6 2.6-2.6 14.4 0 17"/>') +
    `<span class="rule"></span><span class="tm">Times vary</span>`;
  if (nx.txt === "No upcoming dates") return SI(CAL + '<path d="M9.5 13.5l5 5M14.5 13.5l-5 5"/>') + `<span class="rule"></span><span class="tm">No dates yet</span>`;
  return SI(CAL) + `<span class="rule"></span><span class="tm">Check times</span>`;
}
// No time given: how to find out (the same ways as the opened card's buttons), else say so
const askFor = s => s.phone ? "Please call" : s.email ? "Please email" : webUrl(s.url) ? "See website" : "Time not given";
// The frequency as one short word for the stub (build/next/freq-short.json); the card has the full wording
const FREQ_SHORT = (/*@next:freq-short.json*/).short;
const freqShort = s => { const f = (s.frequency || "").trim(); const m = f && FREQ_SHORT.find(([re]) => new RegExp(re, "i").test(f)); return m ? m[1] : ""; };
// The stub shows timing only; anything to check about it goes in the card, under the description
// A "check dates" service: its full frequency when the stub only had room for a short word (or none), else a plain reminder
function checkNote(s) {
  const f = (s.frequency || "").trim();
  return f && f.toLowerCase() !== freqShort(s) ? f[0].toUpperCase() + f.slice(1) : "Check dates with the provider";
}
function timeNotes(s, nx) {
  return [nx.at && /bank holiday/.test(nx.txt) ? "Bank holiday: check it's on" : "", nx.at && s._term ? "Term time only" : "",
    s._kind === "check" ? checkNote(s) : "", s._kind === "website" ? "Times on the website" : ""].filter(Boolean);
}

// The call button: the first number in the phone field, with the number shown (on a computer you read it; on a phone you tap it)
// The main button: Call with the first number; a text-only line ("Text 85258", "Text Hello to 80899") gets Text with its number
function callButton(s) {
  if (!s.phone) return "";
  if (/^text/i.test(s.phone)) { const m = s.phone.match(/\d[\d ]*\d/), n = m ? m[0].replace(/\s/g, "") : "";
    return n ? `<a class="tbtn pri" href="sms:${n}">${T_ICON.phone}Text <span class="num">${esc(m[0])}</span></a>` : ""; }
  const shown = s.phone.split(" (")[0].split(" or ")[0].split(";")[0].trim(), n = shown.replace(/[^\d+]/g, "");
  if (n.length < 3) return "";   // (3: NHS 111)
  return `<a class="tbtn pri" href="tel:${n}">${T_ICON.phone}Call <span class="num">${esc(shown)}</span></a>`;
}
const iconLink = (href, icon, tip, label, blank = true) =>
  `<a class="tbtn ic" href="${esc(href)}"${blank ? ' target="_blank" rel="noopener"' : ""} aria-label="${esc(label)}" data-tip="${esc(tip)}">${icon}</a>`;

// Open and close: an arrow button at the top right, beside Copy (the whole card opens it too). It has the class "cbtn", so
// toggleCard keeps its aria-expanded up to date and the map can focus it, as it did the name button
const foldButton = s => `<button type="button" class="cbtn tfold" aria-expanded="${isOpen(s)}" aria-label="Details: ${esc(s.name)}">${CHEV}</button>`;
// Cost shows only when there is one: a plain "Free" is left off the card (still in Copy details)
const isFree = c => /^\s*free\s*\.?\s*$/i.test(c || "");
/* ---------- The ticket card: one shape for every tab ----------
   ticketCard draws the parts every card shares (the stub in the kind's colour, the top row with Copy and the arrow, the name,
   the description, and the opened part with who and how and the ways to get in touch). Each tab's card is ticketCard with
   its own parts: serviceCard (In person, and the Places pages), talkCard (Phone and online) and courseCard (Courses).
   p: { cls: "card" or "tcard"; attrs: more attributes; stub; tag: the top row's left (badge, distance, "PHONE · UK-WIDE");
        col: the stub's colour (default: the kind's); tools: buttons before Copy; copy: extra text for Copy; h: the name's heading level; pill: after the name;
        sub: under the name; sr: words for screen readers before the description; afterDesc; prov: the opened part's first
        line (default: kind · provider); extra: after who and how; acts: the buttons } */
function ticketCard(s, p) {
  const k = KINDS[kindOf(s)], col = p.col || (k ? k[1] : KIND_DATA.other), h = p.h || "h3";
  const prov = p.prov ?? [k ? k[0] : "", s.provider].filter(Boolean).join(" · ");
  return `<article class="${p.cls || "card"} tk fold${foldClass(s)}"${keyAttr(s)}${p.attrs || ""} style="--k:${col}">
      <div class="stub">${p.stub}</div><div class="perf" aria-hidden="true"></div>
      <div class="tbody">
        <div class="row1">${p.tag || ""}${checkedTick(s)}<span class="sp"></span>${p.tools || ""}${copyBtn(s, p.copy)}${foldButton(s)}</div>
        <${h} class="cname">${esc(displayName(s))}${p.pill || ""}</${h}>
        ${p.sub || ""}${p.sr ? `<span class="vh">${esc(p.sr)}. </span>` : ""}<p class="desc">${esc(s.description)}</p>${p.afterDesc || ""}
        <div class="more">
          <div class="prov">${esc(prov)}</div>
          ${factsBlock(isFree(s.cost) ? { ...s, cost: "" } : s)}
          ${p.extra || ""}${p.acts ? `<div class="acts">${p.acts}</div>` : ""}
        </div>${p.actsOut ? `<div class="acts out">${p.actsOut}</div>` : ""}
      </div>
    </article>`;
}
// The buttons in an opened card: Call (with the number), then Website, Directions (In person) and Email as icons
// (mainEmail: with no number, Email is the main button, with its word, rather than an icon)
function contactButtons(s, { directions = false, mainEmail = false } = {}) {
  const url = webUrl(s.url), email = s.email ? s.email.split(";")[0].trim() : "", call = callButton(s);
  if (mainEmail && !call && email) return [`<a class="tbtn pri" href="mailto:${esc(email)}">${T_ICON.mail}Email</a>`,
    url ? iconLink(url, T_ICON.web, "Website", `Website: ${s.provider || s.name} (opens in a new tab)`) : ""].join("");
  return [call,
    url ? iconLink(url, T_ICON.web, "Website", `Website: ${s.provider || s.name} (opens in a new tab)`) : "",
    directions && dirHref(s) ? iconLink(dirHref(s), DIR_ICON, "Directions", `Directions to ${s.name}`) : "",
    email ? iconLink(`mailto:${email}`, T_ICON.mail, "Email", `Email ${s.provider || s.name}`, false) : ""].filter(Boolean).join("");
}
// In person (and the Places pages, which pass withId false: no map there, so no pin button)
function serviceCard(r, h = "h2", withId = true) {
  const s = r.s, [badgeCls, badge] = accessBadge(s), k = KINDS[kindOf(s)];
  const dist = r.d != null ? `<span class="tdist">${T_ICON.pin}${r.d < .1 ? "&lt;0.1" : r.d.toFixed(1)} mi</span>` : "";
  // Currently full: a pill by the name, and the rest of the sentence under the description
  const [, nt] = noticeFrom(s), full = /^currently full\b/i.test(nt || "");
  const why = full ? nt.replace(/^currently full\s*[:.,–-]?\s*/i, "") : nt;
  const notice = nt ? `<div class="notice">${NOTICE_ICON}<span>${esc(why ? why[0].toUpperCase() + why.slice(1) : nt)}</span></div>` : "";
  const tn = timeNotes(s, r.nx), tnotes = tn.length ? `<div class="tnotes">${tn.map(n => `<span>${n}</span>`).join("")}</div>` : "";
  const place = [s.address, s.town, s.postcode].filter(Boolean).join(", ");
  const firstNum = s.phone ? s.phone.split(" (")[0].split(" or ")[0].split(";")[0].trim() : "";
  return ticketCard(s, {
    attrs: (withId ? ` id="c${s.id}"` : "") + ` data-id="${s.id}"`, h, stub: ticketStub(s, r.nx),
    tag: `<span class="badge ${badgeCls}">${badge}</span>${dist}`, tools: withId ? pinButton(s) : "",
    pill: full ? ` <span class="full">Currently full</span>` : "", sr: k ? k[0] : "", afterDesc: tnotes + notice,
    extra: (place ? `<div class="where">${T_ICON.pin}<span>${esc(place)}${s.approx ? ` <span class="approx">(approx. location)</span>` : ""}</span></div>` : "") +
      (s.phone && s.phone.trim() !== firstNum ? `<div class="phones">${esc(s.phone)}</div>` : ""),
    acts: contactButtons(s, { directions: true }) });
}
