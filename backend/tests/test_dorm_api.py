"""Dorm API end-to-end against a running backend (pod: http://localhost:8001).

Registers two throwaway students, then walks the real flows:
privacy of contacts, lead logging, match ordering, expiry, ownership, reviews,
reports and the admin digest. Cleans up what it created.

    DORM_BASE=http://localhost:8001 pytest tests/test_dorm_api.py -q
"""
import os
import uuid

import pytest
import requests

BASE = os.environ.get("DORM_BASE", "http://localhost:8001").rstrip("/") + "/api"
ADMIN = ("admin@swu.ac.th", "admin123")


def _register(name):
    email = f"dormtest-{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{BASE}/auth/register", json={"email": email, "password": "pw-123456", "full_name": name})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _login(email, pw):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip("seeded admin not present in this database")
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def ctx():
    try:
        requests.get(f"{BASE}/dorm/meta", timeout=5).raise_for_status()
    except Exception:
        pytest.skip(f"backend not reachable at {BASE}")
    a, b = _register("มิ้น ทดสอบ"), _register("ฝน ทดสอบ")
    yield {"a": a, "b": b, "listings": []}
    for h in (a, b):
        requests.delete(f"{BASE}/dorm/mates/me", headers=h)
        requests.delete(f"{BASE}/dorm/buildings/pg-rama9/reviews/me", headers=h)
        for x in requests.get(f"{BASE}/dorm/my", headers=h).json().get("listings", []):
            requests.delete(f"{BASE}/dorm/listings/{x['id']}", headers=h)


LISTING = dict(kind="transfer", title="ทดสอบ ส่งต่อสัญญา Life Asoke", building_name="life asoke tower",
               zone="asoke", price_total=15000, people_total=3, deposit=15000, move_in="2027-01-01",
               contract_months_left=7, gender_pref="female", amenities=["walk_swu", "pool"],
               contact_line="secret-line-id", contact_phone="0800000000")


def test_buildings_are_seeded_on_first_use(ctx):
    items = requests.get(f"{BASE}/dorm/buildings").json()["items"]
    assert len(items) >= 10
    assert any(b["slug"] == "life-asoke" for b in items)


def test_create_listing_links_building_by_alias_and_splits_price(ctx):
    r = requests.post(f"{BASE}/dorm/listings", json=LISTING, headers=ctx["a"])
    assert r.status_code == 200, r.text
    x = r.json()
    ctx["listings"].append(x["id"])
    assert x["building_slug"] == "life-asoke"        # free text "life asoke tower" matched an alias
    assert x["price_per_person"] == 5000


def test_listing_requires_login_and_a_contact(ctx):
    assert requests.post(f"{BASE}/dorm/listings", json=LISTING).status_code in (401, 403)
    bad = {**LISTING, "contact_line": "", "contact_phone": ""}
    assert requests.post(f"{BASE}/dorm/listings", json=bad, headers=ctx["a"]).status_code == 422


def test_public_views_never_carry_contacts(ctx):
    lid = ctx["listings"][0]
    lst = requests.get(f"{BASE}/dorm/listings", params={"kind": "transfer"}).text
    one = requests.get(f"{BASE}/dorm/listings/{lid}").text
    bld = requests.get(f"{BASE}/dorm/buildings/life-asoke").text
    for body in (lst, one, bld):
        assert "secret-line-id" not in body and "0800000000" not in body
    assert "owner_id" not in requests.get(f"{BASE}/dorm/listings/{lid}").json()["listing"]
    # lists must not expose who owns what either
    assert '"owner_id"' not in lst and '"owner_id"' not in bld
    # …but the owner still sees it as theirs
    assert requests.get(f"{BASE}/dorm/listings/{lid}", headers=ctx["a"]).json()["listing"]["is_mine"] is True


def test_contact_reveal_needs_login_and_counts_a_lead(ctx):
    lid = ctx["listings"][0]
    assert requests.get(f"{BASE}/dorm/listings/{lid}/contact").status_code in (401, 403)
    r = requests.get(f"{BASE}/dorm/listings/{lid}/contact", headers=ctx["b"])
    assert r.json()["contact_line"] == "secret-line-id"
    mine = requests.get(f"{BASE}/dorm/my", headers=ctx["a"]).json()["listings"]
    assert next(x for x in mine if x["id"] == lid)["contact_reveals"] == 1
    # the owner looking at their own contact is not a lead, and the same viewer again is not a new one
    requests.get(f"{BASE}/dorm/listings/{lid}/contact", headers=ctx["a"])
    assert requests.get(f"{BASE}/dorm/listings/{lid}/contact", headers=ctx["b"]).status_code == 200
    mine = requests.get(f"{BASE}/dorm/my", headers=ctx["a"]).json()["listings"]
    assert next(x for x in mine if x["id"] == lid)["contact_reveals"] == 1


def test_filters(ctx):
    p = {"kind": "transfer", "zone": "asoke"}
    ids = lambda **q: [x["id"] for x in requests.get(f"{BASE}/dorm/listings", params={**p, **q}).json()["items"]]  # noqa: E731
    lid = ctx["listings"][0]
    assert lid in ids(max_price=5000)
    assert lid not in ids(max_price=4999)
    assert lid in ids(min_price=5000) and lid not in ids(min_price=5001)
    assert lid in ids(gender="female")
    assert lid not in ids(gender="male")
    assert lid in ids(amenity="pool")
    assert lid in ids(q="Life")


def test_small_studio_is_single_and_still_found_by_a_shared_budget(ctx):
    room = {**LISTING, "kind": "room", "title": "ทดสอบ สตูดิโอเล็ก", "price_total": 6000, "people_total": 2,
            "bedrooms": 0, "size_sqm": 22}
    r = requests.post(f"{BASE}/dorm/listings", json=room, headers=ctx["a"])
    assert r.status_code == 200, r.text
    lid = r.json()["id"]
    ctx["listings"].append(lid)
    one = requests.get(f"{BASE}/dorm/listings/{lid}").json()["listing"]
    assert one["single_room"] is True and one["price_per_person"] == 3000 and one["spots_total"] == 2
    found = {x["id"]: x for x in requests.get(f"{BASE}/dorm/listings", params={"kind": "room", "max_price": 3000}).json()["items"]}
    assert lid in found and found[lid]["single_room"] is True        # matches through the 2-way split
    assert lid not in [x["id"] for x in requests.get(f"{BASE}/dorm/listings", params={"kind": "room", "max_price": 2999}).json()["items"]]
    # the transfer posted above (no bedrooms given) is not a single room
    assert requests.get(f"{BASE}/dorm/listings/{ctx['listings'][0]}").json()["listing"]["single_room"] is False


def test_saved_ids_lookup_returns_open_listings_without_counting_views(ctx):
    lid = ctx["listings"][0]
    views = lambda: next(x for x in requests.get(f"{BASE}/dorm/my", headers=ctx["a"]).json()["listings"] if x["id"] == lid)["views"]  # noqa: E731
    before = views()
    r = requests.get(f"{BASE}/dorm/listings", params={"ids": f"nope-{uuid.uuid4().hex[:6]},{lid},{lid}"})
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert [x["id"] for x in items] == [lid]                 # unknown ids dropped, duplicates collapsed
    assert "secret-line-id" not in r.text and "owner_id" not in items[0]
    assert views() == before                                 # a saved-list lookup is not a view
    assert requests.get(f"{BASE}/dorm/listings", params={"ids": ""}).json()["items"] == []


def test_only_owner_can_edit_and_closing_hides_it(ctx):
    lid = ctx["listings"][0]
    assert requests.put(f"{BASE}/dorm/listings/{lid}", json=LISTING, headers=ctx["b"]).status_code == 403
    assert requests.post(f"{BASE}/dorm/listings/{lid}/status", json={"status": "closed"}, headers=ctx["b"]).status_code == 403
    assert requests.post(f"{BASE}/dorm/listings/{lid}/status", json={"status": "closed"}, headers=ctx["a"]).status_code == 200
    assert requests.get(f"{BASE}/dorm/listings/{lid}").status_code == 410
    assert requests.get(f"{BASE}/dorm/listings/{lid}/contact", headers=ctx["b"]).status_code == 410   # like the page
    assert requests.get(f"{BASE}/dorm/listings/{lid}", headers=ctx["a"]).status_code == 200   # owner still sees it
    assert lid not in [x["id"] for x in requests.get(f"{BASE}/dorm/listings").json()["items"]]
    assert requests.get(f"{BASE}/dorm/listings", params={"ids": lid}).json()["items"] == []   # closed drops from saved


MATE = dict(display_name="มิ้น", gender="female", mate_gender_pref="female", year="1", budget_min=4000,
            budget_max=6000, zones=["asoke"], move_in="2027-01", tags=["clean", "night_owl"],
            contact_line="mint-line", consent=True)


def test_mate_profile_needs_consent_and_contact(ctx):
    assert requests.put(f"{BASE}/dorm/mates/me", json={**MATE, "consent": False}, headers=ctx["a"]).status_code == 422
    assert requests.put(f"{BASE}/dorm/mates/me", json={**MATE, "contact_line": ""}, headers=ctx["a"]).status_code == 422
    assert requests.put(f"{BASE}/dorm/mates/me", json={**MATE, "budget_min": 9000}, headers=ctx["a"]).status_code == 422


def test_mates_are_ranked_by_match_and_hide_contacts(ctx):
    a = requests.put(f"{BASE}/dorm/mates/me", json=MATE, headers=ctx["a"]).json()["profile"]
    b = requests.put(f"{BASE}/dorm/mates/me", json={**MATE, "display_name": "ฝน", "tags": ["clean", "early_bird"],
                                                     "contact_line": "fon-line"}, headers=ctx["b"]).json()["profile"]
    r = requests.get(f"{BASE}/dorm/mates", headers=ctx["a"]).json()
    assert r["me"] is True
    assert r["items"][0]["is_me"]                                   # own card first
    fon = next(m for m in r["items"] if m["id"] == b["id"])
    assert fon["match"]["score"] > 0 and "เวลานอนต่างกัน" in fon["match"]["clashes"]
    raw = requests.get(f"{BASE}/dorm/mates").text
    assert "mint-line" not in raw and "fon-line" not in raw and "user_id" not in raw
    c = requests.get(f"{BASE}/dorm/mates/{a['id']}/contact", headers=ctx["b"]).json()
    assert c["contact_line"] == "mint-line"
    # a lead counts once per viewer; looking at one's own contact never counts
    requests.get(f"{BASE}/dorm/mates/{a['id']}/contact", headers=ctx["b"])
    requests.get(f"{BASE}/dorm/mates/{a['id']}/contact", headers=ctx["a"])
    assert requests.get(f"{BASE}/dorm/mates/me", headers=ctx["a"]).json()["profile"]["contact_reveals"] == 1


def test_male_seeker_with_profile_does_not_see_female_only_profiles(ctx):
    h = _register("ต้น ทดสอบ")
    try:
        requests.put(f"{BASE}/dorm/mates/me", json={**MATE, "display_name": "ต้น", "gender": "male",
                                                     "mate_gender_pref": "male", "contact_line": "ton"}, headers=h)
        r = requests.get(f"{BASE}/dorm/mates", headers=h).json()
        names = [m["display_name"] for m in r["items"]]
        assert "มิ้น" not in names and "ฝน" not in names
        # the hidden people are counted (both sides' preferences), so the page can say why it looks empty
        hid = r["hidden_by_gender"]
        assert hid["total"] >= 2 and hid["theirs"] >= 2 and hid["mine"] >= 2
        assert all(not m["is_me"] or m["display_name"] == "ต้น" for m in r["items"])
        # without a profile nothing is hidden by the gate
        assert requests.get(f"{BASE}/dorm/mates").json()["hidden_by_gender"]["total"] == 0
    finally:
        requests.delete(f"{BASE}/dorm/mates/me", headers=h)


