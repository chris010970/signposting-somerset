// Keep the map and list clear of the fixed helpline bar, whatever its height
(() => { const f = document.getElementById("help"); const set = () => document.documentElement.style.setProperty("--footh", f.offsetHeight + "px");
  set(); if (window.ResizeObserver) new ResizeObserver(set).observe(f); else addEventListener("resize", set); })();
