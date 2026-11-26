"""API tests (mongomock + TestClient): tree vocabulary, ghosts, crowd
confirmation, conflicts, cycles, claim-on-arrival merge, permissions, privacy."""
from test_alumni_2026_11_support import env, run  # noqa: F401


# ------------------------------------------------------------ vocabulary in the tree

def test_tree_uses_new_vocabulary_and_gender(env):
    env.member("me", 66, "มี่")
    env.member("p1", 65, "เอ", gender="m")
    env.member("p2", 64, "บี", gender="f")
    env.member("p3", 63, "ซี")
    env.member("kid", 67, "คิด")
    env.link("me", "p1"); env.link("p1", "p2"); env.link("p2", "p3"); env.link("kid", "me")
    t = env.get("me", "/alumni/tree/me").json()
    terms = {a["user_id"]: a["relation"] for a in t["ancestors"]}
    assert terms == {"p1": "พี่เทค", "p2": "ป้าเทค", "p3": "ปู่/ย่าเทค"}
    assert t["descendants"][0]["relation"] == "น้องเทค"
    assert t["root"]["relation"] == "คุณ"
    assert t["empty_slots"]["up"] == {"distance": 4, "term": "ทวดเทค"}
    # from p2's point of view, "me" is two links below → หลานเทค
    t2 = env.get("me", "/alumni/tree/p2").json()
    assert {d["user_id"]: d["relation"] for d in t2["descendants"]}["me"] == "หลานเทค"


def test_kinship_settings_admin_and_line_override(env):
    env.member("me", 66); env.member("p1", 65); env.member("p2", 64, gender="m"); env.member("p3", 63, gender="m")
    env.link("me", "p1"); env.link("p1", "p2"); env.link("p2", "p3")
    env.admin()
    # members cannot change global terms
    assert env.put("me", "/alumni/kinship/settings", {"up": {"2": {"m": "ลุงใหญ่เทค"}}}).status_code == 403
    r = env.put("admin", "/alumni/kinship/settings", {"up": {"2": {"m": "ลุงใหญ่เทค"}}})
    assert r.status_code == 200, r.text
    assert env.put("admin", "/alumni/kinship/settings", {"up": {"2": ""}}).status_code == 400
    t = env.get("me", "/alumni/tree/me").json()
    assert {a["user_id"]: a["relation"] for a in t["ancestors"]}["p2"] == "ลุงใหญ่เทค"
    # p1 anchors a maternal override: applies to p1 and everyone below (me)
    r = env.put("p1", "/alumni/kinship/line-override", {"variant": "maternal"})
    assert r.status_code == 200, r.text
    t = env.get("me", "/alumni/tree/me").json()
    assert {a["user_id"]: a["relation"] for a in t["ancestors"]}["p3"] == "ตาเทค"
    # a member may not set an override anchored at someone else
    assert env.put("me", "/alumni/kinship/line-override", {"anchor_id": "p3", "variant": "maternal"}).status_code == 403
    s = env.get("me", "/alumni/kinship/settings").json()
    assert s["effective"]["variant"] == "maternal" and s["ladder"]
    assert env.get("me", "/alumni/kinship/term", params={"distance": -2}).json()["term"] == "หลานเทค"


# ------------------------------------------------------------ ghosts

