"""Pure tests: สายเทค vocabulary engine + graph / trust rules (no DB)."""
import sys

sys.path.insert(0, "/app/backend")

import pytest  # noqa: E402

from lib import alumni_graph as G  # noqa: E402
from lib import alumni_kinship as K  # noqa: E402


# ------------------------------------------------------------ vocabulary

@pytest.mark.parametrize("d,g,term", [
    (1, "m", "พี่เทค"), (1, "f", "พี่เทค"), (1, None, "พี่เทค"),
    (2, "m", "ลุงเทค"), (2, "f", "ป้าเทค"), (2, None, "ลุง/ป้าเทค"),
    (3, "m", "ปู่เทค"), (3, "f", "ย่าเทค"), (3, None, "ปู่/ย่าเทค"),
    (4, "f", "ทวดเทค"), (5, "m", "เทียดเทค"),
    (6, None, "ทวดเทค รุ่นที่ 6"), (9, "f", "ทวดเทค รุ่นที่ 9"),
    (-1, "f", "น้องเทค"), (-2, None, "หลานเทค"), (-3, "m", "เหลนเทค"), (-4, None, "โหลนเทค"),
    (-5, None, "น้องเทค รุ่นที่ 5"), (-7, "m", "น้องเทค รุ่นที่ 7"),
    (0, None, "คุณ"),
])
def test_default_ladder(d, g, term):
    assert K.term_for(d, g) == term


def test_old_wrong_labels_gone():
    terms = {K.term_for(d, g) for d in range(-6, 7) for g in ("m", "f", None)}
    for wrong in ("พี่ take", "ปู่", "ทวด", "เหลน", "น้อง take", "ลื่อ"):
        assert wrong not in terms
    # distance 2 up is ลุง/ป้า (the old spec skipped it)
    assert K.term_for(2, None).startswith("ลุง")


@pytest.mark.parametrize("raw,exp", [("male", "m"), ("ชาย", "m"), ("F", "f"), ("หญิง", "f"),
                                     ("lgbtq+", "u"), ("", "u"), (None, "u"), ("prefer_not_to_say", "u")])
def test_gender_normalisation(raw, exp):
    assert K.normalize_gender(raw) == exp


def test_maternal_variant_and_line_override():
    s = K.merge_settings(None, {"variant": "maternal"})
    assert K.term_for(3, "m", s) == "ตาเทค"
    assert K.term_for(3, "f", s) == "ยายเทค"
    assert K.term_for(3, None, s) == "ตา/ยายเทค"
    assert K.term_for(2, "m", s) == "ลุงเทค"           # untouched rungs keep defaults
    assert K.term_for(3, "m", s, variant="default") == "ปู่เทค"


def test_partial_override_merges_per_gender_form():
    glob = K.validate_settings({"up": {"2": {"f": "น้าเทค"}}})
    s = K.merge_settings(None, glob)
    assert K.term_for(2, "f", s) == "น้าเทค"
    assert K.term_for(2, "m", s) == "ลุงเทค"
    # unknown gender keeps the stored combined form
    assert K.term_for(2, None, s) == "ลุง/ป้าเทค"


def test_combined_form_synthesised_when_only_gendered_forms():
    s = K.merge_settings(None, {"up": {"2": None}}, {"up": {"2": {"m": "ลุงเทค", "f": "ป้าเทค"}}})
    assert K.term_for(2, None, s) == "ลุง/ป้าเทค"


def test_removed_rung_falls_back_and_custom_template():
    s = K.merge_settings(None, K.validate_settings({"up": {"5": None}, "fallback_up": "บรรพบุรุษเทค ชั้น {n}"}))
    assert K.term_for(5, None, s) == "บรรพบุรุษเทค ชั้น 5"
    d = K.describe(5, None, s)
    assert d["is_fallback"] is True and d["direction"] == "up"


def test_line_override_beats_global_nearest_anchor_wins():
    glob = {"up": {"1": "พี่รหัส"}}
    near = K.nearest_override(["me", "p1", "p2"], {"p2": {"variant": "maternal"}, "p1": {"up": {"1": "พี่เทคสุดที่รัก"}}})
    s = K.merge_settings(None, glob, near)
    assert K.term_for(1, None, s) == "พี่เทคสุดที่รัก"
    assert K.nearest_override(["me"], {}) is None


@pytest.mark.parametrize("bad", [
    {"up": {"0": "x"}}, {"up": {"13": "x"}}, {"up": {"a": "x"}}, {"up": {"1": {"x": "t"}}},
    {"up": {"1": ""}}, {"up": {"1": "ก" * 41}}, {"fallback_up": "no placeholder"},
    {"fallback_up": "{n} {0.__class__}"}, {"unknown": 1}, {"variants": {"default": {}}},
    {"unverified": ["side.1"]}, "not a dict",
])
def test_validation_rejects(bad):
    with pytest.raises(ValueError):
        K.validate_settings(bad)


def test_unverified_flag_and_ladder_shape():
    assert K.describe(5, None)["unverified"] is True
    rows = K.ladder()
    assert rows[0]["distance"] == 6 and rows[-1]["distance"] == -5
    row2 = next(r for r in rows if r["distance"] == 2)
    assert (row2["m"], row2["f"], row2["u"]) == ("ลุงเทค", "ป้าเทค", "ลุง/ป้าเทค")


