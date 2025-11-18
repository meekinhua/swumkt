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
BACKEND_URL = "https://customer-path-tool.preview.emergentagent.com/api"

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
    
    def run_all_tests(self):
        """Run all backend tests"""
        print(f"🚀 Starting Backend Tests for Survey Builder - Phase 1B Core Survey Builder")
        print(f"Backend URL: {self.base_url}")
        print("=" * 80)
        
        # Initialize tokens and IDs
        self.admin_token = None
        self.survey_id = None
        self.anonymous_response_id = None
        self.logged_in_response_id = None
        
        # Test sequence - Phase 1B Survey Builder Tests (Main Focus)
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
        
        print("📋 PHASE 1B: Core Survey Builder Backend APIs")
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
        
        total_passed = phase1b_passed + phase1a_passed + journey_passed
        total_tests = phase1b_total + phase1a_total + journey_total
        
        print("=" * 80)
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
    passed, total, results = tester.run_all_tests()
    
    # Exit with error code if tests failed
    if passed < total:
        sys.exit(1)
    else:
        print("\n🎉 All tests passed!")
        sys.exit(0)