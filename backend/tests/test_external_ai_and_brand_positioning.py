"""Comprehensive tests for Bring-Your-Own-AI (External AI Prompt -> Validate -> Import)
and Brand Equity Competitive Positioning / Perceptual Map across every study case:
  1. JSON extraction & safe syntax repair (markers, markdown fences, smart quotes, trailing commas, repair_prompt)
  2. Brand Equity Case 1: Focal Brand Only (0 Competitors, 12 responses) -> external AI -> showcase
  3. Brand Equity Case 2: Focal Brand + 3 Competitors + Custom Positive & Reverse Quality Attrs (15 responses)
     -> Perceptual Map 4-brand series -> External AI Positioning + Normalization + Themes + Identity-Image
     -> Verified in Owner Dashboard & Public Showcase
  4. Brand Equity Case 3: Filtered Segment External AI Import isolation (ai_cache_by_filter)
  5. Brand Equity Case 4: Identity Wizard External AI prompt & import (including hex normalization)
  6. Conjoint Analysis: Qualitative External AI import -> D-Optimal Design -> Results Interpretation External AI import
"""

import json
import os
import sys
import pytest
import requests

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from utils.external_ai import (  # noqa: E402
    START_MARKER,
    END_MARKER,
    extract_json_payload,
    validate_be_identity_payload,
    validate_conjoint_qualitative_payload,
    validate_conjoint_interpretation_payload,
)

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or os.environ.get("BASE_URL") or "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "admin@swu.ac.th"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def cleanup_registry(admin_headers):
    created = {"be": [], "cj": []}
    yield created
    for sid in created["be"]:
        try:
            requests.delete(f"{API}/brand-equity/studies/{sid}/purge", headers=admin_headers, timeout=10)
        except Exception:
            pass
    for sid in created["cj"]:
        try:
            requests.delete(f"{API}/conjoint/studies/{sid}", headers=admin_headers, timeout=10)
        except Exception:
            pass


def _answer_be_questions(qs, brand_name, competitors, i):
    ans = []
    # Differentiate brand vs competitors deterministically for Perceptual Map validation
    for q in qs:
        qid = q["id"]
        qt = q.get("type")
        comp = q.get("compare_brand")
        axis = q.get("axis_label") or ""
        if qt in ("open_short", "open_long", "open_text"):
            if q.get("ai_processing") == "extract_brand":
                val = "มะลิ" if i % 3 == 0 else ("mali" if i % 3 == 1 else (competitors[0] if competitors else brand_name))
            elif q.get("ai_processing") == "extract_brands":
                val = f"{brand_name}, {competitors[0]}" if competitors else brand_name
            elif q.get("ai_processing") == "word_cloud":
                val = "ทันสมัย" if i % 2 == 0 else "อบอุ่น"
            elif q.get("ai_processing") == "extract_personality":
                val = "อบอุ่น ทันสมัย"
            else:
                val = "กลิ่นหอมเข้มข้น ราคาเหมาะสม"
        elif qt in ("mcq_multi", "multi_select"):
            opts = q.get("options") or []
            val = [opts[0]["value"] if isinstance(opts[0], dict) else opts[0]] if opts else [brand_name]
        elif qt in ("mcq_single", "single_select"):
            opts = q.get("options") or []
            val = (opts[0]["value"] if isinstance(opts[0], dict) else opts[0]) if opts else brand_name
        elif qt == "likert_5":
            val = 4 if i % 2 == 0 else 5
        elif qt == "likert_7":
            if q.get("reverse_scored"):
                # Negative phrasing -> low score (2) = high quality!
                val = 2 if not comp else 5
            elif comp == (competitors[0] if len(competitors) > 0 else "___"):
                val = 7 if axis == "Premium" else 5
            elif comp == (competitors[1] if len(competitors) > 1 else "___"):
                val = 4
            elif comp == (competitors[2] if len(competitors) > 2 else "___"):
                val = 3
            else:
                # Focal brand strong on High-quality & Innovative, mid on Premium
                val = 6 if axis != "Premium" else 5
        elif qt == "trait_grid":
            opts = q.get("options") or []
            val = [(o["value"] if isinstance(o, dict) else o) for o in opts[:3]]
        elif qt == "nps_0_10":
            val = 9 if i % 2 == 0 else 8
        else:
            val = None
        if val is not None:
            ans.append({"question_id": qid, "value": val})
    return ans


