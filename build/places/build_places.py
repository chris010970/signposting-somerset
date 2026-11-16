"""Build the town pages (the directory's "Places" tab): a landing page and one page per town, as plain HTML that search engines can read.

    python build_places.py path/to/services.csv          # live (out/directory/places/) and test (out/test/directory/places/)
    python build_places.py path/to/services.csv test     # test only
    python build_places.py                               # reads the published sheet (directory/sheet_url.txt)

Publish: copy out/directory/places/ -> docs/directory/places/, out/test/directory/places/ -> docs/test/directory/places/,
and out/sitemap.xml -> docs/sitemap.xml. They are the directory's "Places" tab.
Configuration (no code changes needed): towns.json (which towns, radius) and categories.json (sections).
The page styles and script are places.css and places.js; the rest of the look comes from build/core/ and the directory's template.
The pages look and behave like one page: picking a town swaps the main area in place, but every town has its own address.
Rules kept here: only in-person services (not courses) with a place; Crisis Safe Space addresses are never in the data, so
none are shown; distances are straight lines; 'next session' is worked out in the visitor's browser, so pages never go stale
on that. Everything else is as of the build date shown on each page.
"""
import html, json, math, pathlib, re, sys, urllib.parse
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "shared"))
from core import inline_core
from page import LIVE as SITE, NOINDEX, NOW, STAMP
from records import read_records, web_url
from site_config import rebase

HERE = pathlib.Path(__file__).resolve().parent
BUILD = HERE.parent
args = [a for a in sys.argv[1:] if a != "test"]
ONLY_TEST = "test" in sys.argv[1:]

# ---------- inputs ----------
recs = read_records(args[0] if args else None)   # dates and times cleaned up as the directory does
TOWNS = json.loads((BUILD / "directory" / "towns.json").read_text(encoding="utf-8"))["TOWNS"]
CONF = json.loads((HERE / "towns.json").read_text(encoding="utf-8"))
CATS = json.loads((HERE / "categories.json").read_text(encoding="utf-8"))["categories"]
RADIUS = CONF["radius_miles"]
AREAS = [(a["area"], a["towns"]) for a in CONF["areas"]]
for _, ts in AREAS:
    for t in ts:
        assert t in TOWNS, f"{t} (places/towns.json) has no centre in build/directory/towns.json"
LABEL_LEFT = set(CONF.get("label_left", []))   # towns whose name sits left of the pin on the landing page's map
TODAY = NOW.date().isoformat()
UPDATED = f"{NOW.day} {NOW:%B %Y}"

# Shared look: the directory's own stylesheet, taken from its template at build time, so the two never drift apart.
tpl = inline_core((BUILD / "directory" / "template.html").read_text(encoding="utf-8"), BUILD / "directory")   # with its shared and own code
SITE_CSS = re.search(r"<style>\n(.*?)</style>", tpl, re.S).group(1)

e = lambda s: html.escape(str(s), quote=True)
slug = lambda t: re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")
split = lambda s: [x.strip() for x in s.split(";") if x.strip()]

def miles(a, b):
    r = math.pi / 180; dla = (b[0] - a[0]) * r; dlo = (b[1] - a[1]) * r
    h = math.sin(dla / 2) ** 2 + math.cos(a[0] * r) * math.cos(b[0] * r) * math.sin(dlo / 2) ** 2
    return 7917.6 * math.asin(math.sqrt(h))

# ---------- which services ----------
SERVICES = []
for r in recs:
    if not r.get("name") or r.get("type") == "Course" or "in-person" not in split(r.get("mode", "")):
        continue
    if r.get("dates"):
        ds = re.findall(r"\d{4}-\d\d-\d\d", r["dates"])
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

# Cards: the build writes a plain version of the directory's In person card (what search engines, and anyone without
# JavaScript, see); in the browser each is redrawn by the directory's own card code (build/core/js/service-card.js), which
# adds the kind of service, the next session, Copy details and Directions, from the page's records (PAGE_FIELDS below).
PAGE_FIELDS = ["name", "provider", "type", "access", "support_for", "mode", "url", "description", "who", "eligibility", "days", "times",
               "frequency", "dates", "address", "town", "postcode", "phone", "email", "cost", "area", "lat", "lon"]

