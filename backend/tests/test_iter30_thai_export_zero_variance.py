"""Iteration 30 — verify two fixes on old data:

  BUG 1: Brand Equity thesis-export previously returned HTTP 500 for any study
         whose brand name contained Thai characters (latin-1 header encoding).
         Fixed by ASCII-safe filename + RFC 5987 filename* extension.

  BUG 2: Segment-significance previously returned HTTP 500 when a demographic
         group had zero variance (Welch ANOVA -> NaN, non-JSON-serialisable).
         Fixed by _has_variance filter + fallback + _json_safe sanitiser.
"""
import io
import json
import math
import os
import re
from pathlib import Path
from urllib.parse import unquote

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
BASE_URL = base_url.rstrip("/")


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": "admin@swu.ac.th", "password": "admin123"},
                      timeout=30)
    if r.status_code != 200:
        pytest.fail(f"admin login failed {r.status_code}: {r.text[:400]}")
    tok = r.json().get("access_token") or r.json().get("token")
    if not tok:
        pytest.fail(f"no token in login response: {r.text[:400]}")
    return tok


@pytest.fixture(scope="session")
def auth(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def thai_brand_study_ids(auth):
    """Enumerate every study whose brand.name contains any Thai character."""
    r = requests.get(f"{BASE_URL}/api/brand-equity/studies", headers=auth, timeout=60)
    assert r.status_code == 200, r.text[:300]
    studies = r.json() if isinstance(r.json(), list) else r.json().get("studies", [])
    thai_re = re.compile(r"[\u0E00-\u0E7F]")
    picked = []
    for s in studies:
        brand = ((s.get("brand") or {}).get("name") or "").strip()
        sid = s.get("id") or s.get("_id") or s.get("study_id")
        if brand and sid and thai_re.search(brand):
            picked.append((sid, brand))
    # guaranteed to include demo-sim-chathai-001 per the user's context
    return picked


# ---------------------------------------------------------------------------
# BUG 1 — Thai-brand thesis export (Content-Disposition encoding)
# ---------------------------------------------------------------------------
class TestBug1ThaiThesisExport:
    def _assert_content_disposition_ok(self, cd, brand_name):
        assert cd, "missing Content-Disposition"
        # both legacy filename= AND RFC 5987 filename*= must exist
        assert re.search(r'filename="[^"]+\.docx"', cd), f"no ASCII filename= in {cd!r}"
        m = re.search(r"filename\*\s*=\s*UTF-8''([^;]+)", cd)
        assert m, f"no RFC 5987 filename* in {cd!r}"
        decoded = unquote(m.group(1))
        assert brand_name in decoded, f"brand {brand_name!r} not in filename* {decoded!r}"

    def _assert_docx_body(self, body):
        # DOCX = zip; python-docx must open it
        assert len(body) > 1000, f"suspiciously small body: {len(body)} bytes"
        assert body[:2] == b"PK", "not a zip/docx file"
        from docx import Document
        Document(io.BytesIO(body))  # raises on corruption

    def test_demo_sim_chathai_001(self, auth):
        sid = "demo-sim-chathai-001"
        r = requests.post(f"{BASE_URL}/api/brand-equity/studies/{sid}/thesis-export",
                          headers=auth, json={}, timeout=180)
        assert r.status_code == 200, f"{r.status_code}: {r.text[:400]}"
        self._assert_content_disposition_ok(r.headers.get("content-disposition", ""),
                                            "ชาไทยมะลิ")
        self._assert_docx_body(r.content)

    def test_zz_wavesig_export(self, auth):
        # brand: ZZ_WaveSigTest (ASCII) — control that non-Thai still works
        sid = "zz-wavesig-0001"
        r = requests.post(f"{BASE_URL}/api/brand-equity/studies/{sid}/thesis-export",
                          headers=auth, json={}, timeout=180)
        assert r.status_code == 200, f"{r.status_code}: {r.text[:400]}"
        cd = r.headers.get("content-disposition", "")
        assert re.search(r'filename="[^"]+\.docx"', cd), cd
        self._assert_docx_body(r.content)

    def test_all_thai_brand_studies_export_200(self, auth, thai_brand_study_ids):
        assert thai_brand_study_ids, "no Thai-brand studies discovered — precondition failed"
        failures = []
        for sid, brand in thai_brand_study_ids:
            r = requests.post(f"{BASE_URL}/api/brand-equity/studies/{sid}/thesis-export",
                              headers=auth, json={}, timeout=180)
            if r.status_code != 200:
                failures.append((sid, brand, r.status_code, r.text[:200]))
                continue
            cd = r.headers.get("content-disposition", "")
            if "filename*=UTF-8''" not in cd:
                failures.append((sid, brand, "no-filename*", cd[:200]))
                continue
            if r.content[:2] != b"PK":
                failures.append((sid, brand, "not-docx", ""))
        assert not failures, f"Thai-brand exports failed: {failures}"


# ---------------------------------------------------------------------------
# BUG 2 — Zero-variance groups in segment-significance (NaN JSON crash)
# ---------------------------------------------------------------------------
class TestBug2ZeroVarianceSegment:
    STUDIES = [
        "c5b3458f-b482-4859-ae15-b8c725e78d1c",
        "993a5ce4-88b1-4e90-82c9-46dd10a32cb6",
        "02a6ff40-9643-4350-835c-6949a3f5be33",
    ]
    FIELDS = ["gender", "age"]

    def _no_nan(self, obj, path="$"):
        if isinstance(obj, dict):
            for k, v in obj.items():
                self._no_nan(v, f"{path}.{k}")
        elif isinstance(obj, list):
            for i, v in enumerate(obj):
                self._no_nan(v, f"{path}[{i}]")
        elif isinstance(obj, float):
            assert math.isfinite(obj), f"non-finite float at {path}: {obj}"

    @pytest.mark.parametrize("study_id", STUDIES)
    @pytest.mark.parametrize("field", FIELDS)
    def test_segment_significance_200_and_json_clean(self, auth, study_id, field):
        r = requests.get(
            f"{BASE_URL}/api/brand-equity/studies/{study_id}/segment-significance",
            params={"field": field}, headers=auth, timeout=60,
        )
        if r.status_code == 404:
            pytest.skip(f"study {study_id} not seeded in this env")
        assert r.status_code == 200, f"{study_id}/{field}: {r.status_code} {r.text[:400]}"
        # raw body must be parseable and free of NaN/Infinity tokens
        raw = r.text
        assert "NaN" not in raw and "Infinity" not in raw, \
            f"non-JSON tokens present in body for {study_id}/{field}: {raw[:200]}"
        body = json.loads(raw)
        self._no_nan(body)

    def test_c5b3_gender_all_four_dimensions_present(self, auth):
        r = requests.get(
            f"{BASE_URL}/api/brand-equity/studies/"
            "c5b3458f-b482-4859-ae15-b8c725e78d1c/segment-significance",
            params={"field": "gender"}, headers=auth, timeout=60,
        )
        assert r.status_code == 200
        body = r.json()
        assert body.get("testable") is True
        by_dim = body.get("by_dimension") or {}
        # all four brand-equity dimensions must appear as keys
        for dim in ["awareness", "quality", "identity", "loyalty"]:
            assert dim in by_dim, f"missing dimension {dim} in {list(by_dim)}"

    def test_c5b3_gender_not_testable_carries_thai_reason(self, auth):
        r = requests.get(
            f"{BASE_URL}/api/brand-equity/studies/"
            "c5b3458f-b482-4859-ae15-b8c725e78d1c/segment-significance",
            params={"field": "gender"}, headers=auth, timeout=60,
        )
        body = r.json()
        by_dim = body["by_dimension"]
        # For every dimension marked not-testable, verify structured reason + Thai text
        allowed_reasons = {
            "zero_variance_in_group", "zero_variance", "test_not_computable",
            "too_few_respondents_per_group",
        }
        for dim, block in by_dim.items():
            if block.get("testable") is False:
                assert block.get("reason") in allowed_reasons, \
                    f"{dim} not-testable but reason={block.get('reason')}"
                interp = block.get("interpretation") or ""
                assert re.search(r"[\u0E00-\u0E7F]", interp), \
                    f"{dim} interpretation is not Thai: {interp!r}"
                # must NOT fabricate a p-value when not testable
                assert "p_value" not in block or block.get("p_value") is None
