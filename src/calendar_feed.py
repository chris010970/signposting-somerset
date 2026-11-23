"""A provider's public calendar feed (.ics, e.g. a Google Calendar's 'public/basic.ics' address) as plain lines, one per
regular session or upcoming one-off event, so check_sources.py can quote it and monitor.py can watch it like a
spreadsheet row:

    Breakfast Drop-in · Monday 10:00-12:00 · every week · Elim Church, Wells
    Coffee Morning · Thursday 10:30-12:00 · every 2 weeks
    Carols · Thursday 17 December 2026 18:00-19:00

The repeat rule comes from the calendar itself (weekly, fortnightly, '1st Monday of the month'). Series that have
ended, cancelled events, one-offs already past and one-offs more than ics_days_ahead days away (src/watch.json) are
left out, so the text only changes when the timetable does. Standard library only.
"""
import datetime as dt
import re

try:
    from zoneinfo import ZoneInfo
    LONDON = ZoneInfo("Europe/London")
except Exception:                                  # no time zone data: times stay as the feed gives them
    LONDON = None

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
BYDAY = {"MO": 0, "TU": 1, "WE": 2, "TH": 3, "FR": 4, "SA": 5, "SU": 6}
ORD = {1: "1st", 2: "2nd", 3: "3rd", 4: "4th", 5: "5th", -1: "last"}


def is_ics(url, content_type=""):
    u = (url or "").lower().split("?")[0]
    return u.endswith(".ics") or "text/calendar" in (content_type or "").lower()


def _events(raw):
    """[{property: (params, value)}] for each VEVENT, with folded lines joined."""
    text = re.sub(r"\r?\n[ \t]", "", raw.replace("\r\n", "\n"))
    out, cur = [], None
    for line in text.split("\n"):
        if line == "BEGIN:VEVENT":
            cur = {}
        elif line == "END:VEVENT":
            if cur is not None:
                out.append(cur)
            cur = None
        elif cur is not None and ":" in line:
            head, value = line.split(":", 1)
            name, *params = head.split(";")
            cur.setdefault(name.upper(), (dict(p.split("=", 1) for p in params if "=" in p), value))
    return out


def _unescape(s):
    return re.sub(r"\\([,;\\nN])", lambda m: "\n" if m[1] in "nN" else m[1], s).replace("\n", " ").strip()


def _when(prop):
    """A DTSTART/DTEND as a local datetime (or a date, for all-day events)."""
    params, v = prop
    if params.get("VALUE") == "DATE" or re.fullmatch(r"\d{8}", v):
        return dt.datetime.strptime(v[:8], "%Y%m%d").date()
    t = dt.datetime.strptime(v[:15], "%Y%m%dT%H%M%S")
    if v.endswith("Z") and LONDON:
        t = t.replace(tzinfo=dt.timezone.utc).astimezone(LONDON).replace(tzinfo=None)
    return t


def _rule(rrule):
    return dict(p.split("=", 1) for p in rrule.split(";") if "=" in p)


def _repeat(r, start):
    """'every week', 'every 2 weeks', '1st Monday of the month', ... and the weekdays it runs on."""
    freq, n = r.get("FREQ", ""), int(r.get("INTERVAL", "1") or 1)
    days = [d[-2:] for d in r.get("BYDAY", "").split(",") if d]
    if freq == "WEEKLY":
        wd = [BYDAY[d] for d in days if d in BYDAY] or [start.weekday()]
        return ("every week" if n == 1 else f"every {n} weeks"), wd
    if freq == "MONTHLY":
        m = re.fullmatch(r"([+-]?\d)([A-Z]{2})", r.get("BYDAY", "").split(",")[0] or "")
        if m:
            k, d = int(m[1]), BYDAY.get(m[2], start.weekday())
        else:
            k, d = int(r.get("BYSETPOS", "0") or 0) or (start.day - 1) // 7 + 1, (BYDAY.get(days[0]) if days else start.weekday())
        return f"{ORD.get(k, str(k))} {DAYS[d]} of the month" + ("" if n == 1 else f", every {n} months"), [d]
    if freq == "DAILY":
        return ("every day" if n == 1 else f"every {n} days"), list(range(7))
    return freq.lower() or "repeats", [start.weekday()]


def ics_text(raw, today=None, days_ahead=90):
    """The feed as lines (see the module notes), sorted by weekday and time."""
    today = today or dt.date.today()
    rows = []
    for e in _events(raw):
        if "DTSTART" not in e or "RECURRENCE-ID" in e:      # a moved or cancelled single date of a series: not the pattern
            continue
        if e.get("STATUS", ({}, ""))[1].upper() == "CANCELLED":
            continue
        start = _when(e["DTSTART"])
        end = _when(e["DTEND"]) if "DTEND" in e else None
        timed = isinstance(start, dt.datetime)
        hours = (start.strftime("%H:%M") + (f"-{end.strftime('%H:%M')}" if isinstance(end, dt.datetime) else "")) if timed else "all day"
        name = _unescape(e.get("SUMMARY", ({}, "Event"))[1])
        place = _unescape(e.get("LOCATION", ({}, ""))[1])
        first = start.date() if timed else start
        if "RRULE" in e:
            r = _rule(e["RRULE"][1])
            until = r.get("UNTIL")
            if until and dt.datetime.strptime(until[:8], "%Y%m%d").date() < today:
                continue
            if "COUNT" in r and first < today and (r.get("FREQ") != "WEEKLY" or
                                                   first + dt.timedelta(weeks=int(r["COUNT"]) * int(r.get("INTERVAL", "1") or 1)) < today):
                continue
            how, wds = _repeat(r, first)
            for d in wds:
                rows.append((d, hours, " · ".join(x for x in (name, f"{DAYS[d]} {hours}", how, place) if x)))
        else:
            if first < today or first > today + dt.timedelta(days=days_ahead):
                continue
            label = f"{DAYS[first.weekday()]} {first.day} {first.strftime('%B %Y')} {hours}"
            rows.append((first.weekday(), hours, " · ".join(x for x in (name, label, place) if x)))
    return "\n".join(r[2] for r in sorted(rows))
