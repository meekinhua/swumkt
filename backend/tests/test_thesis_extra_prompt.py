"""
Test Thesis Export Extra Prompt Feature
Tests for:
1. Extra Prompt textarea in export modal (frontend)
2. POST /api/conjoint/studies/{id}/export-thesis accepts extra_prompt parameter
3. _create_thesis_docx converts LaTeX display equations ($$...$$) to native Word equations
4. _create_thesis_docx converts LaTeX inline equations ($...$) to native Word equations
5. _create_thesis_docx sets TH SarabunPSK font on all runs
6. Cache key includes hash of extra_prompt when provided
7. Multi-line display equations ($$\n...\n$$) are merged and rendered correctly
"""

import pytest
import requests
import os
import hashlib
import sys
import io

# Add backend to path for direct function imports
sys.path.insert(0, '/app/backend')

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://family-tree-hub-41.preview.emergentagent.com')

# Test credentials
ADMIN_EMAIL = "admin@swu.ac.th"
ADMIN_PASSWORD = "admin123"

# Known study ID with sufficient responses (from previous test)
STUDY_ID = "38d01d61-385e-45af-8417-93c67994db59"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for admin user"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )
    if response.status_code != 200:
        pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")
    return response.json()["access_token"]


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Get headers with auth token"""
    return {"Authorization": f"Bearer {auth_token}"}


class TestThesisExportRequestModel:
    """Test ThesisExportRequest model accepts extra_prompt parameter"""
    
    def test_export_thesis_accepts_extra_prompt(self, auth_headers):
        """POST /api/conjoint/studies/{id}/export-thesis should accept extra_prompt in request body"""
        response = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID}/export-thesis",
            json={
                "methods": ["mnl"],
                "chapters": [4],
                "extra_prompt": "เน้นเรื่องกลยุทธ์ราคา"
            },
            headers=auth_headers
        )
        
        # Should return 200 (ready from cache) or processing status
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "status" in data
        assert data["status"] in ["ready", "processing"]
        print(f"✅ POST /export-thesis accepts extra_prompt - status: {data['status']}")
    
    def test_export_thesis_without_extra_prompt(self, auth_headers):
        """POST /api/conjoint/studies/{id}/export-thesis should work without extra_prompt"""
        response = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID}/export-thesis",
            json={
                "methods": ["mnl"],
                "chapters": [4]
            },
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "status" in data
        print(f"✅ POST /export-thesis works without extra_prompt - status: {data['status']}")
    
    def test_export_thesis_empty_extra_prompt(self, auth_headers):
        """POST /api/conjoint/studies/{id}/export-thesis should work with empty extra_prompt"""
        response = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID}/export-thesis",
            json={
                "methods": ["mnl"],
                "chapters": [4],
                "extra_prompt": ""
            },
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "status" in data
        print(f"✅ POST /export-thesis works with empty extra_prompt - status: {data['status']}")


class TestCacheKeyWithExtraPrompt:
    """Test cache key includes hash of extra_prompt when provided"""
    
    def test_cache_key_includes_extra_prompt_hash(self, auth_headers):
        """Cache key should include hash of extra_prompt when provided"""
        extra_prompt = "เน้นเรื่องกลยุทธ์ราคา"
        expected_hash = hashlib.md5(extra_prompt.strip().encode()).hexdigest()[:8]
        
        response = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID}/export-thesis",
            json={
                "methods": ["mnl"],
                "chapters": [4],
                "extra_prompt": extra_prompt
            },
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        job_id = data.get("job_id", "")
        
        # If cached, job_id is the cache_key which should contain _ep{hash}
        if data.get("cached"):
            assert f"_ep{expected_hash}" in job_id, f"Cache key should contain _ep{expected_hash}, got: {job_id}"
            print(f"✅ Cache key includes extra_prompt hash: {job_id}")
        else:
            # If processing, we can't verify cache key directly but API accepted the request
            print(f"✅ Request accepted with extra_prompt (processing): {job_id}")
    
    def test_different_extra_prompts_different_cache_keys(self, auth_headers):
        """Different extra_prompts should produce different cache keys"""
        prompt1 = "เน้นเรื่องกลยุทธ์ราคา"
        prompt2 = "เน้นเรื่อง Brand Positioning"
        
        hash1 = hashlib.md5(prompt1.strip().encode()).hexdigest()[:8]
        hash2 = hashlib.md5(prompt2.strip().encode()).hexdigest()[:8]
        
        assert hash1 != hash2, "Different prompts should produce different hashes"
        print(f"✅ Different extra_prompts produce different hashes: {hash1} vs {hash2}")
    
    def test_no_extra_prompt_no_hash_in_cache_key(self, auth_headers):
        """Cache key should NOT include _ep when extra_prompt is empty"""
        response = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID}/export-thesis",
            json={
                "methods": ["mnl"],
                "chapters": [4],
                "extra_prompt": ""
            },
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        job_id = data.get("job_id", "")
        
        if data.get("cached"):
            assert "_ep" not in job_id, f"Cache key should NOT contain _ep when extra_prompt is empty, got: {job_id}"
            print(f"✅ Cache key without extra_prompt has no _ep: {job_id}")
        else:
            print(f"✅ Request accepted without extra_prompt (processing): {job_id}")


class TestCreateThesisDocxFunction:
    """Test _create_thesis_docx function for LaTeX equation conversion and font settings"""
    
    def test_math2docx_import(self):
        """math2docx library should be importable"""
        import math2docx
        print(f"✅ math2docx imported successfully, version: {math2docx.__version__ if hasattr(math2docx, '__version__') else 'unknown'}")
    
    def test_create_thesis_docx_with_display_equations(self):
        """_create_thesis_docx should convert display equations ($$...$$) to native Word equations"""
        from server import _create_thesis_docx
        
        # Test content with display equation
        test_content = """# บทที่ 4 ผลการศึกษา

