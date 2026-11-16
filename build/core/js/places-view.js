/* ---------- Places listings: shared by the directory's Places tab and the standalone Places pages ----------
   A Places page (built by build/places/build_places.py) holds two pieces: the filter boxes (#hdr-towns) and the listings
   (.bmain, with the page's records as JSON). This shows them, runs 1. Support for, 3. When? and the cards, and swaps in
   another town's page in place. Needs schedule.js, records.js, cards.js (PLACE_RECS: the records shown) and service-card.js (the In person tab's card). */
function placesView({ main, hdr, scroller, onChange = () => {}, onLink = () => false }) {
  // main: where the listings go; hdr: where the filter boxes go (the #hdr-towns element); scroller: what scrolls the listings
  // onChange(state): after any change (town, Support for, When?); onLink(url): a link out of Places, return true if handled
  const $ = id => document.getElementById(id);
  let href = "";   // the Places page showing

  function load() {   // the page's records; a card's data-i is its place in that list
    const el = main.querySelector("#places-data");
    try { PLACE_RECS = el ? shapeRecords(JSON.parse(el.textContent)).map(s => ({ ...s, id: "p" + s.id })) : []; }
    catch (_) { PLACE_RECS = []; }
  }
  const byIndex = i => PLACE_RECS.find(s => s.id === "p" + i);
  const always = s => s.days === "Mon-Sun" && s.times === "00:00-23:59";   // 24/7: in every window
  // 3. When?: does it meet in the chosen time? (the In person tab's windows; no set times: only under Any time)
  function meets(s, w, now) {
    if (w === "any" || always(s)) return true;
    const win = windowFor(w, now);
    return !!win && meetsIn(s, win);
  }
  // 1. Support for: that section, or all of them; 3. When?: only cards that meet then, each showing its session then
  function pick(k) {
    const sel = $("b-support"); if (!sel) return;
    if (![...sel.options].some(o => o.value === k)) k = "all";
    sel.value = k; $("bq-support").classList.toggle("on", k !== "all");
    const w = $("b-when").value, now = new Date(), win = windowFor(w, now);
    const from = win ? new Date(Math.max(win[0], now)) : now;
    $("bq-when").classList.toggle("on", w !== "any");
    let shown = 0;
    main.querySelectorAll(".bsec").forEach(sec => {
      let n = 0;
      sec.querySelectorAll("h3").forEach(h => {
        const ul = h.nextElementSibling; let m = 0;
        ul.querySelectorAll("li[data-i]").forEach(li => {
          const s = byIndex(li.dataset.i), ok = !!s && meets(s, w, now);   // no record: its dates have all passed since the build
          li.hidden = !ok; m += ok;
          if (ok) li.innerHTML = serviceCard({ s, d: +li.dataset.d, nx: nextText(s, now, from) }, "h4", false);
        });
        h.hidden = ul.hidden = !m; h.textContent = h.dataset.l + " · " + m; n += m;
      });
      const c = sec.querySelector(".bsh h2 span"); if (c) c.textContent = n;
      sec.hidden = !n || (k !== "all" && sec.dataset.k !== k); if (!sec.hidden) shown++;
    });
    const none = main.querySelector(".bnone"); if (none) none.hidden = !!shown || !main.querySelector(".bsec");
    main.querySelectorAll("a.bmap").forEach(a => {   // "In person view →": In person at the same 3. When? (its distance is set by the build)
      const u = new URL(a.href); u.searchParams.set("when", w); a.href = u.pathname + u.search + u.hash;
    });
  }
  const state = () => ({ href, support: $("b-support")?.value || "all", when: $("b-when")?.value || "any",
    town: $("b-town")?.selectedOptions[0]?.textContent || "" });
  // The filter boxes' controls, after each page is put in place
  function wire({ support = "all", when } = {}) {
    load();
    if (when && [...$("b-when").options].some(o => o.value === when)) $("b-when").value = when;
    pick(support);
    $("b-support").onchange = () => { pick($("b-support").value); onChange(state()); };
    $("b-when").onchange = () => { pick($("b-support").value); onChange(state()); };
    $("b-town").onchange = () => { if ($("b-town").value) show($("b-town").value, { support: $("b-support").value }); };   // keeps Support for
    const today = hdr.querySelector(".btoday");
    if (today) today.textContent = new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  }
  // Fetch a Places page and show its filter boxes and listings here. Keeps 3. When?; starts at the top unless told the scroll.
  async function show(url, { support = "all", when = $("b-when")?.value, scroll = 0 } = {}) {
    main.classList.add("loading");
    try {
      const r = await fetch(url, { cache: "no-cache" }); if (!r.ok) throw new Error("HTTP " + r.status);
      const doc = new DOMParser().parseFromString(await r.text(), "text/html");
      main.innerHTML = doc.querySelector(".bmain").innerHTML;
      hdr.innerHTML = doc.getElementById("hdr-towns").innerHTML;
      href = new URL(url, location.href).pathname;
      wire({ support, when });
      scroller.scrollTop = scroll;
      onChange({ ...state(), title: doc.title, description: doc.querySelector('meta[name="description"]')?.content });
      return true;
    } catch (e) {
      console.error("Couldn't load", url, e);
      main.innerHTML = `<p class="bnone">Couldn't load this page just now. <a href="${esc(url)}">Open it on its own</a>, or try again in a moment.</p>`;
      return false;
    } finally { main.classList.remove("loading"); }
  }
  // Inside the listings: tap a card for its full description; Places links swap in place; other links: onLink
  main.addEventListener("click", ev => {
    const card = ev.target.closest(".card");
    if (card && !ev.target.closest("a, button")) { card.classList.toggle("open"); return; }
    const a = ev.target.closest("a"); if (!a || ev.ctrlKey || ev.metaKey || ev.shiftKey || a.target) return;
    const u = new URL(a.getAttribute("href") || "", location.href);
    if (u.origin !== location.origin) return;
    const home = PLACES_HOME();
    if (u.pathname.startsWith(home) && !u.hash) { ev.preventDefault(); show(u.pathname, { support: $("b-support")?.value }); }
    else if (onLink(u)) ev.preventDefault();
  });
  // The Places pages' folder: from the Places page's own town box (its values are the town pages' addresses)
  const PLACES_HOME = () => {
    const v = [...($("b-town")?.options || [])].map(o => o.value).find(Boolean);
    return v ? v.replace(/[^/]+\/$/, "") : href;
  };
  // A page already in place (the standalone pages): just run it
  function start(opts) { href = location.pathname; wire(opts); }
  return { show, start, pick: () => pick($("b-support").value), state };
}