def test_ghost_create_attach_and_members_only(env):
    env.member("me", 66, "มี่")
    out = env.ghost("me", "พี่หมู", 65, attach_as="senior")
    gid, rel = out["ghost"]["user_id"], out["relation"]
    assert gid.startswith("g_") and rel["status"] == "claimed"
    assert rel["from_user_id"] == "me" and rel["to_user_id"] == gid
    stored = run(env.db.alumni_ghosts.find_one({"id": gid}, {"_id": 0}))
    # minimal data only: no email / phone fields at all
    assert set(stored) <= {"id", "display_name", "gen", "student_id_prefix", "gender", "status",
                           "created_by", "created_at", "claimed_by_user_id"}
    # the claimed ghost shows in my tree as an unverified พี่เทค
    t = env.get("me", "/alumni/tree/me").json()
    a = t["ancestors"][0]
    assert a["is_ghost"] and a["relation"] == "พี่เทค" and a["link_status"] == "claimed" and not a["verified_link"]
    # a logged-in NON-member cannot read ghosts and sees no ghost names in trees
    env.user("outsider")
    assert env.get("outsider", f"/alumni/ghosts/{gid}").status_code == 403
    assert env.get(None, f"/alumni/ghosts/{gid}").status_code == 401
    # outsider has no profile → no tree of their own
    assert env.get("outsider", "/alumni/tree/me").status_code == 404
    # member "zed" (user id) viewed by the outsider: ghost name masked
    env.member("zed", 66, "เซด")
    env.ghost("zed", "พี่ลับ", 65)
    view = env.get("outsider", "/alumni/tree/zed").json()
    assert view["ancestors"][0]["name"] == "สมาชิกที่ยังไม่ลงทะเบียน"
    assert view["ancestors"][0]["created_by"] is None
    assert env.get("me", "/alumni/tree/zed").json()["ancestors"][0]["name"] == "พี่ลับ"
    # outsiders cannot open a ghost-rooted tree at all
    assert env.get("outsider", f"/alumni/tree/{gid}").status_code == 403


def test_ghost_validation_rejects_contact_data_and_bad_gen(env):
    env.member("me", 66)
    assert env.post("me", "/alumni/ghosts", {"display_name": "a@b.com", "gen": 60}).status_code == 422
    assert env.post("me", "/alumni/ghosts", {"display_name": "พี่ 0812345678", "gen": 60}).status_code == 422
    # a พี่เทค must be from an earlier cohort
    r = env.post("me", "/alumni/ghosts", {"display_name": "เพื่อน", "gen": 66, "attach": {"as": "senior"}})
    assert r.status_code == 400 and r.json()["detail"]["code"] == "gen_order"


def test_similar_ghost_dedupe_prompt(env):
    env.member("me", 66); env.member("friend", 66)
    env.ghost("me", "พี่หมู", 65)
    r = env.post("friend", "/alumni/ghosts", {"display_name": "หมู", "gen": 65, "attach": {"as": "senior"}})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "similar_ghosts"
    assert r.json()["detail"]["candidates"][0]["name"] == "พี่หมู"


def test_ghost_rate_limit(env):
    env.member("me", 66)
    for i in range(10):
        r = env.post("me", "/alumni/ghosts", {"display_name": f"คนที่{chr(0x0E01 + i)}", "gen": 50 + i, "force": True})
        assert r.status_code == 200, r.text
    r = env.post("me", "/alumni/ghosts", {"display_name": "เกิน", "gen": 40, "force": True})
    assert r.status_code == 429


def test_ghost_removal_rules_and_optout(env):
    env.member("me", 66); env.member("other", 66); env.member("p", 64)
    gid = env.ghost("me", "พี่ส้ม", 65)["ghost"]["user_id"]
    # someone else (not creator, not self-identifying) cannot remove
    assert env.post("other", f"/alumni/ghosts/{gid}/remove", {}).status_code == 403
    # once a second member links to it, the creator alone can no longer remove
    env.post("p", "/alumni/relations/claim", {"junior_id": gid, "senior_id": "p"})
    assert env.post("me", f"/alumni/ghosts/{gid}/remove", {}).status_code == 409
    # the person themself can always remove (PDPA), and ask not to be re-added
    r = env.post("other", f"/alumni/ghosts/{gid}/remove", {"self_identify": True, "do_not_readd": True,
                                                           "reason": "นี่คือฉัน ไม่ต้องการให้แสดง"})
    assert r.status_code == 200 and r.json()["relations_removed"] == 2
    g = run(env.db.alumni_ghosts.find_one({"id": gid}, {"_id": 0}))
    assert g["status"] == "removed" and g["display_name"] is None
    assert env.get("me", "/alumni/tree/me").json()["ancestors"] == []
    r = env.post("me", "/alumni/ghosts", {"display_name": "พี่ส้ม", "gen": 65, "force": True})
    assert r.status_code == 403 and r.json()["detail"]["code"] == "opted_out"
    audit = run(env.db.alumni_audit.find({"target_id": gid, "action": "ghost_remove"}).to_list(5))
    assert audit and audit[0]["meta"]["as"] == "self"


