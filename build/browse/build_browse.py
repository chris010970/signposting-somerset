"""Build the town pages (the directory's "Places" tab): a landing page and one page per town, as plain HTML that search engines can read.

    python build_browse.py path/to/services.csv          # live (out/directory/places/) and test (out/test/directory/places/)
    python build_browse.py path/to/services.csv test     # test only
    python build_browse.py                               # reads the published sheet (directory/sheet_url.txt)

Publish: copy out/directory/places/ -> docs/directory/places/, out/test/directory/places/ -> docs/test/directory/places/,
and out/sitemap.xml -> docs/sitemap.xml. They are the directory's "Places" tab.
Configuration (no code changes needed): towns.json (which towns, radius) and categories.json (sections and buttons).
The pages look and behave like one page: picking a town swaps the main area in place, but every town has its own address.
Rules kept here: only in-person services (not courses) with a place; Crisis Safe Space addresses are never in the data, so
none are shown; distances are straight lines; 'next session' is worked out in the visitor's browser, so pages never go stale
on that. Everything else is as of the build date shown on each page.
"""
import csv, datetime, html, io, json, math, pathlib, re, sys, urllib.request, zoneinfo
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "shared"))
from site_config import rebase
from core import inline_core

HERE = pathlib.Path(__file__).parent
BUILD = HERE.parent
SITE = "https://signpostingsomerset.org.uk"
args = [a for a in sys.argv[1:] if a != "test"]
ONLY_TEST = "test" in sys.argv[1:]

# ---------- inputs ----------
def read_records():
    if args:
        text = pathlib.Path(args[0]).read_text(encoding="utf-8-sig")
    else:
        url = (BUILD / "directory" / "sheet_url.txt").read_text().strip()
        text = urllib.request.urlopen(url, timeout=60).read().decode("utf-8-sig")
    return [{k.strip().lower(): (v or "").strip() for k, v in r.items() if k} for r in csv.DictReader(io.StringIO(text))]

recs = read_records()
TOWNS = json.loads((BUILD / "directory" / "towns.json").read_text(encoding="utf-8"))["TOWNS"]
CONF = json.loads((HERE / "towns.json").read_text(encoding="utf-8"))
CATS = json.loads((HERE / "categories.json").read_text(encoding="utf-8"))["categories"]
RADIUS = CONF["radius_miles"]
AREAS = [(a["area"], a["towns"]) for a in CONF["areas"]]
for _, ts in AREAS:
    for t in ts:
        assert t in TOWNS, f"{t} is not in build/directory/places.json"
NOW = datetime.datetime.now(zoneinfo.ZoneInfo("Europe/London"))
TODAY = NOW.date().isoformat()
UPDATED = f"{NOW.day} {NOW:%B %Y}"

# Shared look: the directory's own stylesheet, taken from its template at build time, so the two never drift apart.
tpl = inline_core((BUILD / "directory" / "template.html").read_text(encoding="utf-8"))   # with the shared code from build/core/
SITE_CSS = re.search(r"<style>\n(.*?)</style>", tpl, re.S).group(1)

e = lambda s: html.escape(str(s), quote=True)
slug = lambda t: re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")
split = lambda s: [x.strip() for x in s.split(";") if x.strip()]

def miles(a, b):
    r = math.pi / 180; dla = (b[0] - a[0]) * r; dlo = (b[1] - a[1]) * r
    h = math.sin(dla / 2) ** 2 + math.cos(a[0] * r) * math.cos(b[0] * r) * math.sin(dlo / 2) ** 2
    return 7917.6 * math.asin(math.sqrt(h))

