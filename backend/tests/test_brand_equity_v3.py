"""Brand Equity v3 — Association + Radar + Perceptual Map backend tests."""
import os
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL")
            or "https://soft-delete-conjoint.preview.emergentagent.com").rstrip("/")
ADMIN = {"email": "admin@swu.ac.th", "password": "admin123"}


@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def v3_study(admin_headers):
    payload = {
        "brand": {
            "name": "TEST_V3Brand",
            "category": "กาแฟ",
            "competitors": ["Starbucks", "Inthanin", "CafeAmazon"],
        },
        "identity": {
            "traits": ["Modern", "Premium", "Artisanal"],
            "brand_promise": "กาแฟพิเศษในแต่ละแก้ว",
            "pricing_tier": "premium",
        },
        "target_responses": 50,
    }
    r = requests.post(f"{BASE_URL}/api/brand-equity/studies",
                      json=payload, headers=admin_headers, timeout=20)
    assert r.status_code == 200, r.text
    study = r.json()
    yield study
    # Cleanup
    requests.delete(f"{BASE_URL}/api/brand-equity/studies/{study['id']}",
                    headers=admin_headers, timeout=30)


class TestV3Template:
    """Ensure v3 template generates ~41 qs, perspective, axis_label, compare_brand."""

    def test_question_count_41(self, v3_study):
        qs = v3_study["questions"]
        # 4 awareness + 6 quality + 16 base identity + (5 competitor * top-2) + 4 loyalty = 40
        # Previous review hint said ~41; accept 39..43
        assert 38 <= len(qs) <= 43, f"Expected ~41 questions, got {len(qs)}"

    def test_dimensions_complete(self, v3_study):
        dims = [q["dimension"] for q in v3_study["questions"]]
        for d in ("awareness", "quality", "identity", "loyalty"):
            assert d in dims

    def test_perspective_field_present(self, v3_study):
        # Every ASO/ASP/ASS/ASD/COMP template must carry "perspective"
        persp_qs = [q for q in v3_study["questions"] if q.get("perspective")]
        assert len(persp_qs) >= 14, f"Not enough perspective-tagged questions: {len(persp_qs)}"
        perspectives = {q["perspective"] for q in persp_qs}
        assert {"as_organization", "as_person", "as_symbol",
                "as_product", "competitor"} <= perspectives

    def test_axis_label_on_likert_perspective(self, v3_study):
        axis_qs = [q for q in v3_study["questions"] if q.get("axis_label")]
        assert len(axis_qs) >= 8, f"axis_label should propagate; got {len(axis_qs)}"
        axes = {q["axis_label"] for q in axis_qs}
        # Expect common axes
        assert "High-quality" in axes
        assert "Premium" in axes

    def test_compare_brand_for_top2_competitors_only(self, v3_study):
        comp_qs = [q for q in v3_study["questions"] if q.get("compare_brand")]
        # 5 COMP-* templates × top-2 competitors = 10 (plus possibly PQ-5 comparative→ check field name)
        # PQ-5 doesn't set compare_brand in tmpl; only the COMP-* do.
        # Accept 10 or a bit more.
        brands_used = {q["compare_brand"] for q in comp_qs}
        # Only top-2 competitors should be present (Starbucks, Inthanin) — NOT CafeAmazon
        assert "Starbucks" in brands_used
        assert "Inthanin" in brands_used
        assert "CafeAmazon" not in brands_used, \
            f"3rd competitor should be excluded from COMP-* but got {brands_used}"
        # Expect ~10 COMP-* questions
        assert 10 <= len(comp_qs) <= 12, f"Expected 10 COMP-* qs (5×2), got {len(comp_qs)}"


