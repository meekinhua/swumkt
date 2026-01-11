"""
Backend API Tests for Project Management (Kanban) System
=========================================================
Tests for:
- Authentication (login)
- Projects CRUD
- Cards CRUD
- Subtasks CRUD
- Sub-Kanban (Mini Kanban) features
- Comments
"""

import pytest
import requests
import os
import uuid

# Get BASE_URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    raise ValueError("REACT_APP_BACKEND_URL environment variable is required")

# Test credentials
TEST_EMAIL = "admin@swu.ac.th"
TEST_PASSWORD = "admin123"

# Test project/card IDs from main agent
TEST_PROJECT_ID = "78e6df00-1b01-4df2-ade5-ee2341b126bb"
TEST_CARD_ID = "066ef56e-4eba-4f82-bbf6-d487cd649941"


class TestAuthentication:
    """Authentication endpoint tests"""
    
    def test_login_success(self):
        """Test login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        assert "user" in data, "No user in response"
        assert data["user"]["email"] == TEST_EMAIL
        print(f"✅ Login successful for {TEST_EMAIL}")
        return data["access_token"]
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "wrong@example.com",
            "password": "wrongpass"
        })
        assert response.status_code in [401, 404], f"Expected 401/404, got {response.status_code}"
        print("✅ Invalid login correctly rejected")


class TestProjectsAPI:
    """Projects CRUD tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token before each test"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code == 200:
            self.token = response.json()["access_token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Authentication failed")
    
    def test_list_projects(self):
        """Test listing projects"""
        response = requests.get(f"{BASE_URL}/api/projects", headers=self.headers)
        assert response.status_code == 200, f"List projects failed: {response.text}"
        
        data = response.json()
        assert "projects" in data, "No projects key in response"
        assert "total" in data, "No total key in response"
        assert isinstance(data["projects"], list)
        print(f"✅ Listed {len(data['projects'])} projects (total: {data['total']})")
    
    def test_get_project_detail(self):
        """Test getting specific project with cards"""
        response = requests.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}", headers=self.headers)
        assert response.status_code == 200, f"Get project failed: {response.text}"
        
        data = response.json()
        assert "project" in data, "No project key in response"
        assert "cards" in data, "No cards key in response"
        
        project = data["project"]
        assert project["id"] == TEST_PROJECT_ID
        assert "name" in project
        assert "columns" in project
        assert isinstance(project["columns"], list)
        print(f"✅ Got project: {project['name']} with {len(project['columns'])} columns and {len(data['cards'])} cards")
    
    def test_get_column_templates(self):
        """Test getting column templates"""
        response = requests.get(f"{BASE_URL}/api/projects/templates", headers=self.headers)
        assert response.status_code == 200, f"Get templates failed: {response.text}"
        
        data = response.json()
        assert "general" in data, "No general template"
        assert "thesis" in data, "No thesis template"
        print(f"✅ Got {len(data)} column templates")


