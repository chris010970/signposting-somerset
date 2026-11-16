/* ---------- the card for a service with a place: the directory's In person tab and the Places pages ----------
   Needs text.js, kinds.js and cards.js (copy details, tap-to-call, directions). */
// Badge wording by how people get in
const ACCESS_BADGE = { "drop in": ["b-drop", "Just turn up"], "sign up": ["b-sign", "Contact to join"], "book": ["b-book", "Book first"],
  "referral": ["b-ref", "Needs a referral"] };
function accessBadge(s) {
  if (s.access === "call") return ["b-ref", /group|community|course|volunteering/i.test(s.type || "") ? "Call first" : "Phone line"];
  return ACCESS_BADGE[s.access] || ["b-ref", "Contact provider"];
}
// The kind of service, in the same colour as its map pin
const kindTag = s => { const k = KINDS[kindOf(s)]; return k ? `<div class="kind"><i style="background:${k[1]}"></i>${esc(k[0])}</div>` : ""; };
// One card. r: { s: the record, d: miles from the search point (or null), nx: its "Next" line (nextText) }.
// h: the name's heading level (h2 on the directory; lower where the card sits under section headings)
function serviceCard(r, h = "h2") {
  const s = r.s, [badgeCls, badge] = accessBadge(s), url = webUrl(s.url);
  const contact = [
    url ? `<a href="${esc(url)}" target="_blank" rel="noopener">Website</a>` : "",
    telLink(s.phone),
    s.email ? `<a href="mailto:${esc(s.email.split(";")[0].trim())}">${esc(s.email)}</a>` : ""].filter(Boolean).join(" · ");
  const dist = r.d != null ? `<span class="chip dist">${r.d < .1 ? "<0.1" : r.d.toFixed(1)} mi${s.approx ? " approx." : ""}</span>` : "";
  const cost = s.cost ? `<span class="chip">${esc(s.cost)}</span>` : "";
  const types = s._sf.length ? " · " + s._sf.map(cap).map(esc).join(", ") : "";
  const place = esc([s.address, s.town, s.postcode].filter(Boolean).join(", ")) + (s.approx ? ` <span class="approx">(approx. location)</span>` : "");
  return `<article class="card" id="c${s.id}" data-id="${s.id}">
      <div class="row1"><span class="badge ${badgeCls}">${badge}</span><span class="chipr">${dist}${cost}${directionsLink(s)}${copyBtn(s)}</span></div>
      <${h} class="cname">${esc(s.name)}</${h}>
      ${kindTag(s)}<div class="meta">${esc(s.provider)} · ${esc(s.type)}${types}</div>
      <div class="next"><div class="lab">Next</div><div class="val ${r.nx.cls}">${esc(r.nx.txt)}</div></div>
      <p class="desc">${esc(s.description)}</p>
      ${s.who || s.eligibility ? `<div class="who">For: ${esc(s.who)}${s.eligibility ? ` · <em>${esc(s.eligibility)}</em>` : ""}</div>` : ""}
      <div class="foot"><span>${place}</span>${contact ? `<span>${contact}</span>` : ""}</div>
    </article>`;
}