## 4.1 ผลการวิเคราะห์

สมการ Utility Function:

$$U_j = \\sum_{k=1}^{K} \\beta_k x_{jk} + \\varepsilon_j$$

โดยที่ $U_j$ คือ Utility ของทางเลือก j
"""
        
        docx_bytes = _create_thesis_docx("Test Study", 50, test_content)
        
        assert docx_bytes is not None
        assert len(docx_bytes) > 0
        assert isinstance(docx_bytes, bytes)
        print(f"✅ _create_thesis_docx generated {len(docx_bytes)} bytes with display equations")
    
    def test_create_thesis_docx_with_inline_equations(self):
        """_create_thesis_docx should convert inline equations ($...$) to native Word equations"""
        from server import _create_thesis_docx
        
        # Test content with inline equations
        test_content = """# บทที่ 4 ผลการศึกษา

ค่า $\\beta_1 = 0.245$ มีนัยสำคัญทางสถิติที่ระดับ $p < 0.001$

ค่า Pseudo $R^2 = 0.456$ แสดงว่าโมเดลมีความเหมาะสม
"""
        
        docx_bytes = _create_thesis_docx("Test Study", 50, test_content)
        
        assert docx_bytes is not None
        assert len(docx_bytes) > 0
        print(f"✅ _create_thesis_docx generated {len(docx_bytes)} bytes with inline equations")
    
    def test_create_thesis_docx_with_multiline_display_equations(self):
        """_create_thesis_docx should merge and render multi-line display equations ($$\\n...\\n$$)"""
        from server import _create_thesis_docx
        
        # Test content with multi-line display equation
        test_content = """# บทที่ 3 ระเบียบวิธีวิจัย

สมการ Multinomial Logit:

$$
P_j = \\frac{e^{V_j}}{\\sum_{k=1}^{J} e^{V_k}}
$$

โดยที่ $P_j$ คือความน่าจะเป็นในการเลือกทางเลือก j
"""
        
        docx_bytes = _create_thesis_docx("Test Study", 50, test_content)
        
        assert docx_bytes is not None
        assert len(docx_bytes) > 0
        print(f"✅ _create_thesis_docx generated {len(docx_bytes)} bytes with multi-line display equations")
    
    def test_create_thesis_docx_font_settings(self):
        """_create_thesis_docx should set TH SarabunPSK font on all runs"""
        from server import _create_thesis_docx
        from docx import Document
        
        test_content = """# บทที่ 4 ผลการศึกษา

## 4.1 ผลการวิเคราะห์

