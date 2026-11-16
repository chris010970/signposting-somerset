"""Rebuild the Places pages and put them in docs/, ready to commit: one command instead of copying folders by hand.

    python build/places/publish_places.py                       # from the published sheet
    python build/places/publish_places.py path/to/services.csv  # from a CSV

It runs build_places.py, then copies out/directory/places/, out/test/directory/places/ and out/sitemap.xml into docs/,
but only if something other than the version stamp and the "Updated" date has changed, so a rebuild with the same
records changes nothing. GitHub runs this every night (.github/workflows/places.yml) and commits any change.
Prints "changed" or "no change" as its last line.
"""
import filecmp, re, shutil, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DOCS = HERE.parent.parent / "docs"
OUT = HERE / "out"
PAIRS = [(OUT / "directory" / "places", DOCS / "directory" / "places"),
         (OUT / "test" / "directory" / "places", DOCS / "test" / "directory" / "places"),
         (OUT / "sitemap.xml", DOCS / "sitemap.xml")]
# What changes on every build, whatever the records: the version line and the "Updated" date
STAMPS = re.compile(r"Version: \w+ \d{4}-\d\d-\d\d \d\d:\d\d|Updated \d{1,2} \w+ \d{4}")

def files(p):
    return {f.relative_to(p): f for f in p.rglob("*") if f.is_file()} if p.is_dir() else {Path(): p} if p.exists() else {}

def same(a, b):
    """Do the two builds hold the same pages, apart from their stamps?"""
    fa, fb = files(a), files(b)
    if fa.keys() != fb.keys(): return False
    for k in fa:
        if fa[k].suffix in (".html", ".xml"):
            if STAMPS.sub("", fa[k].read_text(encoding="utf-8")) != STAMPS.sub("", fb[k].read_text(encoding="utf-8")): return False
        elif not filecmp.cmp(fa[k], fb[k], shallow=False): return False
    return True

if __name__ == "__main__":
    if OUT.exists(): shutil.rmtree(OUT)   # a clean build, so towns taken off the list don't linger
    subprocess.run([sys.executable, str(HERE / "build_places.py"), *sys.argv[1:]], check=True)
    if all(same(new, old) for new, old in PAIRS):
        print("no change"); sys.exit(0)
    for new, old in PAIRS:
        if old.is_dir(): shutil.rmtree(old)
        if new.is_dir(): shutil.copytree(new, old)
        else: shutil.copy2(new, old)
    print("changed")
