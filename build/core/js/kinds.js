// Pin colours by kind of service (type), in five groups
const KINDS = [
  ["Activities", "#3F6FB0", ["Activity group", "Volunteering"]],
  ["Groups and community", "#3A9488", ["Peer group", "Community"]],
  ["Advice and practical help", "#D08A2E", ["Advocacy", "Practical support"]],
  ["One-to-one and therapy", "#93549B", ["One-to-one support", "Counselling or therapy"]],
  ["Courses", "#B5577A", ["Course"]],
];
const kindOf = s => KINDS.findIndex(k => k[2].includes(s.type));
const pinCol = s => (KINDS[kindOf(s)] || [, "#64748B"])[1];
