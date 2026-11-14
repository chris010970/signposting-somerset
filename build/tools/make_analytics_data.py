#!/usr/bin/env python3
"""
make_analytics_data.py - rebuild docs/assets/analytics-lsoa.geojson for the Analytics tab.

What it makes: the 595 LSOAs (2021 Lower Layer Super Output Areas) in Somerset, North Somerset and Bath and
North East Somerset, with each one's population (mid-2022), IMD 2025 deciles (overall and health), % disabled
(Census 2021), urban/rural class (ONS RUC 2021), and a postcode-weighted centre: the average position of the
postcodes inside it, i.e. roughly where the homes are. (ONS withdrew its own LSOA 2021 population-weighted
centroids from public access in 2026, so this stands in for them.) Distances to services are NOT stored: the
website works them out from the live sheet, measuring from that centre.

Where the data comes from: the humaniverse R packages on GitHub, which package the official ONS / MHCLG files
(the ONS and GOV.UK sites themselves may be blocked in some environments; GitHub usually isn't):
  geographr  data/boundaries_lsoa21.rda        2021 LSOA boundaries (ONS)
  IMD        data/imd2025_england_lsoa21.rda   English Indices of Deprivation 2025
  demographr data/disability21_lsoa21_ew.rda   Census 2021 disability (TS038)
  demographr data/population22_lsoa21.rda      ONS mid-2022 population estimates
  geographr  data/ruc21_lsoa21.rda             ONS Rural-Urban Classification 2021
and, for the postcode-weighted centres, dwyl/uk-postcodes-latitude-longitude-complete-csv (UK postcodes with
coordinates from the ONS/OS open postcode data, 2016 snapshot).
All Open Government Licence (postcodes also OS OpenData): credit ONS, MHCLG and OS.

Usage:
  pip install rdata pyreadr
  python make_analytics_data.py            # clones what it needs into ./_src, writes analytics-lsoa.geojson
"""
import json, math, os, subprocess, sys
import rdata, pyreadr

SRC = "_src"
FILES = {"geographr": ["data/boundaries_lsoa21.rda", "data/ruc21_lsoa21.rda"],
         "IMD": ["data/imd2025_england_lsoa21.rda"],
         "demographr": ["data/disability21_lsoa21_ew.rda", "data/population22_lsoa21.rda"]}
# 2021 LSOA names use the old district names; the four Somerset districts became Somerset Council in 2023
DISTRICTS = {"Bath and North East Somerset": "Bath and North East Somerset", "North Somerset": "North Somerset",
             "Mendip": "Somerset", "Sedgemoor": "Somerset", "South Somerset": "Somerset", "Somerset West and Taunton": "Somerset"}

def fetch():
    os.makedirs(SRC, exist_ok=True)
    for repo, files in FILES.items():
        d = os.path.join(SRC, repo)
        if not os.path.isdir(d):
            subprocess.run(["git", "clone", "-q", "--depth", "1", "--filter=blob:none", "--no-checkout",
                            f"https://github.com/humaniverse/{repo}", d], check=True)
        subprocess.run(["git", "-C", d, "checkout", "-q", "HEAD", "--"] + files, check=True)
    d = os.path.join(SRC, "postcodes")
    if not os.path.isdir(d):
        subprocess.run(["git", "clone", "-q", "--depth", "1", "--filter=blob:none", "--no-checkout",
                        "https://github.com/dwyl/uk-postcodes-latitude-longitude-complete-csv", d], check=True)
    if not os.path.exists(os.path.join(d, "ukpostcodes.csv")):
        subprocess.run(["git", "-C", d, "checkout", "-q", "HEAD", "--", "ukpostcodes.csv.zip"], check=True)
        import zipfile; zipfile.ZipFile(os.path.join(d, "ukpostcodes.csv.zip")).extract("ukpostcodes.csv", d)

def boundaries():
    v = rdata.parser.parse_file(os.path.join(SRC, "geographr/data/boundaries_lsoa21.rda")).object.value[0]
    names = [x.value.decode() if x.value else "" for x in v.value[0].value]
    codes = [x.value.decode() for x in v.value[1].value]
    def ring(o):   # an n x 2 matrix stored column by column
        n = int(o.attributes.value[0].value[0]); d = list(o.value)
        return [[round(float(d[i]), 5), round(float(d[i + n]), 5)] for i in range(n)]
    out = []
    for nm, cd, g in zip(names, codes, v.value[2].value):
        dist = nm.rsplit(" ", 1)[0]
        if dist in DISTRICTS:
            out.append({"type": "Feature", "properties": {"code": cd, "name": nm, "la": DISTRICTS[dist]},
                        "geometry": {"type": "MultiPolygon", "coordinates": [[ring(r) for r in poly.value] for poly in g.value]}})
    return out

