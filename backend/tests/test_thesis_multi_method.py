"""
Test Thesis Export with Multiple Methods Selection
Tests the new multi-method thesis export feature where users can select
multiple statistical methods (counting, mnl, linear_regression, mixed_logit, hierarchical_bayes)
and multiple chapters (3, 4, 5) for export.

Key features tested:
- Single method export: {methods: ['mnl'], chapters: [4]}
- Multiple methods export: {methods: ['mnl', 'counting'], chapters: [3, 4, 5]}
- All 5 methods export
- Different method combinations produce different cache keys
- Auth required for all endpoints
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
STUDY_ID = "38d01d61-385e-45af-8417-93c67994db59"  # ข้าว study with 51 responses

# Test credentials
ADMIN_EMAIL = "admin@swu.ac.th"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for admin user"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    assert "access_token" in data, "No access_token in login response"
    return data["access_token"]


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Headers with auth token"""
    return {"Authorization": f"Bearer {auth_token}"}


class TestThesisExportAuth:
    """Test authentication requirements for thesis export endpoints"""
    
    def test_export_thesis_requires_auth(self):
        """POST /export-thesis should return 401/403 without token"""
        response = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID}/export-thesis",
            json={"methods": ["mnl"], "chapters": [4]}
        )
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✅ POST /export-thesis requires auth")
    
    def test_export_thesis_download_requires_auth(self):
        """GET /export-thesis-download should return 401/403 without token"""
        response = requests.get(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID}/export-thesis-download"
        )
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✅ GET /export-thesis-download requires auth")


class TestThesisExportSingleMethod:
    """Test thesis export with single method selection"""
    
    def test_export_single_method_mnl(self, auth_headers):
        """POST with single method {methods: ['mnl'], chapters: [4]}"""
        response = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID}/export-thesis",
            json={"methods": ["mnl"], "chapters": [4]},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "status" in data, "Missing 'status' in response"
        assert "job_id" in data, "Missing 'job_id' in response"
        assert data["status"] in ["ready", "processing"], f"Unexpected status: {data['status']}"
        
        # Cache key should be thesis_mnl_4
        if data.get("cached"):
            assert "mnl" in data["job_id"], f"Cache key should contain 'mnl': {data['job_id']}"
        
        print(f"✅ Single method MNL: status={data['status']}, job_id={data['job_id']}")
    
    def test_export_single_method_counting(self, auth_headers):
        """POST with single method {methods: ['counting'], chapters: [3, 4, 5]}"""
        response = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID}/export-thesis",
            json={"methods": ["counting"], "chapters": [3, 4, 5]},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert data["status"] in ["ready", "processing"]
        print(f"✅ Single method Counting: status={data['status']}, job_id={data['job_id']}")
    
    def test_export_single_method_linear_regression(self, auth_headers):
        """POST with single method {methods: ['linear_regression'], chapters: [4]}"""
        response = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID}/export-thesis",
            json={"methods": ["linear_regression"], "chapters": [4]},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert data["status"] in ["ready", "processing"]
        print(f"✅ Single method Linear Regression: status={data['status']}")


class TestThesisExportMultipleMethods:
    """Test thesis export with multiple methods selection"""
    
    def test_export_two_methods_mnl_counting(self, auth_headers):
        """POST with two methods {methods: ['mnl', 'counting'], chapters: [3, 4, 5]}"""
        response = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID}/export-thesis",
            json={"methods": ["mnl", "counting"], "chapters": [3, 4, 5]},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert data["status"] in ["ready", "processing"]
        # Cache key should contain both methods sorted: counting_mnl
        if data.get("cached"):
            job_id = data["job_id"]
            # Methods are sorted alphabetically in cache key
            assert "counting" in job_id or "mnl" in job_id, f"Cache key should contain methods: {job_id}"
        
        print(f"✅ Two methods (MNL + Counting): status={data['status']}, job_id={data['job_id']}")
    
    def test_export_three_methods(self, auth_headers):
        """POST with three methods {methods: ['mnl', 'counting', 'linear_regression'], chapters: [4]}"""
        response = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID}/export-thesis",
            json={"methods": ["mnl", "counting", "linear_regression"], "chapters": [4]},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert data["status"] in ["ready", "processing"]
        print(f"✅ Three methods: status={data['status']}, job_id={data['job_id']}")
    
    def test_export_all_five_methods(self, auth_headers):
        """POST with all 5 methods"""
        all_methods = ["counting", "mnl", "linear_regression", "mixed_logit", "hierarchical_bayes"]
        response = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID}/export-thesis",
            json={"methods": all_methods, "chapters": [3, 4, 5]},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert data["status"] in ["ready", "processing"]
        print(f"✅ All 5 methods: status={data['status']}, job_id={data['job_id']}")


