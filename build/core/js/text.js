/* ---------- support types and text helpers ---------- */
// The "Support for" choices, in three groups: [group, [types]], and how a type is shown where it isn't just the sheet's
// word with a capital letter (build/core/data/support-types.json)
const SUPPORT_TYPES = (/*@core:data/support-types.json*/);
const GROUPS = SUPPORT_TYPES.groups.map(g => [g.group, g.types]);
const LABEL = SUPPORT_TYPES.labels;
// Card wording: the access badges (build/core/data/card-text.json)
const CARD_TEXT = (/*@core:data/card-text.json*/);
// Groups, activities, courses and volunteering (by type), as opposed to one-to-one services and phone lines
const isGroupType = s => new RegExp(CARD_TEXT.group_types.join("|"), "i").test(s.type || "");
const cap = s => LABEL[s] || s[0].toUpperCase() + s.slice(1);
// Text from the sheet, made safe to put in the page
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// A ;-separated sheet value as a list
const split = s => (s || "").split(";").map(x => x.trim()).filter(Boolean);
// A website address only if it's a web page (http or https), so nothing else in the url column becomes a link
const webUrl = u => /^https?:\/\//i.test(u || "") ? u : "";
// The tab showing is marked aria-current="page" (styled in core/css/page.css)
const currentTab = (el, on) => on ? el.setAttribute("aria-current", "page") : el.removeAttribute("aria-current");