def card(d, r, i):
    """The plain card for record number i on the page, d miles from the town centre."""
    acc = ACCESS.get(r.get("access", ""), ("b-ref", "Contact provider"))
    chips = f'<span class="chip dist">{"<0.1" if d < .1 else f"{d:.1f}"} mi{" approx." if r["_approx"] else ""}</span>'
    if r.get("cost"): chips += f'<span class="chip">{e(r["cost"])}</span>'
    contact = []
    url = web_url(r.get("url"))
    if url: contact.append(f'<a href="{e(url)}" target="_blank" rel="noopener">Website</a>')
    if r.get("phone"):
        tel = re.sub(r"[^\d+]", "", r["phone"].split(" (")[0].split(" or ")[0].split(";")[0])
        contact.append(f'<a href="tel:{e(tel)}">{e(r["phone"])}</a>' if len(tel) >= 5 and not r["phone"].lower().startswith("text") else e(r["phone"]))
    if r.get("email"): contact.append(f'<a href="mailto:{e(r["email"].split(";")[0].strip())}">{e(r["email"])}</a>')
    place = e(", ".join(x for x in (r.get("address", ""), r.get("town", ""), r.get("postcode", "")) if x))
    who = (f'<div class="who">For: {e(r.get("who", ""))}' + (f' · <em>{e(r["eligibility"])}</em>' if r.get("eligibility") else "") + "</div>"
           if r.get("who") or r.get("eligibility") else "")
    return (f'<li data-i="{i}" data-d="{d:.3f}"><article class="card" data-id="{i}">'
            f'<div class="row1"><span class="badge {acc[0]}">{e(acc[1])}</span><span class="chipr">{chips}</span></div>'
            f'<h4 class="cname">{e(r["name"])}</h4><div class="meta">{e(r.get("provider", ""))} · {e(r.get("type", ""))}</div>'
            f'<div class="next"><div class="lab">When</div><div class="val">{e(pattern(r))}</div></div>'
            f'<p class="desc">{e(r.get("description", ""))}</p>{who}'
            f'<div class="foot"><span>{place}</span>' + (f'<span>{" · ".join(contact)}</span>' if contact else "") + '</div></article></li>')

def page_data(items):
    """The page's records, for the browser (as <script type="application/json">: never run, and safe from </script> in a value)."""
    data = json.dumps([{k: r.get(k, "") for k in PAGE_FIELDS} for _, r in items], ensure_ascii=False, separators=(",", ":"))
    data = data.replace("</", "<\\/")
    return f'<script type="application/json" id="places-data">{data}</script>'

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
        inn = [card(d, r, i) for i, (d, r) in enumerate(items) if c["id"] in r["_cats"] and r.get("town") == town]
        near = [card(d, r, i) for i, (d, r) in enumerate(items) if c["id"] in r["_cats"] and r.get("town") != town]
        maplink = f'{dirbase}?' + (f'support={urllib.parse.quote(c["map"])}&' if c["map"] else "") + f'town={urllib.parse.quote(town)}&lat={TOWNS[town][0]}&lon={TOWNS[town][1]}&label={urllib.parse.quote(town)}#near'   # town if the directory lists it, otherwise its centre
        secs.append(f'<section class="bsec" id="{c["id"]}" data-k="{c["id"]}"><div class="bsh"><h2>{e(c["label"])} <span>{n}</span></h2>'
                    f'<a class="bmap" href="{maplink}">On the map →</a></div>'
                    + (f'<h3 class="vh" data-l="In {e(town)}">In {e(town)} · {len(inn)}</h3><ul class="blist">{"".join(inn)}</ul>' if inn else "")   # (the page heading already names the town: label for screen readers only)
                    + (f'<h3 data-l="Nearby">Nearby · {len(near)}</h3><ul class="blist">{"".join(near)}</ul>' if near else "") + "</section>")
    return (f'<div class="bhead"><h1 class="bt">Support in and around {e(town)}</h1>'
            f'<span>{total} free and low-cost groups and services within about {RADIUS} miles</span></div>'
            f'<p class="bnone" hidden>Nothing listed for that time. Many groups ask you to get in touch for times: try <b>Any time</b>.</p>'
            + "".join(secs) +
            f'<p class="bfoot">Also: <a href="{dirbase}#talk">phone and online support</a> you can use from anywhere. '
            f'Distances are straight lines. Please check with the service before going, as details can change. Updated {UPDATED}.</p>' + other_towns(base, town)
            + '<p class="otowns">Version: {VERSION}</p>' + page_data(items))

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
    pins = []
    for _, ts in AREAS:
        for t in ts:
            x, y = xy(TOWNS[t][1], TOWNS[t][0]); l = t in LABEL_LEFT
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
            f'<div class="bmapwrap">{area_map(base, totals)}</div></div>'
            f'<p class="otowns">Version: {{VERSION}}</p>')