# ============ UNIT TESTS FOR EXTRACTOR & VALIDATOR ============


def test_json_extractor_handles_markers_markdown_and_repairs():
    wrapped = f"แน่นอนครับ นี่คือผลวิเคราะห์:\n{START_MARKER}\n```json\n{{\u201cderived_traits\u201d: [\u201cModern\u201d,], \u201csummary\u201d: \u201cOK\u201d, // comment\n}}\n```\n{END_MARKER}\nหวังว่าจะเป็นประโยชน์!"
    parsed, err, warns = extract_json_payload(wrapped)
    assert err is None, err
    assert parsed == {"derived_traits": ["Modern"], "summary": "OK"}
    assert len(warns) >= 1

    bad, bad_err, _ = extract_json_payload("ขอโทษครับ นี่เป็นข้อความธรรมดาไม่มี JSON")
    assert bad is None and bad_err


def test_unit_be_identity_hex_and_validation():
    raw = f"""{START_MARKER}
    {{
      "derived_traits": ["Modern", "modern", "Artisanal"],
      "visual_palette": ["#abc", "not-a-color", "#0E5538"],
      "visual_keywords": ["craft"],
      "archetype": "Creator",
      "summary": "กาแฟไทยทันสมัย"
    }}
    {END_MARKER}"""
    res = validate_be_identity_payload(raw)
    assert res["valid"] is True
    assert res["data"]["derived_traits"] == ["Modern", "Artisanal"]
    assert res["data"]["visual_palette"] == ["#AABBCC", "#0E5538"]
    assert any("hex" in w for w in res["warnings"])


def test_unit_conjoint_qual_and_interp_validation():
    bad_qual = json.dumps({"attributes": [{"name": "ราคา", "levels": [{"value": "50"}, {"value": ""}]}]})
    r_bad = validate_conjoint_qualitative_payload(bad_qual)
    assert r_bad["valid"] is False
    assert r_bad["repair_prompt"] and START_MARKER in r_bad["repair_prompt"]

    short_interp = validate_conjoint_interpretation_payload("สั้นเกินไป")
    assert short_interp["valid"] is False and short_interp["repair_prompt"]

    ok_interp = validate_conjoint_interpretation_payload(
        "## สรุปผู้บริหาร\nจากผลการวิเคราะห์ Conjoint พบว่าราคามีความสำคัญสูงสุด 48.2% และขนาดแก้ว 31.0% แนะนำแพ็กเกจกลางเพื่อเพิ่มส่วนแบ่งตลาด"
    )
    assert ok_interp["valid"] is True


# ============ BRAND EQUITY END-TO-END CASES ============


def test_be_identity_external_ai_endpoints(admin_headers):
    rp = requests.post(
        f"{API}/brand-equity/external-ai/identity-prompt",
        json={
            "brand_name": "Mali Roast",
            "category": "กาแฟ",
            "description": "กาแฟไทยคั่วกลางโทนอบอุ่น",
            "traits": ["Modern"],
            "image_notes": ["logo"],
        },
        headers=admin_headers,
    )
    assert rp.status_code == 200
    body = rp.json()
    assert START_MARKER in body["prompt"] and body["has_images"] is True

    ri_bad = requests.post(
        f"{API}/brand-equity/external-ai/identity-import",
        json={"raw_text": "{invalid json"},
        headers=admin_headers,
    )
    assert ri_bad.status_code == 200 and ri_bad.json()["valid"] is False and ri_bad.json()["repair_prompt"]

    ri_ok = requests.post(
        f"{API}/brand-equity/external-ai/identity-import",
        json={"raw_text": f'{START_MARKER}{{"derived_traits":["Warm","Modern"],"visual_palette":["#123"],"summary":"แบรนด์กาแฟอบอุ่น"}}{END_MARKER}'},
        headers=admin_headers,
    )
    assert ri_ok.status_code == 200 and ri_ok.json()["valid"] is True
    assert ri_ok.json()["data"]["visual_palette"] == ["#112233"]