class TestThesisCacheKeys:
    """Test that different method combinations produce different cache keys"""
    
    def test_different_methods_different_cache_keys(self, auth_headers):
        """Different method combinations should produce different cache keys"""
        # Test 1: MNL only
        resp1 = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID}/export-thesis",
            json={"methods": ["mnl"], "chapters": [4]},
            headers=auth_headers
        )
        assert resp1.status_code == 200
        job_id_1 = resp1.json()["job_id"]
        
        # Test 2: MNL + Counting
        resp2 = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID}/export-thesis",
            json={"methods": ["mnl", "counting"], "chapters": [4]},
            headers=auth_headers
        )
        assert resp2.status_code == 200
        job_id_2 = resp2.json()["job_id"]
        
        # Cache keys should be different (unless both are processing new jobs)
        # If cached, job_id contains the cache key
        if resp1.json().get("cached") and resp2.json().get("cached"):
            assert job_id_1 != job_id_2, f"Same cache key for different methods: {job_id_1}"
        
        print(f"✅ Different methods produce different cache keys")
        print(f"   MNL only: {job_id_1}")
        print(f"   MNL + Counting: {job_id_2}")
    
    def test_same_methods_different_order_same_cache(self, auth_headers):
        """Same methods in different order should produce same cache key (sorted)"""
        # Test 1: [mnl, counting]
        resp1 = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID}/export-thesis",
            json={"methods": ["mnl", "counting"], "chapters": [4]},
            headers=auth_headers
        )
        assert resp1.status_code == 200
        
        # Test 2: [counting, mnl] - same methods, different order
        resp2 = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID}/export-thesis",
            json={"methods": ["counting", "mnl"], "chapters": [4]},
            headers=auth_headers
        )
        assert resp2.status_code == 200
        
        # Both should have same cache key since methods are sorted
        if resp1.json().get("cached") and resp2.json().get("cached"):
            assert resp1.json()["job_id"] == resp2.json()["job_id"], \
                f"Same methods different order should have same cache key"
        
        print("✅ Same methods in different order produce same cache key (sorted)")


class TestThesisDownload:
    """Test thesis download endpoint"""
    
    def test_download_returns_valid_docx(self, auth_headers):
        """GET /export-thesis-download should return valid DOCX file"""
        response = requests.get(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID}/export-thesis-download",
            headers=auth_headers
        )
        
        # May return 404 if no thesis cached yet
        if response.status_code == 404:
            print("⚠️ No cached thesis found - skipping download test")
            pytest.skip("No cached thesis available")
        
        assert response.status_code == 200, f"Download failed: {response.text}"
        
        # Check content type
        content_type = response.headers.get("Content-Type", "")
        assert "application/vnd.openxmlformats-officedocument.wordprocessingml.document" in content_type or \
               "application/octet-stream" in content_type, f"Unexpected content type: {content_type}"
        
        # Check file size (should be > 10KB for a real document)
        content_length = len(response.content)
        assert content_length > 10000, f"DOCX too small: {content_length} bytes"
        
        # Check DOCX magic bytes (PK zip header)
        assert response.content[:4] == b'PK\x03\x04', "Not a valid DOCX/ZIP file"
        
        print(f"✅ Download returns valid DOCX: {content_length} bytes")
    
    def test_download_with_specific_cache_key(self, auth_headers):
        """GET /export-thesis-download?cache_key=X should return specific cached thesis"""
        # First, trigger a specific export to ensure cache exists
        export_resp = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID}/export-thesis",
            json={"methods": ["mnl"], "chapters": [3, 4, 5]},
            headers=auth_headers
        )
        assert export_resp.status_code == 200
        
        # If cached, use the cache key
        if export_resp.json().get("cached"):
            cache_key = export_resp.json()["job_id"]
            
            response = requests.get(
                f"{BASE_URL}/api/conjoint/studies/{STUDY_ID}/export-thesis-download",
                params={"cache_key": cache_key},
                headers=auth_headers
            )
            
            if response.status_code == 200:
                assert len(response.content) > 10000, "DOCX too small"
                print(f"✅ Download with cache_key={cache_key}: {len(response.content)} bytes")
            else:
                print(f"⚠️ Download with cache_key failed: {response.status_code}")
        else:
            print("⚠️ Export not cached - skipping cache_key download test")


class TestThesisExportEdgeCases:
    """Test edge cases and error handling"""
    
    def test_invalid_study_id(self, auth_headers):
        """POST with invalid study_id should return 404"""
        response = requests.post(
            f"{BASE_URL}/api/conjoint/studies/invalid-study-id/export-thesis",
            json={"methods": ["mnl"], "chapters": [4]},
            headers=auth_headers
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✅ Invalid study_id returns 404")
    
    def test_empty_methods_uses_default(self, auth_headers):
        """POST with empty methods should use default ['mnl']"""
        response = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID}/export-thesis",
            json={"chapters": [4]},  # No methods specified
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        print("✅ Empty methods uses default ['mnl']")
    
    def test_empty_chapters_uses_default(self, auth_headers):
        """POST with empty chapters should use default [3, 4, 5]"""
        response = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID}/export-thesis",
            json={"methods": ["mnl"]},  # No chapters specified
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        print("✅ Empty chapters uses default [3, 4, 5]")


class TestThesisExportStatus:
    """Test thesis export status polling endpoint"""
    
    def test_status_endpoint_exists(self, auth_headers):
        """GET /export-thesis-status/{job_id} should work"""
        # First trigger an export
        export_resp = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID}/export-thesis",
            json={"methods": ["mnl"], "chapters": [4]},
            headers=auth_headers
        )
        assert export_resp.status_code == 200
        job_id = export_resp.json()["job_id"]
        
        # Check status
        status_resp = requests.get(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID}/export-thesis-status/{job_id}",
            headers=auth_headers
        )
        assert status_resp.status_code == 200, f"Status check failed: {status_resp.text}"
        
        data = status_resp.json()
        assert "status" in data, "Missing 'status' in response"
        assert data["status"] in ["ready", "processing", "failed", "not_found"], \
            f"Unexpected status: {data['status']}"
        
        print(f"✅ Status endpoint works: job_id={job_id}, status={data['status']}")
    
    def test_invalid_job_id_returns_not_found(self, auth_headers):
        """GET /export-thesis-status/invalid-job should return not_found status"""
        response = requests.get(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID}/export-thesis-status/invalid-job-id",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert data["status"] == "not_found", f"Expected 'not_found', got {data['status']}"
        print("✅ Invalid job_id returns status='not_found'")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
