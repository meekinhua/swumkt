#!/usr/bin/env python3
"""External agent CLI for /dorm admin automation.

Reads DORM_BASE_URL (default http://localhost:8001) and DORM_API_KEY (swk_...).

Examples:
    python backend/scripts/dorm_agent.py brief
    python backend/scripts/dorm_agent.py check-external --dry-run --limit 20
    python backend/scripts/dorm_agent.py triage --dry-run
    python backend/scripts/dorm_agent.py actions
    python backend/scripts/dorm_agent.py undo act_xxxxxxxxxxxx
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from typing import Any, Dict, List, Tuple

import httpx


DEFAULT_BASE = "http://localhost:8001"
UA = "SwuDormAgent/1.0 (+https://swumkt.org/dorm)"

GONE_TEXT_MARKERS = (
    "ขออภัย ไม่พบประกาศนี้",
    "ไม่พบประกาศ",
    "ประกาศนี้ถูกลบ",
    "ถูกปิดประกาศแล้ว",
    "รายการนี้ถูกเช่าแล้ว",
    "no longer available",
    "this listing is no longer available",
    "property has been rented",
)


def _client(base_url: str, api_key: str) -> httpx.Client:
    if not api_key:
        sys.exit("DORM_API_KEY (or --api-key) is required")
    return httpx.Client(
        base_url=base_url.rstrip("/") + "/api/dorm",
        headers={"Authorization": f"Bearer {api_key}"},
        timeout=20.0,
    )


def _probe_source_url(http: httpx.Client, row: dict) -> Tuple[str, str]:
    """Return ('gone'|'live'|'uncertain', reason)."""
    url = str(row.get("source_url") or "")
    source = str(row.get("source") or "").lower()
    if not url.startswith("https://"):
        return "uncertain", "invalid source_url"
    try:
        r = http.get(url, follow_redirects=True)
    except Exception as e:
        return "uncertain", f"fetch error: {e.__class__.__name__}"

    if r.status_code in (404, 410):
        return "gone", f"HTTP {r.status_code} on source"
    if r.status_code != 200:
        return "uncertain", f"HTTP {r.status_code}"

    final_url = str(r.url)
    body = r.text[:20000].lower()

    if "propertyscout" in source:
        # PropertyScout redirects unavailable unit pages back to generic listing search or home
        ext_id = str(row.get("ext_id") or "").split(":")[-1]
        if ext_id and ext_id not in final_url and ("/bangkok/" in final_url or final_url.rstrip("/").endswith("/en") or final_url.rstrip("/").endswith(".co.th")):
            return "gone", f"redirected away from unit ({final_url})"

    if "renthub" in source:
        ext_id = str(row.get("ext_id") or "").split(":")[-1]
        if ext_id and ext_id not in final_url and "/อพาร์ทเม้นท์" in final_url:
            return "gone", f"redirected to index ({final_url})"

    for marker in GONE_TEXT_MARKERS:
        if marker in body:
            return "gone", f"matched marker '{marker}'"

    if any(k in body for k in ("บาท/เดือน", "baht/month", "thb", "propertyscout", "renthub")):
        return "live", "HTTP 200 active page"
    return "uncertain", "ambiguous 200 response"


def cmd_brief(c: httpx.Client, args) -> int:
    r = c.get("/admin/agent/brief")
    r.raise_for_status()
    data = r.json()
    if args.json:
        print(json.dumps(data, ensure_ascii=False, indent=2))
        return 0
    s = data.get("summary") or {}
    print("=== /dorm Agent Brief ===")
    print(f"Generated: {data.get('generated_at')}")
    print(
        f"External open: {s.get('external_open', 0)} "
        f"(maybe_gone={s.get('external_maybe_gone', 0)}, stale_7d={s.get('external_stale_7d', 0)})"
    )
    print(f"Native open:   {s.get('native_open', 0)}")
    print(
        f"Reports open:  {s.get('reports_open', 0)} "
        f"(stale={s.get('stale_reports', 0)}, live={s.get('live_reports', 0)})"
    )
    print(f"Verifications: {s.get('pending_verifications', 0)} pending")
    print(f"Proposals:     {s.get('pending_proposals', 0)} pending")
    print(f"Low-photo bld: {s.get('buildings_low_photos', 0)}")
    return 0


def cmd_check_external(c: httpx.Client, args) -> int:
    r = c.get("/admin/agent/brief")
    r.raise_for_status()
    rows = (r.json().get("work_items") or {}).get("external_to_check") or []
    if args.only_flagged:
        rows = [x for x in rows if x.get("maybe_gone")]
    rows = rows[: args.limit]
    if not rows:
        print("No external rooms matched filter.")
        return 0

    gone_list: List[Tuple[dict, str]] = []
    clear_list: List[Tuple[dict, str]] = []
    uncertain = 0

    with httpx.Client(headers={"User-Agent": UA}, timeout=12.0) as http:
        for i, row in enumerate(rows):
            if i > 0:
                time.sleep(0.3)
            verdict, note = _probe_source_url(http, row)
            if verdict == "gone":
                gone_list.append((row, note))
            elif verdict == "live" and row.get("maybe_gone"):
                clear_list.append((row, note))
            elif verdict == "uncertain":
                uncertain += 1

    print(f"Checked {len(rows)}: gone={len(gone_list)}, false_flag_live={len(clear_list)}, uncertain={uncertain}")

    if len(rows) >= 5 and (len(gone_list) / len(rows)) > 0.40:
        print(
            f"SAFETY GUARD: {len(gone_list)}/{len(rows)} (>40%) marked gone. "
            "Skipping auto-close; submit a proposal if intentional.",
            file=sys.stderr,
        )
        return 2

    for row, note in gone_list:
        res = c.post(
            "/admin/agent/execute",
            json={
                "action": "close_external_gone",
                "params": {"listing_id": row["id"]},
                "reason": note,
                "dry_run": args.dry_run,
            },
        )
        res.raise_for_status()
        print(f"  [close_external_gone] {row['id']} ({row.get('title')}): {res.json()}")

    for row, note in clear_list:
        res = c.post(
            "/admin/agent/execute",
            json={
                "action": "clear_false_maybe_gone",
                "params": {"listing_id": row["id"]},
                "reason": note,
                "dry_run": args.dry_run,
            },
        )
        res.raise_for_status()
        print(f"  [clear_false_maybe_gone] {row['id']} ({row.get('title')}): {res.json()}")

    return 0


def cmd_triage(c: httpx.Client, args) -> int:
    r = c.get("/admin/agent/brief")
    r.raise_for_status()
    wi = r.json().get("work_items") or {}
    stale_reps = wi.get("stale_reports") or []
    live_reps = wi.get("live_reports") or []
    verifs = wi.get("pending_verifications") or []

    resolved_n = 0
    for rep in stale_reps:
        res = c.post(
            "/admin/agent/execute",
            json={
                "action": "resolve_stale_report",
                "params": {"report_id": rep["id"]},
                "reason": "Auto-resolved: target listing/profile already closed or deleted",
                "dry_run": args.dry_run,
            },
        )
        res.raise_for_status()
        resolved_n += 1
        print(f"  [resolve_stale_report] {rep['id']}: {res.json()}")

    proposals: List[Dict[str, Any]] = []
    for v in verifs:
        swu_mail = v.get("swu_email") or ""
        has_swu = bool(re.search(r"@([a-z0-9-]+\.)*swu\.ac\.th$", swu_mail, re.I))
        ev = [
            {"label": "คณะ", "value": v.get("faculty") or "-"},
            {"label": "สถานะ", "value": v.get("status_label") or v.get("kind") or "student"},
        ]
        if v.get("entry_year"):
            ev.append({"label": "เข้าปี", "value": str(v["entry_year"])})
        if swu_mail:
            ev.append({"label": "อีเมล มศว", "value": swu_mail})
        proposals.append({
            "kind": "review_verification",
            "priority": "high" if has_swu else "normal",
            "title": f"ยืนยันตัวตน: {v.get('user_name') or v.get('user_email') or v['user_id']} ({v.get('faculty') or '-'})",
            "summary": v.get("note") or ("มีอีเมล @swu.ac.th แนบมา" if has_swu else "คำขอพิจารณาด้วยคน"),
            "target_type": "verification",
            "target_id": v["user_id"],
            "evidence": ev,
            "payload": {"action": "approve", "reason": ""},
        })

    for rep in live_reps:
        reason = rep.get("reason") or ""
        high = "สแกม" in reason or "โอนเงิน" in reason
        default_decision = "close_target" if high else "resolve_only"
        ev = [{"label": "เหตุผล", "value": reason}]
        if rep.get("note"):
            ev.append({"label": "โน้ตผู้แจ้ง", "value": rep["note"]})
        proposals.append({
            "kind": "resolve_report",
            "priority": "high" if high else "normal",
            "title": f"รายงาน {rep.get('target_type')}: {rep.get('target_title') or rep.get('target_id')}",
            "summary": f"{reason}" + (f" — “{rep['note']}”" if rep.get("note") else ""),
            "target_type": "report",
            "target_id": rep["id"],
            "evidence": ev,
            "payload": {"decision": default_decision, "note": ""},
        })

    queued_n = 0
    if proposals:
        if args.dry_run:
            print(f"  [dry-run] Would submit {len(proposals)} proposal(s) to /admin/proposals/batch")
        else:
            for i in range(0, len(proposals), 50):
                res = c.post("/admin/proposals/batch", json={"items": proposals[i : i + 50]})
                res.raise_for_status()
                queued_n += len((res.json() or {}).get("items") or [])
    print(f"Triage complete: stale_reports={resolved_n}, proposals_submitted={queued_n} (dry_run={args.dry_run})")
    return 0


def cmd_actions(c: httpx.Client, args) -> int:
    r = c.get("/admin/actions", params={"status": args.status, "limit": args.limit})
    r.raise_for_status()
    items = r.json().get("items") or []
    if not items:
        print("No actions recorded.")
        return 0
    for a in items:
        flag = "UNDONE" if a.get("undone_at") else ("UNDOABLE" if a.get("can_undo") else "LOG")
        print(f"{a['id']}  [{flag:8}]  {a.get('action'):24}  {a.get('title')}  ({a.get('actor')})")
    return 0


def cmd_undo(c: httpx.Client, args) -> int:
    r = c.post(f"/admin/actions/{args.action_id}/undo")
    r.raise_for_status()
    print(json.dumps(r.json(), ensure_ascii=False, indent=2))
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description="External agent CLI for /dorm admin ops")
    p.add_argument("--base-url", default=os.environ.get("DORM_BASE_URL", DEFAULT_BASE))
    p.add_argument("--api-key", default=os.environ.get("DORM_API_KEY", ""))
    sub = p.add_subparsers(dest="cmd", required=True)

    pb = sub.add_parser("brief", help="Fetch agent operational brief")
    pb.add_argument("--json", action="store_true")

    pc = sub.add_parser("check-external", help="Probe live source URLs of external rooms and close gone ones")
    pc.add_argument("--dry-run", action="store_true")
    pc.add_argument("--limit", type=int, default=30)
    pc.add_argument("--only-flagged", action="store_true")

    pt = sub.add_parser("triage", help="Auto-resolve stale reports & propose verifications/live reports")
    pt.add_argument("--dry-run", action="store_true")

    pa = sub.add_parser("actions", help="List recent reversible agent actions")
    pa.add_argument("--status", choices=["all", "active", "undone"], default="all")
    pa.add_argument("--limit", type=int, default=30)

    pu = sub.add_parser("undo", help="Undo an agent action by action_id")
    pu.add_argument("action_id")

    args = p.parse_args()
    with _client(args.base_url, args.api_key) as c:
        if args.cmd == "brief":
            return cmd_brief(c, args)
        if args.cmd == "check-external":
            return cmd_check_external(c, args)
        if args.cmd == "triage":
            return cmd_triage(c, args)
        if args.cmd == "actions":
            return cmd_actions(c, args)
        if args.cmd == "undo":
            return cmd_undo(c, args)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
