"""Page survey: for each record, can its details be found on the web automatically, and does src/sources.csv have a rule for it?

    python build/watch/survey.py                 # reads the published sheet
    python build/watch/survey.py services.csv    # or a saved copy

For each record it decides where to look, in this order:
  1. its rule in src/sources.csv (the source column names a source_id): the rule's pages, or the record's url when
     the rule says "each record's url". Rules whose method is done by hand (a PDF or flyer supplied by a person, the
     maintainer) are not fetched: the record is listed as manual, with the date it's next due (last_checked + recheck_every).
  2. otherwise the links in its source column, then its url.
Every page is fetched once (one request at a time per site, with a pause between them), and the record's own details
(postcode, days, start time, phone, email) are looked for in the page's visible text. Nothing in the sheet, the
sources file or the site is changed. Writes to out_dir (build/watch/watch.json):

- survey.md: the summary to read first
- survey.csv: one row per record: which rule, which page, what was found, the result
- rules.csv: one row per rule in sources.csv: does it still work, how many records are overdue
- sources-proposed.csv: new rules, in sources.csv's own format, for pages that show records with no rule yet;
  sources-proposed-records.csv says which records each would cover (add its source_id to their source column)
- pages.json: one entry per page: how it answered and a fingerprint (hash) of its visible text. The next run compares
  fingerprints, so the summary also says how many pages changed since the last run.

Uses only Python's standard library, so it runs anywhere. GitHub runs it on demand: Actions -> "Survey pages".
"""
import csv, datetime, hashlib, html.parser, json, re, sys, threading, time, urllib.error, urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlparse

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE.parent / "shared"))
from records import read_records

SETTINGS = json.loads((HERE / "watch.json").read_text(encoding="utf-8"))

# ---- the page's visible text ----
SKIP_TAGS = {"script", "style", "noscript", "template", "svg", "head"}
BLOCK_TAGS = {"p", "div", "br", "li", "tr", "td", "th", "h1", "h2", "h3", "h4", "h5", "h6", "section", "article", "table", "ul", "ol", "dd", "dt"}

class _Text(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True); self.parts = []; self.skip = 0
    def handle_starttag(self, tag, attrs):
        if tag in SKIP_TAGS: self.skip += 1
        elif tag in BLOCK_TAGS: self.parts.append(" ")
    def handle_endtag(self, tag):
        if tag in SKIP_TAGS and self.skip: self.skip -= 1
        elif tag in BLOCK_TAGS: self.parts.append(" ")
    def handle_data(self, data):
        if not self.skip: self.parts.append(data)

def page_text(html_text):
    """The words a visitor sees: no scripts, styles or hidden templates."""
    p = _Text()
    try: p.feed(html_text); p.close()
    except Exception: pass   # a badly broken page: keep what was read
    return "".join(p.parts)

def normalise(text):
    """Lower case, one space between words: so only real changes in wording change the fingerprint."""
    return re.sub(r"\s+", " ", text.replace("\xa0", " ")).strip().lower()

def fingerprint(norm):
    return hashlib.sha256(norm.encode("utf-8")).hexdigest()[:16]

# ---- a record's details, in the ways a web page might write them ----
DAYS = {"mon": ["monday", "mon"], "tue": ["tuesday", "tues", "tue"], "wed": ["wednesday", "weds", "wed"],
        "thu": ["thursday", "thurs", "thur", "thu"], "fri": ["friday", "fri"], "sat": ["saturday", "sat"], "sun": ["sunday", "sun"]}

def day_words(days):
    """'Tue;Thu' or 'Mon-Fri' -> the days named (a range by its two ends)."""
    out = []
    for part in re.split(r"[;,]", days or ""):
        for d in part.split("-"):
            d = d.strip().lower()[:3]
            if d in DAYS and d not in out: out.append(d)
    return out

