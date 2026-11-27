"""API tests: gap-driven chain, invite lineage + funnel, เฉลยสาย reveal game,
new-level notifications, leaderboards, meetups, benefits hub."""
import json

from test_alumni_2026_11_support import env, run  # noqa: F401


# ------------------------------------------------------------ gaps & nudge

def test_chain_gaps_up_and_down(env):
    env.member("me", 66, "มี่"); env.member("p1", 65, "พีหนึ่ง", gender="m")
    env.link("me", "p1")
    gid = env.ghost("me", "ลุงหมอก", 64, attach_as="senior", to="p1", gender="m")["ghost"]["user_id"]
    g = env.get("me", "/alumni/chain/gaps").json()
    up = g["up"]
    assert [(s["distance"], s["state"], s["term"]) for s in up] == [
        (1, "registered", "พี่เทค"), (2, "ghost", "ลุงเทค"), (3, "missing", "ปู่/ย่าเทค")]
    assert up[1]["action"] == "invite_ghost" and up[1]["best_inviters"][0]["user_id"] == "p1"
    assert up[2]["action"] == "add_ghost_above" and up[2]["headline"] == "ปู่/ย่าเทคของคุณยังไม่มา"
    assert g["down"] == [{"distance": -1, "term": "น้องเทค", "state": "missing",
                          "headline": "น้องเทคของคุณยังไม่มา", "action": "add_or_invite",
                          "best_inviters": [{"user_id": "me", "nickname": "มี่", "is_me": True}]}]
    assert up[1]["node"]["user_id"] == gid


def test_chain_gap_top_registered_suggests_nudge(env):
    env.member("me", 66); env.member("p1", 65, "พีหนึ่ง")
    env.link("me", "p1")
    g = env.get("me", "/alumni/chain/gaps").json()
    assert g["up"][-1]["action"] == "nudge"
    assert g["up"][-1]["best_inviters"][0]["user_id"] == "p1"
    r = env.post("me", "/alumni/chain/nudge", {"user_id": "p1"})
    assert r.status_code == 200
    n = run(env.db.alumni_notifications.find_one({"user_id": "p1", "kind": "chain_nudge"}))
    assert "พี่เทค" in n["title"]
    assert env.post("me", "/alumni/chain/nudge", {"user_id": "p1"}).status_code == 429   # once per 3 days
    env.member("stranger", 50)
    assert env.post("me", "/alumni/chain/nudge", {"user_id": "stranger"}).status_code == 403


# ------------------------------------------------------------ lineage & funnel

def test_invite_lineage_depth_and_funnel(env):
    env.admin()
    env.member("a", 60, "เอ")
    inv1 = env.post("a", "/alumni/invites", {"invitee_name": "บี"}).json()
    assert inv1["inviter_depth"] == 0 and inv1["parent_invite_id"] is None
    env.member("b", 61, "บี")
    acc = env.post("b", f"/alumni/invites/accept/{inv1['code']}").json()
    assert acc["relation_pending"] is True and acc["inviter_id"] == "a"
    b = run(env.db.alumni_users.find_one({"user_id": "b"}))
    assert (b["invited_by"], b["invite_depth"]) == ("a", 1)
    inv2 = env.post("b", "/alumni/invites", {}).json()
    assert inv2["parent_invite_id"] == inv1["id"] and inv2["inviter_depth"] == 1
    env.member("c", 62, "ซี")
    env.get(None, f"/alumni/invites/preview/{inv2['code']}")
    env.post("c", f"/alumni/invites/accept/{inv2['code']}")
    assert run(env.db.alumni_users.find_one({"user_id": "c"}))["invite_depth"] == 2
    env.post("c", "/alumni/invites", {})          # sent, never accepted
    # accepting twice / by another person
    assert env.post("c", f"/alumni/invites/accept/{inv2['code']}").json()["message"] == "Already accepted"
    env.member("d", 62)
    assert env.post("d", f"/alumni/invites/accept/{inv2['code']}").status_code == 409
    f = env.get("admin", "/alumni/admin/invite-funnel").json()
    assert f["invites_sent"] == 3 and f["invites_accepted"] == 2 and f["invites_opened"] >= 2
    assert f["inviters"] == 3 and f["invitees_who_invited"] == 2
    assert f["members"] == 4 and f["k_factor"] == 0.5
    depths = {r["depth"]: r["members"] for r in f["members_by_invite_depth"]}
    assert depths.get(1) == 1 and depths.get(2) == 1
    # inviter got invite_accepted XP exactly once
    acts = run(env.db.alumni_notifications.count_documents({"user_id": "b", "kind": "invite_accepted"}))
    assert acts == 1


