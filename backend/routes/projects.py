"""
Project Management (Kanban) Routes
===================================
Flexible project management system supporting:
- Department projects (trips, activities)
- Thesis tracking
- Client research projects
"""

from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import uuid
import logging

# Router
project_router = APIRouter(prefix="/projects", tags=["Projects"])

# ============ MODELS ============

class ProjectType(str):
    GENERAL = "general"
    UNIVERSITY_RESEARCH = "university_research"
    INDUSTRY_RESEARCH = "industry_research"
    THESIS = "thesis"
    CLIENT = "client"

# Default column templates
DEFAULT_COLUMNS = {
    "general": [
        {"name": "Backlog", "color": "#6B7280", "order": 0},
        {"name": "To Do", "color": "#3B82F6", "order": 1},
        {"name": "In Progress", "color": "#F59E0B", "order": 2},
        {"name": "Review", "color": "#8B5CF6", "order": 3},
        {"name": "Done", "color": "#10B981", "order": 4}
    ],
    "university_research": [
        {"name": "วางแผน", "color": "#6B7280", "order": 0},
        {"name": "ทบทวนวรรณกรรม", "color": "#3B82F6", "order": 1},
        {"name": "เก็บข้อมูล", "color": "#F59E0B", "order": 2},
        {"name": "วิเคราะห์ข้อมูล", "color": "#8B5CF6", "order": 3},
        {"name": "เขียนรายงาน", "color": "#EC4899", "order": 4},
        {"name": "ตรวจสอบ/แก้ไข", "color": "#F97316", "order": 5},
        {"name": "เสร็จสิ้น", "color": "#10B981", "order": 6}
    ],
    "industry_research": [
        {"name": "รับ Brief", "color": "#6B7280", "order": 0},
        {"name": "วางแผนวิจัย", "color": "#3B82F6", "order": 1},
        {"name": "เก็บข้อมูล", "color": "#F59E0B", "order": 2},
        {"name": "วิเคราะห์", "color": "#8B5CF6", "order": 3},
        {"name": "จัดทำรายงาน", "color": "#EC4899", "order": 4},
        {"name": "นำเสนอลูกค้า", "color": "#F97316", "order": 5},
        {"name": "ส่งมอบงาน", "color": "#10B981", "order": 6}
    ],
    "thesis": [
        {"name": "หัวข้อ/Proposal", "color": "#6B7280", "order": 0},
        {"name": "ทบทวนวรรณกรรม", "color": "#3B82F6", "order": 1},
        {"name": "ออกแบบการวิจัย", "color": "#14B8A6", "order": 2},
        {"name": "เก็บข้อมูล", "color": "#F59E0B", "order": 3},
        {"name": "วิเคราะห์ข้อมูล", "color": "#8B5CF6", "order": 4},
        {"name": "เขียนบทที่ 1-3", "color": "#EC4899", "order": 5},
        {"name": "เขียนบทที่ 4-5", "color": "#F97316", "order": 6},
        {"name": "สอบป้องกัน", "color": "#EF4444", "order": 7},
        {"name": "แก้ไข/ส่งเล่ม", "color": "#10B981", "order": 8}
    ],
    "client": [
        {"name": "รอดำเนินการ", "color": "#6B7280", "order": 0},
        {"name": "กำลังดำเนินการ", "color": "#F59E0B", "order": 1},
        {"name": "รอตรวจสอบ", "color": "#8B5CF6", "order": 2},
        {"name": "ส่งมอบแล้ว", "color": "#10B981", "order": 3}
    ]
}

# Pydantic Models
class ProjectColumnCreate(BaseModel):
    name: str
    color: str = "#3B82F6"
    order: int = 0

