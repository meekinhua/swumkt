"""Dorm (หาห้อง·หาเมท มศว) — pure-logic tests: matching, digest, input validation.

The HTTP flow (create → list hides contact → reveal logs a lead → expiry) is
exercised against the running pod by tests/test_dorm_api.py.
"""
import os
import sys
from datetime import datetime, timedelta, timezone

import pytest
from pydantic import ValidationError

sys.path.insert(0, "/app/backend")
os.chdir("/app/backend")

from routes import dorm as D  # noqa: E402


def mate(**kw):
    base = dict(id="a", gender="female", mate_gender_pref="female", budget_min=4000, budget_max=6000,
                zones=["asoke"], move_in="2027-01", tags=["clean"], has_room=False)
    base.update(kw)
    return base


# ---------------------------------------------------------------- matching
def test_gender_preference_is_a_hard_gate_both_ways():
    me = mate(id="me", gender="female", mate_gender_pref="female")
    assert D.match_score(me, mate(id="b", gender="male", mate_gender_pref="any"))["score"] == 0
    # they accept me but I don't accept them → still 0
    assert D.match_score(mate(id="me", mate_gender_pref="male"), mate(id="b", gender="female"))["score"] == 0


def test_identical_profiles_score_high_and_explain_why():
    r = D.match_score(mate(id="me"), mate(id="b"))
    assert r["score"] >= 80
    assert any("งบ" in x for x in r["reasons"])
    assert any("โซน" in x for x in r["reasons"])


def test_no_budget_overlap_scores_lower_than_overlap():
    me = mate(id="me", budget_min=3000, budget_max=4000)
    near = D.match_score(me, mate(id="b", budget_min=3500, budget_max=5000))["score"]
    far = D.match_score(me, mate(id="c", budget_min=9000, budget_max=12000))["score"]
    assert near > far


def test_lifestyle_clash_is_flagged_and_penalised():
    me = mate(id="me", tags=["night_owl"])
    clash = D.match_score(me, mate(id="b", tags=["early_bird"]))
    same = D.match_score(me, mate(id="c", tags=["night_owl"]))
    assert "เวลานอนต่างกัน" in clash["clashes"]
    assert clash["score"] < same["score"]


def test_pet_owner_vs_pet_averse_is_a_clash_but_pet_ok_is_not():
    me = mate(id="me", tags=["has_pet"])
    assert "เรื่องสัตว์เลี้ยง" in D.match_score(me, mate(id="b", tags=[]))["clashes"]
    assert D.match_score(me, mate(id="c", tags=["pet_ok"]))["clashes"] == []


def test_no_pet_clashes_with_pet_owner_and_pet_ok():
    me = mate(id="me", tags=["no_pet"])
    assert "เรื่องสัตว์เลี้ยง" in D.match_score(me, mate(id="b", tags=["has_pet"]))["clashes"]
    assert "เรื่องสัตว์เลี้ยง" in D.match_score(me, mate(id="c", tags=["pet_ok"]))["clashes"]
    assert D.match_score(me, mate(id="d", tags=["no_pet"]))["clashes"] == []


def test_thin_budget_overlap_scores_below_full_overlap():
    me = mate(id="me", budget_min=3000, budget_max=5500)
    thin = D.match_score(me, mate(id="b", budget_min=5000, budget_max=7000))
    full = D.match_score(me, mate(id="c", budget_min=3000, budget_max=5500))
    assert full["score"] - thin["score"] >= 10
    assert any("นิดเดียว" in x for x in thin["reasons"])


def test_any_budget_overlap_outranks_a_gap():
    me = mate(id="me", budget_min=3000, budget_max=5000, tags=[])
    s = lambda lo, hi: D.match_score(me, mate(id="b", budget_min=lo, budget_max=hi, tags=[]))["score"]  # noqa: E731
    assert s(4000, 9000) > s(5500, 9000)   # 1,000 overlap beats a 500 gap
    assert s(5000, 9000) > s(5500, 9000)   # touching beats a gap
    assert s(5500, 9000) >= s(9000, 12000)


def test_no_score_for_self_or_without_profile():
    me = mate(id="me")
    assert D.match_score(me, me) is None
    assert D.match_score(None, mate(id="b")) is None


def test_score_is_clamped_0_100():
    me = mate(id="me", tags=["night_owl", "has_pet", "social"], budget_min=1000, budget_max=1500)
    other = mate(id="b", tags=["early_bird", "quiet"], budget_min=50000, budget_max=60000,
                 zones=["ladprao"], move_in="2028-06")
    assert 0 <= D.match_score(me, other)["score"] <= 100


