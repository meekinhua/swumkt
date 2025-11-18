from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
from enum import Enum

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'swumkt-secret-key-change-in-production')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 72

# Security
security = HTTPBearer()

# Create the main app
app = FastAPI(title="SWUMKT API")
api_router = APIRouter(prefix="/api")

# Enums
class UserRole(str, Enum):
    ADMIN = "admin"
    ALUMNI = "alumni"
    CURRENT_STUDENT = "current_student"
    PUBLIC_USER = "public_user"

class ContentType(str, Enum):
    RESEARCH = "research"
    SURVEY = "survey"
    ARTICLE = "article"
    NEWS = "news"

class ContentStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"

# ============ AUTH MODELS ============
class UserRegister(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: UserRole = UserRole.PUBLIC_USER
    student_id: Optional[str] = None
    graduation_year: Optional[int] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    full_name: str
    role: UserRole
    student_id: Optional[str] = None
    graduation_year: Optional[int] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserProfile(BaseModel):
    id: str
    email: EmailStr
    full_name: str
    role: UserRole
    student_id: Optional[str] = None
    graduation_year: Optional[int] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None

class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserProfile

# ============ CONTENT MODELS ============
class ContentContributor(BaseModel):
    user_id: str
    user_name: str
    role: str  # author, co-author, editor

class ContentCreate(BaseModel):
    title: str
    content: str
    content_type: ContentType
    category: Optional[str] = None
    tags: List[str] = []
    featured_image: Optional[str] = None
    status: ContentStatus = ContentStatus.DRAFT

class ContentUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    featured_image: Optional[str] = None
    status: Optional[ContentStatus] = None

class Content(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    content: str
    content_type: ContentType
    category: Optional[str] = None
    tags: List[str] = []
    featured_image: Optional[str] = None
    status: ContentStatus
    contributors: List[ContentContributor] = []
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    views: int = 0

class Comment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    content_id: str
    user_id: str
    user_name: str
    comment_text: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CommentCreate(BaseModel):
    content_id: str
    comment_text: str

# ============ HELPER FUNCTIONS ============
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "user_id": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    payload = decode_token(token)
    user = await db.users.find_one({"id": payload["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return User(**user)

async def get_admin_user(current_user: User = Depends(get_current_user)):
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

# ============ AUTH ROUTES ============
@api_router.post("/auth/register", response_model=AuthResponse)
async def register(user_data: UserRegister):
    # Check if user exists
    existing_user = await db.users.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create user
    hashed_pw = hash_password(user_data.password)
    user = User(
        email=user_data.email,
        full_name=user_data.full_name,
        role=user_data.role,
        student_id=user_data.student_id,
        graduation_year=user_data.graduation_year
    )
    
    user_dict = user.model_dump()
    user_dict['password'] = hashed_pw
    user_dict['created_at'] = user_dict['created_at'].isoformat()
    user_dict['updated_at'] = user_dict['updated_at'].isoformat()
    
    await db.users.insert_one(user_dict)
    
    # Create token
    token = create_access_token(user.id, user.email, user.role)
    
    return AuthResponse(
        access_token=token,
        user=UserProfile(**user.model_dump())
    )

@api_router.post("/auth/login", response_model=AuthResponse)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not verify_password(credentials.password, user['password']):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Remove MongoDB _id field if it exists
    if '_id' in user:
        del user['_id']
    
    # Create token
    token = create_access_token(user['id'], user['email'], user['role'])
    
    user_obj = User(**user)
    return AuthResponse(
        access_token=token,
        user=UserProfile(**user_obj.model_dump())
    )

@api_router.get("/auth/me", response_model=UserProfile)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserProfile(**current_user.model_dump())

@api_router.put("/auth/profile", response_model=UserProfile)
async def update_profile(
    full_name: Optional[str] = None,
    bio: Optional[str] = None,
    avatar_url: Optional[str] = None,
    student_id: Optional[str] = None,
    graduation_year: Optional[int] = None,
    current_user: User = Depends(get_current_user)
):
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if full_name:
        update_data["full_name"] = full_name
    if bio:
        update_data["bio"] = bio
    if avatar_url:
        update_data["avatar_url"] = avatar_url
    if student_id:
        update_data["student_id"] = student_id
    if graduation_year:
        update_data["graduation_year"] = graduation_year
    
    await db.users.update_one({"id": current_user.id}, {"$set": update_data})
    
    updated_user = await db.users.find_one({"id": current_user.id}, {"_id": 0})
    return UserProfile(**User(**updated_user).model_dump())

# ============ CONTENT ROUTES ============
@api_router.post("/content", response_model=Content)
async def create_content(
    content_data: ContentCreate,
    current_user: User = Depends(get_current_user)
):
    content = Content(
        **content_data.model_dump(),
        created_by=current_user.id,
        contributors=[
            ContentContributor(
                user_id=current_user.id,
                user_name=current_user.full_name,
                role="author"
            )
        ]
    )
    
    doc = content.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    doc['contributors'] = [c.model_dump() if hasattr(c, 'model_dump') else c for c in doc['contributors']]
    
    await db.contents.insert_one(doc)
    return content

@api_router.get("/content", response_model=List[Content])
async def get_contents(
    content_type: Optional[ContentType] = None,
    status: Optional[ContentStatus] = None,
    category: Optional[str] = None,
    skip: int = 0,
    limit: int = 20
):
    query = {}
    if content_type:
        query["content_type"] = content_type
    if status:
        query["status"] = status
    else:
        query["status"] = ContentStatus.PUBLISHED  # Default show only published
    if category:
        query["category"] = category
    
    contents = await db.contents.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    for content in contents:
        if isinstance(content.get('created_at'), str):
            content['created_at'] = datetime.fromisoformat(content['created_at'])
        if isinstance(content.get('updated_at'), str):
            content['updated_at'] = datetime.fromisoformat(content['updated_at'])
    
    return contents

@api_router.get("/content/{content_id}", response_model=Content)
async def get_content(content_id: str):
    content = await db.contents.find_one({"id": content_id}, {"_id": 0})
    if not content:
        raise HTTPException(status_code=404, detail="Content not found")
    
    # Increment views
    await db.contents.update_one({"id": content_id}, {"$inc": {"views": 1}})
    content['views'] = content.get('views', 0) + 1
    
    if isinstance(content.get('created_at'), str):
        content['created_at'] = datetime.fromisoformat(content['created_at'])
    if isinstance(content.get('updated_at'), str):
        content['updated_at'] = datetime.fromisoformat(content['updated_at'])
    
    return Content(**content)

@api_router.put("/content/{content_id}", response_model=Content)
async def update_content(
    content_id: str,
    update_data: ContentUpdate,
    current_user: User = Depends(get_current_user)
):
    content = await db.contents.find_one({"id": content_id})
    if not content:
        raise HTTPException(status_code=404, detail="Content not found")
    
    # Check if user is creator or admin
    if content['created_by'] != current_user.id and current_user.role != UserRole.ADMIN:
        # Check if user is a contributor
        is_contributor = any(c['user_id'] == current_user.id for c in content.get('contributors', []))
        if not is_contributor:
            raise HTTPException(status_code=403, detail="Not authorized to edit this content")
    
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    update_dict['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.contents.update_one({"id": content_id}, {"$set": update_dict})
    
    updated_content = await db.contents.find_one({"id": content_id}, {"_id": 0})
    if isinstance(updated_content.get('created_at'), str):
        updated_content['created_at'] = datetime.fromisoformat(updated_content['created_at'])
    if isinstance(updated_content.get('updated_at'), str):
        updated_content['updated_at'] = datetime.fromisoformat(updated_content['updated_at'])
    
    return Content(**updated_content)

@api_router.delete("/content/{content_id}")
async def delete_content(
    content_id: str,
    current_user: User = Depends(get_current_user)
):
    content = await db.contents.find_one({"id": content_id})
    if not content:
        raise HTTPException(status_code=404, detail="Content not found")
    
    # Only creator or admin can delete
    if content['created_by'] != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Not authorized to delete this content")
    
    await db.contents.delete_one({"id": content_id})
    return {"message": "Content deleted successfully"}

@api_router.post("/content/{content_id}/contributor")
async def add_contributor(
    content_id: str,
    user_email: EmailStr,
    role: str = "co-author",
    current_user: User = Depends(get_current_user)
):
    content = await db.contents.find_one({"id": content_id})
    if not content:
        raise HTTPException(status_code=404, detail="Content not found")
    
    # Only creator or admin can add contributors
    if content['created_by'] != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Find user to add
    user_to_add = await db.users.find_one({"email": user_email})
    if not user_to_add:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if already a contributor
    contributors = content.get('contributors', [])
    if any(c['user_id'] == user_to_add['id'] for c in contributors):
        raise HTTPException(status_code=400, detail="User is already a contributor")
    
    new_contributor = ContentContributor(
        user_id=user_to_add['id'],
        user_name=user_to_add['full_name'],
        role=role
    ).model_dump()
    
    await db.contents.update_one(
        {"id": content_id},
        {"$push": {"contributors": new_contributor}}
    )
    
    return {"message": "Contributor added successfully"}

# Translation Models
class TranslationRequest(BaseModel):
    text: str
    target_language: str = Field(..., description="Target language code (e.g., 'en', 'th', 'zh', 'ja', 'ko', 'my', 'lo', 'vi')")
    source_language: Optional[str] = Field(None, description="Source language code (auto-detect if not provided)")

class TranslationResponse(BaseModel):
    translated_text: str
    source_language: str
    target_language: str

# Translation endpoint
@api_router.post("/translate", response_model=TranslationResponse)
async def translate_text(request: TranslationRequest):
    """Translate text using Emergent LLM (GPT-5)"""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        # Language mapping
        language_names = {
            'th': 'Thai',
            'en': 'English',
            'zh': 'Chinese',
            'ja': 'Japanese',
            'ko': 'Korean',
            'my': 'Burmese',
            'lo': 'Lao',
            'vi': 'Vietnamese'
        }
        
        target_lang_name = language_names.get(request.target_language, request.target_language)
        
        # Get API key
        api_key = os.environ.get('EMERGENT_LLM_KEY')
        if not api_key:
            raise HTTPException(status_code=500, detail="Translation service not configured")
        
        # Create LLM chat
        chat = LlmChat(
            api_key=api_key,
            session_id=f"translation-{uuid.uuid4()}",
            system_message=f"You are a professional translator. Translate the given text to {target_lang_name}. Only return the translated text without any explanations or additional comments."
        ).with_model("openai", "gpt-4o-mini")
        
        # Create translation prompt
        user_message = UserMessage(
            text=f"Translate this text to {target_lang_name}:\n\n{request.text}"
        )
        
        # Get translation
        translated_text = await chat.send_message(user_message)
        
        return TranslationResponse(
            translated_text=translated_text.strip(),
            source_language=request.source_language or 'auto',
            target_language=request.target_language
        )
        
    except Exception as e:
        logging.error(f"Translation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Translation failed: {str(e)}")

# Customer Journey Map Models
class JourneyMapRequest(BaseModel):
    raw_data: str = Field(..., description="Raw qualitative research data (interviews, observations, reviews)")
    research_context: Optional[str] = Field(None, description="Additional context about the research")
    target_language: Optional[str] = Field("en", description="Target language for output (th or en)")
    journey_type: Optional[str] = Field("B", description="Journey type: A (simple) or B (detailed)")
    journey_style: Optional[str] = Field("nonlinear", description="Journey style: linear or nonlinear")

class JourneyMapResponse(BaseModel):
    mermaid_code: str
    analysis_summary: str

class JourneyMapContentCreate(BaseModel):
    title: str = Field(..., description="Content title")
    research_type: str = Field(..., description="Research type: qualitative or quantitative")
    sample_size: Optional[str] = Field(None, description="Sample size")
    data_source: str = Field(..., description="Data source")
    collection_method: str = Field(..., description="Collection method")
    research_date: str = Field(..., description="Research date")
    additional_notes: Optional[str] = Field(None, description="Additional notes")
    mermaid_code: str = Field(..., description="Mermaid diagram code")
    analysis_summary: str = Field(..., description="Analysis summary")
    raw_data: str = Field(..., description="Original raw data")
    research_context: Optional[str] = Field(None, description="Research context")
    journey_type: str = Field(..., description="Journey type")
    journey_style: str = Field(..., description="Journey style")
    output_language: str = Field(..., description="Output language")

class AdminPromptSettings(BaseModel):
    journey_map_prompt: str = Field(..., description="Custom system prompt for journey map generation")
    updated_by: str
    updated_at: str

# Admin: Get Journey Map Prompt Settings
@api_router.get("/admin/journey-map-prompt")
async def get_journey_map_prompt(current_user: User = Depends(get_current_user)):
    """Get current journey map prompt settings (admin only)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        settings = await db.admin_settings.find_one({"setting_type": "journey_map_prompt"})
        if not settings:
            # Return default prompt if not set
            return {
                "journey_map_prompt": get_default_journey_map_prompt(),
                "updated_by": "system",
                "updated_at": None
            }
        
        # Remove MongoDB _id field if it exists
        if '_id' in settings:
            del settings['_id']
        
        return settings
    except Exception as e:
        logging.error(f"Error fetching prompt settings: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch settings")

# Admin: Update Journey Map Prompt Settings
@api_router.put("/admin/journey-map-prompt")
async def update_journey_map_prompt(
    settings: AdminPromptSettings,
    current_user: User = Depends(get_current_user)
):
    """Update journey map prompt settings (admin only)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        from datetime import datetime, timezone
        
        settings_dict = {
            "setting_type": "journey_map_prompt",
            "journey_map_prompt": settings.journey_map_prompt,
            "updated_by": current_user.email,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.admin_settings.update_one(
            {"setting_type": "journey_map_prompt"},
            {"$set": settings_dict},
            upsert=True
        )
        
        return {"message": "Prompt settings updated successfully", "settings": settings_dict}
    except Exception as e:
        logging.error(f"Error updating prompt settings: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update settings")

def get_default_journey_map_prompt():
    """Get default journey map prompt"""
    return """You are an expert market researcher and customer experience analyst specializing in creating Customer Journey Maps.

Your task is to analyze qualitative research data and create a comprehensive Customer Journey Map in Mermaid diagram format.

Guidelines:
1. Identify key stages in the customer journey (e.g., Awareness, Consideration, Purchase, Post-Purchase, Loyalty)
2. For each stage, identify:
   - Touchpoints (where customer interacts with brand)
   - Customer Actions
   - Pain Points (frustrations, challenges)
   - Emotions (feelings at each stage)
   - Opportunities for improvement

3. Output Format:
   - First, provide a brief analysis summary (2-3 paragraphs)
   - Then, generate Mermaid code for a flowchart-style journey map
   - Use clear node labels and connections
   - Include pain points and opportunities as annotations

4. Mermaid Syntax Guidelines:
   - Use graph TD or graph LR for direction
   - Use meaningful node IDs
   - Use descriptive labels
   - Include colors for different types of nodes (stages, touchpoints, pain points)

Example Mermaid structure:
```mermaid
graph TD
    A[Awareness Stage] -->|Search Online| B[Website Visit]
    B -->|Browse Products| C[Product Comparison]
    C -->|Pain Point: Confusing Navigation| D[Consideration Stage]
    D -->|Add to Cart| E[Purchase Stage]
    
    style A fill:#00A9CE,stroke:#005A73,stroke-width:3px,color:#fff
    style D fill:#E63946,stroke:#C62E38,stroke-width:2px,color:#fff
    style E fill:#28a745,stroke:#1e7e34,stroke-width:2px,color:#fff
```

Respond in this exact format:
ANALYSIS:
[Your analysis summary]

MERMAID:
```mermaid
[Your mermaid code]
```
"""

# Customer Journey Map endpoint
@api_router.post("/generate-journey-map", response_model=JourneyMapResponse)
async def generate_journey_map(request: JourneyMapRequest, current_user: User = Depends(get_current_user)):
    """Generate Customer Journey Map using Emergent LLM"""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        # Get API key
        api_key = os.environ.get('EMERGENT_LLM_KEY')
        if not api_key:
            raise HTTPException(status_code=500, detail="Journey Map service not configured")
        
        # Get custom prompt from database or use default
        settings = await db.admin_settings.find_one({"setting_type": "journey_map_prompt"})
        if settings and settings.get("journey_map_prompt"):
            system_prompt = settings["journey_map_prompt"]
        else:
            system_prompt = get_default_journey_map_prompt()
        
        # Create LLM chat
        chat = LlmChat(
            api_key=api_key,
            session_id=f"journey-map-{uuid.uuid4()}",
            system_message=system_prompt
        ).with_model("openai", "gpt-4o")
        
        # Determine language instruction
        language_name = "Thai" if request.target_language == "th" else "English"
        
        # Determine journey type description
        type_desc = "simple and straightforward" if request.journey_type == "A" else "detailed and comprehensive"
        
        # Determine journey style description
        style_desc = "linear sequential path" if request.journey_style == "linear" else "nonlinear with multiple paths and decision points"
        
        # Create user prompt
        user_prompt = f"""Please analyze the following qualitative research data and create a Customer Journey Map:

Research Data:
{request.raw_data}

{f"Additional Context: {request.research_context}" if request.research_context else ""}

Journey Requirements:
- Type: {request.journey_type} ({type_desc})
- Style: {request.journey_style} ({style_desc})
- Output Language: {language_name}

Please provide:
1. Analysis summary of the customer journey in {language_name}
2. Mermaid diagram code for visualization with labels in {language_name}

IMPORTANT: All text in both the analysis summary and the mermaid diagram must be written in {language_name}.
"""
        
        user_message = UserMessage(text=user_prompt)
        
        # Get response from LLM
        response_text = await chat.send_message(user_message)
        
        # Parse response
        analysis_summary = ""
        mermaid_code = ""
        
        if "ANALYSIS:" in response_text and "MERMAID:" in response_text:
            parts = response_text.split("MERMAID:")
            analysis_part = parts[0].replace("ANALYSIS:", "").strip()
            mermaid_part = parts[1].strip()
            
            # Extract mermaid code
            if "```mermaid" in mermaid_part:
                mermaid_code = mermaid_part.split("```mermaid")[1].split("```")[0].strip()
            elif "```" in mermaid_part:
                mermaid_code = mermaid_part.split("```")[1].split("```")[0].strip()
            else:
                mermaid_code = mermaid_part.strip()
            
            analysis_summary = analysis_part
        else:
            # Fallback: try to extract any mermaid code
            if "```mermaid" in response_text:
                mermaid_code = response_text.split("```mermaid")[1].split("```")[0].strip()
                analysis_summary = response_text.split("```mermaid")[0].strip()
            else:
                analysis_summary = response_text
                mermaid_code = "graph TD\n    A[Start] --> B[Process Data]\n    B --> C[End]"
        
        return JourneyMapResponse(
            mermaid_code=mermaid_code,
            analysis_summary=analysis_summary
        )
        
    except Exception as e:
        logging.error(f"Journey Map generation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate journey map: {str(e)}")

# Journey Map: Share as Content
@api_router.post("/journey-map/share-content")
async def share_journey_map_as_content(
    data: JourneyMapContentCreate,
    current_user: User = Depends(get_current_user)
):
    """Share journey map as research content"""
    try:
        # Create content body with all research details and journey map
        content_body = f"""## เทคนิคการวิจัย
Customer Journey Map

## ประเภทการวิจัย
{data.research_type}

## รายละเอียดการวิจัย
- **ขนาดกลุ่มตัวอย่าง:** {data.sample_size or 'N/A'}
- **แหล่งข้อมูล:** {data.data_source}
- **วิธีการเก็บข้อมูล:** {data.collection_method}
- **วันที่ทำการวิจัย:** {data.research_date}

## Journey Map Configuration
- **ประเภท:** {data.journey_type}
- **รูปแบบ:** {data.journey_style}
- **ภาษา:** {data.output_language}

## สรุปการวิเคราะห์
{data.analysis_summary}

## Customer Journey Diagram
```mermaid
{data.mermaid_code}
```

## ข้อมูลการวิจัยดิบ
{data.raw_data}

{f"## บริบทการวิจัย\n{data.research_context}" if data.research_context else ""}

{f"## หมายเหตุเพิ่มเติม\n{data.additional_notes}" if data.additional_notes else ""}
"""
        
        # Create content document
        content_dict = {
            "id": str(uuid.uuid4()),
            "title": data.title,
            "content": content_body,
            "content_type": "research",
            "category": "Customer Journey Map",
            "tags": ["customer-journey", "journey-map", data.research_type.lower(), data.journey_type.lower()],
            "status": "published",
            "contributors": [{
                "user_id": current_user.id,
                "user_name": current_user.full_name,
                "role": "author"
            }],
            "created_by": current_user.id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "views": 0,
            # Store metadata for journey map
            "journey_map_metadata": {
                "research_type": data.research_type,
                "sample_size": data.sample_size,
                "data_source": data.data_source,
                "collection_method": data.collection_method,
                "research_date": data.research_date,
                "journey_type": data.journey_type,
                "journey_style": data.journey_style,
                "output_language": data.output_language,
                "mermaid_code": data.mermaid_code
            }
        }
        
        await db.contents.insert_one(content_dict)
        
        return {
            "message": "Journey map shared as content successfully",
            "content_id": content_dict["id"]
        }
        
    except Exception as e:
        logging.error(f"Error sharing journey map as content: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to share content: {str(e)}")

# ============ COMMENT ROUTES ============
@api_router.post("/comments", response_model=Comment)
async def create_comment(
    comment_data: CommentCreate,
    current_user: User = Depends(get_current_user)
):
    # Verify content exists
    content = await db.contents.find_one({"id": comment_data.content_id})
    if not content:
        raise HTTPException(status_code=404, detail="Content not found")
    
    comment = Comment(
        **comment_data.model_dump(),
        user_id=current_user.id,
        user_name=current_user.full_name
    )
    
    doc = comment.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.comments.insert_one(doc)
    return comment

@api_router.get("/comments/{content_id}", response_model=List[Comment])
async def get_comments(content_id: str):
    comments = await db.comments.find({"content_id": content_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    for comment in comments:
        if isinstance(comment.get('created_at'), str):
            comment['created_at'] = datetime.fromisoformat(comment['created_at'])
    
    return comments

# ============ PLACEHOLDER ROUTES FOR FUTURE FEATURES ============
@api_router.get("/market-research/projects")
async def get_market_research_projects(current_user: User = Depends(get_current_user)):
    return {"message": "Market research feature coming soon", "projects": []}

@api_router.get("/alumni/connections")
async def get_alumni_connections(current_user: User = Depends(get_current_user)):
    return {"message": "Alumni networking feature coming soon", "connections": []}

@api_router.get("/integrations/status")
async def get_integrations_status(current_user: User = Depends(get_admin_user)):
    return {
        "line_notify": {"enabled": False, "status": "Not configured"},
        "email_service": {"enabled": False, "status": "Not configured"},
        "sms_gateway": {"enabled": False, "status": "Not configured"}
    }

# Include the router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()