def test_be_case_0_competitors_solo_external_ai(admin_headers, cleanup_registry):
    cr = requests.post(
        f"{API}/brand-equity/studies",
        json={
            "brand": {"name": "TEST_SoloBrand", "category": "ชาเขียว", "competitors": []},
            "identity": {"traits": ["Fresh", "Modern"], "description": "ชาเขียวออร์แกนิก"},
            "respondent_target": 30,
            "demographics_to_capture": ["gender", "age"],
        },
        headers=admin_headers,
    )
    assert cr.status_code in (200, 201), cr.text
    sid = cr.json()["id"]
    cleanup_registry["be"].append(sid)

    assert requests.put(f"{API}/brand-equity/studies/{sid}", json={"status": "collecting", "is_public_showcase": True}, headers=admin_headers).status_code == 200
    st = requests.get(f"{API}/brand-equity/studies/{sid}", headers=admin_headers).json()
    tok = st["share_token"]
    qs = requests.get(f"{API}/brand-equity/public/{tok}").json()["questions"]

    for i in range(12):
        r = requests.post(
            f"{API}/brand-equity/public/{tok}/respond",
            json={
                "answers": _answer_be_questions(qs, "TEST_SoloBrand", [], i),
                "demographics": {"gender": "female" if i % 2 == 0 else "male", "age": "18-24"},
                "duration_sec": 40,
                "language": "th",
            },
        )
        assert r.status_code == 200, r.text

    pr = requests.post(f"{API}/brand-equity/studies/{sid}/external-ai-prompt", headers=admin_headers)
    assert pr.status_code == 200 and START_MARKER in pr.json()["prompt"]

    open_qids = pr.json()["metadata"]["open_question_ids"]
    norm_qid = next((q["id"] for q in qs if q.get("ai_processing") == "extract_brand"), open_qids[0])
    ai_json = {
        "normalized_by_question": {norm_qid: {"clusters": [{"canonical": "TEST_SoloBrand", "variants": ["มะลิ", "mali"], "count": 12}]}},
        "themes_by_question": {},
        "identity_image": {
            "perceived_traits": [{"trait": "Modern", "count": 10, "sentiment": 0.8}],
            "aligned": ["Modern"],
            "lost": ["Fresh"],
            "unintended": [],
            "alignment_score_0_100": 62,
            "narrative": "ผู้บริโภครู้สึกว่าทันสมัยตรงตามตั้งใจ",
        },
        "master_insights": [
            {"headline": "จุดแข็งด้านภาพลักษณ์ทันสมัย", "evidence": "score > 70 [AW-1]", "recommendation": "ชูจุดขายออร์แกนิกเพิ่ม", "priority": "high"}
        ],
    }
    imp = requests.post(
        f"{API}/brand-equity/studies/{sid}/external-ai-import",
        json={"raw_text": f"{START_MARKER}\n{json.dumps(ai_json, ensure_ascii=False)}\n{END_MARKER}", "dry_run": False},
        headers=admin_headers,
    )
    assert imp.status_code == 200 and imp.json()["valid"] is True and imp.json()["applied"] is True

    dash = requests.get(f"{API}/brand-equity/studies/{sid}/dashboard", headers=admin_headers).json()
    assert dash["ai_cache"]["source"] == "external_ai"
    assert dash["aggregate"]["normalization"]["basis"] == "ai"


