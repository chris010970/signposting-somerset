#!/usr/bin/env python3
"""
run_tags.py - try the tags task (what someone types on the landing page -> support types, place, flags and preferences)
on the live worker. Each phrase in scenarios-tags.json says what should come back; a preference it doesn't list mustn't.

No access code is needed: the tags task is open to all, as the landing page is. Each phrase counts toward the
worker's daily cap (daily_cap in build/tools/assist/tags.json).

Usage:
  pip install requests
  python src\\run_tags.py                    # all the phrases in scenarios-tags.json
  python src\\run_tags.py --ids T02,T09      # some
  python src\\run_tags.py --ids H*          # the preference phrases only (H01-H36)
  python src\\run_tags.py --scenarios src\\scenarios-risk.json   # risk phrased many ways (the risk flag only)
  python src\\run_tags.py --text "lonely in Wells, money worries"   # one phrase of your own

Each phrase costs a fraction of a penny with Haiku. The worker allows per_hour requests an hour from one computer for this
task (per_hour in tags.json; 0 for now: no limit, so it never waits; Assist's 30 is apart). Results: tags-<date>.md beside this file, with the model that
answered (from the worker's reply).
"""
import argparse, json, os, time
from datetime import datetime
import requests

WORKER = "https://signposting-assist.c-r-williams0109.workers.dev/tags"
ORIGIN = "https://signpostingsomerset.org.uk"
HERE = os.path.dirname(os.path.abspath(__file__))
# The worker's hourly limit for the tags task, from one computer (per_hour in tags.json)
PER_HOUR = json.load(open(os.path.join(HERE, "..", "build", "tools", "assist", "tags.json"), encoding="utf-8")).get("per_hour", 30)


def ask(text):
    t = time.time()
    r = requests.post(WORKER, json={"text": text}, timeout=60,
                      headers={"Origin": ORIGIN, "Content-Type": "application/json"})
    try:
        out = r.json()
    except ValueError:
        out = {"error": f"not JSON (HTTP {r.status_code})"}
    out["_status"], out["_seconds"] = r.status_code, round(time.time() - t, 1)
    return out


def check(s, out):
    """What's wrong with the answer, as short notes (none: a pass)."""
    if out.get("error"):
        return [f"error {out['error']} (HTTP {out['_status']})"]
    got, notes = out.get("tags", []), []
    if out.get("fallback"):
        notes.append(f"fallback: {out['fallback']}")
    missing = [t for t in s["must"] if t not in got]
    if missing:
        notes.append("missing " + ", ".join(missing))
    wrong = got if s["not"] is None else [t for t in got if t in s["not"]]
    if wrong:
        notes.append("shouldn't have " + ", ".join(wrong))
    place = (out.get("place") or {}).get("name", "")
    if s["place"].lower() not in place.lower() or (place and not s["place"]):
        notes.append(f"place {place!r}, expected {s['place']!r}")
    for flag in ("risk", "off_topic"):
        if bool(out.get(flag)) != s[flag]:
            notes.append(f"{flag} {bool(out.get(flag))}")
    for k in pref_misses(s, out):
        notes.append(f"{k} {show(out.get('prefs', {}).get(k))}, expected {show(s.get('prefs', {}).get(k))}")
    return notes


def same(a, b):
    """Two preference values agree (a list in any order, or one value; None: not given)."""
    norm = lambda v: None if v in (None, [], "") else tuple(sorted(v)) if isinstance(v, list) else v
    return norm(a) == norm(b)


def show(v):
    return "none" if v in (None, [], "") else "/".join(v) if isinstance(v, list) else v


def pref_misses(s, out):
    """The preferences the answer got wrong: expected ones missing or different, and any not expected that came back."""
    want, got = s.get("prefs", {}), out.get("prefs", {}) or {}
    return [k for k in sorted(set(want) | set(got)) if k not in s.get("ignore", []) and "*" not in s.get("ignore", []) and not same(want.get(k), got.get(k))]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--scenarios", default=os.path.join(HERE, "scenarios-tags.json"))
    ap.add_argument("--ids", help="comma-separated, e.g. T02,T09; a prefix ending in * picks a set, e.g. H*")
    ap.add_argument("--text", help="one phrase of your own (no checks, just the answer)")
    a = ap.parse_args()
    if a.text:
        print(json.dumps(ask(a.text), indent=1, ensure_ascii=False))
        return
    S = json.load(open(a.scenarios, encoding="utf-8"))["scenarios"]
    if a.ids:
        want = a.ids.split(",")   # ids, or a prefix ending in * (H* for the preference phrases)
        S = [s for s in S if any(s["id"] == w or (w.endswith("*") and s["id"].startswith(w[:-1])) for w in want)]
    rows, passed, models = [], 0, set()
    tally = {}   # each preference: [right, phrases where it was expected or came back]
    for i, s in enumerate(S):
        if PER_HOUR and i >= PER_HOUR - 2:   # the worker's limit for this task, from one computer (0: none)
            print(f"  (waiting 2 minutes: the limit of {PER_HOUR} an hour; {len(S) - i} to go)", flush=True)
            time.sleep(125)
        out = ask(s["text"])
        models.add(out.get("model") or "(not given: worker before 26 Nov)")
        notes = check(s, out)
        passed += not notes
        if not out.get("error"):
            for k in ([] if "*" in s.get("ignore", []) else (set(s.get("prefs", {})) | set(out.get("prefs", {}) or {})) - set(s.get("ignore", []))):
                t = tally.setdefault(k, [0, 0]); t[1] += 1; t[0] += k not in pref_misses(s, out)
        place = out.get("place") or {}
        where = place.get("name", "") + (f" ({place['town']})" if place.get("town") else (" (not ours)" if place else ""))
        flags = " ".join([f for f in ("risk", "off_topic") if out.get(f)] + [f"{k}={show(v)}" for k, v in (out.get("prefs") or {}).items()])
        line = f"{s['id']}  {'PASS' if not notes else 'FAIL'}  {', '.join(out.get('tags', []))} | {where} | {flags}"
        print(line + (f"   <- {'; '.join(notes)}" if notes else "") + f"  [{out['_seconds']}s]")
        rows.append(f"| {s['id']} | {'pass' if not notes else '**fail**'} | {s['text']} | {', '.join(out.get('tags', []))} | {where} | {flags} | {'; '.join(notes)} |")
    model = ", ".join(sorted(models))
    print(f"\n{passed} of {len(S)} passed (model: {model})")
    prefs_line = ", ".join(f"{k} {r}/{n}" for k, (r, n) in sorted(tally.items()))
    if prefs_line:
        print("Preferences (right / phrases where expected or given):", prefs_line)
    path = os.path.join(HERE, f"tags-{datetime.now():%Y-%m-%d-%H%M}.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write(f"# Tags task, {datetime.now():%d %b %Y %H:%M}: {passed} of {len(S)} passed\n\nModel: {model}\n\n"
                + (f"Preferences (right / phrases where expected or given): {prefs_line}\n\n" if prefs_line else "")
                + 
                "| id | result | text | tags | place | flags | notes |\n|---|---|---|---|---|---|---|\n" + "\n".join(rows) + "\n")
    print("Saved", path)


if __name__ == "__main__":
    main()
