"""One command for the whole site: python build_all.py [services.csv] [test]
(add "test" to build only the test copy)

build/ holds one folder per part of the site:
  directory/  the interactive directory (template.html, build.py, build_v2.py, Assist sources)
  analytics/  the Analytics page (coming; make_analytics_data.py rebuilds docs/assets/analytics-lsoa.geojson)
  browse/     the Browse pages (coming)
  shared/     pieces used by more than one part (coming)
  tools/      checks and Assist test scenarios

Today this builds the directory: directory/build.py, then directory/build_v2.py (adds Assist),
writing directory/github/directory/index.html (live, published to docs/directory/) and
directory/github/test/index.html (test, published to docs/test/)."""
import subprocess, sys, pathlib
HERE = pathlib.Path(__file__).parent
args = [a for a in sys.argv[1:] if a != "test"]
subprocess.run([sys.executable, str(HERE / "directory" / "build.py"), *args], check=True)
subprocess.run([sys.executable, str(HERE / "directory" / "build_v2.py"), *(["test"] if "test" in sys.argv[1:] else [])], check=True)
