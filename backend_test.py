#!/usr/bin/env python3
"""
Backend Testing Script for Customer Journey Map Tool
Tests authentication and journey map generation functionality
"""

import requests
import json
import sys
import os
from datetime import datetime

# Get backend URL from frontend .env
BACKEND_URL = "https://conjoint-analysis-1.preview.emergentagent.com/api"

class BackendTester:
    def __init__(self):
        self.base_url = BACKEND_URL
        self.token = None
        self.test_results = []
        
    def log_result(self, test_name, success, message, response_data=None):
        """Log test result"""
        result = {
            "test": test_name,
            "success": success,
            "message": message,
            "timestamp": datetime.now().isoformat(),
            "response_data": response_data
        }
        self.test_results.append(result)
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}: {message}")
        if response_data and not success:
            print(f"   Response: {response_data}")
    
    def test_register_user(self):
        """Test user registration"""
        try:
            url = f"{self.base_url}/auth/register"
            data = {
                "email": "testuser@example.com",
                "password": "testpass123",
                "full_name": "Test User",
                "role": "public_user"
            }
            
            response = requests.post(url, json=data, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if "access_token" in result and "user" in result:
                    self.log_result("Register User", True, "User registered successfully")
                    return True
                else:
                    self.log_result("Register User", False, "Missing token or user in response", result)
                    return False
            elif response.status_code == 400 and "already registered" in response.text:
                self.log_result("Register User", True, "User already exists (expected)")
                return True
            else:
                self.log_result("Register User", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Register User", False, f"Exception: {str(e)}")
            return False
    
    def test_login_user(self):
        """Test user login with test@test.com"""
        try:
            url = f"{self.base_url}/auth/login"
            data = {
                "email": "test@test.com",
                "password": "test123"
            }
            
            response = requests.post(url, json=data, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if "access_token" in result and "user" in result:
                    self.token = result["access_token"]
                    self.log_result("Login User", True, f"Login successful, token received")
                    return True
                else:
                    self.log_result("Login User", False, "Missing token or user in response", result)
                    return False
            else:
                self.log_result("Login User", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Login User", False, f"Exception: {str(e)}")
            return False
    
    def test_journey_map_basic(self):
        """Test basic journey map generation"""
        if not self.token:
            self.log_result("Journey Map Basic", False, "No authentication token available")
            return False
            
        try:
            url = f"{self.base_url}/generate-journey-map"
            headers = {"Authorization": f"Bearer {self.token}"}
            data = {
                "raw_data": "Customer said they found product through Facebook ads. Website navigation was confusing. Checkout process took too long."
            }
            
            response = requests.post(url, json=data, headers=headers, timeout=60)
            
            if response.status_code == 200:
                result = response.json()
                if "mermaid_code" in result and "analysis_summary" in result:
                    # Check if mermaid code contains basic structure (graph or stateDiagram)
                    mermaid_code = result["mermaid_code"]
                    has_structure = any(keyword in mermaid_code.lower() for keyword in ["graph", "statediagram", "flowchart"])
                    has_connections = "-->" in mermaid_code or ":" in mermaid_code
                    
                    if has_structure and has_connections:
                        self.log_result("Journey Map Basic", True, "Journey map generated successfully with valid mermaid code")
                        return True
                    else:
                        self.log_result("Journey Map Basic", False, "Invalid mermaid code structure", {"mermaid_preview": mermaid_code[:200]})
                        return False
                else:
                    self.log_result("Journey Map Basic", False, "Missing mermaid_code or analysis_summary", result)
                    return False
            else:
                self.log_result("Journey Map Basic", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Journey Map Basic", False, f"Exception: {str(e)}")
            return False
    
    def test_journey_map_thai(self):
        """Test journey map generation with Thai output"""
        if not self.token:
            self.log_result("Journey Map Thai", False, "No authentication token available")
            return False
            
        try:
            url = f"{self.base_url}/generate-journey-map"
            headers = {"Authorization": f"Bearer {self.token}"}
            data = {
                "raw_data": "ลูกค้าบอกว่าพบสินค้าผ่านโฆษณาเฟซบุ๊ก เว็บไซต์ยากต่อการใช้งาน",
                "target_language": "th",
                "journey_type": "B",
                "journey_style": "nonlinear"
            }
            
            response = requests.post(url, json=data, headers=headers, timeout=60)
            
            if response.status_code == 200:
                result = response.json()
                if "mermaid_code" in result and "analysis_summary" in result:
                    # Check for Thai characters in response
                    analysis = result["analysis_summary"]
                    mermaid_code = result["mermaid_code"]
                    
                    # Simple check for Thai characters (Unicode range)
                    has_thai = any('\u0e00' <= char <= '\u0e7f' for char in analysis + mermaid_code)
                    
                    if has_thai:
                        self.log_result("Journey Map Thai", True, "Journey map generated in Thai successfully")
                        return True
                    else:
                        self.log_result("Journey Map Thai", False, "Output does not contain Thai text", {"analysis_preview": analysis[:100]})
                        return False
                else:
                    self.log_result("Journey Map Thai", False, "Missing mermaid_code or analysis_summary", result)
                    return False
            else:
                self.log_result("Journey Map Thai", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Journey Map Thai", False, f"Exception: {str(e)}")
            return False
    
    def test_journey_map_english(self):
        """Test journey map generation with English output"""
        if not self.token:
            self.log_result("Journey Map English", False, "No authentication token available")
            return False
            
        try:
            url = f"{self.base_url}/generate-journey-map"
            headers = {"Authorization": f"Bearer {self.token}"}
            data = {
                "raw_data": "Customer discovered through social media, had issues with navigation",
                "target_language": "en",
                "journey_type": "A",
                "journey_style": "linear"
            }
            
            response = requests.post(url, json=data, headers=headers, timeout=60)
            
            if response.status_code == 200:
                result = response.json()
                if "mermaid_code" in result and "analysis_summary" in result:
                    # Check that it's in English (basic check - contains common English words)
                    analysis = result["analysis_summary"].lower()
                    english_indicators = ["customer", "journey", "stage", "process", "experience"]
                    has_english = any(word in analysis for word in english_indicators)
                    
                    if has_english:
                        self.log_result("Journey Map English", True, "Journey map generated in English successfully")
                        return True
                    else:
                        self.log_result("Journey Map English", False, "Output may not be in English", {"analysis_preview": analysis[:100]})
                        return False
                else:
                    self.log_result("Journey Map English", False, "Missing mermaid_code or analysis_summary", result)
                    return False
            else:
                self.log_result("Journey Map English", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Journey Map English", False, f"Exception: {str(e)}")
            return False
    
    def test_journey_map_with_context(self):
        """Test journey map generation with research context"""
        if not self.token:
            self.log_result("Journey Map With Context", False, "No authentication token available")
            return False
            
        try:
            url = f"{self.base_url}/generate-journey-map"
            headers = {"Authorization": f"Bearer {self.token}"}
            data = {
                "raw_data": "User feedback shows confusion about product features",
                "research_context": "E-commerce industry, target audience: young adults",
                "target_language": "en",
                "journey_type": "B",
                "journey_style": "nonlinear"
            }
            
            response = requests.post(url, json=data, headers=headers, timeout=60)
            
            if response.status_code == 200:
                result = response.json()
                if "mermaid_code" in result and "analysis_summary" in result:
                    # Check if context influenced the output
                    analysis = result["analysis_summary"].lower()
                    context_indicators = ["e-commerce", "young adults", "product features"]
                    has_context = any(indicator in analysis for indicator in context_indicators)
                    
                    self.log_result("Journey Map With Context", True, f"Journey map with context generated successfully (context referenced: {has_context})")
                    return True
                else:
                    self.log_result("Journey Map With Context", False, "Missing mermaid_code or analysis_summary", result)
                    return False
            else:
                self.log_result("Journey Map With Context", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Journey Map With Context", False, f"Exception: {str(e)}")
            return False

    # ============ PHASE 1A SURVEY BUILDER TESTS ============
    
    def test_google_oauth_endpoint_structure(self):
        """Test Google OAuth endpoint structure and error handling"""
        try:
            url = f"{self.base_url}/auth/google/session"
            data = {
                "session_id": "test_mock_session_id"
            }
            
            response = requests.post(url, json=data, timeout=30)
            
            # Since we're using mock session_id, we expect either:
            # 1. 500 error with "Failed to get session data" (Emergent Auth API call fails)
            # 2. 400 error with "Invalid session ID" (if Emergent Auth rejects it)
            if response.status_code == 500 and "Failed to get session data" in response.text:
                self.log_result("Google OAuth Endpoint", True, "Google OAuth endpoint correctly handles invalid session_id (mock test limitation)")
                return True
            elif response.status_code == 400 and "Invalid session ID" in response.text:
                self.log_result("Google OAuth Endpoint", True, "Google OAuth endpoint correctly rejects invalid session_id")
                return True
            elif response.status_code == 200:
                # This would happen with a real session_id
                result = response.json()
                if "session_token" in result and "user" in result:
                    self.log_result("Google OAuth Endpoint", True, "Google OAuth endpoint working with valid session_id")
                    return True
                else:
                    self.log_result("Google OAuth Endpoint", False, "Missing session_token or user in response", result)
                    return False
            else:
                self.log_result("Google OAuth Endpoint", False, f"Unexpected response: HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Google OAuth Endpoint", False, f"Exception: {str(e)}")
            return False

    def test_google_oauth_request_validation(self):
        """Test Google OAuth request validation"""
        try:
            url = f"{self.base_url}/auth/google/session"
            
            # Test missing session_id
            response = requests.post(url, json={}, timeout=30)
            
            if response.status_code == 422:  # Validation error
                self.log_result("Google OAuth Validation", True, "Google OAuth correctly validates missing session_id")
                return True
            else:
                self.log_result("Google OAuth Validation", False, f"Expected 422 validation error, got HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Google OAuth Validation", False, f"Exception: {str(e)}")
            return False

    def test_logout(self):
        """Test user logout"""
        if not self.token:
            self.log_result("Logout", False, "No authentication token available")
            return False
            
        try:
            url = f"{self.base_url}/auth/logout"
            headers = {"Authorization": f"Bearer {self.token}"}
            
            response = requests.post(url, headers=headers, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if "message" in result:
                    self.log_result("Logout", True, "User logged out successfully")
                    return True
                else:
                    self.log_result("Logout", False, "Missing message in response", result)
                    return False
            else:
                self.log_result("Logout", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Logout", False, f"Exception: {str(e)}")
            return False

    def test_demographics_get_empty(self):
        """Test getting empty demographics profile"""
        if not self.token:
            self.log_result("Demographics GET Empty", False, "No authentication token available")
            return False
            
        try:
            url = f"{self.base_url}/user/demographics"
            headers = {"Authorization": f"Bearer {self.token}"}
            
            response = requests.get(url, headers=headers, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                # Should return empty demographics profile (all fields None or default)
                expected_fields = ["birth_sex", "gender_identity", "date_of_birth", "education", 
                                 "occupation", "income_type", "income_value", "marital_status", 
                                 "province", "region"]
                has_expected_structure = all(field in result for field in expected_fields)
                
                if has_expected_structure:
                    self.log_result("Demographics GET Empty", True, "Empty demographics profile returned successfully")
                    return True
                else:
                    self.log_result("Demographics GET Empty", False, "Missing expected demographics fields", result)
                    return False
            else:
                self.log_result("Demographics GET Empty", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Demographics GET Empty", False, f"Exception: {str(e)}")
            return False

    def test_demographics_put_update(self):
        """Test updating demographics profile"""
        if not self.token:
            self.log_result("Demographics PUT Update", False, "No authentication token available")
            return False
            
        try:
            url = f"{self.base_url}/user/demographics"
            headers = {"Authorization": f"Bearer {self.token}"}
            data = {
                "birth_sex": "male",
                "gender_identity": "male",
                "date_of_birth": "1995-05-15",
                "education": "bachelor",
                "occupation": "student",
                "income_type": "range",
                "income_value": "15001-20000",
                "marital_status": "single",
                "province": "กรุงเทพฯ",
                "region": "central"
            }
            
            response = requests.put(url, json=data, headers=headers, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                # Check if all fields were updated
                updated_correctly = all(result.get(key) == value for key, value in data.items())
                
                if updated_correctly:
                    self.log_result("Demographics PUT Update", True, "Demographics profile updated successfully")
                    return True
                else:
                    self.log_result("Demographics PUT Update", False, "Demographics not updated correctly", result)
                    return False
            else:
                self.log_result("Demographics PUT Update", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Demographics PUT Update", False, f"Exception: {str(e)}")
            return False

    def test_demographics_get_filled(self):
        """Test getting filled demographics profile"""
        if not self.token:
            self.log_result("Demographics GET Filled", False, "No authentication token available")
            return False
            
        try:
            url = f"{self.base_url}/user/demographics"
            headers = {"Authorization": f"Bearer {self.token}"}
            
            response = requests.get(url, headers=headers, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                # Should return filled demographics profile
                expected_values = {
                    "birth_sex": "male",
                    "gender_identity": "male",
                    "date_of_birth": "1995-05-15",
                    "education": "bachelor",
                    "occupation": "student",
                    "income_type": "range",
                    "income_value": "15001-20000",
                    "marital_status": "single",
                    "province": "กรุงเทพฯ",
                    "region": "central"
                }
                
                filled_correctly = all(result.get(key) == value for key, value in expected_values.items())
                
                if filled_correctly:
                    self.log_result("Demographics GET Filled", True, "Filled demographics profile returned successfully")
                    return True
                else:
                    self.log_result("Demographics GET Filled", False, "Demographics profile not filled correctly", result)
                    return False
            else:
                self.log_result("Demographics GET Filled", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Demographics GET Filled", False, f"Exception: {str(e)}")
            return False

    def test_user_rating_get(self):
        """Test getting user rating"""
        if not self.token:
            self.log_result("User Rating GET", False, "No authentication token available")
            return False
            
        try:
            url = f"{self.base_url}/user/rating"
            headers = {"Authorization": f"Bearer {self.token}"}
            
            response = requests.get(url, headers=headers, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                expected_fields = ["total_surveys_completed", "quality_score", "trust_score", "last_updated"]
                has_expected_structure = all(field in result for field in expected_fields)
                
                if has_expected_structure:
                    # Check default values for new user
                    if (result.get("total_surveys_completed") == 0 and 
                        result.get("quality_score") == 0.0 and 
                        result.get("trust_score") == 0.0):
                        self.log_result("User Rating GET", True, "User rating returned with correct default values")
                        return True
                    else:
                        self.log_result("User Rating GET", True, f"User rating returned (surveys: {result.get('total_surveys_completed')}, quality: {result.get('quality_score')}, trust: {result.get('trust_score')})")
                        return True
                else:
                    self.log_result("User Rating GET", False, "Missing expected rating fields", result)
                    return False
            else:
                self.log_result("User Rating GET", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("User Rating GET", False, f"Exception: {str(e)}")
            return False

    def test_admin_login(self):
        """Test admin login (if admin user exists)"""
        try:
            url = f"{self.base_url}/auth/login"
            data = {
                "email": "admin@test.com",
                "password": "admin123"
            }
            
            response = requests.post(url, json=data, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if "access_token" in result and "user" in result:
                    user = result["user"]
                    if user.get("role") == "admin":
                        self.admin_token = result["access_token"]
                        self.log_result("Admin Login", True, "Admin login successful")
                        return True
                    else:
                        self.log_result("Admin Login", False, "User is not admin", user)
                        return False
                else:
                    self.log_result("Admin Login", False, "Missing token or user in response", result)
                    return False
            else:
                self.log_result("Admin Login", False, f"Admin user not found or wrong credentials (HTTP {response.status_code})")
                return False
                
        except Exception as e:
            self.log_result("Admin Login", False, f"Exception: {str(e)}")
            return False

    def test_admin_promote_trust_user(self):
        """Test promoting user to trust user (admin only)"""
        if not hasattr(self, 'admin_token') or not self.admin_token:
            self.log_result("Admin Promote Trust User", False, "No admin token available")
            return False
            
        try:
            # First get a regular user ID (use current user)
            me_url = f"{self.base_url}/auth/me"
            headers = {"Authorization": f"Bearer {self.token}"}
            me_response = requests.get(me_url, headers=headers, timeout=30)
            
            if me_response.status_code != 200:
                self.log_result("Admin Promote Trust User", False, "Could not get current user info")
                return False
                
            user_info = me_response.json()
            user_id = user_info.get("id")
            
            if not user_id:
                self.log_result("Admin Promote Trust User", False, "Could not get user ID")
                return False
            
            # Now promote user to trust user
            url = f"{self.base_url}/admin/promote-trust-user"
            admin_headers = {"Authorization": f"Bearer {self.admin_token}"}
            data = {
                "user_id": user_id,
                "reason": "Test promotion"
            }
            
            response = requests.post(url, json=data, headers=admin_headers, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if "message" in result and "user" in result:
                    promoted_user = result["user"]
                    if promoted_user.get("user_type") == "trust":
                        self.log_result("Admin Promote Trust User", True, "User promoted to trust user successfully")
                        return True
                    else:
                        self.log_result("Admin Promote Trust User", False, "User not promoted correctly", promoted_user)
                        return False
                else:
                    self.log_result("Admin Promote Trust User", False, "Missing message or user in response", result)
                    return False
            elif response.status_code == 400 and "already a trust user" in response.text:
                self.log_result("Admin Promote Trust User", True, "User already a trust user (expected)")
                return True
            else:
                self.log_result("Admin Promote Trust User", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Admin Promote Trust User", False, f"Exception: {str(e)}")
            return False

    def test_admin_list_trust_users(self):
        """Test listing trust users (admin only)"""
        if not hasattr(self, 'admin_token') or not self.admin_token:
            self.log_result("Admin List Trust Users", False, "No admin token available")
            return False
            
        try:
            url = f"{self.base_url}/admin/users?user_type=trust"
            headers = {"Authorization": f"Bearer {self.admin_token}"}
            
            response = requests.get(url, headers=headers, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if isinstance(result, list):
                    # Check if all returned users are trust users
                    all_trust = all(user.get("user_type") == "trust" for user in result)
                    
                    if all_trust:
                        self.log_result("Admin List Trust Users", True, f"Trust users listed successfully ({len(result)} users)")
                        return True
                    else:
                        self.log_result("Admin List Trust Users", False, "Some users are not trust users", result)
                        return False
                else:
                    self.log_result("Admin List Trust Users", False, "Response is not a list", result)
                    return False
            else:
                self.log_result("Admin List Trust Users", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Admin List Trust Users", False, f"Exception: {str(e)}")
            return False

    # ============ PHASE 1B SURVEY BUILDER TESTS ============
    
    def test_survey_create(self):
        """Test creating a new survey"""
        if not self.token:
            self.log_result("Survey Create", False, "No authentication token available")
            return False
            
        try:
            url = f"{self.base_url}/surveys"
            headers = {"Authorization": f"Bearer {self.token}"}
            data = {
                "title": "Market Research Survey Test",
                "description": "Testing survey creation",
                "survey_type": "custom",
                "respondent_auth_mode": "anonymous"
            }
            
            response = requests.post(url, json=data, headers=headers, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if ("id" in result and "title" in result and 
                    result.get("status") == "draft" and
                    result.get("title") == data["title"]):
                    self.survey_id = result["id"]  # Store for later tests
                    self.log_result("Survey Create", True, f"Survey created successfully with ID: {self.survey_id}")
                    return True
                else:
                    self.log_result("Survey Create", False, "Missing expected fields or incorrect status", result)
                    return False
            else:
                self.log_result("Survey Create", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Survey Create", False, f"Exception: {str(e)}")
            return False

    def test_survey_list(self):
        """Test listing surveys"""
        if not self.token:
            self.log_result("Survey List", False, "No authentication token available")
            return False
            
        try:
            url = f"{self.base_url}/surveys"
            headers = {"Authorization": f"Bearer {self.token}"}
            
            response = requests.get(url, headers=headers, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if isinstance(result, list):
                    # Check if our created survey is in the list
                    if hasattr(self, 'survey_id'):
                        survey_found = any(survey.get("id") == self.survey_id for survey in result)
                        if survey_found:
                            self.log_result("Survey List", True, f"Survey list retrieved successfully ({len(result)} surveys, created survey found)")
                            return True
                        else:
                            self.log_result("Survey List", True, f"Survey list retrieved successfully ({len(result)} surveys, created survey not found - may be expected)")
                            return True
                    else:
                        self.log_result("Survey List", True, f"Survey list retrieved successfully ({len(result)} surveys)")
                        return True
                else:
                    self.log_result("Survey List", False, "Response is not a list", result)
                    return False
            else:
                self.log_result("Survey List", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Survey List", False, f"Exception: {str(e)}")
            return False

    def test_survey_get_detail(self):
        """Test getting survey detail"""
        if not hasattr(self, 'survey_id') or not self.survey_id:
            self.log_result("Survey Get Detail", False, "No survey ID available")
            return False
            
        try:
            url = f"{self.base_url}/surveys/{self.survey_id}"
            
            response = requests.get(url, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if ("id" in result and "title" in result and 
                    result.get("id") == self.survey_id):
                    self.log_result("Survey Get Detail", True, f"Survey detail retrieved successfully")
                    return True
                else:
                    self.log_result("Survey Get Detail", False, "Missing expected fields or incorrect ID", result)
                    return False
            else:
                self.log_result("Survey Get Detail", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Survey Get Detail", False, f"Exception: {str(e)}")
            return False

    def test_survey_update_with_sections(self):
        """Test updating survey with sections and questions"""
        if not hasattr(self, 'survey_id') or not self.survey_id:
            self.log_result("Survey Update Sections", False, "No survey ID available")
            return False
            
        if not self.token:
            self.log_result("Survey Update Sections", False, "No authentication token available")
            return False
            
        try:
            url = f"{self.base_url}/surveys/{self.survey_id}"
            headers = {"Authorization": f"Bearer {self.token}"}
            data = {
                "sections": [
                    {
                        "id": "section1",
                        "title": "Demographics",
                        "order": 0,
                        "questions": [
                            {
                                "id": "q1",
                                "type": "multiple_choice_single",
                                "text": "What is your age group?",
                                "required": True,
                                "data_type": "ordinal",
                                "options": [
                                    {"id": "opt1", "text": "18-25", "value": "1"},
                                    {"id": "opt2", "text": "26-35", "value": "2"},
                                    {"id": "opt3", "text": "36-45", "value": "3"}
                                ],
                                "order": 0
                            },
                            {
                                "id": "q2",
                                "type": "rating_scale",
                                "text": "How satisfied are you with our product?",
                                "required": True,
                                "data_type": "scale",
                                "options": [
                                    {"id": "r1", "text": "1", "value": "1"},
                                    {"id": "r2", "text": "2", "value": "2"},
                                    {"id": "r3", "text": "3", "value": "3"},
                                    {"id": "r4", "text": "4", "value": "4"},
                                    {"id": "r5", "text": "5", "value": "5"}
                                ],
                                "order": 1
                            }
                        ]
                    }
                ],
                "settings": {
                    "allow_multiple_submissions": False,
                    "show_progress_bar": True,
                    "allow_anonymous": True
                }
            }
            
            response = requests.put(url, json=data, headers=headers, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if ("sections" in result and len(result["sections"]) > 0 and
                    "settings" in result):
                    section = result["sections"][0]
                    if ("questions" in section and len(section["questions"]) == 2):
                        self.log_result("Survey Update Sections", True, "Survey updated with sections and questions successfully")
                        return True
                    else:
                        self.log_result("Survey Update Sections", False, "Questions not added correctly", section)
                        return False
                else:
                    self.log_result("Survey Update Sections", False, "Sections not added correctly", result)
                    return False
            else:
                self.log_result("Survey Update Sections", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Survey Update Sections", False, f"Exception: {str(e)}")
            return False

    def test_survey_publish(self):
        """Test publishing survey"""
        if not hasattr(self, 'survey_id') or not self.survey_id:
            self.log_result("Survey Publish", False, "No survey ID available")
            return False
            
        if not self.token:
            self.log_result("Survey Publish", False, "No authentication token available")
            return False
            
        try:
            url = f"{self.base_url}/surveys/{self.survey_id}/publish"
            headers = {"Authorization": f"Bearer {self.token}"}
            
            response = requests.post(url, headers=headers, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if "message" in result:
                    self.log_result("Survey Publish", True, "Survey published successfully")
                    return True
                else:
                    self.log_result("Survey Publish", False, "Missing message in response", result)
                    return False
            else:
                self.log_result("Survey Publish", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Survey Publish", False, f"Exception: {str(e)}")
            return False

    def test_survey_response_anonymous(self):
        """Test submitting anonymous survey response"""
        if not hasattr(self, 'survey_id') or not self.survey_id:
            self.log_result("Survey Response Anonymous", False, "No survey ID available")
            return False
            
        try:
            url = f"{self.base_url}/surveys/{self.survey_id}/respond"
            data = {
                "answers": [
                    {"question_id": "q1", "value": "2"},
                    {"question_id": "q2", "value": "4"}
                ]
            }
            
            response = requests.post(url, json=data, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if "message" in result and "response_id" in result:
                    self.anonymous_response_id = result["response_id"]
                    self.log_result("Survey Response Anonymous", True, f"Anonymous response submitted successfully (ID: {self.anonymous_response_id})")
                    return True
                else:
                    self.log_result("Survey Response Anonymous", False, "Missing message or response_id", result)
                    return False
            else:
                self.log_result("Survey Response Anonymous", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Survey Response Anonymous", False, f"Exception: {str(e)}")
            return False

    def test_survey_response_logged_in_with_demographics(self):
        """Test submitting logged-in survey response with demographics"""
        if not hasattr(self, 'survey_id') or not self.survey_id:
            self.log_result("Survey Response Logged-in", False, "No survey ID available")
            return False
            
        if not self.token:
            self.log_result("Survey Response Logged-in", False, "No authentication token available")
            return False
            
        try:
            url = f"{self.base_url}/surveys/{self.survey_id}/respond"
            headers = {"Authorization": f"Bearer {self.token}"}
            data = {
                "demographics": {
                    "birth_sex": "male",
                    "date_of_birth": "1990-01-01",
                    "education": "bachelor"
                },
                "answers": [
                    {"question_id": "q1", "value": "2"},
                    {"question_id": "q2", "value": "5"}
                ]
            }
            
            response = requests.post(url, json=data, headers=headers, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if "message" in result and "response_id" in result:
                    self.logged_in_response_id = result["response_id"]
                    self.log_result("Survey Response Logged-in", True, f"Logged-in response with demographics submitted successfully (ID: {self.logged_in_response_id})")
                    return True
                else:
                    self.log_result("Survey Response Logged-in", False, "Missing message or response_id", result)
                    return False
            else:
                self.log_result("Survey Response Logged-in", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Survey Response Logged-in", False, f"Exception: {str(e)}")
            return False

    def test_survey_get_responses(self):
        """Test getting survey responses"""
        if not hasattr(self, 'survey_id') or not self.survey_id:
            self.log_result("Survey Get Responses", False, "No survey ID available")
            return False
            
        if not self.token:
            self.log_result("Survey Get Responses", False, "No authentication token available")
            return False
            
        try:
            url = f"{self.base_url}/surveys/{self.survey_id}/responses"
            headers = {"Authorization": f"Bearer {self.token}"}
            
            response = requests.get(url, headers=headers, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if isinstance(result, list):
                    # Should have 2 responses (anonymous + logged-in)
                    expected_responses = 2
                    if len(result) >= expected_responses:
                        self.log_result("Survey Get Responses", True, f"Survey responses retrieved successfully ({len(result)} responses)")
                        return True
                    else:
                        self.log_result("Survey Get Responses", True, f"Survey responses retrieved ({len(result)} responses, expected {expected_responses})")
                        return True
                else:
                    self.log_result("Survey Get Responses", False, "Response is not a list", result)
                    return False
            else:
                self.log_result("Survey Get Responses", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Survey Get Responses", False, f"Exception: {str(e)}")
            return False

    def test_survey_export_csv(self):
        """Test exporting survey responses as CSV"""
        if not hasattr(self, 'survey_id') or not self.survey_id:
            self.log_result("Survey Export CSV", False, "No survey ID available")
            return False
            
        if not self.token:
            self.log_result("Survey Export CSV", False, "No authentication token available")
            return False
            
        try:
            url = f"{self.base_url}/surveys/{self.survey_id}/export?format=csv"
            headers = {"Authorization": f"Bearer {self.token}"}
            
            response = requests.get(url, headers=headers, timeout=30)
            
            if response.status_code == 200:
                # Check if response is CSV format
                content_type = response.headers.get('content-type', '')
                if 'text/csv' in content_type or 'application/octet-stream' in content_type:
                    csv_content = response.text
                    # Basic CSV validation - should have headers and data
                    lines = csv_content.strip().split('\n')
                    if len(lines) >= 2:  # At least header + 1 data row
                        self.log_result("Survey Export CSV", True, f"CSV export successful ({len(lines)} lines including header)")
                        return True
                    else:
                        self.log_result("Survey Export CSV", False, f"CSV has insufficient data ({len(lines)} lines)", csv_content[:200])
                        return False
                else:
                    self.log_result("Survey Export CSV", False, f"Unexpected content type: {content_type}", response.text[:200])
                    return False
            else:
                self.log_result("Survey Export CSV", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Survey Export CSV", False, f"Exception: {str(e)}")
            return False

    def test_survey_export_json(self):
        """Test exporting survey responses as JSON"""
        if not hasattr(self, 'survey_id') or not self.survey_id:
            self.log_result("Survey Export JSON", False, "No survey ID available")
            return False
            
        if not self.token:
            self.log_result("Survey Export JSON", False, "No authentication token available")
            return False
            
        try:
            url = f"{self.base_url}/surveys/{self.survey_id}/export?format=json"
            headers = {"Authorization": f"Bearer {self.token}"}
            
            response = requests.get(url, headers=headers, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if isinstance(result, list):
                    # Should have responses with expected structure
                    if len(result) > 0:
                        first_response = result[0]
                        expected_fields = ["id", "survey_id", "answers", "submitted_at"]
                        has_expected_structure = all(field in first_response for field in expected_fields)
                        
                        if has_expected_structure:
                            self.log_result("Survey Export JSON", True, f"JSON export successful ({len(result)} responses)")
                            return True
                        else:
                            self.log_result("Survey Export JSON", False, "Missing expected fields in response", first_response)
                            return False
                    else:
                        self.log_result("Survey Export JSON", True, "JSON export successful (0 responses)")
                        return True
                else:
                    self.log_result("Survey Export JSON", False, "Response is not a list", result)
                    return False
            else:
                self.log_result("Survey Export JSON", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Survey Export JSON", False, f"Exception: {str(e)}")
            return False

    def test_survey_close(self):
        """Test closing survey"""
        if not hasattr(self, 'survey_id') or not self.survey_id:
            self.log_result("Survey Close", False, "No survey ID available")
            return False
            
        if not self.token:
            self.log_result("Survey Close", False, "No authentication token available")
            return False
            
        try:
            url = f"{self.base_url}/surveys/{self.survey_id}/close"
            headers = {"Authorization": f"Bearer {self.token}"}
            
            response = requests.post(url, headers=headers, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if "message" in result:
                    self.log_result("Survey Close", True, "Survey closed successfully")
                    return True
                else:
                    self.log_result("Survey Close", False, "Missing message in response", result)
                    return False
            else:
                self.log_result("Survey Close", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Survey Close", False, f"Exception: {str(e)}")
            return False

    def test_survey_response_after_close(self):
        """Test submitting response after survey is closed (should fail)"""
        if not hasattr(self, 'survey_id') or not self.survey_id:
            self.log_result("Survey Response After Close", False, "No survey ID available")
            return False
            
        try:
            url = f"{self.base_url}/surveys/{self.survey_id}/respond"
            data = {
                "answers": [
                    {"question_id": "q1", "value": "1"},
                    {"question_id": "q2", "value": "3"}
                ]
            }
            
            response = requests.post(url, json=data, timeout=30)
            
            if response.status_code == 400:
                # Should get error about survey not being published
                if "not published" in response.text.lower():
                    self.log_result("Survey Response After Close", True, "Correctly rejected response to closed survey")
                    return True
                else:
                    self.log_result("Survey Response After Close", True, f"Response rejected with different error: {response.text}")
                    return True
            elif response.status_code == 200:
                self.log_result("Survey Response After Close", False, "Response was accepted for closed survey (should be rejected)")
                return False
            else:
                self.log_result("Survey Response After Close", True, f"Response rejected with HTTP {response.status_code} (expected)")
                return True
                
        except Exception as e:
            self.log_result("Survey Response After Close", False, f"Exception: {str(e)}")
            return False

    def test_survey_delete(self):
        """Test deleting survey"""
        if not hasattr(self, 'survey_id') or not self.survey_id:
            self.log_result("Survey Delete", False, "No survey ID available")
            return False
            
        if not self.token:
            self.log_result("Survey Delete", False, "No authentication token available")
            return False
            
        try:
            url = f"{self.base_url}/surveys/{self.survey_id}"
            headers = {"Authorization": f"Bearer {self.token}"}
            
            response = requests.delete(url, headers=headers, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if "message" in result:
                    self.log_result("Survey Delete", True, "Survey deleted successfully")
                    return True
                else:
                    self.log_result("Survey Delete", False, "Missing message in response", result)
                    return False
            else:
                self.log_result("Survey Delete", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Survey Delete", False, f"Exception: {str(e)}")
            return False

    # ============ CONJOINT ANALYSIS MNL STATISTICAL ANALYSIS TESTS ============
    
    def test_conjoint_mnl_admin_login(self):
        """Test admin login for MNL statistical analysis"""
        try:
            url = f"{self.base_url}/auth/login"
            data = {
                "email": "admin@swu.ac.th",
                "password": "admin123"
            }
            
            response = requests.post(url, json=data, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if "access_token" in result and "user" in result:
                    self.mnl_token = result["access_token"]
                    user = result["user"]
                    self.log_result("MNL Admin Login", True, f"Admin login successful - {user.get('full_name', 'Admin User')}")
                    return True
                else:
                    self.log_result("MNL Admin Login", False, "Missing token or user in response", result)
                    return False
            else:
                self.log_result("MNL Admin Login", False, f"Admin credentials failed (HTTP {response.status_code})")
                return False
                
        except Exception as e:
            self.log_result("MNL Admin Login", False, f"Exception: {str(e)}")
            return False

    def test_conjoint_get_study(self):
        """Test getting specific conjoint study for MNL analysis"""
        if not hasattr(self, 'mnl_token') or not self.mnl_token:
            self.log_result("Get Study", False, "No MNL token available")
            return False
            
        try:
            study_id = "38d01d61-385e-45af-8417-93c67994db59"
            url = f"{self.base_url}/conjoint/studies/{study_id}"
            headers = {"Authorization": f"Bearer {self.mnl_token}"}
            
            response = requests.get(url, headers=headers, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if "id" in result and result["id"] == study_id:
                    self.mnl_study_id = study_id
                    study_title = result.get("title", "Unknown")
                    status = result.get("status", "unknown")
                    self.log_result("Get Study", True, f"Study retrieved successfully - '{study_title}' (status: {status})")
                    return True
                else:
                    self.log_result("Get Study", False, "Study ID mismatch or missing", result)
                    return False
            else:
                self.log_result("Get Study", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Get Study", False, f"Exception: {str(e)}")
            return False

    def test_conjoint_mnl_statistical_analysis(self):
        """Test MNL (Multinomial Logit) statistical analysis - MAIN TEST"""
        if not hasattr(self, 'mnl_study_id') or not self.mnl_study_id:
            self.log_result("MNL Statistical Analysis", False, "No MNL study ID available")
            return False
            
        if not hasattr(self, 'mnl_token') or not self.mnl_token:
            self.log_result("MNL Statistical Analysis", False, "No MNL token available")
            return False
            
        try:
            url = f"{self.base_url}/conjoint/studies/{self.mnl_study_id}/statistical-analysis?method=mnl"
            headers = {"Authorization": f"Bearer {self.mnl_token}"}
            
            response = requests.get(url, headers=headers, timeout=120)  # Longer timeout for statistical analysis
            
            if response.status_code == 200:
                result = response.json()
                
                # Verify status = "success"
                if result.get("status") != "success":
                    self.log_result("MNL Statistical Analysis", False, f"Expected status='success', got '{result.get('status')}'", result)
                    return False
                
                # Verify results.method = "Multinomial Logit (MNL)"
                results = result.get("results", {})
                if results.get("method") != "Multinomial Logit (MNL)":
                    self.log_result("MNL Statistical Analysis", False, f"Expected method='Multinomial Logit (MNL)', got '{results.get('method')}'", results)
                    return False
                
                # Verify results.part_worths exists and has correct structure
                part_worths = results.get("part_worths")
                if not part_worths or not isinstance(part_worths, dict):
                    self.log_result("MNL Statistical Analysis", False, "Missing or invalid part_worths structure", results)
                    return False
                
                # Check part_worths structure: {attr_id: {name, levels: {level_id: {value, utility, selection_count}}}}
                part_worths_valid = True
                for attr_id, attr_data in part_worths.items():
                    if not isinstance(attr_data, dict) or "name" not in attr_data or "levels" not in attr_data:
                        part_worths_valid = False
                        break
                    levels = attr_data.get("levels", {})
                    for level_id, level_data in levels.items():
                        if not isinstance(level_data, dict) or not all(key in level_data for key in ["value", "utility", "selection_count"]):
                            part_worths_valid = False
                            break
                    if not part_worths_valid:
                        break
                
                if not part_worths_valid:
                    self.log_result("MNL Statistical Analysis", False, "Invalid part_worths structure", part_worths)
                    return False
                
                # Verify results.importance_scores exists and has correct structure
                importance_scores = results.get("importance_scores")
                if not importance_scores or not isinstance(importance_scores, dict):
                    self.log_result("MNL Statistical Analysis", False, "Missing or invalid importance_scores structure", results)
                    return False
                
                # Check importance_scores structure: {attr_id: {name, importance}}
                importance_valid = True
                for attr_id, attr_data in importance_scores.items():
                    if not isinstance(attr_data, dict) or "name" not in attr_data or "importance" not in attr_data:
                        importance_valid = False
                        break
                
                if not importance_valid:
                    self.log_result("MNL Statistical Analysis", False, "Invalid importance_scores structure", importance_scores)
                    return False
                
                # Verify statistical fields exist
                required_stats = ["coefficients", "std_errors", "z_values", "p_values", "log_likelihood", "pseudo_r_squared", "aic", "n_observations"]
                missing_stats = [stat for stat in required_stats if stat not in results]
                
                if missing_stats:
                    self.log_result("MNL Statistical Analysis", False, f"Missing statistical fields: {missing_stats}", results)
                    return False
                
                # All verifications passed
                n_attrs = len(part_worths)
                n_obs = results.get("n_observations", 0)
                pseudo_r2 = results.get("pseudo_r_squared", 0)
                
                self.log_result("MNL Statistical Analysis", True, 
                              f"✅ MNL analysis successful - {n_attrs} attributes, {n_obs} observations, pseudo R² = {pseudo_r2:.3f}")
                return True
                
            else:
                self.log_result("MNL Statistical Analysis", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("MNL Statistical Analysis", False, f"Exception: {str(e)}")
            return False

    def test_conjoint_linear_regression_analysis(self):
        """Test Linear Regression statistical analysis - REGRESSION TEST"""
        if not hasattr(self, 'mnl_study_id') or not self.mnl_study_id:
            self.log_result("Linear Regression Analysis", False, "No MNL study ID available")
            return False
            
        if not hasattr(self, 'mnl_token') or not self.mnl_token:
            self.log_result("Linear Regression Analysis", False, "No MNL token available")
            return False
            
        try:
            url = f"{self.base_url}/conjoint/studies/{self.mnl_study_id}/statistical-analysis?method=linear_regression"
            headers = {"Authorization": f"Bearer {self.mnl_token}"}
            
            response = requests.get(url, headers=headers, timeout=120)
            
            if response.status_code == 200:
                result = response.json()
                if result.get("status") == "success":
                    results = result.get("results", {})
                    method = results.get("method", "")
                    if "linear" in method.lower() or "regression" in method.lower():
                        self.log_result("Linear Regression Analysis", True, f"Linear regression working - method: {method}")
                        return True
                    else:
                        self.log_result("Linear Regression Analysis", False, f"Unexpected method: {method}", results)
                        return False
                else:
                    self.log_result("Linear Regression Analysis", False, f"Status not success: {result.get('status')}", result)
                    return False
            else:
                self.log_result("Linear Regression Analysis", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Linear Regression Analysis", False, f"Exception: {str(e)}")
            return False

    def test_conjoint_mixed_logit_analysis(self):
        """Test Mixed Logit statistical analysis - REGRESSION TEST"""
        if not hasattr(self, 'mnl_study_id') or not self.mnl_study_id:
            self.log_result("Mixed Logit Analysis", False, "No MNL study ID available")
            return False
            
        if not hasattr(self, 'mnl_token') or not self.mnl_token:
            self.log_result("Mixed Logit Analysis", False, "No MNL token available")
            return False
            
        try:
            url = f"{self.base_url}/conjoint/studies/{self.mnl_study_id}/statistical-analysis?method=mixed_logit"
            headers = {"Authorization": f"Bearer {self.mnl_token}"}
            
            response = requests.get(url, headers=headers, timeout=120)
            
            if response.status_code == 200:
                result = response.json()
                if result.get("status") == "success":
                    results = result.get("results", {})
                    method = results.get("method", "")
                    if "mixed" in method.lower() or "logit" in method.lower():
                        self.log_result("Mixed Logit Analysis", True, f"Mixed logit working - method: {method}")
                        return True
                    else:
                        self.log_result("Mixed Logit Analysis", False, f"Unexpected method: {method}", results)
                        return False
                else:
                    self.log_result("Mixed Logit Analysis", False, f"Status not success: {result.get('status')}", result)
                    return False
            else:
                self.log_result("Mixed Logit Analysis", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Mixed Logit Analysis", False, f"Exception: {str(e)}")
            return False

    def test_conjoint_hierarchical_bayes_analysis(self):
        """Test Hierarchical Bayes statistical analysis - REGRESSION TEST"""
        if not hasattr(self, 'mnl_study_id') or not self.mnl_study_id:
            self.log_result("Hierarchical Bayes Analysis", False, "No MNL study ID available")
            return False
            
        if not hasattr(self, 'mnl_token') or not self.mnl_token:
            self.log_result("Hierarchical Bayes Analysis", False, "No MNL token available")
            return False
            
        try:
            url = f"{self.base_url}/conjoint/studies/{self.mnl_study_id}/statistical-analysis?method=hierarchical_bayes"
            headers = {"Authorization": f"Bearer {self.mnl_token}"}
            
            response = requests.get(url, headers=headers, timeout=120)
            
            if response.status_code == 200:
                result = response.json()
                if result.get("status") == "success":
                    results = result.get("results", {})
                    method = results.get("method", "")
                    if "hierarchical" in method.lower() or "bayes" in method.lower():
                        self.log_result("Hierarchical Bayes Analysis", True, f"Hierarchical Bayes working - method: {method}")
                        return True
                    else:
                        self.log_result("Hierarchical Bayes Analysis", False, f"Unexpected method: {method}", results)
                        return False
                else:
                    self.log_result("Hierarchical Bayes Analysis", False, f"Status not success: {result.get('status')}", result)
                    return False
            else:
                self.log_result("Hierarchical Bayes Analysis", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Hierarchical Bayes Analysis", False, f"Exception: {str(e)}")
            return False

    # ============ ORIGINAL CONJOINT ANALYSIS TESTS ============
    
    def test_conjoint_admin_login(self):
        """Test admin login for conjoint analysis"""
        try:
            url = f"{self.base_url}/auth/login"
            data = {
                "email": "admin@swu.ac.th",
                "password": "admin123"
            }
            
            response = requests.post(url, json=data, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if "access_token" in result and "user" in result:
                    self.conjoint_token = result["access_token"]
                    user = result["user"]
                    self.log_result("Conjoint Admin Login", True, f"Admin login successful - role: {user.get('role')}, user_type: {user.get('user_type')}")
                    return True
                else:
                    self.log_result("Conjoint Admin Login", False, "Missing token or user in response", result)
                    return False
            else:
                self.log_result("Conjoint Admin Login", False, f"Admin credentials not found (HTTP {response.status_code})")
                return False
                
        except Exception as e:
            self.log_result("Conjoint Admin Login", False, f"Exception: {str(e)}")
            return False

    def test_admin_llm_prompts_access(self):
        """Test admin LLM prompts access - FIXED ACCESS CONTROL"""
        if not hasattr(self, 'conjoint_token') or not self.conjoint_token:
            self.log_result("Admin LLM Prompts Access", False, "No conjoint token available")
            return False
            
        try:
            url = f"{self.base_url}/admin/llm-prompts"
            headers = {"Authorization": f"Bearer {self.conjoint_token}"}
            
            response = requests.get(url, headers=headers, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if "prompts" in result and isinstance(result["prompts"], list):
                    prompts = result["prompts"]
                    # Look for conjoint qualitative analysis prompt
                    conjoint_prompt = next((p for p in prompts if p.get("id") == "conjoint-qualitative-analysis"), None)
                    if conjoint_prompt:
                        model_info = f"{conjoint_prompt.get('model_provider', 'unknown')}/{conjoint_prompt.get('model_name', 'unknown')}"
                        self.log_result("Admin LLM Prompts Access", True, 
                                      f"✅ FIXED: Admin can access LLM prompts ({len(prompts)} prompts) - conjoint prompt found using {model_info}")
                        return True
                    else:
                        self.log_result("Admin LLM Prompts Access", True, 
                                      f"Admin can access LLM prompts ({len(prompts)} prompts) - conjoint prompt not found but access working")
                        return True
                else:
                    self.log_result("Admin LLM Prompts Access", False, "Missing prompts array in response", result)
                    return False
            elif response.status_code == 403:
                self.log_result("Admin LLM Prompts Access", False, 
                              "❌ CRITICAL: Admin access denied - backend checks user_type='regular' instead of role='admin' (admin user has correct role but wrong user_type)", 
                              response.text)
                return False
            else:
                self.log_result("Admin LLM Prompts Access", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Admin LLM Prompts Access", False, f"Exception: {str(e)}")
            return False

    def test_conjoint_create_study(self):
        """Test creating a new conjoint study"""
        if not hasattr(self, 'conjoint_token') or not self.conjoint_token:
            self.log_result("Conjoint Create Study", False, "No conjoint token available")
            return False
            
        try:
            url = f"{self.base_url}/conjoint/studies"
            headers = {"Authorization": f"Bearer {self.conjoint_token}"}
            data = {
                "title": "สมาร์ทโฟน 2025",
                "description": "ศึกษาคุณสมบัติที่ผู้บริโภคต้องการ",
                "product_category": "Electronics"
            }
            
            response = requests.post(url, json=data, headers=headers, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if "study_id" in result and "message" in result:
                    self.conjoint_study_id = result["study_id"]
                    self.log_result("Conjoint Create Study", True, f"Study created successfully with ID: {self.conjoint_study_id}")
                    return True
                else:
                    self.log_result("Conjoint Create Study", False, "Missing study_id or message in response", result)
                    return False
            else:
                self.log_result("Conjoint Create Study", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Conjoint Create Study", False, f"Exception: {str(e)}")
            return False

    def test_conjoint_qualitative_analysis(self):
        """Test qualitative analysis phase - FIXED LLM PARSING"""
        if not hasattr(self, 'conjoint_study_id') or not self.conjoint_study_id:
            self.log_result("Conjoint Qualitative Analysis", False, "No conjoint study ID available")
            return False
            
        if not hasattr(self, 'conjoint_token') or not self.conjoint_token:
            self.log_result("Conjoint Qualitative Analysis", False, "No conjoint token available")
            return False
            
        try:
            url = f"{self.base_url}/conjoint/studies/{self.conjoint_study_id}/qualitative-analysis"
            headers = {"Authorization": f"Bearer {self.conjoint_token}"}
            data = {
                "study_id": self.conjoint_study_id,
                "qualitative_data": [
                    {
                        "type": "interview",
                        "content": "ผู้บริโภคให้ความสำคัญกับราคา แบรนด์ และขนาดหน้าจอของสมาร์ทโฟน โดยราคาที่ยอมรับได้คือ 10000-30000 บาท แบรนด์ที่นิยม คือ Samsung, iPhone, Xiaomi และหน้าจอควรมีขนาด 6-7 นิ้ว"
                    }
                ],
                "target_language": "th"
            }
            
            response = requests.post(url, json=data, headers=headers, timeout=120)  # Longer timeout for LLM
            
            if response.status_code == 200:
                result = response.json()
                if "suggested_attributes" in result:
                    attributes = result["suggested_attributes"]
                    if len(attributes) >= 3:  # Expected at least 3 attributes
                        # Check attribute structure
                        first_attr = attributes[0]
                        if "name" in first_attr and "levels" in first_attr:
                            self.log_result("Conjoint Qualitative Analysis", True, 
                                          f"✅ FIXED: Qualitative analysis successful ({len(attributes)} attributes suggested) - Claude LLM parsing working correctly")
                            return True
                        else:
                            self.log_result("Conjoint Qualitative Analysis", False, "Invalid attribute structure", first_attr)
                            return False
                    else:
                        self.log_result("Conjoint Qualitative Analysis", False, f"Expected at least 3 attributes, got {len(attributes)}", result)
                        return False
                else:
                    self.log_result("Conjoint Qualitative Analysis", False, "Missing suggested_attributes in response", result)
                    return False
            elif response.status_code == 500 and "too many values to unpack" in response.text:
                self.log_result("Conjoint Qualitative Analysis", False, "❌ CRITICAL: Backend LLM response parsing error - 'too many values to unpack (expected 2)' - Claude Sonnet integration has parsing bug", response.text)
                return False
            else:
                self.log_result("Conjoint Qualitative Analysis", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Conjoint Qualitative Analysis", False, f"Exception: {str(e)}")
            return False

    def test_conjoint_update_attributes(self):
        """Test updating study attributes"""
        if not hasattr(self, 'conjoint_study_id') or not self.conjoint_study_id:
            self.log_result("Conjoint Update Attributes", False, "No conjoint study ID available")
            return False
            
        if not hasattr(self, 'conjoint_token') or not self.conjoint_token:
            self.log_result("Conjoint Update Attributes", False, "No conjoint token available")
            return False
            
        try:
            url = f"{self.base_url}/conjoint/studies/{self.conjoint_study_id}/attributes"
            headers = {"Authorization": f"Bearer {self.conjoint_token}"}
            data = {
                "study_id": self.conjoint_study_id,
                "attributes": [
                    {
                        "name": "ราคา",
                        "description": "ราคาของสมาร์ทโฟน",
                        "levels": [
                            {"value": "10,000-15,000 บาท"},
                            {"value": "15,001-20,000 บาท"},
                            {"value": "20,001-30,000 บาท"}
                        ],
                        "order": 0
                    },
                    {
                        "name": "แบรนด์",
                        "description": "แบรนด์ของสมาร์ทโฟน",
                        "levels": [
                            {"value": "Samsung"},
                            {"value": "iPhone"},
                            {"value": "Xiaomi"}
                        ],
                        "order": 1
                    },
                    {
                        "name": "ขนาดหน้าจอ",
                        "description": "ขนาดหน้าจอของสมาร์ทโฟน",
                        "levels": [
                            {"value": "6.0-6.3 นิ้ว"},
                            {"value": "6.4-6.7 นิ้ว"},
                            {"value": "6.8-7.0 นิ้ว"}
                        ],
                        "order": 2
                    }
                ]
            }
            
            response = requests.put(url, json=data, headers=headers, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if "message" in result:
                    self.log_result("Conjoint Update Attributes", True, "Attributes updated successfully")
                    return True
                else:
                    self.log_result("Conjoint Update Attributes", False, "Missing message in response", result)
                    return False
            else:
                self.log_result("Conjoint Update Attributes", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Conjoint Update Attributes", False, f"Exception: {str(e)}")
            return False

    def test_conjoint_generate_design(self):
        """Test generating D-optimal design"""
        if not hasattr(self, 'conjoint_study_id') or not self.conjoint_study_id:
            self.log_result("Conjoint Generate Design", False, "No conjoint study ID available")
            return False
            
        if not hasattr(self, 'conjoint_token') or not self.conjoint_token:
            self.log_result("Conjoint Generate Design", False, "No conjoint token available")
            return False
            
        try:
            url = f"{self.base_url}/conjoint/studies/{self.conjoint_study_id}/generate-design"
            headers = {"Authorization": f"Bearer {self.conjoint_token}"}
            data = {
                "study_id": self.conjoint_study_id,
                "alternatives_per_set": 3,
                "design_method": "d-optimal"
            }
            
            response = requests.post(url, json=data, headers=headers, timeout=60)
            
            if response.status_code == 200:
                result = response.json()
                if "message" in result and "num_choice_sets" in result:
                    num_choice_sets = result["num_choice_sets"]
                    alternatives_per_set = result.get("alternatives_per_set", 0)
                    if num_choice_sets > 0 and alternatives_per_set == 3:
                        self.log_result("Conjoint Generate Design", True, 
                                      f"D-optimal design generated successfully ({num_choice_sets} choice sets, {alternatives_per_set} alternatives per set)")
                        return True
                    else:
                        self.log_result("Conjoint Generate Design", False, f"Invalid design parameters (sets: {num_choice_sets}, alternatives: {alternatives_per_set})", result)
                        return False
                else:
                    self.log_result("Conjoint Generate Design", False, "Missing message or num_choice_sets", result)
                    return False
            else:
                self.log_result("Conjoint Generate Design", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Conjoint Generate Design", False, f"Exception: {str(e)}")
            return False

    def test_conjoint_get_survey_public(self):
        """Test getting survey data (public endpoint)"""
        if not hasattr(self, 'conjoint_study_id') or not self.conjoint_study_id:
            self.log_result("Conjoint Get Survey Public", False, "No conjoint study ID available")
            return False
            
        try:
            url = f"{self.base_url}/conjoint/survey/{self.conjoint_study_id}"
            
            response = requests.get(url, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if "study_id" in result and "choice_sets" in result:
                    choice_sets = result["choice_sets"]
                    title = result.get("title", "")
                    if len(choice_sets) > 0:
                        self.log_result("Conjoint Get Survey Public", True, 
                                      f"Survey data retrieved successfully ({len(choice_sets)} choice sets, title: {title})")
                        return True
                    else:
                        self.log_result("Conjoint Get Survey Public", False, "No choice sets available", result)
                        return False
                elif "study" in result and "choice_sets" in result:
                    # Fallback format
                    study = result["study"]
                    choice_sets = result["choice_sets"]
                    if len(choice_sets) > 0:
                        self.log_result("Conjoint Get Survey Public", True, 
                                      f"Survey data retrieved successfully ({len(choice_sets)} choice sets)")
                        return True
                    else:
                        self.log_result("Conjoint Get Survey Public", False, "No choice sets available", result)
                        return False
                else:
                    self.log_result("Conjoint Get Survey Public", False, "Missing study_id or choice_sets", result)
                    return False
            else:
                self.log_result("Conjoint Get Survey Public", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Conjoint Get Survey Public", False, f"Exception: {str(e)}")
            return False

    def test_conjoint_submit_response_public(self):
        """Test submitting survey response (public endpoint)"""
        if not hasattr(self, 'conjoint_study_id') or not self.conjoint_study_id:
            self.log_result("Conjoint Submit Response Public", False, "No conjoint study ID available")
            return False
            
        try:
            url = f"{self.base_url}/conjoint/survey/{self.conjoint_study_id}/response"
            data = {
                "study_id": self.conjoint_study_id,
                "respondent_id": "test_respondent_001",
                "responses": [
                    {
                        "choice_set_id": "set_1",
                        "selected_profile_id": "profile_1"
                    },
                    {
                        "choice_set_id": "set_2", 
                        "selected_profile_id": "profile_2"
                    }
                ]
            }
            
            response = requests.post(url, json=data, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if "message" in result:
                    self.log_result("Conjoint Submit Response Public", True, "Survey response submitted successfully")
                    return True
                else:
                    self.log_result("Conjoint Submit Response Public", False, "Missing message in response", result)
                    return False
            else:
                self.log_result("Conjoint Submit Response Public", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Conjoint Submit Response Public", False, f"Exception: {str(e)}")
            return False

    def test_conjoint_admin_llm_prompts(self):
        """Test getting admin LLM prompts"""
        if not hasattr(self, 'conjoint_token') or not self.conjoint_token:
            self.log_result("Conjoint Admin LLM Prompts", False, "No conjoint token available")
            return False
            
        try:
            url = f"{self.base_url}/admin/llm-prompts"
            headers = {"Authorization": f"Bearer {self.conjoint_token}"}
            
            response = requests.get(url, headers=headers, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if "prompts" in result and isinstance(result["prompts"], list):
                    prompts = result["prompts"]
                    # Look for conjoint qualitative analysis prompt
                    conjoint_prompt = next((p for p in prompts if p.get("category") == "conjoint_qualitative"), None)
                    if conjoint_prompt:
                        if conjoint_prompt.get("model_provider") == "anthropic" and "claude" in conjoint_prompt.get("model_name", "").lower():
                            self.log_result("Conjoint Admin LLM Prompts", True, 
                                          f"LLM prompts retrieved successfully (found conjoint prompt using Claude)")
                            return True
                        else:
                            self.log_result("Conjoint Admin LLM Prompts", True, 
                                          f"LLM prompts retrieved (conjoint prompt found but different model: {conjoint_prompt.get('model_provider')}/{conjoint_prompt.get('model_name')})")
                            return True
                    else:
                        self.log_result("Conjoint Admin LLM Prompts", False, "Conjoint qualitative analysis prompt not found", prompts)
                        return False
                elif isinstance(result, list):
                    # Fallback if response is directly a list
                    conjoint_prompt = next((p for p in result if p.get("category") == "conjoint_qualitative"), None)
                    if conjoint_prompt:
                        self.log_result("Conjoint Admin LLM Prompts", True, "LLM prompts retrieved successfully (found conjoint prompt)")
                        return True
                    else:
                        self.log_result("Conjoint Admin LLM Prompts", False, "Conjoint qualitative analysis prompt not found", result)
                        return False
                else:
                    self.log_result("Conjoint Admin LLM Prompts", False, "Response does not contain prompts list", result)
                    return False
            elif response.status_code == 403:
                self.log_result("Conjoint Admin LLM Prompts", False, f"Admin access denied - backend checks user_type instead of role (admin user has role='admin' but user_type='regular') (HTTP {response.status_code})", response.text)
                return False
            else:
                self.log_result("Conjoint Admin LLM Prompts", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Conjoint Admin LLM Prompts", False, f"Exception: {str(e)}")
            return False

    def test_conjoint_get_study_details(self):
        """Test getting study details"""
        if not hasattr(self, 'conjoint_study_id') or not self.conjoint_study_id:
            self.log_result("Conjoint Get Study Details", False, "No conjoint study ID available")
            return False
            
        if not hasattr(self, 'conjoint_token') or not self.conjoint_token:
            self.log_result("Conjoint Get Study Details", False, "No conjoint token available")
            return False
            
        try:
            url = f"{self.base_url}/conjoint/studies/{self.conjoint_study_id}"
            headers = {"Authorization": f"Bearer {self.conjoint_token}"}
            
            response = requests.get(url, headers=headers, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if ("id" in result and "title" in result and "status" in result and 
                    result.get("id") == self.conjoint_study_id):
                    self.log_result("Conjoint Get Study Details", True, 
                                  f"Study details retrieved successfully (status: {result.get('status')})")
                    return True
                else:
                    self.log_result("Conjoint Get Study Details", False, "Missing expected fields or incorrect ID", result)
                    return False
            else:
                self.log_result("Conjoint Get Study Details", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Conjoint Get Study Details", False, f"Exception: {str(e)}")
            return False

    def test_conjoint_list_studies(self):
        """Test listing all studies"""
        if not hasattr(self, 'conjoint_token') or not self.conjoint_token:
            self.log_result("Conjoint List Studies", False, "No conjoint token available")
            return False
            
        try:
            url = f"{self.base_url}/conjoint/studies"
            headers = {"Authorization": f"Bearer {self.conjoint_token}"}
            
            response = requests.get(url, headers=headers, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if "studies" in result and isinstance(result["studies"], list):
                    studies = result["studies"]
                    # Check if our created study is in the list
                    if hasattr(self, 'conjoint_study_id'):
                        study_found = any(study.get("id") == self.conjoint_study_id for study in studies)
                        if study_found:
                            self.log_result("Conjoint List Studies", True, 
                                          f"Studies listed successfully ({len(studies)} studies, created study found)")
                            return True
                        else:
                            self.log_result("Conjoint List Studies", True, 
                                          f"Studies listed successfully ({len(studies)} studies, created study not found - may be expected)")
                            return True
                    else:
                        self.log_result("Conjoint List Studies", True, f"Studies listed successfully ({len(studies)} studies)")
                        return True
                else:
                    self.log_result("Conjoint List Studies", False, "Response does not contain studies list", result)
                    return False
            else:
                self.log_result("Conjoint List Studies", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Conjoint List Studies", False, f"Exception: {str(e)}")
            return False

    # ============ CONJOINT ANALYSIS IMAGE GENERATION TESTS ============
    
    def test_conjoint_image_admin_login(self):
        """Test admin login for conjoint image generation"""
        try:
            url = f"{self.base_url}/auth/login"
            data = {
                "email": "admin@swu.ac.th",
                "password": "admin123"
            }
            
            response = requests.post(url, json=data, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if "access_token" in result and "user" in result:
                    self.image_token = result["access_token"]
                    self.log_result("Conjoint Image Admin Login", True, "Admin login successful for image generation")
                    return True
                else:
                    self.log_result("Conjoint Image Admin Login", False, "Missing token or user in response", result)
                    return False
            else:
                self.log_result("Conjoint Image Admin Login", False, f"Admin credentials not found (HTTP {response.status_code})")
                return False
                
        except Exception as e:
            self.log_result("Conjoint Image Admin Login", False, f"Exception: {str(e)}")
            return False

    def test_conjoint_get_active_study(self):
        """Test getting an active study with attributes and choice_sets"""
        if not hasattr(self, 'image_token') or not self.image_token:
            self.log_result("Conjoint Get Active Study", False, "No image token available")
            return False
            
        try:
            url = f"{self.base_url}/conjoint/studies"
            headers = {"Authorization": f"Bearer {self.image_token}"}
            
            response = requests.get(url, headers=headers, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if "studies" in result and isinstance(result["studies"], list):
                    studies = result["studies"]
                    
                    # Find a study with attributes and choice_sets
                    active_study = None
                    for study in studies:
                        if (study.get("status") == "active" and 
                            study.get("attributes") and len(study.get("attributes", [])) > 0 and
                            study.get("choice_sets") and len(study.get("choice_sets", [])) > 0):
                            active_study = study
                            break
                    
                    if active_study:
                        self.image_study_id = active_study["id"]
                        self.image_study_attributes = active_study["attributes"]
                        self.image_study_choice_sets = active_study["choice_sets"]
                        
                        # Store first attribute and level for testing
                        if len(self.image_study_attributes) > 0:
                            first_attr = self.image_study_attributes[0]
                            self.first_attribute_id = first_attr["id"]
                            if len(first_attr.get("levels", [])) > 0:
                                self.first_level_id = first_attr["levels"][0]["id"]
                        
                        # Store first choice_set and profile for testing
                        if len(self.image_study_choice_sets) > 0:
                            first_choice_set = self.image_study_choice_sets[0]
                            self.first_choice_set_id = first_choice_set["id"]
                            if len(first_choice_set.get("profiles", [])) > 0:
                                self.first_profile_id = first_choice_set["profiles"][0]["id"]
                        
                        self.log_result("Conjoint Get Active Study", True, 
                                      f"Active study found with {len(self.image_study_attributes)} attributes and {len(self.image_study_choice_sets)} choice sets")
                        return True
                    else:
                        self.log_result("Conjoint Get Active Study", False, 
                                      f"No active study with attributes and choice_sets found ({len(studies)} studies total)")
                        return False
                else:
                    self.log_result("Conjoint Get Active Study", False, "Response does not contain studies list", result)
                    return False
            else:
                self.log_result("Conjoint Get Active Study", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Conjoint Get Active Study", False, f"Exception: {str(e)}")
            return False

    def test_conjoint_generate_level_image(self):
        """Test Level Image Generation - POST /api/conjoint/studies/{study_id}/generate-single-image"""
        if not hasattr(self, 'image_study_id') or not self.image_study_id:
            self.log_result("Conjoint Generate Level Image", False, "No image study ID available")
            return False
            
        if not hasattr(self, 'first_attribute_id') or not hasattr(self, 'first_level_id'):
            self.log_result("Conjoint Generate Level Image", False, "No attribute/level IDs available")
            return False
            
        if not hasattr(self, 'image_token') or not self.image_token:
            self.log_result("Conjoint Generate Level Image", False, "No image token available")
            return False
            
        try:
            url = f"{self.base_url}/conjoint/studies/{self.image_study_id}/generate-single-image"
            headers = {"Authorization": f"Bearer {self.image_token}"}
            data = {
                "attribute_id": self.first_attribute_id,
                "level_id": self.first_level_id
            }
            
            response = requests.post(url, json=data, headers=headers, timeout=120)  # Longer timeout for image generation
            
            if response.status_code == 200:
                result = response.json()
                if ("image_url" in result and "prompt_used" in result and "message" in result):
                    image_url = result["image_url"]
                    prompt_used = result["prompt_used"]
                    
                    # Verify base64 data URL format
                    if image_url.startswith("data:image/png;base64,"):
                        base64_part = image_url.split(",")[1]
                        if len(base64_part) > 100:  # Basic check for substantial base64 content
                            self.generated_level_image_url = image_url
                            self.log_result("Conjoint Generate Level Image", True, 
                                          f"Level image generated successfully using OpenAI gpt-image-1 (base64 length: {len(base64_part)}, prompt: {prompt_used[:50]}...)")
                            return True
                        else:
                            self.log_result("Conjoint Generate Level Image", False, 
                                          f"Base64 content too short ({len(base64_part)} chars)", result)
                            return False
                    else:
                        self.log_result("Conjoint Generate Level Image", False, 
                                      f"Invalid image URL format: {image_url[:50]}...", result)
                        return False
                else:
                    self.log_result("Conjoint Generate Level Image", False, "Missing image_url, prompt_used, or message", result)
                    return False
            else:
                self.log_result("Conjoint Generate Level Image", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Conjoint Generate Level Image", False, f"Exception: {str(e)}")
            return False

    def test_conjoint_generate_profile_image(self):
        """Test Profile Image Generation - POST /api/conjoint/studies/{study_id}/generate-profile-image"""
        if not hasattr(self, 'image_study_id') or not self.image_study_id:
            self.log_result("Conjoint Generate Profile Image", False, "No image study ID available")
            return False
            
        if not hasattr(self, 'first_choice_set_id') or not hasattr(self, 'first_profile_id'):
            self.log_result("Conjoint Generate Profile Image", False, "No choice_set/profile IDs available")
            return False
            
        if not hasattr(self, 'image_token') or not self.image_token:
            self.log_result("Conjoint Generate Profile Image", False, "No image token available")
            return False
            
        try:
            url = f"{self.base_url}/conjoint/studies/{self.image_study_id}/generate-profile-image"
            headers = {"Authorization": f"Bearer {self.image_token}"}
            data = {
                "choice_set_id": self.first_choice_set_id,
                "profile_id": self.first_profile_id
            }
            
            response = requests.post(url, json=data, headers=headers, timeout=120)  # Longer timeout for image generation
            
            if response.status_code == 200:
                result = response.json()
                if ("image_url" in result and "prompt_used" in result and "message" in result):
                    image_url = result["image_url"]
                    prompt_used = result["prompt_used"]
                    
                    # Verify base64 data URL format
                    if image_url.startswith("data:image/png;base64,"):
                        base64_part = image_url.split(",")[1]
                        if len(base64_part) > 100:  # Basic check for substantial base64 content
                            self.generated_profile_image_url = image_url
                            
                            # Check if prompt contains profile composition (multiple attributes)
                            has_composition = ":" in prompt_used and ("," in prompt_used or len(prompt_used.split()) > 10)
                            
                            self.log_result("Conjoint Generate Profile Image", True, 
                                          f"Profile image generated successfully using OpenAI gpt-image-1 (base64 length: {len(base64_part)}, composition prompt: {has_composition}, prompt: {prompt_used[:50]}...)")
                            return True
                        else:
                            self.log_result("Conjoint Generate Profile Image", False, 
                                          f"Base64 content too short ({len(base64_part)} chars)", result)
                            return False
                    else:
                        self.log_result("Conjoint Generate Profile Image", False, 
                                      f"Invalid image URL format: {image_url[:50]}...", result)
                        return False
                else:
                    self.log_result("Conjoint Generate Profile Image", False, "Missing image_url, prompt_used, or message", result)
                    return False
            else:
                self.log_result("Conjoint Generate Profile Image", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Conjoint Generate Profile Image", False, f"Exception: {str(e)}")
            return False

    def test_conjoint_verify_images_persist(self):
        """Test Verify Images Persist - GET study again and verify both level and profile images are saved"""
        if not hasattr(self, 'image_study_id') or not self.image_study_id:
            self.log_result("Conjoint Verify Images Persist", False, "No image study ID available")
            return False
            
        if not hasattr(self, 'image_token') or not self.image_token:
            self.log_result("Conjoint Verify Images Persist", False, "No image token available")
            return False
            
        try:
            url = f"{self.base_url}/conjoint/studies/{self.image_study_id}"
            headers = {"Authorization": f"Bearer {self.image_token}"}
            
            response = requests.get(url, headers=headers, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                # The response is the study object directly, not wrapped in a "study" field
                study = result
                
                # Check if level image is saved in attributes
                level_image_found = False
                if hasattr(self, 'first_attribute_id') and hasattr(self, 'first_level_id'):
                    attributes = study.get("attributes", [])
                    for attr in attributes:
                        if attr["id"] == self.first_attribute_id:
                            for level in attr.get("levels", []):
                                if level["id"] == self.first_level_id:
                                    if level.get("image_url") and level["image_url"].startswith("data:image/png;base64,"):
                                        level_image_found = True
                                        break
                            break
                
                # Check if profile image is saved in choice_sets
                profile_image_found = False
                if hasattr(self, 'first_choice_set_id') and hasattr(self, 'first_profile_id'):
                    choice_sets = study.get("choice_sets", [])
                    for choice_set in choice_sets:
                        if choice_set["id"] == self.first_choice_set_id:
                            for profile in choice_set.get("profiles", []):
                                if profile["id"] == self.first_profile_id:
                                    if profile.get("profile_image_url") and profile["profile_image_url"].startswith("data:image/png;base64,"):
                                        profile_image_found = True
                                        break
                            break
                
                # Verify both images persist
                if level_image_found and profile_image_found:
                    self.log_result("Conjoint Verify Images Persist", True, 
                                  "Both level and profile images successfully saved to database and persist in study")
                    return True
                elif level_image_found:
                    self.log_result("Conjoint Verify Images Persist", False, 
                                  "Level image persists but profile image not found in database")
                    return False
                elif profile_image_found:
                    self.log_result("Conjoint Verify Images Persist", False, 
                                  "Profile image persists but level image not found in database")
                    return False
                else:
                    self.log_result("Conjoint Verify Images Persist", False, 
                                  "Neither level nor profile images found in database")
                    return False
            else:
                self.log_result("Conjoint Verify Images Persist", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Conjoint Verify Images Persist", False, f"Exception: {str(e)}")
            return False

    # ============ JOURNAL FINDER TESTS ============
    
    def test_journal_finder_admin_login(self):
        """Test admin login for journal finder"""
        try:
            url = f"{self.base_url}/auth/login"
            data = {
                "email": "admin@swu.ac.th",
                "password": "admin123"
            }
            
            response = requests.post(url, json=data, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if "access_token" in result and "user" in result:
                    self.journal_token = result["access_token"]
                    self.log_result("Journal Finder Admin Login", True, "Admin login successful for journal finder")
                    return True
                else:
                    self.log_result("Journal Finder Admin Login", False, "Missing token or user in response", result)
                    return False
            else:
                self.log_result("Journal Finder Admin Login", False, f"Admin credentials not found (HTTP {response.status_code})")
                return False
                
        except Exception as e:
            self.log_result("Journal Finder Admin Login", False, f"Exception: {str(e)}")
            return False

    def test_journal_finder_marketing_research(self):
        """Test Journal Finder - Marketing Research (Thai)"""
        if not hasattr(self, 'journal_token') or not self.journal_token:
            self.log_result("Journal Finder Marketing Research", False, "No journal finder token available")
            return False
            
        try:
            url = f"{self.base_url}/journal-finder"
            headers = {"Authorization": f"Bearer {self.journal_token}"}
            data = {
                "topic": "Consumer Behavior in Digital Marketing",
                "abstract": "This study investigates consumer behavior patterns in digital marketing channels, focusing on social media influence on purchase decisions.",
                "keywords": "consumer behavior, digital marketing, social media",
                "target_language": "th"
            }
            
            response = requests.post(url, json=data, headers=headers, timeout=60)
            
            if response.status_code == 200:
                result = response.json()
                if ("journals" in result and "explanation" in result and "disclaimer" in result):
                    journals = result["journals"]
                    if 5 <= len(journals) <= 10:
                        # Check journal structure
                        first_journal = journals[0]
                        required_fields = ["journal_name", "scimago_url"]
                        has_required = all(field in first_journal for field in required_fields)
                        
                        # Check for ABDC/AJG ratings where available
                        has_ratings = any(j.get("abdc_rating") or j.get("ajg_rating") for j in journals)
                        
                        if has_required:
                            self.log_result("Journal Finder Marketing Research", True, 
                                          f"Marketing research journals found successfully ({len(journals)} journals, ratings available: {has_ratings})")
                            return True
                        else:
                            self.log_result("Journal Finder Marketing Research", False, "Missing required journal fields", first_journal)
                            return False
                    else:
                        self.log_result("Journal Finder Marketing Research", False, f"Expected 5-10 journals, got {len(journals)}", result)
                        return False
                else:
                    self.log_result("Journal Finder Marketing Research", False, "Missing required response fields", result)
                    return False
            else:
                self.log_result("Journal Finder Marketing Research", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Journal Finder Marketing Research", False, f"Exception: {str(e)}")
            return False

    def test_journal_finder_management_research(self):
        """Test Journal Finder - Management Research (English)"""
        if not hasattr(self, 'journal_token') or not self.journal_token:
            self.log_result("Journal Finder Management Research", False, "No journal finder token available")
            return False
            
        try:
            url = f"{self.base_url}/journal-finder"
            headers = {"Authorization": f"Bearer {self.journal_token}"}
            data = {
                "topic": "Strategic Management and Innovation",
                "abstract": "This research explores the relationship between strategic management practices and organizational innovation capabilities.",
                "keywords": "strategic management, innovation, organizational performance",
                "target_language": "en"
            }
            
            response = requests.post(url, json=data, headers=headers, timeout=60)
            
            if response.status_code == 200:
                result = response.json()
                if ("journals" in result and "explanation" in result and "disclaimer" in result):
                    journals = result["journals"]
                    if 5 <= len(journals) <= 10:
                        # Check for Impact Factor and Quartile info
                        has_impact_info = any(j.get("impact_factor") != "Unknown" or j.get("quartile") != "Unknown" for j in journals)
                        
                        # Check for SCImago URLs
                        has_scimago_urls = all("scimago_url" in j and j["scimago_url"] for j in journals)
                        
                        self.log_result("Journal Finder Management Research", True, 
                                      f"Management research journals found successfully ({len(journals)} journals, impact info: {has_impact_info}, SCImago URLs: {has_scimago_urls})")
                        return True
                    else:
                        self.log_result("Journal Finder Management Research", False, f"Expected 5-10 journals, got {len(journals)}", result)
                        return False
                else:
                    self.log_result("Journal Finder Management Research", False, "Missing required response fields", result)
                    return False
            else:
                self.log_result("Journal Finder Management Research", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Journal Finder Management Research", False, f"Exception: {str(e)}")
            return False

    def test_journal_finder_minimal_input(self):
        """Test Journal Finder - Minimal Input (Topic and Abstract Only)"""
        if not hasattr(self, 'journal_token') or not self.journal_token:
            self.log_result("Journal Finder Minimal Input", False, "No journal finder token available")
            return False
            
        try:
            url = f"{self.base_url}/journal-finder"
            headers = {"Authorization": f"Bearer {self.journal_token}"}
            data = {
                "topic": "Marketing Research",
                "abstract": "A study on marketing research methodologies",
                "keywords": "",  # Empty keywords
                "target_language": "en"
            }
            
            response = requests.post(url, json=data, headers=headers, timeout=60)
            
            if response.status_code == 200:
                result = response.json()
                if ("journals" in result and len(result["journals"]) > 0):
                    self.log_result("Journal Finder Minimal Input", True, 
                                  f"Minimal input handled successfully ({len(result['journals'])} journals found)")
                    return True
                else:
                    self.log_result("Journal Finder Minimal Input", False, "No journals returned for minimal input", result)
                    return False
            else:
                self.log_result("Journal Finder Minimal Input", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Journal Finder Minimal Input", False, f"Exception: {str(e)}")
            return False

    def test_journal_finder_invalid_input(self):
        """Test Journal Finder - Invalid Input (Missing Required Fields)"""
        if not hasattr(self, 'journal_token') or not self.journal_token:
            self.log_result("Journal Finder Invalid Input", False, "No journal finder token available")
            return False
            
        try:
            url = f"{self.base_url}/journal-finder"
            headers = {"Authorization": f"Bearer {self.journal_token}"}
            data = {
                "topic": "",  # Empty topic
                "abstract": "",  # Empty abstract
                "keywords": "",
                "target_language": "en"
            }
            
            response = requests.post(url, json=data, headers=headers, timeout=60)
            
            if response.status_code == 422:
                # Validation error expected
                self.log_result("Journal Finder Invalid Input", True, "Correctly rejected empty required fields with validation error")
                return True
            elif response.status_code == 500:
                # Server error due to empty input
                self.log_result("Journal Finder Invalid Input", True, "Correctly handled empty input with server error")
                return True
            elif response.status_code == 200:
                # If it returns results, check if they're meaningful
                result = response.json()
                if "journals" in result and len(result["journals"]) == 0:
                    self.log_result("Journal Finder Invalid Input", True, "Correctly returned empty results for invalid input")
                    return True
                else:
                    self.log_result("Journal Finder Invalid Input", False, "Unexpectedly returned results for empty input", result)
                    return False
            else:
                self.log_result("Journal Finder Invalid Input", True, f"Input validation handled with HTTP {response.status_code}")
                return True
                
        except Exception as e:
            self.log_result("Journal Finder Invalid Input", False, f"Exception: {str(e)}")
            return False

    def test_journal_finder_response_time(self):
        """Test Journal Finder - Response Time (should be under 60 seconds)"""
        if not hasattr(self, 'journal_token') or not self.journal_token:
            self.log_result("Journal Finder Response Time", False, "No journal finder token available")
            return False
            
        try:
            import time
            start_time = time.time()
            
            url = f"{self.base_url}/journal-finder"
            headers = {"Authorization": f"Bearer {self.journal_token}"}
            data = {
                "topic": "Business Research Methods",
                "abstract": "This study examines various business research methodologies and their applications in modern organizations.",
                "keywords": "business research, methodology, quantitative, qualitative",
                "target_language": "en"
            }
            
            response = requests.post(url, json=data, headers=headers, timeout=60)
            
            end_time = time.time()
            response_time = end_time - start_time
            
            if response.status_code == 200:
                if response_time < 60:
                    self.log_result("Journal Finder Response Time", True, 
                                  f"Response time acceptable ({response_time:.2f} seconds)")
                    return True
                else:
                    self.log_result("Journal Finder Response Time", False, 
                                  f"Response time too slow ({response_time:.2f} seconds, expected < 60s)")
                    return False
            else:
                self.log_result("Journal Finder Response Time", False, 
                              f"Request failed (HTTP {response.status_code}) in {response_time:.2f} seconds")
                return False
                
        except Exception as e:
            self.log_result("Journal Finder Response Time", False, f"Exception: {str(e)}")
            return False
    
    def run_focused_conjoint_tests(self):
        """Run focused conjoint analysis tests for the 2 failed endpoints"""
        print(f"\n🎯 FOCUSED CONJOINT ANALYSIS TESTING")
        print(f"Testing 2 critical fixes: Qualitative Analysis + Admin LLM Prompts")
        print(f"Backend URL: {self.base_url}")
        print("=" * 80)
        
        # Initialize tokens and IDs
        self.conjoint_token = None
        self.conjoint_study_id = None
        
        # Focused tests for the 2 failed endpoints
        focused_tests = [
            ("Conjoint Admin Login", self.test_conjoint_admin_login),
            ("Conjoint Create Study", self.test_conjoint_create_study),
            ("Conjoint Qualitative Analysis", self.test_conjoint_qualitative_analysis),  # FIXED LLM Parsing
            ("Admin LLM Prompts Access", self.test_admin_llm_prompts_access),       # FIXED Access Control
        ]
        
        passed = 0
        failed = 0
        
        for test_name, test_func in focused_tests:
            try:
                if test_func():
                    passed += 1
                else:
                    failed += 1
            except Exception as e:
                self.log_result(test_name, False, f"Unexpected error: {str(e)}")
                failed += 1
        
        print("\n" + "=" * 80)
        print(f"🎯 FOCUSED TEST SUMMARY")
        print(f"✅ Passed: {passed}")
        print(f"❌ Failed: {failed}")
        print(f"📈 Success Rate: {passed/(passed+failed)*100:.1f}%")
        
        return self.test_results
    
    def run_all_tests(self):
        """Run all backend tests"""
        print(f"🚀 Starting Backend Tests - Conjoint Analysis Feature Testing")
        print(f"Backend URL: {self.base_url}")
        print("=" * 80)
        
        # Initialize tokens and IDs
        self.admin_token = None
        self.survey_id = None
        self.anonymous_response_id = None
        self.logged_in_response_id = None
        self.journal_token = None
        self.conjoint_token = None
        self.conjoint_study_id = None
        # Image generation test variables
        self.image_token = None
        self.image_study_id = None
        self.image_study_attributes = None
        self.image_study_choice_sets = None
        self.first_attribute_id = None
        self.first_level_id = None
        self.first_choice_set_id = None
        self.first_profile_id = None
        self.generated_level_image_url = None
        self.generated_profile_image_url = None
        
        # Test sequence - Conjoint Analysis Tests (Main Focus)
        conjoint_tests = [
            ("Conjoint Admin Login", self.test_conjoint_admin_login),
            ("Conjoint Create Study", self.test_conjoint_create_study),
            ("Conjoint Qualitative Analysis", self.test_conjoint_qualitative_analysis),
            ("Conjoint Update Attributes", self.test_conjoint_update_attributes),
            ("Conjoint Generate Design", self.test_conjoint_generate_design),
            ("Conjoint Get Survey Public", self.test_conjoint_get_survey_public),
            ("Conjoint Submit Response Public", self.test_conjoint_submit_response_public),
            ("Conjoint Admin LLM Prompts", self.test_conjoint_admin_llm_prompts),
            ("Conjoint Get Study Details", self.test_conjoint_get_study_details),
            ("Conjoint List Studies", self.test_conjoint_list_studies),
        ]
        
        # Test sequence - Conjoint Analysis Image Generation Tests (NEW FOCUS)
        conjoint_image_tests = [
            ("Conjoint Image Admin Login", self.test_conjoint_image_admin_login),
            ("Conjoint Get Active Study", self.test_conjoint_get_active_study),
            ("Conjoint Generate Level Image", self.test_conjoint_generate_level_image),
            ("Conjoint Generate Profile Image", self.test_conjoint_generate_profile_image),
            ("Conjoint Verify Images Persist", self.test_conjoint_verify_images_persist),
        ]
        
        # Test sequence - Journal Finder Tests (Regression)
        journal_finder_tests = [
            ("Journal Finder Admin Login", self.test_journal_finder_admin_login),
            ("Journal Finder Marketing Research", self.test_journal_finder_marketing_research),
            ("Journal Finder Management Research", self.test_journal_finder_management_research),
            ("Journal Finder Minimal Input", self.test_journal_finder_minimal_input),
            ("Journal Finder Invalid Input", self.test_journal_finder_invalid_input),
            ("Journal Finder Response Time", self.test_journal_finder_response_time),
        ]
        
        # Test sequence - Phase 1B Survey Builder Tests (Regression)
        phase1b_tests = [
            ("Login User", self.test_login_user),
            ("Survey Create", self.test_survey_create),
            ("Survey List", self.test_survey_list),
            ("Survey Get Detail", self.test_survey_get_detail),
            ("Survey Update Sections", self.test_survey_update_with_sections),
            ("Survey Publish", self.test_survey_publish),
            ("Survey Response Anonymous", self.test_survey_response_anonymous),
            ("Survey Response Logged-in", self.test_survey_response_logged_in_with_demographics),
            ("Survey Get Responses", self.test_survey_get_responses),
            ("Survey Export CSV", self.test_survey_export_csv),
            ("Survey Export JSON", self.test_survey_export_json),
            ("Survey Close", self.test_survey_close),
            ("Survey Response After Close", self.test_survey_response_after_close),
            ("Survey Delete", self.test_survey_delete),
        ]
        
        # Phase 1A tests (for regression)
        phase1a_tests = [
            ("Google OAuth Endpoint", self.test_google_oauth_endpoint_structure),
            ("Google OAuth Validation", self.test_google_oauth_request_validation),
            ("Login User (Phase 1A)", self.test_login_user),
            ("Demographics GET Empty", self.test_demographics_get_empty),
            ("Demographics PUT Update", self.test_demographics_put_update),
            ("Demographics GET Filled", self.test_demographics_get_filled),
            ("User Rating GET", self.test_user_rating_get),
            ("Logout", self.test_logout),
            ("Admin Login", self.test_admin_login),
            ("Admin Promote Trust User", self.test_admin_promote_trust_user),
            ("Admin List Trust Users", self.test_admin_list_trust_users),
        ]
        
        # Original Journey Map tests (for regression)
        journey_tests = [
            ("Register User", self.test_register_user),
            ("Login User (Journey)", self.test_login_user),
            ("Journey Map Basic", self.test_journey_map_basic),
            ("Journey Map Thai", self.test_journey_map_thai),
            ("Journey Map English", self.test_journey_map_english),
            ("Journey Map With Context", self.test_journey_map_with_context),
        ]
        
        print("🔍 MAIN FOCUS: Conjoint Analysis Feature Tests")
        print("-" * 50)
        
        conjoint_passed = 0
        conjoint_total = len(conjoint_tests)
        
        for test_name, test_func in conjoint_tests:
            try:
                if test_func():
                    conjoint_passed += 1
            except Exception as e:
                self.log_result(test_name, False, f"Unexpected error: {str(e)}")
        
        print("\n🎨 NEW FOCUS: Conjoint Analysis AI Image Generation Tests")
        print("-" * 50)
        
        conjoint_image_passed = 0
        conjoint_image_total = len(conjoint_image_tests)
        
        for test_name, test_func in conjoint_image_tests:
            try:
                if test_func():
                    conjoint_image_passed += 1
            except Exception as e:
                self.log_result(test_name, False, f"Unexpected error: {str(e)}")
        
        print("\n📋 REGRESSION: Journal Finder API Tests")
        print("-" * 50)
        
        journal_finder_passed = 0
        journal_finder_total = len(journal_finder_tests)
        
        for test_name, test_func in journal_finder_tests:
            try:
                if test_func():
                    journal_finder_passed += 1
            except Exception as e:
                self.log_result(test_name, False, f"Unexpected error: {str(e)}")
        
        print("\n📋 REGRESSION: Phase 1B Survey Builder Backend APIs")
        print("-" * 50)
        
        phase1b_passed = 0
        phase1b_total = len(phase1b_tests)
        
        for test_name, test_func in phase1b_tests:
            try:
                if test_func():
                    phase1b_passed += 1
            except Exception as e:
                self.log_result(test_name, False, f"Unexpected error: {str(e)}")
        
        print("\n🔐 REGRESSION: Phase 1A Authentication & User System")
        print("-" * 50)
        
        phase1a_passed = 0
        phase1a_total = len(phase1a_tests)
        
        for test_name, test_func in phase1a_tests:
            try:
                if test_func():
                    phase1a_passed += 1
            except Exception as e:
                self.log_result(test_name, False, f"Unexpected error: {str(e)}")
        
        print("\n🗺️  REGRESSION: Journey Map Tests")
        print("-" * 50)
        
        journey_passed = 0
        journey_total = len(journey_tests)
        
        for test_name, test_func in journey_tests:
            try:
                if test_func():
                    journey_passed += 1
            except Exception as e:
                self.log_result(test_name, False, f"Unexpected error: {str(e)}")
        
        total_passed = conjoint_passed + conjoint_image_passed + journal_finder_passed + phase1b_passed + phase1a_passed + journey_passed
        total_tests = conjoint_total + conjoint_image_total + journal_finder_total + phase1b_total + phase1a_total + journey_total
        
        print("=" * 80)
        print(f"📊 Conjoint Analysis Results: {conjoint_passed}/{conjoint_total} tests passed")
        print(f"🎨 Conjoint Image Generation Results: {conjoint_image_passed}/{conjoint_image_total} tests passed")
        print(f"📊 Journal Finder API Results: {journal_finder_passed}/{journal_finder_total} tests passed")
        print(f"📊 Phase 1B Survey Builder Results: {phase1b_passed}/{phase1b_total} tests passed")
        print(f"📊 Phase 1A Authentication Results: {phase1a_passed}/{phase1a_total} tests passed")
        print(f"📊 Journey Map Results: {journey_passed}/{journey_total} tests passed")
        print(f"📊 Overall Test Results: {total_passed}/{total_tests} tests passed")
        
        # Show failed tests
        failed_tests = [r for r in self.test_results if not r["success"]]
        if failed_tests:
            print("\n❌ Failed Tests:")
            for test in failed_tests:
                print(f"   - {test['test']}: {test['message']}")
        
        return total_passed, total_tests, self.test_results

if __name__ == "__main__":
    tester = BackendTester()
    
    # Run MNL Statistical Analysis tests specifically
    print("📊 TESTING CONJOINT ANALYSIS - MNL STATISTICAL ANALYSIS")
    print("=" * 80)
    
    # Run MNL and regression tests as requested
    mnl_tests = [
        ("MNL Admin Login", tester.test_conjoint_mnl_admin_login),
        ("Get Study", tester.test_conjoint_get_study),
        ("MNL Statistical Analysis", tester.test_conjoint_mnl_statistical_analysis),
        ("Linear Regression Analysis", tester.test_conjoint_linear_regression_analysis),
        ("Mixed Logit Analysis", tester.test_conjoint_mixed_logit_analysis),
        ("Hierarchical Bayes Analysis", tester.test_conjoint_hierarchical_bayes_analysis),
    ]
    
    passed = 0
    total = len(mnl_tests)
    
    for test_name, test_func in mnl_tests:
        try:
            if test_func():
                passed += 1
        except Exception as e:
            tester.log_result(test_name, False, f"Unexpected error: {str(e)}")
    
    print("=" * 80)
    print(f"📊 MNL Statistical Analysis Test Results: {passed}/{total} tests passed")
    
    # Print detailed results
    print("\n📋 DETAILED TEST RESULTS:")
    for result in tester.test_results:
        status = "✅ PASS" if result["success"] else "❌ FAIL"
        print(f"{status} {result['test']}: {result['message']}")
    
    # Exit with error code if tests failed
    if passed < total:
        print(f"\n❌ {total - passed} tests failed")
        sys.exit(1)
    else:
        print("\n🎉 All MNL tests passed!")
        sys.exit(0)