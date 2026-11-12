"""Build the support map page from services.csv.

Usage: python build.py ../services-update/services.csv
Writes index.html (for publishing) and signposting-somerset.html (standalone file you can open directly).
"""
import csv, json, re, sys, pathlib

HERE = pathlib.Path(__file__).parent
SRC = sys.argv[1] if len(sys.argv) > 1 else str(HERE.parent / "services-update" / "services.csv")
LEAFLET_CSS = HERE / "leaflet.css"

# Town-centre coordinates (fallback pin when a record has no lat/lon). Taken from the previous build.
if (HERE / "towns.json").exists():   # kept in the repo so the build doesn't depend on a previous build
    _t = json.loads((HERE / "towns.json").read_text(encoding="utf-8")); TOWNS, APPROX = _t["TOWNS"], _t["APPROX_TOWNS"]
else:
    prev = (HERE / "index.html").read_text(encoding="utf-8")
    TOWNS = json.loads(re.search(r"const TOWNS = (\{.*?\});", prev).group(1))
    APPROX = json.loads(re.search(r"const APPROX_TOWNS = (\[.*?\]);", prev).group(1))
# Villages added with the health walks: approximate village centres.
NEW_TOWNS = {"Edington": [51.162, -2.885], "Ruishton": [51.017, -3.055], "Steart": [51.203, -3.046],
             "Stoke-sub-Hamdon": [50.953, -2.749], "Wedmore": [51.227, -2.811], "Westhay": [51.183, -2.783], "Nailsea": [51.432, -2.757],
             # Added 4 Nov 2026 for North Somerset / B&NES / west Somerset records (approximate centres)
             "Backwell": [51.411, -2.732], "Bath": [51.381, -2.359], "Batheaston": [51.405, -2.318], "Chew Magna": [51.367, -2.609],
             "Chilcompton": [51.267, -2.511], "Keynsham": [51.414, -2.498], "Midsomer Norton": [51.284, -2.482], "Newton St Loe": [51.373, -2.430],
             "Radstock": [51.293, -2.448], "Saltford": [51.402, -2.457], "Sparkford": [51.034, -2.565], "Stanton Drew": [51.367, -2.577],
             "Tatworth": [50.852, -2.957], "Timberscombe": [51.168, -3.487], "Timsbury": [51.328, -2.478], "Tunley": [51.343, -2.450],
             # Added 4 Nov 2026 evening (approximate village centres)
             "Norton St Philip": [51.300, -2.326], "Nunney": [51.210, -2.378], "Paulton": [51.307, -2.504], "Peasedown St John": [51.316, -2.430],
             # Added 9 Nov 2026 for the new North Somerset and Somerset records (centre of each place's records, or approximate)
             "Ash": [50.981, -2.747], "Banwell": [51.329, -2.867], "Binegar": [51.242, -2.543], "Bleadon": [51.308, -2.947],
             "Cleeve": [51.392, -2.777], "Clevedon": [51.435, -2.854], "Congresbury": [51.373, -2.809], "Coxley": [51.187, -2.680],
             "Curry Rivel": [51.024, -2.870], "Flax Bourton": [51.421, -2.711], "Kenn": [51.415, -2.836], "Locking": [51.333, -2.915],
             "Long Ashton": [51.431, -2.666], "Lympsham": [51.297, -2.947], "Pill": [51.479, -2.685], "Portishead": [51.486, -2.766],
             "Sandford": [51.334, -2.823], "Shepton Montague": [51.085, -2.456], "Walton-in-Gordano": [51.455, -2.829],
             "Winscombe": [51.315, -2.833], "Worle": [51.358, -2.925], "Wrington": [51.362, -2.765], "Yatton": [51.384, -2.815]}
for t, ll in NEW_TOWNS.items():
    if t not in TOWNS:
        TOWNS[t] = ll
        APPROX.append(t)

rows = [r for r in csv.DictReader(open(SRC, encoding="utf-8-sig")) if (r.get("name") or "").strip()]
for r in rows:
    r.setdefault("lat", ""); r.setdefault("lon", "")
    for k in list(r):
        r[k] = (r[k] or "").strip()

missing = sorted({r["town"] for r in rows if r["town"] and r["town"] not in TOWNS})
if missing:
    print("WARNING: towns with no town-centre entry (won't pin without lat/lon):", ", ".join(missing))

tpl = (HERE / "template.html").read_text(encoding="utf-8")
import base64
BANNER = "data:image/webp;base64," + base64.b64encode((HERE / "banner-wide.webp").read_bytes()).decode()
tpl = tpl.replace("/*BANNER*/", BANNER)
page = (tpl.replace("/*LEAFLET_CSS*/", LEAFLET_CSS.read_text(encoding="utf-8"))
           .replace("/*DATA*/[]", json.dumps(rows, ensure_ascii=False))
           .replace("/*TOWNS*/{}", json.dumps(TOWNS, ensure_ascii=False))
           .replace("/*APPROX*/[]", json.dumps(sorted(set(APPROX)), ensure_ascii=False))
           .replace("/*OUTLINE*/null", (HERE / "somerset-outline.json").read_text())
           .replace("/*BUILT*/", __import__("datetime").date.today().strftime("%-d %b %Y"))
           .replace("/*SITE_VERSION*/", "local copy, " + __import__("datetime").date.today().isoformat()))
trial_page = page.replace("/*TRIAL*/", (HERE / "trial.js").read_text(encoding="utf-8"))
page = page.replace("/*TRIAL*/", "")
(HERE / "index.html").write_text(page, encoding="utf-8")

# standalone: wrap in a full document (the published version gets its skeleton at publish time)
def standalone(pg):
    style_end = pg.rfind("</style>", 0, pg.find("<div")) + len("</style>")
    return ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            + pg[:style_end] + "\n</head>\n<body>\n" + pg[style_end:] + "\n</body>\n</html>\n")
(HERE / "signposting-somerset.html").write_text(standalone(page), encoding="utf-8")
# GitHub version: same page, but reads live records from the published Google Sheet (link in sheet_url.txt)
sheet = (HERE / "sheet_url.txt").read_text().strip() if (HERE / "sheet_url.txt").exists() else ""
(HERE / "github").mkdir(exist_ok=True)
# GitHub version carries no built-in records: it loads them only from the sheet
live = (tpl.replace("/*LEAFLET_CSS*/", LEAFLET_CSS.read_text(encoding="utf-8"))
           .replace("/*DATA*/[]", "[]")
           .replace("/*TOWNS*/{}", json.dumps(TOWNS, ensure_ascii=False))
           .replace("/*APPROX*/[]", json.dumps(sorted(set(APPROX)), ensure_ascii=False))
           .replace("/*OUTLINE*/null", (HERE / "somerset-outline.json").read_text())
           .replace("/*BUILT*/", "").replace("/*TRIAL*/", "")
           .replace('const SHEET_CSV_URL = "";', f'const SHEET_CSV_URL = "{sheet}";')
           .replace("const LIVE_ONLY = false;", "const LIVE_ONLY = true;"))
assert sheet, "sheet_url.txt is empty: the GitHub version needs the sheet link"
(HERE / "github" / "index.html").write_text(standalone(live), encoding="utf-8")
(HERE / "signposting-somerset-trial.html").write_text(standalone(trial_page), encoding="utf-8")
print(f"{len(rows)} records -> index.html, signposting-somerset.html, signposting-somerset-trial.html and github/index.html")
