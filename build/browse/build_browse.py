"""Build the Browse pages: a landing page and one page per town, as plain HTML that search engines can read.

    python build_browse.py path/to/services.csv          # live (out/browse/) and test (out/test/browse/)
    python build_browse.py path/to/services.csv test     # test only
    python build_browse.py                               # reads the published sheet (directory/sheet_url.txt)

Publish: copy out/browse/ -> docs/browse/, out/test/browse/ -> docs/test/browse/, and out/sitemap.xml -> docs/sitemap.xml.
Configuration (no code changes needed): towns.json (which towns, radius) and categories.json (sections and buttons).
The pages look and behave like one page: picking a town swaps the main area in place, but every town has its own address.
Rules kept here: only in-person services (not courses) with a place; Crisis Safe Space addresses are never in the data, so
none are shown; distances are straight lines; 'next session' is worked out in the visitor's browser, so pages never go stale
on that. Everything else is as of the build date shown on each page.
"""
import csv, datetime, html, io, json, math, pathlib, re, sys, urllib.request, zoneinfo

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
        assert t in TOWNS, f"{t} is not in build/directory/towns.json"
NOW = datetime.datetime.now(zoneinfo.ZoneInfo("Europe/London"))
TODAY = NOW.date().isoformat()
UPDATED = f"{NOW.day} {NOW:%B %Y}"

# Shared look: the directory's own stylesheet, taken from its template at build time, so the two never drift apart.
tpl = (BUILD / "directory" / "template.html").read_text(encoding="utf-8")
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
    dist = ("in " + town if local and d < 1.5 else f"{d:.1f} mi" if d < 10 else f"{d:.0f} mi") + (" (approx.)" if r["_approx"] and not local else "")
    acc = ACCESS.get(r.get("access", ""))
    who = r.get("who", "")
    bits = [f'<span class="bwhere">{e(r.get("town") or "")}</span>' if not local else "", f"<span>{e(dist)}</span>",
            f'<span class="bwhen" data-days="{e(r.get("days",""))}" data-times="{e(r.get("times",""))}" data-freq="{e(r.get("frequency",""))}" data-mode="{e(r.get("mode",""))}">{e(pattern(r))}</span>']
    meta = " · ".join(b for b in bits if b)
    contact = []
    if r.get("url"): contact.append(f'<a href="{e(r["url"])}" rel="noopener">Website</a>')
    if r.get("phone"):
        tel = re.sub(r"[^\d+]", "", r["phone"].split(" or ")[0].split("(")[0])
        contact.append(f'<a href="tel:{e(tel)}">{e(r["phone"])}</a>' if len(tel) >= 10 else e(r["phone"]))
    if r.get("email") and ";" not in r["email"]: contact.append(f'<a href="mailto:{e(r["email"])}">{e(r["email"])}</a>')
    place = ", ".join(x for x in (r.get("address", ""), r.get("postcode", "")) if x)
    extra = []
    if who and who != "anyone": extra.append("For " + who.replace(";", ", "))
    if r.get("eligibility"): extra.append(r["eligibility"])
    if r.get("cost"): extra.append(r["cost"])
    name = f'<a href="{e(r["url"])}" rel="noopener">{e(r["name"])}</a>' if r.get("url") else e(r["name"])
    chip = f'<span class="badge {acc[0]}">{e(acc[1])}</span>' if acc else ""
    return (f'<li class="br"><div class="brow"><h4 class="bn">{name}</h4>{chip}</div><div class="bmeta">{meta}</div><p>{e(r.get("description",""))}</p>'
            + (f'<p class="bextra">{e(" · ".join(extra))}</p>' if extra else "")
            + (f'<p class="bplace">{e(place)}</p>' if place else "")
            + (f'<p class="bcontact">{" · ".join(contact)}</p>' if contact else "") + "</li>")

def town_nav(base, current=None):
    out = ['<nav class="btowns" aria-label="Towns"><a class="bh" href="' + base + '">Choose a town</a>']
    for area, ts in AREAS:
        out.append(f"<h3>{e(area)}</h3><ul>")
        for t in sorted(ts):
            on = ' class="on" aria-current="page"' if t == current else ""
            out.append(f'<li><a href="{base}{slug(t)}/"{on}>{e(t)}</a></li>')
        out.append("</ul>")
    out.append("</nav>")
    return "".join(out)