def area_km2(f):
    tot = 0
    for poly in f["geometry"]["coordinates"]:
        r = poly[0]; lat0 = sum(y for _, y in r) / len(r); kx, ky = 111.32 * math.cos(math.radians(lat0)), 110.57
        tot += abs(sum((x1 * kx) * (y2 * ky) - (x2 * kx) * (y1 * ky) for (x1, y1), (x2, y2) in zip(r, r[1:] + r[:1]))) / 2
    return tot

def inring(x, y, r):
    c = False; j = len(r) - 1
    for i in range(len(r)):
        (xi, yi), (xj, yj) = r[i], r[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi: c = not c
        j = i
    return c

def postcode_centres(feats):   # average position of the postcodes inside each LSOA (roughly where the homes are)
    import csv
    box = []
    for f in feats:
        xs = [x for p in f["geometry"]["coordinates"] for x, _ in p[0]]; ys = [y for p in f["geometry"]["coordinates"] for _, y in p[0]]
        box.append((min(xs), max(xs), min(ys), max(ys)))
    bb = (min(b[0] for b in box), max(b[1] for b in box), min(b[2] for b in box), max(b[3] for b in box))
    acc = [[0.0, 0.0, 0] for _ in feats]
    for row in csv.DictReader(open(os.path.join(SRC, "postcodes", "ukpostcodes.csv"))):
        try: y, x = float(row["latitude"]), float(row["longitude"])
        except ValueError: continue
        if not (bb[0] <= x <= bb[1] and bb[2] <= y <= bb[3]): continue
        for k, f in enumerate(feats):
            b = box[k]
            if b[0] <= x <= b[1] and b[2] <= y <= b[3] and any(inring(x, y, p[0]) and not any(inring(x, y, h) for h in p[1:])
                                                                for p in f["geometry"]["coordinates"]):
                acc[k][0] += x; acc[k][1] += y; acc[k][2] += 1; break
    return acc

def centre(f):   # centroid of the largest polygon (used only if an LSOA has fewer than 3 postcodes)
    best = None
    for poly in f["geometry"]["coordinates"]:
        r = poly[0]; A = cx = cy = 0
        for (x1, y1), (x2, y2) in zip(r, r[1:] + r[:1]):
            c = x1 * y2 - x2 * y1; A += c; cx += (x1 + x2) * c; cy += (y1 + y2) * c
        if A and (best is None or abs(A) > abs(best[0])): best = (A, cx / (3 * A), cy / (3 * A))
    return [round(best[2], 5), round(best[1], 5)]

def main():
    fetch()
    feats = boundaries()
    imd = pyreadr.read_r(os.path.join(SRC, "IMD/data/imd2025_england_lsoa21.rda"))["imd2025_england_lsoa21"].set_index("lsoa21_code")
    dis = pyreadr.read_r(os.path.join(SRC, "demographr/data/disability21_lsoa21_ew.rda"))["disability21_lsoa21_ew"]
    dis = dis[dis.disability == "Disabled under the Equality Act"].set_index("lsoa21_code")
    pop = pyreadr.read_r(os.path.join(SRC, "demographr/data/population22_lsoa21.rda"))["population22_lsoa21"].set_index("lsoa21_code")
    ruc = pyreadr.read_r(os.path.join(SRC, "geographr/data/ruc21_lsoa21.rda"))["ruc21_lsoa21"].set_index("lsoa21_code")
    pcs = postcode_centres(feats)
    for f, a in zip(feats, pcs):
        p = f["properties"]; c = p["code"]
        cen = [round(a[1] / a[2], 5), round(a[0] / a[2], 5)] if a[2] >= 3 else centre(f)
        p.update(c=cen, npc=a[2], ruc=str(ruc.loc[c, "ruc"]), rucc=str(ruc.loc[c, "classification"]), pop=int(pop.loc[c, "n_people"]), imd=int(imd.loc[c, "IMD_decile"]), hdep=int(imd.loc[c, "Health_decile"]),
                 dis=round(float(dis.loc[c, "prop"]) * 100, 1))
        p["dens"] = round(p["pop"] / area_km2(f))
    geo = {"type": "FeatureCollection", "features": feats,
           "meta": {"sources": "Boundaries and population: ONS (mid-2022). Deprivation: English Indices of Deprivation 2025. "
                               "Disability: Census 2021. Urban/rural: ONS RUC 2021. Centres: postcode-weighted (OS/ONS open postcode data, 2016). "
                               "Open Government Licence; prepared via humaniverse R packages."}}
    json.dump(geo, open("analytics-lsoa.geojson", "w"), separators=(",", ":"))
    print(f"{len(feats)} LSOAs, {sum(f['properties']['pop'] for f in feats):,} people -> analytics-lsoa.geojson "
          f"({os.path.getsize('analytics-lsoa.geojson') // 1024} KB). Copy it to docs/assets/.")

if __name__ == "__main__":
    main()
