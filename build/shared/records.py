"""Reading the service records (the sheet's rows) for the builds.

The clean-up is the same as the pages do when they read the sheet (build/core/js/sheet.js): spreadsheets turn
2026-12-17 into 17/12/2026 and 10:00 into 10:00:00, so both are put back. build/tests/ checks the two agree.
"""
import csv, io, re, urllib.request
from pathlib import Path

SHEET_URL_FILE = Path(__file__).resolve().parent.parent / "directory" / "sheet_url.txt"

def fix_date(v):
    """25/10/2026 -> 2026-10-25 (anywhere in the value, so lists and ranges too)."""
    return re.sub(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b", lambda m: f"{m[3]}-{m[2].zfill(2)}-{m[1].zfill(2)}", v)

def fix_time(v):
    """9:30 -> 09:30, 10:00:00 -> 10:00, '10:00 - 12:00' -> '10:00-12:00'."""
    v = re.sub(r"\b(\d{1,2}):(\d\d)(?::\d\d)?\b", lambda m: f"{m[1].zfill(2)}:{m[2]}", v)
    return re.sub(r"\s*-\s*", "-", v)

def clean(row):
    """One row as the pages see it: lower-case column names, values trimmed, dates and times put back."""
    r = {k.strip().lower(): (v or "").strip() for k, v in row.items() if k}
    for k in ("dates", "last_checked"):
        if r.get(k): r[k] = fix_date(r[k])
    if r.get("times"): r["times"] = fix_time(r["times"])
    return r

def web_url(u):
    """The address if it's a web page (http or https), otherwise "" (so nothing else becomes a link)."""
    return u if re.match(r"https?://", u or "", re.I) else ""

def read_records(csv_path=None):
    """The records with a name, from a CSV file, or from the published sheet when no file is given."""
    if csv_path:
        text = Path(csv_path).read_text(encoding="utf-8-sig")
    else:
        url = SHEET_URL_FILE.read_text().strip()
        text = urllib.request.urlopen(url, timeout=60).read().decode("utf-8-sig")
    return [r for r in map(clean, csv.DictReader(io.StringIO(text))) if r.get("name")]
