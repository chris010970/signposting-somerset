"""One command for the whole site: python build_all.py [services.csv] [test]
(add "test" to build only the test copy of the directory)

build/ holds one folder per part of the site:
  directory/  the interactive directory (template.html, directory.css, js/, build.py, towns.json)
  tools/      the tools page, /tools/: Assist and Analytics (build_tools.py, template.html, tools.js, assist/, analytics/)
  places/     the Places pages, the directory's Places tab (build_places.py; run it separately, it reads the sheet or a CSV)
  analytics/  Analytics design record and data (make_analytics_data.py rebuilds docs/assets/analytics-lsoa.geojson)
  next/       the next design's preview, /next/directory/ (build.py, template.html, next.css): standalone, deleted when it goes live
  core/       code and data shared by the directory, the tools page and the Places pages
  shared/     build helpers (base path, stitching pages together, version stamp, reading records)
  tests/      checks: python tests/run_tests.py
(Data and Assist tools, such as run_scenarios.py, live in src/, not here.)

Writes directory/github/directory/index.html (published to docs/directory/),
directory/github/test/directory/index.html (docs/test/directory/),
tools/out/tools/index.html (docs/tools/), tools/out/test/tools/index.html (docs/test/tools/)
and next/github/next/directory/index.html (docs/next/directory/: the next design's preview)."""
import subprocess, sys, pathlib
HERE = pathlib.Path(__file__).parent
subprocess.run([sys.executable, str(HERE / "directory" / "build.py"), *sys.argv[1:]], check=True)
subprocess.run([sys.executable, str(HERE / "tools" / "build_tools.py")], check=True)
subprocess.run([sys.executable, str(HERE / "next" / "build.py")], check=True)   # the next design's preview (delete when it goes live)