class TestV3DashboardAssociation:
    """After responses submitted, dashboard returns association + radar."""

    @pytest.fixture(scope="class")
    def study_with_responses(self, admin_headers, v3_study):
        # Switch to collecting
        sid = v3_study["id"]
        requests.put(f"{BASE_URL}/api/brand-equity/studies/{sid}",
                     json={"status": "collecting"}, headers=admin_headers, timeout=15)
        token = v3_study["share_token"]
        pub = requests.get(f"{BASE_URL}/api/brand-equity/public/{token}", timeout=15).json()
        questions = pub["questions"]

        def answer(q, high_for_sb=True):
            t = q["type"]
            if t in ("likert_5", "likert_7"):
                scale = 5 if t == "likert_5" else 7
                # Differentiate COMP-* based on compare_brand
                if q.get("compare_brand") == "Starbucks":
                    return scale - 1  # high (6-7)
                if q.get("compare_brand") == "Inthanin":
                    return 3  # low
                return scale - 1
            if t == "nps_0_10":
                return 9
            if t == "comparative_7":
                return 4
            if t == "trait_grid":
                opts = q.get("options", [])
                return opts[:3]
            if t == "mcq_multi":
                opts = q.get("options", [])
                return opts[:1]
            if t == "mcq_single":
                return q.get("options", [""])[0]
            if t == "open_short":
                return "TEST_V3Brand"
            if t == "open_long":
                return "ดีมาก มีคุณภาพสูง"
            return ""

        for i in range(12):
            ans = [{"question_id": q["id"], "value": answer(q)} for q in questions]
            r = requests.post(f"{BASE_URL}/api/brand-equity/public/{token}/respond",
                              json={"demographics": {"age": "25-34"},
                                    "answers": ans, "duration_sec": 120}, timeout=15)
            assert r.status_code == 200, r.text

        r = requests.get(f"{BASE_URL}/api/brand-equity/studies/{sid}/dashboard",
                         headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        return r.json()

    def test_ready_for_dashboard(self, study_with_responses):
        assert study_with_responses["ready_for_dashboard"] is True

    def test_association_by_perspective(self, study_with_responses):
        agg = study_with_responses["aggregate"]
        assert "association" in agg
        bp = agg["association"]["by_perspective"]
        assert set(bp.keys()) == {"as_organization", "as_person", "as_symbol", "as_product"}
        for k, v in bp.items():
            assert 0 <= v <= 100, f"{k}={v} not 0-100"

    def test_association_overall_is_avg(self, study_with_responses):
        bp = study_with_responses["aggregate"]["association"]["by_perspective"]
        overall = study_with_responses["aggregate"]["association"]["overall"]
        non_zero = [v for v in bp.values() if v]
        if non_zero:
            expected = round(sum(non_zero) / len(non_zero), 1)
            assert abs(overall - expected) < 0.5, f"overall {overall} != avg {expected}"

    def test_image_radar_axes(self, study_with_responses):
        rad = study_with_responses["aggregate"]["image_radar"]
        assert "axes" in rad and "series" in rad
        assert len(rad["axes"]) >= 3, f"radar axes too few: {rad['axes']}"

    def test_image_radar_series_brand_and_competitors(self, study_with_responses):
        rad = study_with_responses["aggregate"]["image_radar"]
        kinds = [s["kind"] for s in rad["series"]]
        assert "brand" in kinds
        assert "competitor" in kinds
        # Top-2 competitors (Starbucks, Inthanin) → 2 competitor series
        comp_series = [s for s in rad["series"] if s["kind"] == "competitor"]
        assert len(comp_series) == 2, f"Expected 2 competitor series, got {len(comp_series)}"
        for s in rad["series"]:
            assert "values" in s and len(s["values"]) == len(rad["axes"])
            for v in s["values"]:
                assert v is None or 0 <= v <= 100

    def test_starbucks_higher_than_inthanin(self, study_with_responses):
        rad = study_with_responses["aggregate"]["image_radar"]
        sb = next((s for s in rad["series"] if s["name"] == "Starbucks"), None)
        inth = next((s for s in rad["series"] if s["name"] == "Inthanin"), None)
        assert sb and inth, "Expected Starbucks + Inthanin series"

        def avg(vals):
            v = [x for x in vals if x is not None]
            return sum(v) / len(v) if v else 0
        sb_avg = avg(sb["values"])
        inth_avg = avg(inth["values"])
        assert sb_avg > inth_avg + 15, \
            f"Expected Starbucks>>Inthanin (got SB={sb_avg}, Inth={inth_avg})"

    def test_out_questions_propagate_fields(self, study_with_responses):
        qs = study_with_responses["aggregate"]["questions"]
        persp_qs = [q for q in qs if q.get("perspective")]
        assert len(persp_qs) >= 14
        axis_qs = [q for q in qs if q.get("axis_label")]
        assert len(axis_qs) >= 8
        cb_qs = [q for q in qs if q.get("compare_brand")]
        assert len(cb_qs) >= 10