def summary(town, counts):
    parts = [f'{n} for {c["label"].lower()}' for c in CATS if (n := counts[c["id"]])]
    if not parts: return f"No in-person support is recorded within {RADIUS} miles of {town} yet."
    first = parts[0].split(" for ")
    lead = f'{first[0]} {"group or service" if first[0] == "1" else "groups and services"} for {first[1]}'
    return f"In and around {town}: {', '.join([lead] + parts[1:])}."

def town_main(town, items, dirbase):
    counts = {c["id"]: len({id(r) for _, r in items if c["id"] in r["_cats"]}) for c in CATS}
    total = len(items)
    btns = [f'<a class="on" href="#all" data-k="all">All support <span>{total}</span></a>']
    secs = []
    for c in CATS:
        n = counts[c["id"]]
        if not n: continue
        btns.append(f'<a href="#{c["id"]}" data-k="{c["id"]}">{e(c["button"])} <span>{n}</span></a>')
        inn = [row(d, r, town) for d, r in items if c["id"] in r["_cats"] and r.get("town") == town]
        near = [row(d, r, town) for d, r in items if c["id"] in r["_cats"] and r.get("town") != town]
        maplink = f'{dirbase}?' + (f'support={urllib.request.quote(c["map"])}&' if c["map"] else "") + f'town={urllib.request.quote(town)}#near'
        secs.append(f'<section class="bsec" id="{c["id"]}" data-k="{c["id"]}"><div class="bsh"><h2>{e(c["label"])} support in {e(town)}</h2>'
                    f'<a class="bmap" href="{maplink}">View on the map →</a></div>'
                    + (f'<h3>In {e(town)}</h3><ul class="blist">{"".join(inn)}</ul>' if inn else "")
                    + (f'<h3>Nearby</h3><ul class="blist">{"".join(near)}</ul>' if near else "") + "</section>")
    return (f'<div class="bcrumb"><a href="../">Find support by town</a> › {e(town)}</div>'
            f'<h1 class="bt">Mental health and wellbeing support in and around {e(town)}</h1>'
            f'<p class="bnote">{total} free and low-cost groups and services you can go to, within about {RADIUS} miles. Choose what you\'re looking for.</p>'
            f'<nav class="bbtns" aria-label="Kind of support">{"".join(btns)}</nav>' + "".join(secs) +
            f'<p class="bfoot">Also: <a href="{dirbase}#talk">phone and online support</a> you can use from anywhere. '
            f'Distances are straight lines. Please check with the service before going, as details can change. Updated {UPDATED}.</p>')

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
    cards = []
    for area, ts in AREAS:
        cards.append(f'<h2>{e(area)}</h2><ul class="bcards">' + "".join(
            f'<li><a href="{base}{slug(t)}/"><b>{e(t)}</b><span>{totals[t]}</span></a></li>' for t in sorted(ts)) + "</ul>")
    return (f'<h1 class="bt">Find mental health and wellbeing support near you</h1>'
            f'<p class="blead">Choose your nearest town to see free and low-cost groups, activities and services in and around it, '
            f'with times, places and how to get in touch.</p>'
            f'<p class="bnote">Prefer to search on a map, or by day and time? <a href="{dirbase}#near">Open the full directory</a>. '
            f'For helplines and online groups, see <a href="{dirbase}#talk">phone and online support</a>.</p>'
            + f'<div class="bland"><div class="btownlist">{"".join(cards)}</div><div class="bmapwrap">{area_map(base, totals)}</div></div>'
            + f'<p class="bfoot">Numbers show how many groups and services are in and around each town. Updated {UPDATED}. Every listing comes from the Signposting Somerset directory.</p>')