# ---------------------------------------------------------------- digest
def test_digest_links_every_listing_and_counts_mates():
    since = datetime.now(timezone.utc) - timedelta(days=7)
    listings = [dict(id=f"L{i}", kind="transfer", zone="asoke", building_name=f"ตึก {i}", price_total=12000,
                     price_per_person=6000, move_in="2027-01-01", featured=(i == 0)) for i in range(3)]
    mates = [mate(id="m1"), mate(id="m2", gender="male", has_room=True)]
    text = D.build_digest(listings, mates, "https://swumkt.org/", since)
    for i in range(3):
        assert f"https://swumkt.org/dorm/rooms/L{i}" in text
    assert "⭐" in text                      # featured listing marked
    assert "คนหาเมทใหม่ 2 คน (ญ 1, ช 1)" in text
    assert "ยังไม่มีห้อง 1 คน" in text
    assert "https://swumkt.org/dorm" in text and "//dorm" not in text
    # a transfer is rented as a whole: the whole rent leads, never "6,000/คน"
    assert "12,000 บาท/เดือน" in text and "/คน" not in text.split("คนหาเมทใหม่")[0]


def test_digest_price_follows_the_listing_kind():
    since = datetime.now(timezone.utc) - timedelta(days=7)
    rows = [dict(id="A", kind="room", zone="asoke", price_total=7000, people_total=1, move_in="2027-01-01"),
            dict(id="B", kind="room", zone="asoke", price_total=14000, people_total=2, price_per_person=7000, move_in="2027-01-01"),
            dict(id="C", kind="mate_wanted", zone="asoke", price_total=15000, people_total=2, price_per_person=7500, move_in="2027-01-01")]
    text = D.build_digest(rows, [], "https://x.org", since)
    assert "7,000 บาท/เดือน, เข้า" in text and "หาร 2 คนละ 3,500" not in text
    assert "14,000 บาท/เดือน หารได้ 2 คนละ 7,000" in text
    assert "7,500 บาท/คน/เดือน (ทั้งห้อง 15,000 หาร 2)" in text


def test_digest_truncates_long_lists_and_handles_empty_week():
    since = datetime.now(timezone.utc) - timedelta(days=7)
    many = [dict(id=f"L{i}", kind="room", zone="rama9", price_total=5000, move_in="2027-01-01") for i in range(20)]
    assert "อีก 8 รายการ" in D.build_digest(many, [], "https://x.org", since)
    assert "ยังไม่มีประกาศใหม่" in D.build_digest([], [], "https://x.org", since)


# ---------------------------------------------------------------- validation
def listing(**kw):
    base = dict(kind="transfer", title="ส่งต่อสัญญา Life Asoke", zone="asoke", price_total=12000,
                move_in="2027-01-01", contact_line="abc")
    base.update(kw)
    return D.ListingIn(**base)


def test_listing_rejects_unknown_kind_zone_and_bad_date():
    with pytest.raises(ValidationError):
        listing(kind="sale")
    with pytest.raises(ValidationError):
        listing(zone="mars")
    with pytest.raises(ValidationError):
        listing(move_in="1 ม.ค.")


def test_listing_drops_unknown_amenities_and_non_http_photos():
    x = listing(amenities=["pool", "helipad", "pool"], photo_links=["javascript:alert(1)", "https://drive.google.com/x"])
    assert x.amenities == ["pool"]
    assert x.photo_links == ["https://drive.google.com/x"]


def test_mate_cleans_tags_zones_and_requires_month_format():
    m = D.MateIn(display_name="มิ้น", gender="female", move_in="2027-01", zones=["asoke", "x"], tags=["clean", "evil"])
    assert m.zones == ["asoke"] and m.tags == ["clean"]
    with pytest.raises(ValidationError):
        D.MateIn(display_name="มิ้น", gender="female", move_in="2027-13")


def test_review_needs_at_least_one_rating_in_range():
    assert D.ReviewIn(ratings={"safety": 4, "bogus": 2}).ratings == {"safety": 4}
    with pytest.raises(ValidationError):
        D.ReviewIn(ratings={})
    with pytest.raises(ValidationError):
        D.ReviewIn(ratings={"safety": 6})


def test_seed_buildings_are_valid_and_unique():
    import json
    seed = json.loads((D.DATA_DIR / "dorm_buildings_seed.json").read_text(encoding="utf-8"))
    slugs = [D.BuildingIn(**b).slug for b in seed]
    assert len(slugs) == len(set(slugs)) >= 10