def test_admin_can_remove_any_ghost(env):
    env.member("me", 66); env.admin()
    gid = env.ghost("me", "พี่ส้ม", 65)["ghost"]["user_id"]
    assert env.post("admin", f"/alumni/ghosts/{gid}/remove", {"reason": "spam"}).status_code == 200


# ------------------------------------------------------------ vouching

def _setup_vouch(env):
    env.member("me", 66, "มี่")
    env.member("v1", 66, "วีหนึ่ง")          # same cohort as me
    env.member("v2", 66, "วีสอง")
    env.member("far", 50, "ไกล")             # unrelated
    out = env.ghost("me", "พี่หมู", 65)
    return out["ghost"]["user_id"], out["relation"]["id"]


def test_vouch_threshold_eligibility_and_xp(env):
    gid, rid = _setup_vouch(env)
    # claimant and ends cannot vouch; an unconnected member cannot vouch
    assert env.post("me", f"/alumni/relations/{rid}/vouch", {"vote": "yes"}).status_code == 403
    r = env.post("far", f"/alumni/relations/{rid}/vouch", {"vote": "yes"})
    assert r.status_code == 403 and r.json()["detail"]["code"] == "not_eligible"
    # prompts surface the claim to eligible members
    prompts = env.get("v1", "/alumni/vouch/prompts").json()["prompts"]
    assert [p["relation"]["id"] for p in prompts] == [rid]
    assert env.post("v1", f"/alumni/relations/{rid}/vouch", {"vote": "yes"}).json()["relation"]["status"] == "claimed"
    # voting twice the same way is a no-op, not a second vote
    assert env.post("v1", f"/alumni/relations/{rid}/vouch", {"vote": "yes"}).json()["changed"] is False
    r = env.post("v2", f"/alumni/relations/{rid}/vouch", {"vote": "yes"})
    assert r.json()["relation"]["status"] == "vouched"
    assert env.rel(rid)["decided_by"] == "crowd"
    xp = run(env.db.alumni_users.find_one({"user_id": "v1"}))["xp"]
    assert xp >= 3
    hist = env.get("v1", f"/alumni/relations/{rid}/history").json()
    assert len(hist["vouches"]) == 2 and any(e["action"] == "vouch_yes" for e in hist["events"])
    # vouched links count in the tree as verified
    assert env.get("me", "/alumni/tree/me").json()["ancestors"][0]["verified_link"] is True


def test_crowd_reject_and_mixed_votes_dispute(env):
    gid, rid = _setup_vouch(env)
    env.member("v3", 66)
    env.post("v1", f"/alumni/relations/{rid}/vouch", {"vote": "yes"})
    r = env.post("v2", f"/alumni/relations/{rid}/vouch", {"vote": "no"})
    assert r.json()["relation"]["status"] == "disputed"
    r = env.post("v1", f"/alumni/relations/{rid}/vouch", {"vote": "no"})   # changed mind
    assert r.json()["relation"]["status"] == "rejected"