PAGE_CSS = """
html, body { height: auto; } body { display: block; padding-bottom: calc(var(--footh, 56px) + 16px); }
:root { --strip: url("/assets/banner.webp"); }
/* The site name looks exactly like the directory's (there it is the page's h1; here the town heading is) */
.hero .brand { font-family: var(--serif); color: var(--b900); font-size: 24px; font-weight: 700; line-height: 1.1; margin: 0; display: flex; align-items: center; gap: 9px; text-decoration: none; }
.hero .brand .logo { height: 34px; width: auto; flex: none; margin: -2px 0 -1px; }
/* The tab row, as the directory's */
.btabs { margin-bottom: 0; align-items: flex-end; }
.btabs a { white-space: nowrap; padding: 9px 14px 10px; font-weight: 700; font-size: 14px; color: #78716C; text-decoration: none; border-bottom: 3px solid transparent; margin-bottom: -1px; }
.btabs a:hover { color: var(--b900); }
.btabs a[aria-current] { color: var(--b900); border-bottom-color: var(--b600); }
.bw { max-width: 1400px; margin: 0 auto; display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 28px; padding-top: 18px; }
.btowns { position: sticky; top: 12px; align-self: start; max-height: calc(100vh - var(--footh, 56px) - 24px); overflow-y: auto; }
.btowns .bh { display: block; font-weight: 700; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); text-decoration: none; margin: 2px 0 6px; }
.btowns h3 { font-size: 12px; font-weight: 700; color: var(--b900); margin: 12px 0 2px; font-family: var(--sans); }
.btowns ul { list-style: none; margin: 0; padding: 0; }
.btowns li a { display: block; padding: 4px 10px; border-radius: 8px; color: var(--ink); text-decoration: none; font-size: 14px; }
.btowns li a:hover { background: var(--b50); } .btowns li a.on { background: var(--b100); color: var(--b900); font-weight: 600; }
.bmain { min-width: 0; } .bmain.loading { opacity: .5; transition: opacity .15s; }
.bcrumb { font-size: 12px; color: var(--muted); } .bcrumb a { color: var(--b700); }
.bt { font-family: var(--serif); color: var(--b900); font-size: 22px; line-height: 1.25; margin: 4px 0 4px; }
.blead { font-size: 14px; color: var(--ink); margin: 0 0 4px; line-height: 1.5; max-width: 75ch; } .bnote { font-size: 13px; color: var(--muted); margin: 0 0 12px; } .bnote a, .bfoot a { color: var(--b700); }
.bbtns { display: flex; gap: 6px; flex-wrap: wrap; margin: 0 0 4px; }
.bbtns a { border: 1px solid var(--line); background: #fff; color: var(--ink); border-radius: 999px; padding: 5px 12px; font-size: 13px; font-weight: 600; text-decoration: none; }
.bbtns a:hover { border-color: var(--b200); }
.bbtns a span { font-weight: 500; color: var(--muted); font-size: 12px; margin-left: 2px; }
.bbtns a.on { background: var(--b700); border-color: var(--b700); color: #fff; } .bbtns a.on span { color: var(--b100); }
.bsec { margin-top: 10px; }
.bsh { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; margin: 18px 0 4px; }
.bsh h2 { font-family: var(--serif); color: var(--b900); font-size: 18px; margin: 0; } .bmap { color: var(--b700); font-weight: 600; font-size: 12.5px; }
.bsec h3 { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin: 12px 0 8px; font-family: var(--sans); }
.blist { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 12px; }
.br { background: var(--white); border-radius: 16px; padding: 14px 16px; box-shadow: 0 1px 2px rgba(0,0,0,.05); border: 1px solid var(--line); display: flex; flex-direction: column; gap: 3px; }
.brow { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
.brow .badge { flex: none; }
.chip { flex: none; font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #57534E; background: #F5F5F4; border: 1px solid var(--line); padding: 3px 7px; border-radius: 6px; }
.bn { margin: 0; font-family: var(--serif); font-size: 17px; line-height: 1.25; color: var(--b900); } .bn a { color: var(--b900); text-decoration: none; } .bn a:hover { text-decoration: underline; }
.bmeta { font-size: 12px; color: var(--muted); font-weight: 500; } .bmeta .bnext { color: var(--b700); font-weight: 600; }
.br p { margin: 4px 0 0; font-size: 13.5px; line-height: 1.45; color: var(--ink); } .br .bextra, .br .bplace { color: var(--muted); font-size: 12px; margin-top: 2px; }
.br .bcontact { font-size: 12.5px; margin-top: auto; padding-top: 8px; border-top: 1px solid var(--line); } .br .bcontact a { color: var(--b700); }
.bw.nolist { grid-template-columns: minmax(0, 1fr); }
/* These pages scroll and the directory doesn't, so centring on the page width would sit everything half a scrollbar
   to the left of the directory. Centre on the window width instead, as the directory effectively does. */
.top .inner, footer .inner, .bw { margin-left: max(0px, calc((100vw - 32px - 1400px) / 2)); margin-right: auto; }
.bland { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr); gap: 28px; align-items: start; margin-top: 8px; }
.bmapsvg { width: 100%; height: auto; display: block; } .bmapsvg .land { fill: #E1EBE5; stroke: #fff; stroke-width: 1.5; }
.bmapsvg a circle { fill: #176B55; stroke: #fff; stroke-width: 2; } .bmapsvg a text { font-size: 13px; font-weight: 600; fill: var(--b900); paint-order: stroke; stroke: #F9F9F7; stroke-width: 3px; }
.bmapsvg a:hover circle, .bmapsvg a:focus circle { fill: #14302A; r: 7; } .bmapsvg a:hover text { fill: #176B55; text-decoration: underline; }
.btownlist h2 { font-family: var(--serif); color: var(--b900); font-size: 17px; margin: 0 0 8px; } .btownlist h2 ~ h2 { margin-top: 16px; }
.bcards { list-style: none; padding: 0; margin: 0; columns: 2; column-gap: 28px; }
.bcards li { break-inside: avoid; border-bottom: 1px solid var(--line); }
.bcards a { display: flex; justify-content: space-between; align-items: baseline; padding: 6px 4px; text-decoration: none; color: var(--b900); }
.bcards a:hover b { text-decoration: underline; color: #176B55; } .bcards b { font-size: 14px; font-weight: 600; } .bcards span { font-size: 12.5px; color: var(--muted); }
.bmain > h2 { font-family: var(--serif); color: var(--b900); font-size: 18px; margin: 18px 0 8px; }
.bfoot { font-size: 12.5px; color: var(--muted); margin-top: 18px; }
.btownsel { display: none; }
@media (max-width: 760px) {
  .bw { grid-template-columns: 1fr; gap: 6px; } .btowns { display: none; } .bland { grid-template-columns: 1fr; } .bmapwrap { order: 2; } .bcards { columns: 1; }
  .btownsel { display: block; margin: 6px 0 10px; } .btownsel label { font-size: 12px; font-weight: 600; color: var(--muted); display: block; margin-bottom: 4px; }
  .btownsel select { width: 100%; padding: 10px; border-radius: 10px; border: 1px solid var(--b200); font-size: 16px; background: #fff; }
  .bbtns { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; } .bbtns a { flex: none; } .bt { font-size: 23px; } .bdir span { display: none; }
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
  function pick(root, k) {
    const ok = [...root.querySelectorAll(".bbtns a")].some(a => a.dataset.k === k); if (!ok) k = "all";
    root.querySelectorAll(".bbtns a").forEach(a => a.classList.toggle("on", a.dataset.k === k));
    root.querySelectorAll(".bsec").forEach(s => s.hidden = k !== "all" && s.dataset.k !== k);
  }
  function wire(root) {
    dates(root);
    const s = root.querySelector(".btownsel select"); if (s) s.onchange = () => { if (s.value) go(s.value, true); };
    const bb = root.querySelector(".bbtns"); if (!bb) return;
    pick(root, location.hash.slice(1) || "all");
    bb.onclick = ev => { const a = ev.target.closest("a"); if (!a) return; ev.preventDefault(); pick(root, a.dataset.k);
      history.replaceState(history.state, "", a.dataset.k === "all" ? location.pathname : "#" + a.dataset.k); };
  }
  const main = document.querySelector(".bmain"), nav = document.querySelector(".btowns");
  async function go(href, push) {   // swap the main area for another town's page, keeping its own address
    main.classList.add("loading");
    try {
      const r = await fetch(href, { cache: "no-cache" }); if (!r.ok) throw 0;
      const doc = new DOMParser().parseFromString(await r.text(), "text/html");
      if (!nav || !doc.querySelector(".btowns")) { location.href = href; return; }   // the landing page has its own layout
      main.innerHTML = doc.querySelector(".bmain").innerHTML; document.title = doc.title;
      const md = doc.querySelector('meta[name="description"]'); if (md) document.querySelector('meta[name="description"]')?.setAttribute("content", md.content);
      nav.querySelectorAll("a.on").forEach(a => { a.classList.remove("on"); a.removeAttribute("aria-current"); });
      const cur = nav.querySelector(`li a[href="${new URL(href, location.href).pathname}"]`); if (cur) { cur.classList.add("on"); cur.setAttribute("aria-current", "page"); }
      if (push) history.pushState({ b: 1 }, "", href); wire(main); window.scrollTo(0, 0);
    } catch (_) { location.href = href; }
    main.classList.remove("loading");
  }
  if (nav) nav.addEventListener("click", ev => { const a = ev.target.closest("a"); if (!a || ev.ctrlKey || ev.metaKey || ev.shiftKey) return; ev.preventDefault(); go(a.href, true); });
  addEventListener("popstate", () => go(location.pathname, false));
  if (main) wire(main);
})();
"""

