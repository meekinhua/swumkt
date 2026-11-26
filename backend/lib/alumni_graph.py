"""
Alumni สายเทค — pure graph & trust rules (no DB).
=================================================

Edges live in `alumni_relations` with kind "take":
    from_user_id = the JUNIOR (น้องเทค), to_user_id = the SENIOR (พี่เทค).
Either end may be a placeholder ("ghost") id, which always starts with "g_".

Relation status machine (see memory/ALUMNI_CONTRACT_2026_11.md):

    claimed ──counterpart accepts (both ends real & agree)──▶ confirmed
       │  ──≥2 eligible vouches, net ≥ +2──────────────────▶ vouched ──counterpart accepts──▶ confirmed
       │  ──competing parent claim / mixed votes──────────▶ disputed
       │  ──counterpart rejects / net ≤ −2 crowd votes────▶ rejected
       └──ghost removed / admin──────────────────────────▶ removed

The counterpart's own answer always wins over votes ("decided_by": "counterpart").
Legacy status "pending" (pre-2026-11 documents) is read as "claimed".
"""
from __future__ import annotations

import difflib
import re
import unicodedata
from collections import defaultdict, deque
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

GHOST_PREFIX = "g_"

ESTABLISHED = frozenset({"confirmed", "vouched"})
OPEN = frozenset({"claimed", "disputed", "pending"})
DEAD = frozenset({"rejected", "removed"})
LIVE = ESTABLISHED | OPEN                     # counted for cycle prevention

VOUCH_THRESHOLD = 2          # distinct eligible vouchers needed
VOUCH_NET = 2                # yes − no needed (and −2 to crowd-reject)
STATUS_RANK = {"confirmed": 4, "vouched": 3, "claimed": 2, "pending": 2, "disputed": 1,
               "rejected": 0, "removed": 0}


def is_ghost(node_id: Optional[str]) -> bool:
    return bool(node_id) and str(node_id).startswith(GHOST_PREFIX)


def normalize_status(status: Optional[str]) -> str:
    if status == "pending" or not status:
        return "claimed"
    return status


# ------------------------------------------------------------ affirmations

def end_ok(rel: Dict[str, Any], end: str) -> Optional[bool]:
    """Has the junior ('junior') / senior ('senior') end affirmed the link?
    True / False (explicitly rejected) / None (no answer, or a ghost).
    Falls back to the legacy confirmed_by_from / confirmed_by_to flags."""
    key = "junior_ok" if end == "junior" else "senior_ok"
    if key in rel:
        return rel.get(key)
    legacy = "confirmed_by_from" if end == "junior" else "confirmed_by_to"
    v = rel.get(legacy)
    if v is True:
        return True
    if rel.get("status") == "rejected" and end == "senior":
        return False
    return None


def compute_status(rel: Dict[str, Any]) -> Tuple[str, Optional[str]]:
    """Derive (status, decided_by) from the stored facts of an edge.

    Facts: junior_ok / senior_ok, vouch_yes / vouch_no counters, conflict flag,
    removed flag, admin decision.  Pure and idempotent — call after any change.
    """
    if rel.get("status") == "removed" or rel.get("removed"):
        return "removed", rel.get("decided_by")
    admin = rel.get("admin_decision")
    if admin in ("confirm", "reject"):
        return ("confirmed" if admin == "confirm" else "rejected"), "admin"

    j_ghost = is_ghost(rel.get("from_user_id"))
    s_ghost = is_ghost(rel.get("to_user_id"))
    jo, so = end_ok(rel, "junior"), end_ok(rel, "senior")
    claimant = rel.get("created_by")

    # 1) A real end that is not the claimant said NO → rejected, final.
    #    (The claimant withdrawing is a delete, not a rejection.)
    for ghost, ok, end_id in ((j_ghost, jo, rel.get("from_user_id")),
                              (s_ghost, so, rel.get("to_user_id"))):
        if not ghost and ok is False and end_id != claimant:
            return "rejected", "counterpart"

    # 2) Both ends real and both affirmed → confirmed.
    if not j_ghost and not s_ghost and jo is True and so is True:
        return "confirmed", "counterpart"

    # 3) Competing claims are surfaced as disputed until resolved.
    if rel.get("conflict"):
        yes, no = int(rel.get("vouch_yes") or 0), int(rel.get("vouch_no") or 0)
        if no >= VOUCH_THRESHOLD and (yes - no) <= -VOUCH_NET:
            return "rejected", "crowd"
        return "disputed", None

    # 4) Crowd.
    outcome = vouch_outcome(int(rel.get("vouch_yes") or 0), int(rel.get("vouch_no") or 0))
    if outcome == "vouched":
        return "vouched", "crowd"
    if outcome == "rejected":
        return "rejected", "crowd"
    if outcome == "disputed":
        return "disputed", None
    return "claimed", None