def test_be_case_multi_competitors_positioning_and_filtered_slice(admin_headers, cleanup_registry):
    competitors = ["Starbucks", "Cafe Amazon", "Inthanin"]
    cr = requests.post(
        f"{API}/brand-equity/studies",
        json={
            "brand": {
                "name": "TEST_MaliRoast",
                "category": "กาแฟพิเศษ",
                "competitors": competitors,
                "custom_quality_attributes": ["กลมกล่อม", "หวานเกินไป"],
                "custom_quality_attributes_reverse": [False, True],
            },
            "identity": {"traits": ["Modern", "Warm", "Authentic"], "description": "กาแฟไทยคั่วพิเศษ"},
            "respondent_target": 50,
            "demographics_to_capture": ["gender", "age"],
        },
        headers=admin_headers,
    )
    assert cr.status_code in (200, 201), cr.text
    sid = cr.json()["id"]
    cleanup_registry["be"].append(sid)

    assert requests.put(
        f"{API}/brand-equity/studies/{sid}",
        json={"status": "collecting", "is_public_showcase": True},
        headers=admin_headers,
    ).status_code == 200
    tok = requests.get(f"{API}/brand-equity/studies/{sid}", headers=admin_headers).json()["share_token"]
    qs = requests.get(f"{API}/brand-equity/public/{tok}").json()["questions"]

    for i in range(15):
        r = requests.post(
            f"{API}/brand-equity/public/{tok}/respond",
            json={
                "answers": _answer_be_questions(qs, "TEST_MaliRoast", competitors, i),
                "demographics": {"gender": "female" if i < 10 else "male", "age": "18-24" if i % 2 == 0 else "25-34"},
                "duration_sec": 50,
                "language": "th",
            },
        )
        assert r.status_code == 200, r.text

    # 1) Dashboard image_radar has Focal + all 3 Competitors (4 series)
    dash0 = requests.get(f"{API}/brand-equity/studies/{sid}/dashboard", headers=admin_headers).json()
    radar = dash0["aggregate"]["image_radar"]
    assert len(radar["series"]) == 4, [s["name"] for s in radar["series"]]
    assert "High-quality" in radar["axes"] and "Premium" in radar["axes"]

    # 2) External AI prompt includes full competitor perceptual matrix
    pr = requests.post(f"{API}/brand-equity/studies/{sid}/external-ai-prompt", headers=admin_headers)
    assert pr.status_code == 200
    pdata = pr.json()
    assert set(competitors).issubset(set(pdata["metadata"]["competitors"]))
    assert "perceptual_map_matrix_0_100" in pdata["prompt"]

    # 3) Dry run with invalid structure fails gracefully with repair_prompt
    bad_imp = requests.post(
        f"{API}/brand-equity/studies/{sid}/external-ai-import",
        json={"raw_text": '{"identity_image": {}}', "dry_run": True},
        headers=admin_headers,
    )
    assert bad_imp.status_code == 200
    assert bad_imp.json()["valid"] is False and bad_imp.json()["repair_prompt"]

    # 4) Valid full import with normalized awareness, themes, identity_image, 5 insights, and positioning_analysis
    aw1_id = next(q["id"] for q in qs if q.get("ai_processing") == "extract_brand")
    theme_id = next(q["id"] for q in qs if q.get("ai_processing") == "theme_extraction")
    full_ai = {
        "schema_version": "be_analysis_v1",
        "normalized_by_question": {
            aw1_id: {
                "clusters": [
                    {"canonical": "TEST_MaliRoast", "variants": ["มะลิ", "mali"], "count": 10},
                    {"canonical": "Starbucks", "variants": ["Starbucks"], "count": 5},
                ]
            }
        },
        "themes_by_question": {
            theme_id: [
                {"name": "กลิ่นหอมชัด", "description": "ผู้ตอบชมกลิ่นคั่วหอม", "count": 9, "sample_quotes": ["กลิ่นหอมเข้มข้น"], "sentiment": 0.85}
            ]
        },
        "identity_image": {
            "perceived_traits": [{"trait": "Modern", "count": 11, "sentiment": 0.75}, {"trait": "Warm", "count": 9, "sentiment": 0.8}],
            "aligned": ["Modern", "Warm"],
            "lost": ["Authentic"],
            "unintended": [],
            "alignment_score_0_100": 78,
            "narrative": "Modern และ Warm ตรงกับภาพลักษณ์ที่ผู้บริโภครับรู้",
        },
        "master_insights": [
            {"headline": "จุดแข็ง High-quality เหนือตลาด", "evidence": "High-quality สูงกว่าทุกคู่แข่ง [ASD-1]", "recommendation": "สื่อสารมาตรฐานเมล็ดกาแฟ", "priority": "high"},
            {"headline": "ช่องว่าง Premium เทียบ Starbucks", "evidence": "Premium รอง Starbucks [ASD-3]", "recommendation": "ออกเมนู Reserve เพื่อยกระดับ", "priority": "medium"},
        ],
        "positioning_analysis": {
            "summary": "TEST_MaliRoast โดดเด่นด้านคุณภาพและนวัตกรรมในราคากลาง-บน ขณะที่ Starbucks ครองภาพลักษณ์ Premium",
            "recommended_axes": {"x": "high-quality", "y": "premium", "reason": "แยกช่องว่างระหว่างคุณภาพกับความพรีเมียมชัดเจนที่สุด"},
            "white_space": "High Quality + Authentic Thai Warmth ที่ไม่หรูหราเกินเข้าถึง",
            "competitor_positions": [
                {"brand": "Starbucks", "position_label": "Premium Standard", "strength": "ภาพลักษณ์หรู", "weakness": "ราคาสูง"},
                {"brand": "Cafe Amazon", "position_label": "Mass Convenience", "strength": "สาขาเยอะ", "weakness": "ความแตกต่างต่ำ"},
            ],
        },
    }

    dry_ok = requests.post(
        f"{API}/brand-equity/studies/{sid}/external-ai-import",
        json={"raw_text": f"{START_MARKER}{json.dumps(full_ai, ensure_ascii=False)}{END_MARKER}", "dry_run": True},
        headers=admin_headers,
    )
    assert dry_ok.status_code == 200 and dry_ok.json()["valid"] is True and dry_ok.json()["applied"] is False
    assert dry_ok.json()["preview"]["recommended_axes"]["x"] == "High-quality"  # case-normalized against radar axes!

    apply_ok = requests.post(
        f"{API}/brand-equity/studies/{sid}/external-ai-import",
        json={"raw_text": f"{START_MARKER}{json.dumps(full_ai, ensure_ascii=False)}{END_MARKER}", "dry_run": False},
        headers=admin_headers,
    )
    assert apply_ok.status_code == 200 and apply_ok.json()["applied"] is True

    dash1 = requests.get(f"{API}/brand-equity/studies/{sid}/dashboard", headers=admin_headers).json()
    assert dash1["ai_cache"]["source"] == "external_ai"
    assert dash1["ai_cache"]["positioning_analysis"]["recommended_axes"]["x"] == "High-quality"
    assert dash1["ai_cache"]["positioning_analysis"]["recommended_axes"]["y"] == "Premium"
    assert dash1["aggregate"]["normalization"]["basis"] == "ai"

    # Showcase exposes positioning_analysis too
    sc = requests.get(f"{API}/brand-equity/showcase/{tok}").json()
    assert sc["ai_cache"]["positioning_analysis"]["white_space"]

    # 5) Filtered segment external AI import stays isolated in ai_cache_by_filter
    seg_param = json.dumps({"gender": ["female"]})
    seg_imp = requests.post(
        f"{API}/brand-equity/studies/{sid}/external-ai-import",
        params={"segments": seg_param},
        json={
            "raw_text": json.dumps({
                **full_ai,
                "master_insights": [{"headline": "Insight เฉพาะกลุ่มผู้หญิง", "evidence": "n=10", "recommendation": "เน้นเมนูลดหวาน", "priority": "high"}],
            }, ensure_ascii=False),
            "dry_run": False,
        },
        headers=admin_headers,
    )
    assert seg_imp.status_code == 200 and seg_imp.json()["applied"] is True
    dash_f = requests.get(f"{API}/brand-equity/studies/{sid}/dashboard", params={"segments": seg_param}, headers=admin_headers).json()
    assert dash_f["ai_cache"]["master_insights"][0]["headline"] == "Insight เฉพาะกลุ่มผู้หญิง"
    # Full study cache remains intact
    dash_full = requests.get(f"{API}/brand-equity/studies/{sid}/dashboard", headers=admin_headers).json()
    assert dash_full["ai_cache"]["master_insights"][0]["headline"] == "จุดแข็ง High-quality เหนือตลาด"