def test_closed_profile_disappears(ctx):
    requests.post(f"{BASE}/dorm/mates/me/close", headers=ctx["b"])
    names = [m["display_name"] for m in requests.get(f"{BASE}/dorm/mates").json()["items"]]
    assert "ฝน" not in names
    requests.post(f"{BASE}/dorm/mates/me/renew", headers=ctx["b"])
    assert "ฝน" in [m["display_name"] for m in requests.get(f"{BASE}/dorm/mates").json()["items"]]


def test_review_upserts_one_per_user_and_feeds_the_average(ctx):
    for stars in (2, 4):
        r = requests.post(f"{BASE}/dorm/buildings/pg-rama9/reviews",
                          json={"ratings": {"safety": stars, "value": stars}, "text": "ทดสอบ"}, headers=ctx["a"])
        assert r.status_code == 200
    d = requests.get(f"{BASE}/dorm/buildings/pg-rama9", headers=ctx["a"]).json()
    mine = [r for r in d["reviews"] if r["is_mine"]]
    assert len(mine) == 1 and mine[0]["ratings"]["safety"] == 4
    assert "user_id" not in mine[0]
    assert d["building"]["review_count"] >= 1


def test_report_and_admin_endpoints(ctx):
    lid = requests.post(f"{BASE}/dorm/listings", json={**LISTING, "title": "ทดสอบ แจ้งรายงาน"}, headers=ctx["a"]).json()["id"]
    assert requests.post(f"{BASE}/dorm/reports", json={"target_type": "listing", "target_id": lid,
                                                       "reason": "สแกม/ขอโอนเงินก่อน"}, headers=ctx["b"]).json()["ok"]
    assert requests.get(f"{BASE}/dorm/admin/overview", headers=ctx["b"]).status_code == 403
    assert requests.get(f"{BASE}/dorm/admin/digest", headers=ctx["b"]).status_code == 403
    admin = _login(*ADMIN)
    ov = requests.get(f"{BASE}/dorm/admin/overview", headers=admin).json()
    assert any(r["target_id"] == lid for r in ov["reports"])
    dg = requests.get(f"{BASE}/dorm/admin/digest", params={"days": 7, "base_url": "https://swumkt.org"}, headers=admin).json()
    assert f"https://swumkt.org/dorm/rooms/{lid}" in dg["text"]
    assert requests.get(f"{BASE}/dorm/admin/digest", params={"base_url": "javascript:alert(1)"},
                        headers=admin).status_code == 422
    for r in ov["reports"]:
        if r["target_id"] == lid:
            requests.post(f"{BASE}/dorm/admin/reports/{r['id']}/resolve", headers=admin)


# ---------------------------------------------------------------- photos + link preview
import base64 as _b64  # noqa: E402

_JPEG_1PX = ("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAx"
             "NDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAI"
             "AQEAAD8AKp//2Q==")


def test_photo_upload_validates_and_serves_with_long_cache(ctx):
    data_url = "data:image/jpeg;base64," + _JPEG_1PX
    assert requests.post(f"{BASE}/dorm/photos", json={"data_url": data_url}).status_code in (401, 403)
    r = requests.post(f"{BASE}/dorm/photos", json={"data_url": data_url}, headers=ctx["a"])
    assert r.status_code == 200, r.text
    url = r.json()["url"]
    assert url.startswith("/api/dorm/photos/")
    g = requests.get(BASE.rsplit("/api", 1)[0] + url)
    assert g.status_code == 200 and g.headers["content-type"] == "image/jpeg"
    assert "immutable" in g.headers["cache-control"]
    assert g.content == _b64.b64decode(_JPEG_1PX)
    # text pretending to be a JPEG is refused
    fake = "data:image/jpeg;base64," + _b64.b64encode(b"<script>alert(1)</script>").decode()
    assert requests.post(f"{BASE}/dorm/photos", json={"data_url": fake}, headers=ctx["a"]).status_code == 422
    assert requests.get(f"{BASE}/dorm/photos/../../etc").status_code == 404
    ctx["photo"] = url


def test_listing_accepts_own_photo_paths_but_not_other_relative_paths(ctx):
    body = {**LISTING, "title": "ทดสอบ รูปในประกาศ", "photo_links": [ctx["photo"], "/api/auth/me", "https://drive.google.com/x"]}
    x = requests.post(f"{BASE}/dorm/listings", json=body, headers=ctx["a"]).json()
    assert x["photo_links"] == [ctx["photo"], "https://drive.google.com/x"]
    ctx["photo_listing"] = x["id"]


def test_og_preview_has_title_price_photo_and_escapes(ctx):
    lid = ctx["photo_listing"]
    h = requests.get(f"{BASE}/dorm/og/rooms/{lid}").text
    assert 'property="og:title" content="ทดสอบ รูปในประกาศ"' in h
    # a transfer is rented as a whole: the whole rent leads, the split is the option
    assert "15,000 บาท/เดือน หารได้ 3 คนละ 5,000" in h and "บาท/คน/เดือน" not in h
    assert f'og:image" content="http' in h and ctx["photo"] in h
    assert f"/dorm/rooms/{lid}" in h and "secret-line-id" not in h
    evil = requests.post(f"{BASE}/dorm/listings", json={**LISTING, "title": '"><script>x()</script>'}, headers=ctx["a"]).json()["id"]
    h2 = requests.get(f"{BASE}/dorm/og/rooms/{evil}").text
    assert "<script>x()" not in h2 and "&lt;script&gt;" in h2
    # unknown id still returns a harmless page, not a 500
    assert requests.get(f"{BASE}/dorm/og/rooms/nope").status_code == 200


# ---------------------------------------------------------------- photos + OpenChat archive
CONTACTISH = ("line", "phone", "contact", "tel", "ig", "facebook", "name", "text", "message", "owner")


def test_owner_deletes_listing_with_its_photos(ctx):
    lid = ctx["photo_listing"]
    origin = BASE.rsplit("/api", 1)[0]
    assert requests.get(origin + ctx["photo"]).status_code == 200
    assert requests.post(f"{BASE}/dorm/listings/{lid}/status", json={"status": "closed"}, headers=ctx["a"]).status_code == 200
    assert requests.delete(f"{BASE}/dorm/listings/{lid}", headers=ctx["b"]).status_code == 403     # not the owner
    assert requests.delete(f"{BASE}/dorm/listings/{lid}", headers=ctx["a"]).status_code == 200
    assert requests.get(f"{BASE}/dorm/listings/{lid}", headers=ctx["a"]).status_code == 404
    assert requests.get(origin + ctx["photo"]).status_code == 404                                  # photo went too
    assert lid not in [x["id"] for x in requests.get(f"{BASE}/dorm/my", headers=ctx["a"]).json()["listings"]]


def test_buildings_carry_photos_thumb_and_chat_summary(ctx):
    items = requests.get(f"{BASE}/dorm/buildings").json()["items"]
    with_photos = [b for b in items if b["photos"]]
    assert len(with_photos) >= 8
    for b in items:
        assert "official_url" in b and "chat" in b and set(b["chat"]) == {"count", "last_date", "per_person"}
        for p in b["photos"]:
            assert p["url"].startswith("https://") and p["credit"] and p["source_url"].startswith("https://")
        if b["thumb"]:
            assert b["thumb"]["url"] in [p["url"] for p in b["photos"]] and (b["thumb"].get("bytes") or 0) <= 700_000
    one = requests.get(f"{BASE}/dorm/buildings/life-asoke").json()["building"]
    assert one["photos"] and one["chat"]["count"] >= 1


def test_chat_posts_shape_filters_and_no_contacts(ctx):
    r = requests.get(f"{BASE}/dorm/chat-posts", params={"limit": 500}).json()
    assert set(r) == {"total", "items", "period"} and r["total"] == len(r["items"]) >= 100
    dates = [x["date"] for x in r["items"]]
    assert dates == sorted(dates, reverse=True)
    for x in r["items"]:
        assert not [k for k in x if k != "building_name" and any(c in k for c in CONTACTISH)], x
    z = requests.get(f"{BASE}/dorm/chat-posts", params={"zone": "asoke", "kind": "transfer,mate_wanted", "max_price": 6000}).json()
    assert z["total"] >= 1
    assert all(x["zone"] == "asoke" and x["kind"] in ("transfer", "mate_wanted") and x["per_person"] <= 6000 for x in z["items"])
    page = requests.get(f"{BASE}/dorm/chat-posts", params={"limit": 5, "skip": 5}).json()
    assert [x["id"] for x in page["items"]] == [x["id"] for x in r["items"][5:10]]
    b = requests.get(f"{BASE}/dorm/chat-posts", params={"building": "life-asoke", "limit": 200}).json()
    assert b["total"] == requests.get(f"{BASE}/dorm/buildings/life-asoke").json()["building"]["chat"]["count"]
    assert requests.get(f"{BASE}/dorm/chat-posts", params={"zone": "nowhere"}).json() == {"total": 0, "items": [], "period": r["period"]}


def test_stats_have_chat_totals_and_zone_prices(ctx):
    s = requests.get(f"{BASE}/dorm/stats").json()
    chat = s["chat"]
    assert chat["posts"] >= 100 and 0 < chat["seeking"] < chat["posts"] and chat["priced"] > 0
    assert chat["period"]["from"] and chat["by_zone"]["asoke"]["per_person"]["n"] >= 3
    # the archive never counts as live listings
    assert s["live"]["listings"] == requests.get(f"{BASE}/dorm/listings", params={"limit": 100}).json()["total"]


# ---------------------------------------------------------------- external rooms + "สนใจ หาเมทห้องนี้"
QUICK = dict(year="other", budget_min=5000, budget_max=7000, zones=["asoke"], move_in="2027-01", has_room=False, consent=True)


@pytest.fixture(scope="module")
def ix():
    """Three fresh students (two women who accept only women, one man open to anyone) and the open external rooms."""
    try:
        requests.get(f"{BASE}/dorm/meta", timeout=5).raise_for_status()
    except Exception:
        pytest.skip(f"backend not reachable at {BASE}")
    rooms = requests.get(f"{BASE}/dorm/listings", params={"external": 1, "limit": 60}).json()["items"]
    if len(rooms) < 12:
        pytest.skip("needs the external listings file imported (>= 12 open rooms)")
    hs = {"w1": _register("วิว ทดสอบ"), "w2": _register("ฟ้า ทดสอบ"), "m": _register("บอส ทดสอบ")}
    yield {**hs, "rooms": rooms, "own": []}
    for h in hs.values():
        requests.delete(f"{BASE}/dorm/mates/me", headers=h)      # also removes their interests
        for x in requests.get(f"{BASE}/dorm/my", headers=h).json().get("listings", []):
            requests.delete(f"{BASE}/dorm/listings/{x['id']}", headers=h)


def _summary(lid, h=None):
    return requests.get(f"{BASE}/dorm/listings/{lid}", headers=h or {}).json()["listing"]


def test_external_rooms_flow_through_list_detail_ids_and_og(ix):
    x = ix["rooms"][0]
    assert x["external"] and x["source"] and x["source_url"].startswith("https://") and x["kind"] == "room"
    assert x["price_per_person"] == round(x["price_total"] / x["people_total"])
    for k in ("contact_line", "contact_phone", "owner_id", "description"):
        assert not x.get(k)
    d = requests.get(f"{BASE}/dorm/listings/{x['id']}").json()["listing"]
    assert d["is_mine"] is False and d["source_seen_at"] and "interest_count" in d
    assert requests.get(f"{BASE}/dorm/listings", params={"ids": x["id"]}).json()["total"] == 1
    lst = requests.get(f"{BASE}/dorm/listings").json()
    assert lst["external_total"] >= 12 and lst["total"] >= lst["external_total"]
    og = requests.get(f"{BASE}/dorm/og/rooms/{x['id']}").text
    assert f"{x['price_total']:,}" in og and x["source"] in og
    assert ("บาท/คน/เดือน" in og) == (not x["whole_first"])        # per person leads unless it is a room for one


