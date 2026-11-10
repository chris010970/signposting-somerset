#!/usr/bin/env python3
"""
run_scenarios.py - run the Assist test scenarios against the live worker and save the plans.

Your access code is read from an environment variable and never written anywhere:
  Windows (Command Prompt):  set ASSIST_CODE=your-code
  Windows (PowerShell):      $env:ASSIST_CODE="your-code"
  Mac/Linux:                 export ASSIST_CODE=your-code

Usage:
  pip install requests
  python run_scenarios.py --list                                 # show all scenarios
  python run_scenarios.py --ids S25,S26,S27,S28,S29,S30          # run some
  python run_scenarios.py --all                                  # all 73 (about 2.5 hours, see cost note)

Each plan costs roughly 8-12p of Anthropic credit (the prompt is bigger now the sheet has ~950 records),
so all 73 is about 6-9 pounds. The worker allows 30 plans an hour per visitor, so the script waits
2 minutes between plans. Results: plans-<date>.json (everything) and plans-<date>.md (readable).
"""
import argparse, json, os, sys, time
from datetime import datetime
import requests

WORKER = "https://signposting-assist.c-r-williams0109.workers.dev"
ORIGIN = "https://signpostingsomerset.org.uk"
HERE = os.path.dirname(os.path.abspath(__file__))

def load(path):
    return json.load(open(path, encoding="utf-8"))["scenarios"]

def run_one(s, code):
    body = {"need": s["need"], "radius": s.get("radius_miles") or 10, "remote": True, "support": "",
            "followups": [], "previous": [], "town": "__pt",
            "lat": round(s["lat"], 2), "lon": round(s["lon"], 2)}
    t = time.time()
    r = requests.post(WORKER, json=body, timeout=180,
                      headers={"X-Access-Code": code, "Origin": ORIGIN, "Content-Type": "application/json"})
    out = r.json()
    out["_seconds"] = round(time.time() - t, 1)
    out["_status"] = r.status_code
    return out

def md(s, p):
    lines = [f"## {s['id']} · {s.get('town', '')} · {s.get('radius_miles') or 10} miles", "", f"> {s['need']}", ""]
    if p.get("error"):
        return "\n".join(lines + [f"**Error:** {p['error']} (HTTP {p.get('_status')})", ""])
    lines += [f"**Reading:** {p.get('reading', '')}", ""]
    if p.get("safety"):
        lines += [f"**Safety:** {p['safety']}", ""]
    for i, k in enumerate(p.get("picks", []), 1):
        rec = k.get("record", {})
        where = f"{k['distance']} mi" if k.get("distance") is not None else "phone/online or area-wide"
        when = " ".join(x for x in [rec.get("days", ""), rec.get("times", ""), rec.get("frequency", "")] if x)
        lines.append(f"{i}. **{rec.get('name', '?')}** ({k.get('step', '')}; {where}; {when or 'no time'})  ")
        lines.append(f"   {k.get('why', '')}")
    lines += ["", f"**Gaps:** {p.get('gaps', '')}", f"**Core covered:** {p.get('core_covered', '')} · "
              f"candidates {p.get('scope', {}).get('total')} ({p.get('scope', {}).get('near')} near) · {p.get('_seconds')}s", ""]
    return "\n".join(lines)

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--scenarios", default=os.path.join(HERE, "scenarios-all.json"))
    ap.add_argument("--ids", help="comma-separated, e.g. S25,S26")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--wait", type=int, default=120, help="seconds between plans (rate limit is 30/hour)")
    a = ap.parse_args()
    S = load(a.scenarios)
    if a.list:
        for s in S:
            print(f"{s['id']:4} {s.get('town', ''):18} {s['need'][:80]}")
        return
    pick = S if a.all else [s for s in S if a.ids and s["id"] in a.ids.split(",")]
    if not pick:
        sys.exit("Choose scenarios with --ids S25,S26 or --all (see --list).")
    code = os.environ.get("ASSIST_CODE")
    if not code:
        sys.exit("Set ASSIST_CODE first (see the top of this file).")
    stamp = datetime.now().strftime("%Y-%m-%d-%H%M")
    jpath, mpath = f"plans-{stamp}.json", f"plans-{stamp}.md"
    results = {}
    for n, s in enumerate(pick, 1):
        print(f"[{n}/{len(pick)}] {s['id']} {s.get('town', '')} ...", end=" ", flush=True)
        try:
            p = run_one(s, code)
        except Exception as e:
            p = {"error": f"{type(e).__name__}: {e}"}
        print(p.get("error") or f"{len(p.get('picks', []))} picks, {p.get('_seconds')}s")
        if p.get("error") == "bad_code":
            sys.exit("Access code rejected: check ASSIST_CODE. Stopping so the worker doesn't lock you out.")
        results[s["id"]] = {"scenario": s, "plan": p}
        json.dump(results, open(jpath, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
        with open(mpath, "w", encoding="utf-8") as f:
            f.write(f"# Assist plans {stamp}\n\n" + "\n".join(md(r["scenario"], r["plan"]) for r in results.values()))
        if n < len(pick):
            time.sleep(a.wait)
    print(f"\nSaved {jpath} and {mpath}. Send me the .json and I'll review them.")

if __name__ == "__main__":
    main()