class TestCardsAPI:
    """Cards CRUD tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token before each test"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code == 200:
            self.token = response.json()["access_token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Authentication failed")
    
    def test_get_card_detail(self):
        """Test getting specific card"""
        response = requests.get(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/cards/{TEST_CARD_ID}",
            headers=self.headers
        )
        assert response.status_code == 200, f"Get card failed: {response.text}"
        
        card = response.json()
        assert card["id"] == TEST_CARD_ID
        assert "title" in card
        assert "column_id" in card
        assert "subtasks" in card
        assert "sub_columns" in card, "Card should have sub_columns for mini kanban"
        print(f"✅ Got card: {card['title']} with {len(card.get('subtasks', []))} subtasks")
        return card
    
    def test_create_and_delete_card(self):
        """Test creating and deleting a card"""
        # First get project to get a column_id
        project_response = requests.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}", headers=self.headers)
        assert project_response.status_code == 200
        columns = project_response.json()["project"]["columns"]
        assert len(columns) > 0, "Project has no columns"
        column_id = columns[0]["id"]
        
        # Create card
        test_title = f"TEST_Card_{uuid.uuid4().hex[:8]}"
        create_response = requests.post(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/cards",
            json={
                "title": test_title,
                "column_id": column_id,
                "priority": "medium"
            },
            headers=self.headers
        )
        assert create_response.status_code == 200, f"Create card failed: {create_response.text}"
        
        created_card = create_response.json()
        assert created_card["title"] == test_title
        assert "id" in created_card
        assert "sub_columns" in created_card, "New card should have default sub_columns"
        card_id = created_card["id"]
        print(f"✅ Created card: {test_title}")
        
        # Verify card exists
        get_response = requests.get(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/cards/{card_id}",
            headers=self.headers
        )
        assert get_response.status_code == 200
        
        # Delete card
        delete_response = requests.delete(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/cards/{card_id}",
            headers=self.headers
        )
        assert delete_response.status_code == 200, f"Delete card failed: {delete_response.text}"
        print(f"✅ Deleted card: {card_id}")
        
        # Verify card is deleted
        verify_response = requests.get(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/cards/{card_id}",
            headers=self.headers
        )
        assert verify_response.status_code == 404, "Card should be deleted"


class TestSubKanbanAPI:
    """Sub-Kanban (Mini Kanban) feature tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token before each test"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code == 200:
            self.token = response.json()["access_token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Authentication failed")
    
    def test_card_has_sub_columns(self):
        """Test that card has sub_columns for mini kanban"""
        response = requests.get(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/cards/{TEST_CARD_ID}",
            headers=self.headers
        )
        assert response.status_code == 200
        
        card = response.json()
        assert "sub_columns" in card, "Card should have sub_columns"
        
        sub_columns = card["sub_columns"]
        if len(sub_columns) > 0:
            # Verify sub_columns structure
            for col in sub_columns:
                assert "id" in col, "Sub-column should have id"
                assert "name" in col, "Sub-column should have name"
                assert "color" in col, "Sub-column should have color"
            print(f"✅ Card has {len(sub_columns)} sub-columns: {[c['name'] for c in sub_columns]}")
        else:
            print("⚠️ Card has no sub_columns yet (may need initialization)")
    
    def test_init_sub_columns(self):
        """Test initializing sub-columns for a card"""
        response = requests.post(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/cards/{TEST_CARD_ID}/init-sub-columns",
            headers=self.headers
        )
        assert response.status_code == 200, f"Init sub-columns failed: {response.text}"
        
        data = response.json()
        # Either returns updated card or message if already initialized
        if "sub_columns" in data:
            assert len(data["sub_columns"]) >= 3, "Should have at least 3 default sub-columns"
            print(f"✅ Sub-columns initialized: {[c['name'] for c in data['sub_columns']]}")
        elif "message" in data:
            print(f"✅ {data['message']}")
    
    def test_add_subtask_to_sub_column(self):
        """Test adding subtask to specific sub-column"""
        # First get card to get sub_column_id
        card_response = requests.get(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/cards/{TEST_CARD_ID}",
            headers=self.headers
        )
        assert card_response.status_code == 200
        card = card_response.json()
        
        sub_columns = card.get("sub_columns", [])
        if not sub_columns:
            # Initialize sub-columns first
            init_response = requests.post(
                f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/cards/{TEST_CARD_ID}/init-sub-columns",
                headers=self.headers
            )
            assert init_response.status_code == 200
            card = init_response.json()
            sub_columns = card.get("sub_columns", [])
        
        assert len(sub_columns) > 0, "Card should have sub_columns"
        first_sub_col_id = sub_columns[0]["id"]
        
        # Add subtask to first sub-column
        test_subtask_title = f"TEST_Subtask_{uuid.uuid4().hex[:8]}"
        add_response = requests.post(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/cards/{TEST_CARD_ID}/subtasks",
            json={
                "title": test_subtask_title,
                "status": "pending",
                "sub_column_id": first_sub_col_id
            },
            headers=self.headers
        )
        assert add_response.status_code == 200, f"Add subtask failed: {add_response.text}"
        
        subtask = add_response.json()
        assert subtask["title"] == test_subtask_title
        assert subtask["sub_column_id"] == first_sub_col_id
        print(f"✅ Added subtask '{test_subtask_title}' to sub-column '{sub_columns[0]['name']}'")
        
        # Clean up - delete the test subtask
        delete_response = requests.delete(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/cards/{TEST_CARD_ID}/subtasks/{subtask['id']}",
            headers=self.headers
        )
        assert delete_response.status_code == 200
        print(f"✅ Cleaned up test subtask")
    
    def test_move_subtask_between_sub_columns(self):
        """Test moving subtask between sub-columns (drag & drop)"""
        # Get card with sub_columns
        card_response = requests.get(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/cards/{TEST_CARD_ID}",
            headers=self.headers
        )
        assert card_response.status_code == 200
        card = card_response.json()
        
        sub_columns = card.get("sub_columns", [])
        subtasks = card.get("subtasks", [])
        
        if len(sub_columns) < 2:
            pytest.skip("Need at least 2 sub-columns to test move")
        
        if len(subtasks) == 0:
            # Create a test subtask first
            add_response = requests.post(
                f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/cards/{TEST_CARD_ID}/subtasks",
                json={
                    "title": f"TEST_MoveSubtask_{uuid.uuid4().hex[:8]}",
                    "status": "pending",
                    "sub_column_id": sub_columns[0]["id"]
                },
                headers=self.headers
            )
            assert add_response.status_code == 200
            subtask = add_response.json()
            subtask_id = subtask["id"]
            original_col_id = sub_columns[0]["id"]
        else:
            subtask = subtasks[0]
            subtask_id = subtask["id"]
            original_col_id = subtask.get("sub_column_id", sub_columns[0]["id"])
        
        # Find a different sub-column to move to
        target_col_id = None
        for col in sub_columns:
            if col["id"] != original_col_id:
                target_col_id = col["id"]
                break
        
        if not target_col_id:
            pytest.skip("No different sub-column to move to")
        
        # Move subtask
        move_response = requests.put(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/cards/{TEST_CARD_ID}/subtasks/{subtask_id}/move",
            params={"sub_column_id": target_col_id, "order": 0},
            headers=self.headers
        )
        assert move_response.status_code == 200, f"Move subtask failed: {move_response.text}"
        print(f"✅ Moved subtask to different sub-column")
        
        # Verify move
        verify_response = requests.get(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/cards/{TEST_CARD_ID}",
            headers=self.headers
        )
        assert verify_response.status_code == 200
        updated_card = verify_response.json()
        moved_subtask = next((s for s in updated_card["subtasks"] if s["id"] == subtask_id), None)
        assert moved_subtask is not None
        assert moved_subtask["sub_column_id"] == target_col_id, "Subtask should be in new sub-column"
        print(f"✅ Verified subtask moved to sub-column: {target_col_id}")