def test_contact_reveal_refuses_external_and_owner_endpoints_never_apply(ix):
    lid = ix["rooms"][0]["id"]
    r = requests.get(f"{BASE}/dorm/listings/{lid}/contact", headers=ix["w1"])
    assert r.status_code == 409 and "ต้นทาง" in r.json()["detail"]
    assert requests.post(f"{BASE}/dorm/listings/{lid}/renew", headers=ix["w1"]).status_code == 403
    assert requests.post(f"{BASE}/dorm/listings/{lid}/status", json={"status": "closed"}, headers=ix["w1"]).status_code == 403
    assert requests.delete(f"{BASE}/dorm/listings/{lid}", headers=ix["w1"]).status_code == 403
    assert _summary(lid)["status"] == "active"


def test_interest_needs_login_and_a_profile(ix):
    lid = ix["rooms"][1]["id"]
    assert requests.post(f"{BASE}/dorm/listings/{lid}/interest", json={"party_size": 1}).status_code in (401, 403)
    assert requests.post(f"{BASE}/dorm/listings/{lid}/interest", json={"party_size": 1}, headers=ix["w1"]).status_code == 428
    assert requests.post(f"{BASE}/dorm/listings/{lid}/interest", json={"party_size": 4}, headers=ix["w1"]).status_code == 422
    # the short profile from the sheet goes through the normal mate save, then the interest works
    for key, name, g, pref, line in (("w1", "วิว", "female", "female", "view-line"), ("w2", "ฟ้า", "female", "female", "fah-line"),
                                     ("m", "บอส", "male", "any", "boss-line")):
        r = requests.put(f"{BASE}/dorm/mates/me", json={**QUICK, "display_name": name, "gender": g, "mate_gender_pref": pref,
                                                         "contact_line": line}, headers=ix[key])
        assert r.status_code == 200, r.text


def test_interest_is_unique_counts_party_size_and_shows_on_cards(ix):
    room = ix["rooms"][1]
    lid = room["id"]
    before = _summary(lid)["interest_people"]
    r = requests.post(f"{BASE}/dorm/listings/{lid}/interest", json={"party_size": 1}, headers=ix["w1"])
    assert r.status_code == 200 and r.json()["my_interest"] == {"party_size": 1}
    # pressing again updates, never duplicates
    r = requests.post(f"{BASE}/dorm/listings/{lid}/interest", json={"party_size": 2}, headers=ix["w1"]).json()
    assert r["interest_people"] == before + 2 and r["my_interest"] == {"party_size": 2}
    requests.post(f"{BASE}/dorm/listings/{lid}/interest", json={"party_size": 1}, headers=ix["w2"])
    card = next(x for x in requests.get(f"{BASE}/dorm/listings", params={"interested": 1, "limit": 100}).json()["items"] if x["id"] == lid)
    assert card["interest_count"] >= 2 and card["interest_people"] == before + 3 and card["my_interest"] is None
    assert card["spots_left"] == max(0, card["spots_total"] - card["interest_people"])
    # public cards carry initials only, never the names
    assert all(set(a) == {"initials", "tone"} for a in card["interest_avatars"]) and card["interest_match"] is None
    assert "วิว" not in str(card) and "ฟ้า" not in str(card)
    srt = requests.get(f"{BASE}/dorm/listings", params={"sort": "interest", "limit": 5}).json()["items"]
    assert srt[0]["interest_people"] >= card["interest_people"]
    # my view of the list marks my own interest; /my lists the room
    mine = requests.get(f"{BASE}/dorm/listings", params={"ids": lid}, headers=ix["w1"]).json()["items"][0]
    assert mine["my_interest"] == {"party_size": 2}
    assert lid in [x["id"] for x in requests.get(f"{BASE}/dorm/my", headers=ix["w1"]).json()["interests"]]
    # the mates list carries the room on her card for a viewer she passes the gate with (ฟ้า), never for a guest
    view = next(m for m in requests.get(f"{BASE}/dorm/mates", params={"sort": "new"}, headers=ix["w2"]).json()["items"] if m["display_name"] == "วิว")
    assert lid in [r["id"] for r in view["interested_rooms"]]
    guest = next(m for m in requests.get(f"{BASE}/dorm/mates", params={"sort": "new"}).json()["items"] if m["display_name"] == "วิว")
    assert guest["interested_rooms"] == [] and guest["interested_rooms_total"] == 0
    # with a profile the card also says how many of the interested people match the viewer
    assert requests.get(f"{BASE}/dorm/listings", params={"ids": lid}, headers=ix["w2"]).json()["items"][0]["interest_match"] >= 1


def test_interested_people_gate_counts_and_no_contacts(ix):
    lid = ix["rooms"][1]["id"]
    requests.post(f"{BASE}/dorm/listings/{lid}/interest", json={"party_size": 1}, headers=ix["m"])
    guest = requests.get(f"{BASE}/dorm/listings/{lid}/interested")
    body = guest.text
    for secret in ("view-line", "fah-line", "boss-line", "user_id", "contact_line", "contact_ig", "\"consent\"",
                   "วิว", "ฟ้า", "บอส", "display_name"):
        assert secret not in body
    g = guest.json()
    # a guest gets the neutral total and initials, no cards
    assert g["access"] == "guest" and g["items"] == [] and g["me"] is False and g["interest_people"] >= 3
    assert g["interest_match"] is None and all(set(a) == {"initials", "tone"} for a in g["interest_avatars"])
    # วิว accepts only women: บอส is hidden from her and counted; ฟ้า gets a score; she sees herself
    w = requests.get(f"{BASE}/dorm/listings/{lid}/interested", headers=ix["w1"]).json()
    wn = {m["display_name"]: m for m in w["items"]}
    assert w["access"] == "profile"
    assert "บอส" not in wn and w["hidden_by_gender"]["total"] >= 1 and w["hidden_by_gender"]["mine"] >= 1
    assert wn["วิว"]["is_me"] and wn["ฟ้า"]["match"]["score"] > 0
    assert w["interest_count"] == g["interest_count"]          # everyone still counts in the neutral total
    # the list shows exactly the people who match her (plus her own card)
    assert w["interest_match"] == len([m for m in w["items"] if not m["is_me"]])
    # บอส is open to anyone, but the women's preference hides them from him: nobody matches him
    b = requests.get(f"{BASE}/dorm/listings/{lid}/interested", headers=ix["m"]).json()
    assert "วิว" not in [m["display_name"] for m in b["items"]] and b["hidden_by_gender"]["theirs"] >= 2
    assert b["interest_match"] == len([m for m in b["items"] if not m["is_me"]]) and "ฟ้า" not in str(b["items"])
    # the contact still comes only from the mate contact endpoint (needs a login)
    fah = wn["ฟ้า"]["id"]
    assert requests.get(f"{BASE}/dorm/mates/{fah}/contact").status_code in (401, 403)
    assert requests.get(f"{BASE}/dorm/mates/{fah}/contact", headers=ix["w1"]).json()["contact_line"] == "fah-line"


def test_withdraw_and_closed_profile_stop_counting(ix):
    lid = ix["rooms"][1]["id"]
    n = _summary(lid)["interest_people"]
    r = requests.delete(f"{BASE}/dorm/listings/{lid}/interest", headers=ix["m"]).json()
    assert r["interest_people"] == n - 1
    requests.post(f"{BASE}/dorm/mates/me/close", headers=ix["w2"])
    assert _summary(lid)["interest_people"] == n - 2
    requests.post(f"{BASE}/dorm/mates/me/renew", headers=ix["w2"])
    assert _summary(lid)["interest_people"] == n - 1


def test_max_ten_active_interests(ix):
    h = ix["m"]
    have = len(requests.get(f"{BASE}/dorm/my", headers=h).json()["interests"])
    free = [x["id"] for x in ix["rooms"][2:]]
    for lid in free[:10 - have]:
        assert requests.post(f"{BASE}/dorm/listings/{lid}/interest", json={"party_size": 1}, headers=h).status_code == 200
    r = requests.post(f"{BASE}/dorm/listings/{free[10 - have]}/interest", json={"party_size": 1}, headers=h)
    assert r.status_code == 429
    # changing the party size of one already held is not a new interest
    assert requests.post(f"{BASE}/dorm/listings/{free[0]}/interest", json={"party_size": 2}, headers=h).status_code == 200


def test_own_listing_and_closed_listing_cleanup(ix):
    x = requests.post(f"{BASE}/dorm/listings", json={**LISTING, "kind": "mate_wanted", "gender_pref": "any"}, headers=ix["w2"]).json()
    lid = x["id"]
    assert requests.post(f"{BASE}/dorm/listings/{lid}/interest", json={"party_size": 1}, headers=ix["w2"]).status_code == 409
    r = requests.post(f"{BASE}/dorm/listings/{lid}/interest", json={"party_size": 1}, headers=ix["w1"]).json()
    assert r["spots_taken"] == 2 and r["spots_left"] == 1          # the poster lives there already
    # the owner sees who is interested; nobody else's contact leaks
    o = requests.get(f"{BASE}/dorm/listings/{lid}/interested", headers=ix["w2"]).json()
    assert o["is_owner"] and o["access"] == "owner" and "วิว" in [m["display_name"] for m in o["items"]]
    # ...and learns about it without opening the room (the nav dot reads this)
    assert requests.get(f"{BASE}/dorm/my/listing-interest", headers=ix["w2"]).json()["listings"].get(lid) == 1
    assert requests.get(f"{BASE}/dorm/my/listing-interest").status_code in (401, 403)
    # closing hides the room's interests from /my; deleting removes them
    requests.post(f"{BASE}/dorm/listings/{lid}/status", json={"status": "closed"}, headers=ix["w2"])
    assert lid not in [y["id"] for y in requests.get(f"{BASE}/dorm/my", headers=ix["w1"]).json()["interests"]]
    assert requests.post(f"{BASE}/dorm/listings/{lid}/interest", json={"party_size": 1}, headers=ix["m"]).status_code == 404
    requests.delete(f"{BASE}/dorm/listings/{lid}", headers=ix["w2"])
    assert requests.get(f"{BASE}/dorm/listings/{lid}/interested").status_code == 404


def test_profileless_user_gets_no_names_from_any_endpoint(ix):
    """A signed-in user without a mate profile sees totals and initials only, like a guest."""
    lid = ix["rooms"][1]["id"]
    h = _register("ไม่มีโปรไฟล์ ทดสอบ")
    names = ("วิว", "ฟ้า", "บอส")
    for who in ({}, h):
        bodies = [
            requests.get(f"{BASE}/dorm/listings/{lid}/interested", headers=who).text,
            requests.get(f"{BASE}/dorm/listings/{lid}", headers=who).text,
            requests.get(f"{BASE}/dorm/listings", params={"interested": 1, "limit": 100}, headers=who).text,
            requests.get(f"{BASE}/dorm/listings", params={"sort": "recommended", "limit": 300}, headers=who).text,
        ]
        for body in bodies:
            assert "display_name" not in body and not any(f'"{n}"' in body for n in names)
        d = requests.get(f"{BASE}/dorm/listings/{lid}/interested", headers=who).json()
        assert d["items"] == [] and d["access"] == ("no_profile" if who else "guest")
        # the mates board shows profiles, but never which room each person pressed interest on
        mates = requests.get(f"{BASE}/dorm/mates", params={"sort": "new"}, headers=who).json()["items"]
        assert all(m["interested_rooms"] == [] for m in mates)
    assert requests.get(f"{BASE}/dorm/my", headers=h).json()["interests"] == []


