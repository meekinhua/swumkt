"""Faculty profiles and publications — `routes/faculty.py`, the share bridge,
the sitemap, and the seed.

The rule that matters most is that nothing held for review reaches the public:
the seed came from an automated index, which garbles Thai titles and files
supervised student theses under the advisor, and the subject is a real
person's academic record. Several tests below exist only to pin that.

Integration tests need a running server with the seed loaded
(`backend/scripts/seed_faculty.py`); they skip otherwise.
"""
import json
import os
import re
import sys
from pathlib import Path

import pytest
import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from routes.faculty import _clean_doi, display_name, slugify  # noqa: E402

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
SEED = Path(__file__).resolve().parents[1] / "data" / "faculty_seed.json"
THAI = re.compile(r"[฀-๿]")


# ---- pure ------------------------------------------------------------------

def test_thai_titles_run_into_the_name_as_the_department_writes_them():
    assert display_name({"title_th": "ผู้ช่วยศาสตราจารย์", "name_th": "กนกกาญจน์ บัญชาบุษบง"}) \
        == "ผู้ช่วยศาสตราจารย์กนกกาญจน์ บัญชาบุษบง"
    assert display_name({"title_th": "รองศาสตราจารย์ ดร.", "name_th": "อินทกะ พิริยะกุล"}) \
        == "รองศาสตราจารย์ ดร.อินทกะ พิริยะกุล"


def test_english_titles_are_separated_from_the_name():
    assert display_name({"title_en": "Associate Professor Dr.", "name_en": "Intaka Piriyakul"},
                        "en") == "Associate Professor Dr. Intaka Piriyakul"


def test_a_missing_title_leaves_just_the_name():
    assert display_name({"name_th": "ภูมิภักดิ์ คูสวัสดิ์"}) == "ภูมิภักดิ์ คูสวัสดิ์"


@pytest.mark.parametrize("raw,clean", [
    ("10.1016/J.CHBR.2024.100523", "10.1016/j.chbr.2024.100523"),
    ("https://doi.org/10.1108/sjme-06-2021-0116", "10.1108/sjme-06-2021-0116"),
    ("http://dx.doi.org/10.3390/bs13030270", "10.3390/bs13030270"),
    ("doi: 10.1057/s41270-021-00124-9", "10.1057/s41270-021-00124-9"),
    ("", None), (None, None),
])
def test_dois_are_stored_bare_and_lowercase(raw, clean):
    """So the same paper pasted two ways is recognised as one."""
    assert _clean_doi(raw) == clean


def test_slugs_are_ascii_and_fall_back_for_thai():
    assert slugify("Cross-cultural electronic word-of-mouth", "x") \
        == "cross-cultural-electronic-word-of-mouth"
    assert slugify("การตลาด", "fallback") == "fallback"


# ---- the seed file ---------------------------------------------------------

@pytest.fixture(scope="module")
def seed():
    return json.loads(SEED.read_text(encoding="utf-8"))


def test_seed_has_the_four_requested_lecturers(seed):
    names = {f["name_th"] for f in seed["faculty"]}
    assert names == {"อินทกะ พิริยะกุล", "วรินรำไพ รุ่งเรืองจิตต์",
                     "ภูมิภักดิ์ คูสวัสดิ์", "กนกกาญจน์ บัญชาบุษบง"}


def test_seed_titles_match_the_department_page(seed):
    """Verbatim from bas.swu.ac.th/faculty/marketing-management, 27 Oct 2026."""
    shown = {display_name(f) for f in seed["faculty"]}
    assert "รองศาสตราจารย์ ดร.อินทกะ พิริยะกุล" in shown
    assert "รองศาสตราจารย์ ดร.วรินรำไพ รุ่งเรืองจิตต์" in shown
    assert "ดร.ภูมิภักดิ์ คูสวัสดิ์" in shown
    assert "ผู้ช่วยศาสตราจารย์กนกกาญจน์ บัญชาบุษบง" in shown


def test_no_garbled_thai_title_is_published_by_the_seed(seed):
    """The index drops Thai vowel and tone marks; those must wait for a person."""
    for p in seed["papers"]:
        if THAI.search(p["title"]):
            assert p["status"] == "review", p["title"]


def test_capitalised_no_doi_records_are_held(seed):
    """The supervised-thesis pattern: ALL CAPS, no DOI."""
    for p in seed["papers"]:
        if p["title"].isupper() and not p.get("doi"):
            assert p["status"] == "review", p["title"]


