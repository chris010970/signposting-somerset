"""Build Assist's Cloudflare Worker: cloudflare-worker.js (in this folder), to paste into Cloudflare.

Usage: python build_worker.py
It is worker-template.js with the town centres (build/directory/towns.json), the name scrubber (scrub.js) and a version stamp
filled in. Keep a copy in src/cloudflare-worker.js. Setup from scratch: ASSIST-SETUP.md.
"""
import datetime, json, pathlib, zoneinfo

HERE = pathlib.Path(__file__).resolve().parent
TOWNS = json.loads((HERE.parent.parent / "directory" / "towns.json").read_text(encoding="utf-8"))["TOWNS"]
STAMP = datetime.datetime.now(zoneinfo.ZoneInfo("Europe/London")).strftime("%Y-%m-%d %H:%M")
worker = ((HERE / "worker-template.js").read_text(encoding="utf-8")
          .replace("/*TOWNS*/{}", json.dumps(TOWNS))
          .replace("/*WORKER_VERSION*/", STAMP)
          .replace("/*SCRUB*/", (HERE / "scrub.js").read_text(encoding="utf-8")))
(HERE / "cloudflare-worker.js").write_text(worker, encoding="utf-8")
print("cloudflare-worker.js, version", STAMP)
