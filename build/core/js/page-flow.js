// One scrolling page or a fixed header (the directory and the Places pages; core/css/page.css)
// Usually the header and filters stay put and only the results scroll. On phones and narrow windows, and wherever the header
// would leave the results under 40% of the screen's height (a laptop zoomed in, a phone on its side), the whole page scrolls
// instead (class "flow" on <html>), so the results always get the screen. On very short screens the helpline bar sits at the
// end of the page rather than over the content (class "short"). Every tab's header is the same height on wide screens
// (the alignment tests), so all tabs make the same choice.
const pageFlows = () => document.documentElement.classList.contains("flow");
const scrollerFor = el => pageFlows() ? document.scrollingElement : el;   // what scrolls a panel's content now
(() => {
  const root = document.documentElement, header = document.querySelector("header.top"), help = document.getElementById("help");
  const fit = () => {
    const room = innerHeight - (header.offsetTop + header.offsetHeight) - (help ? help.offsetHeight : 0);
    root.classList.toggle("flow", innerWidth < 900 || room < 0.4 * innerHeight);
    root.classList.toggle("short", innerHeight < 500);
  };
  fit(); addEventListener("resize", fit);
  if (window.ResizeObserver) new ResizeObserver(fit).observe(header);   // the filter boxes change with the tab
})();
