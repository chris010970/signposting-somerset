#!/usr/bin/env python3
"""
run_tags.py - try the tags task (what someone types on the landing page -> support types, place, flags) on the live worker.

Your access code is read from an environment variable and never written anywhere:
  Windows (Command Prompt):  set ASSIST_CODE=your-code
  Windows (PowerShell):      $env:ASSIST_CODE="your-code"

Usage:
  pip install requests
  python src\\run_tags.py                    # all the phrases in scenarios-tags.json
  python src\\run_tags.py --ids T02,T09      # some
  python src\\run_tags.py --text "lonely in Wells, money worries"   # one phrase of your own

Each phrase costs a fraction of a penny with Haiku. The worker allows 30 requests an hour from one computer (shared with
Assist), so the script waits between phrases after the 28th. Results: tags-<date>.md beside this file.
"""
import argparse, json, os, sys, time
from datetime import datetime
import requests

WORKER = "https://signposting-assist.c-r-williams0109.workers.dev/tags"
ORIGIN = "https://signpostingsomerset.org.uk"
HERE = os.path.dirname(os.path.abspath(__file__))


def ask(text, code):
    t = time.time()
    r = requests.post(WORKER, json={"text": text}, timeout=60,
                      headers={"X-Access-Code": code, "Origin": ORIGIN, "Content-Type": "application/json"})
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
    return notes


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--scenarios", default=os.path.join(HERE, "scenarios-tags.json"))
    ap.add_argument("--ids", help="comma-separated, e.g. T02,T09")
    ap.add_argument("--text", help="one phrase of your own (no checks, just the answer)")
    a = ap.parse_args()
    code = os.environ.get("ASSIST_CODE")
    if not code:
        sys.exit("Set ASSIST_CODE first (see the top of this file).")
    if a.text:
        print(json.dumps(ask(a.text, code), indent=1, ensure_ascii=False))
        return
    S = json.load(open(a.scenarios, encoding="utf-8"))["scenarios"]
    if a.ids:
        S = [s for s in S if s["id"] in a.ids.split(",")]
    rows, passed = [], 0
    for i, s in enumerate(S):
        if i >= 28:
            time.sleep(125)   # the worker's limit: 30 an hour from one computer
        out = ask(s["text"], code)
        notes = check(s, out)
        passed += not notes
        place = out.get("place") or {}
        where = place.get("name", "") + (f" ({place['town']})" if place.get("town") else (" (not ours)" if place else ""))
        flags = " ".join(f for f in ("risk", "off_topic") if out.get(f))
        line = f"{s['id']}  {'PASS' if not notes else 'FAIL'}  {', '.join(out.get('tags', []))} | {where} | {flags}"
        print(line + (f"   <- {'; '.join(notes)}" if notes else "") + f"  [{out['_seconds']}s]")
        rows.append(f"| {s['id']} | {'pass' if not notes else '**fail**'} | {s['text']} | {', '.join(out.get('tags', []))} | {where} | {flags} | {'; '.join(notes)} |")
    print(f"\n{passed} of {len(S)} passed")
    path = os.path.join(HERE, f"tags-{datetime.now():%Y-%m-%d-%H%M}.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write(f"# Tags task, {datetime.now():%d %b %Y %H:%M}: {passed} of {len(S)} passed\n\n"
                "| id | result | text | tags | place | flags | notes |\n|---|---|---|---|---|---|---|\n" + "\n".join(rows) + "\n")
    print("Saved", path)


if __name__ == "__main__":
    main()