FONTS = "\n".join(l for l in tpl.splitlines() if "fonts.g" in l)   # the directory's font links, as they are

def page(title, desc, canonical, robots, main_html, nav_html, sel_html, dirbase, crumbs, base):
    ld = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": n, "item": u} for i, (n, u) in enumerate(crumbs)]}
    head_extra = (f'<link rel="canonical" href="{canonical}">\n' if canonical else "") + (robots or "")
    return f"""<!doctype html>
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
      <nav class="sitetabs btabs" aria-label="Site"><a href="{dirbase}#near">← Full directory</a><a href="{base}" aria-current="page">Support by town</a></nav>
    </div>
  </div>
</header>
<div class="bw gut{'' if nav_html else ' nolist'}">
{nav_html}
<div class="bmain" role="main">
{sel_html}
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
"""

def town_select(base, current):
    opts = "".join(f'<optgroup label="{e(a)}">' + "".join(
        f'<option value="{base}{slug(t)}/"{" selected" if t == current else ""}>{e(t)}</option>' for t in sorted(ts)) + "</optgroup>" for a, ts in AREAS)
    first = "" if current else '<option value="" selected disabled>Choose a town</option>'
    return f'<div class="btownsel"><label for="btown">Town</label><select id="btown">{first}{opts}</select></div>'