def vouch_outcome(yes: int, no: int, threshold: int = VOUCH_THRESHOLD, net: int = VOUCH_NET) -> Optional[str]:
    """Crowd verdict from vote counts (counterpart answers are handled before this)."""
    if yes >= threshold and (yes - no) >= net:
        return "vouched"
    if no >= threshold and (yes - no) <= -net:
        return "rejected"
    if yes and no:
        return "disputed"
    return None


# ------------------------------------------------------------ conflicts

def parent_conflicts(parent_edges: List[Dict[str, Any]]) -> Set[str]:
    """Given ALL live parent edges of one junior, return the ids of edges that
    must be flagged as in conflict.

    Policy (documented in the contract):
      * Multiple พี่เทค are allowed only when the junior affirmed each one
        (junior_ok True — e.g. lines that genuinely have two พี่เทค).
      * If ≥2 distinct seniors are claimed and at least one of those links was
        NOT affirmed by the junior, every non-affirmed, non-confirmed link is
        'disputed' (so a ghost junior never silently gets two parents).
    """
    live = [e for e in parent_edges if normalize_status(e.get("status")) in LIVE]
    seniors = {e.get("to_user_id") for e in live}
    if len(seniors) < 2:
        return set()
    flagged: Set[str] = set()
    for e in live:
        if normalize_status(e.get("status")) == "confirmed":
            continue
        if end_ok(e, "junior") is True:
            continue
        flagged.add(e["id"])
    return flagged


