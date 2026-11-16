"""Helpers the page builds share: the version stamp, filling markers, and wrapping a page as a full HTML document."""
import datetime, re, zoneinfo

LIVE = "https://signpostingsomerset.org.uk"   # the public site (canonical links, the address in Assist's plans)
NOW = datetime.datetime.now(zoneinfo.ZoneInfo("Europe/London"))
STAMP = NOW.strftime("%Y-%m-%d %H:%M")         # the "Version:" line on every page
NOINDEX = '<meta name="robots" content="noindex, nofollow">'   # test copies: kept out of search engines

def put(page, marker, text):
    """Replace a marker that must appear exactly once (a missing or doubled marker stops the build)."""
    n = page.count(marker)
    assert n == 1, f"marker {marker!r} found {n} times"
    return page.replace(marker, text)

def section(text, name):
    """One piece of a file split by marker lines such as <!--TAB-->, <!--HDR-->: the lines after <!--NAME--> up to the next."""
    m = re.search(rf"<!--{name}-->\n(.*?)(?=\n<!--[A-Z]+-->|\Z)", text, re.S)
    assert m, f"<!--{name}--> not found"
    return m.group(1).rstrip() + "\n"

def document(pg):
    """The full document: <head> holds everything up to the end of the page's styles, <body> the rest."""
    k = pg.rfind("</style>", 0, pg.find("<div")) + len("</style>")
    return ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            + pg[:k] + "\n</head>\n<body>\n" + pg[k:] + "\n</body>\n</html>\n")