# ---------------------------------------------------------------- building photos
def _photo(**kw):
    p = dict(url="https://cdn.example.com/a.jpg", kind="exterior", credit="PropertyScout",
             source_url="https://example.com/project", bytes=200_000)
    p.update(kw)
    return p


def test_building_photos_must_be_https_and_at_most_six():
    base = dict(slug="test-bldg", name="Test", zone="asoke")
    assert D.BuildingIn(**base, photos=[_photo()], official_url="https://x.example.com").photos[0].kind == "exterior"
    for bad in (dict(url="http://cdn.example.com/a.jpg"), dict(source_url="javascript:alert(1)"), dict(kind="floorplan")):
        with pytest.raises(ValidationError):
            D.BuildingIn(**base, photos=[_photo(**bad)])
    with pytest.raises(ValidationError):
        D.BuildingIn(**base, photos=[_photo()] * 7)
    with pytest.raises(ValidationError):
        D.BuildingIn(**base, official_url="http://x.example.com")
    assert D.BuildingIn(**base, official_url="").official_url is None


def test_card_thumb_skips_heavy_photos():
    heavy, light = _photo(url="https://c.example.com/h.png", bytes=2_400_000), _photo(url="https://c.example.com/l.jpg")
    assert D.building_thumb([heavy, light])["url"].endswith("l.jpg")
    assert D.building_thumb([heavy]) is None
    assert D.building_thumb([]) is None


def test_seed_photos_are_remote_credited_and_ordered():
    import json
    seed = json.loads((D.DATA_DIR / "dorm_buildings_seed.json").read_text(encoding="utf-8"))
    with_photos = [b for b in seed if b.get("photos")]
    assert len(with_photos) >= 8
    for b in with_photos:
        for p in b["photos"]:
            assert p["url"].startswith("https://") and p["credit"] and p["source_url"].startswith("https://")


# ---------------------------------------------------------------- OpenChat archive
CHAT_FIXTURE = {"period": {"from": "2026-05-01", "to": "2026-11-01"}, "posts": [
    dict(id="c1", date="2026-10-01", kind="mate_wanted", building_slug="life-asoke", zone="asoke",
         price_per_person=6000, line_id="leak-me", phone="0812345678", text="call me"),
    dict(id="c2", date="2026-11-01", kind="transfer", building_slug="life-asoke", zone="asoke",
         price_total=13000, people_total=2),
    dict(id="c3", date="2026-09-01", kind="room", building_slug="life-asoke", zone="asoke", price_total=9000),
    dict(id="c4", date="2026-08-01", kind="seeking", zone="asoke", budget_min=4000, budget_max=6000,
         price_per_person=99999),
    dict(id="c5", date="2026-07-01", kind="transfer", zone="rama9", price_per_person=4500, reposts=3),
    dict(id="c6", date="2026-07-02", kind="spam", zone="rama9"),
]}


def test_mate_ad_with_one_low_price_counts_as_inferred_per_person():
    # Rule (routes/dorm.py, INFER_PER_PERSON_MAX): a mate ad with only price_total (no people_total, no
    # price_per_person) and price_total <= 8,000 is a per-person share; flagged inferred. Anything else
    # with a bare total stays a whole-room price and never enters per-person statistics.
    fx = {"posts": [
        dict(id="m1", date="2026-10-01", kind="mate_wanted", price_total=5500),
        dict(id="m2", date="2026-10-02", kind="mate_wanted", price_total=8000),
        dict(id="m3", date="2026-10-03", kind="mate_wanted", price_total=12000),          # too high: whole room
        dict(id="m4", date="2026-10-04", kind="room", price_total=7000),                  # not a mate ad
        dict(id="m5", date="2026-10-05", kind="mate_wanted", price_total=7000, people_total=2),
        dict(id="m6", date="2026-10-06", kind="mate_wanted", price_total=7000, price_per_person=3600),
    ]}
    by = {p["id"]: (p["per_person"], p["per_person_inferred"]) for p in D.clean_chat_posts(fx)["posts"]}
    assert by == {"m1": (5500, True), "m2": (8000, True), "m3": (None, False), "m4": (None, False),
                  "m5": (3500, False), "m6": (3600, False)}
    s = D.chat_summary(D.clean_chat_posts(fx)["posts"])["per_person"]
    assert s["n"] == 4 and s["max"] == 8000          # 12,000 and 7,000 whole-room prices are not mixed in


