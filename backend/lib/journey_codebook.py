"""Journey Codebook — the contract that carries qualitative findings into the
quantitative step, and the statistics that audit the qualitative step afterwards.

Spec: memory/CJM_PAINPOINT_SPEC.md (revision 2, 20 Aug 2026).

The module is deliberately pure: no database, no FastAPI, no clock. Everything
here is a function of its arguments, so a student can reproduce any number in
their thesis appendix and the test-suite can pin every branch.

Three ideas drive the design.

1. Nothing collects data unless a human approved it AND at least one verbatim
   quote backs it. That is enforced in `validate_for_activation`, at the data
   layer — not by asking a language model nicely in a prompt.

2. The qualitative step produces hypotheses; the quantitative step measures them
   AND reports where the qualitative step fell short. `edge_coverage`,
   `other_rate` and `saturation_curve` exist for that second job, which the
   previous design had no answer for at all.

3. Reliability is reported per category with its prevalence, never as one
   pooled kappa. See `per_category_kappa` for why a single number would be
   actively misleading here.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Dict, Iterable, List, Optional, Sequence, Set, Tuple

# --- constants -------------------------------------------------------------

PAIN_TYPES = ("process", "time", "information", "money",
              "service", "functional", "emotional", "access", "other")
CHANNEL_TYPES = ("physical", "app", "web", "phone", "social", "person", "other")
ORIGINS = ("qualitative", "back_coded", "prior_literature", "library_default")
STATUSES = ("suggested", "approved", "rejected")
RELIABILITY_MODES = ("none", "second_coder", "test_retest")

# Mirrors markov_journey's convention rather than declaring a second one: a row
# with too few observations may not put a number on an edge, so it may not
# declare one "material" either.
from lib.markov_journey import MIN_R_EDGE_LABEL  # noqa: E402

MIN_APPROVED_PAIN = 3
MAX_APPROVED_PAIN = 12
SOFT_MAX_PAIN_PER_STATE = 8          # usability guidance, NOT a hard block (spec 3.5)
SATURATION_MIN_INTERVIEWS = 12       # Guest, Bunce & Johnson (2006)
OTHER_RATE_WARN = 0.15               # compared against the Wilson LOWER bound
MATERIAL_EDGE_SHARE = 0.05           # ditto — a back-edge only counts if it has mass
RARE_PREVALENCE = 0.05               # below this, a per-category kappa is not reported

# Thai cue words. Deterministic extraction runs before any model is consulted,
# so a study with no LLM key still gets a usable candidate list.
PAIN_CUES = ("ไม่", "ยาก", "นาน", "รอ", "งง", "สับสน", "เสีย", "แพง", "กลัว",
             "หงุดหงิด", "ผิดหวัง", "ไม่มั่นใจ", "ต้องกลับมา", "ซ้ำ", "เต็ม",
             "ไกล", "ปิด", "ยกเลิก")
CHANNEL_CUES = {
    "แอป": "app", "แอพ": "app", "application": "app",
    "เว็บ": "web", "เวป": "web", "website": "web",
    "ไลน์": "social", "เพจ": "social", "ไอจี": "social", "เฟส": "social",
    "โทร": "phone", "คอลเซ็นเตอร์": "phone",
    "สาขา": "physical", "หน้าร้าน": "physical", "เคาน์เตอร์": "physical",
    "ตู้": "physical", "พนักงาน": "person", "อีเมล": "other",
}


class CodebookError(ValueError):
    """Raised for a structurally impossible codebook, never for a policy gate.

    Gates return a list of Thai reasons so the UI can show all of them at once;
    only genuine corruption raises.
    """


# --- text helpers ----------------------------------------------------------

def normalise(text: str) -> str:
    """Collapse whitespace and repeated tone marks so two spellings of the same
    Thai phrase merge instead of becoming two categories."""
    t = unicodedata.normalize("NFC", str(text or ""))
    t = re.sub(r"([็-๎])\1+", r"\1", t)   # doubled tone/vowel marks
    t = re.sub(r"\s+", " ", t)
    return t.strip()


def _sentences(raw: str) -> List[str]:
    parts = re.split(r"[\n\r。.!?•·]+|(?<=\S)\s{2,}", str(raw or ""))
    out = []
    for p in parts:
        s = normalise(p).strip(" -–—\t\"'")
        if 4 <= len(s) <= 120:
            out.append(s)
    return out


# --- Q2: deterministic extraction -----------------------------------------

def extract_states_and_edges(mermaid: str) -> Tuple[List[str], List[Tuple[str, str]]]:
    """Pull node labels AND the arrows between them out of a mermaid diagram.

    `_extract_steps` in routes/journey.py keeps only the labels and throws the
    arrows away, which is why the quantitative step could never check the
    qualitative map. The edges are the hypothesis; keeping them is the point.
    """
    src = str(mermaid or "")
    node_label: Dict[str, str] = {}
    # id[label] / id(label) / id{label}
    for m in re.finditer(r'([A-Za-z0-9_]+)\s*[\[\(\{]\s*"?([^\[\]\(\)\{\}"|>]{2,60}?)"?\s*[\]\)\}]', src):
        nid, label = m.group(1), normalise(m.group(2))
        if label:
            node_label[nid] = label

    # Splitting on the arrow handles `A[x] --> B[y]`, `A -->|เหตุผล| B` and
    # chained `A --> B --> C` alike, which a single paired regex does not.
    arrow = re.compile(r'-{2,3}>?\s*(?:\|[^|]*\|)?')
    edges: List[Tuple[str, str]] = []
    for line in src.splitlines():
        parts = arrow.split(line)
        if len(parts) < 2:
            continue
        ids: List[Optional[str]] = []
        for part in parts:
            m = re.search(r'([A-Za-z0-9_]+)', part.strip().lstrip("|"))
            ids.append(m.group(1) if m else None)
        for a, b in zip(ids, ids[1:]):
            la, lb = node_label.get(a or ""), node_label.get(b or "")
            if la and lb and la != lb and (la, lb) not in edges:
                edges.append((la, lb))

    ordered: List[str] = []
    for label in node_label.values():
        if label not in ordered and label.lower() not in ("start", "end"):
            ordered.append(label)
    return ordered, edges


# Substring matching on Thai fires on innocent words: "รอ" hits inside "รอบ",
# "ไม่" inside "ไม่กี่". A cue only counts when it is not glued to another
# consonant-vowel cluster, so the candidate list stays worth reading.
_CUE_EXCEPTIONS = {
    "รอ": ("รอบ", "รอย", "รอด", "เรียบร้อ"),
    "ไม่": ("ไม่กี่", "ไม่นาน", "ไม่แพง", "ไม่ยาก", "ไม่มีปัญหา"),
    "เสีย": ("เสียง", "เสียดาย"),
    "นาน": ("ไม่นาน", "นานๆ", "นาน ๆ"),
    "ยาก": ("ไม่ยาก", "อยาก", "ยากจน"),
    "แพง": ("ไม่แพง",),
}


def _cue_hits(sentence: str, cues: Iterable[str]) -> List[str]:
    hits = []
    for c in cues:
        found = sentence.count(c)
        if not found:
            continue
        explained = sum(sentence.count(b) for b in _CUE_EXCEPTIONS.get(c, ()))
        if found <= explained:      # every hit sits inside an innocent word
            continue
        hits.append(c)
    return hits


def extract_candidates(raw_text: str = "", mermaid: str = "",
                       run_ids: Optional[Sequence[str]] = None,
                       max_pain: int = 20,
                       max_touchpoints: int = 12,
                       interviews: Optional[Sequence[str]] = None) -> Dict:
    """Deterministic first pass over qualitative material.

    Every candidate carries the sentences it came from. A candidate with no
    quote is never produced here, so the "no quote, no category" rule holds even
    before `validate_for_activation` runs.

    Pass `interviews` (one string per informant) instead of, or as well as,
    `raw_text` to get a saturation curve: each quote then records which
    interview produced it, which is the only point in the pipeline where that
    is knowable.
    """
    run_ids = list(run_ids or [])
    interviews = list(interviews or [])

    # sentence -> index of the interview it came from (None for pooled text)
    origin_of: Dict[str, Optional[int]] = {}
    sentences: List[str] = []
    for idx, text in enumerate(interviews):
        for sent in _sentences(text):
            if sent not in origin_of:
                origin_of[sent] = idx
                sentences.append(sent)
    for sent in _sentences(raw_text):
        if sent not in origin_of:
            origin_of[sent] = None
            sentences.append(sent)

    states, edges = extract_states_and_edges(mermaid)

    def _prov(quotes: List[str]) -> Dict:
        idxs = sorted({origin_of.get(q) for q in quotes} - {None})
        return {"run_ids": list(run_ids),
                "quotes": [{"text": q, "source_ref": "qualitative",
                            "interview_index": origin_of.get(q)} for q in quotes],
                "interview_indices": idxs,
                "origin": "qualitative", "citation_th": None}

    # pain candidates, keyed by the cue that fired
    pain_groups: Dict[str, List[str]] = {}
    for s in sentences:
        for cue in _cue_hits(s, PAIN_CUES):
            pain_groups.setdefault(cue, [])
            if s not in pain_groups[cue]:
                pain_groups[cue].append(s)

    # One sentence can trip several cues ("ยาก" and "งง" in the same breath),
    # which produced two candidates carrying identical quotes and identical
    # labels. The duplicate-label gate would then block activation until a
    # student manually merged rows that were never distinct. Fold groups whose
    # evidence is the same, keeping every cue that fired.
    merged: Dict[frozenset, Dict] = {}
    for cue, quotes in pain_groups.items():
        key = frozenset(quotes)
        if key in merged:
            merged[key]["cues"].append(cue)
        else:
            merged[key] = {"cues": [cue], "quotes": quotes}
    pain_groups = {"+".join(sorted(v["cues"])): v["quotes"] for v in merged.values()}

    pain: List[Dict] = []
    for i, (cue, quotes) in enumerate(
            sorted(pain_groups.items(), key=lambda kv: (-len(kv[1]), kv[0]))[:max_pain], 1):
        pain.append({
            "id": "pc%d" % i,
            "label_th": quotes[0][:60],       # a human renames this; it is a placeholder
            "definition_th": "",
            "pain_type": "other",
            "state_ids": [], "applies_to": "all",
            "provenance": _prov(quotes),
            "status": "suggested",
            "approved_by": None, "approved_at": None,
            "rejected_reason": None, "merged_from": [],
            "_cue": cue, "_frequency": len(quotes),
        })

    # touchpoint candidates
    tp_groups: Dict[str, List[str]] = {}
    tp_type: Dict[str, str] = {}
    for s in sentences:
        for cue, ctype in CHANNEL_CUES.items():
            if cue in s:
                tp_groups.setdefault(cue, [])
                tp_type[cue] = ctype
                if s not in tp_groups[cue]:
                    tp_groups[cue].append(s)

    touchpoints: List[Dict] = []
    for i, (cue, quotes) in enumerate(
            sorted(tp_groups.items(), key=lambda kv: (-len(kv[1]), kv[0]))[:max_touchpoints], 1):
        touchpoints.append({
            "id": "tp%d" % i, "label_th": cue, "definition_th": "",
            "channel_type": tp_type[cue],
            "state_ids": [], "applies_to": "all",
            "provenance": _prov(quotes),
            "status": "suggested", "approved_by": None, "approved_at": None,
            "_frequency": len(quotes),
        })

    # Two groups can share their first quote (one cue matched a second sentence
    # too), which made two rows show the same placeholder label. The duplicate
    # label gate would then block activation over a collision the student never
    # created. Disambiguate with the cue that formed the group.
    seen_labels: Dict[str, int] = {}
    for row in pain:
        base = row["label_th"]
        if base in seen_labels:
            row["label_th"] = "%s · %s" % (base[:48], row["_cue"])
        seen_labels[base] = seen_labels.get(base, 0) + 1

    state_rows = []
    for i, label in enumerate(states):
        quotes = [s for s in sentences if label in s][:3]
        state_rows.append({
            "id": "st%d" % (i + 1), "label_th": label, "definition_th": "",
            "order": i, "role": "step",
            "provenance": _prov(quotes) if quotes else _prov([label]),
            "status": "suggested", "approved_by": None, "approved_at": None,
        })

    label_to_id = {r["label_th"]: r["id"] for r in state_rows}
    edge_rows = [{"from_state_id": label_to_id[a], "to_state_id": label_to_id[b],
                  "claimed_in_qualitative": True,
                  "provenance": _prov([f"{a} -> {b}"])}
                 for a, b in edges if a in label_to_id and b in label_to_id]

    return {"states": state_rows, "edges": edge_rows,
            "touchpoints": touchpoints, "pain_categories": pain,
            "n_sentences": len(sentences), "n_interviews": len(interviews)}


# --- gates -----------------------------------------------------------------

def _approved(rows: Sequence[dict]) -> List[dict]:
    return [r for r in (rows or []) if r.get("status") == "approved"]


def validate_for_activation(codebook: dict, budget: Optional[dict] = None) -> List[str]:
    """Every reason this codebook may not be activated, in Thai, all at once.

    Returning the full list rather than the first failure is deliberate: a
    student fixing one gate at a time, with a round-trip each, gives up.
    """
    reasons: List[str] = []
    src = codebook.get("source") or {}

    if not normalise(src.get("collection_method_th", "")):
        reasons.append("ยังไม่ได้ระบุวิธีเก็บข้อมูลเชิงคุณภาพ (จำนวนผู้ให้สัมภาษณ์และวิธีเก็บ)")

    groups = (("states", "ขั้นตอน"), ("touchpoints", "จุดสัมผัส"),
              ("pain_categories", "ประเภทปัญหา"))
    for key, thai in groups:
        for row in _approved(codebook.get(key)):
            label = row.get("label_th") or row.get("id")
            if not normalise(row.get("definition_th", "")):
                reasons.append("%s \"%s\" ยังไม่มีคำนิยาม" % (thai, label))
            quotes = ((row.get("provenance") or {}).get("quotes") or [])
            if not quotes:
                reasons.append("%s \"%s\" ยังไม่มีข้อความต้นทางอ้างอิง" % (thai, label))
            if row.get("applies_to") == "selected" and not (row.get("state_ids") or []):
                reasons.append("%s \"%s\" เลือกว่าใช้เฉพาะบางขั้น แต่ยังไม่ได้เลือกขั้น" % (thai, label))
            prov = row.get("provenance") or {}
            if prov.get("origin") == "prior_literature" and not normalise(prov.get("citation_th") or ""):
                reasons.append("%s \"%s\" มาจากงานวิจัยก่อนหน้า ต้องระบุการอ้างอิง" % (thai, label))

        labels = [normalise(r.get("label_th", "")) for r in _approved(codebook.get(key))]
        dupes = sorted({l for l in labels if l and labels.count(l) > 1})
        for d in dupes:
            reasons.append("%s \"%s\" ซ้ำกัน" % (thai, d))

    n_pain = len(_approved(codebook.get("pain_categories")))
    if n_pain < MIN_APPROVED_PAIN:
        reasons.append("ต้องมีประเภทปัญหาที่อนุมัติแล้วอย่างน้อย %d รายการ (ตอนนี้ %d)"
                       % (MIN_APPROVED_PAIN, n_pain))
    if n_pain > MAX_APPROVED_PAIN:
        reasons.append("ประเภทปัญหาที่อนุมัติแล้วมี %d รายการ เกิน %d"
                       % (n_pain, MAX_APPROVED_PAIN))

    if budget and budget.get("blocked"):
        for b in budget.get("blockers") or []:
            reasons.append("งบเวลา: %s" % b)

    return reasons


def blocklist_terms(codebook: dict, checker) -> List[str]:
    """PDPA screen over every label a respondent could see.

    `checker` is injected (lib.consent.check_blocklist) so this module stays
    importable without the rest of the backend.
    """
    texts: List[str] = []
    for key in ("states", "touchpoints", "pain_categories"):
        for row in (codebook.get(key) or []):
            texts.append(row.get("label_th") or "")
            texts.append(row.get("definition_th") or "")
    return list(checker(texts) or [])


def soft_warnings(codebook: dict) -> List[str]:
    """Usability advice that must NOT block activation (spec 3.5)."""
    out: List[str] = []
    per_state: Dict[str, int] = {}
    approved = _approved(codebook.get("pain_categories"))
    all_states = [s.get("id") for s in _approved(codebook.get("states"))]
    for row in approved:
        targets = all_states if row.get("applies_to") == "all" else (row.get("state_ids") or [])
        for sid in targets:
            per_state[sid] = per_state.get(sid, 0) + 1
    heavy = sorted(sid for sid, n in per_state.items() if n > SOFT_MAX_PAIN_PER_STATE)
    for sid in heavy:
        out.append("ขั้น %s มีตัวเลือกปัญหา %d รายการ มากกว่า %d อาจอ่านยาก"
                   % (sid, per_state[sid], SOFT_MAX_PAIN_PER_STATE))
    return out


# --- serving the instrument ------------------------------------------------

def pain_options_for_state(codebook: dict, state_id: str) -> List[Dict[str, str]]:
    """What one respondent sees on one step. Only approved rows, only this step."""
    out = []
    for row in _approved(codebook.get("pain_categories")):
        if row.get("applies_to") == "all" or state_id in (row.get("state_ids") or []):
            out.append({"id": row["id"], "label_th": row.get("label_th", "")})
    return out


def sanitize_category_ids(submitted: Sequence[str], codebook: dict,
                          state_id: str) -> List[str]:
    """Drop ids that are not offered on this step, preserving order, no dupes.

    Dropping rather than raising keeps a stale browser tab from turning into a
    500 for the respondent, which is the existing convention in this module.
    """
    allowed = {o["id"] for o in pain_options_for_state(codebook, state_id)}
    seen: Set[str] = set()
    out = []
    for cid in (submitted or []):
        if cid in allowed and cid not in seen:
            seen.add(cid)
            out.append(cid)
    return out


def enforce_nomination_cap(nominated: Sequence[str], cap: int) -> List[str]:
    """The UI limits this today and the backend does not, so what is stored can
    disagree with what was designed. Truncation happens here, server-side."""
    cap = max(1, int(cap or 1))
    seen: Set[str] = set()
    out = []
    for sid in (nominated or []):
        if sid not in seen:
            seen.add(sid)
            out.append(sid)
    return out[:cap]


# --- N4: auditing the qualitative step -------------------------------------

def other_rate(n_other: int, n_nominations: int, wilson) -> Dict:
    """Share of nominations that chose "other", with a Wilson interval.

    The warning fires on the interval's LOWER bound, not the point estimate: at
    n=12 a single "other" is 8% with a lower bound near 1%, and warning on the
    point estimate would cry wolf on nearly every pilot.
    """
    n_other, n_nominations = int(n_other or 0), int(n_nominations or 0)
    if n_nominations <= 0:
        return {"rate": None, "ci95": None, "n_other": 0, "n": 0,
                "warn": False, "warning_th": None}
    lo, hi = wilson(n_other, n_nominations)
    rate = n_other / n_nominations
    warn = lo > OTHER_RATE_WARN
    return {
        "rate": round(rate, 4), "ci95": [round(lo, 4), round(hi, 4)],
        "n_other": n_other, "n": n_nominations, "warn": warn,
        "warning_th": ("ผู้ตอบเลือก \"อื่น ๆ\" มาก (อย่างน้อย %.0f%%) "
                       "แปลว่ารายการปัญหายังครอบคลุมไม่พอ ควรลงรหัสข้อความเหล่านั้นกลับเข้าชุด"
                       % (lo * 100)) if warn else None,
    }


def edge_coverage(claimed_edges: Sequence[Tuple[str, str]],
                  n_ij, states: Sequence[str], wilson,
                  journey_style: str = "nonlinear",
                  order: Optional[Dict[str, int]] = None) -> Dict:
    """Compare the qualitative map against the transitions actually observed.

    This is the join between the two steps. Three buckets, plus a verdict on the
    linear/nonlinear choice the student made in the qualitative step.
    """
    idx = {s: i for i, s in enumerate(states)}
    order = order or {s: i for i, s in enumerate(states)}
    claimed = {(a, b) for a, b in (claimed_edges or []) if a in idx and b in idx}

    def _row_total(i: int) -> int:
        return int(sum(int(n_ij[i][j]) for j in range(len(states))))

    def _cell(a: str, b: str) -> Dict:
        i, j = idx[a], idx[b]
        x, n = int(n_ij[i][j]), _row_total(i)
        lo, hi = wilson(x, n) if n > 0 else (0.0, 0.0)
        return {"from": a, "to": b, "n": x, "row_n": n,
                "share": round(x / n, 4) if n else None,
                "ci95": [round(lo, 4), round(hi, 4)] if n else None,
                # A row observed once gives share 1.0 with a Wilson lower bound
                # near 20% — enough to clear the share threshold on noise alone.
                # Require the row to be big enough to carry an edge number.
                "material": bool(n >= MIN_R_EDGE_LABEL and lo > MATERIAL_EDGE_SHARE)}

    observed = {(a, b) for a in states for b in states
                if a in idx and b in idx and int(n_ij[idx[a]][idx[b]]) > 0}

    claimed_and_observed = [_cell(a, b) for a, b in sorted(claimed & observed)]
    claimed_not_observed = [{"from": a, "to": b, "n": 0, "row_n": _row_total(idx[a]),
                             "share": 0.0, "ci95": None, "material": False}
                            for a, b in sorted(claimed - observed)]
    observed_not_claimed = [_cell(a, b) for a, b in sorted(observed - claimed)]

    violations = []
    if str(journey_style or "").lower() == "linear":
        for cell in claimed_and_observed + observed_not_claimed:
            a, b = cell["from"], cell["to"]
            backwards = order.get(b, 0) <= order.get(a, 0)
            if backwards and cell["material"]:
                violations.append(cell)

    return {
        "claimed_and_observed": claimed_and_observed,
        "claimed_not_observed": claimed_not_observed,
        "observed_not_claimed": observed_not_claimed,
        "journey_style_claimed": journey_style,
        "linear_violations": violations,
        "warning_th": ("ขั้นเชิงคุณภาพระบุว่าเส้นทางเป็นแบบเรียงลำดับ (linear) "
                       "แต่พบการย้อนกลับที่มีสัดส่วนมีนัย %d เส้น ควรรายงานเป็น nonlinear"
                       % len(violations)) if violations else None,
        "missed_by_qualitative_th": ("พบเส้นทางที่ขั้นเชิงคุณภาพไม่ได้ระบุไว้ %d เส้น"
                                     % len([c for c in observed_not_claimed if c["material"]])
                                     ) if any(c["material"] for c in observed_not_claimed) else None,
    }


def saturation_curve(per_interview: Sequence[Sequence[str]]) -> Dict:
    """How many NEW categories each successive interview contributed.

    The previous design required `n_interviews` and then never used it. This is
    the cheapest honest answer to the first question a thesis committee asks.
    """
    seen: Set[str] = set()
    rows = []
    for i, ids in enumerate(per_interview or [], 1):
        fresh = [c for c in dict.fromkeys(ids or []) if c not in seen]
        seen.update(fresh)
        rows.append({"interview_index": i, "n_new_categories": len(fresh),
                     "cumulative": len(seen)})

    n = len(rows)
    warnings: List[str] = []
    if n and n < SATURATION_MIN_INTERVIEWS:
        warnings.append("มีผู้ให้สัมภาษณ์ %d ราย ต่ำกว่า %d ซึ่งเป็นช่วงที่งานวิจัยมักพบความอิ่มตัว "
                        "ให้รายงานเป็นข้อจำกัด" % (n, SATURATION_MIN_INTERVIEWS))
    tail = [r["n_new_categories"] for r in rows[-2:]]
    if len(tail) == 2 and sum(tail) > 0:
        warnings.append("บทสัมภาษณ์สองรายสุดท้ายยังให้ประเภทปัญหาใหม่ ข้อมูลอาจยังไม่อิ่มตัว")
    return {"rows": rows, "n_interviews": n, "n_categories": len(seen),
            "saturated": bool(n and len(tail) == 2 and sum(tail) == 0),
            "warnings": warnings}


# --- reliability -----------------------------------------------------------

def saturation_from_codebook(codebook: dict) -> Dict:
    """Saturation curve implied by which interview first produced each category.

    Reads the interview index recorded on each approved category's quotes, so it
    needs no separate bookkeeping that could drift out of step with the
    codebook it describes.
    """
    n_interviews = int(((codebook.get("source") or {}).get("n_interviews") or 0))
    first_seen: Dict[int, List[str]] = {}
    unattributed = 0
    for row in _approved(codebook.get("pain_categories")):
        idxs = ((row.get("provenance") or {}).get("interview_indices") or [])
        if not idxs:
            unattributed += 1
            continue
        first_seen.setdefault(min(idxs), []).append(row["id"])

    span = max([n_interviews] + [i + 1 for i in first_seen] or [0])
    per_interview = [first_seen.get(i, []) for i in range(span)]
    out = saturation_curve(per_interview)
    out["unattributed_categories"] = unattributed
    if unattributed:
        out["warnings"] = list(out["warnings"]) + [
            "มี %d ประเภทที่ไม่ทราบว่ามาจากบทสัมภาษณ์ใด จึงไม่นับในเส้นความอิ่มตัว"
            % unattributed]
    return out


def translate_edges_to_states(codebook: dict, study_states: Sequence[dict]) -> Dict:
    """Map the codebook's edges onto the study's own state ids, by label.

    The codebook is built from the qualitative material and the study's steps
    are edited separately, so the two id spaces need not agree. Anything that
    cannot be matched is counted and reported rather than dropped quietly — an
    unchecked edge must not look like a confirmed one.
    """
    by_label = {normalise(st.get("label_th") or st.get("label") or ""): st.get("id")
                for st in (study_states or [])}
    cb_label = {st.get("id"): normalise(st.get("label_th", ""))
                for st in (codebook.get("states") or [])}
    edges, unmatched = [], 0
    for e in (codebook.get("edges") or []):
        a = by_label.get(cb_label.get(e.get("from_state_id")))
        b = by_label.get(cb_label.get(e.get("to_state_id")))
        if a and b and [a, b] not in edges:
            edges.append([a, b])
        elif not (a and b):
            unmatched += 1
    return {"edges": edges, "unmatched": unmatched}


def per_category_kappa(coder_a: Sequence[Sequence[str]],
                       coder_b: Sequence[Sequence[str]],
                       category_ids: Sequence[str]) -> List[Dict]:
    """Cohen's kappa per category, as a binary present/absent decision.

    Why not one pooled kappa: this coding is multi-label — one statement can
    carry several categories — which breaks Cohen's assumption of assignment to
    exactly one of k mutually exclusive classes. And kappa suffers the well
    known paradox: for a category present in 3% of units, two coders agreeing on
    97% of units still score near zero. Reporting one number over ten mostly
    rare categories would hand a student an alarming artefact.

    So: one kappa per category, always beside its prevalence, and `None` (shown
    as "n/a") when the category is too rare for the statistic to mean anything.
    """
    if len(coder_a) != len(coder_b):
        raise CodebookError("coder_a and coder_b must cover the same units")
    n = len(coder_a)
    sets_a = [set(x or []) for x in coder_a]
    sets_b = [set(x or []) for x in coder_b]

    out = []
    for cid in category_ids:
        a = [1 if cid in s else 0 for s in sets_a]
        b = [1 if cid in s else 0 for s in sets_b]
        if n == 0:
            out.append({"category_id": cid, "kappa": None, "prevalence": 0.0,
                        "n_agree": 0, "n_total": 0, "note_th": "ยังไม่มีหน่วยที่ลงรหัสซ้ำ"})
            continue
        agree = sum(1 for i in range(n) if a[i] == b[i])
        pa1, pb1 = sum(a) / n, sum(b) / n
        prevalence = (sum(a) + sum(b)) / (2.0 * n)
        p_o = agree / n
        p_e = pa1 * pb1 + (1 - pa1) * (1 - pb1)

        if prevalence < RARE_PREVALENCE:
            kappa, note = None, "พบน้อยเกินไป (%.1f%%) ค่า κ ไม่มีความหมาย" % (prevalence * 100)
        elif abs(1.0 - p_e) < 1e-12:
            kappa, note = None, "ผู้ลงรหัสทั้งสองตอบเหมือนกันทุกหน่วย ค่า κ ไม่นิยาม"
        else:
            kappa, note = (p_o - p_e) / (1.0 - p_e), None

        out.append({"category_id": cid,
                    "kappa": None if kappa is None else round(kappa, 4),
                    "percent_agreement": round(p_o, 4),
                    "prevalence": round(prevalence, 4),
                    "n_agree": agree, "n_total": n, "note_th": note})
    return out


def krippendorff_alpha_binary(coder_a: Sequence[Sequence[str]],
                              coder_b: Sequence[Sequence[str]],
                              category_ids: Sequence[str]) -> Optional[float]:
    """Krippendorff's alpha over the pooled binary (unit x category) decisions.

    Nominal metric, two coders, no missing values. Each (statement, category)
    pair is one unit whose value is 0 or 1, which is the standard way to bring
    multi-label coding into alpha's frame — and unlike kappa it degrades
    gracefully as categories get rare, which is exactly the failure mode this
    module is trying to avoid reporting.
    """
    if len(coder_a) != len(coder_b):
        raise CodebookError("coder_a and coder_b must cover the same units")
    cats = list(category_ids or [])
    if not cats or not coder_a:
        return None

    sets_a = [set(x or []) for x in coder_a]
    sets_b = [set(x or []) for x in coder_b]

    # coincidence matrix over values {0,1}; two coders per unit -> each unit
    # contributes the ordered pair and its mirror, divided by (m_u - 1) = 1.
    o = {(0, 0): 0.0, (0, 1): 0.0, (1, 0): 0.0, (1, 1): 0.0}
    for cid in cats:
        for sa, sb in zip(sets_a, sets_b):
            va, vb = int(cid in sa), int(cid in sb)
            o[(va, vb)] += 1.0
            o[(vb, va)] += 1.0

    n_val = {v: o[(v, 0)] + o[(v, 1)] for v in (0, 1)}
    n_total = n_val[0] + n_val[1]
    if n_total <= 1:
        return None

    d_o = o[(0, 1)] + o[(1, 0)]
    d_e = (n_val[0] * n_val[1] + n_val[1] * n_val[0]) / (n_total - 1.0)
    if d_e <= 0:
        return None
    return round(1.0 - (d_o / d_e), 4)


def reliability_report(coder_a, coder_b, category_ids,
                       mode: str = "second_coder",
                       coder_ref: Optional[str] = None) -> Dict:
    """The whole reliability block, shaped for storage and for the dashboard.

    Deliberately contains no single pooled kappa field. If one existed, some
    screen would eventually render it.
    """
    if mode not in RELIABILITY_MODES:
        raise CodebookError("unknown reliability mode: %r" % (mode,))
    per_cat = per_category_kappa(coder_a, coder_b, category_ids)
    n = len(coder_a)
    exact = sum(1 for a, b in zip(coder_a, coder_b) if set(a or []) == set(b or []))
    reportable = [r["kappa"] for r in per_cat if r["kappa"] is not None]

    limitations: List[str] = []
    if mode == "none":
        limitations.append("ไม่มีการตรวจความน่าเชื่อถือของการลงรหัส — ต้องรายงานเป็นข้อจำกัด")
    if mode == "test_retest":
        limitations.append("ใช้การลงรหัสซ้ำโดยผู้วิจัยคนเดิม (test–retest) "
                           "ไม่ใช่ความสอดคล้องระหว่างผู้ลงรหัสสองคน")
    if not reportable:
        limitations.append("ไม่มีประเภทใดที่พบบ่อยพอจะรายงานค่า κ ได้")

    return {
        "mode": mode, "coder_ref": coder_ref, "n_double_coded": n,
        "percent_agreement": round(exact / n, 4) if n else None,
        "per_category": per_cat,
        "krippendorff_alpha": krippendorff_alpha_binary(coder_a, coder_b, category_ids),
        "n_categories_reportable": len(reportable),
        "limitations_th": limitations,
    }


# --- provenance block ------------------------------------------------------

def provenance_block(codebook: Optional[dict], study: dict,
                     other: Optional[dict] = None,
                     back_coded_rate: Optional[float] = None) -> Dict:
    """What every pain/touchpoint number on every screen must be able to cite."""
    pain_source = study.get("pain_source") or "library_default"
    src = (codebook or {}).get("source") or {}
    n_quotes = 0
    for key in ("states", "touchpoints", "pain_categories"):
        for row in ((codebook or {}).get(key) or []):
            if row.get("status") == "approved":
                n_quotes += len(((row.get("provenance") or {}).get("quotes") or []))

    warning = None
    if pain_source == "library_default":
        warning = ("รายการนี้ไม่ได้มาจากข้อมูลเชิงคุณภาพของการศึกษานี้ "
                   "เป็นชุดตั้งต้นของระบบ ผลที่ได้จึงตีความได้จำกัด")
    elif pain_source == "prior_literature":
        warning = "รายการนี้นำมาจากงานวิจัยก่อนหน้า ไม่ได้สร้างจากข้อมูลของการศึกษานี้"

    return {
        "codebook_version": (codebook or {}).get("version") or study.get("codebook_version") or 0,
        "pain_source": pain_source,
        "n_quotes": n_quotes,
        "n_interviews": src.get("n_interviews"),
        "collection_method_th": src.get("collection_method_th"),
        "journey_style_claimed": src.get("journey_style"),
        "reliability_mode": ((codebook or {}).get("reliability") or {}).get("mode", "none"),
        "other": other,
        "back_coded_rate": back_coded_rate,
        "saturation": (codebook or {}).get("saturation"),
        "reliability": ((codebook or {}).get("reliability") or {"mode": "none"}),
        "warning_th": warning,
    }


def comparability_flag(version_a: Optional[int], version_b: Optional[int]) -> Dict:
    """Two result sets built on different codebooks are not comparable.

    Same rule the module already applies across `structure_hash`; stating it in
    the payload keeps a dashboard from quietly charting them side by side.
    """
    a, b = version_a or 0, version_b or 0
    same = a == b
    return {"comparable": same, "version_a": a, "version_b": b,
            "reason_th": None if same else
            ("เทียบกันไม่ได้ เพราะใช้ชุดรหัสคนละเวอร์ชัน (v%s กับ v%s) "
             "ความหมายของแต่ละประเภทปัญหาอาจไม่ตรงกัน" % (a, b))}