def test_gender_only_listing_refuses_interest_with_the_reason(ix):
    x = requests.post(f"{BASE}/dorm/listings", json={**LISTING, "kind": "mate_wanted", "gender_pref": "male",
                                                      "title": "ทดสอบ หาเมทชาย"}, headers=ix["w2"]).json()
    lid = x["id"]
    man = _register("ชาย ทดสอบ")
    requests.put(f"{BASE}/dorm/mates/me", json={**QUICK, "display_name": "ชาย", "gender": "male", "mate_gender_pref": "any",
                                                 "contact_line": "man-line"}, headers=man)
    try:
        r = requests.post(f"{BASE}/dorm/listings/{lid}/interest", json={"party_size": 1}, headers=ix["w1"])
        assert r.status_code == 403 and r.json()["detail"] == "ประกาศนี้รับเฉพาะเมทชาย"
        assert _summary(lid, ix["w1"])["interest_blocked"] == "ประกาศนี้รับเฉพาะเมทชาย"
        assert _summary(lid, man)["interest_blocked"] is None and _summary(lid)["interest_blocked"] is None
        assert requests.post(f"{BASE}/dorm/listings/{lid}/interest", json={"party_size": 1}, headers=man).status_code == 200
        assert requests.get(f"{BASE}/dorm/my/listing-interest", headers=ix["w2"]).json()["listings"].get(lid) == 1
    finally:
        requests.delete(f"{BASE}/dorm/mates/me", headers=man)
        requests.delete(f"{BASE}/dorm/listings/{lid}", headers=ix["w2"])


def test_recommended_sort_puts_native_first_and_mixes_external_grades(ix):
    own = requests.post(f"{BASE}/dorm/listings", json={**LISTING, "kind": "room", "people_total": 1, "gender_pref": "any",
                                                        "price_total": 30000, "title": "ทดสอบ ห้องแพง"}, headers=ix["w1"]).json()
    try:
        assert own["price_per_person"] == 30000                       # one occupant: no invented split
        items = requests.get(f"{BASE}/dorm/listings", params={"sort": "recommended", "limit": 300}).json()["items"]
        rest = [x for x in items if not x.get("featured")]
        assert rest[0]["id"] == own["id"] and rest[0]["whole_first"] is True
        ext_rows = [x for x in rest if x.get("external")]
        assert all(not x.get("external") for x in rest[:len(rest) - len(ext_rows)])
        # Top 8 external rooms should span multiple price grades and distinct buildings
        top8 = ext_rows[:8]
        tiers = {
            0 if x["price_per_person"] < 4000 else 1 if x["price_per_person"] < 6500 else 2 if x["price_per_person"] < 9000 else 3
            for x in top8 if x.get("price_per_person") is not None
        }
        assert len(tiers) >= 3
        assert len({x.get("building_slug") for x in top8 if x.get("building_slug")}) >= 6
        # sort=price remains strictly ascending by price_per_person
        by_price = [x["price_per_person"] for x in requests.get(f"{BASE}/dorm/listings", params={"sort": "price", "limit": 300}).json()["items"] if x.get("external") and not x.get("featured")]
        assert by_price == sorted(by_price)
        page = requests.get(f"{BASE}/dorm/listings", params={"sort": "recommended", "limit": 10, "skip": 10}).json()["items"]
        assert [x["id"] for x in page] == [x["id"] for x in items[10:20]]
    finally:
        requests.delete(f"{BASE}/dorm/listings/{own['id']}", headers=ix["w1"])


def test_deleting_a_profile_removes_its_interests(ix):
    h = _register("ชั่วคราว ทดสอบ")
    try:
        requests.put(f"{BASE}/dorm/mates/me", json={**QUICK, "display_name": "ชั่วคราว", "gender": "female", "mate_gender_pref": "any",
                                                     "contact_line": "tmp-line"}, headers=h)
        lid = ix["rooms"][1]["id"]
        n = _summary(lid)["interest_count"]
        requests.post(f"{BASE}/dorm/listings/{lid}/interest", json={"party_size": 1}, headers=h)
        assert _summary(lid)["interest_count"] == n + 1
        requests.delete(f"{BASE}/dorm/mates/me", headers=h)
        assert _summary(lid)["interest_count"] == n
        # a new profile does not bring the old interest back
        requests.put(f"{BASE}/dorm/mates/me", json={**QUICK, "display_name": "ชั่วคราว", "gender": "female", "mate_gender_pref": "any",
                                                     "contact_line": "tmp-line"}, headers=h)
        assert requests.get(f"{BASE}/dorm/my", headers=h).json()["interests"] == []
    finally:
        requests.delete(f"{BASE}/dorm/mates/me", headers=h)


def test_admin_close_survives_reimport_then_reopens(ix):
    admin = _login(*ADMIN)
    lid = ix["rooms"][-1]["id"]
    try:
        assert requests.post(f"{BASE}/dorm/listings/{lid}/status", json={"status": "closed"}, headers=admin).status_code == 200
        r = requests.post(f"{BASE}/dorm/admin/import-external", headers=admin).json()
        assert r["ok"] and r["skipped"] >= 1
        assert requests.get(f"{BASE}/dorm/listings/{lid}").status_code == 410          # not resurrected
        assert requests.post(f"{BASE}/dorm/listings/{lid}/renew", headers=admin).status_code == 409
        again = requests.post(f"{BASE}/dorm/admin/import-external", headers=admin).json()
        assert again["upserted"] == r["upserted"] and again["closed"] == 0               # idempotent
    finally:
        requests.post(f"{BASE}/dorm/listings/{lid}/status", json={"status": "active"}, headers=admin)
    assert requests.get(f"{BASE}/dorm/listings/{lid}").status_code == 200
    assert requests.post(f"{BASE}/dorm/admin/import-external", headers=ix["w1"]).status_code == 403


# ---------------------------------------------------------------- round B: paging, validation, moderation, OG
from datetime import datetime as _dt, timedelta as _td, timezone as _tz  # noqa: E402

SORTS = ("new", "recommended", "price", "interest", "move_in")


def _bkk_day(offset=0):
    return (_dt.now(_tz(_td(hours=7))) + _td(days=offset)).strftime("%Y-%m-%d")


def test_every_sort_pages_through_all_rooms_exactly_once():
    total = requests.get(f"{BASE}/dorm/listings", params={"limit": 1}).json()["total"]
    assert total >= 1
    for s in SORTS:
        seen = []
        for skip in range(0, total, 10):
            r = requests.get(f"{BASE}/dorm/listings", params={"sort": s, "limit": 10, "skip": skip})
            assert r.status_code == 200, r.text
            seen += [x["id"] for x in r.json()["items"]]
        assert len(seen) == total and len(set(seen)) == total, s


def test_list_bounds_and_zero_prices():
    for p in ({"limit": 0}, {"limit": -1}, {"skip": -1}, {"limit": 1001}):
        assert requests.get(f"{BASE}/dorm/listings", params=p).status_code == 422, p
    for p in ({"limit": 0}, {"skip": -5}):
        assert requests.get(f"{BASE}/dorm/mates", params=p).status_code == 422, p
    assert requests.get(f"{BASE}/dorm/listings", params={"max_price": 0}).json()["total"] == 0
    everything = requests.get(f"{BASE}/dorm/listings").json()["total"]
    assert requests.get(f"{BASE}/dorm/listings", params={"min_price": 0}).json()["total"] == everything


def test_price_per_person_is_derived_by_the_server(ctx):
    body = {**LISTING, "title": "ทดสอบ ราคาต่อคน"}
    x = requests.post(f"{BASE}/dorm/listings", json={**body, "price_per_person": 1}, headers=ctx["a"]).json()
    try:
        assert x["price_per_person"] == 5000                                   # 15,000 / 3, not the 1 sent
        y = requests.put(f"{BASE}/dorm/listings/{x['id']}", json={**body, "people_total": 2, "price_per_person": 99},
                         headers=ctx["a"]).json()
        assert y["price_per_person"] == 7500
        one = requests.put(f"{BASE}/dorm/listings/{x['id']}", json={**body, "people_total": 1}, headers=ctx["a"]).json()
        assert one["price_per_person"] == 15000                               # one occupant pays it all
    finally:
        requests.delete(f"{BASE}/dorm/listings/{x['id']}", headers=ctx["a"])


def test_move_in_must_be_real_and_not_in_the_past_on_create(ctx):
    body = {**LISTING, "title": "ทดสอบ วันที่"}

    def post(**kw):
        return requests.post(f"{BASE}/dorm/listings", json={**body, **kw}, headers=ctx["a"])
    assert post(move_in="2027-02-30").status_code == 422
    assert post(move_in=_bkk_day(-1)).status_code == 422
    assert post(kind="short_term", min_months=7).status_code == 422
    r = post(move_in=_bkk_day(0))
    assert r.status_code == 200, r.text
    lid = r.json()["id"]
    try:
        # editing an older listing keeps a past date allowed (only new listings must start today or later)
        assert requests.put(f"{BASE}/dorm/listings/{lid}", json={**body, "move_in": _bkk_day(-3)},
                            headers=ctx["a"]).status_code == 200
    finally:
        requests.delete(f"{BASE}/dorm/listings/{lid}", headers=ctx["a"])


def test_admin_close_blocks_owner_reopen_and_reopen_respects_the_cap():
    admin = _login(*ADMIN)
    h = _register("เพดาน ทดสอบ")
    ids = []

    def st(lid, s, who):
        return requests.post(f"{BASE}/dorm/listings/{lid}/status", json={"status": s}, headers=who)

    def mine():
        return {x["id"]: x for x in requests.get(f"{BASE}/dorm/my", headers=h).json()["listings"]}
    try:
        for i in range(5):
            r = requests.post(f"{BASE}/dorm/listings", json={**LISTING, "title": f"ทดสอบ เพดาน {i}"}, headers=h)
            assert r.status_code == 200, r.text
            ids.append(r.json()["id"])
        assert requests.post(f"{BASE}/dorm/listings", json={**LISTING, "title": "ทดสอบ เกิน"}, headers=h).status_code == 429
        # owner closes one, posts another (5 open again): reopening the closed one would make 6
        assert st(ids[0], "closed", h).status_code == 200
        r = requests.post(f"{BASE}/dorm/listings", json={**LISTING, "title": "ทดสอบ แทนที่"}, headers=h)
        assert r.status_code == 200
        ids.append(r.json()["id"])
        assert st(ids[0], "active", h).status_code == 429
        # an admin closes another one: its owner cannot reopen it, with a clear reason; the admin can
        assert st(ids[1], "closed", admin).status_code == 200
        assert mine()[ids[1]]["closed_by"] == "admin" and mine()[ids[0]]["closed_by"] == "owner"
        r = st(ids[1], "active", h)
        assert r.status_code == 403 and "แอดมิน" in r.json()["detail"]
        assert requests.post(f"{BASE}/dorm/listings/{ids[1]}/renew", headers=h).status_code == 409
        assert st(ids[1], "active", admin).status_code == 200
        assert mine()[ids[1]]["closed_by"] is None and mine()[ids[1]]["status"] == "active"
        # with room under the cap the owner's own close can be undone
        assert st(ids[2], "closed", h).status_code == 200 and st(ids[0], "active", h).status_code == 200
    finally:
        for lid in ids:
            requests.delete(f"{BASE}/dorm/listings/{lid}", headers=h)


def test_og_page_for_a_closed_listing_is_neutral_and_ignores_forwarded_host(ctx):
    x = requests.post(f"{BASE}/dorm/listings", json={**LISTING, "title": "ทดสอบ แชร์แล้วปิด"}, headers=ctx["a"]).json()
    try:
        h = requests.get(f"{BASE}/dorm/og/rooms/{x['id']}", headers={"X-Forwarded-Host": "evil.example"}).text
        assert "ทดสอบ แชร์แล้วปิด" in h and "evil.example" not in h
        requests.post(f"{BASE}/dorm/listings/{x['id']}/status", json={"status": "closed"}, headers=ctx["a"])
        h = requests.get(f"{BASE}/dorm/og/rooms/{x['id']}").text
        assert "ประกาศนี้ปิดแล้ว" in h and "ทดสอบ แชร์แล้วปิด" not in h and "15,000" not in h
    finally:
        requests.delete(f"{BASE}/dorm/listings/{x['id']}", headers=ctx["a"])


