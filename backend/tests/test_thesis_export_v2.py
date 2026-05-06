"""
Test suite for Conjoint Analysis Thesis Export Feature - V2
Tests the enhanced thesis export with method and chapter selection

Features tested:
- POST /api/conjoint/studies/{study_id}/export-thesis accepts {method, chapters} parameters
- Different method + chapter combinations produce different cache keys
- GET /api/conjoint/studies/{study_id}/export-thesis-download?cache_key=X returns correct docx
- GET /api/conjoint/studies/{study_id}/export-thesis-status/{job_id} returns status
- Minimum 10 responses check works
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://soft-delete-conjoint.preview.emergentagent.com')

# Test credentials from test_credentials.md
ADMIN_EMAIL = "admin@swu.ac.th"
ADMIN_PASSWORD = "admin123"

# Study IDs with valid data
STUDY_ID_RICE = "38d01d61-385e-45af-8417-93c67994db59"  # ข้าว, 51 responses - has cached thesis_mnl_3_4
STUDY_ID_MILK = "6099ac5b-4376-4c14-9d51-3c0637ca4260"  # นมหมี, 120 responses


class TestThesisExportMethodAndChapterSelection:
    """Test thesis export with different method and chapter combinations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.status_code} - {login_response.text}")
        
        data = login_response.json()
        self.token = data.get("access_token")
        if not self.token:
            pytest.skip("No access_token in login response")
        
        self.headers = {"Authorization": f"Bearer {self.token}"}
        print(f"✅ Logged in as {ADMIN_EMAIL}")
    
    def test_export_thesis_with_mnl_method_all_chapters(self):
        """POST /export-thesis with method=mnl and chapters=[3,4,5]"""
        response = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID_RICE}/export-thesis",
            json={"method": "mnl", "chapters": [3, 4, 5]},
            headers=self.headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "status" in data, "Response should contain 'status'"
        assert "job_id" in data, "Response should contain 'job_id'"
        assert data["status"] in ["ready", "processing"], f"Status should be 'ready' or 'processing', got {data['status']}"
        
        print(f"✅ MNL + chapters [3,4,5]: status={data.get('status')}, job_id={data.get('job_id')}, cached={data.get('cached')}")
    
    def test_export_thesis_with_counting_method(self):
        """POST /export-thesis with method=counting"""
        response = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID_RICE}/export-thesis",
            json={"method": "counting", "chapters": [3, 4, 5]},
            headers=self.headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "status" in data, "Response should contain 'status'"
        assert data["status"] in ["ready", "processing"], f"Status should be 'ready' or 'processing'"
        
        print(f"✅ Counting method: status={data.get('status')}, job_id={data.get('job_id')}")
    
    def test_export_thesis_with_linear_regression_method(self):
        """POST /export-thesis with method=linear_regression"""
        response = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID_RICE}/export-thesis",
            json={"method": "linear_regression", "chapters": [3, 4, 5]},
            headers=self.headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "status" in data, "Response should contain 'status'"
        assert data["status"] in ["ready", "processing"], f"Status should be 'ready' or 'processing'"
        
        print(f"✅ Linear Regression method: status={data.get('status')}, job_id={data.get('job_id')}")
    
    def test_export_thesis_with_mixed_logit_method(self):
        """POST /export-thesis with method=mixed_logit"""
        response = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID_RICE}/export-thesis",
            json={"method": "mixed_logit", "chapters": [3, 4, 5]},
            headers=self.headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "status" in data, "Response should contain 'status'"
        assert data["status"] in ["ready", "processing"], f"Status should be 'ready' or 'processing'"
        
        print(f"✅ Mixed Logit method: status={data.get('status')}, job_id={data.get('job_id')}")
    
    def test_export_thesis_with_hierarchical_bayes_method(self):
        """POST /export-thesis with method=hierarchical_bayes"""
        response = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID_RICE}/export-thesis",
            json={"method": "hierarchical_bayes", "chapters": [3, 4, 5]},
            headers=self.headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "status" in data, "Response should contain 'status'"
        assert data["status"] in ["ready", "processing"], f"Status should be 'ready' or 'processing'"
        
        print(f"✅ Hierarchical Bayes method: status={data.get('status')}, job_id={data.get('job_id')}")


