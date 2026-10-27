"""Add latitude and longitude to services.csv from each record's postcode.

Uses postcodes.io (free, no account, UK postcodes). Only the Python standard library is needed.

Usage:
    python geocode.py services.csv                 # writes services-geocoded.csv
    python geocode.py services.csv --in-place      # updates services.csv itself
    python geocode.py services.csv --redo          # also re-checks rows that already have lat/lon

Rules:
- Rows that already have lat and lon are left alone (so you can pin a venue by hand), unless --redo.
- Rows without a postcode are skipped; the website places them at the town centre.
- Postcodes that aren't found are listed at the end so you can fix typos.
"""
import csv, json, sys, time, urllib.request, urllib.error

API = "https://api.postcodes.io/postcodes"
BATCH = 100  # postcodes.io accepts up to 100 per request


def lookup(postcodes):
    """Return {postcode: (lat, lon)} for a list of postcodes, via the bulk endpoint."""
    found = {}
    for i in range(0, len(postcodes), BATCH):
        chunk = postcodes[i:i + BATCH]
        body = json.dumps({"postcodes": chunk}).encode()
        req = urllib.request.Request(API, data=body, headers={"Content-Type": "application/json"})
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    data = json.load(resp)
                break
            except (urllib.error.URLError, TimeoutError) as e:
                if attempt == 2:
                    sys.exit(f"Couldn't reach postcodes.io ({e}). Check your internet connection and try again.")
                time.sleep(2)
        for item in data.get("result", []):
            res = item.get("result")
            if res:
                found[item["query"]] = (round(res["latitude"], 6), round(res["longitude"], 6))
    return found


def norm(pc):
    return " ".join(pc.upper().split())


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    in_place, redo = "--in-place" in sys.argv, "--redo" in sys.argv
    path = args[0] if args else "services.csv"
    out = path if in_place else path.rsplit(".", 1)[0] + "-geocoded.csv"

    with open(path, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))
    head = rows[0]
    for col in ("lat", "lon"):
        if col not in head:
            head.append(col)
            for r in rows[1:]:
                r.append("")
    for r in rows[1:]:  # pad any short rows
        r += [""] * (len(head) - len(r))
    I = {k: i for i, k in enumerate(head)}

    todo = []
    for r in rows[1:]:
        pc = norm(r[I["postcode"]]) if "postcode" in I else ""
        has = r[I["lat"]].strip() and r[I["lon"]].strip()
        if pc and (redo or not has):
            todo.append(pc)
    unique = sorted(set(todo))
    print(f"{len(rows) - 1} rows; looking up {len(unique)} postcodes...")
    found = lookup(unique) if unique else {}

    updated, missing = 0, {}
    for r in rows[1:]:
        if not r[0].strip():
            continue
        pc = norm(r[I["postcode"]]) if "postcode" in I else ""
        if not pc or not (redo or not (r[I["lat"]].strip() and r[I["lon"]].strip())):
            continue
        if pc in found:
            r[I["lat"]], r[I["lon"]] = str(found[pc][0]), str(found[pc][1])
            updated += 1
        else:
            missing.setdefault(pc, []).append(r[0])

    with open(out, "w", encoding="utf-8-sig", newline="") as f:
        csv.writer(f, lineterminator="\r\n").writerows(rows)

    print(f"Added coordinates to {updated} rows. Saved: {out}")
    if missing:
        print(f"\n{len(missing)} postcodes weren't found (typo, or the postcode no longer exists):")
        for pc, names in sorted(missing.items()):
            print(f"  {pc}: {'; '.join(names)}")
    no_pc = sum(1 for r in rows[1:] if r[0].strip() and not (r[I['postcode']].strip() if 'postcode' in I else ''))
    print(f"\n{no_pc} rows have no postcode (they'll show at the town centre).")


if __name__ == "__main__":
    main()
