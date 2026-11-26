"""Inline images served as cacheable files — `lib/inline_media.py` + `/api/media`.

The pure tests cover the part that can lose data: the landing editor reads the
same document the homepage does and saves it back, so `externalize` and
`rehydrate` have to be exact inverses. If they are not, one save replaces every
hero image with a URL pointing at the field it just overwrote.

The integration tests need a server (`REACT_APP_BACKEND_URL`) and check that
the public endpoints no longer ship base64, that the URLs they ship resolve to
real image bytes, and that the response is cacheable.
"""
import base64
import os

import pytest
import requests

from lib.inline_media import (
    MIN_INLINE_BYTES,
    externalize,
    externalize_many,
    inline_image,
    parse_media_url,
    rehydrate,
)

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")

# A 1×1 PNG, repeated until it is unmistakably over the inlining threshold.
_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk"
    "YPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==")
BIG_B64 = base64.b64encode(_PNG * 400).decode()
BIG_URI = f"data:image/png;base64,{BIG_B64}"
SMALL_URI = "data:image/png;base64," + base64.b64encode(_PNG).decode()


# ---- pure: externalize ----

def test_large_data_uri_becomes_a_url():
    doc = {"key": "home", "slides": [{"image": BIG_URI, "title": "ก"}]}
    out = externalize(doc, "landing", "home")
    assert out["slides"][0]["image"].startswith("/api/media/landing/home?")
    assert out["slides"][0]["title"] == "ก"
    assert parse_media_url(out["slides"][0]["image"])[2] == "slides.0.image"


def test_small_image_is_left_inline():
    """Below the threshold a second request costs more than it saves."""
    assert len(SMALL_URI) < MIN_INLINE_BYTES
    out = externalize({"key": "home", "slides": [{"image": SMALL_URI}]},
                      "landing", "home")
    assert out["slides"][0]["image"] == SMALL_URI


def test_asset_object_keeps_its_other_fields():
    doc = {"identity": {"visual_assets": [
        {"kind": "logo", "mime_type": "image/png", "image_base64": BIG_B64,
         "label": "โลโก้หลัก"},
    ]}}
    asset = externalize(doc, "brand", "s1")["identity"]["visual_assets"][0]
    assert "image_base64" not in asset
    assert asset["kind"] == "logo" and asset["label"] == "โลโก้หลัก"
    assert parse_media_url(asset["image_url"])[2] == "identity.visual_assets.0"


def test_already_external_urls_are_untouched():
    """Forward-compatible with scripts/migrate_b64_to_storage.py."""
    doc = {"id": "p1", "cover_image": "/api/files/swumkt/cms-covers/x/y.png",
           "media": [{"src": "https://example.org/a.jpg"}]}
    assert externalize(doc, "post", "p1") == doc


def test_url_changes_when_the_image_does():
    """The hash is what lets the response claim `immutable`."""
    a = externalize({"cover_image": BIG_URI}, "post", "p1")["cover_image"]
    other = f"data:image/png;base64,{base64.b64encode(_PNG * 401).decode()}"
    b = externalize({"cover_image": other}, "post", "p1")["cover_image"]
    assert a != b


def test_input_document_is_not_mutated():
    doc = {"slides": [{"image": BIG_URI}]}
    externalize(doc, "landing", "home")
    assert doc["slides"][0]["image"] == BIG_URI


def test_dotted_keys_are_not_descended_into():
    """A path through such a key could not survive the round trip."""
    doc = {"a.b": {"image": BIG_URI}}
    assert externalize(doc, "landing", "home") == doc


def test_externalize_many_skips_documents_without_an_id():
    items = [{"id": "p1", "cover_image": BIG_URI}, {"cover_image": BIG_URI}]
    out = externalize_many(items, "post")
    assert out[0]["cover_image"].startswith("/api/media/")
    assert out[1]["cover_image"] == BIG_URI


# ---- pure: rehydrate (the save path) ----

def test_round_trip_restores_the_original_document():
    stored = {"key": "home", "slides": [
        {"image": BIG_URI, "title": "หนึ่ง"},
        {"image": SMALL_URI, "title": "สอง"},
    ]}
    assert rehydrate(externalize(stored, "landing", "home"), stored) == stored


def test_round_trip_restores_an_asset_object():
    stored = {"identity": {"visual_assets": [
        {"kind": "logo", "mime_type": "image/png", "image_base64": BIG_B64},
    ]}}
    assert rehydrate(externalize(stored, "brand", "s1"), stored) == stored