def test_every_published_paper_has_a_way_to_read_it(seed):
    for p in seed["papers"]:
        if p["status"] == "published":
            assert p.get("url") or p.get("doi"), p["title"]


def test_a_co_authored_paper_is_one_record(seed):
    shared = [p for p in seed["papers"] if "virtual-influencer" in p["title"]]
    assert len(shared) == 1
    assert set(shared[0]["faculty_ids"]) == {"fac-intaka-piriyakul",
                                             "fac-warinrampai-rungruangjit"}


def test_every_paper_belongs_to_a_seeded_lecturer(seed):
    ids = {f["id"] for f in seed["faculty"]}
    for p in seed["papers"]:
        assert p["faculty_ids"] and set(p["faculty_ids"]) <= ids


def test_the_seed_writes_no_biography_it_cannot_source(seed):
    """Bios are the lecturers' to write. The seed states rank and department
    only — what the department page itself says."""
    for f in seed["faculty"]:
        assert f["bio_th"].startswith(f["rank_th"])
        assert "มหาวิทยาลัยศรีนครินทรวิโรฒ" in f["bio_th"]
        assert len(f["bio_th"]) < 160


# ---- integration -----------------------------------------------------------

needs_server = pytest.mark.skipif(not BASE_URL, reason="REACT_APP_BACKEND_URL not set")


def _get(path):
    r = requests.get(f"{BASE_URL}{path}", timeout=60)
    return r


@pytest.fixture(scope="module")
def seeded():
    if not BASE_URL:
        pytest.skip("no server")
    r = _get("/api/faculty")
    if r.status_code != 200 or not r.json().get("items"):
        pytest.skip("faculty seed not loaded — run scripts/seed_faculty.py")
    return r.json()["items"]


@needs_server
def test_the_public_list_shows_only_published_faculty(seeded):
    assert all(f.get("status") == "published" for f in seeded)


@needs_server
def test_no_held_paper_leaks_into_any_public_endpoint(seeded):
    for f in seeded:
        prof = _get(f"/api/faculty/{f['slug']}").json()
        for p in prof["papers"]:
            assert p["status"] == "published", p["title"]
            assert "review_note" not in p
    pubs = _get("/api/publications").json()["items"]
    assert all(p["status"] == "published" for p in pubs)
    assert not any(THAI.search(p["title"]) and "ปจจย" in p["title"] for p in pubs)


@needs_server
def test_a_profile_links_its_co_authors(seeded):
    prof = _get("/api/faculty/intaka-piriyakul").json()
    assert "fac-warinrampai-rungruangjit" in prof["colleagues"]
    assert prof["colleagues"]["fac-warinrampai-rungruangjit"]["name_en"] \
        == "Warinrampai Rungruangjit"


@needs_server
def test_an_unknown_slug_is_404():
    assert _get("/api/faculty/no-such-person").status_code == 404
    assert _get("/api/share/people/no-such-person").status_code == 404


@needs_server
def test_the_share_bridge_emits_a_linked_person_graph(seeded):
    html = _get("/api/share/people/warinrampai-rungruangjit").text
    assert re.search(r'rel="canonical" href="[^"]+/people/warinrampai-rungruangjit"', html)
    ld = json.loads(re.search(r'application/ld\+json">(.*?)</script>', html, re.S)
                    .group(1).replace("<\\/", "</"))
    graph = ld["@graph"]
    types = [g["@type"] for g in graph]
    assert {"ProfilePage", "Person", "BreadcrumbList"} <= set(types)
    assert "ScholarlyArticle" in types
    person = next(g for g in graph if g["@type"] == "Person")
    assert any("orcid.org" in s for s in person["sameAs"])
    # The shared paper names both lecturers by @id, not as loose strings.
    shared = next(g for g in graph if g["@type"] == "ScholarlyArticle"
                  and "virtual-influencer" in g["headline"])
    ids = [a.get("@id", "") for a in shared["author"]]
    assert any(i.endswith("/people/intaka-piriyakul#person") for i in ids)
    assert any(i.endswith("/people/warinrampai-rungruangjit#person") for i in ids)


@needs_server
def test_the_sitemap_lists_people_and_now_actually_lists_showcases(seeded):
    xml = _get("/api/share/sitemap.xml").text
    for f in seeded:
        assert f"/people/{f['slug']}</loc>" in xml
    assert "/people</loc>" in xml and "/publications</loc>" in xml
    # Regression: the first version filtered on a field neither collection
    # has, so no showcase was ever listed.
    pub_brand = requests.get(f"{BASE_URL}/api/brand-equity/showcase", timeout=60).json()
    if pub_brand.get("showcases"):
        assert "/showcase/" in xml


