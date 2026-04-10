"""
Test suite for Conjoint Analysis Thesis Export Feature
Tests the AI-powered thesis generation endpoints (Chapter 4 & 5)

Endpoints tested:
- POST /api/conjoint/studies/{study_id}/export-thesis - Start thesis generation
- GET /api/conjoint/studies/{study_id}/export-thesis-status/{job_id} - Poll job status
- GET /api/conjoint/studies/{study_id}/export-thesis-download - Download .docx file
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://kanban-subtasks-1.preview.emergentagent.com')

# Test credentials from test_credentials.md
ADMIN_EMAIL = "admin@swu.ac.th"
ADMIN_PASSWORD = "admin123"
STUDENT_EMAIL = "student1@swu.ac.th"
STUDENT_PASSWORD = "student123"

# Study IDs with valid data (from agent context)
STUDY_ID_RICE = "38d01d61-385e-45af-8417-93c67994db59"  # ข้าว, 51 responses - CACHED
STUDY_ID_MILK = "6099ac5b-4376-4c14-9d51-3c0637ca4260"  # นมหมี, 120 responses


class TestThesisExportAuth:
    """Test authentication requirements for thesis endpoints"""
    
    def test_export_thesis_requires_auth(self):
        """POST /export-thesis should require authentication"""
        response = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID_RICE}/export-thesis",
            json={"method": "mnl", "compare_all": True}
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


class TestThesisExportWithCachedData:
    """Test thesis export with cached data (study 38d01d61 has cached thesis)"""
    
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
        # Note: Response uses 'access_token' not 'token'
        self.token = data.get("access_token")
        if not self.token:
            pytest.skip("No access_token in login response")
        
        self.headers = {"Authorization": f"Bearer {self.token}"}
        print(f"✅ Logged in as {ADMIN_EMAIL}")
    
    def test_export_thesis_start_returns_ready_for_cached(self):
        """POST /export-thesis should return status='ready' for cached study"""
        response = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID_RICE}/export-thesis",
            json={"method": "mnl", "compare_all": True},
            headers=self.headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Should return ready immediately since thesis is cached
        assert "status" in data, "Response should contain 'status'"
        assert "job_id" in data, "Response should contain 'job_id'"
        
        print(f"✅ POST /export-thesis response: status={data.get('status')}, job_id={data.get('job_id')}, cached={data.get('cached')}")
        
        # If cached, status should be 'ready'
        if data.get("cached"):
            assert data["status"] == "ready", f"Cached thesis should have status='ready', got {data['status']}"
            print("✅ Cached thesis returned status='ready' immediately")
    
    def test_export_thesis_download_returns_docx(self):
        """GET /export-thesis-download should return valid .docx file"""
        response = requests.get(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID_RICE}/export-thesis-download",
            headers=self.headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Check content type
        content_type = response.headers.get("Content-Type", "")
        assert "application/vnd.openxmlformats-officedocument.wordprocessingml.document" in content_type or \
               "application/octet-stream" in content_type, \
               f"Expected docx content type, got {content_type}"
        
        # Check content disposition
        content_disp = response.headers.get("Content-Disposition", "")
        assert "attachment" in content_disp, f"Expected attachment disposition, got {content_disp}"
        assert ".docx" in content_disp, f"Expected .docx filename, got {content_disp}"
        
        # Check file size (should be reasonable for a thesis document)
        content_length = len(response.content)
        assert content_length > 1000, f"File too small ({content_length} bytes), expected > 1KB"
        assert content_length < 10_000_000, f"File too large ({content_length} bytes), expected < 10MB"
        
        # Check DOCX magic bytes (PK zip header)
        assert response.content[:4] == b'PK\x03\x04', "File should start with DOCX/ZIP magic bytes"
        
        print(f"✅ Downloaded thesis .docx: {content_length} bytes")
        print(f"   Content-Type: {content_type}")
        print(f"   Content-Disposition: {content_disp}")


class TestThesisExportValidation:
    """Test validation and error handling"""
    
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
    
    def test_export_thesis_invalid_study_id(self):
        """POST /export-thesis with invalid study_id should return 404"""
        response = requests.post(
            f"{BASE_URL}/api/conjoint/studies/invalid-study-id-12345/export-thesis",
            json={"method": "mnl", "compare_all": True},
            headers=self.headers
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print(f"✅ Invalid study_id returns 404")
    
    def test_export_thesis_status_invalid_job_id(self):
        """GET /export-thesis-status with invalid job_id should return not_found status"""
        response = requests.get(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID_RICE}/export-thesis-status/invalid-job-id",
            headers=self.headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("status") == "not_found", f"Expected status='not_found', got {data}"
        print(f"✅ Invalid job_id returns status='not_found'")
    
    def test_export_thesis_download_invalid_study_id(self):
        """GET /export-thesis-download with invalid study_id should return 404"""
        response = requests.get(
            f"{BASE_URL}/api/conjoint/studies/invalid-study-id-12345/export-thesis-download",
            headers=self.headers
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print(f"✅ Invalid study_id for download returns 404")


class TestThesisExportStudyWithManyResponses:
    """Test thesis export with study that has many responses (นมหมี - 120 responses)"""
    
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
    
    def test_export_thesis_start_for_milk_study(self):
        """POST /export-thesis for milk study should work"""
        response = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID_MILK}/export-thesis",
            json={"method": "mnl", "compare_all": True},
            headers=self.headers
        )
        
        # Should return 200 (either ready or processing)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "status" in data, "Response should contain 'status'"
        assert data["status"] in ["ready", "processing"], f"Status should be 'ready' or 'processing', got {data['status']}"
        
        print(f"✅ Milk study thesis export: status={data.get('status')}, job_id={data.get('job_id')}")


class TestStudyResultsEndpoint:
    """Test that study results endpoint works (prerequisite for thesis)"""
    
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
    
    def test_get_study_details(self):
        """GET /conjoint/studies/{study_id} should return study details"""
        response = requests.get(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID_RICE}?view=summary",
            headers=self.headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "id" in data, "Response should contain 'id'"
        assert "title" in data, "Response should contain 'title'"
        assert data["id"] == STUDY_ID_RICE, f"Study ID mismatch"
        
        print(f"✅ Study details: title='{data.get('title')}', respondent_count={data.get('respondent_count')}")
    
    def test_get_study_results(self):
        """GET /conjoint/studies/{study_id}/results should return analysis results"""
        response = requests.get(
            f"{BASE_URL}/api/conjoint/studies/{STUDY_ID_RICE}/results",
            headers=self.headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "respondent_count" in data, "Response should contain 'respondent_count'"
        assert data["respondent_count"] >= 10, f"Should have at least 10 respondents, got {data['respondent_count']}"
        
        print(f"✅ Study results: respondent_count={data.get('respondent_count')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