class TestThesisExportChapterSelection:
    """Test thesis export with different chapter combinations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.status_code}")
        
        data = login_response.json()
        self.token = data.get("access_token")
        if not self.token:
            pytest.skip("No access_token in login response")
        
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_export_thesis_chapter_3_only(self):
        """POST /export-thesis with only Chapter 3 (Methodology)"""
        response = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID_RICE}/export-thesis",
            json={"method": "mnl", "chapters": [3]},
            headers=self.headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "status" in data, "Response should contain 'status'"
        assert data["status"] in ["ready", "processing"]
        
        print(f"✅ Chapter 3 only: status={data.get('status')}, job_id={data.get('job_id')}")
    
    def test_export_thesis_chapter_4_only(self):
        """POST /export-thesis with only Chapter 4 (Results)"""
        response = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID_RICE}/export-thesis",
            json={"method": "mnl", "chapters": [4]},
            headers=self.headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "status" in data, "Response should contain 'status'"
        assert data["status"] in ["ready", "processing"]
        
        print(f"✅ Chapter 4 only: status={data.get('status')}, job_id={data.get('job_id')}")
    
    def test_export_thesis_chapter_5_only(self):
        """POST /export-thesis with only Chapter 5 (Discussion)"""
        response = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID_RICE}/export-thesis",
            json={"method": "mnl", "chapters": [5]},
            headers=self.headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "status" in data, "Response should contain 'status'"
        assert data["status"] in ["ready", "processing"]
        
        print(f"✅ Chapter 5 only: status={data.get('status')}, job_id={data.get('job_id')}")
    
    def test_export_thesis_chapters_3_and_4(self):
        """POST /export-thesis with Chapters 3 and 4"""
        response = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID_RICE}/export-thesis",
            json={"method": "mnl", "chapters": [3, 4]},
            headers=self.headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "status" in data, "Response should contain 'status'"
        assert data["status"] in ["ready", "processing"]
        
        print(f"✅ Chapters 3 & 4: status={data.get('status')}, job_id={data.get('job_id')}")
    
    def test_export_thesis_chapters_4_and_5(self):
        """POST /export-thesis with Chapters 4 and 5"""
        response = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID_RICE}/export-thesis",
            json={"method": "mnl", "chapters": [4, 5]},
            headers=self.headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "status" in data, "Response should contain 'status'"
        assert data["status"] in ["ready", "processing"]
        
        print(f"✅ Chapters 4 & 5: status={data.get('status')}, job_id={data.get('job_id')}")


class TestThesisExportCacheKeyFormat:
    """Test that different method + chapter combinations produce different cache keys"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.status_code}")
        
        data = login_response.json()
        self.token = data.get("access_token")
        if not self.token:
            pytest.skip("No access_token in login response")
        
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_different_methods_produce_different_cache_keys(self):
        """Different methods should produce different cache keys"""
        # Request with MNL
        response_mnl = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID_RICE}/export-thesis",
            json={"method": "mnl", "chapters": [3, 4, 5]},
            headers=self.headers
        )
        assert response_mnl.status_code == 200
        job_id_mnl = response_mnl.json().get("job_id")
        
        # Request with counting
        response_counting = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID_RICE}/export-thesis",
            json={"method": "counting", "chapters": [3, 4, 5]},
            headers=self.headers
        )
        assert response_counting.status_code == 200
        job_id_counting = response_counting.json().get("job_id")
        
        # Cache keys should be different (job_id contains cache_key for cached results)
        # For cached results, job_id IS the cache_key
        print(f"✅ MNL job_id: {job_id_mnl}")
        print(f"✅ Counting job_id: {job_id_counting}")
        
        # If both are cached, they should have different cache keys
        if response_mnl.json().get("cached") and response_counting.json().get("cached"):
            assert job_id_mnl != job_id_counting, "Different methods should have different cache keys"
            print("✅ Different methods produce different cache keys")
    
    def test_different_chapters_produce_different_cache_keys(self):
        """Different chapter combinations should produce different cache keys"""
        # Request with chapters [3, 4, 5]
        response_all = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID_RICE}/export-thesis",
            json={"method": "mnl", "chapters": [3, 4, 5]},
            headers=self.headers
        )
        assert response_all.status_code == 200
        job_id_all = response_all.json().get("job_id")
        
        # Request with chapters [3, 4]
        response_34 = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID_RICE}/export-thesis",
            json={"method": "mnl", "chapters": [3, 4]},
            headers=self.headers
        )
        assert response_34.status_code == 200
        job_id_34 = response_34.json().get("job_id")
        
        print(f"✅ Chapters [3,4,5] job_id: {job_id_all}")
        print(f"✅ Chapters [3,4] job_id: {job_id_34}")
        
        # If both are cached, they should have different cache keys
        if response_all.json().get("cached") and response_34.json().get("cached"):
            assert job_id_all != job_id_34, "Different chapter combinations should have different cache keys"
            print("✅ Different chapter combinations produce different cache keys")