def test_invite_rate_limit(env):
    env.member("a", 60)
    for _ in range(30):
        assert env.post("a", "/alumni/invites", {}).status_code == 200
    assert env.post("a", "/alumni/invites", {}).status_code == 429


# ------------------------------------------------------------ reveal game

def _reveal_invite(env):
    env.member("inv", 64, "ต้นข้าว", name="ต้นข้าว สายสวย")
    gid = env.ghost("inv", "น้องปริศนา", 65, attach_as="junior")["ghost"]["user_id"]
    inv = env.post("inv", f"/alumni/ghosts/{gid}/invite", {"clue": "เคยติวสถิติให้"}).json()
    return gid, inv


def test_preview_never_leaks_inviter_before_guess(env):
    gid, inv = _reveal_invite(env)
    p = env.get(None, f"/alumni/invites/preview/{inv['code']}").json()
    assert p["inviter"] is None and p["reveal_game"] is True and p["revealed"] is False
    blob = json.dumps(p, ensure_ascii=False)
    for secret in ("inv", "ต้นข้าว", "สายสวย", "inv@g.swu.ac.th", "น้องปริศนา"):
        assert f'"{secret}"' not in blob and secret not in blob.replace('"inviter": null', ""), secret
    keys = {c["key"] for c in p["clues"]}
    assert keys == {"gen", "relation", "custom"}
    assert {c["key"]: c["value"] for c in p["clues"]}["relation"] == "พี่เทค"
    # reveal is refused until the guess phase is over
    r = env.post(None, f"/alumni/invites/{inv['code']}/reveal", {})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "guess_first"


def test_guess_unlocks_clues_then_reveals(env):
    gid, inv = _reveal_invite(env)
    r = env.post(None, f"/alumni/invites/{inv['code']}/guess", {"guess": "สมชาย"}).json()
    assert r["correct"] is False and r["guesses_left"] == 2 and not r["revealed"]
    assert {"role", "line_size"} <= {c["key"] for c in r["clues"]}
    assert "inviter" not in r
    r = env.post(None, f"/alumni/invites/{inv['code']}/guess", {"guess": "มานี"}).json()
    initial = {c["key"]: c["value"] for c in r["clues"]}.get("initial")
    assert initial == "ต"
    r = env.post(None, f"/alumni/invites/{inv['code']}/guess", {"guess": "ต้น"}).json()
    assert r["correct"] is True and r["revealed"] is True
    rv = env.post(None, f"/alumni/invites/{inv['code']}/reveal", {}).json()
    assert rv["inviter"]["user_id"] == "inv" and rv["guessed_correctly"] is True
    assert "email" not in rv["inviter"]
    # after the reveal, the preview shows the inviter
    assert env.get(None, f"/alumni/invites/preview/{inv['code']}").json()["inviter"]["user_id"] == "inv"