def test_chat_posts_keep_only_whitelisted_fields():
    posts = D.clean_chat_posts(CHAT_FIXTURE)["posts"]
    assert [p["id"] for p in posts] == ["c2", "c1", "c3", "c4", "c5"]      # newest first, bad kind dropped
    for p in posts:
        assert set(p) == set(D.CHAT_FIELDS) | {"per_person", "per_person_inferred"}
        assert not {"line_id", "phone", "text", "contact", "name"} & set(p)


def test_chat_per_person_and_building_summary():
    posts = D.clean_chat_posts(CHAT_FIXTURE)["posts"]
    by = {p["id"]: p["per_person"] for p in posts}
    # price_per_person, or total / people; never for seeking posts; unknown without people
    assert by == {"c1": 6000, "c2": 6500, "c3": None, "c4": None, "c5": 4500}
    s = D.chat_summary(D.filter_chat(posts, building="life-asoke"))
    assert s["count"] == 3 and s["last_date"] == "2026-11-01"
    assert s["per_person"] == {"n": 2, "min": 6000, "median": 6250, "max": 6500, "p25": 6000, "p75": 6500}
    assert D.price_summary([])["n"] == 0
    assert D.price_summary([5, 1, 3])["median"] == 3


def test_chat_filters():
    posts = D.clean_chat_posts(CHAT_FIXTURE)["posts"]
    ids = lambda **kw: [p["id"] for p in D.filter_chat(posts, **kw)]  # noqa: E731
    assert ids(zone="rama9") == ["c5"]
    assert ids(kind="transfer,room") == ["c2", "c3", "c5"]
    assert ids(kind="seeking") == ["c4"]
    assert ids(max_price=6000) == ["c1", "c4", "c5"]       # seeking matches on its budget; unpriced drop out
    assert ids(min_price=6200) == ["c2"]
    assert ids(kind="bogus") == ids()                       # unknown kind = no kind filter


def test_real_chat_file_is_anonymous_and_consistent():
    chat = D.load_chat_posts()
    assert chat["period"]["from"] and chat["period"]["to"]
    assert len(chat["posts"]) >= 100
    for p in chat["posts"]:
        assert set(p) == set(D.CHAT_FIELDS) | {"per_person", "per_person_inferred"}
        assert p["kind"] in D.CHAT_KINDS
        if p["kind"] == "seeking":
            assert p["per_person"] is None


# ---------------------------------------------------------------- external listings + interest (pure)
EXT_ROW = dict(ext_id="propertyscout:111", source="PropertyScout", source_url="https://example.com/a-111",
               seen_at="2026-11-26", building_slug="life-asoke", building_name="Life Asoke", zone="asoke",
               price_total=15000, bedrooms=1, bathrooms=1, size_sqm=35, floor=12, furnished=True,
               amenities=["pool", "bogus"], min_contract_months=None, deposit_months=2, advance_months=1,
               available_from=None, photos=[{"url": "https://img.example.com/1.jpg", "credit": "PropertyScout",
                                             "source_url": "https://example.com/a-111"},
                                            {"url": "http://insecure.example.com/2.jpg", "credit": "x"}],
               # never allowed through, whatever a future collector writes
               description="โทร 0812345678", advertiser="Agent A", phone="0812345678", line_id="@agent")


def _raw(*rows):
    return {"generated": "2026-11-26", "listings": list(rows)}


def test_default_share_by_bedrooms():
    assert [D.default_share(b) for b in (0, 1, 2, 3, 5, None)] == [2, 2, 3, 4, 4, 2]


def test_external_row_is_whitelisted_facts_only():
    r = D.clean_external_row(EXT_ROW)
    assert set(r) == set(D.EXT_ROW_KEYS)
    assert r["amenities"] == ["pool"]
    assert [p["url"] for p in r["photos"]] == ["https://img.example.com/1.jpg"]     # https only
    doc = D.external_doc(r)
    for k in ("description", "advertiser", "phone", "line_id", "contact_line", "contact_phone"):
        assert not doc.get(k)
    assert doc["external"] is True and doc["kind"] == "room" and doc["owner_id"] is None
    assert doc["title"] == "1 ห้องนอน 35 ตร.ม. Life Asoke"
    assert doc["people_total"] == 2 and doc["price_per_person"] == 7500
    assert doc["deposit"] == 30000
    assert doc["expires_at"].startswith("2026-12-17")                               # seen + 21 days
    assert doc["id"] == D.ext_listing_id("propertyscout:111") and len(doc["id"]) == 12
    assert D.ext_title({**r, "bedrooms": 0, "size_sqm": 28}).startswith("สตูดิโอ 28 ตร.ม.")
    # unusable rows are dropped
    for bad in ({**EXT_ROW, "ext_id": "no colon"}, {**EXT_ROW, "source_url": "http://x.com/a"},
                {**EXT_ROW, "price_total": None}, {**EXT_ROW, "seen_at": "yesterday"}):
        assert D.clean_external_row(bad) is None


