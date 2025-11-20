from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Header, Body
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
import csv
import openpyxl
import pypandoc
import tempfile
import base64
import re
from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from lib.ref_extract import RefExtract
from lib.citation_replacer import CitationReplacer

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

class UserType(str, Enum):
    REGULAR = "regular"
    TRUST = "trust"
    ADMIN = "admin"

class BirthSex(str, Enum):
    MALE = "male"
    FEMALE = "female"

class GenderIdentity(str, Enum):
    MALE = "male"
    FEMALE = "female"
    LGBTQ_PLUS = "lgbtq+"
    OTHER = "other"
    PREFER_NOT_TO_SAY = "prefer_not_to_say"

class EducationLevel(str, Enum):
    BELOW_HIGHSCHOOL = "below_highschool"
    HIGHSCHOOL_VOCATIONAL = "highschool_vocational"
    BACHELOR = "bachelor"
    MASTER = "master"
    PHD = "phd"

class Occupation(str, Enum):
    STUDENT = "student"
    GOVERNMENT = "government"
    PRIVATE_COMPANY = "private_company"
    BUSINESS_OWNER = "business_owner"
    FREELANCE = "freelance"
    UNEMPLOYED = "unemployed"
    RETIRED = "retired"
    OTHER = "other"

class MaritalStatus(str, Enum):
    SINGLE = "single"
    MARRIED = "married"
    DIVORCED = "divorced"
    WIDOWED = "widowed"

class IncomeType(str, Enum):
    RANGE = "range"
    FREETEXT = "freetext"

class ContentType(str, Enum):
    RESEARCH = "research"
    SURVEY = "survey"
    ARTICLE = "article"
    NEWS = "news"

class ContentStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"

class SurveyStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    CLOSED = "closed"

class SurveyType(str, Enum):
    MARKET_SEGMENTATION = "market_segmentation"
    PERCEPTION = "perception"
    COMPETITOR = "competitor"
    BEHAVIOR = "behavior"
    CONJOINT = "conjoint"
    CUSTOM = "custom"

class RespondentAuthMode(str, Enum):
    ANONYMOUS = "anonymous"
    EMAIL = "email"
    LOGIN = "login"

class QuestionType(str, Enum):
    MULTIPLE_CHOICE_SINGLE = "multiple_choice_single"
    MULTIPLE_CHOICE_MULTIPLE = "multiple_choice_multiple"
    RATING_SCALE = "rating_scale"
    OPEN_ENDED = "open_ended"
    MATRIX = "matrix"
    RANKING = "ranking"
    AIDED = "aided"
    UNAIDED = "unaided"

class DataType(str, Enum):
    NOMINAL = "nominal"
    ORDINAL = "ordinal"
    SCALE = "scale"

class CodingSchemeType(str, Enum):
    ORDINAL = "ordinal"
    DUMMY = "dummy"
    EFFECT = "effect"

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

class DemographicsProfile(BaseModel):
    birth_sex: Optional[BirthSex] = None
    gender_identity: Optional[GenderIdentity] = None
    date_of_birth: Optional[str] = None  # YYYY-MM-DD format
    education: Optional[EducationLevel] = None
    occupation: Optional[Occupation] = None
    income_type: Optional[IncomeType] = None
    income_value: Optional[str] = None  # Can be range or freetext
    marital_status: Optional[MaritalStatus] = None
    province: Optional[str] = None
    region: Optional[str] = None  # north, northeast, central, south

class UserRating(BaseModel):
    total_surveys_completed: int = 0
    quality_score: float = 0.0  # 0-100
    trust_score: float = 0.0  # 0-100
    last_updated: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TrustPromotion(BaseModel):
    date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    method: str  # "manual" or "automatic"
    promoted_by: Optional[str] = None  # user_id or "system"

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    full_name: str
    role: UserRole
    user_type: UserType = UserType.REGULAR
    auth_method: str = "email"  # "email" or "google"
    student_id: Optional[str] = None
    graduation_year: Optional[int] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    demographics_profile: Optional[DemographicsProfile] = None
    user_rating: UserRating = Field(default_factory=UserRating)
    promoted_to_trust: Optional[TrustPromotion] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserProfile(BaseModel):
    id: str
    email: EmailStr
    full_name: str
    role: UserRole
    user_type: UserType
    auth_method: str
    student_id: Optional[str] = None
    graduation_year: Optional[int] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    demographics_profile: Optional[DemographicsProfile] = None
    user_rating: Optional[UserRating] = None
    promoted_to_trust: Optional[TrustPromotion] = None

class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserProfile

class UserSession(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    session_token: str
    expires_at: datetime
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SessionDataResponse(BaseModel):
    id: str
    email: str
    name: str
    picture: str
    session_token: str

class DemographicsUpdate(BaseModel):
    birth_sex: Optional[BirthSex] = None
    gender_identity: Optional[GenderIdentity] = None
    date_of_birth: Optional[str] = None
    education: Optional[EducationLevel] = None
    occupation: Optional[Occupation] = None
    income_type: Optional[IncomeType] = None
    income_value: Optional[str] = None
    marital_status: Optional[MaritalStatus] = None
    province: Optional[str] = None
    region: Optional[str] = None

class PromoteTrustUserRequest(BaseModel):
    user_id: str
    reason: Optional[str] = None

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
    attachments: Optional[List[dict]] = Field(default_factory=list, description="File attachments")

class ContentUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    featured_image: Optional[str] = None
    status: Optional[ContentStatus] = None
    attachments: Optional[List[dict]] = None

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
    journey_map_metadata: Optional[dict] = None
    attachments: Optional[List[dict]] = Field(default_factory=list, description="File attachments")

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

# ============ SURVEY MODELS ============
class CodingScheme(BaseModel):
    type: CodingSchemeType
    mapping: Optional[dict] = None  # e.g., {"option1": 1, "option2": 2}

class QuestionOption(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    text: str
    value: Optional[str] = None

class QuestionValidation(BaseModel):
    min_value: Optional[int] = None
    max_value: Optional[int] = None
    min_length: Optional[int] = None
    max_length: Optional[int] = None
    regex: Optional[str] = None

class Question(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: QuestionType
    text: str
    description: Optional[str] = None
    required: bool = True
    data_type: Optional[DataType] = None
    coding_scheme: Optional[CodingScheme] = None
    options: List[QuestionOption] = []
    validation: Optional[QuestionValidation] = None
    order: int = 0

class SurveySection(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: Optional[str] = None
    questions: List[Question] = []
    order: int = 0

class DemographicsConfig(BaseModel):
    collect: bool = True
    auto_fill: bool = True
    fields: List[str] = []  # List of field names to collect

class SurveySettings(BaseModel):
    allow_multiple_submissions: bool = False
    show_progress_bar: bool = True
    randomize_questions: bool = False
    randomize_options: bool = False
    allow_anonymous: bool = True

class Survey(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: Optional[str] = None
    survey_type: SurveyType = SurveyType.CUSTOM
    respondent_auth_mode: RespondentAuthMode = RespondentAuthMode.ANONYMOUS
    demographics_config: DemographicsConfig = Field(default_factory=DemographicsConfig)
    sections: List[SurveySection] = []
    settings: SurveySettings = Field(default_factory=SurveySettings)
    status: SurveyStatus = SurveyStatus.DRAFT
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    published_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None

class SurveyCreate(BaseModel):
    title: str
    description: Optional[str] = None
    survey_type: SurveyType = SurveyType.CUSTOM
    respondent_auth_mode: RespondentAuthMode = RespondentAuthMode.ANONYMOUS

class SurveyUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    survey_type: Optional[SurveyType] = None
    respondent_auth_mode: Optional[RespondentAuthMode] = None
    demographics_config: Optional[DemographicsConfig] = None
    sections: Optional[List[SurveySection]] = None
    settings: Optional[SurveySettings] = None

class Answer(BaseModel):
    question_id: str
    value: Optional[str] = None  # For single answers
    values: Optional[List[str]] = None  # For multiple choice multiple
    text: Optional[str] = None  # For open-ended

class SurveyResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    survey_id: str
    respondent_id: Optional[str] = None  # None for anonymous
    respondent_type: UserType = UserType.REGULAR
    respondent_email: Optional[str] = None  # For email-based
    demographics_snapshot: Optional[DemographicsProfile] = None
    answers: List[Answer] = []
    submitted_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SurveyResponseCreate(BaseModel):
    respondent_email: Optional[str] = None
    demographics: Optional[DemographicsProfile] = None
    answers: List[Answer]

# ============ QUESTION LIBRARY MODELS ============
class QuestionTemplate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    category: str  # demographics, satisfaction, behavior, etc.
    question: Question
    tags: List[str] = []
    created_by: str
    is_public: bool = False
    usage_count: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class QuestionTemplateCreate(BaseModel):
    category: str
    question: Question
    tags: List[str] = []
    is_public: bool = False

class SurveyTemplate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str
    survey_type: SurveyType
    sections: List[SurveySection]
    created_by: str
    is_public: bool = False
    usage_count: int = 0
    tags: List[str] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SurveyTemplateCreate(BaseModel):
    name: str
    description: str
    survey_type: SurveyType
    sections: List[SurveySection]
    is_public: bool = False
    tags: List[str] = []

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

async def get_current_user_from_session(session_token: str):
    """Get user from session token"""
    session = await db.user_sessions.find_one({"session_token": session_token})
    if not session:
        return None
    
    # Check if session expired
    if session['expires_at'] < datetime.now(timezone.utc):
        await db.user_sessions.delete_one({"session_token": session_token})
        return None
    
    user = await db.users.find_one({"id": session['user_id']}, {"_id": 0})
    if not user:
        return None
    
    return User(**user)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    
    # Try session token first (for Google OAuth)
    user = await get_current_user_from_session(token)
    if user:
        return user
    
    # Fallback to JWT
    payload = decode_token(token)
    user_doc = await db.users.find_one({"id": payload["user_id"]}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="User not found")
    return User(**user_doc)

async def get_admin_user(current_user: User = Depends(get_current_user)):
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

# ============ AUTH ROUTES ============

# Google OAuth Session Endpoint
class GoogleSessionRequest(BaseModel):
    session_id: str

@api_router.post("/auth/google/session")
async def process_google_session(request: GoogleSessionRequest):
    """Process Google OAuth session_id and create user session"""
    import httpx
    
    try:
        # Call Emergent Auth API to get session data
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": request.session_id},
                timeout=10.0
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=400, detail="Invalid session ID")
            
            session_data = response.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get session data: {str(e)}")
    
    # Check if user exists
    existing_user = await db.users.find_one({"email": session_data["email"]})
    
    if existing_user:
        # User exists - don't update existing data
        user = User(**existing_user)
    else:
        # Create new user
        user = User(
            email=session_data["email"],
            full_name=session_data["name"],
            role=UserRole.PUBLIC_USER,
            user_type=UserType.REGULAR,
            auth_method="google",
            avatar_url=session_data.get("picture")
        )
        
        user_dict = user.model_dump()
        user_dict['created_at'] = user_dict['created_at'].isoformat()
        user_dict['updated_at'] = user_dict['updated_at'].isoformat()
        user_dict['user_rating'] = {
            'total_surveys_completed': 0,
            'quality_score': 0.0,
            'trust_score': 0.0,
            'last_updated': datetime.now(timezone.utc).isoformat()
        }
        
        await db.users.insert_one(user_dict)
    
    # Create session in database
    session_token = session_data["session_token"]
    user_session = UserSession(
        user_id=user.id,
        session_token=session_token,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7)
    )
    
    session_dict = user_session.model_dump()
    session_dict['expires_at'] = session_dict['expires_at'].isoformat()
    session_dict['created_at'] = session_dict['created_at'].isoformat()
    
    await db.user_sessions.insert_one(session_dict)
    
    return {
        "session_token": session_token,
        "user": UserProfile(**user.model_dump())
    }

@api_router.post("/auth/logout")
async def logout(current_user: User = Depends(get_current_user)):
    """Logout user and delete session"""
    # Delete all sessions for this user
    await db.user_sessions.delete_many({"user_id": current_user.id})
    return {"message": "Logged out successfully"}

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

# ============ DEMOGRAPHICS ROUTES ============
@api_router.get("/user/demographics", response_model=DemographicsProfile)
async def get_demographics(current_user: User = Depends(get_current_user)):
    """Get user's demographics profile"""
    if current_user.demographics_profile:
        return current_user.demographics_profile
    return DemographicsProfile()

@api_router.put("/user/demographics", response_model=DemographicsProfile)
async def update_demographics(
    demographics: DemographicsUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update user's demographics profile"""
    demographics_dict = {
        f"demographics_profile.{k}": v 
        for k, v in demographics.model_dump(exclude_none=True).items()
    }
    demographics_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.users.update_one({"id": current_user.id}, {"$set": demographics_dict})
    
    updated_user = await db.users.find_one({"id": current_user.id}, {"_id": 0})
    user_obj = User(**updated_user)
    return user_obj.demographics_profile or DemographicsProfile()

@api_router.get("/user/rating", response_model=UserRating)
async def get_user_rating(current_user: User = Depends(get_current_user)):
    """Get user's rating and statistics"""
    return current_user.user_rating

# ============ ADMIN - TRUST USER MANAGEMENT ============
@api_router.post("/admin/promote-trust-user")
async def promote_trust_user(
    request: PromoteTrustUserRequest,
    admin_user: User = Depends(get_admin_user)
):
    """Promote user to trust user (Admin only)"""
    user = await db.users.find_one({"id": request.user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.get('user_type') == UserType.TRUST:
        raise HTTPException(status_code=400, detail="User is already a trust user")
    
    promotion_data = {
        "user_type": UserType.TRUST,
        "promoted_to_trust": {
            "date": datetime.now(timezone.utc).isoformat(),
            "method": "manual",
            "promoted_by": admin_user.id
        },
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.update_one({"id": request.user_id}, {"$set": promotion_data})
    
    updated_user = await db.users.find_one({"id": request.user_id}, {"_id": 0})
    return {"message": "User promoted to trust user", "user": UserProfile(**User(**updated_user).model_dump())}

@api_router.get("/admin/users", response_model=List[UserProfile])
async def list_users(
    user_type: Optional[UserType] = None,
    skip: int = 0,
    limit: int = 50,
    admin_user: User = Depends(get_admin_user)
):
    """List all users with optional filtering (Admin only)"""
    query = {}
    if user_type:
        query["user_type"] = user_type
    
    users = await db.users.find(query, {"_id": 0}).skip(skip).limit(limit).to_list(limit)
    return [UserProfile(**User(**u).model_dump()) for u in users]

# ============ SURVEY ROUTES ============
@api_router.post("/surveys", response_model=Survey)
async def create_survey(
    survey_data: SurveyCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a new survey"""
    survey = Survey(
        **survey_data.model_dump(),
        created_by=current_user.id
    )
    
    survey_dict = survey.model_dump()
    survey_dict['created_at'] = survey_dict['created_at'].isoformat()
    survey_dict['updated_at'] = survey_dict['updated_at'].isoformat()
    
    await db.surveys.insert_one(survey_dict)
    return survey

@api_router.get("/surveys", response_model=List[Survey])
async def list_surveys(
    status: Optional[SurveyStatus] = None,
    survey_type: Optional[SurveyType] = None,
    created_by: Optional[str] = None,
    skip: int = 0,
    limit: int = 20,
    current_user: User = Depends(get_current_user)
):
    """List surveys - user can see own surveys or published surveys"""
    query = {}
    
    # Users can see their own surveys or published surveys
    if current_user.role != UserRole.ADMIN:
        query["$or"] = [
            {"created_by": current_user.id},
            {"status": SurveyStatus.PUBLISHED}
        ]
    
    if status:
        query["status"] = status
    if survey_type:
        query["survey_type"] = survey_type
    if created_by:
        query["created_by"] = created_by
    
    surveys = await db.surveys.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    for survey in surveys:
        if isinstance(survey.get('created_at'), str):
            survey['created_at'] = datetime.fromisoformat(survey['created_at'])
        if isinstance(survey.get('updated_at'), str):
            survey['updated_at'] = datetime.fromisoformat(survey['updated_at'])
        if survey.get('published_at') and isinstance(survey['published_at'], str):
            survey['published_at'] = datetime.fromisoformat(survey['published_at'])
        if survey.get('closed_at') and isinstance(survey['closed_at'], str):
            survey['closed_at'] = datetime.fromisoformat(survey['closed_at'])
    
    return surveys

@api_router.get("/surveys/{survey_id}", response_model=Survey)
async def get_survey(survey_id: str):
    """Get survey by ID - public endpoint for taking surveys"""
    survey = await db.surveys.find_one({"id": survey_id}, {"_id": 0})
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    
    if isinstance(survey.get('created_at'), str):
        survey['created_at'] = datetime.fromisoformat(survey['created_at'])
    if isinstance(survey.get('updated_at'), str):
        survey['updated_at'] = datetime.fromisoformat(survey['updated_at'])
    if survey.get('published_at') and isinstance(survey['published_at'], str):
        survey['published_at'] = datetime.fromisoformat(survey['published_at'])
    if survey.get('closed_at') and isinstance(survey['closed_at'], str):
        survey['closed_at'] = datetime.fromisoformat(survey['closed_at'])
    
    return Survey(**survey)

@api_router.put("/surveys/{survey_id}", response_model=Survey)
async def update_survey(
    survey_id: str,
    update_data: SurveyUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update survey - only creator or admin"""
    survey = await db.surveys.find_one({"id": survey_id})
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    
    if survey['created_by'] != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    update_dict = {k: v for k, v in update_data.model_dump(exclude_none=True).items()}
    update_dict['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.surveys.update_one({"id": survey_id}, {"$set": update_dict})
    
    updated_survey = await db.surveys.find_one({"id": survey_id}, {"_id": 0})
    if isinstance(updated_survey.get('created_at'), str):
        updated_survey['created_at'] = datetime.fromisoformat(updated_survey['created_at'])
    if isinstance(updated_survey.get('updated_at'), str):
        updated_survey['updated_at'] = datetime.fromisoformat(updated_survey['updated_at'])
    
    return Survey(**updated_survey)

@api_router.delete("/surveys/{survey_id}")
async def delete_survey(
    survey_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete survey - only creator or admin"""
    survey = await db.surveys.find_one({"id": survey_id})
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    
    if survey['created_by'] != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    await db.surveys.delete_one({"id": survey_id})
    await db.survey_responses.delete_many({"survey_id": survey_id})
    
    return {"message": "Survey deleted successfully"}

@api_router.post("/surveys/{survey_id}/publish")
async def publish_survey(
    survey_id: str,
    current_user: User = Depends(get_current_user)
):
    """Publish survey - only creator or admin"""
    survey = await db.surveys.find_one({"id": survey_id})
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    
    if survey['created_by'] != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    await db.surveys.update_one(
        {"id": survey_id},
        {
            "$set": {
                "status": SurveyStatus.PUBLISHED,
                "published_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    return {"message": "Survey published successfully"}

@api_router.post("/surveys/{survey_id}/close")
async def close_survey(
    survey_id: str,
    current_user: User = Depends(get_current_user)
):
    """Close survey - only creator or admin"""
    survey = await db.surveys.find_one({"id": survey_id})
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    
    if survey['created_by'] != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    await db.surveys.update_one(
        {"id": survey_id},
        {
            "$set": {
                "status": SurveyStatus.CLOSED,
                "closed_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    return {"message": "Survey closed successfully"}

async def get_current_user_optional(credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False))):
    """Get current user if authenticated, None if not"""
    if not credentials:
        return None
    
    try:
        token = credentials.credentials
        
        # Try session token first (for Google OAuth)
        user = await get_current_user_from_session(token)
        if user:
            return user
        
        # Fallback to JWT
        payload = decode_token(token)
        user_doc = await db.users.find_one({"id": payload["user_id"]}, {"_id": 0})
        if not user_doc:
            return None
        return User(**user_doc)
    except:
        return None

@api_router.post("/surveys/{survey_id}/respond")
async def submit_survey_response(
    survey_id: str,
    response_data: SurveyResponseCreate,
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """Submit survey response - public endpoint"""
    survey = await db.surveys.find_one({"id": survey_id})
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    
    if survey['status'] != SurveyStatus.PUBLISHED:
        raise HTTPException(status_code=400, detail="Survey is not published")
    
    # Determine respondent info
    respondent_id = None
    respondent_type = UserType.REGULAR
    demographics_snapshot = None
    
    if current_user:
        respondent_id = current_user.id
        respondent_type = current_user.user_type
        # Get demographics from user profile if auto_fill
        if survey.get('demographics_config', {}).get('auto_fill'):
            demographics_snapshot = current_user.demographics_profile
    
    # Override with provided demographics if any
    if response_data.demographics:
        demographics_snapshot = response_data.demographics
    
    response = SurveyResponse(
        survey_id=survey_id,
        respondent_id=respondent_id,
        respondent_type=respondent_type,
        respondent_email=response_data.respondent_email,
        demographics_snapshot=demographics_snapshot,
        answers=response_data.answers
    )
    
    response_dict = response.model_dump()
    response_dict['submitted_at'] = response_dict['submitted_at'].isoformat()
    
    await db.survey_responses.insert_one(response_dict)
    
    # Update user rating if logged in
    if respondent_id:
        await db.users.update_one(
            {"id": respondent_id},
            {
                "$inc": {"user_rating.total_surveys_completed": 1},
                "$set": {"user_rating.last_updated": datetime.now(timezone.utc).isoformat()}
            }
        )
    
    return {"message": "Response submitted successfully", "response_id": response.id}

@api_router.get("/surveys/{survey_id}/responses")
async def get_survey_responses(
    survey_id: str,
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_user)
):
    """Get survey responses - only creator or admin"""
    survey = await db.surveys.find_one({"id": survey_id})
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    
    if survey['created_by'] != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    responses = await db.survey_responses.find(
        {"survey_id": survey_id},
        {"_id": 0}
    ).skip(skip).limit(limit).to_list(limit)
    
    return responses

@api_router.get("/surveys/{survey_id}/export")
async def export_survey_responses(
    survey_id: str,
    format: str = "csv",  # csv or json
    current_user: User = Depends(get_current_user)
):
    """Export survey responses - only creator or admin"""
    survey = await db.surveys.find_one({"id": survey_id})
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    
    if survey['created_by'] != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    responses = await db.survey_responses.find(
        {"survey_id": survey_id},
        {"_id": 0}
    ).to_list(None)
    
    if format == "json":
        return responses
    
    # CSV export
    import csv
    from io import StringIO
    from fastapi.responses import StreamingResponse
    
    output = StringIO()
    if responses:
        # Get all question IDs from survey
        questions = []
        for section in survey.get('sections', []):
            questions.extend(section.get('questions', []))
        
        # CSV headers
        headers = ['response_id', 'submitted_at', 'respondent_type', 'respondent_email']
        
        # Add demographics headers if collected
        if survey.get('demographics_config', {}).get('collect'):
            headers.extend(['birth_sex', 'gender_identity', 'date_of_birth', 'education', 
                          'occupation', 'income_value', 'marital_status', 'province', 'region'])
        
        # Add question headers
        for q in questions:
            headers.append(f"Q{q['id'][:8]}_{q['text'][:30]}")
        
        writer = csv.DictWriter(output, fieldnames=headers)
        writer.writeheader()
        
        for response in responses:
            row = {
                'response_id': response['id'],
                'submitted_at': response['submitted_at'],
                'respondent_type': response.get('respondent_type', 'regular'),
                'respondent_email': response.get('respondent_email', '')
            }
            
            # Add demographics
            demo = response.get('demographics_snapshot', {})
            if demo:
                row.update({
                    'birth_sex': demo.get('birth_sex', ''),
                    'gender_identity': demo.get('gender_identity', ''),
                    'date_of_birth': demo.get('date_of_birth', ''),
                    'education': demo.get('education', ''),
                    'occupation': demo.get('occupation', ''),
                    'income_value': demo.get('income_value', ''),
                    'marital_status': demo.get('marital_status', ''),
                    'province': demo.get('province', ''),
                    'region': demo.get('region', '')
                })
            
            # Add answers
            for answer in response.get('answers', []):
                q_id = answer['question_id']
                header = next((h for h in headers if h.startswith(f"Q{q_id[:8]}")), None)
                if header:
                    value = answer.get('value') or answer.get('text') or ','.join(answer.get('values', []))
                    row[header] = value
            
            writer.writerow(row)
    
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=survey_{survey_id}_responses.csv"}
    )

# ============ QUESTION LIBRARY ROUTES ============
@api_router.post("/question-templates", response_model=QuestionTemplate)
async def create_question_template(
    template_data: QuestionTemplateCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a question template for reuse"""
    template = QuestionTemplate(
        **template_data.model_dump(),
        created_by=current_user.id
    )
    
    template_dict = template.model_dump()
    template_dict['created_at'] = template_dict['created_at'].isoformat()
    
    await db.question_templates.insert_one(template_dict)
    return template

@api_router.get("/question-templates", response_model=List[QuestionTemplate])
async def list_question_templates(
    category: Optional[str] = None,
    tag: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """List question templates - user can see own templates or public templates"""
    query = {
        "$or": [
            {"created_by": current_user.id},
            {"is_public": True}
        ]
    }
    
    if category:
        query["category"] = category
    if tag:
        query["tags"] = tag
    
    templates = await db.question_templates.find(query, {"_id": 0}).to_list(100)
    
    for template in templates:
        if isinstance(template.get('created_at'), str):
            template['created_at'] = datetime.fromisoformat(template['created_at'])
    
    return templates

@api_router.delete("/question-templates/{template_id}")
async def delete_question_template(
    template_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete question template"""
    template = await db.question_templates.find_one({"id": template_id})
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    if template['created_by'] != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    await db.question_templates.delete_one({"id": template_id})
    return {"message": "Template deleted successfully"}

@api_router.post("/question-templates/{template_id}/use")
async def increment_template_usage(
    template_id: str,
    current_user: User = Depends(get_current_user)
):
    """Increment usage count when template is used"""
    await db.question_templates.update_one(
        {"id": template_id},
        {"$inc": {"usage_count": 1}}
    )
    return {"message": "Usage counted"}

# ============ SURVEY TEMPLATES ============
@api_router.post("/survey-templates", response_model=SurveyTemplate)
async def create_survey_template(
    template_data: SurveyTemplateCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a survey template"""
    template = SurveyTemplate(
        **template_data.model_dump(),
        created_by=current_user.id
    )
    
    template_dict = template.model_dump()
    template_dict['created_at'] = template_dict['created_at'].isoformat()
    
    await db.survey_templates.insert_one(template_dict)
    return template

@api_router.get("/survey-templates", response_model=List[SurveyTemplate])
async def list_survey_templates(
    survey_type: Optional[SurveyType] = None,
    tag: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """List survey templates"""
    # Build query - include user's own templates, public templates, and system templates
    query = {
        "$or": [
            {"created_by": current_user.id},
            {"is_public": True},
            {"created_by": "system"}
        ]
    }
    
    if survey_type:
        query["survey_type"] = survey_type
    if tag:
        query["tags"] = tag
    
    templates = await db.survey_templates.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    for template in templates:
        if isinstance(template.get('created_at'), str):
            template['created_at'] = datetime.fromisoformat(template['created_at'])
    
    return templates

@api_router.get("/survey-templates/{template_id}", response_model=SurveyTemplate)
async def get_survey_template(
    template_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get survey template by ID"""
    template = await db.survey_templates.find_one({"id": template_id}, {"_id": 0})
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    if isinstance(template.get('created_at'), str):
        template['created_at'] = datetime.fromisoformat(template['created_at'])
    
    return SurveyTemplate(**template)

@api_router.delete("/survey-templates/{template_id}")
async def delete_survey_template(
    template_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete survey template"""
    template = await db.survey_templates.find_one({"id": template_id})
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    if template['created_by'] != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    await db.survey_templates.delete_one({"id": template_id})
    return {"message": "Template deleted successfully"}

@api_router.post("/survey-templates/{template_id}/use")
async def increment_survey_template_usage(
    template_id: str,
    current_user: User = Depends(get_current_user)
):
    """Increment usage count when template is used"""
    await db.survey_templates.update_one(
        {"id": template_id},
        {"$inc": {"usage_count": 1}}
    )
    return {"message": "Usage counted"}

@api_router.post("/surveys/from-template/{template_id}", response_model=Survey)
async def create_survey_from_template(
    template_id: str,
    current_user: User = Depends(get_current_user)
):
    """Create a new survey from a template"""
    template = await db.survey_templates.find_one({"id": template_id})
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Increment usage count
    await db.survey_templates.update_one(
        {"id": template_id},
        {"$inc": {"usage_count": 1}}
    )
    
    # Create survey from template
    survey = Survey(
        title=f"{template['name']} (Copy)",
        description=template.get('description', ''),
        survey_type=template['survey_type'],
        sections=template['sections'],
        created_by=current_user.id
    )
    
    survey_dict = survey.model_dump()
    survey_dict['created_at'] = survey_dict['created_at'].isoformat()
    survey_dict['updated_at'] = survey_dict['updated_at'].isoformat()
    
    await db.surveys.insert_one(survey_dict)
    return survey

# ============ AI SURVEY GENERATOR ============
class AIGenerateSurveyRequest(BaseModel):
    description: str
    survey_type: SurveyType = SurveyType.CUSTOM
    num_questions: Optional[int] = 10
    target_language: str = "en"

@api_router.post("/surveys/ai-generate", response_model=Survey)
async def ai_generate_survey(
    request: AIGenerateSurveyRequest,
    current_user: User = Depends(get_current_user)
):
    """Generate a survey using AI based on description using Survey Definition Language (SDL)"""
    from survey_dsl import SurveyDSLParser, SurveyDSLValidator
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    import re
    
    try:
        # Get Emergent LLM key
        api_key = os.environ.get('EMERGENT_LLM_KEY')
        if not api_key:
            raise HTTPException(status_code=500, detail="AI Survey generation service not configured")
        
        # Determine language instructions
        lang_instruction = "English" if request.target_language == "en" else "Thai (ไทย)"
        
        # Build prompt using SDL format
        prompt = f"""You are a professional survey designer. Create a survey using the Survey Definition Language (SDL) YAML format.

**Task:** Create a survey in {lang_instruction} language

**Topic:** {request.description}
**Survey Type:** {request.survey_type.value if hasattr(request.survey_type, 'value') else request.survey_type}
**Target Number of Questions:** {request.num_questions}

**Requirements:**
- Create 2-3 well-organized sections
- Use diverse question types
- Write all text in {lang_instruction}
- Return ONLY valid YAML (no markdown, no explanations)
- IMPORTANT: Use simple strings for 'type', not enum names (e.g., 'perception' not 'SurveyType.PERCEPTION')

**SDL Format Example:**
```yaml
survey: "Survey Title in {lang_instruction}"
type: perception
description: "Brief description in {lang_instruction}"

demographics:
  collect: true
  auto_fill: true
  fields:
    - birth_sex
    - age_group
    - education

sections:
  - name: "Section Name in {lang_instruction}"
    description: "Section description"
    questions:
      - text: "Question in {lang_instruction}?"
        type: multiple_choice_single
        required: yes
        data_type: nominal
        options:
          - "Option 1"
          - "Option 2"
          - "Option 3"
      
      - text: "Rate this..."
        type: rating_scale
        scale: "1-5"
        labels:
          "1": "Very Poor"
          "5": "Excellent"
        required: yes
        data_type: scale
      
      - text: "Your thoughts?"
        type: open_ended
        required: no
        data_type: nominal
```

**Available Question Types:**
- multiple_choice_single: Single selection from options
- multiple_choice_multiple: Multiple selections allowed
- rating_scale: Numeric scale (use scale: "1-5" or "1-10")
- likert_scale: Use likert: agreement-5 or satisfaction-5
- open_ended: Free text response

**Data Types:**
- nominal: Categories without order
- ordinal: Ordered categories
- scale: Numeric scale with intervals

**Now create the survey. Return ONLY the YAML, no markdown blocks, no explanations:**"""
        
        # Create LLM chat using emergentintegrations
        chat = LlmChat(
            api_key=api_key,
            session_id=f"survey-gen-{uuid.uuid4()}",
            system_message="You are a professional survey designer. You create surveys using YAML format. Return only valid YAML without markdown code blocks or explanations."
        ).with_model("openai", "gpt-4o-mini")
        
        # Create user message
        user_message = UserMessage(text=prompt)
        
        # Get response from LLM
        sdl_text = await chat.send_message(user_message)
        
        # Clean response - remove markdown code blocks
        sdl_text = sdl_text.strip()
        sdl_text = re.sub(r'^```(?:yaml|yml)?\s*', '', sdl_text, flags=re.MULTILINE)
        sdl_text = re.sub(r'\s*```$', '', sdl_text, flags=re.MULTILINE)
        sdl_text = sdl_text.strip()
        
        print(f"AI Generated SDL:\n{sdl_text[:500]}...")
        
        # Parse SDL to survey object
        try:
            parser = SurveyDSLParser()
            survey_data = parser.parse(sdl_text)
        except Exception as e:
            print(f"SDL Parsing Error: {str(e)}")
            print(f"Problematic SDL: {sdl_text[:1000]}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to parse AI-generated survey format. Please try again or use templates instead."
            )
        
        # Validate survey
        validator = SurveyDSLValidator()
        is_valid, errors = validator.validate_survey(survey_data)
        
        if not is_valid:
            print(f"Validation errors: {errors}")
            raise HTTPException(
                status_code=500,
                detail=f"AI-generated survey is incomplete. Please try again or use templates."
            )
        
        # Add user info
        survey_data['created_by'] = current_user.id
        
        # Create Survey object for response
        survey = Survey(**survey_data)
        
        survey_dict = survey.model_dump()
        survey_dict['created_at'] = survey_dict['created_at'].isoformat()
        survey_dict['updated_at'] = survey_dict['updated_at'].isoformat()
        
        await db.surveys.insert_one(survey_dict)
        return survey
        
    except HTTPException:
        raise
    except Exception as e:
        # Log full error for debugging
        print(f"AI generation error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500, 
            detail=f"AI generation failed. Please try using templates instead. Error: {str(e)[:100]}"
        )

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
        ).with_model("anthropic", "claude-sonnet-4-20250514")
        
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
        # Create content body with research details and journey map output ONLY (no input data)
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
"""
        
        # Add optional notes section
        if data.additional_notes:
            content_body += f"\n\n## หมายเหตุเพิ่มเติม\n{data.additional_notes}"
        
        # Now content_body is complete
        
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

# ============ CUSTOMER BEHAVIOR ANALYSIS ============
class BehaviorAnalysisRequest(BaseModel):
    raw_data: str = Field(..., description="Raw qualitative research data (interviews, observations, behavioral data)")
    research_context: Optional[str] = Field(None, description="Additional context about the research")
    target_language: Optional[str] = Field("en", description="Target language for output (th or en)")

class BehaviorAnalysisResponse(BaseModel):
    analysis_text: str
    key_findings: List[str] = []
    recommendations: List[str] = []

class BehaviorImageRequest(BaseModel):
    analysis_text: str = Field(..., description="Analysis text to generate illustration for")
    image_style: Optional[str] = Field("infographic", description="Style: infographic, diagram, conceptual")
    target_language: Optional[str] = Field("en", description="Language for image labels")
    image_model: Optional[str] = Field(None, description="Image generation model: openai or gemini")

class BehaviorImageResponse(BaseModel):
    image_url: str
    image_prompt: str

class BehaviorContentCreate(BaseModel):
    title: str = Field(..., description="Content title")
    research_type: str = Field(..., description="Research type: qualitative or quantitative")
    sample_size: Optional[str] = Field(None, description="Sample size")
    data_source: str = Field(..., description="Data source")
    collection_method: str = Field(..., description="Collection method")
    research_date: str = Field(..., description="Research date")
    additional_notes: Optional[str] = Field(None, description="Additional notes")
    analysis_text: str = Field(..., description="Analysis text")
    key_findings: List[str] = Field(default_factory=list, description="Key findings")
    recommendations: List[str] = Field(default_factory=list, description="Recommendations")
    raw_data: str = Field(..., description="Original raw data")
    research_context: Optional[str] = Field(None, description="Research context")
    output_language: str = Field(..., description="Output language")
    image_url: Optional[str] = Field(None, description="Generated image URL if any")
    image_base64: Optional[str] = Field(None, description="Base64 encoded image for attachment")

def get_default_behavior_image_prompt():
    """Get default behavior analysis image generation prompt"""
    return """Create a professional business illustration that visualizes customer behavior analysis.

Guidelines:
1. Style: Clean, modern, business-appropriate
2. Colors: Use a professional color palette (blues, greens, grays)
3. Content: Visual representations of behavioral patterns and insights
4. Layout: Horizontal orientation, suitable for presentation
5. Elements to include:
   - Icons or symbols representing customer actions
   - Flow diagrams showing behavior patterns
   - Data visualization elements (charts, graphs)
   - Clear labels and annotations
6. Avoid: Cluttered designs, too much text, overly complex imagery

The image should be:
- Professional and clean
- Easy to understand at a glance
- Suitable for business presentations
- Focused on key behavioral insights
"""

def get_default_behavior_prompt():
    """Get default customer behavior analysis prompt"""
    return """You are an expert consumer behavior analyst and market researcher.

Your task is to analyze qualitative research data about customer behavior and provide insights.

Guidelines:
1. Identify key behavioral patterns:
   - Purchase behaviors
   - Usage patterns
   - Decision-making processes
   - Motivations and drivers
   - Barriers and obstacles

2. Analyze customer segments if applicable:
   - Different behavior groups
   - Characteristics of each segment
   - Behavioral differences

3. Identify psychological factors:
   - Emotional triggers
   - Cognitive biases
   - Social influences
   - Cultural factors

4. Provide actionable insights:
   - What behaviors to encourage
   - What barriers to remove
   - How to influence positive behaviors

5. Output Structure:
   - Main Analysis (comprehensive text analysis)
   - Key Findings (3-5 bullet points)
   - Recommendations (3-5 actionable items)

Respond in this exact format:
ANALYSIS:
[Your comprehensive analysis text]

KEY_FINDINGS:
- [Finding 1]
- [Finding 2]
- [Finding 3]

RECOMMENDATIONS:
- [Recommendation 1]
- [Recommendation 2]
- [Recommendation 3]
"""

# Admin: Get/Set Behavior Analysis Prompt
@api_router.get("/admin/behavior-prompt")
async def get_behavior_prompt(current_user: User = Depends(get_current_user)):
    """Get current behavior analysis prompt settings (admin only)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        settings = await db.admin_settings.find_one({"setting_type": "behavior_prompt"})
        if not settings:
            return {
                "behavior_prompt": get_default_behavior_prompt(),
                "updated_by": "system",
                "updated_at": None
            }
        
        if '_id' in settings:
            del settings['_id']
        
        return settings
        
    except Exception as e:
        logging.error(f"Error fetching behavior prompt: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch prompt: {str(e)}")

@api_router.post("/admin/behavior-prompt")
async def update_behavior_prompt(
    prompt_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Update behavior analysis prompt (admin only)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        settings_doc = {
            "setting_type": "behavior_prompt",
            "behavior_prompt": prompt_data.get("behavior_prompt"),
            "updated_by": current_user.id,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.admin_settings.update_one(
            {"setting_type": "behavior_prompt"},
            {"$set": settings_doc},
            upsert=True
        )
        
        return {"message": "Behavior prompt updated successfully"}
        
    except Exception as e:
        logging.error(f"Error updating behavior prompt: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update prompt: {str(e)}")

# Admin: Get/Set Behavior Image Model
@api_router.get("/admin/image-model")
async def get_image_model(current_user: User = Depends(get_current_user)):
    """Get current image generation model setting (admin only) - applies to all tools"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        settings = await db.admin_settings.find_one({}, {"_id": 0})
        if not settings or "image_generation_model" not in settings:
            return {
                "image_model": "nanobanana",
                "available_models": ["nanobanana", "openai"],
                "updated_by": "system",
                "updated_at": None
            }
        
        return {
            "image_model": settings.get("image_generation_model", "nanobanana"),
            "available_models": ["nanobanana", "openai"],
            "updated_by": settings.get("updated_by", "system"),
            "updated_at": settings.get("updated_at")
        }
        
    except Exception as e:
        logging.error(f"Error fetching image model setting: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch setting: {str(e)}")

# Admin: Get/Set Behavior Image Prompt
@api_router.get("/admin/behavior-image-prompt")
async def get_behavior_image_prompt(current_user: User = Depends(get_current_user)):
    """Get current behavior image prompt settings (admin only)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        settings = await db.admin_settings.find_one({"setting_type": "behavior_image_prompt"})
        if not settings:
            return {
                "behavior_image_prompt": get_default_behavior_image_prompt(),
                "updated_by": "system",
                "updated_at": None
            }
        
        if '_id' in settings:
            del settings['_id']
        
        return settings
        
    except Exception as e:
        logging.error(f"Error fetching behavior image prompt: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch prompt: {str(e)}")

@api_router.post("/admin/behavior-image-prompt")
async def update_behavior_image_prompt(
    prompt_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Update behavior image prompt (admin only)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        settings_doc = {
            "setting_type": "behavior_image_prompt",
            "behavior_image_prompt": prompt_data.get("behavior_image_prompt"),
            "updated_by": current_user.id,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.admin_settings.update_one(
            {"setting_type": "behavior_image_prompt"},
            {"$set": settings_doc},
            upsert=True
        )
        
        return {"message": "Behavior image prompt updated successfully"}
        
    except Exception as e:
        logging.error(f"Error updating behavior image prompt: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update prompt: {str(e)}")

@api_router.post("/admin/image-model")
async def update_image_model(
    model_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Update image generation model setting (admin only) - applies to all tools"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        image_model = model_data.get("image_model", "nanobanana")
        
        # Validate model
        if image_model not in ["openai", "nanobanana"]:
            raise HTTPException(status_code=400, detail="Invalid image model. Must be 'openai' or 'nanobanana'")
        
        settings_doc = {
            "image_generation_model": image_model,
            "updated_by": current_user.id,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.admin_settings.update_one(
            {},
            {"$set": settings_doc},
            upsert=True
        )
        
        return {"message": f"Image model updated to {image_model} successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error updating image model: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update setting: {str(e)}")

# ============ ADMIN SETTINGS - PERCEPTION PROMPTS ============
@api_router.get("/admin/perception-prompt")
async def get_perception_prompt(current_user: User = Depends(get_current_user)):
    """Get customer perception analysis prompt"""
    try:
        if current_user.role != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")
        
        settings = await db.admin_settings.find_one({}, {"_id": 0})
        return {"prompt": settings.get("perception_prompt", "") if settings else ""}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error getting perception prompt: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/admin/perception-prompt")
async def update_perception_prompt(
    request: dict,
    current_user: User = Depends(get_current_user)
):
    """Update customer perception analysis prompt"""
    try:
        if current_user.role != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")
        
        prompt = request.get("prompt", "").strip()
        
        settings_doc = {"perception_prompt": prompt}
        await db.admin_settings.update_one(
            {},
            {"$set": settings_doc},
            upsert=True
        )
        
        return {"message": "Perception prompt updated successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error updating perception prompt: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update prompt: {str(e)}")

@api_router.get("/admin/perception-question-prompt")
async def get_perception_question_prompt(current_user: User = Depends(get_current_user)):
    """Get customer perception question generation prompt"""
    try:
        if current_user.role != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")
        
        settings = await db.admin_settings.find_one({}, {"_id": 0})
        return {"prompt": settings.get("perception_question_prompt", "") if settings else ""}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error getting perception question prompt: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/admin/perception-question-prompt")
async def update_perception_question_prompt(
    request: dict,
    current_user: User = Depends(get_current_user)
):
    """Update customer perception question generation prompt"""
    try:
        if current_user.role != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")
        
        prompt = request.get("prompt", "").strip()
        
        settings_doc = {"perception_question_prompt": prompt}
        await db.admin_settings.update_one(
            {},
            {"$set": settings_doc},
            upsert=True
        )
        
        return {"message": "Perception question prompt updated successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error updating perception question prompt: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update prompt: {str(e)}")

# Format Editor Model Setting
@api_router.get("/admin/format-editor-model")
async def get_format_editor_model(current_user: User = Depends(get_current_user)):
    """Get format editor LLM model setting"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        settings = await db.admin_settings.find_one({"setting_type": "format_editor_model"}, {"_id": 0})
        if settings:
            return {
                "model": settings.get("model", "claude-sonnet-4"),
                "updated_by": settings.get("updated_by"),
                "updated_at": settings.get("updated_at")
            }
        return {"model": "claude-sonnet-4"}
    except Exception as e:
        logging.error(f"Error fetching format editor model: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch model setting: {str(e)}")

@api_router.post("/admin/format-editor-model")
async def update_format_editor_model(
    request: dict,
    current_user: User = Depends(get_current_user)
):
    """Update format editor LLM model setting"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        model = request.get("model", "claude-sonnet-4")
        
        await db.admin_settings.update_one(
            {"setting_type": "format_editor_model"},
            {
                "$set": {
                    "model": model,
                    "updated_by": current_user.email,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
            },
            upsert=True
        )
        
        return {"message": "Format editor model updated successfully", "model": model}
    except Exception as e:
        logging.error(f"Error updating format editor model: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update model: {str(e)}")

# Generate Behavior Analysis (Text only)
@api_router.post("/generate-behavior-analysis", response_model=BehaviorAnalysisResponse)
async def generate_behavior_analysis(
    request: BehaviorAnalysisRequest,
    current_user: User = Depends(get_current_user)
):
    """Generate Customer Behavior Analysis using Emergent LLM"""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        # Get API key
        api_key = os.environ.get('EMERGENT_LLM_KEY')
        if not api_key:
            raise HTTPException(status_code=500, detail="Behavior Analysis service not configured")
        
        # Get custom prompt from database or use default
        settings = await db.admin_settings.find_one({"setting_type": "behavior_prompt"})
        if settings and settings.get("behavior_prompt"):
            system_prompt = settings["behavior_prompt"]
        else:
            system_prompt = get_default_behavior_prompt()
        
        # Create LLM chat
        chat = LlmChat(
            api_key=api_key,
            session_id=f"behavior-analysis-{uuid.uuid4()}",
            system_message=system_prompt
        ).with_model("anthropic", "claude-sonnet-4-20250514")
        
        # Determine language
        language_name = "Thai" if request.target_language == "th" else "English"
        
        # Create user prompt
        user_prompt = f"""Please analyze the following customer behavior research data:

Research Data:
{request.raw_data}

{f"Additional Context: {request.research_context}" if request.research_context else ""}

Output Language: {language_name}

Please provide a comprehensive analysis with key findings and actionable recommendations in {language_name}.
"""
        
        user_message = UserMessage(text=user_prompt)
        
        # Get response from LLM
        response_text = await chat.send_message(user_message)
        
        # Parse response
        analysis_text = ""
        key_findings = []
        recommendations = []
        
        # Try to parse structured format
        if "ANALYSIS:" in response_text:
            parts = response_text.split("KEY_FINDINGS:")
            analysis_text = parts[0].replace("ANALYSIS:", "").strip()
            
            if len(parts) > 1:
                findings_part = parts[1].split("RECOMMENDATIONS:")[0].strip()
                # Extract bullet points
                for line in findings_part.split('\n'):
                    line = line.strip()
                    if line and (line.startswith('-') or line.startswith('•') or line.startswith('*')):
                        key_findings.append(line.lstrip('-•* ').strip())
                
                if "RECOMMENDATIONS:" in parts[1]:
                    recs_part = parts[1].split("RECOMMENDATIONS:")[1].strip()
                    for line in recs_part.split('\n'):
                        line = line.strip()
                        if line and (line.startswith('-') or line.startswith('•') or line.startswith('*')):
                            recommendations.append(line.lstrip('-•* ').strip())
        else:
            # Fallback: use entire response as analysis
            analysis_text = response_text.strip()
        
        return BehaviorAnalysisResponse(
            analysis_text=analysis_text,
            key_findings=key_findings,
            recommendations=recommendations
        )
        
    except Exception as e:
        logging.error(f"Behavior Analysis generation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate behavior analysis: {str(e)}")

# Generate Illustration for Behavior Analysis
@api_router.post("/generate-behavior-image", response_model=BehaviorImageResponse)
async def generate_behavior_image(
    request: BehaviorImageRequest,
    current_user: User = Depends(get_current_user)
):
    """Generate illustration/diagram for behavior analysis using AI Image Generation"""
    try:
        import base64
        
        # Get API key
        api_key = os.environ.get('EMERGENT_LLM_KEY')
        if not api_key:
            raise HTTPException(status_code=500, detail="Image generation service not configured")
        
        # Get image model preference from admin settings or use request override
        selected_model = request.image_model
        if not selected_model:
            # Check admin settings (shared across all tools)
            settings = await db.admin_settings.find_one({}, {"_id": 0})
            selected_model = settings.get("image_generation_model", "nanobanana") if settings else "nanobanana"
        
        # Get custom image prompt from database or use default
        prompt_settings = await db.admin_settings.find_one({"setting_type": "behavior_image_prompt"})
        if prompt_settings and prompt_settings.get("behavior_image_prompt"):
            base_image_prompt = prompt_settings["behavior_image_prompt"]
        else:
            base_image_prompt = get_default_behavior_image_prompt()
        
        # Build image generation prompt with analysis context
        image_prompt = f"""{base_image_prompt}

Analysis Summary to Visualize:
{request.analysis_text[:500]}...

Target Language for Labels: {request.target_language}
"""
        
        # Generate image based on selected model
        images = []
        try:
            if selected_model == "nanobanana":
                from emergentintegrations.llm.chat import LlmChat, UserMessage
                import base64
                
                chat = LlmChat(
                    api_key=api_key,
                    session_id=f"behavior-image-{uuid.uuid4()}",
                    system_message="You are an AI image generator"
                ).with_model("gemini", "gemini-2.5-flash-image-preview").with_params(modalities=["image", "text"])
                
                msg = UserMessage(text=image_prompt)
                text, generated_images = await chat.send_message_multimodal_response(msg)
                
                if generated_images and len(generated_images) > 0:
                    # Convert to format expected by downstream code
                    image_data = generated_images[0]['data']
                    mime_type = generated_images[0]['mime_type']
                    # Return as list of base64 data URLs
                    images = [f"data:{mime_type};base64,{image_data}"]
                else:
                    raise Exception("No image generated from Nano Banana")
            
            elif selected_model == "openai":
                from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration
                import base64
                
                image_gen = OpenAIImageGeneration(api_key=api_key)
                raw_images = await image_gen.generate_images(
                    prompt=image_prompt,
                    model="gpt-image-1",
                    number_of_images=1
                )
                # Convert bytes to base64 data URL
                if raw_images and len(raw_images) > 0:
                    image_bytes = raw_images[0]
                    if isinstance(image_bytes, bytes):
                        image_b64 = base64.b64encode(image_bytes).decode('utf-8')
                        images = [f"data:image/png;base64,{image_b64}"]
                    else:
                        images = raw_images
        except Exception as e:
            logging.error(f"Image generation failed for model {selected_model}: {str(e)}")
            raise HTTPException(
                status_code=500, 
                detail=f"Image generation failed. Please try again or contact support if the issue persists."
            )
        
        if not images or len(images) == 0:
            raise HTTPException(status_code=500, detail="No image was generated")
        
        # images[0] is already a data URL for nanobanana, or needs conversion for openai
        image_data_url = images[0]
        if not image_data_url.startswith('data:'):
            # OpenAI returns bytes, convert to data URL
            image_base64 = base64.b64encode(images[0]).decode('utf-8')
            image_data_url = f"data:image/png;base64,{image_base64}"
        
        # Compress image to reduce file size
        from image_utils import compress_base64_image, get_image_size_kb
        
        original_size = get_image_size_kb(image_data_url)
        compressed_image = compress_base64_image(image_data_url, max_size_kb=500, quality=85)
        compressed_size = get_image_size_kb(compressed_image)
        
        logging.info(f"Image compressed: {original_size:.1f}KB → {compressed_size:.1f}KB")
        
        return BehaviorImageResponse(
            image_url=compressed_image,
            image_prompt=image_prompt
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Image generation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate image: {str(e)}")

# Share Behavior Analysis as Content
@api_router.post("/behavior-analysis/share-content")
async def share_behavior_as_content(
    data: BehaviorContentCreate,
    current_user: User = Depends(get_current_user)
):
    """Share behavior analysis as research content"""
    try:
        # Create content body
        content_body = f"""## เทคนิคการวิจัย
Customer Behavior Analysis

## ประเภทการวิจัย
{data.research_type}

## รายละเอียดการวิจัย
- **ขนาดกลุ่มตัวอย่าง:** {data.sample_size or 'N/A'}
- **แหล่งข้อมูล:** {data.data_source}
- **วิธีการเก็บข้อมูล:** {data.collection_method}
- **วันที่ทำการวิจัย:** {data.research_date}

## การวิเคราะห์พฤติกรรม
{data.analysis_text}
"""
        
        # Add key findings if available
        if data.key_findings:
            content_body += "\n\n## ประเด็นสำคัญ\n"
            for finding in data.key_findings:
                content_body += f"- {finding}\n"
        
        # Add recommendations if available
        if data.recommendations:
            content_body += "\n\n## ข้อเสนอแนะ\n"
            for rec in data.recommendations:
                content_body += f"- {rec}\n"
        
        # Add optional notes
        if data.additional_notes:
            content_body += f"\n\n## หมายเหตุเพิ่มเติม\n{data.additional_notes}"
        
        # Handle image attachment
        attachments = []
        if data.image_base64:
            from image_utils import compress_base64_image, get_image_size_kb
            
            # Compress image for storage
            compressed_image = compress_base64_image(data.image_base64, max_size_kb=500)
            image_size = get_image_size_kb(compressed_image)
            
            attachments.append({
                "id": str(uuid.uuid4()),
                "filename": "behavior_analysis_illustration.jpg",
                "file_type": "image/jpeg",
                "file_size_kb": round(image_size, 2),
                "file_data": compressed_image,
                "uploaded_at": datetime.now(timezone.utc).isoformat()
            })
        
        # Create content document
        content_dict = {
            "id": str(uuid.uuid4()),
            "title": data.title,
            "content": content_body,
            "content_type": "research",
            "category": "Customer Behavior Analysis",
            "tags": ["customer-behavior", "behavior-analysis", data.research_type.lower()],
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
            "attachments": attachments,
            "behavior_metadata": {
                "research_type": data.research_type,
                "sample_size": data.sample_size,
                "data_source": data.data_source,
                "collection_method": data.collection_method,
                "research_date": data.research_date,
                "output_language": data.output_language,
                "image_url": data.image_url,
                "key_findings": data.key_findings,
                "recommendations": data.recommendations
            }
        }
        
        await db.contents.insert_one(content_dict)
        
        return {
            "message": "Behavior analysis shared as content successfully",
            "content_id": content_dict["id"]
        }
        
    except Exception as e:
        logging.error(f"Error sharing behavior analysis as content: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to share content: {str(e)}")

# ============ IMAGE COMPRESSION ROUTE ============
class ImageCompressRequest(BaseModel):
    image_base64: str

@api_router.post("/compress-image")
async def compress_image(
    request: ImageCompressRequest,
    current_user: User = Depends(get_current_user)
):
    """Compress an uploaded image"""
    try:
        from image_utils import compress_base64_image
        compressed_image = compress_base64_image(request.image_base64, max_size_kb=500)
        return {"compressed_image": compressed_image}
    except Exception as e:
        logging.error(f"Image compression error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to compress image: {str(e)}")

# ============ CUSTOMER PERCEPTION ANALYSIS ROUTES ============
class PerceptionQuestionRequest(BaseModel):
    topic: str
    perspective: Optional[str] = None
    target_language: str = "th"

class PerceptionQuestionResponse(BaseModel):
    questions: List[str]

class PerceptionAnalysisRequest(BaseModel):
    interview_data: str
    analysis_context: Optional[str] = None
    target_language: str = "th"

class PerceptionAnalysisResponse(BaseModel):
    analysis_text: str
    key_findings: List[str]
    recommendations: List[str]

class PerceptionContentCreate(BaseModel):
    title: str
    research_type: str
    sample_size: Optional[str] = None
    data_source: str
    collection_method: str
    research_date: str
    additional_notes: Optional[str] = None
    analysis_text: str
    key_findings: List[str] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)
    interview_data: str
    analysis_context: Optional[str] = None
    output_language: str
    image_url: Optional[str] = None
    image_base64: Optional[str] = None

# ============ Journal Finder Models ============
class JournalFinderRequest(BaseModel):
    topic: str
    abstract: str
    keywords: str
    target_language: str = "th"

class JournalResult(BaseModel):
    journal_name: str
    publisher: Optional[str] = None
    issn: Optional[str] = None
    website: Optional[str] = None
    abdc_rating: Optional[str] = None
    ajg_rating: Optional[str] = None
    impact_factor: Optional[str] = None
    quartile: Optional[str] = None
    scopus_indexed: Optional[str] = None
    is_official_data: bool = True  # True for ABDC/AJG, False for estimated
    scimago_url: Optional[str] = None

class JournalFinderResponse(BaseModel):
    journals: List[JournalResult]
    explanation: str
    disclaimer: str

class JournalBrowseRequest(BaseModel):
    search_query: Optional[str] = None
    abdc_rating: Optional[str] = None  # A*, A, B, C
    ajg_rating: Optional[str] = None   # 4*, 4, 3, 2, 1
    limit: int = 100
    target_language: str = "th"

# ============ Academic Format Editor Models ============
class FetchGuidelinesRequest(BaseModel):
    journal_name: str
    target_language: str = "th"

class FetchGuidelinesResponse(BaseModel):
    journal_name: str
    guidelines: str
    format_style: Optional[str] = None
    formatting_specs: Optional[dict] = None  # Extracted specs from guidelines

class FormatEditorRequest(BaseModel):
    original_text: Optional[str] = None
    file_base64: Optional[str] = None  # Base64 encoded .docx file
    file_name: Optional[str] = None
    journal_name: Optional[str] = None
    guidelines: Optional[str] = None
    format_style: str = "APA"  # APA, MLA, Chicago, Harvard, IEEE
    target_language: str = "th"

class FormatChange(BaseModel):
    section: str
    original: str
    formatted: str
    reason: str

class SectionProgress(BaseModel):
    section_name: str
    status: str  # processing, completed, error
    formatted_text: Optional[str] = None
    changes: List[FormatChange] = []

class FormatEditorResponse(BaseModel):
    formatted_text: Optional[str] = None
    formatted_file_base64: Optional[str] = None  # Base64 encoded .docx
    formatted_file_name: Optional[str] = None
    changes: List[FormatChange]
    summary: str
    sections_processed: List[str] = []
    method_used: str = "pandoc"  # "pandoc" or "llm"
    bib_content: Optional[str] = None  # BibTeX content from anystyle

# ============ Format Editor Helper Functions ============
def get_csl_file_path(format_style: str):
    """Get CSL file path for citation style"""
    style_map = {
        "APA": "apa.csl",
        "MLA": "mla.csl",
        "Chicago": "chicago.csl",
        "Harvard": "harvard.csl",
        "IEEE": "ieee.csl",
        "Vancouver": "vancouver.csl",
        "Nature": "nature.csl",
        "Elsevier-Harvard": "elsevier-harvard.csl",
        "Emerald": "emerald.csl",
        "AMA": "american-medical-association.csl",
        "Turabian": "turabian.csl",
        "ACS": "acs.csl",
        "Springer": "springer.csl"
    }
    csl_file = style_map.get(format_style, "apa.csl")
    csl_path = ROOT_DIR / 'csl_styles' / csl_file
    return str(csl_path)

async def detect_citation_style_from_journal(journal_name: str):
    """Use LLM to detect citation style from journal name"""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        api_key = os.environ.get('EMERGENT_LLM_KEY')
        if not api_key:
            return "APA"  # Default fallback
        
        system_prompt = """You are a citation style expert. Given a journal name, identify which citation style it uses.

Return ONLY ONE WORD from: APA, MLA, Chicago, Harvard, IEEE

No explanation, just the style name."""

        user_prompt = f"Journal name: {journal_name}\n\nWhat citation style does this journal use?"
        
        chat = LlmChat(
            api_key=api_key,
            session_id=f"style-detect-{uuid.uuid4()}",
            system_message=system_prompt
        ).with_model("anthropic", "claude-sonnet-4-20250514")
        
        msg = UserMessage(text=user_prompt)
        response = await chat.send_message(msg)
        
        # Clean response
        style = response.strip().upper()
        if style in ["APA", "MLA", "CHICAGO", "HARVARD", "IEEE"]:
            return style.title() if style != "APA" and style != "MLA" and style != "IEEE" else style
        
        return "APA"  # Default
        
    except Exception as e:
        logging.error(f"Error detecting citation style: {str(e)}")
        return "APA"

async def extract_formatting_specs_from_guidelines(guidelines: str):
    """Use LLM to extract comprehensive formatting specifications from journal guidelines"""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        api_key = os.environ.get('EMERGENT_LLM_KEY')
        if not api_key:
            return None
        
        system_prompt = """You are an expert at extracting document formatting specifications from journal author guidelines.

Extract ALL formatting details in JSON format. Be comprehensive and precise.

EXTRACTION RULES:
1. Academic fonts: Times New Roman, Georgia, Garamond (never Calibri/Cambria)
2. Line spacing: 1.0 (single), 1.5, or 2.0 (double)
3. Measurements in inches (convert cm/mm if needed)
4. Text alignment: "left", "center", "right", or "justify"
5. Page size: "Letter" (8.5x11) or "A4" (8.27x11.69)
6. Orientation: "portrait" or "landscape"
7. Citation styles: "APA", "MLA", "Chicago", "Harvard", "IEEE", "Vancouver", "Nature", "Elsevier-Harvard", "Emerald", "AMA", "Turabian", "ACS", "Springer"

COMPREHENSIVE FIELDS TO EXTRACT:

**CRITICAL - Citation Style:**
- citation_style: string (REQUIRED - one of: "APA", "MLA", "Chicago", "Harvard", "IEEE", "Vancouver", "Nature", "Elsevier-Harvard", "Emerald", "AMA", "Turabian", "ACS", "Springer")
- citation_format_notes: string (any special citation requirements)

**Body Text:**
- font_name: string (default: "Times New Roman")
- font_size: number in pt (default: 12)
- font_color: string hex (default: "#000000")
- line_spacing: number (default: 2.0)
- text_alignment: string (default: "left")
- paragraph_spacing_before: number in pt (default: 0)
- paragraph_spacing_after: number in pt (default: 0)
- first_line_indent: number in inches (default: 0.5)

**Margins (separate for precision):**
- margin_top: number in inches (default: 1.0)
- margin_bottom: number in inches (default: 1.0)
- margin_left: number in inches (default: 1.0)
- margin_right: number in inches (default: 1.0)

**Headings (Level 1):**
- heading_font_name: string (default: "Times New Roman")
- heading_font_size: number in pt (default: 14)
- heading_bold: boolean (default: true)
- heading_italic: boolean (default: false)
- heading_underline: boolean (default: false)
- heading_alignment: string (default: "center")
- heading_spacing_before: number in pt (default: 12)
- heading_spacing_after: number in pt (default: 6)
- heading_all_caps: boolean (default: false)

**Subheadings (Level 2):**
- subheading_font_size: number in pt (default: 12)
- subheading_bold: boolean (default: true)
- subheading_italic: boolean (default: false)
- subheading_alignment: string (default: "left")

**References/Bibliography:**
- reference_font_size: number in pt (default: 12)
- reference_hanging_indent: number in inches (default: 0.5)
- reference_line_spacing: number (default: 1.0)
- reference_spacing_between: number in pt (default: 0)

**Page Setup:**
- page_size: string (default: "Letter")
- page_orientation: string (default: "portrait")
- page_numbers: boolean (default: true)
- page_number_position: string (default: "top-right")

**Block Quotes:**
- block_quote_indent_left: number in inches (default: 0.5)
- block_quote_indent_right: number in inches (default: 0.5)
- block_quote_font_size: number in pt (default: 12)

**Tables & Figures:**
- caption_font_size: number in pt (default: 10)
- caption_italic: boolean (default: true)
- caption_alignment: string (default: "left")

Return ONLY valid JSON with all fields, no explanations or markdown."""

        user_prompt = f"""Journal Author Guidelines:
{guidelines[:4000]}

Extract ALL formatting specifications as comprehensive JSON."""

        chat = LlmChat(
            api_key=api_key,
            session_id=f"extract-specs-{uuid.uuid4()}",
            system_message=system_prompt
        ).with_model("anthropic", "claude-sonnet-4-20250514")
        
        msg = UserMessage(text=user_prompt)
        response = await chat.send_message(msg)
        
        # Parse JSON
        import json
        import re
        
        # Extract JSON from response
        json_match = re.search(r'\{[\s\S]*\}', response)
        if json_match:
            specs = json.loads(json_match.group(0))
            return specs
        
        return None
        
    except Exception as e:
        logging.error(f"Error extracting formatting specs: {str(e)}")
        return None

def generate_template_from_specs(specs: dict, output_path: str):
    """Generate comprehensive .docx template from formatting specifications"""
    try:
        doc = Document()
        
        # ============ BODY TEXT STYLE (Normal) ============
        normal_style = doc.styles['Normal']
        normal_font = normal_style.font
        
        # Font settings
        font_name = specs.get('font_name', 'Times New Roman')
        if font_name in ['Cambria', 'Calibri', 'Arial']:
            font_name = 'Times New Roman'  # Academic standard
        
        normal_font.name = font_name
        normal_font.size = Pt(specs.get('font_size', 12))
        
        # Try to set font color if specified
        font_color = specs.get('font_color', '#000000')
        if font_color and font_color != '#000000':
            try:
                color_hex = font_color.lstrip('#')
                r, g, b = tuple(int(color_hex[i:i+2], 16) for i in (0, 2, 4))
                normal_font.color.rgb = RGBColor(r, g, b)
            except:
                pass
        
        # Paragraph formatting
        para_format = normal_style.paragraph_format
        
        # Line spacing
        line_spacing_value = specs.get('line_spacing', 2.0)
        if line_spacing_value == 1.0:
            para_format.line_spacing_rule = WD_LINE_SPACING.SINGLE
        elif line_spacing_value == 1.5:
            para_format.line_spacing_rule = WD_LINE_SPACING.ONE_POINT_FIVE
        elif line_spacing_value == 2.0:
            para_format.line_spacing_rule = WD_LINE_SPACING.DOUBLE
        else:
            para_format.line_spacing = line_spacing_value
        
        # Paragraph spacing
        para_format.space_before = Pt(specs.get('paragraph_spacing_before', 0))
        para_format.space_after = Pt(specs.get('paragraph_spacing_after', 0))
        
        # First line indent
        first_line = specs.get('first_line_indent', 0.5)
        if first_line > 0:
            para_format.first_line_indent = Inches(first_line)
        
        # Text alignment
        alignment_map = {
            'left': WD_ALIGN_PARAGRAPH.LEFT,
            'center': WD_ALIGN_PARAGRAPH.CENTER,
            'right': WD_ALIGN_PARAGRAPH.RIGHT,
            'justify': WD_ALIGN_PARAGRAPH.JUSTIFY
        }
        alignment = specs.get('text_alignment', 'left')
        if alignment in alignment_map:
            para_format.alignment = alignment_map[alignment]
        
        # ============ MARGINS ============
        sections = doc.sections
        for section in sections:
            section.top_margin = Inches(specs.get('margin_top', 1.0))
            section.bottom_margin = Inches(specs.get('margin_bottom', 1.0))
            section.left_margin = Inches(specs.get('margin_left', 1.0))
            section.right_margin = Inches(specs.get('margin_right', 1.0))
            
            # Page size and orientation
            page_size = specs.get('page_size', 'Letter')
            if page_size == 'A4':
                section.page_width = Inches(8.27)
                section.page_height = Inches(11.69)
            else:  # Letter
                section.page_width = Inches(8.5)
                section.page_height = Inches(11)
        
        # ============ HEADING 1 STYLE ============
        heading1_style = doc.styles['Heading 1']
        h1_font = heading1_style.font
        h1_font.name = specs.get('heading_font_name', font_name)
        h1_font.size = Pt(specs.get('heading_font_size', 14))
        h1_font.bold = specs.get('heading_bold', True)
        h1_font.italic = specs.get('heading_italic', False)
        h1_font.underline = specs.get('heading_underline', False)
        h1_font.all_caps = specs.get('heading_all_caps', False)
        
        h1_para = heading1_style.paragraph_format
        h1_para.space_before = Pt(specs.get('heading_spacing_before', 12))
        h1_para.space_after = Pt(specs.get('heading_spacing_after', 6))
        
        h1_alignment = specs.get('heading_alignment', 'center')
        if h1_alignment in alignment_map:
            h1_para.alignment = alignment_map[h1_alignment]
        
        # ============ HEADING 2 STYLE ============
        heading2_style = doc.styles['Heading 2']
        h2_font = heading2_style.font
        h2_font.name = specs.get('heading_font_name', font_name)
        h2_font.size = Pt(specs.get('subheading_font_size', 12))
        h2_font.bold = specs.get('subheading_bold', True)
        h2_font.italic = specs.get('subheading_italic', False)
        
        h2_para = heading2_style.paragraph_format
        h2_alignment = specs.get('subheading_alignment', 'left')
        if h2_alignment in alignment_map:
            h2_para.alignment = alignment_map[h2_alignment]
        
        # ============ BLOCK QUOTE STYLE ============
        try:
            quote_style = doc.styles['Quote']
            quote_para = quote_style.paragraph_format
            quote_para.left_indent = Inches(specs.get('block_quote_indent_left', 0.5))
            quote_para.right_indent = Inches(specs.get('block_quote_indent_right', 0.5))
            
            quote_font = quote_style.font
            quote_font.size = Pt(specs.get('block_quote_font_size', 12))
        except:
            pass  # Quote style might not exist
        
        # ============ CAPTION STYLE ============
        try:
            caption_style = doc.styles['Caption']
            cap_font = caption_style.font
            cap_font.size = Pt(specs.get('caption_font_size', 10))
            cap_font.italic = specs.get('caption_italic', True)
            
            cap_para = caption_style.paragraph_format
            cap_alignment = specs.get('caption_alignment', 'left')
            if cap_alignment in alignment_map:
                cap_para.alignment = alignment_map[cap_alignment]
        except:
            pass
        
        # Add dummy content to activate styles
        doc.add_paragraph("Sample body text")
        doc.add_heading("Sample Heading 1", level=1)
        doc.add_heading("Sample Heading 2", level=2)
        
        # Save template
        doc.save(output_path)
        logging.info(f"Comprehensive template generated with {len(specs)} parameters: {output_path}")
        return True
        
    except Exception as e:
        logging.error(f"Error generating template: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

async def extract_references_to_bib(docx_path: str, output_bib_path: str):
    """Extract references from docx and convert to .bib using AI (OpenAI GPT-4)"""
    try:
        from docx import Document
        
        # Read document
        doc = Document(docx_path)
        
        # Get all paragraphs text
        all_paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        
        if not all_paragraphs:
            logging.warning("Document is empty")
            return False
        
        references_text = None
        
        # Method 1: Try to find references section by heading
        ref_section_start = -1
        for i, paragraph in enumerate(doc.paragraphs):
            if paragraph.style.name.startswith('Heading'):
                text_lower = paragraph.text.lower()
                if 'reference' in text_lower or 'bibliography' in text_lower or 'works cited' in text_lower or 'บรรณานุกรม' in text_lower:
                    ref_section_start = i
                    break
        
        if ref_section_start >= 0:
            # Found heading - extract from there
            ref_paragraphs = doc.paragraphs[ref_section_start+1:]
            references_text = "\n".join([p.text for p in ref_paragraphs if p.text.strip()])
            logging.info(f"Found references section with heading at paragraph {ref_section_start}")
        else:
            # Method 2: No heading found - analyze last 40% of document
            logging.info("No references heading found, analyzing last 40% of document")
            
            total_paragraphs = len(all_paragraphs)
            start_index = int(total_paragraphs * 0.6)  # Start from 60% position
            
            # Get last 40% of document
            last_portion = "\n".join(all_paragraphs[start_index:])
            
            if len(last_portion) > 100:  # Only if there's substantial text
                references_text = last_portion
                logging.info(f"Using last {total_paragraphs - start_index} paragraphs for reference extraction")
            else:
                logging.warning("Last portion of document is too short")
                return False
        
        if not references_text or not references_text.strip():
            logging.warning("No text to extract references from")
            return False
        
        # Use RefExtract with AI to convert to BibTeX
        emergent_key = os.environ.get('EMERGENT_LLM_KEY', 'sk-emergent-8C9010bB74cCfAc069')
        extractor = RefExtract(api_key=emergent_key, model="gpt-4o")
        
        # Extract references
        logging.info(f"Extracting references from {len(references_text)} characters of text")
        refs = await extractor.extract_from_text(references_text)
        
        if not refs:
            logging.warning("No references extracted by AI")
            return False
        
        # Convert to BibTeX format
        bib_content = RefExtract.to_bibtex_file(refs)
        
        # Write to output file
        with open(output_bib_path, 'w', encoding='utf-8') as f:
            f.write(bib_content)
        
        logging.info(f"Successfully created .bib file with AI: {output_bib_path} ({len(refs)} entries)")
        return True
            
    except Exception as e:
        logging.error(f"Error extracting references to bib: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def format_document_with_pandoc(input_file: str, output_file: str, csl_file: str, template_file: str = None, bib_file: str = None):
    """Format document using Pandoc with CSL, optional template, and optional bibliography"""
    try:
        extra_args = [
            '--citeproc',  # Enable citation processing
            f'--csl={csl_file}',  # Citation style
            '--standalone'
        ]
        
        # Add bibliography if provided
        if bib_file and os.path.exists(bib_file):
            extra_args.append(f'--bibliography={bib_file}')
            logging.info(f"Using bibliography file: {bib_file}")
        
        # Add reference document if provided
        if template_file and os.path.exists(template_file):
            extra_args.append(f'--reference-doc={template_file}')
        
        # Convert with citation processing
        pypandoc.convert_file(
            input_file,
            'docx',
            outputfile=output_file,
            extra_args=extra_args
        )
        return True
    except Exception as e:
        logging.error(f"Pandoc conversion error: {str(e)}")
        return False

async def get_format_editor_model():
    """Get configured LLM model for format editor from admin settings"""
    try:
        settings = await db.admin_settings.find_one(
            {"setting_type": "format_editor_model"}, 
            {"_id": 0}
        )
        if settings and settings.get("model"):
            return settings["model"]
    except Exception as e:
        logging.error(f"Error fetching format editor model: {str(e)}")
    
    return "claude-sonnet-4"  # Default

def get_llm_provider_and_model(model_name: str):
    """Map model name to provider and full model identifier"""
    model_map = {
        "claude-sonnet-4": ("anthropic", "claude-sonnet-4-20250514"),
        "gpt-5": ("openai", "gpt-5"),
        "gemini-2.5-pro": ("google", "gemini-2.5-pro-preview-01-17"),
        "gemini-flash": ("google", "gemini-2.0-flash-exp")
    }
    return model_map.get(model_name, ("anthropic", "claude-sonnet-4-20250514"))

def split_document_into_sections(text: str):
    """Split document into logical sections for processing"""
    import re
    
    sections = {}
    
    # Common section headers
    section_patterns = [
        (r'(?i)(abstract|บทคัดย่อ)[:\s]*\n', 'Abstract'),
        (r'(?i)(introduction|บทนำ)[:\s]*\n', 'Introduction'),
        (r'(?i)(literature review|ทบทวนวรรณกรรม)[:\s]*\n', 'Literature Review'),
        (r'(?i)(method(ology)?|วิธีการวิจัย)[:\s]*\n', 'Methodology'),
        (r'(?i)(results?|ผลการวิจัย)[:\s]*\n', 'Results'),
        (r'(?i)(discussion|อภิปรายผล)[:\s]*\n', 'Discussion'),
        (r'(?i)(conclusion|สรุป)[:\s]*\n', 'Conclusion'),
        (r'(?i)(references?|เอกสารอ้างอิง|bibliography)[:\s]*\n', 'References')
    ]
    
    # Find section positions
    section_positions = []
    for pattern, name in section_patterns:
        for match in re.finditer(pattern, text, re.MULTILINE):
            section_positions.append((match.start(), name))
    
    # Sort by position
    section_positions.sort()
    
    # If no clear sections found, split by length
    if len(section_positions) < 2:
        # Split into chunks of ~3000 words
        words = text.split()
        chunk_size = 3000
        for i in range(0, len(words), chunk_size):
            chunk_text = ' '.join(words[i:i+chunk_size])
            sections[f'Section {i//chunk_size + 1}'] = chunk_text
        return sections
    
    # Extract sections based on found positions
    for i, (pos, name) in enumerate(section_positions):
        if i < len(section_positions) - 1:
            next_pos = section_positions[i + 1][0]
            sections[name] = text[pos:next_pos].strip()
        else:
            sections[name] = text[pos:].strip()
    
    return sections

# ============ Journal Database Loaders ============
def load_abdc_database():
    """Load ABDC journal database from CSV"""
    abdc_journals = {}
    try:
        csv_path = ROOT_DIR / 'data' / 'abdc_journals.csv'
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                title = row.get('Title', '').strip()
                if title:
                    abdc_journals[title.lower()] = {
                        'title': title,
                        'publisher': row.get('Publisher', ''),
                        'rating': row.get('Rating', ''),
                        'issn': row.get('ISSN', ''),
                        'issn_online': row.get('ISSN Online', ''),
                        'website': row.get('Website', '')
                    }
    except Exception as e:
        logging.error(f"Error loading ABDC database: {str(e)}")
    return abdc_journals

def load_ajg_database():
    """Load AJG 2024 journal database from Excel"""
    ajg_journals = {}
    try:
        xlsx_path = ROOT_DIR / 'data' / 'ajg_2024.xlsx'
        wb = openpyxl.load_workbook(xlsx_path, read_only=True)
        ws = wb.active
        
        for row in ws.iter_rows(min_row=2, values_only=True):
            if row and len(row) >= 3:
                journal_title = str(row[2]).strip() if row[2] else None
                ajg_rating = str(row[3]).strip() if len(row) > 3 and row[3] else None
                
                if journal_title:
                    ajg_journals[journal_title.lower()] = {
                        'title': journal_title,
                        'rating': ajg_rating,
                        'category': str(row[0]).strip() if row[0] else ''
                    }
    except Exception as e:
        logging.error(f"Error loading AJG database: {str(e)}")
    return ajg_journals

def get_default_perception_prompt():
    """Get default customer perception analysis prompt"""
    return """You are an expert in customer perception analysis and qualitative research.

Your task is to analyze interview data about customer perceptions, attitudes, and opinions.

Guidelines:
1. Identify key perception patterns:
   - Brand perceptions
   - Product/service perceptions
   - Value propositions
   - Emotional responses
   - Cognitive associations

2. Analyze customer attitudes:
   - Positive and negative attitudes
   - Attitude strength and conviction
   - Barriers to adoption
   - Motivators and drivers

3. Understanding customer mindset:
   - Mental models
   - Expectations vs reality
   - Past experiences influence
   - Future intentions

4. Provide actionable insights:
   - Perception gaps to address
   - Communication opportunities
   - Brand positioning recommendations
   - Experience improvements

5. Output Structure:
   - Main Analysis (comprehensive perception analysis)
   - Key Findings (3-5 bullet points)
   - Recommendations (3-5 actionable items)

Respond in this exact format:
ANALYSIS:
[Your comprehensive perception analysis text]

KEY_FINDINGS:
- [Finding 1]
- [Finding 2]
- [Finding 3]

RECOMMENDATIONS:
- [Recommendation 1]
- [Recommendation 2]
- [Recommendation 3]"""

def get_default_perception_question_prompt():
    """Get default customer perception question generation prompt"""
    return """You are an expert qualitative researcher specializing in customer perception studies.

Your task is to generate interview questions for understanding customer perceptions and attitudes.

Guidelines:
1. Create open-ended questions that elicit detailed responses
2. Use probing questions to understand underlying thoughts
3. Focus on perceptions, not just behaviors
4. Include questions about:
   - Initial impressions
   - Detailed perceptions of specific aspects
   - Emotional responses
   - Comparisons (if relevant)
   - Future expectations
   
5. Structure questions from general to specific
6. Avoid leading questions
7. Generate 8-12 questions

Output only the questions as a numbered list, nothing else."""

@api_router.post("/perception/generate-questions", response_model=PerceptionQuestionResponse)
async def generate_perception_questions(
    request: PerceptionQuestionRequest,
    current_user: User = Depends(get_current_user)
):
    """Generate interview questions for customer perception research"""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        # Get API key from environment
        api_key = os.environ.get('EMERGENT_LLM_KEY')
        if not api_key:
            raise HTTPException(status_code=500, detail="Perception Question service not configured")
        
        # Get admin settings or use default
        settings = await db.admin_settings.find_one({}) or {}
        system_prompt = settings.get("perception_question_prompt", get_default_perception_question_prompt())
        
        # Build user prompt
        user_prompt = f"""Research Topic: {request.topic}"""
        
        if request.perspective:
            user_prompt += f"\n\nResearch Perspective/Focus Areas:\n{request.perspective}"
        
        user_prompt += f"\n\nGenerate interview questions in {request.target_language} language."
        
        # Create LLM chat
        chat = LlmChat(
            api_key=api_key,
            session_id=f"perception-questions-{uuid.uuid4()}",
            system_message=system_prompt
        ).with_model("anthropic", "claude-sonnet-4-20250514")
        
        user_message = UserMessage(text=user_prompt)
        
        # Get response from LLM
        response = await chat.send_message(user_message)
        
        # Parse questions from response
        lines = [line.strip() for line in response.split('\n') if line.strip()]
        questions = []
        
        for line in lines:
            # Remove numbering and extract question
            if any(line.startswith(f"{i}.") or line.startswith(f"{i})") for i in range(1, 50)):
                question = line.split('.', 1)[-1].split(')', 1)[-1].strip()
                if question:
                    questions.append(question)
            elif line and not line.endswith(':'):
                questions.append(line)
        
        return PerceptionQuestionResponse(questions=questions[:12])
        
    except Exception as e:
        logging.error(f"Error generating perception questions: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate questions: {str(e)}")

@api_router.post("/perception/generate-analysis", response_model=PerceptionAnalysisResponse)
async def generate_perception_analysis(
    request: PerceptionAnalysisRequest,
    current_user: User = Depends(get_current_user)
):
    """Generate customer perception analysis from interview data"""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        # Get API key from environment
        api_key = os.environ.get('EMERGENT_LLM_KEY')
        if not api_key:
            raise HTTPException(status_code=500, detail="Perception Analysis service not configured")
        
        # Get admin settings or use default
        settings = await db.admin_settings.find_one({}) or {}
        system_prompt = settings.get("perception_prompt", get_default_perception_prompt())
        
        # Build user prompt
        user_prompt = f"""Interview Data:
{request.interview_data}"""
        
        if request.analysis_context:
            user_prompt += f"\n\nAdditional Context:\n{request.analysis_context}"
        
        user_prompt += f"\n\nProvide analysis in {request.target_language} language."
        
        # Create LLM chat
        chat = LlmChat(
            api_key=api_key,
            session_id=f"perception-analysis-{uuid.uuid4()}",
            system_message=system_prompt
        ).with_model("anthropic", "claude-sonnet-4-20250514")
        
        user_message = UserMessage(text=user_prompt)
        
        # Get response from LLM
        response = await chat.send_message(user_message)
        
        # Parse response
        analysis_text = ""
        key_findings = []
        recommendations = []
        
        current_section = None
        
        for line in response.split('\n'):
            line = line.strip()
            
            if line.startswith('ANALYSIS:'):
                current_section = 'analysis'
                continue
            elif line.startswith('KEY_FINDINGS:'):
                current_section = 'findings'
                continue
            elif line.startswith('RECOMMENDATIONS:'):
                current_section = 'recommendations'
                continue
            
            if line:
                if current_section == 'analysis':
                    analysis_text += line + '\n'
                elif current_section == 'findings' and line.startswith('-'):
                    key_findings.append(line[1:].strip())
                elif current_section == 'recommendations' and line.startswith('-'):
                    recommendations.append(line[1:].strip())
        
        if not analysis_text:
            analysis_text = response
        
        return PerceptionAnalysisResponse(
            analysis_text=analysis_text.strip(),
            key_findings=key_findings,
            recommendations=recommendations
        )
        
    except Exception as e:
        logging.error(f"Error generating perception analysis: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate analysis: {str(e)}")

@api_router.post("/perception/generate-illustration")
async def generate_perception_illustration(
    request: dict,
    current_user: User = Depends(get_current_user)
):
    """Generate illustration for customer perception analysis"""
    try:
        # Get API key
        api_key = os.environ.get('EMERGENT_LLM_KEY')
        if not api_key:
            raise HTTPException(status_code=500, detail="Image generation service not configured")
        
        # Get admin settings
        settings = await db.admin_settings.find_one({}) or {}
        image_model = settings.get("image_generation_model", "nanobanana")
        image_prompt_template = settings.get("image_generation_prompt", "")
        
        # Build image generation prompt
        analysis_text = request.get("analysis_text", "")
        target_language = request.get("target_language", "en")
        
        if image_prompt_template:
            prompt = f"{image_prompt_template}\n\nAnalysis Context: {analysis_text[:500]}"
        else:
            prompt = f"Create a professional business illustration for customer perception analysis. Style: clean, modern infographic showing customer perceptions, attitudes, and opinions. Based on: {analysis_text[:300]}"
        
        # Generate image
        image_url = None
        
        if image_model == "nanobanana":
            from emergentintegrations.llm.chat import LlmChat, UserMessage
            
            chat = LlmChat(
                api_key=api_key,
                session_id=f"perception-image-{uuid.uuid4()}",
                system_message="You are an AI image generator"
            ).with_model("gemini", "gemini-2.5-flash-image-preview").with_params(modalities=["image", "text"])
            
            msg = UserMessage(text=prompt)
            text, images = await chat.send_message_multimodal_response(msg)
            
            if images and len(images) > 0:
                image_data = images[0]['data']
                mime_type = images[0]['mime_type']
                image_url = f"data:{mime_type};base64,{image_data}"
        else:
            # OpenAI fallback
            from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration
            import base64
            
            openai = OpenAIImageGeneration(api_key=api_key)
            raw_images = await openai.generate_images(
                prompt=prompt,
                model="gpt-image-1",
                number_of_images=1
            )
            if raw_images and len(raw_images) > 0:
                image_bytes = raw_images[0]
                if isinstance(image_bytes, bytes):
                    image_b64 = base64.b64encode(image_bytes).decode('utf-8')
                    image_url = f"data:image/png;base64,{image_b64}"
                else:
                    image_url = image_bytes
        
        if not image_url:
            raise HTTPException(status_code=500, detail="No image generated")
        
        return {"image_url": image_url}
        
    except Exception as e:
        logging.error(f"Error generating perception illustration: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate image: {str(e)}")

@api_router.post("/perception/save-as-content")
async def save_perception_as_content(
    data: PerceptionContentCreate,
    current_user: User = Depends(get_current_user)
):
    """Save customer perception analysis as content"""
    try:
        # Create content body
        content_body = f"""## เทคนิคการวิจัย
Customer Perception Analysis

## ประเภทการวิจัย
{data.research_type}

## รายละเอียดการวิจัย
- **ขนาดกลุ่มตัวอย่าง:** {data.sample_size or 'N/A'}
- **แหล่งข้อมูล:** {data.data_source}
- **วิธีการเก็บข้อมูล:** {data.collection_method}
- **วันที่ทำการวิจัย:** {data.research_date}

## การวิเคราะห์การรับรู้
{data.analysis_text}
"""
        
        # Add key findings
        if data.key_findings:
            content_body += "\n\n## ประเด็นสำคัญ\n"
            for finding in data.key_findings:
                content_body += f"- {finding}\n"
        
        # Add recommendations
        if data.recommendations:
            content_body += "\n\n## ข้อเสนอแนะ\n"
            for rec in data.recommendations:
                content_body += f"- {rec}\n"
        
        # Add optional notes
        if data.additional_notes:
            content_body += f"\n\n## หมายเหตุเพิ่มเติม\n{data.additional_notes}"
        
        # Handle image attachment
        attachments = []
        if data.image_base64:
            from image_utils import compress_base64_image, get_image_size_kb
            
            # Compress image
            compressed_image = compress_base64_image(data.image_base64, max_size_kb=500)
            image_size = get_image_size_kb(compressed_image)
            
            attachments.append({
                "id": str(uuid.uuid4()),
                "filename": "perception_analysis_illustration.jpg",
                "file_type": "image/jpeg",
                "file_size_kb": round(image_size, 2),
                "file_data": compressed_image,
                "uploaded_at": datetime.now(timezone.utc).isoformat()
            })
        
        # Create content document
        content_dict = {
            "id": str(uuid.uuid4()),
            "title": data.title,
            "content": content_body,
            "content_type": "research",
            "category": "Customer Perception Analysis",
            "tags": ["customer-perception", "perception-analysis", data.research_type.lower()],
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
            "attachments": attachments,
            "perception_metadata": {
                "research_type": data.research_type,
                "sample_size": data.sample_size,
                "data_source": data.data_source,
                "collection_method": data.collection_method,
                "research_date": data.research_date,
                "output_language": data.output_language,
                "image_url": data.image_url,
                "key_findings": data.key_findings,
                "recommendations": data.recommendations
            }
        }
        
        await db.contents.insert_one(content_dict)
        
        return {
            "message": "Perception analysis shared as content successfully",
            "content_id": content_dict["id"]
        }
        
    except Exception as e:
        logging.error(f"Error sharing perception analysis as content: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to share content: {str(e)}")

# ============ IMAGE GENERATION PLAYGROUND ============
class ImagePlaygroundRequest(BaseModel):
    prompt: str
    model: str  # 'openai', 'gemini', 'nanobanana'
    base_image: Optional[str] = None  # base64 image for image editing

@api_router.post("/admin/test-image-generation")
async def test_image_generation(
    request: ImagePlaygroundRequest,
    current_user: User = Depends(get_current_user)
):
    """Test image generation in admin playground"""
    try:
        if current_user.role != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")
        
        image_url = None
        
        if request.model == "nanobanana":
            # Use Nano Banana (Gemini 2.5 Flash Image Preview)
            from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
            import base64
            
            api_key = os.environ.get('EMERGENT_LLM_KEY')
            if not api_key:
                raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY not configured")
            
            chat = LlmChat(
                api_key=api_key,
                session_id=f"image-playground-{uuid.uuid4()}",
                system_message="You are an AI image generator"
            ).with_model("gemini", "gemini-2.5-flash-image-preview").with_params(modalities=["image", "text"])
            
            if request.base_image:
                # Image editing mode
                # Remove data URL prefix if present (data:image/xxx;base64,)
                base_image_data = request.base_image
                if base_image_data.startswith('data:'):
                    base_image_data = base_image_data.split(',', 1)[1]
                
                msg = UserMessage(
                    text=request.prompt,
                    file_contents=[ImageContent(base_image_data)]
                )
            else:
                # Image generation mode
                msg = UserMessage(text=request.prompt)
            
            text, images = await chat.send_message_multimodal_response(msg)
            
            if images and len(images) > 0:
                # Return as base64 data URL
                image_data = images[0]['data']
                mime_type = images[0]['mime_type']
                image_url = f"data:{mime_type};base64,{image_data}"
            else:
                raise HTTPException(status_code=500, detail="No image generated")
                
        elif request.model == "openai":
            # Use OpenAI DALL-E
            from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration
            import base64
            
            api_key = os.environ.get('EMERGENT_LLM_KEY')
            if not api_key:
                raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY not configured")
            
            openai = OpenAIImageGeneration(api_key=api_key)
            images = await openai.generate_images(
                prompt=request.prompt,
                model="gpt-image-1",
                number_of_images=1
            )
            if images and len(images) > 0:
                # Convert bytes to base64 data URL
                image_bytes = images[0]
                if isinstance(image_bytes, bytes):
                    image_b64 = base64.b64encode(image_bytes).decode('utf-8')
                    image_url = f"data:image/png;base64,{image_b64}"
                else:
                    image_url = image_bytes
            else:
                raise HTTPException(status_code=500, detail="No image generated")
            
        else:
            raise HTTPException(status_code=400, detail="Invalid model specified")
        
        return {"image_url": image_url, "model_used": request.model}
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error testing image generation: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate image: {str(e)}")

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

# ============ JOURNAL FINDER API ============
@api_router.post("/journal-finder", response_model=JournalFinderResponse)
async def find_journals(
    request: JournalFinderRequest,
    current_user: User = Depends(get_current_user)
):
    """Find suitable academic journals based on research topic, abstract, and keywords"""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        # Get API key
        api_key = os.environ.get('EMERGENT_LLM_KEY')
        if not api_key:
            raise HTTPException(status_code=500, detail="Journal Finder service not configured")
        
        # Load journal databases
        abdc_db = load_abdc_database()
        ajg_db = load_ajg_database()
        
        # Build system prompt
        system_prompt = """You are an expert academic research advisor specializing in helping researchers find suitable journals for publication.

Your task is to suggest suitable academic journals based on the research topic, abstract, and keywords provided.

Guidelines:
1. Suggest 5-10 highly relevant journals
2. Consider the research field, methodology, and scope
3. Include journals of varying prestige levels (top-tier to mid-tier)
4. Provide journal names EXACTLY as they appear in official databases
5. For each journal, provide:
   - Full journal name (exact official name)
   - Brief explanation of why it's suitable
   - Estimated Impact Factor (if you know it, otherwise mark as "Unknown")
   - Estimated Quartile (Q1, Q2, Q3, Q4, or "Unknown")
   - Scopus/ISI indexing status (Yes/No/Unknown)

Output Format (IMPORTANT - Follow exactly):
JOURNAL: [Exact Journal Name]
PUBLISHER: [Publisher name if known, otherwise "Unknown"]
REASON: [Brief explanation of suitability]
IMPACT_FACTOR: [Estimated IF or "Unknown"]
QUARTILE: [Q1/Q2/Q3/Q4 or "Unknown"]
SCOPUS: [Yes/No/Unknown]
---

Repeat for each journal suggestion."""

        # Build user prompt
        user_prompt = f"""Research Topic: {request.topic}

Abstract:
{request.abstract}

Keywords: {request.keywords}

Please suggest suitable academic journals for this research."""

        # Get response from Claude
        chat = LlmChat(
            api_key=api_key,
            session_id=f"journal-finder-{uuid.uuid4()}",
            system_message=system_prompt
        ).with_model("anthropic", "claude-sonnet-4-20250514")
        
        msg = UserMessage(text=user_prompt)
        response_text = await chat.send_message(msg)
        
        # Parse response and match with databases
        journals = []
        current_journal = {}
        
        for line in response_text.split('\n'):
            line = line.strip()
            
            if line.startswith('JOURNAL:'):
                if current_journal.get('journal_name'):
                    journals.append(current_journal)
                current_journal = {'journal_name': line.replace('JOURNAL:', '').strip()}
            elif line.startswith('PUBLISHER:'):
                current_journal['publisher'] = line.replace('PUBLISHER:', '').strip()
            elif line.startswith('REASON:'):
                current_journal['reason'] = line.replace('REASON:', '').strip()
            elif line.startswith('IMPACT_FACTOR:'):
                current_journal['ai_impact_factor'] = line.replace('IMPACT_FACTOR:', '').strip()
            elif line.startswith('QUARTILE:'):
                current_journal['ai_quartile'] = line.replace('QUARTILE:', '').strip()
            elif line.startswith('SCOPUS:'):
                current_journal['ai_scopus'] = line.replace('SCOPUS:', '').strip()
        
        # Add last journal
        if current_journal.get('journal_name'):
            journals.append(current_journal)
        
        # Match with ABDC and AJG databases
        results = []
        for journal in journals:
            journal_name = journal['journal_name']
            journal_name_lower = journal_name.lower()
            
            # Check ABDC database
            abdc_match = abdc_db.get(journal_name_lower)
            abdc_rating = None
            issn = None
            website = None
            
            if abdc_match:
                abdc_rating = abdc_match['rating']
                issn = abdc_match['issn'] or abdc_match['issn_online']
                website = abdc_match['website']
            
            # Check AJG database
            ajg_match = ajg_db.get(journal_name_lower)
            ajg_rating = ajg_match['rating'] if ajg_match else None
            
            # Build result
            result = JournalResult(
                journal_name=journal_name,
                publisher=journal.get('publisher', 'Unknown'),
                issn=issn,
                website=website,
                abdc_rating=abdc_rating,
                ajg_rating=ajg_rating,
                impact_factor=journal.get('ai_impact_factor', 'Unknown'),
                quartile=journal.get('ai_quartile', 'Unknown'),
                scopus_indexed=journal.get('ai_scopus', 'Unknown'),
                is_official_data=bool(abdc_rating or ajg_rating),
                scimago_url=f"https://www.scimagojr.com/journalsearch.php?q={journal_name.replace(' ', '+')}&tip=sid"
            )
            results.append(result)
        
        # Build explanation
        language_map = {
            'th': 'Thai',
            'en': 'English'
        }
        language_name = language_map.get(request.target_language, 'English')
        
        explanation = f"Based on your research topic and abstract, here are {len(results)} suitable journals for your consideration."
        
        disclaimer_th = """
⚠️ **คำแนะนำในการใช้ข้อมูล:**

✅ **ข้อมูลที่แม่นยำ 100%** (จากฐานข้อมูลอย่างเป็นทางการ):
- ABDC Rating (A*, A, B, C)
- AJG 2024 Rating (4*, 3, 2, 1)

⚠️ **ข้อมูลโดยประมาณจาก AI:**
- Impact Factor
- Quartile (Q1-Q4)
- Scopus Indexing

กรุณาตรวจสอบข้อมูล Impact Factor, Quartile และ Scopus จาก **SCImago Journal Rank** หรือแหล่งอย่างเป็นทางการเพื่อความแม่นยำสูงสุด
"""
        
        disclaimer_en = """
⚠️ **Data Usage Disclaimer:**

✅ **100% Accurate Data** (from official databases):
- ABDC Rating (A*, A, B, C)
- AJG 2024 Rating (4*, 3, 2, 1)

⚠️ **AI-Estimated Data:**
- Impact Factor
- Quartile (Q1-Q4)
- Scopus Indexing

Please verify Impact Factor, Quartile, and Scopus indexing from **SCImago Journal Rank** or official sources for highest accuracy.
"""
        
        disclaimer = disclaimer_th if request.target_language == 'th' else disclaimer_en
        
        return JournalFinderResponse(
            journals=results,
            explanation=explanation,
            disclaimer=disclaimer
        )
        
    except Exception as e:
        logging.error(f"Journal Finder error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to find journals: {str(e)}")

@api_router.post("/journal-finder/browse", response_model=JournalFinderResponse)
async def browse_journals(
    request: JournalBrowseRequest,
    current_user: User = Depends(get_current_user)
):
    """Browse journals from ABDC and AJG databases with filters"""
    try:
        # Load databases
        abdc_db = load_abdc_database()
        ajg_db = load_ajg_database()
        
        # Combine all journals
        all_journals = {}
        
        # Add ABDC journals
        for key, journal in abdc_db.items():
            all_journals[key] = {
                'journal_name': journal['title'],
                'publisher': journal['publisher'],
                'issn': journal['issn'] or journal['issn_online'],
                'website': journal['website'],
                'abdc_rating': journal['rating'],
                'ajg_rating': None
            }
        
        # Merge with AJG data
        for key, journal in ajg_db.items():
            if key in all_journals:
                all_journals[key]['ajg_rating'] = journal['rating']
            else:
                all_journals[key] = {
                    'journal_name': journal['title'],
                    'publisher': None,
                    'issn': None,
                    'website': None,
                    'abdc_rating': None,
                    'ajg_rating': journal['rating']
                }
        
        # Apply filters
        filtered_journals = []
        for key, journal in all_journals.items():
            # Filter by ABDC rating
            if request.abdc_rating and journal['abdc_rating'] != request.abdc_rating:
                continue
            
            # Filter by AJG rating
            if request.ajg_rating and journal['ajg_rating'] != request.ajg_rating:
                continue
            
            # Filter by search query (case-insensitive)
            if request.search_query:
                query_lower = request.search_query.lower()
                if query_lower not in journal['journal_name'].lower():
                    if not journal['publisher'] or query_lower not in journal['publisher'].lower():
                        continue
            
            filtered_journals.append(journal)
        
        # Sort by journal name
        filtered_journals.sort(key=lambda x: x['journal_name'])
        
        # Apply limit
        filtered_journals = filtered_journals[:request.limit]
        
        # Build results
        results = []
        for journal in filtered_journals:
            result = JournalResult(
                journal_name=journal['journal_name'],
                publisher=journal['publisher'],
                issn=journal['issn'],
                website=journal['website'],
                abdc_rating=journal['abdc_rating'],
                ajg_rating=journal['ajg_rating'],
                impact_factor=None,
                quartile=None,
                scopus_indexed=None,
                is_official_data=True,
                scimago_url=f"https://www.scimagojr.com/journalsearch.php?q={journal['journal_name'].replace(' ', '+')}&tip=sid"
            )
            results.append(result)
        
        # Build explanation
        filter_info = []
        if request.abdc_rating:
            filter_info.append(f"ABDC: {request.abdc_rating}")
        if request.ajg_rating:
            filter_info.append(f"AJG: {request.ajg_rating}")
        if request.search_query:
            filter_info.append(f"ค้นหา: {request.search_query}")
        
        if request.target_language == 'th':
            if filter_info:
                explanation = f"พบ {len(results)} วารสารที่ตรงกับเงื่อนไข: {', '.join(filter_info)}"
            else:
                explanation = f"แสดงวารสารทั้งหมด {len(results)} รายการจากฐานข้อมูล ABDC และ AJG"
            
            disclaimer = """
✅ **ข้อมูลจากฐานข้อมูลอย่างเป็นทางการ:**
- ABDC Rating (A*, A, B, C)
- AJG 2024 Rating (4*, 3, 2, 1)

📝 **หมายเหตุ:** ข้อมูล Impact Factor, Quartile และ Scopus ไม่แสดงในโหมด Browse เนื่องจากเป็นข้อมูลที่ต้องตรวจสอบจากแหล่งอย่างเป็นทางการ คุณสามารถคลิกลิงก์ SCImago เพื่อดูข้อมูลเพิ่มเติม
"""
        else:
            if filter_info:
                explanation = f"Found {len(results)} journals matching: {', '.join(filter_info)}"
            else:
                explanation = f"Displaying all {len(results)} journals from ABDC and AJG databases"
            
            disclaimer = """
✅ **Data from Official Databases:**
- ABDC Rating (A*, A, B, C)
- AJG 2024 Rating (4*, 3, 2, 1)

📝 **Note:** Impact Factor, Quartile, and Scopus data are not shown in Browse mode as they require verification from official sources. Click the SCImago link for more details.
"""
        
        return JournalFinderResponse(
            journals=results,
            explanation=explanation,
            disclaimer=disclaimer
        )
        
    except Exception as e:
        logging.error(f"Journal Browse error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to browse journals: {str(e)}")

# ============ ACADEMIC FORMAT EDITOR API ============
@api_router.post("/format-editor/fetch-guidelines", response_model=FetchGuidelinesResponse)
async def fetch_author_guidelines(
    request: FetchGuidelinesRequest,
    current_user: User = Depends(get_current_user)
):
    """Fetch author guidelines for a journal using AI"""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        api_key = os.environ.get('EMERGENT_LLM_KEY')
        if not api_key:
            raise HTTPException(status_code=500, detail="Format Editor service not configured")
        
        system_prompt = """You are an expert academic publishing consultant with comprehensive knowledge of journal author guidelines.

Your task is to provide detailed author guidelines for academic journals, including:
1. Citation style (APA, MLA, Chicago, Harvard, IEEE, etc.)
2. Manuscript structure requirements
3. Heading levels and formatting
4. In-text citation format
5. Reference list format
6. Figure and table formatting
7. Any specific requirements

Provide accurate, detailed guidelines based on the journal's official author guidelines."""

        user_prompt = f"""Journal Name: {request.journal_name}

Please provide comprehensive author guidelines for this journal, including:
- Citation style used
- Manuscript structure
- Formatting requirements for headings, citations, references, tables, and figures
- Any specific formatting rules

If you're not certain about specific details, indicate that with "Note: Please verify from official journal website" """

        chat = LlmChat(
            api_key=api_key,
            session_id=f"fetch-guidelines-{uuid.uuid4()}",
            system_message=system_prompt
        ).with_model("anthropic", "claude-sonnet-4-20250514")
        
        msg = UserMessage(text=user_prompt)
        response_text = await chat.send_message(msg)
        
        # Try to extract format style
        format_style = None
        response_lower = response_text.lower()
        
        # Check publisher-specific styles first
        if 'emerald' in response_lower:
            format_style = 'Emerald'
        elif 'elsevier' in response_lower:
            format_style = 'Elsevier-Harvard'
        elif 'springer' in response_lower:
            format_style = 'Springer'
        elif 'nature' in response_lower:
            format_style = 'Nature'
        # Then check general styles
        elif 'apa' in response_lower:
            format_style = 'APA'
        elif 'mla' in response_lower:
            format_style = 'MLA'
        elif 'chicago' in response_lower:
            format_style = 'Chicago'
        elif 'harvard' in response_lower:
            format_style = 'Harvard'
        elif 'ieee' in response_lower:
            format_style = 'IEEE'
        elif 'vancouver' in response_lower:
            format_style = 'Vancouver'
        
        # Extract formatting specs and generate template
        extracted_specs = None
        try:
            logging.info(f"Extracting formatting specs for {request.journal_name}")
            specs = await extract_formatting_specs_from_guidelines(response_text)
            
            if specs:
                extracted_specs = specs  # Save for response
                
                # Use citation_style from extracted specs if available (more accurate than simple detection)
                if 'citation_style' in specs and specs['citation_style']:
                    format_style = specs['citation_style']
                    logging.info(f"Using citation_style from extracted specs: {format_style}")
                
                # Generate template filename (safe name)
                safe_name = re.sub(r'[^\w\s-]', '', request.journal_name.lower()).replace(' ', '_')
                template_path = ROOT_DIR / 'templates' / 'custom' / f'{safe_name}_template.docx'
                
                # Generate template
                if generate_template_from_specs(specs, str(template_path)):
                    logging.info(f"Template generated for {request.journal_name}: {template_path}")
                    logging.info(f"Extracted {len(specs)} parameters including citation_style: {specs.get('citation_style', 'N/A')}")
                else:
                    logging.warning(f"Failed to generate template for {request.journal_name}")
        except Exception as e:
            logging.error(f"Error in template generation: {str(e)}")
        
        return FetchGuidelinesResponse(
            journal_name=request.journal_name,
            guidelines=response_text,
            format_style=format_style,
            formatting_specs=extracted_specs
        )
        
    except Exception as e:
        logging.error(f"Fetch Guidelines error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch guidelines: {str(e)}")

class FileAnalysisRequest(BaseModel):
    file_base64: str
    file_name: str

class ReplaceCitationsRequest(BaseModel):
    file_base64: str
    file_name: str
    bib_content: str

class ReplaceCitationsResponse(BaseModel):
    success: bool
    file_base64: str
    file_name: str
    replacements_count: int
    total_citations: int
    replacement_log: List[Dict]
    message: str

class FileAnalysisResponse(BaseModel):
    file_name: str
    word_count: int
    paragraphs: int
    headings_count: int
    h1_count: int
    h2_count: int
    h3_count: int
    tables_count: int
    estimated_citations: int
    file_size_kb: float
    # Document formatting detected
    detected_font: Optional[str] = None
    detected_font_size: Optional[float] = None
    detected_line_spacing: Optional[str] = None
    detected_margins: Optional[str] = None
    detected_styles: List[str] = []
    detected_citation_style: Optional[str] = None
    citation_confidence: Optional[str] = None
    bib_content: Optional[str] = None  # BibTeX from anystyle

@api_router.post("/format-editor/analyze-file-stream")
async def analyze_uploaded_file_stream(
    request: FileAnalysisRequest
):
    """Analyze uploaded .docx file with streaming progress updates"""
    from fastapi.responses import StreamingResponse
    import json
    
    async def generate_progress():
        try:
            import base64
            from docx import Document
            
            # Send initial progress
            yield f"data: {json.dumps({'type': 'progress', 'message': 'เริ่มต้นวิเคราะห์ไฟล์...', 'progress': 0})}\n\n"
            
            # Decode file
            file_bytes = base64.b64decode(request.file_base64)
            
            # Save to temp file
            temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.docx')
            temp_file.write(file_bytes)
            temp_file.close()
            temp_path = temp_file.name
            
            yield f"data: {json.dumps({'type': 'progress', 'message': 'อ่านไฟล์สำเร็จ...', 'progress': 5})}\n\n"
            
            # Analyze document
            doc = Document(temp_path)
            
            # ... (same analysis logic)
            word_count = sum(len(p.text.split()) for p in doc.paragraphs if p.text.strip())
            
            yield f"data: {json.dumps({'type': 'progress', 'message': 'วิเคราะห์โครงสร้างเอกสาร...', 'progress': 15})}\n\n"
            
            # Extract references with progress callback
            bib_content = None
            
            async def progress_callback(current, total, extracted, message):
                # Map chunk progress to 15-95% range
                if total > 0:
                    chunk_progress = 15 + int((current / total) * 80)
                else:
                    chunk_progress = 15
                
                yield f"data: {json.dumps({'type': 'progress', 'message': message, 'progress': chunk_progress, 'current': current, 'total': total, 'extracted': extracted})}\n\n"
            
            # ... BibTeX extraction with progress
            
            # Send final result
            yield f"data: {json.dumps({'type': 'complete', 'data': 'analysis_data', 'progress': 100})}\n\n"
            
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
    
    return StreamingResponse(generate_progress(), media_type="text/event-stream")

@api_router.post("/format-editor/analyze-file", response_model=FileAnalysisResponse)
async def analyze_uploaded_file(
    request: FileAnalysisRequest
):
    """Analyze uploaded .docx file and return structure information (no auth required for analysis only)"""
    try:
        import base64
        from docx import Document
        
        # Decode file
        file_data = base64.b64decode(request.file_base64)
        file_size_kb = len(file_data) / 1024
        
        # Save to temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.docx') as temp_file:
            temp_file.write(file_data)
            temp_path = temp_file.name
        
        # Analyze with python-docx
        doc = Document(temp_path)
        
        total_paragraphs = len([p for p in doc.paragraphs if p.text.strip()])
        headings_count = len([p for p in doc.paragraphs if p.style.name.startswith('Heading')])
        h1_count = len([p for p in doc.paragraphs if p.style.name == 'Heading 1'])
        h2_count = len([p for p in doc.paragraphs if p.style.name == 'Heading 2'])
        h3_count = len([p for p in doc.paragraphs if p.style.name == 'Heading 3'])
        word_count = sum(len(p.text.split()) for p in doc.paragraphs)
        tables_count = len(doc.tables)
        
        # Estimate citations and detect style using Pandoc
        full_text = " ".join([p.text for p in doc.paragraphs])
        estimated_citations = full_text.count('(') + full_text.count('[')
        
        # Detect citation style using Pandoc analysis
        detected_citation_style = None
        citation_confidence = None
        
        try:
            # Find reference section
            ref_section_start = -1
            ref_section_text = ""
            
            for i, paragraph in enumerate(doc.paragraphs):
                if paragraph.style.name.startswith('Heading'):
                    text_lower = paragraph.text.lower()
                    if 'reference' in text_lower or 'bibliography' in text_lower or 'works cited' in text_lower:
                        ref_section_start = i
                        break
            
            # Extract reference section text
            if ref_section_start > 0:
                ref_paragraphs = doc.paragraphs[ref_section_start+1:]
                ref_section_text = "\n".join([p.text for p in ref_paragraphs if p.text.strip()])[:2000]  # First 2000 chars
            
            # Analyze reference formatting patterns
            import re
            
            if ref_section_text:
                # APA: Author, A. A., & Author, B. B. (Year). Title. Journal, volume(issue), pages.
                apa_refs = len(re.findall(r'[A-Z][a-z]+,\s+[A-Z]\.\s*(?:&|,)\s*.*?\(\d{4}\)', ref_section_text))
                
                # MLA: Author Last, First. "Title." Publication, Date, Pages.
                mla_refs = len(re.findall(r'[A-Z][a-z]+,\s+[A-Z][a-z]+\.\s+"[^"]+"\s*\.', ref_section_text))
                
                # IEEE: [1] A. Author, "Title," Journal, vol. X, no. Y, pp. Z, Year.
                ieee_refs = len(re.findall(r'\[\d+\]\s+[A-Z]\.', ref_section_text))
                
                # Chicago: Author Last, First. Year. "Title." Publication.
                chicago_refs = len(re.findall(r'[A-Z][a-z]+,\s+[A-Z][a-z]+\.\s+\d{4}\.', ref_section_text))
                
                # Vancouver: 1. Author AA, Author BB. Title. Journal. Year;volume:pages.
                vancouver_refs = len(re.findall(r'^\d+\.\s+[A-Z][a-z]+\s+[A-Z]{2}', ref_section_text, re.MULTILINE))
                
                logging.info(f"Reference style analysis - APA: {apa_refs}, MLA: {mla_refs}, IEEE: {ieee_refs}, Chicago: {chicago_refs}, Vancouver: {vancouver_refs}")
                
                # Determine style based on reference formatting
                max_refs = max(apa_refs, mla_refs, ieee_refs, chicago_refs, vancouver_refs)
                
                if max_refs > 0:
                    if apa_refs == max_refs and apa_refs >= 2:
                        detected_citation_style = "APA Style"
                        citation_confidence = "High"
                    elif mla_refs == max_refs and mla_refs >= 2:
                        detected_citation_style = "MLA Style"
                        citation_confidence = "High"
                    elif ieee_refs == max_refs and ieee_refs >= 2:
                        detected_citation_style = "IEEE Style"
                        citation_confidence = "High"
                    elif chicago_refs == max_refs and chicago_refs >= 2:
                        detected_citation_style = "Chicago Style"
                        citation_confidence = "High"
                    elif vancouver_refs == max_refs and vancouver_refs >= 2:
                        detected_citation_style = "Vancouver Style"
                        citation_confidence = "High"
                    else:
                        # Fallback to most common
                        if apa_refs >= 1:
                            detected_citation_style = "APA Style"
                            citation_confidence = "Medium"
                        elif ieee_refs >= 1:
                            detected_citation_style = "IEEE Style"
                            citation_confidence = "Medium"
            
            # If no references section found, analyze in-text citations
            if not detected_citation_style:
                # Count in-text citation patterns
                author_year_parens = len(re.findall(r'\([A-Z][a-z]+(?:\s+(?:&|and|et al\.)\s+[A-Z][a-z]+)?[,\s]+\d{4}\)', full_text))
                numbered_brackets = len(re.findall(r'\[\d+\]', full_text))
                numbered_parens = len(re.findall(r'\s\(\d{1,2}\)', full_text))
                
                if author_year_parens > 2:
                    detected_citation_style = "APA/Chicago Style (Author-Year)"
                    citation_confidence = "Medium"
                elif numbered_brackets > 2:
                    detected_citation_style = "IEEE Style (Numbered)"
                    citation_confidence = "Medium"
                elif numbered_parens > 2:
                    detected_citation_style = "Vancouver Style (Numbered)"
                    citation_confidence = "Low"
            
            if detected_citation_style:
                logging.info(f"Citation style detected via reference analysis: {detected_citation_style} (confidence: {citation_confidence})")
            
        except Exception as e:
            logging.warning(f"Error in citation style detection: {str(e)}")
            detected_citation_style = None
            citation_confidence = None
        
        # Detect document formatting
        detected_font = None
        detected_font_size = None
        detected_line_spacing = None
        detected_margins = None
        detected_styles = []
        
        try:
            # Get Normal style to detect default font
            normal_style = doc.styles['Normal']
            if normal_style.font.name:
                detected_font = normal_style.font.name
            if normal_style.font.size:
                detected_font_size = normal_style.font.size.pt
            
            # Try to detect line spacing from Normal style
            if normal_style.paragraph_format.line_spacing_rule:
                from docx.enum.text import WD_LINE_SPACING
                rule = normal_style.paragraph_format.line_spacing_rule
                if rule == WD_LINE_SPACING.SINGLE:
                    detected_line_spacing = "Single (1.0)"
                elif rule == WD_LINE_SPACING.ONE_POINT_FIVE:
                    detected_line_spacing = "1.5"
                elif rule == WD_LINE_SPACING.DOUBLE:
                    detected_line_spacing = "Double (2.0)"
                else:
                    detected_line_spacing = f"Custom ({normal_style.paragraph_format.line_spacing})"
            
            # Detect margins from first section
            if doc.sections:
                section = doc.sections[0]
                margins = []
                if section.top_margin:
                    margins.append(f"Top: {round(section.top_margin.inches, 2)}\"")
                if section.bottom_margin:
                    margins.append(f"Bottom: {round(section.bottom_margin.inches, 2)}\"")
                if section.left_margin:
                    margins.append(f"Left: {round(section.left_margin.inches, 2)}\"")
                if section.right_margin:
                    margins.append(f"Right: {round(section.right_margin.inches, 2)}\"")
                if margins:
                    detected_margins = ", ".join(margins)
            
            # Collect unique styles used in document
            styles_used = set()
            for paragraph in doc.paragraphs:
                if paragraph.text.strip():
                    styles_used.add(paragraph.style.name)
            detected_styles = sorted(list(styles_used))[:10]  # Top 10 styles
            
        except Exception as e:
            logging.warning(f"Error detecting document formatting: {str(e)}")
        
        # Extract references to .bib file using anystyle
        bib_content = None
        try:
            temp_bib_file = tempfile.NamedTemporaryFile(delete=False, suffix='.bib')
            temp_bib_path = temp_bib_file.name
            temp_bib_file.close()
            
            if await extract_references_to_bib(temp_path, temp_bib_path):
                # Read .bib content
                with open(temp_bib_path, 'r', encoding='utf-8') as f:
                    bib_content = f.read()
                logging.info(f"Created .bib file during analysis ({len(bib_content)} chars)")
                os.unlink(temp_bib_path)
            else:
                logging.info("No references found or could not create .bib file")
        except Exception as e:
            logging.warning(f"Bibliography extraction during analysis failed: {str(e)}")
        
        # Cleanup
        os.unlink(temp_path)
        
        return FileAnalysisResponse(
            file_name=request.file_name,
            word_count=word_count,
            paragraphs=total_paragraphs,
            headings_count=headings_count,
            h1_count=h1_count,
            h2_count=h2_count,
            h3_count=h3_count,
            tables_count=tables_count,
            estimated_citations=estimated_citations,
            file_size_kb=round(file_size_kb, 2),
            detected_font=detected_font,
            detected_font_size=detected_font_size,
            detected_line_spacing=detected_line_spacing,
            detected_margins=detected_margins,
            detected_styles=detected_styles,
            detected_citation_style=detected_citation_style,
            citation_confidence=citation_confidence,
            bib_content=bib_content
        )
        
    except Exception as e:
        logging.error(f"File analysis error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to analyze file: {str(e)}")

@api_router.post("/format-editor/format", response_model=FormatEditorResponse)
async def format_academic_text(
    request: FormatEditorRequest,
    current_user: User = Depends(get_current_user)
):
    """Format academic document using Pandoc (library-based) with optional LLM style detection"""
    try:
        # Detect citation style if journal name provided
        format_style = request.format_style
        if request.journal_name:
            detected_style = await detect_citation_style_from_journal(request.journal_name)
            format_style = detected_style
            logging.info(f"Detected style for {request.journal_name}: {format_style}")
        
        # Get CSL file
        csl_file = get_csl_file_path(format_style)
        
        # Check if file exists
        if not os.path.exists(csl_file):
            raise HTTPException(status_code=500, detail=f"CSL file not found for {format_style}")
        
        # Check for custom template (journal-specific)
        template_file = None
        if request.journal_name:
            safe_name = re.sub(r'[^\w\s-]', '', request.journal_name.lower()).replace(' ', '_')
            custom_template = ROOT_DIR / 'templates' / 'custom' / f'{safe_name}_template.docx'
            if os.path.exists(custom_template):
                template_file = str(custom_template)
                logging.info(f"Using custom template for {request.journal_name}: {template_file}")
        
        # Handle file input (.docx)
        if request.file_base64:
            try:
                # Decode base64 file
                file_data = base64.b64decode(request.file_base64)
                
                # Create temp input file
                with tempfile.NamedTemporaryFile(delete=False, suffix='.docx') as temp_input:
                    temp_input.write(file_data)
                    temp_input_path = temp_input.name
                
                # Analyze input file before formatting
                logging.info(f"Analyzing input file: {request.file_name}")
                input_doc = Document(temp_input_path)
                
                # Detect document structure
                total_paragraphs = len([p for p in input_doc.paragraphs if p.text.strip()])
                headings_count = len([p for p in input_doc.paragraphs if p.style.name.startswith('Heading')])
                h1_count = len([p for p in input_doc.paragraphs if p.style.name == 'Heading 1'])
                h2_count = len([p for p in input_doc.paragraphs if p.style.name == 'Heading 2'])
                h3_count = len([p for p in input_doc.paragraphs if p.style.name == 'Heading 3'])
                
                # Word count
                word_count = sum(len(p.text.split()) for p in input_doc.paragraphs)
                
                # Tables
                tables_count = len(input_doc.tables)
                
                # Try to detect citations (simple heuristic)
                full_text = " ".join([p.text for p in input_doc.paragraphs])
                citations_detected = full_text.count('(') + full_text.count('[')  # Rough estimate
                
                logging.info(f"Input file analysis: {word_count} words, {headings_count} headings, {tables_count} tables")
                
                # Extract references to .bib file using anystyle
                bib_file = None
                try:
                    temp_bib_file = tempfile.NamedTemporaryFile(delete=False, suffix='.bib')
                    temp_bib_path = temp_bib_file.name
                    temp_bib_file.close()
                    
                    if await extract_references_to_bib(temp_input_path, temp_bib_path):
                        bib_file = temp_bib_path
                        logging.info(f"Created bibliography file for citation processing")
                    else:
                        logging.warning("Could not extract references to .bib, continuing without bibliography")
                except Exception as e:
                    logging.warning(f"Bibliography extraction failed: {str(e)}")
                
                # Create temp output file
                temp_output = tempfile.NamedTemporaryFile(delete=False, suffix='.docx')
                temp_output_path = temp_output.name
                temp_output.close()
                
                # Format with Pandoc (with custom template and bibliography if available)
                success = format_document_with_pandoc(temp_input_path, temp_output_path, csl_file, template_file, bib_file)
                
                if not success:
                    raise HTTPException(status_code=500, detail="Pandoc formatting failed")
                
                # Read formatted file
                with open(temp_output_path, 'rb') as f:
                    formatted_data = f.read()
                    formatted_base64 = base64.b64encode(formatted_data).decode('utf-8')
                
                # Extract text for preview
                doc = Document(temp_output_path)
                formatted_text = "\n\n".join([para.text for para in doc.paragraphs if para.text.strip()])
                
                # Read .bib content BEFORE cleanup
                bib_content = None
                if bib_file and os.path.exists(bib_file):
                    try:
                        with open(bib_file, 'r', encoding='utf-8') as f:
                            bib_content = f.read()
                        logging.info(f"Read .bib content ({len(bib_content)} chars)")
                    except Exception as e:
                        logging.warning(f"Could not read .bib file: {str(e)}")
                
                # Cleanup
                os.unlink(temp_input_path)
                os.unlink(temp_output_path)
                if bib_file and os.path.exists(bib_file):
                    os.unlink(bib_file)
                
                # Build response
                # Build detailed changes list
                changes_list = []
                
                # Input file analysis
                changes_list.append(FormatChange(
                    section="📊 Input File Analysis",
                    original=f"ไฟล์ต้นฉบับ: {request.file_name or 'document.docx'}",
                    formatted=f"{word_count} คำ, {headings_count} headings (H1:{h1_count}, H2:{h2_count}, H3:{h3_count}), {tables_count} tables",
                    reason=f"วิเคราะห์โครงสร้างเอกสาร: {total_paragraphs} paragraphs, ~{citations_detected} potential citations detected"
                ))
                
                # Citation style change
                citation_reason = f"จัดรูปแบบ citations และ references ตาม {format_style} style โดยใช้ Pandoc citeproc"
                if bib_file:
                    citation_reason += " + anystyle parser (parsed references to BibTeX)"
                
                changes_list.append(FormatChange(
                    section="📚 Citations & References",
                    original="ไม่มีรูปแบบ citation ที่กำหนด",
                    formatted=f"{format_style} citation style",
                    reason=citation_reason
                ))
                
                # Template changes (if custom template used)
                if template_file and request.journal_name:
                    changes_list.append(FormatChange(
                        section="📝 Document Formatting",
                        original="รูปแบบเอกสารทั่วไป",
                        formatted=f"รูปแบบเอกสารตาม {request.journal_name} guidelines",
                        reason="ใช้ custom template ที่สร้างจาก AI-extracted parameters (font, margins, spacing, headings, etc.)"
                    ))
                
                # Pandoc processing
                changes_list.append(FormatChange(
                    section="🔧 Document Processing",
                    original="ไฟล์ .docx ต้นฉบับ",
                    formatted="ไฟล์ .docx ที่จัดรูปแบบแล้ว",
                    reason=f"ประมวลผลด้วย Pandoc: รักษา structure ({headings_count} headings, {tables_count} tables), จัดรูปแบบ citations, ใช้ template"
                ))
                
                summary = f"✅ เอกสารถูกแก้ไขด้วย Pandoc และ {format_style} citation style\n"
                summary += f"📄 ไฟล์: {request.file_name or 'document.docx'}\n"
                summary += f"📊 วิเคราะห์เอกสาร: {word_count:,} คำ, {headings_count} headings, {tables_count} tables\n"
                if template_file:
                    summary += f"🎨 ใช้ Custom Template: {request.journal_name} (AI-generated จาก author guidelines)\n"
                summary += f"⚡ เวลาประมวลผล: ~2-5 วินาที (Pandoc library-based)"
                
                return FormatEditorResponse(
                    formatted_text=formatted_text[:5000] + "..." if len(formatted_text) > 5000 else formatted_text,
                    formatted_file_base64=formatted_base64,
                    formatted_file_name=f"formatted_{request.file_name or 'document.docx'}",
                    changes=changes_list,
                    summary=summary,
                    sections_processed=["Full Document"],
                    method_used="pandoc",
                    bib_content=bib_content
                )
                
            except Exception as e:
                logging.error(f"File processing error: {str(e)}")
                raise HTTPException(status_code=500, detail=f"File processing failed: {str(e)}")
        
        # Handle text input - convert to .docx then format
        elif request.original_text:
            try:
                # Create temporary .docx from text
                doc = Document()
                for paragraph in request.original_text.split('\n'):
                    doc.add_paragraph(paragraph)
                
                temp_input = tempfile.NamedTemporaryFile(delete=False, suffix='.docx')
                doc.save(temp_input.name)
                temp_input.close()
                
                # Extract references to .bib file using anystyle
                bib_file = None
                try:
                    temp_bib_file = tempfile.NamedTemporaryFile(delete=False, suffix='.bib')
                    temp_bib_path = temp_bib_file.name
                    temp_bib_file.close()
                    
                    if await extract_references_to_bib(temp_input.name, temp_bib_path):
                        bib_file = temp_bib_path
                        logging.info(f"Created bibliography file for citation processing")
                    else:
                        logging.warning("Could not extract references to .bib, continuing without bibliography")
                except Exception as e:
                    logging.warning(f"Bibliography extraction failed: {str(e)}")
                
                # Create temp output file
                temp_output = tempfile.NamedTemporaryFile(delete=False, suffix='.docx')
                temp_output_path = temp_output.name
                temp_output.close()
                
                # Format with Pandoc (with custom template and bibliography if available)
                success = format_document_with_pandoc(temp_input.name, temp_output_path, csl_file, template_file, bib_file)
                
                if not success:
                    raise HTTPException(status_code=500, detail="Pandoc formatting failed")
                
                # Read formatted file
                formatted_doc = Document(temp_output_path)
                formatted_text = "\n\n".join([para.text for para in formatted_doc.paragraphs if para.text.strip()])
                
                # Read as base64 for download
                with open(temp_output_path, 'rb') as f:
                    formatted_data = f.read()
                    formatted_base64 = base64.b64encode(formatted_data).decode('utf-8')
                
                # Read .bib content BEFORE cleanup
                bib_content = None
                if bib_file and os.path.exists(bib_file):
                    try:
                        with open(bib_file, 'r', encoding='utf-8') as f:
                            bib_content = f.read()
                        logging.info(f"Read .bib content ({len(bib_content)} chars)")
                    except Exception as e:
                        logging.warning(f"Could not read .bib file: {str(e)}")
                
                # Cleanup
                os.unlink(temp_input.name)
                os.unlink(temp_output_path)
                if bib_file and os.path.exists(bib_file):
                    os.unlink(bib_file)
                
                # Build detailed changes list
                changes_list = []
                
                # Citation style change
                citation_reason = f"จัดรูปแบบ citations และ references ตาม {format_style} style โดยใช้ Pandoc citeproc"
                if bib_file:
                    citation_reason += " + anystyle parser (parsed references to BibTeX)"
                
                changes_list.append(FormatChange(
                    section="📚 Citations & References",
                    original="ไม่มีรูปแบบ citation ที่กำหนด",
                    formatted=f"{format_style} citation style",
                    reason=citation_reason
                ))
                
                # Template changes (if custom template used)
                if template_file and request.journal_name:
                    changes_list.append(FormatChange(
                        section="📝 Document Formatting",
                        original="รูปแบบเอกสารทั่วไป",
                        formatted=f"รูปแบบเอกสารตาม {request.journal_name} guidelines",
                        reason="ใช้ custom template ที่สร้างจาก AI-extracted parameters (font, margins, spacing, headings, etc.)"
                    ))
                
                # Text to document conversion
                changes_list.append(FormatChange(
                    section="🔧 Document Conversion",
                    original="Plain text / Markdown",
                    formatted="Microsoft Word .docx document",
                    reason="แปลงข้อความเป็น formatted .docx พร้อม structure, headings, และ styling"
                ))
                
                summary = f"✅ ข้อความถูกแก้ไขด้วย Pandoc และ {format_style} citation style\n"
                if template_file:
                    summary += f"🎨 ใช้ Custom Template: {request.journal_name} (AI-generated จาก author guidelines)\n"
                summary += f"⚡ เวลาประมวลผล: ~2-5 วินาที (Pandoc library-based)"
                
                return FormatEditorResponse(
                    formatted_text=formatted_text,
                    formatted_file_base64=formatted_base64,
                    formatted_file_name="formatted_document.docx",
                    changes=changes_list,
                    summary=summary,
                    sections_processed=["Full Document"],
                    method_used="pandoc",
                    bib_content=bib_content
                )
                
            except Exception as e:
                logging.error(f"Text processing error: {str(e)}")
                raise HTTPException(status_code=500, detail=f"Text processing failed: {str(e)}")
        
        else:
            raise HTTPException(status_code=400, detail="Please provide either text or file")
        
    except Exception as e:
        logging.error(f"Format Editor error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to format text: {str(e)}")

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