def test_bad_inputs_get_short_4xx_answers(ctx):
    for bad in ("abc", [1]):
        r = requests.post(f"{BASE}/dorm/buildings/pg-rama9/reviews", json={"ratings": {"safety": bad}}, headers=ctx["a"])
        assert r.status_code == 422, bad
    junk = "data:image/jpeg;base64," + _b64.b64encode(bytes([0xFF, 0xD8, 0xFF]) + b"x" * 500).decode()
    assert requests.post(f"{BASE}/dorm/photos", json={"data_url": junk}, headers=ctx["a"]).status_code == 422
    big = "data:image/jpeg;base64," + "A" * 2_200_000
    r = requests.post(f"{BASE}/dorm/photos", json={"data_url": big}, headers=ctx["a"])
    assert r.status_code == 413 and len(r.content) < 300
    admin = _login(*ADMIN)
    assert requests.post(f"{BASE}/dorm/admin/reports/nope-{uuid.uuid4().hex[:6]}/resolve", headers=admin).status_code == 404


def test_report_reasons_follow_the_target_and_admin_sees_what_was_reported(ctx):
    meta = requests.get(f"{BASE}/dorm/meta").json()
    assert "ห้องเต็มแล้วแต่ไม่ปิดประกาศ" not in meta["report_reasons_by_type"]["mate"]
    me = requests.put(f"{BASE}/dorm/mates/me", json=MATE, headers=ctx["a"]).json()["profile"]

    def rep(**kw):
        return requests.post(f"{BASE}/dorm/reports", json={"target_type": "mate", "target_id": me["id"], **kw}, headers=ctx["b"])
    assert rep(reason="ห้องเต็มแล้วแต่ไม่ปิดประกาศ").status_code == 422
    assert rep(reason=meta["ext_gone_reason"]).status_code == 422          # the one-tap "gone" reason is for rooms only
    assert rep(reason="อื่นๆ", note="ก" * 201).status_code == 422
    assert rep(reason="อื่นๆ", note="ทดสอบ หมายเหตุ").status_code == 200
    admin = _login(*ADMIN)
    ov = requests.get(f"{BASE}/dorm/admin/overview", headers=admin).json()
    r = next(r for r in ov["reports"] if r["target_id"] == me["id"])
    assert r["target_title"] == "มิ้น" and r["target_link"] and r["note"] == "ทดสอบ หมายเหตุ" and "user_id" not in r
    assert all("contact_line" not in x and "contact_phone" not in x for x in ov["listings"])
    assert requests.post(f"{BASE}/dorm/admin/reports/{r['id']}/resolve", headers=admin).status_code == 200


def test_mate_demand_by_zone_matches_the_zone_filter():
    s = requests.get(f"{BASE}/dorm/stats").json()["live"]["mate_demand_by_zone"]
    for z in [z["id"] for z in requests.get(f"{BASE}/dorm/meta").json()["zones"]]:
        assert s.get(z, 0) == requests.get(f"{BASE}/dorm/mates", params={"zone": z, "sort": "new"}).json()["total"], z


def test_swu_verification_personal_email_and_admin_approve(ctx):
    # Non-SWU email rejected on OTP request
    assert requests.post(f"{BASE}/dorm/verify/swu-email/request", json={"swu_email": "me@gmail.com"}, headers=ctx["b"]).status_code == 422
    # Freshman/alumni manual request works with a personal account
    r = requests.post(f"{BASE}/dorm/verify/request", json={
        "kind": "freshman", "faculty": "คณะบริหารธุรกิจเพื่อสังคม", "entry_year": 2569, "note": "รอบ TCAS 1"
    }, headers=ctx["b"])
    assert r.status_code == 200 and r.json()["verification"]["status"] == "pending"
    admin = _login(*ADMIN)
    ov = requests.get(f"{BASE}/dorm/admin/overview", headers=admin).json()
    uid = requests.get(f"{BASE}/auth/me", headers=ctx["b"]).json()["id"]
    assert any(v["user_id"] == uid and v["kind"] == "freshman" for v in ov.get("verifications", []))
    # Create a listing before approval, then approve and verify backfill
    l = requests.post(f"{BASE}/dorm/listings", json=LISTING, headers=ctx["b"]).json()
    assert l["poster_swu_verified"] is False
    assert requests.post(f"{BASE}/dorm/admin/verifications/{uid}", json={"action": "approve"}, headers=admin).status_code == 200
    my = requests.get(f"{BASE}/dorm/my", headers=ctx["b"]).json()
    assert my["verification"]["verified"] is True and my["verification"]["status_label"] == "ว่าที่นิสิต มศว"
    assert requests.get(f"{BASE}/dorm/listings/{l['id']}").json()["listing"]["poster_swu_verified"] is True
    requests.delete(f"{BASE}/dorm/listings/{l['id']}", headers=ctx["b"])


def test_in_app_chat_threads_messages_unread_and_privacy(ctx):
    l = requests.post(f"{BASE}/dorm/listings", json=LISTING, headers=ctx["a"]).json()
    lid = l["id"]
    # Owner cannot chat with themselves
    assert requests.post(f"{BASE}/dorm/threads", json={"target_type": "listing", "target_id": lid}, headers=ctx["a"]).status_code == 400
    # Seeker starts thread with icebreaker
    r = requests.post(f"{BASE}/dorm/threads", json={"target_type": "listing", "target_id": lid, "message": "ห้องยังว่างไหมครับ"}, headers=ctx["b"])
    assert r.status_code == 200
    tid = r.json()["thread"]["id"]
    assert len(r.json()["messages"]) == 1 and r.json()["messages"][0]["is_mine"] is True
    # Owner sees 1 unread thread
    assert requests.get(f"{BASE}/dorm/threads/unread", headers=ctx["a"]).json()["count"] >= 1
    # Owner opens messages -> marks read and sees seeker's message
    msgs = requests.get(f"{BASE}/dorm/threads/{tid}/messages", headers=ctx["a"]).json()
    assert len(msgs["messages"]) == 1 and msgs["messages"][0]["is_mine"] is False
    assert requests.get(f"{BASE}/dorm/threads/unread", headers=ctx["a"]).json()["count"] == 0
    # Owner sends explicit LINE card in chat
    s = requests.post(f"{BASE}/dorm/threads/{tid}/messages", json={"body": "owner-line-99", "kind": "line_card"}, headers=ctx["a"])
    assert s.status_code == 200 and s.json()["message"]["kind"] == "line_card"
    # Third-party user cannot read or post in this thread
    c = _register("คนนอก ทดสอบ")
    assert requests.get(f"{BASE}/dorm/threads/{tid}/messages", headers=c).status_code == 403
    assert requests.post(f"{BASE}/dorm/threads/{tid}/messages", json={"body": "แอบเข้า"}, headers=c).status_code == 403
    requests.delete(f"{BASE}/dorm/listings/{lid}", headers=ctx["a"])


def test_qr_visit_tracking_and_admin_stats():
    r = requests.post(f"{BASE}/dorm/visit", json={"src": "test-poster-14", "path": "/dorm"})
    assert r.status_code == 200 and r.json()["ok"] is True
    r2 = requests.post(f"{BASE}/dorm/visit", json={"src": "bad src!!", "path": "/dorm"})
    assert r2.status_code == 422

    admin = _login(*ADMIN)
    ov = requests.get(f"{BASE}/dorm/admin/overview", headers=admin).json()
    assert ov["qr_total_30d"] >= 1
    row = next((x for x in ov["qr_scans_30d"] if x["src"] == "test-poster-14"), None)
    assert row is not None and row["count"] >= 1


def test_room_context_mate_chat(ctx):
    # Messaging an interested mate from a specific room preserves room context in the chat header.
    r = requests.get(f"{BASE}/dorm/listings", params={"limit": 1}).json()
    ext_id = r["items"][0]["id"]
    m_me = requests.get(f"{BASE}/dorm/mates/me", headers=ctx["a"]).json().get("profile")
    if not m_me:
        requests.put(f"{BASE}/dorm/mates/me", headers=ctx["a"], json={
            "display_name": "เอ็ม", "gender": "female", "mate_gender_pref": "any",
            "year": "2", "faculty": "บริหาร", "budget_min": 4000, "budget_max": 7000,
            "zones": ["asoke"], "move_in": "2026-12", "has_room": False, "tags": [], "about": "",
            "contact_line": "em_line", "consent": True,
        })
        m_me = requests.get(f"{BASE}/dorm/mates/me", headers=ctx["a"]).json()["profile"]
    t = requests.post(f"{BASE}/dorm/threads", headers=ctx["b"], json={
        "target_type": "mate", "target_id": m_me["id"], "room_id": ext_id,
        "message": "สนใจหารห้องนี้ด้วยกันไหมครับ",
    })
    assert t.status_code == 200, t.text
    th = t.json()["thread"]
    assert th["context_title"].startswith("หารห้อง: ")
    assert th["context_link"] == f"/dorm/rooms/{ext_id}"


def test_listings_waiting_total_and_building_floats_interested_rooms(ctx):
    b_res = requests.get(f"{BASE}/dorm/buildings/supalai-premier-asoke").json()
    rows = b_res["listings"]
    if len(rows) < 2:
        pytest.skip("need >= 2 listings in supalai-premier-asoke")
    target_id = rows[-1]["id"]
    if not requests.get(f"{BASE}/dorm/mates/me", headers=ctx["a"]).json().get("profile"):
        requests.put(f"{BASE}/dorm/mates/me", headers=ctx["a"], json=MATE)
    ri = requests.post(f"{BASE}/dorm/listings/{target_id}/interest", json={"party_size": 1}, headers=ctx["a"])
    assert ri.status_code == 200, ri.text
    try:
        lst = requests.get(f"{BASE}/dorm/listings", params={"limit": 10, "sort": "recommended"}).json()
        assert lst["waiting_total"] >= 1
        b_after = requests.get(f"{BASE}/dorm/buildings/supalai-premier-asoke").json()["listings"]
        top_ids = [x["id"] for x in b_after if (x.get("interest_people") or 0) > 0]
        assert target_id in top_ids
        assert all((x.get("interest_people") or 0) > 0 for x in b_after[:len(top_ids)])
    finally:
        requests.delete(f"{BASE}/dorm/listings/{target_id}/interest", headers=ctx["a"])


def test_light_peek_interest_without_login_and_engaged_filter():
    rows = requests.get(f"{BASE}/dorm/listings", params={"limit": 1}).json()["items"]
    assert rows
    lid = rows[0]["id"]
    anon = "test_anon_123456"
    r1 = requests.post(f"{BASE}/dorm/listings/{lid}/peek", json={"anon_id": anon, "active": True})
    assert r1.status_code == 200 and r1.json()["peek_count"] >= 1
    try:
        eng = requests.get(f"{BASE}/dorm/listings", params={"engaged": 1, "limit": 50}).json()
        assert eng["peeked_total"] >= 1
        found = next((x for x in eng["items"] if x["id"] == lid), None)
        assert found is not None and found["peek_count"] >= 1
    finally:
        r2 = requests.post(f"{BASE}/dorm/listings/{lid}/peek", json={"anon_id": anon, "active": False})
        assert r2.status_code == 200 and r2.json()["peek_count"] == 0


