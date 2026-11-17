/* ---------- support types and text helpers for the pages (not the relay: core/js/text.js has the shared ones) ---------- */
// The "Support for" choices, in three groups: [group, [types]], and how a type is shown where it isn't just the sheet's
// word with a capital letter (build/core/data/support-types.json)
const SUPPORT_TYPES = (/*@core:data/support-types.json*/);
const GROUPS = SUPPORT_TYPES.groups.map(g => [g.group, g.types]);
const LABEL = SUPPORT_TYPES.labels;
const cap = s => LABEL[s] || s[0].toUpperCase() + s.slice(1);
// Text from the sheet, made safe to put in the page
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// A website address only if it's a web page (http or https), so nothing else in the url column becomes a link
const webUrl = u => /^https?:\/\//i.test(u || "") ? u : "";
// The tab showing is marked aria-current="page" (styled in core/css/page.css)
const currentTab = (el, on) => on ? el.setAttribute("aria-current", "page") : el.removeAttribute("aria-current");
