/* ---------- Copy details ---------- */
// Plain text for a text message, email or case notes: the regular pattern rather than the next date, so it stays right
const COPY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const copyBtn = (s, when) => `<button type="button" class="copy" data-copy="${s.id}"${when ? ` data-when="${esc(when)}"` : ""} aria-label="Copy details" data-tip="Copy details">${COPY_ICON}</button>`;
const ampm = t => { const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}${m ? ":" + String(m).padStart(2, "0") : ""}${h < 12 ? "am" : "pm"}`; };
function copyWhen(s) {
  const allDay = /^00:00-23:5\d$/.test(s.times || "");
  let tm = allDay ? "24 hours" : /^\d\d:\d\d(-\d\d:\d\d)?$/.test(s.times || "") ? s.times.split("-").map(ampm).join("–") : (s.times || "");
  let days = (s.days || "").split(";").map(x => x.trim()).filter(Boolean).join(", ");
  if (/^mon-sun$/i.test(days) && !s.frequency) { if (allDay) return "24/7"; days = ""; tm = "Every day" + (tm ? ", " + tm : ""); }
  const f = (s.frequency || "").trim(), hasDay = /\b(mon|tue|wed|thu|fri|sat|sun)/i.test(f);
  let when = "";
  if (f && !/^see /i.test(f)) when = hasDay ? f : cap(f) + (days ? ", " + days : "");
  else if (days) when = (/-/.test(days) ? "" : "Every ") + days;
  else if (s.dates) when = "Dates: " + split(s.dates).slice(0, 3).map(d => /^\d{4}-\d\d-\d\d$/.test(d) ? new Date(d + "T12:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : d).join(", ") + (split(s.dates).length > 3 ? "…" : "");
  return [when, tm].filter(Boolean).join(", ");
}
function copyText(s, when) {
  const ACC = s.access !== "call" && CARD_TEXT.access[s.access]?.label;   // how to get in (a phone number says it for "call")
  const modes = split(s.mode), inPerson = modes.includes("in-person");
  const how = !inPerson && modes.length ? modes.map(m => m === "phone" ? "Phone" : m === "online" ? "Online" : m).join(" or ") : "";
  return [
    s.name + (s.provider && s.provider !== s.name ? ` (${s.provider})` : ""),
    [when || copyWhen(s), how, ACC, s.cost, s.eligibility].filter(Boolean).join(" · "),
    inPerson ? [s.address, [s.town, s.postcode].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "",
    [s.phone, s.email, s.url].filter(Boolean).join(" · "),
  ].filter(Boolean).join("\n");
}
// Tap-to-call: the first number in the field ("01234 567890 or 0800..." -> 01234567890); texts and non-numbers stay plain
function telLink(phone) {
  if (!phone) return "";
  const n = phone.split(" (")[0].split(" or ")[0].split(";")[0].replace(/[^\d+]/g, "");
  return /^text/i.test(phone) || n.length < 5 ? esc(phone) : `<a href="tel:${n}">${esc(phone)}</a>`;
}
// Directions in the phone's own maps app: Apple Maps on iPhone/iPad, Google Maps everywhere else.
// Only for a real venue location, never for town-centre (approx.) points or services without an address.
const DIR_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>';
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
// Shared with the Assist tab. Needs a postcode: records without one are placed at a town centre or meet in varying places.
function dirHref(s) {
  if (!s || s.approx || isNaN(s.lat) || isNaN(s.lon) || !s.postcode) return "";
  const ll = `${(+s.lat).toFixed(6)},${(+s.lon).toFixed(6)}`;
  return IOS ? `https://maps.apple.com/?daddr=${ll}` : `https://www.google.com/maps/dir/?api=1&destination=${ll}`;
}
function directionsLink(s) {
  const href = dirHref(s); if (!href) return "";
  return `<a class="copy dirs" href="${href}" target="_blank" rel="noopener" aria-label="Directions to ${esc(s.name)}" data-tip="Directions">${DIR_ICON}</a>`;
}
function copyToClipboard(txt) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(txt).catch(() => copyFallback(txt));
  copyFallback(txt);
}
function copyFallback(txt) {
  const ta = document.createElement("textarea"); ta.value = txt; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
  document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (_) {} ta.remove();
}
// The record a Copy details button belongs to: a Places card's (places-view.js, ids "p0"...) or the page's own (ALL)
// Open or close a service card's full details (a click anywhere on it, or its name button by keyboard), saying so to screen readers
function toggleCard(card) {
  card.classList.toggle("open");
  card.querySelector(".cbtn")?.setAttribute("aria-expanded", card.classList.contains("open"));
}
let PLACE_RECS = [];   // the Places listing's records, when one is showing (core/js/places-view.js); ids "p0", "p1"... never clash
const recordById = id => PLACE_RECS.find(x => x.id === id) || ALL.find(x => String(x.id) === id);
document.addEventListener("click", e => {
  const b = e.target.closest && e.target.closest("button.copy"); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const s = recordById(b.dataset.copy); if (!s) return;
  copyToClipboard(copyText(s, b.dataset.when));
  b.classList.add("copied"); clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove("copied"), 1600);
  const live = $("copy-live"); if (live) { live.textContent = ""; setTimeout(() => { live.textContent = `Copied details for ${s.name}`; }, 30); }
});
