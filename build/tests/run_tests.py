"""Run every check: python build/tests/run_tests.py

1. the builds' own tests (test_build.py: records clean-up, settings files, stitching pages together)
2. the pages' schedule rules and sheet clean-up (schedule.test.mjs; needs Node.js, skipped with a note if it isn't installed)
3. the directory and tools pages still build (into their out folders; docs/ is not touched)
4. the published site in docs/: links, titles, nothing left unfilled (check_site.py)

GitHub runs this on every push (.github/workflows/tests.yml). Exit code 0 means everything passed.
"""
import shutil, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BUILD = HERE.parent
steps = [
    ("Build tests", [sys.executable, "-m", "unittest", "discover", "-s", str(HERE), "-p", "test_*.py"]),
    ("Schedule tests", ["node", "--test", "--test-reporter=spec", str(HERE / "schedule.test.mjs")] if shutil.which("node") else None),
    ("Directory builds", [sys.executable, str(BUILD / "directory" / "build.py")]),
    ("Tools page builds", [sys.executable, str(BUILD / "tools" / "build_tools.py")]),
    ("Site check", [sys.executable, str(HERE / "check_site.py")]),
]
failed = []
for name, cmd in steps:
    if cmd is None:
        print(f"--- {name}: skipped (Node.js isn't installed)"); continue
    print(f"--- {name}", flush=True)
    if subprocess.run(cmd, cwd=BUILD).returncode: failed.append(name)
print("\nAll passed." if not failed else "\nFAILED: " + ", ".join(failed))
sys.exit(1 if failed else 0)