def pick_primary(parent_edges: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """The primary พี่เทค used for line computation: an explicit junior choice
    first, then the strongest status, then the most recent decision."""
    live = [e for e in parent_edges if normalize_status(e.get("status")) in LIVE]
    if not live:
        return None

    def key(e):
        return (
            1 if e.get("primary_set_by_junior") else 0,
            STATUS_RANK.get(normalize_status(e.get("status")), 0),
            1 if e.get("primary", True) else 0,
            e.get("confirmed_at") or e.get("decided_at") or e.get("created_at") or "",
        )
    return max(live, key=key)


# ------------------------------------------------------------ cycles

def reaches(start: str, target: str, parents_of: Dict[str, Iterable[str]], max_nodes: int = 100000) -> bool:
    """True if `target` is reachable from `start` walking UP via parents_of."""
    if start == target:
        return True
    seen = {start}
    dq = deque([start])
    while dq:
        cur = dq.popleft()
        for p in parents_of.get(cur, ()):
            if p == target:
                return True
            if p not in seen:
                seen.add(p)
                if len(seen) > max_nodes:
                    return True  # refuse rather than risk a cycle
                dq.append(p)
    return False


def would_create_cycle(junior: str, senior: str, parents_of: Dict[str, Iterable[str]]) -> bool:
    """Adding junior→senior creates a cycle iff the junior is already the senior
    itself or an ancestor of the senior."""
    return junior == senior or reaches(senior, junior, parents_of)


def find_cycle(edges: Iterable[Tuple[str, str]]) -> Optional[List[str]]:
    """Return one cycle (list of nodes) in a junior→senior edge set, or None."""
    adj: Dict[str, List[str]] = defaultdict(list)
    for j, s in edges:
        adj[j].append(s)
    WHITE, GREY, BLACK = 0, 1, 2
    color: Dict[str, int] = defaultdict(int)
    for root in list(adj):
        if color[root] != WHITE:
            continue
        stack = [(root, iter(adj[root]))]
        path = [root]
        color[root] = GREY
        while stack:
            node, it = stack[-1]
            nxt = next(it, None)
            if nxt is None:
                color[node] = BLACK
                stack.pop()
                path.pop()
                continue
            if color[nxt] == GREY:
                return path[path.index(nxt):] + [nxt]
            if color[nxt] == WHITE:
                color[nxt] = GREY
                stack.append((nxt, iter(adj.get(nxt, []))))
                path.append(nxt)
    return None


# ------------------------------------------------------------ lines

def component_levels(edges: Iterable[Tuple[str, str]], start: str) -> Dict[str, int]:
    """Assign a level to every node connected to `start` (senior = level+1).
    With multi-parent DAGs levels can disagree; first assignment wins (BFS)."""
    up: Dict[str, List[str]] = defaultdict(list)
    down: Dict[str, List[str]] = defaultdict(list)
    for j, s in edges:
        up[j].append(s)
        down[s].append(j)
    levels = {start: 0}
    dq = deque([start])
    while dq:
        cur = dq.popleft()
        for s in up.get(cur, ()):
            if s not in levels:
                levels[s] = levels[cur] + 1
                dq.append(s)
        for j in down.get(cur, ()):
            if j not in levels:
                levels[j] = levels[cur] - 1
                dq.append(j)
    return levels


def span(levels: Dict[str, int]) -> int:
    """Number of generations (rungs) in a line."""
    if not levels:
        return 0
    return max(levels.values()) - min(levels.values()) + 1


def lines_from_edges(edges: List[Tuple[str, str]], ghost_ids: Optional[Set[str]] = None) -> List[Dict[str, Any]]:
    """Split an established edge list into lines (weakly connected components)
    and summarise each: top node, size, real/ghost counts, span, completeness."""
    ghost_ids = ghost_ids or set()
    adj: Dict[str, Set[str]] = defaultdict(set)
    for j, s in edges:
        adj[j].add(s)
        adj[s].add(j)
    seen: Set[str] = set()
    out: List[Dict[str, Any]] = []
    by_comp_edges: Dict[str, List[Tuple[str, str]]] = defaultdict(list)
    comp_of: Dict[str, str] = {}
    for n in list(adj):
        if n in seen:
            continue
        comp = []
        dq = deque([n])
        seen.add(n)
        while dq:
            c = dq.popleft()
            comp.append(c)
            for m in adj[c]:
                if m not in seen:
                    seen.add(m)
                    dq.append(m)
        for c in comp:
            comp_of[c] = n
    for j, s in edges:
        by_comp_edges[comp_of[j]].append((j, s))
    for root, cedges in by_comp_edges.items():
        lv = component_levels(cedges, root)
        top_level = max(lv.values())
        tops = sorted(k for k, v in lv.items() if v == top_level)
        nodes = list(lv)
        ghosts = sum(1 for x in nodes if x in ghost_ids or is_ghost(x))
        real = len(nodes) - ghosts
        out.append({
            "line_id": tops[0],
            "top_ids": tops,
            "size": len(nodes),
            "registered": real,
            "ghosts": ghosts,
            "span": span(lv),
            "completeness": round(real / len(nodes), 4) if nodes else 0.0,
            "member_ids": nodes,
        })
    return out


# ------------------------------------------------------------ names

_HONORIFICS = ("พี่", "น้อง", "คุณ", "นาย", "นางสาว", "นาง", "น.ส.", "ดร.", "อ.")


def normalize_name(name: Optional[str]) -> str:
    if not name:
        return ""
    s = unicodedata.normalize("NFC", str(name)).strip().lower()
    changed = True
    while changed:
        changed = False
        for h in _HONORIFICS:
            if s.startswith(h) and len(s) > len(h):
                s = s[len(h):].lstrip()
                changed = True
    s = re.sub(r"[\s\.\-_'\"()]+", "", s)
    return s


def name_similarity(a: Optional[str], b: Optional[str]) -> float:
    na, nb = normalize_name(a), normalize_name(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0
    if len(na) >= 2 and len(nb) >= 2 and (na in nb or nb in na):
        return 0.85
    return round(difflib.SequenceMatcher(None, na, nb).ratio(), 4)


def best_name_match(guess: str, candidates: Iterable[Optional[str]]) -> float:
    """Highest similarity between a guess and any of the candidate names /
    name tokens (first name, nickname …)."""
    best = 0.0
    for c in candidates:
        if not c:
            continue
        tokens = [c] + str(c).split()
        for t in tokens:
            best = max(best, name_similarity(guess, t))
    return best
