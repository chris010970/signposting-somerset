"""Build Assist's Cloudflare Worker: src/cloudflare-worker.js (in the repo), the one file to paste into Cloudflare.

Usage: python build_worker.py
It is worker-template.js with its pieces put in, so the result stands alone (no imports, nothing loaded while it runs):
the site's shared code from build/core/ (sheet reading, schedule rules, places and distances, wording) and the name
scrubber (scrub.js, shared with the Assist page), the town centres (build/directory/towns.json) and a version stamp.
Then paste it into the Worker in Cloudflare (Edit code, replace everything, Deploy): see ASSIST-SETUP.md.
The tests (build/tests/worker.test.mjs) run this file as Cloudflare would.
"""
import datetime, json, pathlib, sys, zoneinfo

HERE = pathlib.Path(__file__).resolve().parent
BUILD = HERE.parent.parent
OUT = BUILD.parent / "src" / "cloudflare-worker.js"   # committed: the copy pasted into Cloudflare
sys.path.insert(0, str(BUILD / "shared"))
from core import inline_core

TOWNS = json.loads((BUILD / "directory" / "towns.json").read_text(encoding="utf-8"))["TOWNS"]
STAMP = datetime.datetime.now(zoneinfo.ZoneInfo("Europe/London")).strftime("%Y-%m-%d %H:%M")


def build(stamp=STAMP):
    """The Worker's code, with its pieces put in."""
    worker = inline_core((HERE / "worker-template.js").read_text(encoding="utf-8"), HERE)
    for mark, value in (("/*TOWNS*/{}", json.dumps(TOWNS)), ("/*WORKER_VERSION*/", stamp)):
        assert worker.count(mark) == 1, f"{mark} should appear once in the Worker"
        worker = worker.replace(mark, value)
    return worker


if __name__ == "__main__":
    OUT.write_text(build(), encoding="utf-8")
    print("src/cloudflare-worker.js, version", STAMP)