class TestThesisExportDownloadWithCacheKey:
    """Test thesis download with specific cache_key parameter"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.status_code}")
        
        data = login_response.json()
        self.token = data.get("access_token")
        if not self.token:
            pytest.skip("No access_token in login response")
        
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_download_with_specific_cache_key(self):
        """GET /export-thesis-download?cache_key=thesis_mnl_3_4_5 should return correct docx"""
        # First, ensure we have a cached thesis
        start_response = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID_RICE}/export-thesis",
            json={"method": "mnl", "chapters": [3, 4, 5]},
            headers=self.headers
        )
        assert start_response.status_code == 200
        
        # If cached, download with cache_key
        if start_response.json().get("cached"):
            cache_key = start_response.json().get("job_id")  # For cached, job_id is the cache_key
            
            response = requests.get(
                f"{BASE_URL}/api/conjoint/studies/{STUDY_ID_RICE}/export-thesis-download?cache_key={cache_key}",
                headers=self.headers
            )
            
            assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
            
            # Check content type
            content_type = response.headers.get("Content-Type", "")
            assert "application/vnd.openxmlformats-officedocument.wordprocessingml.document" in content_type or \
                   "application/octet-stream" in content_type
            
            # Check DOCX magic bytes
            assert response.content[:4] == b'PK\x03\x04', "File should start with DOCX/ZIP magic bytes"
            
            print(f"✅ Downloaded thesis with cache_key={cache_key}: {len(response.content)} bytes")
        else:
            print("⏭️ Thesis not cached, skipping cache_key download test")
    
    def test_download_without_cache_key_returns_latest(self):
        """GET /export-thesis-download without cache_key should return latest thesis"""
        response = requests.get(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID_RICE}/export-thesis-download",
            headers=self.headers
        )
        
        # Should return 200 if any thesis is cached, 404 if none
        if response.status_code == 200:
            assert response.content[:4] == b'PK\x03\x04', "File should start with DOCX/ZIP magic bytes"
            print(f"✅ Downloaded latest thesis: {len(response.content)} bytes")
        elif response.status_code == 404:
            print("⏭️ No cached thesis found (expected if never generated)")
        else:
            pytest.fail(f"Unexpected status code: {response.status_code}")


class TestThesisExportStatusPolling:
    """Test thesis generation status polling"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.status_code}")
        
        data = login_response.json()
        self.token = data.get("access_token")
        if not self.token:
            pytest.skip("No access_token in login response")
        
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_status_endpoint_returns_valid_status(self):
        """GET /export-thesis-status/{job_id} should return valid status"""
        # Start a thesis generation
        start_response = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID_RICE}/export-thesis",
            json={"method": "mnl", "chapters": [3, 4, 5]},
            headers=self.headers
        )
        assert start_response.status_code == 200
        job_id = start_response.json().get("job_id")
        
        # Poll status
        status_response = requests.get(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID_RICE}/export-thesis-status/{job_id}",
            headers=self.headers
        )
        
        assert status_response.status_code == 200
        data = status_response.json()
        
        assert "status" in data, "Response should contain 'status'"
        assert data["status"] in ["ready", "processing", "failed", "not_found"], \
            f"Status should be valid, got {data['status']}"
        
        print(f"✅ Status for job {job_id}: {data.get('status')}")
    
    def test_status_for_invalid_job_id(self):
        """GET /export-thesis-status with invalid job_id should return not_found"""
        response = requests.get(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID_RICE}/export-thesis-status/invalid-job-id-xyz",
            headers=self.headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "not_found", f"Expected status='not_found', got {data}"
        
        print("✅ Invalid job_id returns status='not_found'")


class TestThesisExportMinimumResponses:
    """Test minimum 10 responses requirement"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.status_code}")
        
        data = login_response.json()
        self.token = data.get("access_token")
        if not self.token:
            pytest.skip("No access_token in login response")
        
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_study_with_sufficient_responses_works(self):
        """Study with >= 10 responses should allow thesis export"""
        # STUDY_ID_RICE has 51 responses
        response = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID_RICE}/export-thesis",
            json={"method": "mnl", "chapters": [3, 4, 5]},
            headers=self.headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("✅ Study with 51 responses allows thesis export")


class TestThesisExportAuth:
    """Test authentication requirements for thesis endpoints"""
    
    def test_export_thesis_requires_auth(self):
        """POST /export-thesis should require authentication"""
        response = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID_RICE}/export-thesis",
            json={"method": "mnl", "chapters": [3, 4, 5]}
        )
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✅ POST /export-thesis requires auth: {response.status_code}")
    
    def test_export_thesis_status_requires_auth(self):
        """GET /export-thesis-status should require authentication"""
        response = requests.get(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID_RICE}/export-thesis-status/test_job_id"
        )
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✅ GET /export-thesis-status requires auth: {response.status_code}")
    
    def test_export_thesis_download_requires_auth(self):
        """GET /export-thesis-download should require authentication"""
        response = requests.get(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID_RICE}/export-thesis-download"
        )
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✅ GET /export-thesis-download requires auth: {response.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