# ------------------------------------------------------------ status machine

def _rel(**kw):
    base = {"id": "r", "from_user_id": "j", "to_user_id": "s", "created_by": "j",
            "junior_ok": True, "senior_ok": None, "vouch_yes": 0, "vouch_no": 0}
    base.update(kw)
    return base


def test_status_claimed_confirmed_rejected():
    assert G.compute_status(_rel())[0] == "claimed"
    assert G.compute_status(_rel(senior_ok=True)) == ("confirmed", "counterpart")
    assert G.compute_status(_rel(senior_ok=False)) == ("rejected", "counterpart")


def test_vouch_thresholds():
    assert G.compute_status(_rel(vouch_yes=1))[0] == "claimed"
    assert G.compute_status(_rel(vouch_yes=2)) == ("vouched", "crowd")
    assert G.compute_status(_rel(vouch_yes=2, vouch_no=1))[0] == "disputed"
    assert G.compute_status(_rel(vouch_yes=3, vouch_no=1))[0] == "vouched"
    assert G.compute_status(_rel(vouch_no=2)) == ("rejected", "crowd")


def test_counterpart_overrides_votes():
    assert G.compute_status(_rel(vouch_yes=5, senior_ok=False)) == ("rejected", "counterpart")
    assert G.compute_status(_rel(vouch_no=5, senior_ok=True)) == ("confirmed", "counterpart")
    # conflicts never hide an explicit confirmation by both ends
    assert G.compute_status(_rel(senior_ok=True, conflict=True))[0] == "confirmed"


def test_ghost_end_cannot_confirm_only_vouch():
    r = _rel(to_user_id="g_abc", senior_ok=None)
    assert G.compute_status(r)[0] == "claimed"
    assert G.compute_status({**r, "vouch_yes": 2})[0] == "vouched"
    assert G.compute_status({**r, "conflict": True, "vouch_yes": 2})[0] == "disputed"


def test_legacy_documents_are_read_compatibly():
    legacy_pending = {"id": "x", "from_user_id": "a", "to_user_id": "b", "status": "pending",
                      "confirmed_by_from": True, "confirmed_by_to": False, "created_by": "a"}
    assert G.normalize_status("pending") == "claimed"
    assert G.compute_status(legacy_pending)[0] == "claimed"
    legacy_conf = {**legacy_pending, "status": "confirmed", "confirmed_by_to": True}
    assert G.compute_status(legacy_conf)[0] == "confirmed"
    legacy_rej = {**legacy_pending, "status": "rejected"}
    assert G.compute_status(legacy_rej)[0] == "rejected"


def test_parent_conflicts_policy():
    a = {"id": "a", "from_user_id": "g_j", "to_user_id": "s1", "status": "claimed", "junior_ok": None}
    b = {"id": "b", "from_user_id": "g_j", "to_user_id": "s2", "status": "vouched", "junior_ok": None}
    assert G.parent_conflicts([a]) == set()
    assert G.parent_conflicts([a, b]) == {"a", "b"}
    # junior affirmed both → legitimate multi-parent, no dispute
    a2, b2 = {**a, "junior_ok": True}, {**b, "junior_ok": True}
    assert G.parent_conflicts([a2, b2]) == set()
    # junior affirmed one; a third party's competing claim is disputed
    assert G.parent_conflicts([a2, b]) == {"b"}
    # rejected edges do not count
    assert G.parent_conflicts([a, {**b, "status": "rejected"}]) == set()


def test_pick_primary():
    a = {"id": "a", "to_user_id": "s1", "status": "claimed", "created_at": "2026-01-02"}
    b = {"id": "b", "to_user_id": "s2", "status": "confirmed", "created_at": "2026-01-01"}
    assert G.pick_primary([a, b])["id"] == "b"
    assert G.pick_primary([{**a, "primary_set_by_junior": True}, b])["id"] == "a"
    assert G.pick_primary([]) is None


# ------------------------------------------------------------ cycles / lines / names

def test_cycle_detection():
    parents = {"a": ["b"], "b": ["c"]}
    assert G.would_create_cycle("c", "a", parents)       # c under a would loop
    assert G.would_create_cycle("a", "a", parents)
    assert not G.would_create_cycle("d", "a", parents)
    assert G.find_cycle([("a", "b"), ("b", "c"), ("c", "a")]) is not None
    assert G.find_cycle([("a", "b"), ("b", "c")]) is None


def test_lines_summary():
    edges = [("me", "p1"), ("p1", "g_p2"), ("g_p2", "p3"), ("kid", "me"), ("x", "y")]
    lines = sorted(G.lines_from_edges(edges), key=lambda l: -l["size"])
    big = lines[0]
    assert big["span"] == 5 and big["size"] == 5 and big["ghosts"] == 1
    assert big["line_id"] == "p3" and big["completeness"] == 0.8
    assert lines[1]["span"] == 2


def test_name_similarity():
    assert G.name_similarity("พี่หมู", "หมู") == 1.0
    assert G.name_similarity("Mook", "mook ") == 1.0
    assert G.name_similarity("สมชาย", "สมชาย ใจดี") >= 0.85
    assert G.name_similarity("เอ", "บี") < 0.6
    assert G.best_name_match("ต้น", ["Ton", "ต้นข้าว สายสวย"]) >= 0.85
