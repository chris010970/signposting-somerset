"""One command for the whole site: python build_all.py [services.csv] [test]
(add "test" to build only the test copy of the directory)

build/ holds one folder per part of the site:
  directory/  the interactive directory (template.html, build.py, build_v2.py, Assist sources)
  tools/      the tools page, /tools/: Assist on its own (build_tools.py, template.html, tools.js)
  browse/     the town pages (build_browse.py; run it separately, it reads the sheet or a CSV)
  analytics/  community insights (coming; make_analytics_data.py rebuilds docs/assets/analytics-lsoa.geojson)
  core/       code shared by the directory and the tools page
  shared/     build helpers (base path, stitching core/ into pages)
(Data and Assist tools, such as run_scenarios.py, live in src/, not here.)

Writes directory/github/directory/index.html (published to docs/directory/),
directory/github/test/directory/index.html (docs/test/directory/),
tools/out/tools/index.html (docs/tools/) and tools/out/test/tools/index.html (docs/test/tools/)."""
import subprocess, sys, pathlib
HERE = pathlib.Path(__file__).parent
args = [a for a in sys.argv[1:] if a != "test"]
subprocess.run([sys.executable, str(HERE / "directory" / "build.py"), *args], check=True)
subprocess.run([sys.executable, str(HERE / "directory" / "build_v2.py"), *(["test"] if "test" in sys.argv[1:] else [])], check=True)
subprocess.run([sys.executable, str(HERE / "tools" / "build_tools.py")], check=True)