def test_external_crowd_gone_two_reports_soft_410_and_include_closed(ix):
    admin = _login(*ADMIN)
    room = ix["rooms"][-2]
    lid = room["id"]
    anon1, anon2 = "anon_gone_test_001", "anon_gone_test_002"
    try:
        # 1st guest report -> maybe_gone warning, stays open
        r1 = requests.post(f"{BASE}/dorm/listings/{lid}/gone", json={"anon_id": anon1})
        assert r1.status_code == 200 and r1.json()["maybe_gone"] is True and r1.json()["auto_closed"] is False
        d1 = requests.get(f"{BASE}/dorm/listings/{lid}").json()["listing"]
        assert d1["maybe_gone"] is True and d1["gone_reports"] >= 1
        # Same anon again is a duplicate, does not double-count
        r_dup = requests.post(f"{BASE}/dorm/listings/{lid}/gone", json={"anon_id": anon1})
        assert r_dup.status_code == 200 and r_dup.json().get("duplicate") is True
        # 2nd distinct guest report -> auto-closes external room
        r2 = requests.post(f"{BASE}/dorm/listings/{lid}/gone", json={"anon_id": anon2})
        assert r2.status_code == 200 and r2.json()["auto_closed"] is True and r2.json()["status"] == "closed"
        # Default list hides it; include_closed=1 surfaces it with gone_label; soft 410 gives alternatives
        # page through the whole list so the check holds however many rooms the seed data has
        def _all_items(**params):
            items, skip, first = [], 0, None
            while True:
                page = requests.get(f"{BASE}/dorm/listings", params={**params, "limit": 300, "skip": skip}).json()
                first = first or page
                items += page["items"]
                if len(page["items"]) < 300:
                    return first, items
                skip += 300
        _, open_items = _all_items()
        assert lid not in [x["id"] for x in open_items]
        arch, arch_items = _all_items(include_closed=1)
        assert arch["archived_total"] >= 1 and arch["closed_total"] >= 1
        closed_card = next(x for x in arch_items if x["id"] == lid)
        assert closed_card["is_gone"] is True and "อ้างอิงราคา" in closed_card["gone_label"]
        soft = requests.get(f"{BASE}/dorm/listings/{lid}")
        assert soft.status_code == 410 and soft.json()["gone"] is True
        assert soft.json()["listing"]["id"] == lid and isinstance(soft.json()["alternatives"], list)
    finally:
        requests.post(f"{BASE}/dorm/listings/{lid}/status", json={"status": "active"}, headers=admin)


def test_native_lifecycle_expiry_reserved_confirm_available_and_three_report_pause(ctx):
    from datetime import datetime as _dt, timezone as _tz
    # 14d for transfer vs 30d for room
    tr = requests.post(f"{BASE}/dorm/listings", json={**LISTING, "kind": "transfer", "title": "ทดสอบ Lifecycle 14 วัน"}, headers=ctx["a"]).json()
    rm = requests.post(f"{BASE}/dorm/listings", json={**LISTING, "kind": "room", "title": "ทดสอบ Lifecycle 30 วัน"}, headers=ctx["a"]).json()
    try:
        dt_tr = (_dt.fromisoformat(tr["expires_at"]) - _dt.fromisoformat(tr["created_at"])).days
        dt_rm = (_dt.fromisoformat(rm["expires_at"]) - _dt.fromisoformat(rm["created_at"])).days
        assert 13 <= dt_tr <= 14 and 29 <= dt_rm <= 30

        lid = rm["id"]
        # Guest cannot flag a native listing as gone (401)
        assert requests.post(f"{BASE}/dorm/listings/{lid}/gone", json={"anon_id": "anon_guest_native_1"}).status_code == 401
        # 1st signed-in user flags -> stays open + flags owner_confirm_needed
        g1 = requests.post(f"{BASE}/dorm/listings/{lid}/gone", json={}, headers=ctx["b"])
        assert g1.status_code == 200 and g1.json()["needs_owner_confirm"] is True and g1.json()["auto_paused"] is False
        assert requests.get(f"{BASE}/dorm/listings/{lid}").status_code == 200
        mine = next(x for x in requests.get(f"{BASE}/dorm/my", headers=ctx["a"]).json()["listings"] if x["id"] == lid)
        assert mine["owner_confirm_needed"] is True

        # Owner confirms available -> clears flags
        cf = requests.post(f"{BASE}/dorm/listings/{lid}/confirm-available", headers=ctx["a"])
        assert cf.status_code == 200 and cf.json()["status"] == "active"
        mine2 = next(x for x in requests.get(f"{BASE}/dorm/my", headers=ctx["a"]).json()["listings"] if x["id"] == lid)
        assert mine2["owner_confirm_needed"] is False and mine2["gone_reports"] == 0

        # Reserved sets reserved_until (~5 days) and remains active while under 5 days
        rs = requests.post(f"{BASE}/dorm/listings/{lid}/status", json={"status": "reserved"}, headers=ctx["a"])
        assert rs.status_code == 200 and rs.json().get("reserved_until")
        assert requests.get(f"{BASE}/dorm/listings/{lid}").status_code == 200

        # 3 distinct signed-in reports auto-pause native listing without deleting it
        u2 = _register("แจ้งสอง ทดสอบ")
        u3 = _register("แจ้งสาม ทดสอบ")
        requests.post(f"{BASE}/dorm/listings/{lid}/gone", json={}, headers=ctx["b"])
        requests.post(f"{BASE}/dorm/listings/{lid}/gone", json={}, headers=u2)
        g3 = requests.post(f"{BASE}/dorm/listings/{lid}/gone", json={}, headers=u3)
        assert g3.status_code == 200 and g3.json()["auto_paused"] is True and g3.json()["status"] == "closed"
        soft = requests.get(f"{BASE}/dorm/listings/{lid}")
        assert soft.status_code == 410 and "contact_line" not in soft.text and "secret-line-id" not in soft.text
        # Owner re-confirms -> back active
        assert requests.post(f"{BASE}/dorm/listings/{lid}/confirm-available", headers=ctx["a"]).status_code == 200
    finally:
        requests.delete(f"{BASE}/dorm/listings/{tr['id']}", headers=ctx["a"])
        requests.delete(f"{BASE}/dorm/listings/{rm['id']}", headers=ctx["a"])


# ---------------------------------------------------------------- external agent admin + proposals + undo
def _mint_dorm_key(admin_hdr, scopes, label="pytest-agent"):
    r = requests.post(f"{BASE}/dorm/admin/keys", json={"label": label, "scopes": scopes, "expires_days": 7}, headers=admin_hdr)
    assert r.status_code == 200, r.text
    d = r.json()
    return d["id"], {"Authorization": f"Bearer {d['key']}"}


def _revoke_dorm_key(admin_hdr, key_id):
    if key_id:
        requests.delete(f"{BASE}/dorm/admin/keys/{key_id}", headers=admin_hdr)


def test_dorm_api_keys_scopes_and_isolation(ctx):
    admin = _login(*ADMIN)
    # non-admin student cannot mint/list dorm keys
    assert requests.get(f"{BASE}/dorm/admin/keys", headers=ctx["a"]).status_code == 403
    assert requests.post(f"{BASE}/dorm/admin/keys", json={"label": "bad", "scopes": ["dorm.read"]}, headers=ctx["a"]).status_code == 403
    # invalid / cross-domain scope refused
    assert requests.post(f"{BASE}/dorm/admin/keys", json={"label": "bad", "scopes": ["cms.read"]}, headers=admin).status_code == 400

    ro_id, ro_h = _mint_dorm_key(admin, ["dorm.read"], label="pytest-ro")
    bot_id, bot_h = _mint_dorm_key(admin, ["dorm.*"], label="pytest-bot")
    try:
        # read-only key can fetch brief & overview, cannot execute/propose/undo/mint keys
        br = requests.get(f"{BASE}/dorm/admin/agent/brief", headers=ro_h)
        assert br.status_code == 200
        bd = br.json()
        assert "summary" in bd and "work_items" in bd and "capabilities" in bd
        assert "auto_actions" in bd["capabilities"] and "proposal_kinds" in bd["capabilities"]
        assert requests.get(f"{BASE}/dorm/admin/overview", headers=ro_h).status_code == 200
        assert requests.post(f"{BASE}/dorm/admin/agent/execute", json={"action": "close_external_gone", "params": {"listing_id": "x"}}, headers=ro_h).status_code == 403
        assert requests.post(f"{BASE}/dorm/admin/proposals", json={"kind": "publish_digest", "title": "x"}, headers=ro_h).status_code == 403

        # even full dorm.* wildcard cannot self-escalate, approve proposals, verify students directly, or reach CMS
        assert requests.get(f"{BASE}/dorm/admin/keys", headers=bot_h).status_code == 403
        assert requests.post(f"{BASE}/dorm/admin/keys", json={"label": "esc", "scopes": ["dorm.*"]}, headers=bot_h).status_code == 403
        assert requests.post(f"{BASE}/dorm/admin/proposals/prop_none/confirm", json={}, headers=bot_h).status_code == 403
        assert requests.post(f"{BASE}/dorm/admin/verifications/u_none", json={"action": "approve"}, headers=bot_h).status_code == 403
        assert requests.post(f"{BASE}/dorm/admin/seed-buildings", headers=bot_h).status_code == 403
        assert requests.get(f"{BASE}/cms/revisions?doc=landing", headers=bot_h).status_code == 403
    finally:
        _revoke_dorm_key(admin, ro_id)
        _revoke_dorm_key(admin, bot_id)


def test_agent_auto_execute_close_reopen_patch_and_undo(ix, ctx):
    admin = _login(*ADMIN)
    kid, bot_h = _mint_dorm_key(admin, ["dorm.*"], label="pytest-auto")
    room = ix["rooms"][-3]
    lid = room["id"]
    native = requests.post(f"{BASE}/dorm/listings", json={**LISTING, "title": "ทดสอบ Agent Guard Native"}, headers=ctx["a"]).json()
    try:
        # dry-run does not modify state
        dr = requests.post(f"{BASE}/dorm/admin/agent/execute", json={
            "action": "close_external_gone", "params": {"listing_id": lid}, "reason": "404 check", "dry_run": True
        }, headers=bot_h)
        assert dr.status_code == 200 and dr.json()["dry_run"] is True
        assert requests.get(f"{BASE}/dorm/listings/{lid}").status_code == 200

        # native listing refused on close_external_gone (409 -> must propose)
        ng = requests.post(f"{BASE}/dorm/admin/agent/execute", json={
            "action": "close_external_gone", "params": {"listing_id": native["id"]}
        }, headers=bot_h)
        assert ng.status_code == 409

        # real close_external_gone succeeds & records undoable action
        ex = requests.post(f"{BASE}/dorm/admin/agent/execute", json={
            "action": "close_external_gone", "params": {"listing_id": lid}, "reason": "HTTP 404 Renthub"
        }, headers=bot_h)
        assert ex.status_code == 200 and ex.json()["status"] == "closed"
        act_id = ex.json()["action_id"]
        assert requests.get(f"{BASE}/dorm/listings/{lid}").status_code == 410

        # undo restores room to active immediately; double-undo returns 409
        un = requests.post(f"{BASE}/dorm/admin/actions/{act_id}/undo", headers=bot_h)
        assert un.status_code == 200 and un.json()["restored"] >= 1
        assert requests.get(f"{BASE}/dorm/listings/{lid}").status_code == 200
        assert requests.post(f"{BASE}/dorm/admin/actions/{act_id}/undo", headers=bot_h).status_code == 409

        # patch_external_listing updates price + recomputes price_per_person + undo restores original price
        orig_price = room["price_total"]
        new_price = orig_price + 1000
        pt = requests.post(f"{BASE}/dorm/admin/agent/execute", json={
            "action": "patch_external_listing", "params": {"listing_id": lid, "patch": {"price_total": new_price}}
        }, headers=bot_h)
        assert pt.status_code == 200
        assert _summary(lid)["price_total"] == new_price
        assert requests.post(f"{BASE}/dorm/admin/actions/{pt.json()['action_id']}/undo", headers=admin).status_code == 200
        assert _summary(lid)["price_total"] == orig_price
    finally:
        requests.post(f"{BASE}/dorm/listings/{lid}/status", json={"status": "active"}, headers=admin)
        requests.delete(f"{BASE}/dorm/listings/{native['id']}", headers=ctx["a"])
        _revoke_dorm_key(admin, kid)