def time_forms(t):
    """'14:30' -> 14:30, 2:30pm, 2.30pm, 2.30 pm ...; '10:00' also 10am, 10 am. Only the start time is looked for."""
    m = re.match(r"(\d{1,2}):(\d\d)", t or "")
    if not m: return []
    h, mm = int(m[1]), m[2]; ap = "am" if h < 12 else "pm"; h12 = h % 12 or 12
    forms = {f"{h:02d}:{mm}", f"{h}:{mm}", f"{h}.{mm}", f"{h12}:{mm}{ap}", f"{h12}.{mm}{ap}", f"{h12}:{mm} {ap}", f"{h12}.{mm} {ap}"}
    if mm == "00": forms |= {f"{h12}{ap}", f"{h12} {ap}", f"{h12}:00", f"{h12}.00"}
    if h == 12 and mm == "00": forms.add("noon")
    return sorted(forms)

def phone_numbers(phone):
    """The UK numbers in the phone field, digits only (a field can hold two: '0800 ... or 01823 ...')."""
    nums = [re.sub(r"\D", "", n) for n in re.findall(r"[\d][\d \-]{8,}\d", phone or "")]
    return [n for n in nums if len(n) >= 10]

def details(r):
    """What can be looked for on the page, by name. Only details the record has are included."""
    d = {}
    if r.get("postcode"): d["postcode"] = r["postcode"]
    if day_words(r.get("days")): d["days"] = day_words(r["days"])
    if time_forms(r.get("times")): d["time"] = time_forms(r["times"])
    if phone_numbers(r.get("phone")): d["phone"] = phone_numbers(r["phone"])
    if "@" in r.get("email", ""): d["email"] = r["email"].lower()
    return d

def _has(norm, word):
    return re.search(r"(?<![\w.:])" + re.escape(word) + r"(?![\w:])", norm) is not None

def found_on_page(r, norm):
    """For each detail the record has: is it on the page? {name: True/False}."""
    digits = re.sub(r"(?<=\d)[\s\-().]+(?=\d)", "", norm)
    out = {}
    for k, v in details(r).items():
        if k == "postcode":
            pc = re.sub(r"\s+", "", v.lower()); out[k] = re.search(re.escape(pc[:-3]) + r"\s*" + re.escape(pc[-3:]), norm) is not None
        elif k == "days":
            out[k] = all(any(_has(norm, w) for w in DAYS[d]) for d in v)
        elif k == "time":
            out[k] = any(_has(norm, f) for f in v)
        elif k == "phone":
            out[k] = any(n in digits or ("44" + n[1:]) in digits for n in v)
        elif k == "email":
            out[k] = v in norm
    return out

def verdict(page, found):
    """One phrase per record, in the order the summary lists them."""
    if page["kind"] != "page": return page["kind"]
    if not found: return "nothing to look for"
    n, k = len(found), sum(found.values())
    if k == n or k >= 3: return "details found"
    if k: return "some details found"
    return "details not on this page"

# ---- fetching ----
def host(url):
    return urlparse(url).netloc.lower().removeprefix("www.")