@needs_server
def test_publications_never_live_under_the_robots_disallowed_research_path():
    robots = requests.get(f"{BASE_URL}/robots.txt", timeout=30).text
    assert "Disallow: /research/" in robots
    assert _get("/api/publications").status_code == 200


@needs_server
def test_faculty_writes_require_admin():
    assert requests.patch(f"{BASE_URL}/api/cms/faculty/fac-intaka-piriyakul",
                          json={"bio_th": "x"}, timeout=30).status_code in (401, 403)
    assert requests.post(f"{BASE_URL}/api/cms/papers",
                         json={"title": "x"}, timeout=30).status_code in (401, 403)


@needs_server
def test_the_crawler_bridge_does_not_publish_the_email_the_page_hides(seeded):
    """The profile obfuscates the address in its HTML; the bridge is the page
    crawlers read most, so it must not hand the address over in JSON-LD."""
    for f in seeded:
        html = _get(f"/api/share/people/{f['slug']}").text
        assert "@g.swu.ac.th" not in html, f["slug"]


# ---- regressions from the adversarial review --------------------------------

def _admin_headers():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": os.environ.get("SWUMKT_ADMIN_EMAIL", "admin@swu.ac.th"),
                            "password": os.environ.get("SWUMKT_ADMIN_PW", "admin123")},
                      timeout=60)
    if r.status_code != 200:
        pytest.skip("no admin account")
    return {"Authorization": f"Bearer {r.json()['access_token']}",
            "Content-Type": "application/json"}


@needs_server
def test_robots_lets_crawlers_fetch_what_the_pages_render_from():
    """A blanket Disallow: /api/ meant Googlebot rendered every SPA page empty."""
    robots = requests.get(f"{BASE_URL}/robots.txt", timeout=30).text
    for path in ("/api/faculty", "/api/publications", "/api/cms/landing",
                 "/api/cms/posts/public", "/api/showcase/index"):
        assert f"Allow: {path}" in robots, path
    assert "Disallow: /api/faculty/*/contact" in robots
    assert "Disallow: /api/" in robots


@needs_server
def test_api_json_is_fetchable_but_not_indexable():
    r = _get("/api/faculty")
    assert r.headers.get("X-Robots-Tag") == "noindex"
    # The bridge carries a canonical instead; Google advises not to pair it
    # with noindex.
    assert "X-Robots-Tag" not in _get("/api/share/people/intaka-piriyakul").headers


@needs_server
def test_no_public_listing_contains_an_email_address(seeded):
    """robots.txt now lets crawlers fetch this JSON; it must not be an address book."""
    assert "@g.swu.ac.th" not in _get("/api/faculty").text
    for f in seeded:
        assert "@g.swu.ac.th" not in _get(f"/api/faculty/{f['slug']}").text
    assert all(f.get("has_email") for f in seeded)


@needs_server
def test_the_address_is_available_on_request(seeded):
    r = _get("/api/faculty/intaka-piriyakul/contact")
    assert r.status_code == 200 and r.json()["email"].endswith("@g.swu.ac.th")


@needs_server
def test_unpublishing_a_lecturer_takes_their_papers_off_the_public_list(seeded):
    h = _admin_headers()
    fid = "fac-kanokkan-bunchabusabong"
    before = {p["id"] for p in _get("/api/publications").json()["items"]
              if fid in p["faculty_ids"]}
    assert before, "seed should give this lecturer published papers"
    requests.patch(f"{BASE_URL}/api/cms/faculty/{fid}", json={"status": "draft"},
                   headers=h, timeout=60)
    try:
        after = _get("/api/publications").json()["items"]
        assert not ({p["id"] for p in after} & before)
        assert not any(fid in p["faculty_ids"] for p in after)
    finally:
        requests.patch(f"{BASE_URL}/api/cms/faculty/{fid}", json={"status": "published"},
                       headers=h, timeout=60)


