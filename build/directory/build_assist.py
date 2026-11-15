"""Build the Assist demo: github/assist/index.html (page) and assist/cloudflare-worker.js (relay to paste into Cloudflare).
The Worker's address goes in assist/worker_url.txt once you have it."""
import json, re, pathlib
HERE = pathlib.Path(__file__).parent
TOWNS = json.loads(re.search(r"const TOWNS = (\{.*?\});", (HERE / "index.html").read_text(encoding="utf-8")).group(1))
style = (HERE / "ask-template.html").read_text(encoding="utf-8")
style = style[style.index("<style>"):style.index("</style>") + 8]
url_file = HERE / "assist" / "worker_url.txt"
worker_url = url_file.read_text().strip() if url_file.exists() else ""
page = ((HERE / "assist" / "page-template.html").read_text(encoding="utf-8")
        .replace("/*STYLE*/", style)
        .replace("/*TOWN_NAMES*/[]", json.dumps(sorted(TOWNS), ensure_ascii=False))
        .replace("/*WORKER_URL*/", worker_url)
        .replace("/*BANNER*/", "data:image/webp;base64," + __import__("base64").b64encode((HERE / "banner-wide.webp").read_bytes()).decode()))
(HERE / "github" / "assist").mkdir(parents=True, exist_ok=True)
(HERE / "github" / "assist" / "index.html").write_text(page, encoding="utf-8")
import datetime, zoneinfo
WSTAMP = datetime.datetime.now(zoneinfo.ZoneInfo("Europe/London")).strftime("%Y-%m-%d %H:%M")
worker = (HERE / "assist" / "worker-template.js").read_text(encoding="utf-8").replace("/*TOWNS*/{}", json.dumps(TOWNS)).replace("/*WORKER_VERSION*/", WSTAMP).replace("/*SCRUB*/", (HERE / "assist" / "scrub.js").read_text(encoding="utf-8"))
(HERE / "assist" / "cloudflare-worker.js").write_text(worker, encoding="utf-8")
print("github/assist/index.html", "(worker URL set)" if worker_url else "(no worker URL yet)", "+ assist/cloudflare-worker.js", "version", WSTAMP)