def test_counterpart_answer_overrides_votes(env):
    env.member("me", 66, "มี่"); env.member("v1", 66); env.member("v2", 66)
    env.member("s", 65, "เอส")
    # third-party style: v1 and v2 vouch for me→s, but s says no → rejected and locked
    r = env.claim("me", "me", "s"); rid = r.json()["id"]
    env.post("v1", f"/alumni/relations/{rid}/vouch", {"vote": "yes"})
    assert env.post("v2", f"/alumni/relations/{rid}/vouch", {"vote": "yes"}).json()["relation"]["status"] == "vouched"
    r = env.respond("s", rid, False)
    assert r.json()["status"] == "rejected" and r.json()["decided_by"] == "counterpart"
    env.member("v3", 66)
    assert env.post("v3", f"/alumni/relations/{rid}/vouch", {"vote": "yes"}).status_code == 409
    # and an acceptance beats "no" votes
    env.member("s2", 64)
    rid2 = env.claim("me", "me", "s2").json()["id"]
    env.post("v1", f"/alumni/relations/{rid2}/vouch", {"vote": "no"})
    env.post("v2", f"/alumni/relations/{rid2}/vouch", {"vote": "no"})
    assert env.rel(rid2)["status"] == "rejected"
    assert env.respond("s2", rid2, True).json()["status"] == "confirmed"


def test_legacy_confirm_endpoint_still_works_and_pending_list(env):
    env.member("me", 66); env.member("s", 65)
    r = env.post("me", "/alumni/relations", {"to_user_id": "s", "kind": "take"})
    assert r.status_code == 200 and r.json()["status"] == "claimed"
    assert env.post("me", "/alumni/relations", {"to_user_id": "s", "kind": "take"}).status_code == 400
    pend = env.get("s", "/alumni/relations/pending").json()
    assert pend["total"] == 1 and pend["pending"][0]["my_role"] == "senior"
    assert pend["pending"][0]["from_profile"]["user_id"] == "me" and pend["pending"][0]["term"] == "น้องเทค"
    r = env.put("s", f"/alumni/relations/{pend['pending'][0]['id']}/confirm", {"accept": True})
    assert r.status_code == 200 and r.json()["status"] == "confirmed"
    assert env.get("s", "/alumni/relations/pending").json()["total"] == 0
    # XP for a confirmed link is awarded once per person
    xp_before = run(env.db.alumni_users.find_one({"user_id": "s"}))["xp"]
    env.put("s", f"/alumni/relations/{r.json()['id']}/confirm", {"accept": True})
    assert run(env.db.alumni_users.find_one({"user_id": "s"}))["xp"] == xp_before


def test_old_documents_keep_rendering(env):
    """Pre-2026-11 relation docs (status pending/confirmed, no new fields)."""
    env.member("me", 66); env.member("s", 65); env.member("g", 64)
    run(env.db.alumni_relations.insert_many([
        {"id": "old1", "from_user_id": "me", "to_user_id": "s", "kind": "take", "status": "confirmed",
         "confirmed_by_from": True, "confirmed_by_to": True, "derived": False, "primary": True,
         "created_by": "me", "created_at": "2026-04-20T00:00:00+00:00", "confirmed_at": "2026-04-21T00:00:00+00:00"},
        {"id": "old2", "from_user_id": "s", "to_user_id": "g", "kind": "take", "status": "pending",
         "confirmed_by_from": True, "confirmed_by_to": False, "derived": False, "primary": True,
         "created_by": "s", "created_at": "2026-04-20T00:00:00+00:00", "confirmed_at": None},
    ]))
    t = env.get("me", "/alumni/tree/me").json()
    assert [a["user_id"] for a in t["ancestors"]] == ["s"]           # pending is not established
    assert env.get("g", "/alumni/relations/pending").json()["pending"][0]["status"] == "claimed"
    assert env.put("g", "/alumni/relations/old2/confirm", {"accept": True}).json()["status"] == "confirmed"
    t = env.get("me", "/alumni/tree/me").json()
    assert [(a["user_id"], a["relation"]) for a in t["ancestors"]] == [("s", "พี่เทค"), ("g", "ลุง/ป้าเทค")]


# ------------------------------------------------------------ conflicts & cycles