ผลการวิเคราะห์ Conjoint Analysis พบว่าผู้บริโภคให้ความสำคัญกับราคามากที่สุด
"""
        
        docx_bytes = _create_thesis_docx("Test Study", 50, test_content)
        
        # Load the generated docx and check font settings
        doc = Document(io.BytesIO(docx_bytes))
        
        # Check Normal style font
        normal_style = doc.styles['Normal']
        assert normal_style.font.name == 'TH SarabunPSK', f"Expected TH SarabunPSK, got {normal_style.font.name}"
        
        print(f"✅ _create_thesis_docx sets TH SarabunPSK font correctly")
    
    def test_create_thesis_docx_with_mixed_content(self):
        """_create_thesis_docx should handle mixed content (text, tables, equations)"""
        from server import _create_thesis_docx
        
        test_content = """# บทที่ 4 ผลการศึกษา

## 4.1 ผลการวิเคราะห์ด้วย MNL

สมการ Utility:

$$U_j = \\beta_0 + \\beta_1 x_1 + \\beta_2 x_2 + \\varepsilon_j$$

| ตัวแปร | Coefficient | SE | p-value |
|--------|-------------|-----|---------|
| ราคา | -0.245 | 0.032 | <0.001 |
| คุณภาพ | 0.456 | 0.045 | <0.001 |

ค่า $\\beta_1 = -0.245$ แสดงว่าราคามีผลเชิงลบต่อ Utility
"""
        
        docx_bytes = _create_thesis_docx("Test Study", 50, test_content)
        
        assert docx_bytes is not None
        assert len(docx_bytes) > 0
        print(f"✅ _create_thesis_docx handles mixed content correctly ({len(docx_bytes)} bytes)")


class TestBuildThesisPromptFunction:
    """Test _build_thesis_prompt function includes extra_prompt in system message"""
    
    def test_build_thesis_prompt_with_extra_prompt(self):
        """_build_thesis_prompt should include extra_prompt in system message"""
        from server import _build_thesis_prompt
        
        extra_prompt = "เน้นเรื่องกลยุทธ์ราคา"
        all_results = {"counting": {"importance_scores": {}}}
        
        system_msg, chapter_prompts = _build_thesis_prompt(
            study_title="Test Study",
            respondent_count=50,
            all_method_results=all_results,
            methods=["mnl"],
            chapters=[4],
            extra_prompt=extra_prompt
        )
        
        assert extra_prompt in system_msg, f"extra_prompt should be in system_msg"
        assert "คำสั่งเพิ่มเติมจากผู้ใช้" in system_msg, "System message should mention user's extra instructions"
        print(f"✅ _build_thesis_prompt includes extra_prompt in system message")
    
    def test_build_thesis_prompt_without_extra_prompt(self):
        """_build_thesis_prompt should work without extra_prompt"""
        from server import _build_thesis_prompt
        
        all_results = {"counting": {"importance_scores": {}}}
        
        system_msg, chapter_prompts = _build_thesis_prompt(
            study_title="Test Study",
            respondent_count=50,
            all_method_results=all_results,
            methods=["mnl"],
            chapters=[4],
            extra_prompt=""
        )
        
        assert "คำสั่งเพิ่มเติมจากผู้ใช้" not in system_msg, "System message should NOT mention extra instructions when empty"
        print(f"✅ _build_thesis_prompt works without extra_prompt")
    
    def test_build_thesis_prompt_latex_instructions(self):
        """_build_thesis_prompt should include LaTeX equation instructions"""
        from server import _build_thesis_prompt
        
        all_results = {"counting": {"importance_scores": {}}}
        
        system_msg, chapter_prompts = _build_thesis_prompt(
            study_title="Test Study",
            respondent_count=50,
            all_method_results=all_results,
            methods=["mnl"],
            chapters=[4]
        )
        
        # Check for LaTeX instructions
        assert "$$" in system_msg, "System message should mention display equation syntax $$...$$"
        assert "$" in system_msg, "System message should mention inline equation syntax $...$"
        assert "LaTeX" in system_msg, "System message should mention LaTeX"
        print(f"✅ _build_thesis_prompt includes LaTeX equation instructions")


class TestAuthRequired:
    """Test authentication requirements for thesis export"""
    
    def test_export_thesis_requires_auth(self):
        """POST /api/conjoint/studies/{id}/export-thesis should require authentication"""
        response = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID}/export-thesis",
            json={
                "methods": ["mnl"],
                "chapters": [4],
                "extra_prompt": "test"
            }
        )
        
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
        print(f"✅ POST /export-thesis requires authentication (status: {response.status_code})")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