def test_import_plan_is_idempotent_and_never_resurrects():
    now = datetime(2026, 11, 26, tzinfo=timezone.utc)
    b = {**EXT_ROW, "ext_id": "propertyscout:222"}
    p1 = D.plan_external_import(_raw(EXT_ROW, b, EXT_ROW), [], now)        # duplicate row counted once
    assert [d["ext_id"] for d in p1["upsert"]] == ["propertyscout:111", "propertyscout:222"] and not p1["close"]
    stored = [{"ext_id": d["ext_id"], "status": "active"} for d in p1["upsert"]]
    p2 = D.plan_external_import(_raw(EXT_ROW, b), stored, now)
    assert [d["ext_id"] for d in p2["upsert"]] == [d["ext_id"] for d in p1["upsert"]]
    assert all("status" not in d for d in p2["upsert"]) and not p2["close"]   # same result, status untouched
    # a row no longer in the file closes (reason "missing")
    p3 = D.plan_external_import(_raw(EXT_ROW), stored, now)
    assert p3["close"] == ["propertyscout:222"]
    # ...and reopens if it comes back
    stored3 = [stored[0], {"ext_id": "propertyscout:222", "status": "closed", "closed_reason": "missing"}]
    p4 = D.plan_external_import(_raw(EXT_ROW, b), stored3, now)
    back = next(d for d in p4["upsert"] if d["ext_id"] == "propertyscout:222")
    assert back["status"] == "active"
    # closed by an admin, deleted, or confirmed gone: skipped, never resurrected
    for reason in ("admin", "deleted", "gone"):
        st = [stored[0], {"ext_id": "propertyscout:222", "status": "closed", "closed_reason": reason}]
        p = D.plan_external_import(_raw(EXT_ROW, b), st, now)
        assert p["skipped"] == ["propertyscout:222"]
        assert "propertyscout:222" not in [d["ext_id"] for d in p["upsert"]] and not p["close"]


def test_spots_and_interest_summary():
    room = {"kind": "room", "people_total": 3}
    people = [{"user_id": "u1", "party_size": 1, "display_name": "มิ้น"}, {"user_id": "u2", "party_size": 2, "display_name": "ฝน"}]
    s = D.interest_fields(room, people, "u2")
    assert s["interest_count"] == 2 and s["interest_people"] == 3
    assert s["spots_total"] == 3 and s["spots_left"] == 0 and s["my_interest"] == {"party_size": 2}
    # avatars are initials + tone only: no name, no user id
    assert [a["initials"] for a in s["interest_avatars"]] == ["ม", "ฝ"]
    assert all(set(a) == {"initials", "tone"} for a in s["interest_avatars"])
    assert "u1" not in str(s) and "มิ้น" not in str(s) and "ฝน" not in str(s)
    assert s["interest_match"] is None                                    # no viewer profile, no match count
    # the poster of a mate_wanted ad already takes a seat
    assert D.spots_of({"kind": "mate_wanted", "people_total": 3}, 1) == {"spots_total": 3, "spots_taken": 2, "spots_left": 1}
    assert D.interest_fields(room, [], None)["my_interest"] is None


def test_avatar_initials_match_the_frontend_rule():
    assert D.avatar_of("มิ้น")["initials"] == "ม"
    assert D.avatar_of("เอิร์น")["initials"] == "อ"          # leading vowel mark skipped
    assert D.avatar_of("John Smith")["initials"] == "JS"
    assert D.avatar_of("มิ้น (ตัวอย่าง)") == D.avatar_of("มิ้น")
    assert D.avatar_of("")["initials"] == "?"
    assert D.avatar_of("Mint")["tone"] in D.AVATAR_TONES


def test_interest_match_counts_only_people_who_pass_the_gate_both_ways():
    room = {"kind": "room", "people_total": 2}
    women = [{"user_id": "a", "party_size": 1, "display_name": "A", "gender": "female", "mate_gender_pref": "female"},
             {"user_id": "b", "party_size": 1, "display_name": "B", "gender": "female", "mate_gender_pref": "female"}]
    man = {"user_id": "c", "party_size": 1, "display_name": "C", "gender": "male", "mate_gender_pref": "male"}
    people = women + [man]
    s = D.interest_fields(room, people, "c", man)
    assert s["interest_people"] == 3 and s["interest_match"] == 0       # the total is neutral, the match is his
    assert D.interest_fields(room, people, "a", women[0])["interest_match"] == 1   # B, not herself, not C
    anyone = {"user_id": "d", "gender": "female", "mate_gender_pref": "any"}
    assert D.interest_fields(room, people, "d", anyone)["interest_match"] == 2


