#!/usr/bin/env python3
"""
church_events.py - find regular community activities run by Church of England churches in
Somerset (incl. North Somerset and B&NES), from A Church Near You (achurchnearyou.com).

How: every church on A Church Near You has a page of regular events at
  https://www.achurchnearyou.com/church/<id>/service-and-events/events-regular/
Church ids are numbered roughly by diocese (Weston-super-Mare is around 11145, Nailsea 11193),
so the script walks a range of ids, keeps churches with a Somerset postcode, and lists their
regular events. Services of worship (communion, evensong, prayer...) are dropped; everything
else (coffee mornings, lunch clubs, toddler groups, warm spaces, memory cafes...) is kept for
you to review, with a 'faith' column marking events whose title or description mentions religious
content (Bible talk, prayer, Messy Church...), sorted to the bottom: Signposting prefers secular groups. No AI involved. Polite: one page a second.

Each event's day, time and length are read from its 'Add to Google Calendar' link, which holds
exact start and end times; the 'Every ...' text gives the pattern (weekly, 1st Tuesday...).

Output: church-events-somerset.csv (one row per event, with a 'likely' column: yes = matches a
community/wellbeing keyword, maybe = something else that isn't worship) and
church-ids-somerset.txt (the Somerset church ids found, so later runs can use --ids-file).

Usage:
  pip install requests beautifulsoup4
  python church_events.py --test                    # one church (Holy Trinity Nailsea) to check it works
  python church_events.py                           # scan ids 10000-12500 (about 45 minutes)
  python church_events.py --from 11100 --to 11300   # a smaller range
  python church_events.py --ids-file church-ids-somerset.txt   # just the churches found last time
"""
import argparse, csv, re, sys, time
from datetime import datetime
from urllib.parse import urlparse, parse_qs
import requests
from bs4 import BeautifulSoup

SITE = "https://www.achurchnearyou.com"
UA = "Mozilla/5.0 (compatible; SignpostingSomerset-research/1.0; +https://signpostingsomerset.org.uk)"
PC = re.compile(r"\b([A-Z]{1,2}\d{1,2}[A-Z]?)\s*(\d[A-Z]{2})\b")

def somerset(outward):
    m = re.match(r"([A-Z]+)(\d+)", outward)
    if not m:
        return False
    area, n = m.group(1), int(m.group(2))
    if area == "TA":
        return True
    if area == "BA":
        return n <= 11 or n == 16 or 20 <= n <= 22
    if area == "BS":
        return 20 <= n <= 29 or n in (31, 39, 40, 48, 49)
    return False

WORSHIP = re.compile(r"\b(service|communion|eucharist|mass|worship|evensong|matins|compline|vespers|"
                     r"prayers?|praise|bible|baptism|christening|confirmation|liturgy|sermon|choral|choir|"
                     r"bell ?ring\w*|sunday school|alpha|lent|advent|carol|benefice|pcc|morning praise|"
                     r"sunday catch ?up)\b", re.I)
LIKELY = re.compile(r"\b(coffee|caf[eé]|lunch|soup|breakfast|tea\b|cuppa|warm|welcome|drop.?in|community|"
                    r"friendship|social|chat|natter|knit|craft|art|memory|dementia|carers?|bereave\w*|grief|"
                    r"loss|food ?bank|larder|pantry|toddler|parent|baby|mums?|dads?|men'?s|women'?s|"
                    r"walk|garden|games|board game|over 60|older|seniors|lonely|isolat\w*|wellbeing|"
                    r"mental|debt|cap\b|money|job club|repair|sing\w*|music|lunch club|luncheon|youth|teens?|after.?school|"
                    r"kids|children|famil\w*|club|group|stay and play|messy church)\b", re.I)

CAFE_CHURCH = re.compile(r"caf[eé] church|church caf[eé]|messy church|sunday breakfast|breakfast church", re.I)

FAITH = re.compile(r"\b(bible|gospel|jesus|christ\w*|god|faith|pray\w*|worship|scripture|alpha|messy church|"
                   r"rock solid|devotion\w*|ministry|disciple\w*|church family|caf[eé] church|church caf[eé]|"
                   r"sunday breakfast|messy church)\b", re.I)

def get(session, url):
    r = session.get(url, headers={"User-Agent": UA}, timeout=30)
    if r.status_code == 404:
        return None
    r.raise_for_status()
    return r.text

def cal_times(href):
    """Start, end, weekday and title from an 'Add to Google Calendar' link."""
    q = parse_qs(urlparse(href).query)
    title = (q.get("text") or [""])[0]
    details = (q.get("details") or [""])[0]
    dates = (q.get("dates") or [""])[0]
    m = re.match(r"(\d{8}T\d{6})Z?/(\d{8}T\d{6})Z?", dates)
    if not m:
        return title, "", "", "", details
    s = datetime.strptime(m.group(1), "%Y%m%dT%H%M%S")
    e = datetime.strptime(m.group(2), "%Y%m%dT%H%M%S")
    return title, s.strftime("%H:%M"), e.strftime("%H:%M"), s.strftime("%a"), details

