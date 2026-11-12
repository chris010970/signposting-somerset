// Removes personal details from free text before it leaves the page (and again in the Worker before an online search).
// Shared by assist-tab.js and the Worker: the build scripts paste this file into both, so there is one copy to maintain.
// It can't catch every name: a lone first name ("Sarah has…") looks like any other word, so the prompt box asks for none.
const NAME_STOP = new Set(("She He They It This That There Then When What Where Why How Client Clients Man Woman Mum Dad Mother Father Son Daughter Husband Wife " +
  "Partner Person People Someone Nobody Everyone Recently Since After Before Lives Has Had Is Was Feels Wants Needs Likes Can Could Would Should Will " +
  "Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September October November December " +
  "Somerset Taunton Yeovil Bridgwater Frome Wells Glastonbury Street Minehead Chard Burnham Highbridge Shepton Mallet Wellington Crewkerne Ilminster " +
  "Langport Somerton Wincanton Castle Cary Cheddar Watchet Williton Bath Weston NHS GP Mind Age UK Our His Her Their My Your Also And But Not No Yes Hope Grace Faith Joy Will Rose Summer Autumn Winter Spring Christmas Easter Money Work Life Home Food Drinking Gambling Everything Nothing").split(" "));
function scrub(txt) {
  const n = {};
  const hit = (k, r) => { n[k] = (n[k] || 0) + 1; return r; };
  const s = String(txt || "")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, () => hit("email address", "[email]"))
    // UK phone numbers in any common format: 07700 900123, +44 7700 900123, 020 7946 0018, (01823) 276892, 01823-276892
    .replace(/(?:\+44[\s-]?\(?0?\)?|\(?\b0)\d[\d\s()-]{7,12}\d\b/g, m => (m.replace(/\D/g, "").length >= 10 ? hit("phone number", "[phone]") : m))
    .replace(/\b\d{3}\s?\d{3}\s?\d{4}\b/g, () => hit("NHS or ID number", "[number]"))
    .replace(/\b[A-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b/gi, () => hit("NI number", "[number]"))
    .replace(/\b([A-Z]{1,2}\d[A-Z\d]?)\s?\d[A-Z]{2}\b/gi, (m, out) => hit("full postcode", out.toUpperCase()))
    .replace(/\b\d{1,2}[\/.-]\d{1,2}[\/.-](?:19|20)?\d{2}\b/g, () => hit("date", "[date]"))
    .replace(/\b(?:born(?: in| on)?|d\.?o\.?b\.?:?)\s*(?:(?:19|20)\d{2}|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+(?:\s+(?:19|20)\d{2})?)/gi, () => hit("date of birth", "[date of birth]"))
    .replace(/\b\d{1,4}[a-z]?,?\s+(?:[A-Za-z']+\s){1,3}(?:road|rd|street|st|lane|ln|avenue|ave|close|drive|dr|way|crescent|place|court|gardens|terrace|hill|row|square|walk|mews|grove)\b\.?/gi, () => hit("street address", "[address]"))
    .replace(/\b(?:Mr|Mrs|Ms|Miss|Mx|Dr)\.?\s+[A-Z][a-z'-]+(?:\s+[A-Z][a-z'-]+)?/g, () => hit("name", "[name]"))
    .replace(/\b(called|named|name is|name's|known as)\s+[A-Z][a-z'-]+(?:\s+[A-Z][a-z'-]+)?/gi, (m, w) => hit("name", `${w} [name]`))
    // "my client John Smith", "client Sarah", "her son Jack"
    .replace(/\b((?:my |her |his |their |our )?(?:client|patient|service user|resident|son|daughter|husband|wife|partner|mum|dad|mother|father|brother|sister|friend|carer))\s+([A-Z][a-z'-]+(?:\s+[A-Z][a-z'-]+)?)\b/g,
      (m, w, name) => (NAME_STOP.has(name.split(" ")[0]) ? m : hit("name", `${w} [name]`)))
    // A capitalised name starting a sentence and followed by a verb: "Sarah has been…", "John Smith is…"
    .replace(/(^|[.!?]\s+|\n)([A-Z][a-z'-]+(?:\s+[A-Z][a-z'-]+)?)(?=\s+(?:has|is|was|had|feels|felt|says|said|lives|lived|wants|needs|told|cares|can't|won't|doesn't|isn't)\b)/g,
      (m, pre, name) => (NAME_STOP.has(name.split(" ")[0]) ? m : hit("name", `${pre}[name]`)));
  return { text: s, removed: n };
}