def test_gender_only_listing_refuses_the_other_gender():
    x = {"kind": "mate_wanted", "gender_pref": "male"}
    assert D.listing_refuses(x, {"gender": "female"}) == "ประกาศนี้รับเฉพาะเมทชาย"
    assert D.listing_refuses(x, {"gender": "male"}) is None
    assert D.listing_refuses({**x, "gender_pref": "any"}, {"gender": "female"}) is None
    assert D.listing_refuses({**x, "external": True}, {"gender": "female"}) is None
    assert D.listing_refuses(x, None) is None                           # no profile yet: the 428 comes first


def test_whole_room_price_leads_for_rooms_rented_as_a_whole():
    assert D.whole_first({"kind": "room"}) and D.whole_first({"kind": "transfer"}) and D.whole_first({"kind": "short_term"})
    assert not D.whole_first({"kind": "mate_wanted"})
    assert not D.whole_first({"external": True, "kind": "room", "single_room": False})
    assert D.whole_first({"external": True, "kind": "room", "single_room": True})
    assert D.price_text({"kind": "room", "price_total": 7000, "people_total": 1}) == "7,000 บาท/เดือน"
    assert D.price_text({"external": True, "kind": "room", "price_total": 6500, "people_total": 2, "price_per_person": 3250},
                        single=True) == "6,500 บาท/เดือน อยู่คนเดียว หรือหาร 2 คนละ 3,250"
    assert D.price_text({"external": True, "kind": "room", "price_total": 15000, "people_total": 2,
                         "price_per_person": 7500}) == "7,500 บาท/คน/เดือน (ทั้งห้อง 15,000 หาร 2)"


def test_recommended_order_is_featured_then_native_newest_then_external_cheapest():
    rows = [
        {"id": "e1", "external": True, "price_per_person": 9000, "renewed_at": "2026-11-20"},
        {"id": "e2", "external": True, "price_per_person": 3000, "renewed_at": "2026-11-01"},
        {"id": "n1", "price_per_person": 25000, "renewed_at": "2026-11-10"},
        {"id": "n2", "price_per_person": 4000, "renewed_at": "2026-11-12"},
        {"id": "f1", "external": True, "featured": True, "price_per_person": 12000, "renewed_at": "2026-10-01"},
        {"id": "e3", "external": True, "price_per_person": 3000, "renewed_at": "2026-11-02"},
    ]
    assert [x["id"] for x in D.recommended_order(rows)] == ["f1", "n2", "n1", "e2", "e1", "e3"]


def test_recommended_order_mixes_all_four_price_tiers_and_buildings():
    rows = [
        {"id": "t0a", "external": True, "price_per_person": 2500, "building_slug": "b0a"},
        {"id": "t0b", "external": True, "price_per_person": 3500, "building_slug": "b0b"},
        {"id": "t1a", "external": True, "price_per_person": 4500, "building_slug": "b1a"},
        {"id": "t1b", "external": True, "price_per_person": 5800, "building_slug": "b1b"},
        {"id": "t2a", "external": True, "price_per_person": 7000, "building_slug": "b2a"},
        {"id": "t2b", "external": True, "price_per_person": 8500, "building_slug": "b2b"},
        {"id": "t3a", "external": True, "price_per_person": 9500, "building_slug": "b3a"},
        {"id": "t3b", "external": True, "price_per_person": 12000, "building_slug": "b3b"},
    ]
    ordered = D.recommended_order(rows)
    first_4_tiers = [D._price_tier(x) for x in ordered[:4]]
    assert first_4_tiers == [0, 1, 2, 3]
    assert len({x["building_slug"] for x in ordered[:8]}) == 8


def test_real_external_file_is_clean():
    import json as _json
    path = D.DATA_DIR / D.EXT_FILE
    if not path.exists():
        pytest.skip("no external listings file yet")
    raw = _json.loads(path.read_text(encoding="utf-8"))
    rows = raw.get("listings") or []
    plan = D.plan_external_import(raw, [], datetime.now(timezone.utc))
    assert len(plan["upsert"]) == len({r.get("ext_id") for r in rows}) > 0
    import re as _re
    for d in plan["upsert"]:
        # free-text-ish fields carry no phone, LINE id or handle; the rest are numbers, ids and https URLs
        text = " ".join(str(d.get(k) or "") for k in ("title", "building_name", "source"))
        assert not _re.search(r"(?<!\w)0\d{8,9}(?!\w)|line\.me|ไลน์|@[A-Za-z]", text), d["ext_id"]
        assert not any(d.get(k) for k in ("description", "contact_line", "contact_phone"))