def read_church(html, cid):
    soup = BeautifulSoup(html, "html.parser")
    for t in soup(["script", "style", "noscript"]):
        t.decompose()
    h1 = soup.find("h1")
    name = " ".join(h1.get_text(" ").split()) if h1 else ""
    text = soup.get_text("\n")
    lines = [" ".join(x.split()) for x in text.split("\n")]
    lines = [x for x in lines if x]
    # address: the 'Address' block, else the first postcode on the page
    addr, pc = "", ""
    for i, l in enumerate(lines):
        if l.lower() == "address":
            block = []
            for m in lines[i + 1:i + 7]:
                block.append(m)
                if PC.search(m.upper()):
                    break
            addr = ", ".join(block)
            break
    m = PC.search(addr.upper()) or PC.search(" ".join(lines).upper())
    if m:
        pc = f"{m.group(1)} {m.group(2)}"
    # recurrence texts in page order ('Every Thursday at 3:15 p.m. for 1 hour', 'Every First Sunday ...')
    recur = [l for l in lines if re.match(r"(every|on the|first|second|third|fourth|last)\b", l, re.I)
             and re.search(r"\b(at|from)\b", l, re.I)]
    # one Google Calendar link per event, in page order
    cals = [a["href"] for a in soup.find_all("a", href=True) if "calendar.google.com" in a["href"]]
    feeds = [a["href"] for a in soup.find_all("a", href=True) if re.search(r"/events/\d+/feed/?$", a["href"])]
    feeds = list(dict.fromkeys(feeds))
    events = []
    for i, href in enumerate(cals):
        title, start, end, day, details = cal_times(href)
        events.append({
            "title": title, "pattern": recur[i] if len(recur) == len(cals) else "",
            "day": day, "start": start, "end": end,
            "description": " ".join(BeautifulSoup(details, "html.parser").get_text(" ").split())[:300],
            "event_url": (SITE + re.sub(r"feed/?$", "", feeds[i])) if len(feeds) == len(cals) and feeds[i].startswith("/")
                         else (re.sub(r"feed/?$", "", feeds[i]) if len(feeds) == len(cals) else ""),
        })
    return {"id": cid, "church": name, "address": addr, "postcode": pc,
            "somerset": bool(pc) and somerset(pc.split()[0]), "events": events,
            "pattern_check": "" if len(recur) == len(cals) else f"{len(recur)} patterns vs {len(cals)} events"}

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--from", dest="start", type=int, default=10000)
    ap.add_argument("--to", dest="end", type=int, default=12500)
    ap.add_argument("--ids-file")
    ap.add_argument("--test", action="store_true", help="just Holy Trinity Nailsea (id 11193)")
    ap.add_argument("--delay", type=float, default=1.0)
    ap.add_argument("--out", default="church-events-somerset.csv")
    a = ap.parse_args()
    if a.test:
        ids = [11193]
    elif a.ids_file:
        ids = [int(x) for x in open(a.ids_file).read().split() if x.strip().isdigit()]
    else:
        ids = list(range(a.start, a.end + 1))
    s = requests.Session()
    rows, found, misses = [], [], 0
    for n, cid in enumerate(ids, 1):
        url = f"{SITE}/church/{cid}/service-and-events/events-regular/"
        try:
            html = get(s, url)
        except Exception as e:
            print(f"[{n}/{len(ids)}] {cid} failed ({type(e).__name__})", file=sys.stderr)
            time.sleep(a.delay)
            continue
        if html is None:
            misses += 1
            time.sleep(a.delay / 2)
            continue
        c = read_church(html, cid)
        if a.test:
            print(f"{c['church']} | {c['postcode']} | Somerset: {c['somerset']} | {len(c['events'])} events {c['pattern_check']}")
            for e in c["events"]:
                kind = "worship" if WORSHIP.search(e["title"]) else ("yes" if LIKELY.search(e["title"] + " " + e["description"]) else "maybe")
                print(f"  [{kind}] {e['title']} | {e['day']} {e['start']}-{e['end']} | {e['pattern']}")
        if c["somerset"]:
            found.append(cid)
            kept = 0
            for e in c["events"]:
                if WORSHIP.search(e["title"]) and not CAFE_CHURCH.search(e["title"]):
                    continue
                kept += 1
                rows.append({"church_id": cid, "church": c["church"], "address": c["address"], "postcode": c["postcode"],
                             "title": e["title"], "likely": "yes" if LIKELY.search(e["title"] + " " + e["description"]) else "maybe",
                             "day": e["day"], "start": e["start"], "end": e["end"], "pattern": e["pattern"],
                             "description": e["description"], "event_url": e["event_url"], "page": url,
                             "faith": "yes" if FAITH.search(e["title"] + " " + e["description"]) else "",
                             "check": c["pattern_check"]})
            print(f"[{n}/{len(ids)}] SOMERSET {cid}: {c['church']} ({c['postcode']}) - {kept} non-worship events", file=sys.stderr)
        elif n % 100 == 0:
            print(f"[{n}/{len(ids)}] ... ({len(found)} Somerset churches so far)", file=sys.stderr)
        time.sleep(a.delay)
    cols = ["likely", "faith", "church", "title", "day", "start", "end", "pattern", "description", "address", "postcode",
            "event_url", "page", "church_id", "check"]
    with open(a.out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(sorted(rows, key=lambda r: (r["faith"] == "yes", r["likely"] != "yes", r["postcode"], r["church"])))
    if not a.test:
        open("church-ids-somerset.txt", "w").write("\n".join(map(str, found)))
        lo, hi = (min(found), max(found)) if found else (None, None)
        print(f"\n{len(found)} Somerset churches (ids {lo}-{hi}), {len(rows)} non-worship events -> {a.out}", file=sys.stderr)
        print("Tip: if Somerset ids sit near the edge of the range, widen --from/--to and run again.", file=sys.stderr)

if __name__ == "__main__":
    main()