def norm_date(v):   # 25/10/2026 -> 2026-10-25 (as the directory does)
    return re.sub(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b", lambda m: f"{m[3]}-{m[2].zfill(2)}-{m[1].zfill(2)}", v)

# ---------- which services ----------
SERVICES = []
for r in recs:
    if not r.get("name") or r.get("type") == "Course" or "in-person" not in split(r.get("mode", "")):
        continue
    if r.get("dates"):
        ds = re.findall(r"\d{4}-\d\d-\d\d", norm_date(r["dates"]))
        if ds and max(ds) < TODAY:
            continue   # ended
    try:
        pos, approx = (float(r["lat"]), float(r["lon"])), False
    except (KeyError, ValueError):
        if r.get("town") in TOWNS:
            pos, approx = tuple(TOWNS[r["town"]]), True   # no postcode: town centre, marked approximate
        else:
            continue
    r["_pos"], r["_approx"], r["_sf"] = pos, approx, set(split(r.get("support_for", "")))
    r["_cats"] = [c["id"] for c in CATS if r["_sf"] & set(c["tags"])]
    if r["_cats"]:
        SERVICES.append(r)

def services_for(town):
    c = TOWNS[town]; out = []
    for r in SERVICES:
        d = miles(c, r["_pos"])
        if d <= RADIUS or r.get("town") == town:
            out.append((d, r))
    out.sort(key=lambda x: (x[1].get("town") != town, x[0], x[1]["name"]))
    return out

# ---------- pieces ----------
# The directory's wording and badge colours
ACCESS = {"drop in": ("b-drop", "Just turn up"), "sign up": ("b-sign", "Contact to join"), "book": ("b-book", "Book first"), "call": ("b-ref", "Call first"), "referral": ("b-ref", "Needs a referral")}

def pattern(r):
    if r.get("days") == "Mon-Sun" and r.get("times") == "00:00-23:59":
        return "Any time"
    days = r.get("days", "").replace(";", ", ").replace("-", "–"); times = r.get("times", "").replace("-", "–")
    when = " ".join(x for x in (days, times) if x)
    f = r.get("frequency", "")
    if f and when: return f"{f} · {when}"
    return f or when or "Contact for times"

def row(d, r, town):
    local = r.get("town") == town
    # In-town cards sit under "In <town>", so they don't repeat it (a distance still shows if it's well out of the centre)
    dist = ("" if local and d < 1.5 else f"{d:.1f} mi" if d < 10 else f"{d:.0f} mi") + (" (approx.)" if r["_approx"] and not local else "")
    acc = ACCESS.get(r.get("access", ""))
    who = r.get("who", "")
    bits = [f'<span class="bwhere">{e(r.get("town") or "")}</span>' if not local else "", f"<span>{e(dist)}</span>" if dist else "",
            f'<span class="bwhen" data-days="{e(r.get("days",""))}" data-times="{e(r.get("times",""))}" data-freq="{e(r.get("frequency",""))}" data-mode="{e(r.get("mode",""))}">{e(pattern(r))}</span>']
    meta = " · ".join(b for b in bits if b)
    contact = []
    if r.get("url"): contact.append(f'<a href="{e(r["url"])}" target="_blank" rel="noopener">Website</a>')
    if r.get("phone"):
        tel = re.sub(r"[^\d+]", "", r["phone"].split(" or ")[0].split("(")[0])
        contact.append(f'<a href="tel:{e(tel)}">{e(r["phone"])}</a>' if len(tel) >= 10 else e(r["phone"]))
    if r.get("email") and ";" not in r["email"]: contact.append(f'<a href="mailto:{e(r["email"])}">{e(r["email"])}</a>')
    place = ", ".join(x for x in (r.get("address", ""), r.get("postcode", "")) if x)
    extra = []
    if who and who != "anyone": extra.append("For " + who.replace(";", ", "))
    if r.get("eligibility"): extra.append(r["eligibility"])
    if r.get("cost"): extra.append(r["cost"])
    name = f'<a href="{e(r["url"])}" target="_blank" rel="noopener">{e(r["name"])}</a>' if r.get("url") else e(r["name"])
    chip = f'<span class="badge {acc[0]}">{e(acc[1])}</span>' if acc else ""
    return (f'<li class="br"><div class="brow"><h4 class="bn">{name}</h4>{chip}</div><div class="bmeta">{meta}</div><p>{e(r.get("description",""))}</p>'
            + (f'<p class="bextra">{e(" · ".join(extra))}</p>' if extra else "")
            + (f'<p class="bplace">{e(place)}</p>' if place else "")
            + (f'<p class="bcontact">{" · ".join(contact)}</p>' if contact else "") + "</li>")

def town_options(base, current=None):
    first = "" if current else '<option value="" selected disabled>Choose a town</option>'
    return first + "".join(f'<optgroup label="{e(a)}">' + "".join(
        f'<option value="{base}{slug(t)}/"{" selected" if t == current else ""}>{e(t)}</option>' for t in sorted(ts)) + "</optgroup>" for a, ts in AREAS)

WHEN_OPTIONS = ('<option value="any" selected>Any time</option><option value="today">Today</option>'
                '<option value="evening">This evening (after 5pm)</option><option value="tomorrow">Tomorrow</option>'
                '<option value="weekend">This weekend</option><option value="week">Next 7 days</option><option value="month">Next 4 weeks</option>')

def filters(base, current=None, counts=None, total=0):
    """The filter boxes, as on the directory's In person tab: 1. Support for (with counts on a town page), 2. Where? (the town), 3. When?"""
    if counts is None: sup = ['<option value="all">All support</option>'] + [f'<option value="{c["id"]}">{e(c["label"])}</option>' for c in CATS]
    else: sup = [f'<option value="all">All support ({total})</option>'] + [f'<option value="{c["id"]}">{e(c["label"])} ({counts[c["id"]]})</option>' for c in CATS if counts[c["id"]]]
    return (f'<div id="hdr-towns"><div class="qs">'
            f'<div class="q" id="bq-support"><label for="b-support">1. Support for</label><select id="b-support">{"".join(sup)}</select></div>'
            f'<div class="q{" on" if current else ""}" id="bq-town"><label for="b-town">2. Where?</label><select id="b-town">{town_options(base, current)}</select></div>'
            f'<div class="q" id="bq-when"><label for="b-when">3. When? <span class="btoday"></span></label><select id="b-when">{WHEN_OPTIONS}</select></div>'
            f'</div></div>')

def other_towns(base, current):
    """Plain links to the other towns (for search engines, and for anyone without JavaScript)."""
    return '<p class="otowns">Other towns: ' + " · ".join(f'<a href="{base}{slug(t)}/">{e(t)}</a>' for _, ts in AREAS for t in sorted(ts) if t != current) + "</p>"

def summary(town, counts):
    parts = [f'{n} for {c["label"].lower()}' for c in CATS if (n := counts[c["id"]])]
    if not parts: return f"No in-person support is recorded within {RADIUS} miles of {town} yet."
    first = parts[0].split(" for ")
    lead = f'{first[0]} {"group or service" if first[0] == "1" else "groups and services"} for {first[1]}'
    return f"In and around {town}: {', '.join([lead] + parts[1:])}."

def town_main(town, items, dirbase, base):
    counts = {c["id"]: len({id(r) for _, r in items if c["id"] in r["_cats"]}) for c in CATS}
    total = len(items)
    secs = []
    for c in CATS:
        n = counts[c["id"]]
        if not n: continue
        inn = [row(d, r, town) for d, r in items if c["id"] in r["_cats"] and r.get("town") == town]
        near = [row(d, r, town) for d, r in items if c["id"] in r["_cats"] and r.get("town") != town]
        maplink = f'{dirbase}?' + (f'support={urllib.request.quote(c["map"])}&' if c["map"] else "") + f'town={urllib.request.quote(town)}&lat={TOWNS[town][0]}&lon={TOWNS[town][1]}&label={urllib.request.quote(town)}#near'   # town if the directory lists it, otherwise its centre
        secs.append(f'<section class="bsec" id="{c["id"]}" data-k="{c["id"]}"><div class="bsh"><h2>{e(c["label"])} <span>{n}</span></h2>'
                    f'<a class="bmap" href="{maplink}">On the map →</a></div>'
                    + (f'<h3 data-l="In {e(town)}">In {e(town)} · {len(inn)}</h3><ul class="blist">{"".join(inn)}</ul>' if inn else "")
                    + (f'<h3 data-l="Nearby">Nearby · {len(near)}</h3><ul class="blist">{"".join(near)}</ul>' if near else "") + "</section>")
    return (f'<div class="bhead"><h1 class="bt">Support in and around {e(town)}</h1>'
            f'<span>{total} free and low-cost groups and services within about {RADIUS} miles</span></div>'
            f'<p class="bnone" hidden>Nothing listed for that time. Many groups ask you to get in touch for times: try <b>Any time</b>.</p>'
            + "".join(secs) +
            f'<p class="bfoot">Also: <a href="{dirbase}#talk">phone and online support</a> you can use from anywhere. '
            f'Distances are straight lines. Please check with the service before going, as details can change. Updated {UPDATED}.</p>' + other_towns(base, town))

def load_outline():
    """All three council areas, merged from the LSOA boundaries (docs/assets/analytics-lsoa.geojson) and simplified."""
    try:
        from shapely.geometry import shape, mapping
        from shapely.ops import unary_union
        g = json.loads((BUILD.parent / "docs" / "assets" / "analytics-lsoa.geojson").read_text(encoding="utf-8"))
        u = unary_union([shape(f["geometry"]).buffer(0.0005) for f in g["features"]]).buffer(-0.0005).simplify(0.004)
        m = mapping(u); polys = m["coordinates"] if m["type"] == "MultiPolygon" else [m["coordinates"]]
        return [[[[round(x, 4), round(y, 4)] for x, y in ring] for ring in poly[:1]] for poly in polys if len(poly[0]) > 8]
    except Exception as ex:   # without shapely, fall back to the Somerset Council outline the directory uses
        print("Map outline: using somerset-outline.json (", ex, ")")
        s = json.loads((BUILD / "directory" / "somerset-outline.json").read_text(encoding="utf-8"))
        return s["coordinates"] if s["type"] == "MultiPolygon" else [s["coordinates"]]
AREA_OUTLINE = load_outline()

def area_map(base, totals):
    """A small static map: the area's outline with each town pinned and linked. Built once; no map library needed."""
    polys = AREA_OUTLINE
    pts = [p for poly in polys for ring in poly for p in ring]
    lo0, lo1 = min(p[0] for p in pts), max(p[0] for p in pts); la0, la1 = min(p[1] for p in pts), max(p[1] for p in pts)
    k = math.cos(math.radians((la0 + la1) / 2)); W = 600; H = W * (la1 - la0) / ((lo1 - lo0) * k)
    xy = lambda lo, la: ((lo - lo0) * k / ((lo1 - lo0) * k) * W, (la1 - la) / (la1 - la0) * H)
    path = " ".join("M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in (xy(*p) for p in ring)) + "Z" for poly in polys for ring in poly)
    left = {"Weston-super-Mare", "Clevedon", "Burnham-on-Sea", "Bridgwater", "Glastonbury", "Wellington", "Chard", "Minehead"}
    pins = []
    for _, ts in AREAS:
        for t in ts:
            x, y = xy(TOWNS[t][1], TOWNS[t][0]); l = t in left
            pins.append(f'<a href="{base}{slug(t)}/" aria-label="{e(t)}: {totals[t]} groups and services"><circle cx="{x:.1f}" cy="{y:.1f}" r="5.5"/>'
                        f'<text x="{x + (-9 if l else 9):.1f}" y="{y + 4:.1f}" text-anchor="{"end" if l else "start"}">{e(t)}</text></a>')
    return (f'<svg class="bmapsvg" viewBox="-70 -10 {W + 140:.0f} {H + 20:.0f}" role="img" aria-label="Map of Somerset, North Somerset and Bath and North East Somerset with the towns marked">'
            f'<path class="land" d="{path}"/>{"".join(pins)}</svg>')

def landing_main(base, dirbase, totals):
    links = " · ".join(f'<a href="{base}{slug(t)}/">{e(t)}</a>' for _, ts in AREAS for t in sorted(ts))
    return (f'<div class="bpick"><div class="bpicktxt"><h1 class="bt">Places</h1>'
            f'<p>Choose your nearest town above, or on the map, to see free and low-cost groups, activities and services in and around it, '
            f'with times, places and how to get in touch.</p>'
            f'<p class="otowns">{links}</p></div>'
            f'<div class="bmapwrap">{area_map(base, totals)}</div></div>')

PAGE_CSS = """
html, body { height: auto; } body { display: block; padding-bottom: calc(var(--footh, 56px) + 16px); }
:root { --strip: url("/assets/banner.webp"); }
/* The site name looks exactly like the directory's (there it is the page's h1; here the town heading is) */
.hero .brand { font-family: var(--serif); color: var(--b900); font-size: 24px; font-weight: 700; line-height: 1.1; margin: 0; display: flex; align-items: center; gap: 9px; text-decoration: none; }
.hero .brand .logo { height: 34px; width: auto; flex: none; margin: -2px 0 -1px; }
.bw { max-width: 1400px; margin: 0 auto; padding-top: 14px; }
/* Two cards: what to do (left), the map to choose from (right) */
.bpick { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); gap: 12px; align-items: stretch; margin-top: 4px; }
.bpick > div { background: var(--white); border: 1px solid var(--line); border-radius: 16px; padding: 24px 28px; }
.bpicktxt { align-self: start; }
.bpick .bt { margin-top: 0; } .bpick p { color: var(--muted); max-width: 52ch; } .bpick .otowns { margin-top: 14px; }
.bpick .bmapwrap { display: flex; align-items: center; justify-content: center; } .bpick .bmapsvg { max-height: calc(100vh - 380px); }
@media (max-width: 760px) { .bpick { grid-template-columns: 1fr; } .bpick > div { padding: 18px; } }
#bq-when .btoday { float: right; text-transform: none; letter-spacing: 0; color: #78716C; font-weight: 500; }
.bnone { background: var(--white); border: 1px solid var(--line); border-radius: 16px; padding: 18px 20px; color: var(--muted); margin-top: 12px; }
.otowns { font-size: 12.5px; color: var(--muted); margin-top: 10px; line-height: 1.7; } .otowns a { color: var(--b700); }
.bmain { min-width: 0; } .bmain.loading { opacity: .5; transition: opacity .15s; }
.bt { font-family: var(--serif); color: var(--b900); font-size: 22px; line-height: 1.25; margin: 4px 0 4px; }
.blead { font-size: 14px; color: var(--ink); margin: 0 0 4px; line-height: 1.5; max-width: 75ch; } .bnote { font-size: 13px; color: var(--muted); margin: 0 0 12px; } .bnote a, .bfoot a { color: var(--b700); }
.bsec { margin-top: 10px; }
.bsh { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; margin: 20px 0 2px; padding-bottom: 6px; border-bottom: 1px solid var(--line); }
.bhead { display: flex; align-items: baseline; gap: 6px 14px; flex-wrap: wrap; margin: 2px 0 6px; } .bhead .bt { margin: 0; font-size: 20px; } .bhead span { font-size: 13px; color: var(--muted); }
.bsh h2 { font-family: var(--serif); color: var(--b900); font-size: 17px; margin: 0; } .bsh h2 span { font-family: var(--sans); font-size: 12px; font-weight: 600; color: var(--muted); margin-left: 4px; } .bmap { color: var(--b700); font-weight: 600; font-size: 12.5px; }
.bsec h3 { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin: 10px 0 8px; font-family: var(--sans); }
.blist { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 12px; }
.br { background: var(--white); border-radius: 16px; padding: 14px 16px; box-shadow: 0 1px 2px rgba(0,0,0,.05); border: 1px solid var(--line); display: flex; flex-direction: column; gap: 3px; }
.brow { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
.brow .badge { flex: none; }
.chip { flex: none; font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #57534E; background: #F5F5F4; border: 1px solid var(--line); padding: 3px 7px; border-radius: 6px; }
.bn { margin: 0; font-family: var(--serif); font-size: 17px; line-height: 1.25; color: var(--b900); } .bn a { color: var(--b900); text-decoration: none; } .bn a:hover { text-decoration: underline; }
.bmeta { font-size: 12px; color: var(--muted); font-weight: 500; } .bmeta .bnext { color: var(--b700); font-weight: 600; }
.br p { margin: 4px 0 0; font-size: 13.5px; line-height: 1.45; color: var(--ink); } .br .bextra, .br .bplace { color: var(--muted); font-size: 12px; margin-top: 2px; }
.br .bcontact { font-size: 12.5px; margin-top: auto; padding-top: 8px; border-top: 1px solid var(--line); } .br .bcontact a { color: var(--b700); }
/* These pages scroll and the directory doesn't, so centring on the page width would sit everything half a scrollbar
   to the left of the directory. Centre on the window width instead, as the directory effectively does. */
.top .inner, footer .inner, .bw { margin-left: max(0px, calc((100vw - 32px - 1400px) / 2)); margin-right: auto; }
/* ...and size the header on the window width too, so the filter boxes are exactly as wide as the directory's
   (on a narrow window the header's right edge, the end of the illustration, goes under the scrollbar) */
.top .inner { width: min(1400px, calc(100vw - 32px)); max-width: none; } header.top { overflow: hidden; }
.bmapsvg { width: 100%; height: auto; display: block; } .bmapsvg .land { fill: #E1EBE5; stroke: #fff; stroke-width: 1.5; }
.bmapsvg a circle { fill: #176B55; stroke: #fff; stroke-width: 2; } .bmapsvg a text { font-size: 13px; font-weight: 600; fill: var(--b900); paint-order: stroke; stroke: #F9F9F7; stroke-width: 3px; }
.bmapsvg a:hover circle, .bmapsvg a:focus circle { fill: #14302A; r: 7; } .bmapsvg a:hover text { fill: #176B55; text-decoration: underline; }
.bmain > h2 { font-family: var(--serif); color: var(--b900); font-size: 18px; margin: 18px 0 8px; }
.bfoot { font-size: 12.5px; color: var(--muted); margin-top: 18px; }
@media (max-width: 760px) {
  .bt { font-size: 23px; } .bdir span { display: none; }
}
"""

# Next session, worked out in the browser (the same rules as the directory: blank frequency = every week;
# "1st Tue of month" style patterns; anything else stays as written). Town switching without a full reload.
PAGE_JS = r"""
(() => {
  const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"], ORD = { "1st": 1, "2nd": 2, "3rd": 3, "4th": 4 };
  const days = s => { const o = new Set(); for (const p of (s || "").split(";").map(x => x.trim()).filter(Boolean)) {
    const m = p.match(/^(\w{3})-(\w{3})$/); if (m && DOW.includes(m[1]) && DOW.includes(m[2])) { let i = DOW.indexOf(m[1]); const j = DOW.indexOf(m[2]); for (;;) { o.add(i); if (i === j) break; i = (i + 1) % 7; } }
    else if (DOW.includes(p)) o.add(DOW.indexOf(p)); } return o; };
  const nth = (d, f) => { const m = f.match(/^((?:1st|2nd|3rd|4th|last)(?: and (?:1st|2nd|3rd|4th|last))?) (\w{3}) of month$/i); if (!m) return null;
    const n = Math.ceil(d.getDate() / 7), last = new Date(d.getTime() + 7 * 864e5).getMonth() !== d.getMonth();
    return m[1].split(" and ").some(w => w.toLowerCase() === "last" ? last : ORD[w.toLowerCase()] === n); };
  const NO_SET = el => !days(el.dataset.days).size || ((el.dataset.freq || "").trim() && nth(new Date(), el.dataset.freq.trim()) === null);
  function slots(el) {   // the session's start and end, in minutes after midnight
    const t = (el.dataset.times || "").match(/^(\d\d):(\d\d)(?:-(\d\d):(\d\d))?$/);
    const start = t ? +t[1] * 60 + +t[2] : null;
    return [start, t ? (t[3] ? +t[3] * 60 + +t[4] : start + 90) : (/in-person/.test(el.dataset.mode) ? 1080 : 1439)];
  }
  function meets(el, w, now) {   // 3. When?: does it meet in the chosen time (same windows as the directory's In person tab)?
    if (w === "any") return true;
    if (el.dataset.days === "Mon-Sun" && el.dataset.times === "00:00-23:59") return true;
    if (NO_SET(el)) return false;   // no set times ("contact for times", "check dates"): only under Any time
    const ds = days(el.dataset.days), f = (el.dataset.freq || "").trim(), [start, end] = slots(el), dow = now.getDay(), mins = now.getHours() * 60 + now.getMinutes();
    const win = { today: [0, 1], evening: [0, 1], tomorrow: [1, 2], week: [0, 7], month: [0, 28],
                  weekend: dow === 6 ? [0, 2] : dow === 0 ? [0, 1] : [6 - dow, 8 - dow] }[w];
    for (let i = win[0]; i < win[1]; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      if (!ds.has(d.getDay()) || (f && !nth(d, f))) continue;
      if (i === 0 && mins >= end) continue;   // already over today
      if (w === "evening" && end <= 17 * 60) continue;
      return true;
    }
    return false;
  }
  function next(el, now) {
    const ds = days(el.dataset.days), f = (el.dataset.freq || "").trim(), t = (el.dataset.times || "").match(/^(\d\d):(\d\d)(?:-(\d\d):(\d\d))?$/);
    if (!ds.size || (f && nth(now, f) === null) || (el.dataset.days === "Mon-Sun" && el.dataset.times === "00:00-23:59")) return "";
    const endMin = t ? (t[3] ? +t[3] * 60 + +t[4] : +t[1] * 60 + +t[2] + 90) : (/in-person/.test(el.dataset.mode) ? 1080 : 1439);
    for (let i = 0; i < 70; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      if (!ds.has(d.getDay())) continue; if (f && !nth(d, f)) continue;
      if (i === 0 && now.getHours() * 60 + now.getMinutes() >= endMin) continue;
      return i === 0 ? "today" : i === 1 ? "tomorrow" : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
    }
    return "";
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
  function wire() {
    dates(main);
    pick(location.hash.slice(1) || "all");
    $("b-support").onchange = () => { const k = $("b-support").value; pick(k);
      history.replaceState(history.state, "", location.pathname + (k === "all" ? "" : "#" + k)); };
    $("b-when").onchange = () => pick($("b-support").value);
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
"""

FONTS = "\n".join(l for l in tpl.splitlines() if "fonts.g" in l)   # the directory's font links, as they are

def page(title, desc, canonical, robots, main_html, filters_html, dirbase, crumbs, base):
    ld = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": n, "item": u} for i, (n, u) in enumerate(crumbs)]}
    head_extra = (f'<link rel="canonical" href="{canonical}">\n' if canonical else "") + (robots or "")
    return rebase(f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
{head_extra}<link rel="icon" href="/favicon.ico">
{FONTS}
<script type="application/ld+json">{json.dumps(ld)}</script>
<style>
{SITE_CSS}
{PAGE_CSS}
</style>
</head>
<body>
<div class="crisis gut">
  <div><b>Crisis</b>Immediate danger or medical emergency: call <a href="tel:999">999</a> or NHS <a href="tel:111">111 (option 2)</a></div>
  <a class="exit" href="https://www.bbc.co.uk/weather" rel="noopener">Quick exit</a>
</div>
<header class="top gut">
  <div class="inner">
    <div class="masthead">
      <div class="illus" role="img" aria-label="Watercolour illustration of Somerset fields with a path, map pins and a signpost"></div>
      <div class="hero">
        <a class="brand" href="{dirbase}"><img class="logo" src="/assets/logo-signpost.webp" alt="" width="31" height="34">Signposting Somerset</a>
        <p class="lede"><span class="lg">Connecting people with local mental health and wellbeing support.</span><span class="sh">Local mental health and wellbeing support.</span></p>
      </div>
      <nav class="sitetabs" aria-label="Site"><span class="tgrp"><a class="tab" href="{dirbase}#near">In person</a><a class="tab" href="{dirbase}#talk"><span class="lg">Phone and online</span><span class="sh">Phone &amp; online</span></a><a class="tab" href="{dirbase}#course">Courses</a><a class="tab" href="{base}" aria-current="page">Places</a></span><a class="tab sep" href="{dirbase}#about">About</a><a class="tolink" href="{dirbase.replace("directory/", "tools/")}">Tools →</a></nav>
    </div>
{filters_html}
  </div>
</header>
<div class="bw gut">
<div class="bmain" role="main">
{main_html}
</div>
</div>
<footer class="help gut" id="help">
  <div class="inner">
    <div><h4 id="help-title">Always available: 24/7 helpline</h4><p>Free listening support when someone needs to talk right now.</p></div>
    <div class="lines"><a class="line" href="tel:116123" aria-label="Call Samaritans on 116 123">Samaritans<span class="num">: 116 123</span></a></div>
  </div>
</footer>
<script>
(() => {{ const f = document.getElementById("help"); const set = () => document.documentElement.style.setProperty("--footh", f.offsetHeight + "px"); set(); addEventListener("resize", set); }})();
{PAGE_JS}
</script>
</body>
</html>
""")

# ---------- build ----------
TARGETS = [("test", "/test/directory/places/", "/test/directory/", None, '<meta name="robots" content="noindex, nofollow">\n')]
if not ONLY_TEST:
    TARGETS.insert(0, ("towns", "/directory/places/", "/directory/", SITE, ""))
OUT = HERE / "out"
data = {t: services_for(t) for _, ts in AREAS for t in ts}
totals = {t: len(v) for t, v in data.items()}
for name, base, dirbase, site, robots in TARGETS:
    root = OUT / base.strip("/")
    root.mkdir(parents=True, exist_ok=True)
    canon = (lambda p: site + p) if site else (lambda p: None)
    title = "Find mental health and wellbeing support by town | Signposting Somerset"
    desc = "Free and low-cost mental health and wellbeing support across Somerset, North Somerset and Bath & North East Somerset, by town: groups, activities and services with times and contacts."
    (root / "index.html").write_text(page(title, desc, canon(base), robots, landing_main(base, dirbase, totals), filters(base), dirbase,
        [("Signposting Somerset", SITE + "/directory/"), ("Places", SITE + "/directory/places/")], base), encoding="utf-8")
    for t, items in data.items():
        counts = {c["id"]: len({id(r) for _, r in items if c["id"] in r["_cats"]}) for c in CATS}
        d = root / slug(t); d.mkdir(exist_ok=True)
        (d / "index.html").write_text(page(f"Mental health and wellbeing support in {t} | Signposting Somerset", summary(t, counts), canon(base + slug(t) + "/"), robots,
            town_main(t, items, dirbase, base), filters(base, t, counts, len(items)), dirbase,
            [("Signposting Somerset", SITE + "/directory/"), ("Places", SITE + "/directory/places/"), (t, SITE + "/directory/places/" + slug(t) + "/")], base), encoding="utf-8")
    print(f"out/{base.strip('/')}/: landing + {len(data)} towns")
if not ONLY_TEST:
    urls = [SITE + "/directory/", SITE + "/directory/places/"] + [SITE + "/directory/places/" + slug(t) + "/" for t in data]
    (OUT / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        "".join(f"  <url><loc>{u}</loc><changefreq>weekly</changefreq></url>\n" for u in urls) + "</urlset>\n", encoding="utf-8")
    print(f"out/sitemap.xml: {len(urls)} addresses")
print("Towns:", ", ".join(f"{t} {n}" for t, n in totals.items()))