PAGE_CSS = (HERE / "places.css").read_text(encoding="utf-8")

# The page script: next session and 3. When? (worked out in the browser with the directory's schedule rules, from
# build/core/js/schedule.js), the filter boxes, remembering the place for the visit, and swapping towns without a full reload.
# The crisis bar and the helpline bar are the directory's (build/core/html/).
PAGE_JS = inline_core("\n".join(["/*@core:js/helpline-height.js*/", "/*@core:js/text.js*/", "/*@core:js/schedule.js*/",
    "/*@core:js/records.js*/", "/*@core:js/kinds.js*/", "/*@core:js/cards.js*/", "/*@core:js/service-card.js*/",
    "const TOWNS = " + json.dumps(TOWNS, ensure_ascii=False) + ";   // town centres, for records with no postcode",
    "/*@page:places.js*/", ""]), HERE)
CRISIS, HELPLINE = (inline_core(f"<!--@core:html/{n}.html-->\n") for n in ("crisis", "helpline"))

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
{CRISIS}<header class="top gut">
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
<span id="copy-live" role="status" aria-live="polite" class="vh"></span>
<div class="bw gut">
<div class="bmain" role="main">
{main_html}
</div>
</div>
{HELPLINE}<script>
{PAGE_JS}
</script>
</body>
</html>
""")

# ---------- build ----------
TARGETS = [("test", "/test/directory/places/", "/test/directory/", None, NOINDEX + "\n")]
if not ONLY_TEST:
    TARGETS.insert(0, ("towns", "/directory/places/", "/directory/", SITE, ""))
OUT = HERE / "out"
data = {t: services_for(t) for _, ts in AREAS for t in ts}
totals = {t: len(v) for t, v in data.items()}
for name, base, dirbase, site, robots in TARGETS:
    root = OUT / base.strip("/")
    root.mkdir(parents=True, exist_ok=True)
    canon = (lambda p: site + p) if site else (lambda p: None)
    # Titles start "Signposting Somerset", like the directory's and the tools page's, so the browser tabs match;
    # the rest keeps what people search for (town, "mental health and wellbeing support"). Test copies say so.
    test = " (test)" if name == "test" else ""
    ver = ("test " if name == "test" else "places ") + STAMP
    title = f"Signposting Somerset: places{test}"
    desc = "Free and low-cost mental health and wellbeing support across Somerset, North Somerset and Bath & North East Somerset, by town: groups, activities and services with times and contacts."
    (root / "index.html").write_text(page(title, desc, canon(base), robots, landing_main(base, dirbase, totals), filters(base), dirbase,
        [("Signposting Somerset", SITE + "/directory/"), ("Places", SITE + "/directory/places/")], base).replace("{VERSION}", ver), encoding="utf-8")
    for t, items in data.items():
        counts = {c["id"]: len({id(r) for _, r in items if c["id"] in r["_cats"]}) for c in CATS}
        d = root / slug(t); d.mkdir(exist_ok=True)
        (d / "index.html").write_text(page(f"Signposting Somerset: mental health and wellbeing support in {t}{test}", summary(t, counts), canon(base + slug(t) + "/"), robots,
            town_main(t, items, dirbase, base), filters(base, t, counts, len(items)), dirbase,
            [("Signposting Somerset", SITE + "/directory/"), ("Places", SITE + "/directory/places/"), (t, SITE + "/directory/places/" + slug(t) + "/")], base).replace("{VERSION}", ver), encoding="utf-8")
    print(f"out/{base.strip('/')}/: landing + {len(data)} towns")
if not ONLY_TEST:
    urls = [SITE + "/directory/", SITE + "/directory/places/"] + [SITE + "/directory/places/" + slug(t) + "/" for t in data]
    (OUT / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        "".join(f"  <url><loc>{u}</loc><changefreq>weekly</changefreq></url>\n" for u in urls) + "</urlset>\n", encoding="utf-8")
    print(f"out/sitemap.xml: {len(urls)} addresses")
print("Towns:", ", ".join(f"{t} {n}" for t, n in totals.items()))