def test_agent_resolve_stale_report_guard_and_mass_close_guard(ix, ctx):
    admin = _login(*ADMIN)
    kid, bot_h = _mint_dorm_key(admin, ["dorm.*"], label="pytest-guards")
    # native room with a user report
    rm = requests.post(f"{BASE}/dorm/listings", json={**LISTING, "title": "ทดสอบ Stale Report Guard"}, headers=ctx["a"]).json()
    try:
        assert requests.post(f"{BASE}/dorm/reports", json={
            "target_type": "listing", "target_id": rm["id"], "reason": "ข้อมูลเท็จ/ไม่มีห้องจริง", "note": "test"
        }, headers=ctx["b"]).status_code == 200
        reps = requests.get(f"{BASE}/dorm/admin/overview", headers=admin).json()["reports"]
        rep_id = next(r["id"] for r in reps if r["target_id"] == rm["id"])

        # cannot auto-resolve while target is still live (409)
        r_live = requests.post(f"{BASE}/dorm/admin/agent/execute", json={
            "action": "resolve_stale_report", "params": {"report_id": rep_id}
        }, headers=bot_h)
        assert r_live.status_code == 409

        # close listing -> now report IS stale -> auto-resolve succeeds and is undoable
        requests.post(f"{BASE}/dorm/listings/{rm['id']}/status", json={"status": "closed"}, headers=ctx["a"])
        r_stale = requests.post(f"{BASE}/dorm/admin/agent/execute", json={
            "action": "resolve_stale_report", "params": {"report_id": rep_id}
        }, headers=bot_h)
        assert r_stale.status_code == 200 and r_stale.json()["resolved"] is True
        assert requests.post(f"{BASE}/dorm/admin/actions/{r_stale.json()['action_id']}/undo", headers=admin).status_code == 200
        assert any(r["id"] == rep_id for r in requests.get(f"{BASE}/dorm/admin/overview", headers=admin).json()["reports"])
        # clean up report for test hygiene
        requests.post(f"{BASE}/dorm/admin/reports/{rep_id}/resolve", headers=admin)

        # mass-close safety guard (>40% closed in one batch triggers 409)
        r_mass = requests.post(f"{BASE}/dorm/admin/agent/execute", json={
            "action": "refresh_external_batch",
            "params": {"listings": [], "close_missing": True},
        }, headers=bot_h)
        assert r_mass.status_code == 409
    finally:
        requests.delete(f"{BASE}/dorm/listings/{rm['id']}", headers=ctx["a"])
        _revoke_dorm_key(admin, kid)


def test_agent_proposals_dedup_confirm_inline_override_undo_and_reject(ctx):
    admin = _login(*ADMIN)
    kid, bot_h = _mint_dorm_key(admin, ["dorm.*"], label="pytest-prop")
    rm = requests.post(f"{BASE}/dorm/listings", json={**LISTING, "title": "ทดสอบ Proposal Flow"}, headers=ctx["a"]).json()
    u_ver = _register("ผู้ขอ ยืนยันทดสอบ")
    uid = requests.get(f"{BASE}/auth/me", headers=u_ver).json()["id"]
    try:
        # 1) Create verification request, let agent submit deduplicated proposal, human confirms with inline override -> undo
        assert requests.post(f"{BASE}/dorm/verify/request", json={
            "kind": "freshman", "faculty": "บริหารธุรกิจเพื่อสังคม", "entry_year": 2569, "note": "พอร์ตรอบ 1"
        }, headers=u_ver).status_code == 200
        p1 = requests.post(f"{BASE}/dorm/admin/proposals", json={
            "kind": "review_verification", "priority": "high",
            "title": "ตรวจคำขอยืนยันนิสิต มศว", "summary": "พอร์ตรอบ 1",
            "target_type": "verification", "target_id": uid,
            "evidence": [{"label": "คณะ", "value": "บริหารธุรกิจเพื่อสังคม"}],
            "payload": {"action": "reject", "reason": "check"},
        }, headers=bot_h)
        assert p1.status_code == 200 and p1.json()["deduplicated"] is False
        pid1 = p1.json()["id"]

        # second submit for same (kind, target_id) while pending deduplicates
        p1_dup = requests.post(f"{BASE}/dorm/admin/proposals", json={
            "kind": "review_verification", "priority": "high",
            "title": "ตรวจคำขอยืนยันนิสิต มศว (อัปเดต)", "summary": "พอร์ตรอบ 1 ชัดเจน",
            "target_type": "verification", "target_id": uid,
            "payload": {"action": "approve", "reason": ""},
        }, headers=bot_h)
        assert p1_dup.status_code == 200 and p1_dup.json()["id"] == pid1 and p1_dup.json()["deduplicated"] is True

        # human admin confirms with inline override back to approve
        cf = requests.post(f"{BASE}/dorm/admin/proposals/{pid1}/confirm", json={
            "payload": {"action": "approve", "reason": ""}, "note": "ok"
        }, headers=admin)
        assert cf.status_code == 200 and cf.json()["result"]["status"] == "verified"
        assert requests.get(f"{BASE}/dorm/my", headers=u_ver).json()["verification"]["verified"] is True

        # undo reverts verification back to pending
        act1 = cf.json()["action_id"]
        assert requests.post(f"{BASE}/dorm/admin/actions/{act1}/undo", headers=admin).status_code == 200
        assert requests.get(f"{BASE}/dorm/my", headers=u_ver).json()["verification"]["verified"] is False

        # 2) close_native_listing confirm + undo, and reject flow
        p2 = requests.post(f"{BASE}/dorm/admin/proposals", json={
            "kind": "close_native_listing", "title": "ปิดประกาศทดสอบ",
            "target_type": "listing", "target_id": rm["id"],
            "payload": {"reason": "เต็มแล้ว"},
        }, headers=bot_h).json()
        cf2 = requests.post(f"{BASE}/dorm/admin/proposals/{p2['id']}/confirm", json={}, headers=admin)
        assert cf2.status_code == 200 and requests.get(f"{BASE}/dorm/listings/{rm['id']}").status_code == 410
        assert requests.post(f"{BASE}/dorm/admin/actions/{cf2.json()['action_id']}/undo", headers=admin).status_code == 200
        assert requests.get(f"{BASE}/dorm/listings/{rm['id']}").status_code == 200

        # reject proposal leaves listing untouched
        p3 = requests.post(f"{BASE}/dorm/admin/proposals", json={
            "kind": "feature_listing", "title": "ปักแนะนำทดสอบ",
            "target_type": "listing", "target_id": rm["id"],
            "payload": {"featured": True},
        }, headers=bot_h).json()
        rj = requests.post(f"{BASE}/dorm/admin/proposals/{p3['id']}/reject", json={"note": "ยังไม่ปัก"}, headers=admin)
        assert rj.status_code == 200 and rj.json()["status"] == "rejected"
        assert _summary(rm["id"]).get("featured") is False
    finally:
        requests.delete(f"{BASE}/dorm/listings/{rm['id']}", headers=ctx["a"])
        _revoke_dorm_key(admin, kid)


def test_register_blocks_admin_role_escalation():
    admin_email = f"dormtest-evil-{uuid.uuid4().hex[:8]}@example.com"
    r_evil = requests.post(f"{BASE}/auth/register", json={
        "email": admin_email, "password": "pw-123456", "full_name": "Evil Admin", "role": "admin",
    })
    assert r_evil.status_code == 403, r_evil.text

    # Legitimate non-privileged roles remain allowed
    for allowed_role in ("public_user", "current_student", "alumni"):
        em = f"dormtest-ok-{uuid.uuid4().hex[:8]}@example.com"
        r_ok = requests.post(f"{BASE}/auth/register", json={
            "email": em, "password": "pw-123456", "full_name": f"Ok {allowed_role}", "role": allowed_role,
        })
        assert r_ok.status_code == 200, r_ok.text
        h = {"Authorization": f"Bearer {r_ok.json()['access_token']}"}
        assert r_ok.json()["user"]["role"] == allowed_role
        assert requests.get(f"{BASE}/dorm/admin/overview", headers=h).status_code == 403
        assert requests.get(f"{BASE}/dorm/admin/keys", headers=h).status_code == 403


def test_preserialized_gzip_cache_and_invalidation(ctx):
    # Pre-serialized gzip responses work seamlessly with Accept-Encoding: gzip and reflect mutations immediately
    for path in ("/dorm/listings?limit=300", "/dorm/buildings", "/dorm/stats", "/dorm/meta"):
        r1 = requests.get(f"{BASE}{path}", headers={"Accept-Encoding": "gzip"})
        assert r1.status_code == 200 and r1.json()
        r2 = requests.get(f"{BASE}{path}", headers={"Accept-Encoding": "gzip"})
        assert r2.status_code == 200 and r2.headers.get("content-encoding") == "gzip" and r2.json() == r1.json()

    created = requests.post(f"{BASE}/dorm/listings", json={**LISTING, "title": "ทดสอบ Cache Bust Live"}, headers=ctx["a"])
    assert created.status_code == 200
    cid = created.json()["id"]
    try:
        r3 = requests.get(f"{BASE}/dorm/listings?limit=300", headers={"Accept-Encoding": "gzip"})
        assert any(x["id"] == cid for x in r3.json()["items"])
    finally:
        requests.delete(f"{BASE}/dorm/listings/{cid}", headers=ctx["a"])
    r4 = requests.get(f"{BASE}/dorm/listings?limit=300", headers={"Accept-Encoding": "gzip"})
    assert all(x["id"] != cid for x in r4.json()["items"])


def test_google_link_aud_enforced_and_self_verify_vouch_pregrant(ctx):
    from pymongo import MongoClient
    import sys
    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
    from server import create_access_token

    # 1) google-link rejects bogus credential even when GOOGLE_CLIENT_ID env is unset (uses hardcoded client ID)
    r_bad = requests.post(f"{BASE}/dorm/verify/google-link", json={"credential": "x" * 30}, headers=ctx["a"])
    assert r_bad.status_code == 400

    # 2) Non-SWU user cannot vouch for another personal email
    assert requests.post(
        f"{BASE}/dorm/verify/vouch-personal-email",
        json={"personal_email": "someone@gmail.com"},
        headers=ctx["a"],
    ).status_code == 403

    # 3) Google @g.swu.ac.th user vouches for a not-yet-registered personal email -> auto-claimed on signup
    client = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    mdb = client[os.environ.get("DB_NAME", "swumkt_dev")]
    swu_uid = f"u-swu-{uuid.uuid4().hex[:8]}"
    swu_em = f"student.{uuid.uuid4().hex[:6]}@g.swu.ac.th"
    personal_em = f"dormtest-vouch-{uuid.uuid4().hex[:8]}@gmail.com"
    personal_em_2 = f"dormtest-vouch2-{uuid.uuid4().hex[:8]}@gmail.com"
    try:
        mdb.users.insert_one({
            "id": swu_uid, "email": swu_em, "full_name": "SWU Google Student",
            "role": "current_student", "auth_method": "google",
        })
        swu_h = {"Authorization": f"Bearer {create_access_token(swu_uid, swu_em, 'current_student')}"}

        # Rejects SWU email as personal_email target
        assert requests.post(f"{BASE}/dorm/verify/vouch-personal-email", json={"personal_email": "other@g.swu.ac.th"}, headers=swu_h).status_code == 422

        # Vouch before personal signup
        v1 = requests.post(f"{BASE}/dorm/verify/vouch-personal-email", json={"personal_email": personal_em}, headers=swu_h)
        assert v1.status_code == 200 and v1.json()["applied"] is False and v1.json()["pending_signup"] is True
        assert v1.json()["verification"]["vouched_personal_email"] == personal_em
        assert v1.json()["verification"]["vouch_claimed"] is False

        # Personal user signs up & visits /dorm/my -> pre-grant auto-claimed with zero admin involvement
        r_p = requests.post(f"{BASE}/auth/register", json={"email": personal_em, "password": "pw-123456", "full_name": "Personal Account"})
        assert r_p.status_code == 200
        p_h = {"Authorization": f"Bearer {r_p.json()['access_token']}"}
        my_p = requests.get(f"{BASE}/dorm/my", headers=p_h).json()
        assert my_p["verification"]["verified"] is True
        assert my_p["verification"]["method"] == "swu_account_vouch"
        assert my_p["verification"]["swu_email"] == swu_em

        # Trying to vouch a second personal email with the same SWU account is rejected (1-to-1)
        v2 = requests.post(f"{BASE}/dorm/verify/vouch-personal-email", json={"personal_email": personal_em_2}, headers=swu_h)
        assert v2.status_code == 409

        # Listings created by personal account inherit verified badge automatically
        rm = requests.post(f"{BASE}/dorm/listings", json={**LISTING, "title": "ทดสอบ Vouch Badge"}, headers=p_h)
        assert rm.status_code == 200 and rm.json()["poster_swu_verified"] is True
        requests.delete(f"{BASE}/dorm/listings/{rm.json()['id']}", headers=p_h)
    finally:
        mdb.users.delete_many({"id": swu_uid})
        mdb.dorm_verify_pregrants.delete_many({"swu_email": swu_em})
        mdb.dorm_verifications.delete_many({"swu_email": swu_em})
        client.close()