def test_guesses_are_capped_and_give_up(env):
    gid, inv = _reveal_invite(env)
    for _ in range(3):
        last = env.post(None, f"/alumni/invites/{inv['code']}/guess", {"guess": "ผิด"}).json()
    assert last["revealed"] is True and last["guesses_left"] == 0 and last["correct"] is False
    more = env.post(None, f"/alumni/invites/{inv['code']}/guess", {"guess": "ต้นข้าว"}).json()
    assert more["correct"] is False          # cannot keep brute-forcing
    gid2 = env.ghost("inv", "น้องสอง", 66, attach_as="junior")["ghost"]["user_id"]
    inv2 = env.post("inv", f"/alumni/ghosts/{gid2}/invite", {}).json()
    rv = env.post(None, f"/alumni/invites/{inv2['code']}/reveal", {"give_up": True}).json()
    assert rv["inviter"]["user_id"] == "inv" and rv["guessed_correctly"] is False


def test_legacy_invite_preview_unchanged_but_no_email(env):
    env.member("a", 60, "เอ")
    inv = env.post("a", "/alumni/invites", {}).json()
    assert inv["reveal_game"] is False and inv["relation_hint"] == "น้องเทค"
    p = env.get(None, f"/alumni/invites/preview/{inv['code']}").json()
    assert p["inviter"]["user_id"] == "a" and p["inviter"]["nickname"] == "เอ"
    assert "email" not in p["inviter"] and "student_id" not in p["inviter"]


# ------------------------------------------------------------ new level notification

def test_line_new_level_notifies_whole_line(env):
    env.member("a", 66); env.member("b", 65); env.member("c", 64)
    env.link("a", "b")
    run(env.db.alumni_notifications.delete_many({}))
    env.link("b", "c")          # line grows from 2 to 3 rungs
    got = {n["user_id"] for n in run(env.db.alumni_notifications.find({"kind": "line_new_level"}).to_list(10))}
    assert got == {"a", "b", "c"}
    run(env.db.alumni_notifications.delete_many({}))
    env.member("a2", 66)
    env.link("a2", "b")         # a sibling does not add a level
    assert run(env.db.alumni_notifications.count_documents({"kind": "line_new_level"})) == 0


# ------------------------------------------------------------ leaderboards

def test_line_and_cohort_leaderboards(env):
    env.admin()
    for uid, gen in [("a", 66), ("b", 65), ("c", 64), ("x", 66), ("y", 65)]:
        env.member(uid, gen)
    env.link("a", "b"); env.link("b", "c"); env.link("x", "y")
    gid = env.ghost("c", "พี่ดี", 63)["relation"]["id"]
    env.member("v1", 64); env.member("v2", 64)
    env.post("v1", f"/alumni/relations/{gid}/vouch", {"vote": "yes"})
    env.post("v2", f"/alumni/relations/{gid}/vouch", {"vote": "yes"})
    from lib import ttl_cache
    ttl_cache._store.clear()
    lb = env.get("a", "/alumni/leaderboard/lines").json()
    assert lb["lines"][0]["span"] == 4 and lb["lines"][0]["top"]["is_ghost"] is True
    assert lb["my_line"]["rank"] == 1 and "member_ids" not in lb["lines"][0]
    comp = env.get("a", "/alumni/leaderboard/lines", params={"sort": "complete"}).json()
    assert comp["lines"][0]["completeness"] == 0.75   # 3 registered of 4
    coh = {c["gen"]: c for c in env.get("a", "/alumni/leaderboard/cohorts").json()["cohorts"]}
    assert coh[63]["basis"] == "known_members" if 63 in coh else True
    assert coh[66]["registered"] == 2 and coh[66]["completion"] == 1.0
    env.put("admin", "/alumni/admin/cohort-sizes", {"sizes": {"66": 8}})
    coh = {c["gen"]: c for c in env.get("a", "/alumni/leaderboard/cohorts").json()["cohorts"]}
    assert coh[66]["completion"] == 0.25 and coh[66]["basis"] == "official_size"
    env.user("outsider")
    assert env.get("outsider", "/alumni/leaderboard/lines").status_code == 403


# ------------------------------------------------------------ meetups

