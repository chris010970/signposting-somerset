/* ---------- The next design's code (build/next/): loaded after build/core/js/service-card.js, so it replaces serviceCard ----------
   The ticket card: the day and time in a stub on the left, tinted with the kind's colour (the same as its map pin); everything
   else on the right. Uses the shared helpers in core/js/cards.js, schedule.js, kinds.js and page-text.js unchanged. */

// The map: CARTO's Voyager style first (clearer roads and place names, warmer colours), Positron as the fallback
TILE_URLS.reverse();

const T_ICON = {
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
  web: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M7.5 12.5l3 3 6-6.5"/></svg>',
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
    const notes = [/bank holiday/.test(nx.txt) ? "Bank holiday: check" : "", s._term ? "Term time" : ""].filter(Boolean);
    return (tag ? `<span class="live">${tag}</span>` : "") + wd +
      `<b class="big">${d.getDate()}</b><span class="sm">${d.toLocaleDateString("en-GB", { month: "short" })}</span>` +
      `<span class="rule"></span><span class="tm">${tm || "Time: check"}</span>` + notes.map(n => `<span class="note">${n}</span>`).join("");
  }
  if (s._kind === "check") {
    const day = split(s.days)[0] || "";
    return (day ? `<b class="big w">${esc(day.replace(/-/g, "–"))}</b>` : "") + `<span class="sm">${esc(s.frequency || "dates vary")}</span>` +
      (tm ? `<span class="rule"></span><span class="tm">${tm}</span>` : "") + `<span class="note">Check dates</span>`;
  }
  // No date to show: say how it works instead (see website, by appointment, no upcoming dates)
  const words = s._kind === "website" ? "Times vary" : s._kind === "appointment" || /^By appointment/.test(nx.txt) ? "By appointment"
    : nx.txt === "No upcoming dates" ? "No upcoming dates" : "Check times";
  const days = /^By appointment · /.test(nx.txt) ? nx.txt.split(" · ")[1] : "";
  return `<span class="words">${words}</span>` + (days ? `<span class="sm">${esc(days)}</span>` : "") +
    (s._kind === "website" ? `<span class="note">See website</span>` : "");
}

// The call button: the first number in the phone field, with the number shown (on a computer you read it; on a phone you tap it)
function callButton(s) {
  if (!s.phone) return "";
  const shown = s.phone.split(" (")[0].split(" or ")[0].split(";")[0].trim(), n = shown.replace(/[^\d+]/g, "");
  if (/^text/i.test(s.phone) || n.length < 5) return "";
  return `<a class="tbtn pri" href="tel:${n}">${T_ICON.phone}Call <span class="num">${esc(shown)}</span></a>`;
}
const iconLink = (href, icon, tip, label, blank = true) =>
  `<a class="tbtn ic" href="${esc(href)}"${blank ? ' target="_blank" rel="noopener"' : ""} aria-label="${esc(label)}" data-tip="${esc(tip)}">${icon}</a>`;

function serviceCard(r, h = "h2", withId = true) {
  const s = r.s, [badgeCls, badge] = accessBadge(s), url = webUrl(s.url), k = KINDS[kindOf(s)];
  const col = k ? k[1] : KIND_DATA.other, kindName = k ? k[0] : "";
  const dist = r.d != null ? `<span class="tdist">${T_ICON.pin}${r.d < .1 ? "&lt;0.1" : r.d.toFixed(1)} mi</span>` : "";
  // Currently full: a pill by the name, and the rest of the sentence under the description
  const [, nt] = noticeFrom(s), full = /^currently full\b/i.test(nt || "");
  const why = full ? nt.replace(/^currently full\s*[:.,–-]?\s*/i, "") : nt;
  const notice = nt ? `<div class="notice">${NOTICE_ICON}<span>${esc(why ? why[0].toUpperCase() + why.slice(1) : nt)}</span></div>` : "";
  const pill = full ? ` <span class="full">Currently full</span>` : "";
  // The opened card: kind and provider, when the details were checked, who and how, where, and the ways to get in touch
  const when = checkedOn(s) ? `<div class="chkd">${T_ICON.ok}Details checked ${checkedOn(s).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</div>` : "";
  const place = [s.address, s.town, s.postcode].filter(Boolean).join(", ");
  const email = s.email ? s.email.split(";")[0].trim() : "";
  const acts = [callButton(s),
    url ? iconLink(url, T_ICON.web, "Website", `Website: ${s.provider || s.name} (opens in a new tab)`) : "",
    dirHref(s) ? iconLink(dirHref(s), DIR_ICON, "Directions", `Directions to ${s.name}`) : "",
    email ? iconLink(`mailto:${email}`, T_ICON.mail, "Email", `Email ${s.provider || s.name}`, false) : ""].filter(Boolean).join("");
  const firstNum = s.phone ? s.phone.split(" (")[0].split(" or ")[0].split(";")[0].trim() : "";
  const morePhones = s.phone && s.phone.trim() !== firstNum ? `<div class="phones">${esc(s.phone)}</div>` : "";
  return `<article class="card tk fold${foldClass(s)}"${keyAttr(s)}${withId ? ` id="c${s.id}"` : ""} data-id="${s.id}" style="--k:${col}">
      <div class="stub">${ticketStub(s, r.nx)}</div><div class="perf" aria-hidden="true"></div>
      <div class="tbody">
        <div class="row1"><span class="badge ${badgeCls}">${badge}</span>${dist}${checkedTick(s)}<span class="sp"></span>${copyBtn(s)}</div>
        <${h} class="cname">${nameButton(s)}${pill}</${h}>
        ${kindName ? `<span class="vh">${esc(kindName)}. </span>` : ""}<p class="desc">${esc(s.description)}</p>${notice}
        <div class="more">
          <div class="prov">${esc([kindName, s.provider].filter(Boolean).join(" · "))}</div>${when}
          ${factsBlock(s)}
          ${place ? `<div class="where">${T_ICON.pin}<span>${esc(place)}${s.approx ? ` <span class="approx">(approx. location)</span>` : ""}</span></div>` : ""}
          ${morePhones}${acts ? `<div class="acts">${acts}</div>` : ""}
        </div>
      </div>
    </article>`;
}