# ---------- build ----------
TARGETS = [("test", "/test/browse/", "/test/", None, '<meta name="robots" content="noindex, nofollow">\n')]
if not ONLY_TEST:
    TARGETS.insert(0, ("browse", "/browse/", "/directory/", SITE, ""))
OUT = HERE / "out"
data = {t: services_for(t) for _, ts in AREAS for t in ts}
totals = {t: len(v) for t, v in data.items()}
for name, base, dirbase, site, robots in TARGETS:
    root = OUT / base.strip("/")
    root.mkdir(parents=True, exist_ok=True)
    canon = (lambda p: site + p) if site else (lambda p: None)
    title = "Find mental health and wellbeing support by town | Signposting Somerset"
    desc = "Free and low-cost mental health and wellbeing support across Somerset, North Somerset and Bath & North East Somerset, by town: groups, activities and services with times and contacts."
    (root / "index.html").write_text(page(title, desc, canon(base), robots, landing_main(base, dirbase, totals), "", "", dirbase,
        [("Signposting Somerset", SITE + "/directory/"), ("Find support by town", SITE + "/browse/")], base), encoding="utf-8")
    for t, items in data.items():
        counts = {c["id"]: len({id(r) for _, r in items if c["id"] in r["_cats"]}) for c in CATS}
        d = root / slug(t); d.mkdir(exist_ok=True)
        (d / "index.html").write_text(page(f"Mental health and wellbeing support in {t} | Signposting Somerset", summary(t, counts), canon(base + slug(t) + "/"), robots,
            town_main(t, items, dirbase), town_nav(base, t), town_select(base, t), dirbase,
            [("Signposting Somerset", SITE + "/directory/"), ("Find support by town", SITE + "/browse/"), (t, SITE + "/browse/" + slug(t) + "/")], base), encoding="utf-8")
    print(f"out/{base.strip('/')}/: landing + {len(data)} towns")
if not ONLY_TEST:
    urls = [SITE + "/directory/", SITE + "/browse/"] + [SITE + "/browse/" + slug(t) + "/" for t in data]
    (OUT / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        "".join(f"  <url><loc>{u}</loc><changefreq>weekly</changefreq></url>\n" for u in urls) + "</urlset>\n", encoding="utf-8")
    print(f"out/sitemap.xml: {len(urls)} addresses")
print("Towns:", ", ".join(f"{t} {n}" for t, n in totals.items()))