def test_reordered_slides_keep_their_own_images():
    """The field path is read from the URL, not from where the value now sits."""
    other_b64 = base64.b64encode(_PNG * 401).decode()
    stored = {"slides": [
        {"image": BIG_URI, "title": "หนึ่ง"},
        {"image": f"data:image/png;base64,{other_b64}", "title": "สอง"},
    ]}
    sent = externalize(stored, "landing", "home")
    sent["slides"].reverse()

    back = rehydrate(sent, stored)
    assert back["slides"][0] == {"image": stored["slides"][1]["image"], "title": "สอง"}
    assert back["slides"][1] == {"image": stored["slides"][0]["image"], "title": "หนึ่ง"}


def test_a_newly_uploaded_image_survives_the_save():
    stored = {"slides": [{"image": BIG_URI}]}
    fresh = f"data:image/png;base64,{base64.b64encode(_PNG * 402).decode()}"
    assert rehydrate({"slides": [{"image": fresh}]}, stored)["slides"][0]["image"] == fresh


def test_a_deleted_image_stays_deleted():
    stored = {"slides": [{"image": BIG_URI}]}
    assert rehydrate({"slides": [{"image": ""}]}, stored)["slides"][0]["image"] == ""


def test_a_url_pointing_nowhere_is_left_alone():
    """Nothing to restore — better a broken link than a wrong image."""
    sent = {"slides": [{"image": "/api/media/landing/home?f=slides.9.image&v=abc"}]}
    assert rehydrate(sent, {"slides": []}) == sent


def test_rehydrate_without_a_stored_document_is_a_no_op():
    sent = {"slides": [{"image": BIG_URI}]}
    assert rehydrate(sent, None) == sent


def test_foreign_urls_are_not_treated_as_ours():
    assert parse_media_url("https://example.org/a.png") is None
    assert parse_media_url("/api/files/swumkt/x/y.png") is None
    assert parse_media_url("/api/media/landing/home") is None  # no field


def test_non_image_values_are_not_mistaken_for_images():
    assert inline_image("data:text/html;base64,PGI+") is None
    assert inline_image({"image_base64": ""}) is None
    assert inline_image("หนึ่งสองสาม") is None
    assert inline_image(None) is None


# ---- integration: the live endpoints ----

pytestmark_integration = pytest.mark.skipif(
    not BASE_URL, reason="REACT_APP_BACKEND_URL not set")

PUBLIC_LISTS = [
    "/api/cms/landing",
    "/api/cms/posts/public",
    "/api/cms/announcements/pinned",
    "/api/brand-equity/showcase",
    "/api/showcase/index",
]


def _inline_images(node, path=""):
    """Every inline image in a response, by path — the library's own definition,
    so an empty `image_base64: null` is not mistaken for one."""
    if inline_image(node) is not None:
        yield path, node
        return
    if isinstance(node, dict):
        for k, v in node.items():
            yield from _inline_images(v, f"{path}.{k}")
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from _inline_images(v, f"{path}.{i}")


@pytestmark_integration
@pytest.mark.parametrize("path", PUBLIC_LISTS)
def test_public_lists_no_longer_carry_base64(path):
    r = requests.get(f"{BASE_URL}{path}", timeout=120)
    assert r.status_code == 200, r.text
    big = [p for p, v in _inline_images(r.json())
           if len(inline_image(v)[1]) >= MIN_INLINE_BYTES]
    assert not big, f"{path} still inlines {len(big)} image(s): {big[:3]}"


@pytestmark_integration
def test_a_published_media_url_serves_the_image():
    r = requests.get(f"{BASE_URL}/api/cms/landing", timeout=120)
    r.raise_for_status()
    urls = [s["image"] for s in (r.json().get("slides") or [])
            if str(s.get("image", "")).startswith("/api/media/")]
    if not urls:
        pytest.skip("no externalized hero image in this database")

    img = requests.get(f"{BASE_URL}{urls[0]}", timeout=60)
    assert img.status_code == 200
    assert img.headers["Content-Type"].startswith("image/")
    assert "immutable" in img.headers.get("Cache-Control", "")
    assert img.content[:4] in (b"\x89PNG", b"\xff\xd8\xff\xe0", b"\xff\xd8\xff\xe1",
                               b"RIFF", b"GIF8") or img.content.lstrip()[:4] == b"<svg"

    etag = img.headers.get("ETag")
    assert etag
    again = requests.get(f"{BASE_URL}{urls[0]}",
                         headers={"If-None-Match": etag}, timeout=60)
    assert again.status_code == 304


@pytestmark_integration
def test_media_route_refuses_a_path_that_is_not_an_image():
    r = requests.get(f"{BASE_URL}/api/media/landing/home",
                     params={"f": "updated_at"}, timeout=30)
    assert r.status_code == 404


@pytestmark_integration
def test_media_route_rejects_an_unknown_source():
    r = requests.get(f"{BASE_URL}/api/media/users/anyone",
                     params={"f": "password_hash"}, timeout=30)
    assert r.status_code == 404