def test_single_room_flag():
    studio = {"external": True, "kind": "room", "bedrooms": 0, "people_total": 2}
    assert D.is_single_room({**studio, "size_sqm": 22})                      # small studio in a condo
    assert not D.is_single_room({**studio, "size_sqm": 28}, "condo")         # 28 sqm and up: not by size
    assert D.is_single_room({**studio, "size_sqm": 40}, "apartment")         # any studio in an apartment / dorm
    assert D.is_single_room({**studio, "size_sqm": None}, "dorm")
    assert not D.is_single_room({**studio, "size_sqm": None}, "condo")       # size unknown in a condo
    assert not D.is_single_room({**studio, "bedrooms": 1, "size_sqm": 20})   # a bedroom of its own
    assert not D.is_single_room({**studio, "bedrooms": None, "size_sqm": 20})
    # normal posts: same rule, but a "looking for a mate" ad or a 3-way split the poster chose is never single
    own = {"kind": "room", "bedrooms": 0, "size_sqm": 24, "people_total": 2}
    assert D.is_single_room(own) and D.is_single_room({**own, "people_total": 1})
    assert not D.is_single_room({**own, "kind": "mate_wanted"})
    assert not D.is_single_room({**own, "people_total": 3})


def test_single_room_keeps_the_two_way_split_for_budget_filters():
    r = D.clean_external_row({**EXT_ROW, "bedrooms": 0, "size_sqm": 22, "price_total": 6500})
    doc = D.external_doc(r)
    # filtered on the lowest sensible per-person price (total / 2), the card then says the split is what matches
    assert doc["people_total"] == 2 and doc["price_per_person"] == 3250
    assert D.is_single_room(doc) and D.spots_of(doc, 1)["spots_total"] == 2


def test_rows_sharing_the_building_cover_are_marked_for_grouping():
    now = datetime(2026, 11, 26, tzinfo=timezone.utc)
    cover = [{"url": "https://img.example.com/cover.jpg", "credit": "Renthub"}]
    rows = [{**EXT_ROW, "ext_id": f"renthub:{i}", "source": "Renthub", "building_slug": "witchuwan-apartel-ratchada3",
             "photos": cover, "price_total": 6500 + 500 * i} for i in range(3)]
    own = {**rows[0], "ext_id": "renthub:own", "photos": [{"url": "https://img.example.com/room.jpg"}]}
    bare = {**rows[0], "ext_id": "renthub:bare", "photos": []}
    nob = {**rows[0], "ext_id": "renthub:nob", "building_slug": None, "photos": []}
    other = {**rows[0], "ext_id": "propertyscout:9", "source": "PropertyScout"}     # same cover, other source
    plan = D.plan_external_import(_raw(*rows, own, bare, nob, other), [], now)
    mark = {d["ext_id"]: d["shared_photo"] for d in plan["upsert"]}
    assert all(mark[f"renthub:{i}"] for i in range(3)) and mark["renthub:bare"]
    assert not mark["renthub:own"] and not mark["renthub:nob"] and not mark["propertyscout:9"]



# ---------------------------------------------------------------- round B: ordering, dates, prices, zones, photos
def test_every_sort_ends_on_the_id_so_ties_never_reorder():
    rows = [dict(id=f"x{i:02d}", renewed_at="2026-11-01", price_per_person=5000, move_in="2026-12-01",
                 interest_people=0, interest_count=0, external=True) for i in range(12)]
    rows += [dict(id="n1", renewed_at="2026-11-02", price_per_person=None, move_in=None, interest_people=2,
                  interest_count=1), dict(id="f1", featured=True, renewed_at="2026-10-01", price_per_person=9000)]
    for s in D.SORTS:
        a = [x["id"] for x in D.sort_listings(list(rows), s)]
        b = [x["id"] for x in D.sort_listings(list(reversed(rows)), s)]
        assert a == b and len(set(a)) == len(rows), s
    assert [x["id"] for x in D.sort_listings(rows, "price")][-1] == "n1"        # unknown price last
    assert D.sort_listings(rows, "interest")[0]["id"] == "n1"
    assert D.sort_listings(rows, "new")[0]["id"] == "f1"                       # featured first


