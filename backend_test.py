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
BACKEND_URL = "https://swumkt-journey-map.preview.emergentagent.com/api"

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
                    # Check if mermaid code contains basic structure
                    mermaid_code = result["mermaid_code"]
                    if "graph" in mermaid_code.lower() and "-->" in mermaid_code:
                        self.log_result("Journey Map Basic", True, "Journey map generated successfully with valid mermaid code")
                        return True
                    else:
                        self.log_result("Journey Map Basic", False, "Invalid mermaid code structure", result)
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
    
    def run_all_tests(self):
        """Run all backend tests"""
        print(f"🚀 Starting Backend Tests for Customer Journey Map Tool")
        print(f"Backend URL: {self.base_url}")
        print("=" * 60)
        
        # Test sequence
        tests = [
            ("Register User", self.test_register_user),
            ("Login User", self.test_login_user),
            ("Journey Map Basic", self.test_journey_map_basic),
            ("Journey Map Thai", self.test_journey_map_thai),
            ("Journey Map English", self.test_journey_map_english),
            ("Journey Map With Context", self.test_journey_map_with_context),
        ]
        
        passed = 0
        total = len(tests)
        
        for test_name, test_func in tests:
            try:
                if test_func():
                    passed += 1
            except Exception as e:
                self.log_result(test_name, False, f"Unexpected error: {str(e)}")
        
        print("=" * 60)
        print(f"📊 Test Results: {passed}/{total} tests passed")
        
        # Show failed tests
        failed_tests = [r for r in self.test_results if not r["success"]]
        if failed_tests:
            print("\n❌ Failed Tests:")
            for test in failed_tests:
                print(f"   - {test['test']}: {test['message']}")
        
        return passed, total, self.test_results

if __name__ == "__main__":
    tester = BackendTester()
    passed, total, results = tester.run_all_tests()
    
    # Exit with error code if tests failed
    if passed < total:
        sys.exit(1)
    else:
        print("\n🎉 All tests passed!")
        sys.exit(0)