def fetch(url):
    """How the page answered, and its visible text."""
    p = {"url": url, "status": None, "final_url": url, "kind": "page", "chars": 0, "fingerprint": "", "error": ""}
    h = host(url)
    if any(h == m or h.endswith("." + m) for m in SETTINGS["manual_hosts"]):
        p["kind"] = "manual (social media)"; return p, ""
    req = urllib.request.Request(url, headers={"User-Agent": SETTINGS["user_agent"], "Accept": "text/html,application/xhtml+xml,*/*;q=0.8", "Accept-Language": "en-GB,en;q=0.9"})
    try:
        with urllib.request.urlopen(req, timeout=SETTINGS["timeout_s"]) as res:
            p["status"], p["final_url"] = res.status, res.geturl()
            ctype = res.headers.get("Content-Type", "")
            if "pdf" in ctype.lower() or url.lower().endswith(".pdf"):
                p["kind"] = "pdf"; return p, ""
            body = res.read(3_000_000).decode(res.headers.get_content_charset() or "utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        p["status"], p["kind"] = e.code, f"unreachable ({e.code})"; return p, ""
    except Exception as e:   # timeouts, refused connections, certificate problems, unknown hosts
        p["kind"], p["error"] = "unreachable (no answer)", type(e).__name__ + ": " + str(e)[:120]; return p, ""
    norm = normalise(page_text(body))
    p["chars"], p["fingerprint"] = len(norm), fingerprint(norm)
    if len(norm) < SETTINGS["min_text_chars"]: p["kind"] = "needs a browser (little text)"
    return p, norm

def fetch_all(urls):
    """Every page, one site at a time per worker, with a pause between pages on the same site."""
    by_host = defaultdict(list)
    for u in urls: by_host[host(u)].append(u)
    pages, texts, lock = {}, {}, threading.Lock()
    def one_site(us):
        for i, u in enumerate(us):
            if i: time.sleep(SETTINGS["delay_s"])
            p, t = fetch(u)
            with lock: pages[u], texts[u] = p, t
    with ThreadPoolExecutor(SETTINGS["workers"]) as ex:
        list(ex.map(one_site, by_host.values()))
    return pages, texts

# ---- the sources file (src/sources.csv): where and how each kind of record is checked ----
URL_RE = re.compile(r"https?://[^\s;,)\"']+")

def links(text):
    return [u.rstrip(".") for u in URL_RE.findall(text or "")]

def load_sources():
    path = ROOT / SETTINGS["sources_file"]
    rules = {}
    with open(path, encoding="utf-8-sig") as fh:
        table = list(csv.DictReader(fh))
    for x in table:
        sid = (x.get("source_id") or "").strip()
        if not sid: continue
        m = (x.get("method") or "").lower()
        where = x.get("where_to_look") or ""
        kind = ("manual" if any(w in m for w in SETTINGS["manual_methods"])
                else "browser" if any(w in m for w in SETTINGS["browser_methods"]) else "web")
        rules[sid] = {**x, "kind": kind, "pages": links(where),
                      "per_record": bool(re.search(r"each [\w' ]*(url|page)|url field|record's url", where, re.I))}
    return rules

def rule_ids(r, rules):
    return [t.strip() for t in re.split(r"[;]", r.get("source", "")) if t.strip() in rules]

MONTHS = {"1 month": 1, "3 months": 3, "6 months": 6, "12 months": 12, "1 year": 12}

def due(r, rule):
    """When the record is next due a check: its check date plus the rule's interval (when it's a number of months)."""
    n = MONTHS.get((rule.get("recheck_every") or "").strip().lower())
    m = re.match(r"(\d{4})-(\d\d)-(\d\d)", r.get("last_checked", ""))
    if not (n and m): return ""
    y, mo = int(m[1]), int(m[2]) + n
    y, mo = y + (mo - 1) // 12, (mo - 1) % 12 + 1
    return f"{y}-{mo:02d}-{m[3]}"

def score(found):
    return (sum(found.values()), -len(found)) if found else (-1, 0)

# ---- the reports ----
def main(csv_path=None):
    out = ROOT / SETTINGS["out_dir"]; out.mkdir(parents=True, exist_ok=True)
    recs, rules = read_records(csv_path), load_sources()
    today = datetime.datetime.now(datetime.timezone.utc).date().isoformat()

    # Which pages to look at for each record, in order: the rule's pages, then the record's own source links, then its url
    plan = []
    for r in recs:
        ids = rule_ids(r, rules)
        rule = rules[ids[0]] if ids else None
        own = links(r.get("source")) + ([r["url"]] if re.match(r"https?://", r.get("url", ""), re.I) else [])
        rule_pages = [] if not rule else (rule["pages"] + ([r["url"]] if rule["per_record"] and r.get("url") else []))
        plan.append((r, ids, rule, list(dict.fromkeys(rule_pages)), [u for u in dict.fromkeys(own) if u not in rule_pages]))
    urls = sorted({u for _, _, rule, rp, op in plan if not (rule and rule["kind"] == "manual") for u in rp + op})
    started = time.time()
    pages, texts = fetch_all(urls)

    rows = []
    for r, ids, rule, rule_pages, own_pages in plan:
        row = {"name": r["name"], "rule": ";".join(ids) or "none", "rule_method": rule["method"] if rule else "", "last_checked": r.get("last_checked", "")}
        if rule and rule["kind"] == "manual":
            row.update(result="manual: checked by hand under its rule", due=due(r, rule)); rows.append(row); continue
        best = None
        for where, us in (("rule page", rule_pages), ("record's own page", own_pages)):
            for u in us:
                p = pages.get(u)
                if not p or p["kind"] != "page": continue
                f = found_on_page(r, texts[u])
                if best is None or score(f) > score(best[2]): best = (where, u, f)
        tried = rule_pages + own_pages
        problems = "; ".join(f"{u} ({pages[u]['kind']})" for u in tried if u in pages and pages[u]["kind"] != "page")
        if best and best[2] and sum(best[2].values()):
            where, u, f = best
            row.update(page=u, found=f"{sum(f.values())} of {len(f)}", **{k: "yes" if v else "no" for k, v in f.items()})
            ok = sum(f.values()) == len(f) or sum(f.values()) >= 3
            if rule: row["result"] = ("rule works" if where == "rule page" else "rule's page doesn't show it; found on the record's own page") + ("" if ok else " (some details)")
            else: row["result"] = "no rule; found on the record's own page" + ("" if ok else " (some details)")
        elif not tried:
            row["result"] = "no rule and no web address"
        elif best:
            row.update(page=best[1], found=f"0 of {len(best[2])}" if best[2] else "", result="not found: page answers but doesn't show the details" if best[2] else "nothing to look for (record has no days, times, postcode, phone or email)")
        else:
            row["result"] = "not found: page can't be read"
        row["problems"] = problems
        if rule: row["due"] = due(r, rule)
        rows.append(row)
    cols = ["name", "rule", "rule_method", "result", "page", "found", "postcode", "days", "time", "phone", "email", "problems", "last_checked", "due"]
    with open(out / "survey.csv", "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, cols, restval=""); w.writeheader(); w.writerows(rows)

    # Each existing rule: does it still work?
    by_rule = defaultdict(list)
    for row in rows:
        for sid in row["rule"].split(";"):
            if sid != "none": by_rule[sid].append(row)
    rule_rows = []
    for sid, rule in rules.items():
        rs = by_rule.get(sid, []); c = Counter(x["result"].split(" (")[0] for x in rs)
        dues = sorted(x.get("due", "") for x in rs if x.get("due"))
        status = ("not used by any record" if not rs else "manual" if rule["kind"] == "manual"
                  else "works" if c.get("rule works", 0) == len(rs) else "partly works" if c.get("rule works") else "doesn't work")
        rule_rows.append({"source_id": sid, "method": rule["method"], "records": len(rs), "status": status,
                          "rule works": c.get("rule works", 0), "found elsewhere": c.get("rule's page doesn't show it; found on the record's own page", 0),
                          "not found": sum(v for k, v in c.items() if k.startswith("not found")),
                          "earliest due": dues[0] if dues else "", "overdue": sum(d < today for d in dues), "pages": " ".join(rule["pages"])})
    with open(out / "rules.csv", "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, list(rule_rows[0])); w.writeheader(); w.writerows(rule_rows)

    # New rules to add: one per page that shows records which have no rule yet
    fields = ["source_id", "provider", "where_to_look", "method", "confirms", "instructions", "if_unavailable", "recheck_every"]
    taken, proposed, assign = set(rules), [], []
    by_page = defaultdict(list)
    for r, row in zip([x[0] for x in plan], rows):
        if row["result"].startswith("no rule; found"): by_page[row["page"]].append((r, row))
    for u, items in sorted(by_page.items(), key=lambda kv: -len(kv[1])):
        base = re.sub(r"[^a-z0-9]+", "-", (host(u).split(".")[0] + "-" + (urlparse(u).path.strip("/").split("/")[-1] or "home")).lower()).strip("-")[:40]
        sid, n = base, 2
        while sid in taken: sid, n = f"{base}-{n}", n + 1
        taken.add(sid)
        conf = [k for k in ("postcode", "days", "time", "phone", "email") if any(row.get(k) == "yes" for _, row in items)]
        provs = Counter(r.get("provider", "") for r, _ in items)
        proposed.append({"source_id": sid, "provider": provs.most_common(1)[0][0], "where_to_look": u, "method": "Web page",
                         "confirms": "; ".join("times" if k == "time" else k for k in conf),
                         "instructions": "Proposed by the page survey: compare the details listed under 'confirms'.",
                         "if_unavailable": "Flag: page unreachable; keep existing values.", "recheck_every": SETTINGS["default_recheck"]})
        assign += [{"name": r["name"], "source_now": r.get("source", ""), "add_source_id": sid} for r, _ in items]
    with open(out / "sources-proposed.csv", "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, fields); w.writeheader(); w.writerows(proposed)
    with open(out / "sources-proposed-records.csv", "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, ["name", "source_now", "add_source_id"]); w.writeheader(); w.writerows(assign)

    # Fingerprints, compared with the last run
    prev_file = out / "pages.json"
    old = json.loads(prev_file.read_text(encoding="utf-8")) if prev_file.exists() else {}
    prev, prev_run = old.get("pages", {}), old.get("run", "the previous run")
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    prev_file.write_text(json.dumps({"run": stamp, "pages": pages}, indent=1, sort_keys=True), encoding="utf-8")

    res = Counter(r["result"] for r in rows); rs = Counter(x["status"] for x in rule_rows)
    md = [f"# Page survey, {stamp}", "",
          (f"{len(recs)} records, {len(rules)} rules in {SETTINGS['sources_file']}, {len(urls)} pages fetched from {len({host(u) for u in urls})} sites. "
           f"Took {round((time.time() - started) / 60, 1)} minutes."), "",
          "## Records", "", "| Result | Records |", "|---|---|"] + [f"| {a} | {b} |" for a, b in res.most_common()]
    md += ["", "A record's details are its postcode, days, start time, phone and email; \"found\" means every one it has is on the page, or at least three are.", "",
           "## Rules", "", "| Status | Rules |", "|---|---|"] + [f"| {a} | {b} |" for a, b in rs.most_common()]
    md += ["", f"rules.csv has each rule's results. {sum(x['overdue'] for x in rule_rows)} records are past their rule's recheck date.", "",
           "## New rules proposed", "",
           (f"{len(proposed)} pages show records that have no rule yet ({len(assign)} records). sources-proposed.csv has them in sources.csv's format; "
            "sources-proposed-records.csv says which records each one covers.")]
    cant = defaultdict(list)
    for row in rows:
        if row["result"].startswith("not found"): cant[host(row.get("page") or (row["problems"].split(" (")[0] if row["problems"] else ""))].append(row)
    if cant:
        md += ["", "## Where the information couldn't be found", "", "| Site | Records | Why (first record) |", "|---|---|---|"]
        for h, items in sorted(cant.items(), key=lambda kv: -len(kv[1]))[:60]:
            md += [f"| {h or '(no page)'} | {len(items)} | {items[0]['result'].removeprefix('not found: ')}{': ' + items[0]['problems'][:100] if items[0]['problems'] else ''} |"]
    if prev:
        both = [u for u in pages if u in prev and pages[u]["fingerprint"] and prev[u].get("fingerprint")]
        changed = [u for u in both if pages[u]["fingerprint"] != prev[u]["fingerprint"]]
        md += ["", "## Since the last run", "", f"{len(changed)} of {len(both)} readable pages changed their text since {prev_run}."] + [f"- {u}" for u in changed[:60]]
    (out / "survey.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md[:30]))

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