def test_conflicting_parent_claims_are_disputed_and_resolved(env):
    env.member("a", 66, "เอ"); env.member("b", 66, "บี"); env.member("v1", 66); env.member("v2", 66)
    env.member("me", 64)
    gj = env.ghost("me", "น้องเจ", 65, attach_as=None)["ghost"]["user_id"]
    # two different members claim two different พี่เทค for the same ghost junior
    env.member("s1", 63); env.member("s2", 63)
    r1 = env.claim("s1", gj, "s1"); r2 = env.claim("s2", gj, "s2")
    assert r1.status_code == 200 and r2.status_code == 200
    assert env.rel(r1.json()["id"])["status"] == "disputed"
    assert env.rel(r2.json()["id"])["status"] == "disputed"
    # crowd rejects one → the other is no longer in conflict
    env.member("c1", 65); env.member("c2", 65)
    env.post("c1", f"/alumni/relations/{r2.json()['id']}/vouch", {"vote": "no"})
    env.post("c2", f"/alumni/relations/{r2.json()['id']}/vouch", {"vote": "no"})
    assert env.rel(r2.json()["id"])["status"] == "rejected"
    rel1 = env.rel(r1.json()["id"])
    assert rel1["conflict"] is False and rel1["status"] == "claimed"


def test_real_junior_can_have_two_affirmed_parents(env):
    env.member("me", 66); env.member("s1", 65); env.member("s2", 64)
    r1 = env.claim("me", "me", "s1").json(); r2 = env.claim("me", "me", "s2").json()
    assert env.rel(r1["id"])["status"] == "claimed" and env.rel(r2["id"])["status"] == "claimed"
    env.respond("s1", r1["id"]); env.respond("s2", r2["id"])
    assert env.rel(r1["id"])["status"] == env.rel(r2["id"])["status"] == "confirmed"
    # junior picks a primary
    assert env.put("me", f"/alumni/relations/{r2['id']}/primary").status_code == 200
    assert env.put("s1", f"/alumni/relations/{r2['id']}/primary").status_code == 403


def test_cycles_impossible(env):
    env.member("a", 66); env.member("b", 65); env.member("c", 64)
    env.link("a", "b"); env.link("b", "c")
    # c claiming a as its พี่เทค would loop a→b→c→a (gen check off on legacy path)
    r = env.post("c", "/alumni/relations", {"to_user_id": "a", "kind": "take"})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "cycle"
    # pending (unconfirmed) links also count for cycle prevention
    env.member("d", 63)
    env.claim("c", "c", "d")
    assert env.post("d", "/alumni/relations", {"to_user_id": "a", "kind": "take"}).status_code == 409
    assert env.post("a", "/alumni/relations", {"to_user_id": "a", "kind": "take"}).status_code == 400


def test_third_party_claim_permissions(env):
    env.member("me", 66); env.member("p", 65); env.member("stranger", 40)
    env.link("me", "p")
    gid = env.ghost("me", "ลุงเก่า", 64, attach_as="senior", to="p")["ghost"]["user_id"]   # me adds p's พี่เทค
    rel = run(env.db.alumni_relations.find_one({"to_user_id": gid}))
    assert rel["from_user_id"] == "p" and rel["created_by"] == "me"
    # p (a real end) is asked to answer
    assert env.get("p", "/alumni/relations/pending").json()["total"] == 1
    # third parties can never link two REAL members
    env.member("q", 64)
    r = env.claim("me", "p", "q")
    assert r.status_code == 403
    # an unconnected stranger cannot attach things to my ghost
    r = env.post("stranger", "/alumni/ghosts", {"display_name": "อะไร", "gen": 30, "force": True,
                                                "attach": {"as": "senior", "to": gid}})
    assert r.status_code == 403


# ------------------------------------------------------------ claim on arrival (merge)

