"""One command for the whole site: python build_all.py [services.csv] [test]
(add "test" to build only the test copy)
Runs build.py (the directory) then build_v2.py (adds Assist), writing github/main/ and github/test/."""
import subprocess, sys, pathlib
HERE = pathlib.Path(__file__).parent
args = [a for a in sys.argv[1:] if a != "test"]
subprocess.run([sys.executable, str(HERE / "build.py"), *args], check=True)
subprocess.run([sys.executable, str(HERE / "build_v2.py"), *(["test"] if "test" in sys.argv[1:] else [])], check=True)