def test_listing_dates_must_be_real_and_price_per_person_is_derived():
    with pytest.raises(ValidationError):
        listing(move_in="2026-02-30")
    assert D.real_date("2027-02-28") and not D.real_date("2026-02-30")
    assert D.per_person_of(7000, 1) == 7000 and D.per_person_of(15000, 2) == 7500 and D.per_person_of(10000, 3) == 3333
    assert D.per_person_of(7000, 0) == 7000


def test_review_rating_must_be_a_number():
    for bad in ("abc", [1], {"x": 1}, True):
        with pytest.raises(ValidationError):
            D.ReviewIn(ratings={"safety": bad})
    assert D.ReviewIn(ratings={"safety": "4"}).ratings == {"safety": 4}


def test_report_note_is_short_plain_text_and_reasons_follow_the_target():
    assert D.ReportIn(target_type="mate", target_id="a", reason="x", note=" a\x00b \n c ").note == "ab c"
    with pytest.raises(ValidationError):
        D.ReportIn(target_type="mate", target_id="a", reason="x", note="ก" * 201)
    assert "ห้องเต็มแล้วแต่ไม่ปิดประกาศ" not in D.REPORT_REASONS_BY_TYPE["mate"]
    assert set(D.REPORT_REASONS_BY_TYPE) == {"listing", "mate", "review"}


def test_mate_zone_rule_counts_people_open_to_any_zone():
    assert D.mate_in_zone({"zones": ["asoke"]}, "asoke") and D.mate_in_zone({"zones": []}, "rama9")
    assert not D.mate_in_zone({"zones": ["asoke"]}, "rama9") and D.mate_in_zone({}, "rama9")


def test_photo_must_really_decode():
    import base64 as b64
    jpeg = b64.b64decode("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAx"
                         "NDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAI"
                         "AQEAAD8AKp//2Q==")
    assert D.decodes_as_image(jpeg, "image/jpeg")
    assert not D.decodes_as_image(jpeg, "image/png")
    assert not D.decodes_as_image(bytes([0xFF, 0xD8, 0xFF]) + b"not really a jpeg" * 20, "image/jpeg")


def test_dual_track_expiry_and_gone_helpers():
    assert D.expiry_days_for("mate_wanted", False) == 14
    assert D.expiry_days_for("transfer", False) == 14
    assert D.expiry_days_for("room", False) == 30
    assert D.expiry_days_for("short_term", False) == 30
    assert D.expiry_days_for("room", True) == 21
    now_s = "2026-12-01T00:00:00+00:00"
    assert not D.is_listing_gone({"status": "reserved", "reserved_until": "2026-12-05T00:00:00+00:00", "expires_at": "2026-12-10T00:00:00+00:00"}, now_s)
    assert D.is_listing_gone({"status": "reserved", "reserved_until": "2026-11-30T00:00:00+00:00", "expires_at": "2026-12-10T00:00:00+00:00"}, now_s)
    assert D.gone_label_of({"external": True, "status": "closed"}) == "ไม่ว่างแล้ว (อ้างอิงราคา)"
    assert D.gone_label_of({"external": False, "kind": "mate_wanted", "status": "closed"}) == "ได้เมทแล้ว"
    assert D.gone_label_of({"external": False, "kind": "transfer", "status": "closed"}) == "ส่งต่อสัญญาแล้ว"
    assert D.gone_label_of({"external": False, "kind": "room", "status": "closed"}) == "ปล่อยเช่าแล้ว"
    assert D.gone_label_of({"external": False, "status": "closed", "closed_reason": "paused_unconfirmed"}) == "พักประกาศ (รอเจ้าของยืนยัน)"
    cutoff = "2026-09-01T00:00:00+00:00"
    assert D.is_publicly_archivable({"external": True, "closed_reason": "gone", "closed_at": "2026-11-26"}, cutoff)
    assert not D.is_publicly_archivable({"external": True, "closed_reason": "deleted", "closed_at": "2026-11-26"}, cutoff)
    assert not D.is_publicly_archivable({"external": False, "closed_by": "admin", "closed_at": "2026-11-26"}, cutoff)
    assert not D.is_publicly_archivable({"external": True, "closed_reason": "gone", "closed_at": "2026-01-01"}, cutoff)


def test_maybe_gone_external_ranks_behind_clean_external_rooms():
    rows = [
        {"id": "e1", "external": True, "price_per_person": 4000, "maybe_gone": True},
        {"id": "e2", "external": True, "price_per_person": 6000, "maybe_gone": False},
        {"id": "g1", "external": True, "price_per_person": 3000, "is_gone": True, "closed_at": "2026-11-26"},
    ]
    assert [x["id"] for x in D.recommended_order(rows)] == ["e2", "e1", "g1"]
