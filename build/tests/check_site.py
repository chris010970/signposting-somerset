"""Check the published site in docs/: every link and image inside the site leads to a file, and the built pages are complete.

Run: python build/tests/check_site.py      (also run by run_tests.py)
It starts from the site's main pages and follows every link to another page of the site, as a visitor could, reading the
files in docs/ directly (no server needed). Links are expected to start with the site's folder (base_path in build/site.json).
Also checked on every page: a title; no markers left unfilled by the build; on the Places pages, dates in 2026-12-17 form
and the page's records (which the cards are drawn from) readable.
"""
import json, re, sys, urllib.parse
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
DOCS = ROOT / "docs"
BASE = json.loads((ROOT / "build" / "site.json").read_text(encoding="utf-8")).get("base_path", "").rstrip("/")
START = ["/", "/main/", "/directory/", "/directory/places/", "/tools/", "/test/", "/test/directory/", "/test/directory/places/", "/test/tools/"]
if (DOCS / "next" / "directory" / "index.html").is_file(): START.append("/next/directory/")   # the next design's preview, once copied
SKIP = ("http:", "https:", "mailto:", "tel:", "data:", "#", "javascript:", "//")
LINK = re.compile(r'(?:href|src)="([^"]+)"|value="(/[^"]*)"')

def file_for(path):
    """The docs/ file a site address is served from, or None."""
    if not path.startswith(BASE + "/"): return None
    f = DOCS / urllib.parse.unquote(path[len(BASE) + 1:])
    if f.is_dir(): f = f / "index.html"
    return f if f.is_file() else None

def check():
    problems, seen, pages = [], set(), 0
    todo = deque((BASE + p, "(start)") for p in START)
    while todo:
        path, came_from = todo.popleft()
        path = path.split("#")[0].split("?")[0]
        if path in seen: continue
        seen.add(path)
        f = file_for(path)
        if not f:
            problems.append(f"broken link: {path} (on {came_from})"); continue
        if f.suffix != ".html": continue
        pages += 1
        text = f.read_text(encoding="utf-8", errors="replace")
        if not re.search(r"<title>[^<]+</title>", text): problems.append(f"no title: {path}")
        left = set(re.findall(r"/\*[A-Z_]{3,}\*/|<!--[A-Z_]{3,}-->|/\*@(?:core|page):[^*]+\*/", text))
        if left: problems.append(f"unfilled markers on {path}: {', '.join(sorted(left))}")
        data = re.search(r'<script type="application/json" id="places-data">(.*?)</script>', text, re.S)
        if data:   # a Places page: its records must read back, one for every card
            try:
                n = len(json.loads(data.group(1)))
                if max(map(int, re.findall(r'data-i="(\d+)"', text)), default=-1) >= n: problems.append(f"a card has no record on {path}")
            except ValueError as ex: problems.append(f"records unreadable on {path}: {ex}")
        bad_dates = set(re.findall(r'data-dates="([^"]*\d+/\d+/\d{4}[^"]*)"', text))
        if bad_dates: problems.append(f"dates not cleaned up on {path}: {', '.join(sorted(bad_dates))}")
        for m in LINK.finditer(text):
            link = m.group(1) or m.group(2)
            if link.startswith(SKIP) or "${" in link or link.startswith("/*"): continue
            target = urllib.parse.urljoin(path, link)
            if not target.startswith(BASE + "/"): problems.append(f"link outside the site folder: {link} (on {path})"); continue
            todo.append((target, path))
    return pages, len(seen), problems

if __name__ == "__main__":
    pages, addresses, problems = check()
    print(f"Site check: {pages} pages, {addresses} addresses, {len(problems)} problems")
    for p in problems: print("  " + p)
    sys.exit(1 if problems else 0)