class TestSubtasksAPI:
    """Subtasks CRUD tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token before each test"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code == 200:
            self.token = response.json()["access_token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Authentication failed")
    
    def test_add_subtask(self):
        """Test adding subtask to card"""
        test_title = f"TEST_Subtask_{uuid.uuid4().hex[:8]}"
        response = requests.post(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/cards/{TEST_CARD_ID}/subtasks",
            json={"title": test_title, "status": "pending"},
            headers=self.headers
        )
        assert response.status_code == 200, f"Add subtask failed: {response.text}"
        
        subtask = response.json()
        assert subtask["title"] == test_title
        assert "id" in subtask
        print(f"✅ Added subtask: {test_title}")
        
        # Clean up
        requests.delete(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/cards/{TEST_CARD_ID}/subtasks/{subtask['id']}",
            headers=self.headers
        )
    
    def test_update_subtask(self):
        """Test updating subtask"""
        # Create subtask first
        create_response = requests.post(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/cards/{TEST_CARD_ID}/subtasks",
            json={"title": f"TEST_Update_{uuid.uuid4().hex[:8]}", "status": "pending"},
            headers=self.headers
        )
        assert create_response.status_code == 200
        subtask = create_response.json()
        subtask_id = subtask["id"]
        
        # Update subtask
        new_title = f"TEST_Updated_{uuid.uuid4().hex[:8]}"
        update_response = requests.put(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/cards/{TEST_CARD_ID}/subtasks/{subtask_id}",
            json={"title": new_title, "status": "done"},
            headers=self.headers
        )
        assert update_response.status_code == 200, f"Update subtask failed: {update_response.text}"
        print(f"✅ Updated subtask to: {new_title}")
        
        # Clean up
        requests.delete(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/cards/{TEST_CARD_ID}/subtasks/{subtask_id}",
            headers=self.headers
        )
    
    def test_delete_subtask(self):
        """Test deleting subtask"""
        # Create subtask first
        create_response = requests.post(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/cards/{TEST_CARD_ID}/subtasks",
            json={"title": f"TEST_Delete_{uuid.uuid4().hex[:8]}", "status": "pending"},
            headers=self.headers
        )
        assert create_response.status_code == 200
        subtask_id = create_response.json()["id"]
        
        # Delete subtask
        delete_response = requests.delete(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/cards/{TEST_CARD_ID}/subtasks/{subtask_id}",
            headers=self.headers
        )
        assert delete_response.status_code == 200, f"Delete subtask failed: {delete_response.text}"
        print(f"✅ Deleted subtask: {subtask_id}")


class TestCommentsAPI:
    """Comments CRUD tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token before each test"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code == 200:
            self.token = response.json()["access_token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Authentication failed")
    
    def test_add_comment(self):
        """Test adding comment to card"""
        test_content = f"TEST_Comment_{uuid.uuid4().hex[:8]}"
        response = requests.post(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/cards/{TEST_CARD_ID}/comments",
            json={"content": test_content},
            headers=self.headers
        )
        assert response.status_code == 200, f"Add comment failed: {response.text}"
        
        comment = response.json()
        assert comment["content"] == test_content
        assert "id" in comment
        assert "created_by_name" in comment
        print(f"✅ Added comment: {test_content[:30]}...")
        
        # Clean up
        requests.delete(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/cards/{TEST_CARD_ID}/comments/{comment['id']}",
            headers=self.headers
        )


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
