/* ---------- text helpers shared with Assist's relay ---------- */
// Card wording: the access badges (build/core/data/card-text.json)
const CARD_TEXT = (/*@core:data/card-text.json*/);
// Groups, activities, courses and volunteering (by type), as opposed to one-to-one services and phone lines
const isGroupType = s => new RegExp(CARD_TEXT.group_types.join("|"), "i").test(s.type || "");
// A ;-separated sheet value as a list
const split = s => (s || "").split(";").map(x => x.trim()).filter(Boolean);
