// Kinds of service and their colours, for map pins, the map key and cards (build/core/data/kinds.json): [kind, colour, [types]]
const KIND_DATA = (/*@core:data/kinds.json*/);
const KINDS = KIND_DATA.kinds.map(k => [k.kind, k.colour, k.types]);
const kindOf = s => KINDS.findIndex(k => k[2].includes(s.type));
const pinCol = s => KINDS[kindOf(s)]?.[1] ?? KIND_DATA.other;
