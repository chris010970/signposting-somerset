/* ---------- the Places pages: cards, the filter boxes, remembering the place, swapping towns in place ----------
   Shared code before this: schedules (core/js/schedule.js), the card (core/js/service-card.js), copy details and
   directions (core/js/cards.js), so the cards look and behave exactly as on the directory's In person tab. */
const $ = id => document.getElementById(id);
let ALL = [];   // this page's records (copy details finds them here)
(() => {
  const main = document.querySelector(".bmain"), hdr = $("hdr-towns");
  // The page's records, from the JSON the build put in it; a card's data-i is its place in that list
  function load() {
    const el = main.querySelector("#places-data");
    try { ALL = el ? shapeRecords(JSON.parse(el.textContent)) : []; } catch (_) { ALL = []; }
  }
  const byId = i => ALL.find(s => s.id === +i);
  const always = s => s.days === "Mon-Sun" && s.times === "00:00-23:59";   // 24/7: in every window
  // 3. When?: does it meet in the chosen time? (the same windows as the In person tab; no set times: only under Any time)
  function meets(s, w, now) {
    if (w === "any" || always(s)) return true;
    const win = windowFor(w, now);
    return !!win && meetsIn(s, win);
  }
  // 1. Support for: show that section, or all of them; 3. When?: only cards that meet then, each showing its session then
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
          const s = byId(li.dataset.i), ok = !!s && meets(s, w, now);   // no record: its dates have all passed since the build
          li.hidden = !ok; m += ok;
          if (ok && s) li.innerHTML = serviceCard({ s, d: +li.dataset.d, nx: nextText(s, now, from) }, "h4");
        });
        h.hidden = ul.hidden = !m; h.textContent = h.dataset.l + " · " + m; n += m;
      });
      const c = sec.querySelector(".bsh h2 span"); if (c) c.textContent = n;
      sec.hidden = !n || (k !== "all" && sec.dataset.k !== k); if (!sec.hidden) shown++;
    });
    const none = main.querySelector(".bnone"); if (none) none.hidden = !!shown || !main.querySelector(".bsec");
  }
  // This visit's place (town, Support for, When), kept in this browser tab only, so the directory's Places tab comes back to it
  const PKEY = "ss-places:" + (document.querySelector('.sitetabs a[aria-current]')?.getAttribute("href") || "");   // live and test keep their own
  const save = () => { try { sessionStorage.setItem(PKEY, JSON.stringify({ url: location.pathname + location.hash, when: $("b-when").value })); } catch (_) {} };
  const kept = () => { try { return JSON.parse(sessionStorage.getItem(PKEY) || "null"); } catch (_) { return null; } };
  function wire() {
    load();
    const k0 = kept(); if (k0 && k0.when && [...$("b-when").options].some(o => o.value === k0.when)) $("b-when").value = k0.when;
    pick(location.hash.slice(1) || "all"); save();
    $("b-support").onchange = () => {
      const k = $("b-support").value; pick(k);
      history.replaceState(history.state, "", location.pathname + (k === "all" ? "" : "#" + k)); save();
    };
    $("b-when").onchange = () => { pick($("b-support").value); save(); };
    const tl = hdr.querySelector(".btoday"); if (tl) tl.textContent = new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
    $("b-town").onchange = () => {   // 2. Where?: that town, keeping the support chosen
      const v = $("b-town").value, k = $("b-support").value;
      if (v) go(v + (k && k !== "all" ? "#" + k : ""), true);
    };
  }
  // Swap in another town's page (filters and listings), keeping its own address
  async function go(href, push) {
    main.classList.add("loading");
    try {
      const r = await fetch(href.split("#")[0], { cache: "no-cache" }); if (!r.ok) throw 0;
      const doc = new DOMParser().parseFromString(await r.text(), "text/html");
      const when = $("b-when").value;   // keep 3. When? across towns
      main.innerHTML = doc.querySelector(".bmain").innerHTML; hdr.innerHTML = doc.getElementById("hdr-towns").innerHTML; document.title = doc.title;
      $("b-when").value = when;
      const md = doc.querySelector('meta[name="description"]'); if (md) document.querySelector('meta[name="description"]')?.setAttribute("content", md.content);
      if (push) history.pushState({ b: 1 }, "", href);
      wire(); scroller.scrollTo(0, 0);
    } catch (_) { location.href = href; }
    main.classList.remove("loading");
  }
  const scroller = document.querySelector(".bw");   // the listings scroll here, under the header (as on the directory)
  main.addEventListener("click", ev => {
    // A card: tap to show its full description, as on the In person tab (links and buttons in it work as usual)
    const card = ev.target.closest(".card");
    if (card && !ev.target.closest("a, button")) { card.classList.toggle("open"); return; }
    // Links to other towns (and to the town list) swap in place too
    const a = ev.target.closest("a"); if (!a || ev.ctrlKey || ev.metaKey || ev.shiftKey || a.target) return;
    const u = new URL(a.getAttribute("href") || "", location.href), base = document.querySelector('.sitetabs a[aria-current]')?.getAttribute("href");
    if (u.origin === location.origin && base && u.pathname.startsWith(base) && !u.hash) { ev.preventDefault(); go(u.pathname, true); }
  });
  addEventListener("popstate", () => go(location.pathname + location.hash, false));
  if (main && hdr) wire();
})();
