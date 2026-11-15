"""Site settings shared by the builds (build/site.json)."""
import json, re
from pathlib import Path

SETTINGS = json.loads((Path(__file__).resolve().parent.parent / "site.json").read_text(encoding="utf-8"))
BASE = SETTINGS.get("base_path", "").rstrip("/")

# href="/…", src="/…", url("/…") and url('/…'): links and images from the site's root (not //host links)
_ROOT_REF = re.compile(r'''((?:href|src)=["']|url\(["']?)/(?!/)''')

def rebase(html):
    """Put the site's folder in front of every root link and image, so the pages work under a sub-folder."""
    return _ROOT_REF.sub(lambda m: m.group(1) + BASE + "/", html) if BASE else html
