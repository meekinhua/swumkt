"""Compatibility sweep: every existing study, every endpoint, old data included.

Answers one question only: does the current code still serve the data that is
ALREADY in this database — including studies whose instrument was edited or
republished after responses came in.
"""
import json
import os
import sys
import time
import urllib.request

API = None
for line in open("/app/frontend/.env"):
    if line.startswith("REACT_APP_BACKEND_URL="):
        API = line.split("=", 1)[1].strip() + "/api"
TOKEN = open("/tmp/tok.txt").read().strip()


def call(path, method="GET", body=None, timeout=240):
    req = urllib.request.Request(
        API + path, method=method,
        data=json.dumps(body).encode() if body else None,
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json",
                 "User-Agent": "Mozilla/5.0 (compat-sweep)"},
    )
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
            ctype = r.headers.get("Content-Type", "")
            if "json" not in ctype:
                return r.status, {"_binary_bytes": len(raw), "_content_type": ctype[:40]}, round(time.time() - t0, 1)
            return r.status, json.loads(raw.decode()), round(time.time() - t0, 1)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:200], round(time.time() - t0, 1)
    except Exception as e:
        return -1, str(e)[:200], round(time.time() - t0, 1)


fails = []


def check(label, path, method="GET", body=None, want=(200,), validate=None):
    st, data, secs = call(path, method, body)
    ok = st in want
    detail = ""
    if ok and validate:
        try:
            detail = validate(data) or ""
        except Exception as e:
            ok, detail = False, f"validate raised {e}"
    print(f"{'PASS' if ok else 'FAIL'} {st:>4} {secs:>6}s  {label}  {detail}")
    if not ok:
        fails.append((label, st, data if isinstance(data, str) else "see above", detail))


print("=" * 100)
print("BRAND EQUITY — existing studies")
print("=" * 100)
st, d, _ = call("/brand-equity/studies")
studies = d["studies"] if isinstance(d, dict) else d
st2, sc, _ = call("/brand-equity/studies/scores")
check("list scores endpoint (all studies at once)", "/brand-equity/studies/scores",
      validate=lambda x: f"{len(x['scores'])} studies scored")

for s in studies:
    sid, n = s["id"], s.get("response_count", 0)
    name = (s.get("brand") or {}).get("name", "?")[:18]
    waves = len(s.get("wave_history") or [])
    legacy = sum(1 for q in (s.get("questions") or []) if q.get("legacy_ids"))
    tag = f"[{name} n={n} waves={waves} legacy_qs={legacy}]"

    check(f"dashboard {tag}", f"/brand-equity/studies/{sid}/dashboard",
          validate=lambda x: "composite=" + str((x.get("aggregate") or {}).get("composite", {}).get("overall")))
    for g in ("wave", "month", "week"):
        check(f"score-history {g} {tag}", f"/brand-equity/studies/{sid}/score-history?granularity={g}",
              validate=lambda x: f"{len([p for p in x['points'] if p['n']])} periods with data")
    fields = s.get("segments_to_capture") or []
    for f in (fields[:2] or ["gender"]):
        check(f"segment-significance {f} {tag}", f"/brand-equity/studies/{sid}/segment-significance?field={f}",
              validate=lambda x: ("testable" if x.get("testable") else "not-testable: " + str(x.get("reason"))))
    check(f"drafts-summary {tag}", f"/brand-equity/studies/{sid}/drafts-summary",
          validate=lambda x: f"unfinished={x['unfinished']}")
    check(f"thesis-export {tag}", f"/brand-equity/studies/{sid}/thesis-export",
          method="POST", want=(200, 400, 403),
          validate=lambda x: f"docx {x.get('_binary_bytes')} bytes" if isinstance(x, dict) and "_binary_bytes" in x else "")

print()
print("=" * 100)
print("CONJOINT — existing studies")
print("=" * 100)
st, d, _ = call("/conjoint/studies")
cstudies = d["studies"] if isinstance(d, dict) else d
for s in cstudies:
    sid = s["id"]
    n = s.get("respondent_count") or s.get("response_count") or 0
    tag = f"[{(s.get('title') or '?')[:18]} n={n}]"
    check(f"summary view {tag}", f"/conjoint/studies/{sid}?view=summary",
          validate=lambda x: f"sets={x.get('num_choice_sets')} alts={x.get('alternatives_per_set')}")
    check(f"design-recommendation {tag}", f"/conjoint/studies/{sid}/design-recommendation",
          want=(200, 400),
          validate=lambda x: f"min={x['sample_size']['minimum']} rec={x['sample_size']['recommended']}"
          if isinstance(x, dict) and "sample_size" in x else "")
    if n and n >= 5:
        for m in ("mnl", "linear_regression"):
            check(f"analysis {m} {tag}", f"/conjoint/studies/{sid}/statistical-analysis?method={m}",
                  validate=lambda x: ("no raw placeholder"
                                      if "__ORPHAN" not in json.dumps(x, ensure_ascii=False)
                                      and "ORPHAN_" not in json.dumps(x, ensure_ascii=False)
                                      else "!! RAW PLACEHOLDER LEAKED"))

print()
print("=" * 100)
print(f"RESULT: {len(fails)} failure(s)")
for f in fails:
    print("  FAIL:", f)