class ProjectColumn(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    color: str = "#3B82F6"
    order: int = 0

class SubtaskCreate(BaseModel):
    title: str
    status: str = "pending"  # pending, in_progress, done

class Subtask(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    status: str = "pending"
    order: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CardCommentCreate(BaseModel):
    content: str
    attachments: List[Dict[str, Any]] = []

class CardComment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    content: str
    attachments: List[Dict[str, Any]] = []
    created_by: str
    created_by_name: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ProjectCardCreate(BaseModel):
    title: str
    description: Optional[str] = None
    column_id: str
    assignees: List[str] = []  # User IDs
    due_date: Optional[str] = None
    priority: str = "medium"  # low, medium, high, urgent
    labels: List[str] = []
    subtasks: List[SubtaskCreate] = []

class ProjectCardUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    column_id: Optional[str] = None
    assignees: Optional[List[str]] = None
    due_date: Optional[str] = None
    priority: Optional[str] = None
    labels: Optional[List[str]] = None
    order: Optional[int] = None

class ProjectCard(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    project_id: str
    title: str
    description: Optional[str] = None
    column_id: str
    order: int = 0
    assignees: List[str] = []
    assignee_details: List[Dict[str, Any]] = []  # Populated on fetch
    due_date: Optional[str] = None
    priority: str = "medium"
    labels: List[str] = []
    subtasks: List[Subtask] = []
    comments: List[CardComment] = []
    attachments: List[Dict[str, Any]] = []
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ProjectMember(BaseModel):
    user_id: str
    role: str = "member"  # owner, admin, member, viewer
    added_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    project_type: str = "general"
    visibility: str = "private"  # private, members, public
    columns: Optional[List[ProjectColumnCreate]] = None  # If None, use default

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    visibility: Optional[str] = None
    status: Optional[str] = None

class Project(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    project_type: str = "general"
    visibility: str = "private"
    status: str = "active"  # active, archived
    columns: List[ProjectColumn] = []
    members: List[ProjectMember] = []
    share_token: Optional[str] = None  # For public access
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


def get_project_routes(db, get_current_user, get_optional_user, UserRole):
    """Factory function to create routes with database dependency"""
    
    # ============ PROJECT CRUD ============
    
    @project_router.get("")
    async def list_projects(
        current_user = Depends(get_current_user),
        skip: int = 0,
        limit: int = 50
    ):
        """List projects user has access to"""
        # Admin sees all, others see their projects
        if current_user.role == UserRole.ADMIN:
            query = {}
        else:
            query = {
                "$or": [
                    {"created_by": current_user.id},
                    {"members.user_id": current_user.id},
                    {"visibility": "public"}
                ]
            }
        
        total = await db.projects.count_documents(query)
        projects = await db.projects.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
        
        # Get creator info
        for project in projects:
            creator = await db.users.find_one({"id": project["created_by"]}, {"_id": 0, "full_name": 1, "email": 1})
            project["creator_info"] = creator
        
        return {"projects": projects, "total": total}
    
    @project_router.post("")
    async def create_project(
        data: ProjectCreate,
        current_user = Depends(get_current_user)
    ):
        """Create new project (Admin/Instructor only)"""
        # Check permission
        if current_user.role not in [UserRole.ADMIN, "instructor"]:
            raise HTTPException(status_code=403, detail="Only Admin or Instructor can create projects")
        
        # Get default columns if not provided
        columns = []
        if data.columns:
            for i, col in enumerate(data.columns):
                columns.append(ProjectColumn(
                    name=col.name,
                    color=col.color,
                    order=i
                ).model_dump())
        else:
            template = DEFAULT_COLUMNS.get(data.project_type, DEFAULT_COLUMNS["general"])
            for col in template:
                columns.append(ProjectColumn(
                    name=col["name"],
                    color=col["color"],
                    order=col["order"]
                ).model_dump())
        
        # Generate share token for public access
        share_token = str(uuid.uuid4())[:8] if data.visibility == "public" else None
        
        project = Project(
            name=data.name,
            description=data.description,
            project_type=data.project_type,
            visibility=data.visibility,
            columns=columns,
            members=[ProjectMember(user_id=current_user.id, role="owner").model_dump()],
            share_token=share_token,
            created_by=current_user.id
        )
        
        doc = project.model_dump()
        doc["created_at"] = doc["created_at"].isoformat()
        doc["updated_at"] = doc["updated_at"].isoformat()
        for col in doc["columns"]:
            if isinstance(col.get("created_at"), datetime):
                col["created_at"] = col["created_at"].isoformat()
        for member in doc["members"]:
            if isinstance(member.get("added_at"), datetime):
                member["added_at"] = member["added_at"].isoformat()
        
        await db.projects.insert_one(doc)
        logging.info(f"[PROJECT] Created: {project.id} by {current_user.email}")
        
        # Remove _id from response
        result = await db.projects.find_one({"id": doc["id"]}, {"_id": 0})
        return result
    
    @project_router.get("/templates")
    async def get_column_templates():
        """Get default column templates"""
        return DEFAULT_COLUMNS
    
    @project_router.get("/public/{share_token}")
    async def get_public_project(share_token: str):
        """Access project via public share token (no auth required)"""
        project = await db.projects.find_one({"share_token": share_token}, {"_id": 0})
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Get cards
        cards = await db.project_cards.find({"project_id": project["id"]}, {"_id": 0}).to_list(1000)
        
        # Get assignee details
        for card in cards:
            assignee_details = []
            for user_id in card.get("assignees", []):
                user = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "full_name": 1, "email": 1})
                if user:
                    assignee_details.append(user)
            card["assignee_details"] = assignee_details
        
        return {"project": project, "cards": cards}
    
    @project_router.get("/{project_id}")
    async def get_project(
        project_id: str,
        current_user = Depends(get_current_user)
    ):
        """Get project details with cards"""
        project = await db.projects.find_one({"id": project_id}, {"_id": 0})
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Check access
        is_admin = current_user.role == UserRole.ADMIN
        is_member = any(m["user_id"] == current_user.id for m in project.get("members", []))
        is_public = project.get("visibility") == "public"
        
        if not (is_admin or is_member or is_public):
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Get cards
        cards = await db.project_cards.find({"project_id": project_id}, {"_id": 0}).sort("order", 1).to_list(1000)
        
        # Get assignee details for cards
        for card in cards:
            assignee_details = []
            for user_id in card.get("assignees", []):
                user = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "full_name": 1, "email": 1, "student_id": 1})
                if user:
                    assignee_details.append(user)
            card["assignee_details"] = assignee_details
        
        # Get creator info
        creator = await db.users.find_one({"id": project["created_by"]}, {"_id": 0, "full_name": 1, "email": 1})
        project["creator_info"] = creator
        
        return {"project": project, "cards": cards}
    
    @project_router.put("/{project_id}")
    async def update_project(
        project_id: str,
        data: ProjectUpdate,
        current_user = Depends(get_current_user)
    ):
        """Update project"""
        project = await db.projects.find_one({"id": project_id})
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Check permission
        is_admin = current_user.role == UserRole.ADMIN
        is_owner = any(m["user_id"] == current_user.id and m["role"] == "owner" for m in project.get("members", []))
        
        if not (is_admin or is_owner):
            raise HTTPException(status_code=403, detail="Only owner can update project")
        
        update_data = {k: v for k, v in data.model_dump().items() if v is not None}
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        # Generate share token if visibility changed to public
        if data.visibility == "public" and not project.get("share_token"):
            update_data["share_token"] = str(uuid.uuid4())[:8]
        
        await db.projects.update_one({"id": project_id}, {"$set": update_data})
        
        updated = await db.projects.find_one({"id": project_id}, {"_id": 0})
        return updated
    
    @project_router.delete("/{project_id}")
    async def delete_project(
        project_id: str,
        current_user = Depends(get_current_user)
    ):
        """Delete project"""
        project = await db.projects.find_one({"id": project_id})
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Check permission
        is_admin = current_user.role == UserRole.ADMIN
        is_owner = any(m["user_id"] == current_user.id and m["role"] == "owner" for m in project.get("members", []))
        
        if not (is_admin or is_owner):
            raise HTTPException(status_code=403, detail="Only owner can delete project")
        
        # Delete cards
        await db.project_cards.delete_many({"project_id": project_id})
        await db.projects.delete_one({"id": project_id})
        
        logging.info(f"[PROJECT] Deleted: {project_id} by {current_user.email}")
        return {"message": "Project deleted"}
    
    # ============ COLUMN MANAGEMENT ============
    
    @project_router.post("/{project_id}/columns")
    async def add_column(
        project_id: str,
        data: ProjectColumnCreate,
        current_user = Depends(get_current_user)
    ):
        """Add column to project"""
        project = await db.projects.find_one({"id": project_id})
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Check permission
        is_admin = current_user.role == UserRole.ADMIN
        is_member = any(m["user_id"] == current_user.id and m["role"] in ["owner", "admin"] for m in project.get("members", []))
        
        if not (is_admin or is_member):
            raise HTTPException(status_code=403, detail="Permission denied")
        
        new_column = ProjectColumn(
            name=data.name,
            color=data.color,
            order=len(project.get("columns", []))
        ).model_dump()
        
        await db.projects.update_one(
            {"id": project_id},
            {
                "$push": {"columns": new_column},
                "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
            }
        )
        
        return new_column
    
    @project_router.put("/{project_id}/columns/{column_id}")
    async def update_column(
        project_id: str,
        column_id: str,
        data: ProjectColumnCreate,
        current_user = Depends(get_current_user)
    ):
        """Update column"""
        project = await db.projects.find_one({"id": project_id})
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Check permission
        is_admin = current_user.role == UserRole.ADMIN
        is_member = any(m["user_id"] == current_user.id and m["role"] in ["owner", "admin"] for m in project.get("members", []))
        
        if not (is_admin or is_member):
            raise HTTPException(status_code=403, detail="Permission denied")
        
        # Update column
        columns = project.get("columns", [])
        for col in columns:
            if col["id"] == column_id:
                col["name"] = data.name
                col["color"] = data.color
                col["order"] = data.order
                break
        
        await db.projects.update_one(
            {"id": project_id},
            {
                "$set": {
                    "columns": columns,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
            }
        )
        
        return {"message": "Column updated"}
    
    @project_router.delete("/{project_id}/columns/{column_id}")
    async def delete_column(
        project_id: str,
        column_id: str,
        current_user = Depends(get_current_user)
    ):
        """Delete column (moves cards to first column)"""
        project = await db.projects.find_one({"id": project_id})
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Check permission
        is_admin = current_user.role == UserRole.ADMIN
        is_member = any(m["user_id"] == current_user.id and m["role"] in ["owner", "admin"] for m in project.get("members", []))
        
        if not (is_admin or is_member):
            raise HTTPException(status_code=403, detail="Permission denied")
        
        columns = project.get("columns", [])
        if len(columns) <= 1:
            raise HTTPException(status_code=400, detail="Cannot delete last column")
        
        # Find first column that's not being deleted
        first_column_id = None
        for col in columns:
            if col["id"] != column_id:
                first_column_id = col["id"]
                break
        
        # Move cards to first column
        await db.project_cards.update_many(
            {"project_id": project_id, "column_id": column_id},
            {"$set": {"column_id": first_column_id}}
        )
        
        # Remove column
        columns = [c for c in columns if c["id"] != column_id]
        
        await db.projects.update_one(
            {"id": project_id},
            {
                "$set": {
                    "columns": columns,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
            }
        )
        
        return {"message": "Column deleted"}
    
    @project_router.put("/{project_id}/columns/reorder")
    async def reorder_columns(
        project_id: str,
        column_ids: List[str],
        current_user = Depends(get_current_user)
    ):
        """Reorder columns"""
        project = await db.projects.find_one({"id": project_id})
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Update order
        columns = project.get("columns", [])
        col_map = {c["id"]: c for c in columns}
        
        reordered = []
        for i, col_id in enumerate(column_ids):
            if col_id in col_map:
                col_map[col_id]["order"] = i
                reordered.append(col_map[col_id])
        
        await db.projects.update_one(
            {"id": project_id},
            {"$set": {"columns": reordered, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        
        return {"message": "Columns reordered"}
    
    # ============ CARD CRUD ============
    
    @project_router.post("/{project_id}/cards")
    async def create_card(
        project_id: str,
        data: ProjectCardCreate,
        current_user = Depends(get_current_user)
    ):
        """Create card"""
        project = await db.projects.find_one({"id": project_id})
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Check permission
        is_admin = current_user.role == UserRole.ADMIN
        is_member = any(m["user_id"] == current_user.id for m in project.get("members", []))
        
        if not (is_admin or is_member):
            raise HTTPException(status_code=403, detail="Permission denied")
        
        # Get max order in column
        max_order = await db.project_cards.find_one(
            {"project_id": project_id, "column_id": data.column_id},
            sort=[("order", -1)]
        )
        new_order = (max_order.get("order", 0) + 1) if max_order else 0
        
        # Create subtasks
        subtasks = []
        for i, st in enumerate(data.subtasks):
            subtasks.append(Subtask(
                title=st.title,
                status=st.status,
                order=i
            ).model_dump())
        
        card = ProjectCard(
            project_id=project_id,
            title=data.title,
            description=data.description,
            column_id=data.column_id,
            order=new_order,
            assignees=data.assignees,
            due_date=data.due_date,
            priority=data.priority,
            labels=data.labels,
            subtasks=subtasks,
            created_by=current_user.id
        )
        
        doc = card.model_dump()
        doc["created_at"] = doc["created_at"].isoformat()
        doc["updated_at"] = doc["updated_at"].isoformat()
        for st in doc["subtasks"]:
            if isinstance(st.get("created_at"), datetime):
                st["created_at"] = st["created_at"].isoformat()
        
        await db.project_cards.insert_one(doc)
        
        # Get assignee details
        assignee_details = []
        for user_id in data.assignees:
            user = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "full_name": 1, "email": 1})
            if user:
                assignee_details.append(user)
        doc["assignee_details"] = assignee_details
        
        logging.info(f"[PROJECT_CARD] Created: {card.id} in project {project_id}")
        return doc
    
    @project_router.get("/{project_id}/cards/{card_id}")
    async def get_card(
        project_id: str,
        card_id: str,
        current_user = Depends(get_current_user)
    ):
        """Get card details"""
        card = await db.project_cards.find_one({"id": card_id, "project_id": project_id}, {"_id": 0})
        if not card:
            raise HTTPException(status_code=404, detail="Card not found")
        
        # Get assignee details
        assignee_details = []
        for user_id in card.get("assignees", []):
            user = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "full_name": 1, "email": 1, "student_id": 1})
            if user:
                assignee_details.append(user)
        card["assignee_details"] = assignee_details
        
        return card
    
    @project_router.put("/{project_id}/cards/{card_id}")
    async def update_card(
        project_id: str,
        card_id: str,
        data: ProjectCardUpdate,
        current_user = Depends(get_current_user)
    ):
        """Update card"""
        card = await db.project_cards.find_one({"id": card_id, "project_id": project_id})
        if not card:
            raise HTTPException(status_code=404, detail="Card not found")
        
        project = await db.projects.find_one({"id": project_id})
        
        # Check permission
        is_admin = current_user.role == UserRole.ADMIN
        is_member = any(m["user_id"] == current_user.id for m in project.get("members", []))
        is_public = project.get("visibility") == "public"
        
        if not (is_admin or is_member or is_public):
            raise HTTPException(status_code=403, detail="Permission denied")
        
        update_data = {k: v for k, v in data.model_dump().items() if v is not None}
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        await db.project_cards.update_one({"id": card_id}, {"$set": update_data})
        
        updated = await db.project_cards.find_one({"id": card_id}, {"_id": 0})
        return updated
    
    @project_router.delete("/{project_id}/cards/{card_id}")
    async def delete_card(
        project_id: str,
        card_id: str,
        current_user = Depends(get_current_user)
    ):
        """Delete card"""
        card = await db.project_cards.find_one({"id": card_id, "project_id": project_id})
        if not card:
            raise HTTPException(status_code=404, detail="Card not found")
        
        project = await db.projects.find_one({"id": project_id})
        
        # Check permission
        is_admin = current_user.role == UserRole.ADMIN
        is_owner = card.get("created_by") == current_user.id
        is_project_admin = any(m["user_id"] == current_user.id and m["role"] in ["owner", "admin"] for m in project.get("members", []))
        
        if not (is_admin or is_owner or is_project_admin):
            raise HTTPException(status_code=403, detail="Permission denied")
        
        await db.project_cards.delete_one({"id": card_id})
        return {"message": "Card deleted"}
    
    @project_router.put("/{project_id}/cards/{card_id}/move")
    async def move_card(
        project_id: str,
        card_id: str,
        column_id: str,
        order: int = 0,
        current_user = Depends(get_current_user)
    ):
        """Move card to different column/position"""
        card = await db.project_cards.find_one({"id": card_id, "project_id": project_id})
        if not card:
            raise HTTPException(status_code=404, detail="Card not found")
        
        project = await db.projects.find_one({"id": project_id})
        
        # Check permission - allow members and public projects
        is_admin = current_user.role == UserRole.ADMIN
        is_member = any(m["user_id"] == current_user.id for m in project.get("members", []))
        is_public = project.get("visibility") == "public"
        
        if not (is_admin or is_member or is_public):
            raise HTTPException(status_code=403, detail="Permission denied")
        
        await db.project_cards.update_one(
            {"id": card_id},
            {"$set": {
                "column_id": column_id,
                "order": order,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        return {"message": "Card moved"}
    
    # ============ SUBTASKS ============
    
    @project_router.post("/{project_id}/cards/{card_id}/subtasks")
    async def add_subtask(
        project_id: str,
        card_id: str,
        data: SubtaskCreate,
        current_user = Depends(get_current_user)
    ):
        """Add subtask to card"""
        card = await db.project_cards.find_one({"id": card_id, "project_id": project_id})
        if not card:
            raise HTTPException(status_code=404, detail="Card not found")
        
        subtask = Subtask(
            title=data.title,
            status=data.status,
            order=len(card.get("subtasks", []))
        ).model_dump()
        subtask["created_at"] = subtask["created_at"].isoformat()
        
        await db.project_cards.update_one(
            {"id": card_id},
            {
                "$push": {"subtasks": subtask},
                "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
            }
        )
        
        return subtask
    
    @project_router.put("/{project_id}/cards/{card_id}/subtasks/{subtask_id}")
    async def update_subtask(
        project_id: str,
        card_id: str,
        subtask_id: str,
        data: SubtaskCreate,
        current_user = Depends(get_current_user)
    ):
        """Update subtask"""
        card = await db.project_cards.find_one({"id": card_id, "project_id": project_id})
        if not card:
            raise HTTPException(status_code=404, detail="Card not found")
        
        subtasks = card.get("subtasks", [])
        for st in subtasks:
            if st["id"] == subtask_id:
                st["title"] = data.title
                st["status"] = data.status
                break
        
        await db.project_cards.update_one(
            {"id": card_id},
            {"$set": {"subtasks": subtasks, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        
        return {"message": "Subtask updated"}
    
    @project_router.delete("/{project_id}/cards/{card_id}/subtasks/{subtask_id}")
    async def delete_subtask(
        project_id: str,
        card_id: str,
        subtask_id: str,
        current_user = Depends(get_current_user)
    ):
        """Delete subtask"""
        await db.project_cards.update_one(
            {"id": card_id, "project_id": project_id},
            {
                "$pull": {"subtasks": {"id": subtask_id}},
                "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
            }
        )
        return {"message": "Subtask deleted"}
    
    # ============ COMMENTS ============
    
    @project_router.post("/{project_id}/cards/{card_id}/comments")
    async def add_comment(
        project_id: str,
        card_id: str,
        data: CardCommentCreate,
        current_user = Depends(get_current_user)
    ):
        """Add comment to card"""
        card = await db.project_cards.find_one({"id": card_id, "project_id": project_id})
        if not card:
            raise HTTPException(status_code=404, detail="Card not found")
        
        comment = CardComment(
            content=data.content,
            attachments=data.attachments,
            created_by=current_user.id,
            created_by_name=current_user.full_name
        ).model_dump()
        comment["created_at"] = comment["created_at"].isoformat()
        
        await db.project_cards.update_one(
            {"id": card_id},
            {
                "$push": {"comments": comment},
                "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
            }
        )
        
        # TODO: Send notification to assignees
        
        return comment
    
    @project_router.delete("/{project_id}/cards/{card_id}/comments/{comment_id}")
    async def delete_comment(
        project_id: str,
        card_id: str,
        comment_id: str,
        current_user = Depends(get_current_user)
    ):
        """Delete comment"""
        card = await db.project_cards.find_one({"id": card_id, "project_id": project_id})
        if not card:
            raise HTTPException(status_code=404, detail="Card not found")
        
        # Check if user owns comment or is admin
        comment = next((c for c in card.get("comments", []) if c["id"] == comment_id), None)
        if not comment:
            raise HTTPException(status_code=404, detail="Comment not found")
        
        if comment["created_by"] != current_user.id and current_user.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Cannot delete others' comments")
        
        await db.project_cards.update_one(
            {"id": card_id},
            {
                "$pull": {"comments": {"id": comment_id}},
                "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
            }
        )
        
        return {"message": "Comment deleted"}
    
    # ============ MEMBERS ============
    
    @project_router.post("/{project_id}/members")
    async def add_member(
        project_id: str,
        user_id: str,
        role: str = "member",
        current_user = Depends(get_current_user)
    ):
        """Add member to project"""
        project = await db.projects.find_one({"id": project_id})
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Check permission
        is_admin = current_user.role == UserRole.ADMIN
        is_owner = any(m["user_id"] == current_user.id and m["role"] in ["owner", "admin"] for m in project.get("members", []))
        
        if not (is_admin or is_owner):
            raise HTTPException(status_code=403, detail="Permission denied")
        
        # Check if user exists
        user = await db.users.find_one({"id": user_id})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Check if already member
        if any(m["user_id"] == user_id for m in project.get("members", [])):
            raise HTTPException(status_code=400, detail="User already a member")
        
        member = ProjectMember(user_id=user_id, role=role).model_dump()
        member["added_at"] = member["added_at"].isoformat()
        
        await db.projects.update_one(
            {"id": project_id},
            {"$push": {"members": member}}
        )
        
        return {"message": "Member added", "member": member}
    
    @project_router.delete("/{project_id}/members/{user_id}")
    async def remove_member(
        project_id: str,
        user_id: str,
        current_user = Depends(get_current_user)
    ):
        """Remove member from project"""
        project = await db.projects.find_one({"id": project_id})
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Check permission
        is_admin = current_user.role == UserRole.ADMIN
        is_owner = any(m["user_id"] == current_user.id and m["role"] in ["owner", "admin"] for m in project.get("members", []))
        
        if not (is_admin or is_owner):
            raise HTTPException(status_code=403, detail="Permission denied")
        
        # Cannot remove owner
        target_member = next((m for m in project.get("members", []) if m["user_id"] == user_id), None)
        if target_member and target_member["role"] == "owner":
            raise HTTPException(status_code=400, detail="Cannot remove project owner")
        
        await db.projects.update_one(
            {"id": project_id},
            {"$pull": {"members": {"user_id": user_id}}}
        )
        
        return {"message": "Member removed"}
    
    # ============ PUBLIC ACCESS (No Auth) ============
    
    @project_router.post("/public/{share_token}/cards/{card_id}/comments")
    async def add_public_comment(
        share_token: str,
        card_id: str,
        data: CardCommentCreate,
        guest_name: str = "Guest"
    ):
        """Add comment via public link (no auth)"""
        project = await db.projects.find_one({"share_token": share_token})
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        card = await db.project_cards.find_one({"id": card_id, "project_id": project["id"]})
        if not card:
            raise HTTPException(status_code=404, detail="Card not found")
        
        comment = {
            "id": str(uuid.uuid4()),
            "content": data.content,
            "attachments": data.attachments,
            "created_by": "guest",
            "created_by_name": guest_name,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.project_cards.update_one(
            {"id": card_id},
            {
                "$push": {"comments": comment},
                "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
            }
        )
        
        return comment
    
    @project_router.put("/public/{share_token}/cards/{card_id}/move")
    async def move_public_card(
        share_token: str,
        card_id: str,
        column_id: str,
        order: int = 0
    ):
        """Move card via public link (no auth)"""
        project = await db.projects.find_one({"share_token": share_token})
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        card = await db.project_cards.find_one({"id": card_id, "project_id": project["id"]})
        if not card:
            raise HTTPException(status_code=404, detail="Card not found")
        
        await db.project_cards.update_one(
            {"id": card_id},
            {"$set": {
                "column_id": column_id,
                "order": order,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        return {"message": "Card moved"}
    
    return project_router