def test_invite_attached_to_ghost_merges_on_claim(env):
    env.member("me", 66, "มี่"); env.member("v1", 66); env.member("v2", 66); env.member("kid", 67)
    out = env.ghost("me", "พี่หมู", 65)
    gid, rid = out["ghost"]["user_id"], out["relation"]["id"]
    env.link("kid", "me")
    # someone else adds the ghost's own พี่เทค (third party, connected via me)
    up = env.ghost("me", "ลุงแดง", 64, attach_as="senior", to=gid)["relation"]["id"]
    env.post("v1", f"/alumni/relations/{rid}/vouch", {"vote": "yes"})
    env.post("v2", f"/alumni/relations/{rid}/vouch", {"vote": "yes"})
    assert env.rel(rid)["status"] == "vouched"
    inv = env.post("me", f"/alumni/ghosts/{gid}/invite", {"clue": "ชอบหมูกระทะ"}).json()
    assert inv["ghost_id"] == gid and inv["invitee_email"] is None and inv["reveal_game"] is True
    assert inv["relation_hint"] == "พี่เทค" and inv["inviter_term_for_invitee"] == "น้องเทค"
    # the real person registers and accepts
    env.member("moo", 65, "หมู")
    acc = env.post("moo", f"/alumni/invites/accept/{inv['code']}").json()
    assert acc["ghost_claim"]["ghost_id"] == gid and acc["relation_pending"] is False
    assert acc["inviter_id"] is None and acc["reveal_pending"] is True
    prev = env.get("moo", f"/alumni/invites/{inv['code']}/claim-preview").json()
    assert prev["ghost"]["display_name"] == "พี่หมู" and len(prev["links"]) == 2
    vouches_before = run(env.db.alumni_vouches.count_documents({}))
    r = env.post("moo", f"/alumni/ghosts/{gid}/claim", {"invite_code": inv["code"], "confirm_relation_ids": [rid]})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "merged"
    rel = env.rel(rid)
    assert rel["to_user_id"] == "moo" and rel["status"] == "confirmed" and rel["merged_from_ghost"] == gid
    assert env.rel(up)["from_user_id"] == "moo"
    assert run(env.db.alumni_vouches.count_documents({})) == vouches_before   # nothing lost or duplicated
    assert run(env.db.alumni_relations.count_documents({"$or": [{"from_user_id": gid}, {"to_user_id": gid}]})) == 0
    assert run(env.db.alumni_ghosts.find_one({"id": gid}))["status"] == "claimed"
    # the tree now shows the real member
    t = env.get("kid", "/alumni/tree/me").json()
    assert [(a["user_id"], a["relation"]) for a in t["ancestors"]][:2] == [("me", "พี่เทค"), ("moo", "ลุง/ป้าเทค")]
    # claiming twice is idempotent / refused for others
    assert env.post("moo", f"/alumni/ghosts/{gid}/claim", {"invite_code": inv["code"]}).status_code == 404
    # lineage recorded
    moo = run(env.db.alumni_users.find_one({"user_id": "moo"}))
    assert moo["invited_by"] == "me" and moo["invite_depth"] == 1


def test_merge_folds_duplicate_links_and_voids_own_votes(env):
    env.member("me", 66); env.member("x", 65, "เอ็กซ์")
    gid = env.ghost("me", "เอ็กซ์", 65)["ghost"]["user_id"]
    rid_ghost = run(env.db.alumni_relations.find_one({"to_user_id": gid}))["id"]
    # x votes on the ghost link before arriving as themself → vote void after merge
    env.post("x", f"/alumni/relations/{rid_ghost}/vouch", {"vote": "yes"})
    # me ALSO claimed x directly → after merge both links are me→x: fold into one
    rid_real = env.claim("me", "me", "x").json()["id"]
    inv = env.post("me", f"/alumni/ghosts/{gid}/invite", {}).json()
    env.post("x", f"/alumni/invites/accept/{inv['code']}")
    r = env.post("x", f"/alumni/ghosts/{gid}/claim", {"invite_code": inv["code"]})
    assert r.status_code == 200, r.text
    live = run(env.db.alumni_relations.find({"from_user_id": "me", "to_user_id": "x",
                                             "status": {"$nin": ["removed", "rejected"]}}).to_list(10))
    assert [l["id"] for l in live] == [rid_real]
    assert run(env.db.alumni_relations.find_one({"id": rid_ghost}))["merged_into_relation"] == rid_real
    assert run(env.db.alumni_vouches.count_documents({"voter_id": "x"})) == 0


