/* ---------- support types and text helpers ---------- */
// The "Support for" choices, in three groups. Specialist: mental health, crisis, bereavement and other specific needs.
// Practical: housing, finances and food. Everyday wellbeing: connection, activity, learning, mindfulness and giving.
const GROUPS = [
  ["Specialist support", ["crisis prevention", "low mood", "anxiety", "bereavement", "hearing voices", "eating disorders",
    "long-term pain", "dementia", "addiction", "abuse", "caring for someone"]],
  ["Practical help and support", ["housing", "finances", "food"]],
  ["Everyday wellbeing", ["connect", "be active", "take notice", "keep learning", "giving"]]];
// How a support type is shown, where it isn't just the sheet's word with a capital letter
const LABEL = { "hearing voices": "Psychosis and hearing voices", "crisis prevention": "Crisis support",
  "addiction": "Addiction (alcohol, drugs, gambling)", "abuse": "Abuse (domestic, child or adult)" };
const cap = s => LABEL[s] || s[0].toUpperCase() + s.slice(1);
// Text from the sheet, made safe to put in the page
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// A ;-separated sheet value as a list
const split = s => (s || "").split(";").map(x => x.trim()).filter(Boolean);
// A website address only if it's a web page (http or https), so nothing else in the url column becomes a link
const webUrl = u => /^https?:\/\//i.test(u || "") ? u : "";
