#!/usr/bin/env python3
"""
make_analytics_data.py - rebuild docs/assets/analytics-lsoa.geojson for the Analytics tab.

What it makes: the 595 neighbourhoods (2021 Lower Layer Super Output Areas) in Somerset, North Somerset and
Bath and North East Somerset, with each one's centre, population (mid-2022), IMD 2025 deciles (overall and
health), and % disabled (Census 2021). Distances to services are NOT stored: the website works them out from
the live sheet.

Where the data comes from: the humaniverse R packages on GitHub, which package the official ONS / MHCLG files
(the ONS and GOV.UK sites themselves may be blocked in some environments; GitHub usually isn't):
  geographr  data/boundaries_lsoa21.rda        2021 LSOA boundaries (ONS)
  IMD        data/imd2025_england_lsoa21.rda   English Indices of Deprivation 2025
  demographr data/disability21_lsoa21_ew.rda   Census 2021 disability (TS038)
  demographr data/population22_lsoa21.rda      ONS mid-2022 population estimates
All Open Government Licence: credit ONS and MHCLG.

Usage:
  pip install rdata pyreadr
  python make_analytics_data.py            # clones what it needs into ./_src, writes analytics-lsoa.geojson
"""
import json, math, os, subprocess, sys
import rdata, pyreadr

SRC = "_src"
FILES = {"geographr": ["data/boundaries_lsoa21.rda"],
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

def centre(f):   # centroid of the largest polygon
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
    for f in feats:
        p = f["properties"]; c = p["code"]
        p.update(c=centre(f), pop=int(pop.loc[c, "n_people"]), imd=int(imd.loc[c, "IMD_decile"]), hdep=int(imd.loc[c, "Health_decile"]),
                 dis=round(float(dis.loc[c, "prop"]) * 100, 1))
        p["dens"] = round(p["pop"] / area_km2(f))
    geo = {"type": "FeatureCollection", "features": feats,
           "meta": {"sources": "Boundaries and population: ONS (mid-2022). Deprivation: English Indices of Deprivation 2025. "
                               "Disability: Census 2021. Open Government Licence; prepared via humaniverse R packages."}}
    json.dump(geo, open("analytics-lsoa.geojson", "w"), separators=(",", ":"))
    print(f"{len(feats)} neighbourhoods, {sum(f['properties']['pop'] for f in feats):,} people -> analytics-lsoa.geojson "
          f"({os.path.getsize('analytics-lsoa.geojson') // 1024} KB). Copy it to docs/assets/.")

if __name__ == "__main__":
    main()