def test_merge_refuses_cycle(env):
    env.member("a", 66); env.member("b", 65)
    env.link("a", "b")
    # ghost G placed BELOW a; then G's invite is claimed by b (b is a's พี่เทค) → would loop b→…
    gid = env.ghost("a", "น้องจี", 67, attach_as="junior")["ghost"]["user_id"]
    inv = env.post("a", f"/alumni/ghosts/{gid}/invite", {}).json()
    env.post("b", f"/alumni/invites/accept/{inv['code']}")
    r = env.post("b", f"/alumni/ghosts/{gid}/claim", {"invite_code": inv["code"]})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "cycle"
    assert run(env.db.alumni_ghosts.find_one({"id": gid}))["status"] == "active"   # rolled back


def test_claim_without_invite_needs_connected_approval(env):
    env.member("me", 66, "มี่"); env.member("other", 66)
    gid = env.ghost("me", "พี่หมู", 65)["ghost"]["user_id"]
    env.member("moo", 65, "หมู", name="หมู ใจดี")
    sug = env.get("moo", "/alumni/ghost-suggestions").json()["suggestions"]
    assert [s["user_id"] for s in sug] == [gid]
    r = env.post("moo", f"/alumni/ghosts/{gid}/claim", {"confirm_all": True})
    assert r.json()["status"] == "pending_approval"
    cid = r.json()["claim"]["id"]
    # wrong cohort cannot even request
    env.member("old", 50)
    assert env.post("old", f"/alumni/ghosts/{gid}/claim", {}).status_code == 400
    # an unconnected member cannot approve; the connected member can
    assert env.post("other", f"/alumni/ghost-claims/{cid}/decide", {"approve": True}).status_code == 403
    assert env.post("moo", f"/alumni/ghost-claims/{cid}/decide", {"approve": True}).status_code == 403
    assert [c["id"] for c in env.get("me", "/alumni/ghost-claims/pending").json()["claims"]] == [cid]
    r = env.post("me", f"/alumni/ghost-claims/{cid}/decide", {"approve": True})
    assert r.status_code == 200 and r.json()["status"] == "merged"
    rel = run(env.db.alumni_relations.find_one({"from_user_id": "me", "to_user_id": "moo"}))
    assert rel["status"] == "confirmed"          # confirm_all → moo confirmed on merge
    actions = {a["action"] for a in run(env.db.alumni_audit.find({"target_id": gid}).to_list(50))}
    assert {"ghost_create", "ghost_claim_request", "ghost_claim_approve", "ghost_merge"} <= actions


def test_admin_only_endpoints(env):
    env.member("me", 66)
    for method, path, body in [
        ("get", "/alumni/admin/invite-funnel", None), ("get", "/alumni/admin/audit", None),
        ("put", "/alumni/admin/cohort-sizes", {"sizes": {"66": 100}}), ("put", "/alumni/benefits", {"cards": []}),
        ("get", "/alumni/admin/interests", None), ("put", "/alumni/admin/relations/x/decide", {"decision": "confirm"}),
    ]:
        r = getattr(env, method)("me", path, **({"json": body} if body is not None else {}))
        assert r.status_code == 403, (path, r.status_code)


def test_admin_decide_relation(env):
    env.member("me", 66); env.admin()
    rid = env.ghost("me", "พี่หมู", 65)["relation"]["id"]
    r = env.put("admin", f"/alumni/admin/relations/{rid}/decide", {"decision": "reject"})
    assert r.json()["status"] == "rejected" and r.json()["decided_by"] == "admin"