@needs_server
def test_a_lecturer_without_an_english_name_does_not_break_the_bridge(seeded):
    """KeyError on name_en used to 500 the bridge for them and every co-author."""
    h = _admin_headers()
    r = requests.post(f"{BASE_URL}/api/cms/faculty",
                      json={"name_th": "ทดสอบ ไม่มีชื่ออังกฤษ", "slug": "pytest-th-only",
                            "status": "published"}, headers=h, timeout=60)
    assert r.status_code == 200, r.text
    fid = r.json()["id"]
    assert not fid.endswith("pytest-th-only"), "id must not be derived from the slug"
    shared = next(p for p in _get("/api/publications").json()["items"]
                  if "virtual-influencer" in p["title"])
    ids = list(shared["faculty_ids"])
    try:
        requests.patch(f"{BASE_URL}/api/cms/papers/{shared['id']}",
                       json={"faculty_ids": ids + [fid]}, headers=h, timeout=60)
        requests.post(f"{BASE_URL}/api/cms/cache/flush", headers=h, timeout=30)
        for slug in ("pytest-th-only", "intaka-piriyakul", "warinrampai-rungruangjit"):
            assert _get(f"/api/share/people/{slug}").status_code == 200, slug
    finally:
        requests.patch(f"{BASE_URL}/api/cms/papers/{shared['id']}",
                       json={"faculty_ids": ids}, headers=h, timeout=60)
        requests.delete(f"{BASE_URL}/api/cms/faculty/{fid}", headers=h, timeout=60)


@needs_server
def test_a_freed_slug_can_be_reused(seeded):
    """The id used to be fac-{slug}, so re-creating a deleted slug collided (500)."""
    h = _admin_headers()
    body = {"name_en": "Pytest Reuse", "slug": "pytest-reuse"}
    a = requests.post(f"{BASE_URL}/api/cms/faculty", json=body, headers=h, timeout=60)
    assert a.status_code == 200, a.text
    requests.delete(f"{BASE_URL}/api/cms/faculty/{a.json()['id']}", headers=h, timeout=60)
    b = requests.post(f"{BASE_URL}/api/cms/faculty", json=body, headers=h, timeout=60)
    assert b.status_code == 200, b.text
    requests.delete(f"{BASE_URL}/api/cms/faculty/{b.json()['id']}", headers=h, timeout=60)


@needs_server
def test_a_patch_cannot_give_two_papers_the_same_doi(seeded):
    h = _admin_headers()
    papers = [p for p in _get("/api/publications").json()["items"] if p.get("doi")]
    a, b = papers[0], papers[1]
    r = requests.patch(f"{BASE_URL}/api/cms/papers/{b['id']}",
                       json={"doi": f"https://doi.org/{a['doi'].upper()}"},
                       headers=h, timeout=60)
    assert r.status_code == 409


@pytest.mark.parametrize("body", [
    {"slug": "Has Spaces"}, {"slug": "../x"}, {"links": "not-an-object"},
    {"links": {"orcid": "javascript:alert(1)"}}, {"links": {"myspace": "https://x"}},
    {"research_areas": "marketing"}, {"research_areas": [{"fr": "x"}]},
    {"show_email": "yes"},
])
@needs_server
def test_malformed_profile_values_are_refused(seeded, body):
    """The bridge and the page index into these; bad shapes were a 500 there."""
    r = requests.patch(f"{BASE_URL}/api/cms/faculty/fac-poompak-kusawat", json=body,
                       headers=_admin_headers(), timeout=60)
    assert r.status_code == 400, (body, r.status_code, r.text[:200])


@needs_server
def test_publication_years_do_not_collapse_to_the_selected_year(seeded):
    all_years = _get("/api/publications").json()["years"]
    picked = _get(f"/api/publications?year={all_years[-1]}").json()
    assert picked["years"] == all_years


@needs_server
def test_public_post_does_not_expose_raw_faculty_ids():
    r = _get("/api/cms/posts/public/by-slug/perf-post-0")
    if r.status_code != 200:
        pytest.skip("test post not present")
    assert "author_faculty_ids" not in r.json()


@needs_server
def test_the_setup_seed_endpoint_dry_run_reports_without_writing(seeded):
    h = _admin_headers()
    before = _get("/api/faculty").json()["total"]
    r = requests.post(f"{BASE_URL}/api/cms/faculty/seed", params={"dry_run": "true"},
                      headers=h, timeout=60)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["dry_run"] is True
    assert body["seed_public_papers"] == 30 and body["seed_review_papers"] == 17
    assert _get("/api/faculty").json()["total"] == before


@needs_server
def test_the_setup_seed_endpoint_needs_a_signed_in_admin():
    assert requests.post(f"{BASE_URL}/api/cms/faculty/seed", timeout=30).status_code in (401, 403)
