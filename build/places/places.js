/* ---------- the standalone Places pages (for search engines, and anyone arriving from one) ----------
   The listings run on the shared Places code (build/core/js/places-view.js), the same as the directory's Places tab.
   Here each town has its own address: switching town updates it, Back and Forward work, and the place, choices and
   scroll position are kept for the visit. */
const $ = id => document.getElementById(id);
let ALL = [];   // (the directory's records; none on these pages; Places cards' records are PLACE_RECS)
(() => {
  const scroller = () => scrollerFor(document.querySelector(".bw"));   // the listings, or the page when it scrolls as one (core/js/page-flow.js)
  const KEY = "ss-places:" + (document.querySelector('.sitetabs a[aria-current]')?.getAttribute("href") || "");   // live and test keep their own
  const kept = (() => { try { return JSON.parse(sessionStorage.getItem(KEY) || "null") || {}; } catch (_) { return {}; } })();
  const save = s => { try { sessionStorage.setItem(KEY, JSON.stringify({ href: s.href, support: s.support, when: s.when, scroll: scroller().scrollTop })); } catch (_) {} };
  let pushing = false;
  const view = placesView({
    main: document.querySelector(".bmain"), hdr: $("hdr-towns"), scroller,
    onChange: s => {
      const url = s.href + (s.support && s.support !== "all" ? "#" + s.support : "");
      if (pushing) { history.pushState({ b: 1 }, "", url); pushing = false; } else history.replaceState(history.state, "", url);
      if (s.title) { document.title = s.title; document.querySelector('meta[name="description"]')?.setAttribute("content", s.description || ""); }
      save(s);
    },
  });
  // A town chosen here gets its own address in the history (so Back returns to the previous town)
  document.addEventListener("change", e => { if (e.target.id === "b-town") pushing = true; }, true);
  document.querySelector(".bmain").addEventListener("click", e => { if (e.target.closest("a:not([target])")) pushing = true; }, true);
  addEventListener("popstate", () => view.show(location.pathname, { support: location.hash.slice(1) || "all" }));
  let saving = 0;
  const noteScroll = () => { clearTimeout(saving); saving = setTimeout(() => save(view.state()), 250); };
  document.querySelector(".bw").addEventListener("scroll", noteScroll, { passive: true });
  addEventListener("scroll", noteScroll, { passive: true });
  addEventListener("pagehide", () => save(view.state()));
  // This page as built: the support from the address (#bereavement), When? and the scroll position as they were this visit
  view.start({ support: location.hash.slice(1) || "all", when: kept.when });
  if (kept.href === location.pathname && kept.scroll) scroller().scrollTop = kept.scroll;
  save(view.state());
})();