# ============ CONJOINT EXTERNAL AI END-TO-END ============


def test_conjoint_qualitative_and_interpretation_external_ai(admin_headers, cleanup_registry):
    st_res = requests.post(
        f"{API}/conjoint/studies",
        json={"title": "TEST_Conjoint_ExtAI", "description": "QA", "product_category": "Beverage"},
        headers=admin_headers,
    )
    assert st_res.status_code in (200, 201), st_res.text
    sid = st_res.json().get("study_id") or st_res.json().get("id")
    cleanup_registry["cj"].append(sid)

    qual_inputs = [{"type": "interview", "content": "ลูกค้าสนใจราคาต่อแก้ว ขนาดแก้ว และระดับความหวาน", "filename": "iv.txt"}]
    qp = requests.post(
        f"{API}/conjoint/studies/{sid}/qualitative-prompt",
        json={"study_id": sid, "qualitative_data": qual_inputs, "target_language": "th"},
        headers=admin_headers,
    )
    assert qp.status_code == 200 and START_MARKER in qp.json()["prompt"]

    qual_payload = {
        "summary": "ผู้บริโภคให้ความสำคัญกับราคา ขนาด และความหวาน",
        "attributes": [
            {"name": "ราคา", "description": "ราคาต่อแก้ว", "levels": [{"value": "60 บาท"}, {"value": "85 บาท"}]},
            {"name": "ขนาด", "description": "ปริมาณเครื่องดื่ม", "levels": [{"value": "12 oz"}, {"value": "16 oz"}]},
        ],
    }
    qi = requests.post(
        f"{API}/conjoint/studies/{sid}/qualitative-import",
        json={"raw_text": f"{START_MARKER}{json.dumps(qual_payload, ensure_ascii=False)}{END_MARKER}", "qualitative_data": qual_inputs, "dry_run": False},
        headers=admin_headers,
    )
    assert qi.status_code == 200 and qi.json()["applied"] is True
    assert len(qi.json()["suggested_attributes"]) == 2

    # Generate D-Optimal design right from imported qualitative attributes
    des = requests.post(
        f"{API}/conjoint/studies/{sid}/generate-design",
        json={"alternatives_per_set": 3, "number_of_sets": 6},
        headers=admin_headers,
    )
    assert des.status_code == 200, des.text
    assert requests.post(f"{API}/conjoint/studies/{sid}/start-survey", json={}, headers=admin_headers).status_code == 200
    csets = requests.get(f"{API}/conjoint/survey/{sid}").json()["choice_sets"]
    for i in range(15):
        ch = [{"choice_set_id": cs["id"], "selected_profile_id": cs["profiles"][0 if i % 2 == 0 else -1]["id"]} for cs in csets]
        assert requests.post(
            f"{API}/conjoint/survey/{sid}/response",
            json={"study_id": sid, "responses": ch, "duration_sec": 30, "demographics": {"gender": "female" if i < 10 else "male"}},
        ).status_code == 200

    # Generate prompt + import interpretation into cache
    gp = requests.post(f"{API}/conjoint/studies/{sid}/generate-prompt", json={"method": "mnl", "compare_all": False}, headers=admin_headers)
    assert gp.status_code == 200 and gp.json()["prompt"]

    interp_text = "## สรุปผลวิเคราะห์ Conjoint\nราคาและขนาดแก้วเป็นปัจจัยหลักในการตัดสินใจซื้อ ผู้ตอบนิยมแพ็กเกจ 16 oz ที่ราคาคุ้มค่า แนะนำเปิดตัวรุ่น 60 บาทขนาด 16 oz เพื่อชิงส่วนแบ่งตลาด"
    imp_i = requests.post(
        f"{API}/conjoint/studies/{sid}/import-ai-interpretation",
        json={"raw_text": interp_text, "method": "mnl", "compare_all": False, "dry_run": False},
        headers=admin_headers,
    )
    assert imp_i.status_code == 200 and imp_i.json()["applied"] is True

    # Calling /ai-interpretation now hits DB cache immediately with external_ai content (no server LLM call!)
    cached_res = requests.post(f"{API}/conjoint/studies/{sid}/ai-interpretation", json={"method": "mnl", "compare_all": False}, headers=admin_headers)
    assert cached_res.status_code == 200
    assert cached_res.json().get("cached") is True and "สรุปผลวิเคราะห์ Conjoint" in cached_res.json().get("interpretation", "")

    # Unfiltered NCA & fsQCA return all 15 respondents
    nca_all = requests.post(f"{API}/conjoint/studies/{sid}/nca-analysis", json={}, headers=admin_headers)
    assert nca_all.status_code == 200, nca_all.text
    assert nca_all.json()["respondent_count"] == 15 and nca_all.json()["filtered"] is False

    fs_all = requests.post(f"{API}/conjoint/studies/{sid}/fsqca-analysis", json={}, headers=admin_headers)
    assert fs_all.status_code == 200, fs_all.text
    assert fs_all.json()["respondent_count"] == 15 and fs_all.json()["filtered"] is False

    # Filtered NCA, fsQCA, generate-prompt & import-ai-interpretation scope strictly to female subset (N=10)
    seg_cj = json.dumps({"gender": ["female"]})
    nca_f = requests.post(f"{API}/conjoint/studies/{sid}/nca-analysis", params={"segments": seg_cj}, json={}, headers=admin_headers)
    assert nca_f.status_code == 200, nca_f.text
    assert nca_f.json()["respondent_count"] == 10 and nca_f.json()["filtered"] is True

    fs_f = requests.post(f"{API}/conjoint/studies/{sid}/fsqca-analysis", params={"segments": seg_cj}, json={}, headers=admin_headers)
    assert fs_f.status_code == 200, fs_f.text
    assert fs_f.json()["respondent_count"] == 10 and fs_f.json()["filtered"] is True

    gp_f = requests.post(f"{API}/conjoint/studies/{sid}/generate-prompt", params={"segments": seg_cj}, json={"method": "mnl", "compare_all": False}, headers=admin_headers)
    assert gp_f.status_code == 200 and "[Filter Scope]" in gp_f.json()["prompt"]

    imp_f = requests.post(
        f"{API}/conjoint/studies/{sid}/import-ai-interpretation",
        params={"segments": seg_cj},
        json={
            "raw_text": "## ผลเฉพาะกลุ่มผู้หญิง\nราคาและขนาดแก้วเป็นปัจจัยหลักในการตัดสินใจซื้อของกลุ่มผู้หญิง โดยนิยมแพ็กเกจ 16 oz ที่ราคา 60 บาทอย่างชัดเจน แนะนำสื่อสารความคุ้มค่าและออกโปรโมชั่นคู่ขนาด 16 oz",
            "method": "mnl",
            "compare_all": False,
            "dry_run": False,
        },
        headers=admin_headers,
    )
    assert imp_f.status_code == 200 and imp_f.json()["applied"] is True, imp_f.text
    # Unfiltered cache must remain intact (not overwritten by filtered import)
    still_full = requests.post(f"{API}/conjoint/studies/{sid}/ai-interpretation", json={"method": "mnl", "compare_all": False}, headers=admin_headers)
    assert still_full.status_code == 200 and "สรุปผลวิเคราะห์ Conjoint" in still_full.json().get("interpretation", "")
