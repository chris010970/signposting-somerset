/* ---------- the card for a service with a place: the directory's In person tab and the Places pages ----------
   Needs text.js, kinds.js and cards.js (copy details, tap-to-call, directions). */
// The access badge: [class, wording] (build/core/data/card-text.json)
function accessBadge(s) {
  const a = CARD_TEXT.access[s.access] || CARD_TEXT.access_other;
  return [a.class, a.label_not_group && !isGroupType(s) ? a.label_not_group : a.label];
}
// The kind of service, in the same colour as its map pin
const kindTag = s => { const k = KINDS[kindOf(s)]; return k ? `<div class="kind"><i style="background:${k[1]}"></i>${esc(k[0])}</div>` : ""; };
// One card (its name is a button that opens the full details: toggleCard, for keyboards and screen readers too). r: { s: the record, d: miles from the search point (or null), nx: its "Next" line (nextText) }.
// h: the name's heading level (h2 on the directory; lower where the card sits under section headings).
// withId: give the card an id (c + record id) for the map to find it; off where a service can appear more than once.
function serviceCard(r, h = "h2", withId = true) {
  const s = r.s, [badgeCls, badge] = accessBadge(s), url = webUrl(s.url);
  const contact = [
    url ? `<a href="${esc(url)}" target="_blank" rel="noopener">Website</a>` : "",
    telLink(s.phone),
    s.email ? `<a href="mailto:${esc(s.email.split(";")[0].trim())}">${esc(s.email)}</a>` : ""].filter(Boolean).join(" · ");
  const dist = r.d != null ? `<span class="chip dist">${r.d < .1 ? "&lt;0.1" : r.d.toFixed(1)} mi${s.approx ? " approx." : ""}</span>` : "";
  const cost = s.cost ? `<span class="chip">${esc(s.cost)}</span>` : "";
  const types = s._sf.length ? " · " + s._sf.map(cap).map(esc).join(", ") : "";
  const place = esc([s.address, s.town, s.postcode].filter(Boolean).join(", ")) + (s.approx ? ` <span class="approx">(approx. location)</span>` : "");
  return `<article class="card"${withId ? ` id="c${s.id}"` : ""} data-id="${s.id}">
      <div class="row1"><span class="badge ${badgeCls}">${badge}</span><span class="chipr">${dist}${cost}${directionsLink(s)}${copyBtn(s)}</span></div>
      <${h} class="cname"><button type="button" class="cbtn" aria-expanded="false">${esc(s.name)}</button></${h}>
      ${kindTag(s)}<div class="meta">${esc(s.provider)} · ${esc(s.type)}${types}</div>
      <div class="next"><div class="lab">Next</div><div class="val ${r.nx.cls}">${esc(r.nx.txt)}</div></div>
      <p class="desc">${esc(s.description)}</p>
      ${s.who || s.eligibility ? `<div class="who">For: ${esc(s.who)}${s.eligibility ? ` · <em>${esc(s.eligibility)}</em>` : ""}</div>` : ""}
      <div class="foot"><span>${place}</span>${contact ? `<span>${contact}</span>` : ""}</div>
    </article>`;
}