def test_auto_resolve_gone_and_deleted_reports_and_crowd_auto_moderation_with_undo(ctx):
    from pymongo import MongoClient
    admin = _login(*ADMIN)

    # 1) Closing a listing auto-resolves its gone reports while deleting resolves all open reports
    rm1 = requests.post(f"{BASE}/dorm/listings", json={**LISTING, "title": "ทดสอบ AutoResolve Close"}, headers=ctx["a"]).json()
    try:
        assert requests.post(f"{BASE}/dorm/reports", json={
            "target_type": "listing", "target_id": rm1["id"], "reason": "ห้องเต็มแล้วแต่ไม่ปิดประกาศ", "note": "gone"
        }, headers=ctx["b"]).status_code == 200
        assert requests.post(f"{BASE}/dorm/listings/{rm1['id']}/status", json={"status": "closed"}, headers=ctx["a"]).status_code == 200
        open_reps = requests.get(f"{BASE}/dorm/admin/overview", headers=admin).json()["reports"]
        assert not any(r["target_id"] == rm1["id"] for r in open_reps)
    finally:
        requests.delete(f"{BASE}/dorm/listings/{rm1['id']}", headers=ctx["a"])

    # 2) 3 verified reporters trigger reversible crowd auto-moderation
    client = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    mdb = client[os.environ.get("DB_NAME", "swumkt_dev")]
    rep_users = [_register(f"ผู้รายงาน {i}") for i in range(3)]
    rep_uids = [requests.get(f"{BASE}/auth/me", headers=h).json()["id"] for h in rep_users]
    rm2 = requests.post(f"{BASE}/dorm/listings", json={**LISTING, "title": "ทดสอบ Crowd AutoModerate"}, headers=ctx["a"]).json()
    try:
        for uid in rep_uids:
            mdb.dorm_verifications.update_one(
                {"user_id": uid},
                {"$set": {"user_id": uid, "status": "verified", "method": "google_swu_link", "swu_email": f"{uid}@g.swu.ac.th"}},
                upsert=True,
            )
        for idx, h in enumerate(rep_users):
            rr = requests.post(f"{BASE}/dorm/reports", json={
                "target_type": "listing", "target_id": rm2["id"], "reason": "สแกม/ขอโอนเงินก่อน", "note": f"scam-{idx}"
            }, headers=h)
            assert rr.status_code == 200
            if idx == 2:
                assert rr.json().get("auto_moderated") is True

        # Listing is hidden & owner cannot self-reopen
        assert requests.get(f"{BASE}/dorm/listings/{rm2['id']}").status_code == 410
        assert requests.post(f"{BASE}/dorm/listings/{rm2['id']}/status", json={"status": "active"}, headers=ctx["a"]).status_code == 403

        # Action recorded in dorm_agent_actions + reports resolved + autopilot counter populated
        ov = requests.get(f"{BASE}/dorm/admin/overview", headers=admin).json()
        assert ov["autopilot_30d"]["auto_moderated"] >= 1
        assert not any(r["target_id"] == rm2["id"] for r in ov["reports"])
        act = next(a for a in ov["recent_actions"] if a["action"] == "auto_moderate" and a["target_id"] == rm2["id"])
        assert act["can_undo"] is True

        # Admin undo restores the listing cleanly & resolve-stale works
        assert requests.post(f"{BASE}/dorm/admin/actions/{act['id']}/undo", headers=admin).status_code == 200
        assert requests.get(f"{BASE}/dorm/listings/{rm2['id']}").status_code == 200

        # Resolve-stale endpoint clears reports on already-closed targets in bulk
        assert requests.post(f"{BASE}/dorm/listings/{rm2['id']}/status", json={"status": "closed"}, headers=ctx["a"]).status_code == 200
        rs = requests.post(f"{BASE}/dorm/admin/reports/resolve-stale", headers=admin)
        assert rs.status_code == 200 and rs.json()["resolved"] >= 1
        assert not any(r["target_id"] == rm2["id"] for r in requests.get(f"{BASE}/dorm/admin/overview", headers=admin).json()["reports"])
    finally:
        requests.delete(f"{BASE}/dorm/listings/{rm2['id']}", headers=ctx["a"])
        mdb.dorm_verifications.delete_many({"user_id": {"$in": rep_uids}})
        client.close()


def test_chat_fixes_latest_100_bidirectional_dedup_closed_mate_and_rate_limit(ctx):
    from pymongo import MongoClient
    from datetime import datetime, timedelta, timezone

    # 1) Create two open mate profiles and test A -> B vs B -> A deduplication (plain + room_id)
    u_x, u_y = _register("แชท X"), _register("แชท Y")
    mate_base = {
        "gender": "female", "mate_gender_pref": "any", "year": "2", "faculty": "บริหาร",
        "budget_min": 4000, "budget_max": 7000, "zones": ["asoke"], "move_in": "2026-12",
        "has_room": False, "tags": [], "about": "", "contact_line": "line_xy", "consent": True,
    }
    mx = requests.put(f"{BASE}/dorm/mates/me", headers=u_x, json={**mate_base, "display_name": "เอ็กซ์"}).json()["profile"]
    my = requests.put(f"{BASE}/dorm/mates/me", headers=u_y, json={**mate_base, "display_name": "วาย"}).json()["profile"]
    ext_room_id = requests.get(f"{BASE}/dorm/listings", params={"limit": 1}).json()["items"][0]["id"]

    client = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    mdb = client[os.environ.get("DB_NAME", "swumkt_dev")]
    created_tids = []
    try:
        t_ab = requests.post(f"{BASE}/dorm/threads", headers=u_x, json={"target_type": "mate", "target_id": my["id"], "message": "ทักจาก X"}).json()["thread"]
        t_ba = requests.post(f"{BASE}/dorm/threads", headers=u_y, json={"target_type": "mate", "target_id": mx["id"]}).json()["thread"]
        created_tids.append(t_ab["id"])
        assert t_ab["id"] == t_ba["id"]

        tr_ab = requests.post(f"{BASE}/dorm/threads", headers=u_x, json={"target_type": "mate", "target_id": my["id"], "room_id": ext_room_id, "message": "ทักห้องเดียวกัน"}).json()["thread"]
        tr_ba = requests.post(f"{BASE}/dorm/threads", headers=u_y, json={"target_type": "mate", "target_id": mx["id"], "room_id": ext_room_id}).json()["thread"]
        created_tids.append(tr_ab["id"])
        assert tr_ab["id"] == tr_ba["id"] and tr_ab["id"] != t_ab["id"]

        # 2) Latest 100 messages returned chronologically when > 100 messages exist
        uid_x = requests.get(f"{BASE}/auth/me", headers=u_x).json()["id"]
        base_dt = datetime.now(timezone.utc) - timedelta(hours=2)
        mdb.dorm_messages.delete_many({"thread_id": t_ab["id"]})
        bulk = [{
            "id": f"m{i:04d}" + uuid.uuid4().hex[:7],
            "thread_id": t_ab["id"],
            "sender_id": uid_x,
            "body": f"msg-{i:03d}",
            "kind": "text",
            "created_at": (base_dt + timedelta(seconds=i)).isoformat(),
        } for i in range(1, 106)]
        mdb.dorm_messages.insert_many(bulk)
        res_msgs = requests.get(f"{BASE}/dorm/threads/{t_ab['id']}/messages", headers=u_y).json()["messages"]
        assert len(res_msgs) == 100
        assert res_msgs[0]["body"] == "msg-006" and res_msgs[-1]["body"] == "msg-105"

        # 3) Per-user chat rate limit (429 after 30 messages within 1 minute)
        now_dt = datetime.now(timezone.utc)
        mdb.dorm_messages.insert_many([{
            "id": "rl_" + uuid.uuid4().hex[:9],
            "thread_id": tr_ab["id"],
            "sender_id": uid_x,
            "body": f"burst-{i}",
            "kind": "text",
            "created_at": now_dt.isoformat(),
        } for i in range(30)])
        r_rl = requests.post(f"{BASE}/dorm/threads/{tr_ab['id']}/messages", headers=u_x, json={"body": "too fast"})
        assert r_rl.status_code == 429

        # 4) Closed mate profile rejects starting a brand-new thread with 410
        assert requests.post(f"{BASE}/dorm/mates/me/close", headers=u_y).status_code == 200
        u_z = _register("แชท Z")
        r_closed = requests.post(f"{BASE}/dorm/threads", headers=u_z, json={"target_type": "mate", "target_id": my["id"]})
        assert r_closed.status_code == 410
    finally:
        requests.delete(f"{BASE}/dorm/mates/me", headers=u_x)
        requests.delete(f"{BASE}/dorm/mates/me", headers=u_y)
        if created_tids:
            mdb.dorm_messages.delete_many({"thread_id": {"$in": created_tids}})
            mdb.dorm_threads.delete_many({"id": {"$in": created_tids}})
        client.close()


def test_seo_sitemap_og_and_multi_campus_support():
    # 1) Multi-campus registry & meta include swu-prasarnmit + planned universities
    camp_res = requests.get(f"{BASE}/dorm/campuses")
    assert camp_res.status_code == 200
    camp_data = camp_res.json()
    assert camp_data["default"] == "swu-prasarnmit"
    slugs = {c["slug"] for c in camp_data["items"]}
    assert {"swu-prasarnmit", "chula", "ku-bangkhen", "tu-rangsit", "cmu"} <= slugs

    m_res = requests.get(f"{BASE}/dorm/meta").json()
    assert m_res["campus"]["slug"] == "swu-prasarnmit"
    assert len(m_res["campuses"]) >= 5

    # Filtering by active campus keeps all SWU data, unknown planned campus cleanly returns 0
    assert requests.get(f"{BASE}/dorm/buildings", params={"campus": "swu-prasarnmit"}).json()["items"]
    assert requests.get(f"{BASE}/dorm/buildings", params={"campus": "chula"}).json()["items"] == []

    # 2) Dynamic dorm sitemap.xml is indexable (no noindex header) & lists core pages, buildings, active rooms
    sm = requests.get(f"{BASE}/dorm/sitemap.xml")
    assert sm.status_code == 200
    assert "xml" in (sm.headers.get("content-type") or "").lower()
    assert "noindex" not in (sm.headers.get("x-robots-tag") or "").lower()
    assert "<urlset" in sm.text
    assert "/dorm/buildings/life-asoke</loc>" in sm.text
    assert "/dorm/rooms/" in sm.text

    # 3) Building & room OG pages carry canonical + indexable headers
    ob = requests.get(f"{BASE}/dorm/og/buildings/life-asoke")
    assert ob.status_code == 200
    assert "noindex" not in (ob.headers.get("x-robots-tag") or "").lower()
    assert 'rel="canonical"' in ob.text and "/dorm/buildings/life-asoke" in ob.text