def test_meetups_create_list_rsvp_visibility(env):
    env.member("a", 66); env.member("b", 65); env.member("z", 50)
    env.link("a", "b")
    r = env.post("a", "/alumni/meetups", {"title": "เลี้ยงสายปีใหม่", "starts_at": "2099-01-05T18:00:00+07:00",
                                          "place": "หมูกระทะหน้ามอ"})
    assert r.status_code == 200, r.text
    mid = r.json()["id"]
    assert r.json()["counts"]["going"] == 1
    assert run(env.db.alumni_notifications.count_documents({"user_id": "b", "kind": "meetup"})) == 1
    assert [m["id"] for m in env.get("b", "/alumni/meetups").json()["meetups"]] == [mid]
    assert env.get("z", "/alumni/meetups").json()["meetups"] == []
    assert env.post("z", f"/alumni/meetups/{mid}/rsvp", {"response": "going"}).status_code == 403
    r = env.post("b", f"/alumni/meetups/{mid}/rsvp", {"response": "maybe"}).json()
    assert r["my_rsvp"] == "maybe" and r["counts"]["maybe"] == 1
    assert env.post("b", f"/alumni/meetups/{mid}/rsvp", {"response": "??"}).status_code == 400
    assert env.post("b", f"/alumni/meetups/{mid}/cancel").status_code == 403
    assert env.post("a", f"/alumni/meetups/{mid}/cancel").json()["status"] == "cancelled"


# ------------------------------------------------------------ benefits

def test_benefits_defaults_audience_interests_admin_edit(env):
    env.admin()
    env.member("alum", 55, role="alumni"); env.member("stu", 67, role="current_student")
    cards_alum = env.get("alum", "/alumni/benefits").json()["cards"]
    ids = [c["id"] for c in cards_alum]
    assert {"research-tools", "publications", "people", "jobs", "mentor", "guest-speaker", "judge"} <= set(ids)
    assert {c["link"] for c in cards_alum if c["link"]} >= {"/market-research", "/publications", "/people", "/alumni/jobs"}
    stu_ids = {c["id"] for c in env.get("stu", "/alumni/benefits").json()["cards"]}
    assert "mentor" not in stu_ids and "publications" in stu_ids
    r = env.put("alum", "/alumni/benefits/interests", {"mentor": True, "judge": True}).json()
    assert r["interests"] == {"mentor": True, "guest_speaker": False, "judge": True}
    mentor = next(c for c in env.get("alum", "/alumni/benefits").json()["cards"] if c["id"] == "mentor")
    assert mentor["my_interest"] is True
    listed = env.get("admin", "/alumni/admin/interests", params={"key": "mentor"}).json()["members"]
    assert [m["user_id"] for m in listed] == ["alum"]
    bad = env.put("admin", "/alumni/benefits", {"cards": [{"title": "x", "link": "javascript:alert(1)"}]})
    assert bad.status_code == 400
    ok = env.put("admin", "/alumni/benefits", {"cards": [{"title": "ส่วนลดร้านศิษย์เก่า", "link": "https://example.org",
                                                          "audience": "all"}]})
    assert ok.status_code == 200
    assert [c["title"] for c in env.get("stu", "/alumni/benefits").json()["cards"]] == ["ส่วนลดร้านศิษย์เก่า"]


# ------------------------------------------------------------ phase2 compatibility

def test_mystery_match_uses_new_terms_and_skips_ghosts(env):
    env.member("me", 66); env.member("p1", 65); env.member("p2", 64); env.member("p3", 63, gender="f")
    env.link("me", "p1"); env.link("p1", "p2"); env.link("p2", "p3")
    env.ghost("p3", "ทวดลับ", 62)
    r = env.get("me", "/alumni/discover/mystery-match", params={"min_hops": 3, "max_hops": 6}).json()
    assert r["match"]["user_id"] == "p3"
    assert any("ย่าเทค" in x for x in r["reasons"])
