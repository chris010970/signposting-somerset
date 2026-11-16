
(() => {
  // Schedules use the directory's own rules (build/core/js/schedule.js, included before this script):
  // blank frequency = every week, "1st Tue of month" style patterns, dated events; anything else has no set times.
  const rec = el => withSchedule({ days: el.dataset.days, times: el.dataset.times, frequency: el.dataset.freq, mode: el.dataset.mode,
    dates: el.dataset.dates, access: el.dataset.access, type: el.dataset.type });
  const always = el => el.dataset.days === "Mon-Sun" && el.dataset.times === "00:00-23:59";   // 24/7: no "next", and in every window
  function meets(el, w, now) {   // 3. When?: does it meet in the chosen time? (the same windows as the directory's In person tab)
    if (w === "any" || always(el)) return true;
    const win = windowFor(w, now);
    return !!win && meetsIn(rec(el), win);   // no set times ("contact for times", "check dates"): only under Any time
  }
  function next(el, now) {   // "today", "tomorrow" or the date of the next session
    if (always(el)) return "";
    const o = occurrences(rec(el), now, 70).find(x => x.en > now); if (!o) return "";
    const dd = Math.round((dayStart(o.st) - dayStart(now)) / 864e5);
    return dd === 0 ? "today" : dd === 1 ? "tomorrow" : o.st.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  }
  function dates(root) { const now = new Date(); root.querySelectorAll(".bwhen").forEach(el => { const n = next(el, now); if (n && !el.nextElementSibling?.classList.contains("bnext")) el.insertAdjacentHTML("afterend", ` · <span class="bnext">Next: ${n}</span>`); }); }
  const $ = id => document.getElementById(id);
  function pick(k) {   // 1. Support for: show that section, or all of them; 3. When?: only cards that meet then
    const sel = $("b-support"); if (!sel) return;
    if (![...sel.options].some(o => o.value === k)) k = "all";
    sel.value = k; $("bq-support").classList.toggle("on", k !== "all");
    const w = $("b-when").value, now = new Date(); $("bq-when").classList.toggle("on", w !== "any");
    let shown = 0;
    main.querySelectorAll(".bsec").forEach(s => {
      let n = 0;
      s.querySelectorAll("h3").forEach(h => {
        const ul = h.nextElementSibling; let m = 0;
        ul.querySelectorAll(".br").forEach(c => { const ok = meets(c.querySelector(".bwhen"), w, now); c.hidden = !ok; m += ok; });
        h.hidden = ul.hidden = !m; h.textContent = h.dataset.l + " · " + m; n += m;
      });
      const c = s.querySelector(".bsh h2 span"); if (c) c.textContent = n;
      s.hidden = !n || (k !== "all" && s.dataset.k !== k); if (!s.hidden) shown++;
    });
    const none = main.querySelector(".bnone"); if (none) none.hidden = !!shown || !main.querySelector(".bsec");
  }
  // This visit's place (town, Support for, When), kept in this browser tab only, so the directory's Places tab comes back to it
  const PKEY = "ss-places:" + (document.querySelector('.sitetabs a[aria-current]')?.getAttribute("href") || "");   // live and test keep their own
  const save = () => { try { sessionStorage.setItem(PKEY, JSON.stringify({ url: location.pathname + location.hash, when: $("b-when").value })); } catch (_) {} };
  const kept = () => { try { return JSON.parse(sessionStorage.getItem(PKEY) || "null"); } catch (_) { return null; } };
  function wire() {
    dates(main);
    const k0 = kept(); if (k0 && k0.when && [...$("b-when").options].some(o => o.value === k0.when)) $("b-when").value = k0.when;
    pick(location.hash.slice(1) || "all"); save();
    $("b-support").onchange = () => { const k = $("b-support").value; pick(k);
      history.replaceState(history.state, "", location.pathname + (k === "all" ? "" : "#" + k)); save(); };
    $("b-when").onchange = () => { pick($("b-support").value); save(); };
    const tl = hdr.querySelector(".btoday"); if (tl) tl.textContent = new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
    $("b-town").onchange = () => { const v = $("b-town").value, k = $("b-support").value;   // 2. Where?: that town, keeping the support chosen
      if (v) go(v + (k && k !== "all" ? "#" + k : ""), true); };
  }
  const main = document.querySelector(".bmain"), hdr = $("hdr-towns");
  async function go(href, push) {   // swap in another town's page (filters and listings), keeping its own address
    main.classList.add("loading");
    try {
      const r = await fetch(href.split("#")[0], { cache: "no-cache" }); if (!r.ok) throw 0;
      const doc = new DOMParser().parseFromString(await r.text(), "text/html");
      const when = $("b-when").value;   // keep 3. When? across towns
      main.innerHTML = doc.querySelector(".bmain").innerHTML; hdr.innerHTML = doc.getElementById("hdr-towns").innerHTML; document.title = doc.title;
      $("b-when").value = when;
      const md = doc.querySelector('meta[name="description"]'); if (md) document.querySelector('meta[name="description"]')?.setAttribute("content", md.content);
      if (push) history.pushState({ b: 1 }, "", href); wire(); window.scrollTo(0, 0);
    } catch (_) { location.href = href; }
    main.classList.remove("loading");
  }
  main.addEventListener("click", ev => {   // links to other towns (and to the town list) swap in place too
    const a = ev.target.closest("a"); if (!a || ev.ctrlKey || ev.metaKey || ev.shiftKey || a.target) return;
    const u = new URL(a.getAttribute("href") || "", location.href), base = document.querySelector('.sitetabs a[aria-current]')?.getAttribute("href");
    if (u.origin === location.origin && base && u.pathname.startsWith(base) && !u.hash) { ev.preventDefault(); go(u.pathname, true); }
  });
  addEventListener("popstate", () => go(location.pathname + location.hash, false));
  if (main && hdr) wire();
})();
