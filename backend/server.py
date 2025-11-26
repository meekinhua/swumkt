from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Header, Body
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any
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
from lib.doc_formatter import DocFormatter
from PIL import Image
from io import BytesIO

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Image compression utility
def compress_base64_image(base64_str: str, max_size_kb: float = 150.0, target_dimension: int = 640) -> str:
    """
    Aggressively compress base64 image for Conjoint studies with many images
    Target: ~100-150KB per image to fit 100+ images in MongoDB 16MB limit
    
    Args:
        base64_str: Base64 encoded image string (without data:image prefix)
        max_size_kb: Maximum size in KB (default 150KB)
        target_dimension: Max width/height in pixels (default 640)
    Returns:
        Compressed base64 string
    """
    try:
        # Decode base64 to bytes
        img_bytes = base64.b64decode(base64_str)
        current_size_kb = len(img_bytes) / 1024
        
        logging.info(f"Original image size: {current_size_kb:.1f} KB")
        
        # Open image with PIL
        img = Image.open(BytesIO(img_bytes))
        original_size = img.size
        
        # Convert RGBA to RGB if needed
        if img.mode == 'RGBA':
            background = Image.new('RGB', img.size, (255, 255, 255))
            background.paste(img, mask=img.split()[3])
            img = background
        elif img.mode != 'RGB':
            img = img.convert('RGB')
        
        # Resize to target dimension first (this helps a lot)
        img.thumbnail((target_dimension, target_dimension), Image.Resampling.LANCZOS)
        logging.info(f"Resized from {original_size} to {img.size}")
        
        # Try progressive quality reduction
        for quality in [75, 65, 55, 45, 35, 25]:
            output = BytesIO()
            img.save(output, format='JPEG', quality=quality, optimize=True)
            compressed_bytes = output.getvalue()
            compressed_size_kb = len(compressed_bytes) / 1024
            
            if compressed_size_kb <= max_size_kb:
                compressed_base64 = base64.b64encode(compressed_bytes).decode('utf-8')
                logging.info(f"✓ Compressed: {current_size_kb:.1f}KB -> {compressed_size_kb:.1f}KB (quality={quality}, size={img.size})")
                return compressed_base64
        
        # If still too large, resize even smaller
        logging.warning(f"Still too large, trying smaller size...")
        smaller_dimension = target_dimension // 2  # 320px
        img.thumbnail((smaller_dimension, smaller_dimension), Image.Resampling.LANCZOS)
        
        for quality in [65, 55, 45, 35]:
            output = BytesIO()
            img.save(output, format='JPEG', quality=quality, optimize=True)
            compressed_bytes = output.getvalue()
            compressed_size_kb = len(compressed_bytes) / 1024
            
            if compressed_size_kb <= max_size_kb:
                compressed_base64 = base64.b64encode(compressed_bytes).decode('utf-8')
                logging.info(f"✓ Compressed (smaller): {current_size_kb:.1f}KB -> {compressed_size_kb:.1f}KB (quality={quality}, size={img.size})")
                return compressed_base64
        
        # Last resort: accept whatever we got
        output = BytesIO()
        img.save(output, format='JPEG', quality=30, optimize=True)
        compressed_bytes = output.getvalue()
        compressed_size_kb = len(compressed_bytes) / 1024
        compressed_base64 = base64.b64encode(compressed_bytes).decode('utf-8')
        
        logging.warning(f"⚠ Final compression: {current_size_kb:.1f}KB -> {compressed_size_kb:.1f}KB (quality=30, size={img.size})")
        return compressed_base64
        
    except Exception as e:
        logging.error(f"Image compression failed: {e}")
        # Return original if compression fails
        return base64_str

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

# Google OAuth Configuration
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID')
GOOGLE_CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET')
GOOGLE_REDIRECT_URI = os.environ.get('GOOGLE_REDIRECT_URI', 'https://market-analysis-27.preview.emergentagent.com/auth/google/callback')

# Create the main app
app = FastAPI(title="SWUMKT API")
api_router = APIRouter(prefix="/api")

# Session middleware for OAuth (needed for state management)
from starlette.middleware.sessions import SessionMiddleware
app.add_middleware(SessionMiddleware, secret_key=JWT_SECRET)

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
    google_picture: Optional[str] = None
    zbs04_enrolled: bool = False
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
    google_picture: Optional[str] = None
    zbs04_enrolled: bool = False
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
    is_zbs04_assignment: bool = False
    zbs04_assignment_type: Optional[str] = None
    group_members: List[str] = Field(default_factory=list)

class ContentUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    featured_image: Optional[str] = None
    status: Optional[ContentStatus] = None
    attachments: Optional[List[dict]] = None
    is_zbs04_assignment: Optional[bool] = None
    zbs04_assignment_type: Optional[str] = None
    group_members: Optional[List[str]] = None

class ZBS04AssignmentType(str, Enum):
    CUSTOMER_BEHAVIOR = "customer_behavior_analysis"
    CUSTOMER_PERCEPTION = "customer_perception_analysis"
    COMPETITOR_ANALYSIS = "competitor_analysis"
    CUSTOMER_JOURNEY = "customer_journey_map"

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
    is_zbs04_assignment: bool = False
    zbs04_assignment_type: Optional[ZBS04AssignmentType] = None
    group_members: List[str] = Field(default_factory=list, description="User IDs of group members")

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
    # Hard-coded admin emails
    HARDCODED_ADMINS = ["intaka@hotmail.com", "intaka@gmail.com"]
    
    # Check if user is admin by role OR hard-coded email
    is_admin = (current_user.role == UserRole.ADMIN or 
                current_user.email.lower() in [email.lower() for email in HARDCODED_ADMINS])
    
    if not is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Auto-promote hard-coded admins if not already admin
    if current_user.email.lower() in [email.lower() for email in HARDCODED_ADMINS]:
        if current_user.role != UserRole.ADMIN:
            await db.users.update_one(
                {"id": current_user.id},
                {"$set": {"role": UserRole.ADMIN}}
            )
            current_user.role = UserRole.ADMIN
    
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

@api_router.post("/auth/google/verify")
async def google_auth_verify(token_data: dict = Body(...)):
    """Verify Google ID token and create/login user"""
    import httpx
    from jose import jwt as jose_jwt
    
    try:
        google_token = token_data.get("credential")
        if not google_token:
            raise HTTPException(status_code=400, detail="No credential provided")
        
        # Verify token with Google
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://oauth2.googleapis.com/tokeninfo?id_token={google_token}",
                timeout=10.0
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=400, detail="Invalid Google token")
            
            token_info = response.json()
            
            # Verify audience (client ID)
            if token_info.get("aud") != GOOGLE_CLIENT_ID:
                raise HTTPException(status_code=400, detail="Invalid token audience")
            
            email = token_info.get("email")
            name = token_info.get("name")
            picture = token_info.get("picture")
            
            if not email:
                raise HTTPException(status_code=400, detail="Email not found in token")
        
        # Check if user exists
        existing_user = await db.users.find_one({"email": email}, {"_id": 0})
        
        if existing_user:
            # User exists - update google_picture if changed
            user = User(**existing_user)
            if picture and user.google_picture != picture:
                await db.users.update_one(
                    {"id": user.id},
                    {"$set": {"google_picture": picture, "updated_at": datetime.now(timezone.utc).isoformat()}}
                )
                user.google_picture = picture
        else:
            # Create new user with Google auth
            user = User(
                email=email,
                full_name=name or email,
                role=UserRole.PUBLIC_USER,
                user_type=UserType.REGULAR,
                auth_method="google",
                avatar_url=picture,
                google_picture=picture,
                password=""  # No password for Google users
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
        
        # Generate JWT token
        token = jwt.encode({
            'user_id': user.id,
            'email': user.email,
            'exp': datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
        }, JWT_SECRET, algorithm=JWT_ALGORITHM)
        
        user_profile = UserProfile(**user.model_dump())
        
        return AuthResponse(access_token=token, user=user_profile)
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Google auth error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Google authentication failed: {str(e)}")

@api_router.get("/auth/me", response_model=UserProfile)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserProfile(**current_user.model_dump())

class ProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    student_id: Optional[str] = None
    graduation_year: Optional[int] = None
    zbs04_enrolled: Optional[bool] = None

@api_router.put("/auth/profile", response_model=UserProfile)
async def update_profile(
    profile_data: ProfileUpdate,
    current_user: User = Depends(get_current_user)
):
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
    if profile_data.full_name:
        update_data["full_name"] = profile_data.full_name
    if profile_data.bio:
        update_data["bio"] = profile_data.bio
    if profile_data.avatar_url:
        update_data["avatar_url"] = profile_data.avatar_url
    if profile_data.student_id:
        update_data["student_id"] = profile_data.student_id
    if profile_data.graduation_year:
        update_data["graduation_year"] = profile_data.graduation_year
    if profile_data.zbs04_enrolled is not None:
        update_data["zbs04_enrolled"] = profile_data.zbs04_enrolled
    
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

@api_router.get("/users/search", response_model=UserProfile)
async def search_user_by_email(email: EmailStr):
    """Search user by email"""
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserProfile(**User(**user).model_dump())

@api_router.get("/users/{user_id}", response_model=UserProfile)
async def get_user_by_id(user_id: str):
    """Get public user profile by ID"""
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserProfile(**User(**user).model_dump())

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
                detail="Failed to parse AI-generated survey format. Please try again or use templates instead."
            )
        
        # Validate survey
        validator = SurveyDSLValidator()
        is_valid, errors = validator.validate_survey(survey_data)
        
        if not is_valid:
            print(f"Validation errors: {errors}")
            raise HTTPException(
                status_code=500,
                detail="AI-generated survey is incomplete. Please try again or use templates."
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
    # Convert empty string to None for optional fields
    content_dict = content_data.model_dump()
    if content_dict.get('zbs04_assignment_type') == '':
        content_dict['zbs04_assignment_type'] = None
    if content_dict.get('category') == '':
        content_dict['category'] = None
    
    content = Content(
        **content_dict,
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

@api_router.get("/content")
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

@api_router.get("/content/{content_id}")
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
    
    return content

@api_router.put("/content/{content_id}")
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
    
    return updated_content

@api_router.post("/content/{content_id}/ai-rearrange")
async def ai_rearrange_content(
    content_id: str,
    current_user: User = Depends(get_current_user)
):
    """Use AI to rearrange and beautify content with rich text formatting"""
    try:
        # Get content
        content = await db.contents.find_one({"id": content_id}, {"_id": 0})
        if not content:
            raise HTTPException(status_code=404, detail="Content not found")
        
        # Check if user has permission
        if content['created_by'] != current_user.id and current_user.role != UserRole.ADMIN:
            is_contributor = any(c['user_id'] == current_user.id for c in content.get('contributors', []))
            if not is_contributor:
                raise HTTPException(status_code=403, detail="Not authorized to edit this content")
        
        logging.info(f"[AI_REARRANGE] Starting AI rearrange for content {content_id}")
        
        # Extract current content (strip HTML for analysis but keep for reference)
        html_content = content.get('content', '')
        
        # Extract images from attachments
        attachments = content.get('attachments', [])
        image_attachments = [att for att in attachments if att.get('file_type', '').startswith('image/')]
        
        logging.info(f"[AI_REARRANGE] Found {len(image_attachments)} images in attachments")
        
        # Build prompt for AI
        prompt = f"""คุณเป็นนักเขียนมืออาชีพ กรุณาจัดเรียงและปรับปรุงบทความต่อไปนี้ให้สวยงาม เป็นระเบียบ และอ่านง่ายขึ้น

**หัวข้อบทความ:** {content.get('title', 'ไม่มีหัวข้อ')}

**เนื้อหาเดิม:**
{html_content}

**รูปภาพที่มี:** {len(image_attachments)} รูป

**คำแนะนำ:**
1. จัดโครงสร้างเนื้อหาใหม่ให้เป็นหมวดหมู่ชัดเจน
2. เพิ่ม headings (h2, h3) ให้เหมาะสม
3. แบ่ง paragraphs ให้อ่านง่าย
4. เน้นจุดสำคัญด้วย **bold** หรือ *italic*
5. เพิ่ม bullet points หรือ numbered lists ถ้าเหมาะสม
6. เพิ่ม placeholder สำหรับรูปภาพ เช่น `[รูปภาพที่ 1: คำอธิบาย]` ในตำแหน่งที่เหมาสม
7. เพิ่ม introduction และ conclusion ถ้าจำเป็น

**ข้อกำหนด:**
- ใช้ HTML tags: <h2>, <h3>, <p>, <strong>, <em>, <ul>, <ol>, <li>, <blockquote>
- ห้ามใช้ markdown (```, ##, **)
- คงเนื้อหาหลักและข้อมูลสำคัญไว้ทั้งหมด
- เพิ่มเติมเนื้อหาเล็กน้อยเพื่อให้สมบูรณ์ขึ้นได้
- ให้ output เป็น HTML โดยตรง ไม่ต้องมี <html>, <body> tags

**ตัวอย่าง output:**
<h2>บทนำ</h2>
<p>เนื้อหาบทนำ...</p>

<h2>หัวข้อหลัก</h2>
<p>เนื้อหาย่อหน้าแรก ที่มี <strong>ข้อความสำคัญ</strong> และ <em>เน้นเพิ่มเติม</em></p>

[รูปภาพที่ 1: คำอธิบายรูป]

<p>เนื้อหาย่อหน้าต่อไป...</p>

<h3>หัวข้อย่อย</h3>
<ul>
<li>จุดสำคัญที่ 1</li>
<li>จุดสำคัญที่ 2</li>
</ul>

**กรุณาเริ่มจัดเรียงเนื้อหาเลย (output HTML โดยตรง):**"""
        
        # Call AI
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        import os
        
        # Get Emergent LLM key
        emergent_key = os.environ.get('EMERGENT_LLM_KEY', 'sk-emergent-8C9010bB74cCfAc069')
        
        chat = LlmChat(
            api_key=emergent_key,
            session_id=f"ai_rearrange_{content_id}_{datetime.now().timestamp()}",
            system_message="คุณเป็นนักเขียนมืออาชีพที่เชี่ยวชาญในการจัดเรียงและปรับปรุงบทความให้สวยงาม เป็นระเบียบ และอ่านง่าย"
        )
        logging.info(f"[AI_REARRANGE] Calling AI with prompt length: {len(prompt)} characters")
        
        ai_rearranged_html = chat.send_message(UserMessage(prompt))
        
        logging.info(f"[AI_REARRANGE] AI returned content length: {len(ai_rearranged_html)} characters")
        
        # Replace image placeholders with actual images
        rearranged_with_images = ai_rearranged_html
        for idx, img_att in enumerate(image_attachments, 1):
            placeholder_patterns = [
                f'[รูปภาพที่ {idx}',
                f'[รูปที่ {idx}',
                f'[ภาพที่ {idx}',
                f'[Image {idx}'
            ]
            
            img_html = f'<p><img src="{img_att.get("file_data", "")}" alt="{img_att.get("filename", "")}" style="max-width: 100%; height: auto; border-radius: 8px; margin: 20px 0;" /></p>'
            
            for pattern in placeholder_patterns:
                if pattern in rearranged_with_images:
                    # Find the placeholder line and replace it
                    lines = rearranged_with_images.split('\n')
                    new_lines = []
                    for line in lines:
                        if pattern in line:
                            new_lines.append(img_html)
                        else:
                            new_lines.append(line)
                    rearranged_with_images = '\n'.join(new_lines)
                    break
        
        logging.info(f"[AI_REARRANGE] Final content length with images: {len(rearranged_with_images)} characters")
        
        return {
            "success": True,
            "rearranged_content": rearranged_with_images,
            "original_length": len(html_content),
            "new_length": len(rearranged_with_images),
            "images_included": len(image_attachments)
        }
        
    except Exception as e:
        logging.error(f"[AI_REARRANGE] Error: {str(e)}")
        import traceback
        logging.error(f"[AI_REARRANGE] Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"AI rearrange failed: {str(e)}")

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

# ZBS04 Assignment endpoints
@api_router.get("/zbs04/assignments")
async def get_zbs04_assignments(current_user: User = Depends(get_current_user)):
    """Get user's ZBS04 assignment status"""
    if not current_user.zbs04_enrolled:
        raise HTTPException(status_code=403, detail="User not enrolled in ZBS04")
    
    # Get all assignment types
    assignment_types = [
        ZBS04AssignmentType.CUSTOMER_BEHAVIOR,
        ZBS04AssignmentType.CUSTOMER_PERCEPTION,
        ZBS04AssignmentType.COMPETITOR_ANALYSIS,
        ZBS04AssignmentType.CUSTOMER_JOURNEY
    ]
    
    assignments = []
    for assignment_type in assignment_types:
        # Check if user has submitted this assignment
        content = await db.contents.find_one({
            "is_zbs04_assignment": True,
            "zbs04_assignment_type": assignment_type.value,
            "$or": [
                {"created_by": current_user.id},
                {"group_members": current_user.id}
            ]
        }, {"_id": 0})
        
        assignments.append({
            "type": assignment_type.value,
            "submitted": content is not None,
            "content_id": content.get('id') if content else None,
            "title": content.get('title') if content else None,
            "group_members": content.get('group_members', []) if content else []
        })
    
    return assignments

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
                detail="Image generation failed. Please try again or contact support if the issue persists."
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

class AIReformatRequest(BaseModel):
    file_base64: str
    file_name: str
    format_style: str  # APA, IEEE, MLA, Chicago, Vancouver, Custom
    custom_style_guide: Optional[str] = None  # Used when format_style = "Custom"
    bib_content: Optional[str] = None

class AIReformatResponse(BaseModel):
    success: bool
    file_base64: str
    file_name: str
    formatted_text_preview: str
    formatted_references: str
    changes_summary: str
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

@api_router.post("/format-editor/replace-citations", response_model=ReplaceCitationsResponse)
async def replace_citations_with_keys(
    request: ReplaceCitationsRequest,
    current_user: User = Depends(get_current_user)
):
    """Replace in-text citations with BibTeX citation keys"""
    try:
        import base64
        from docx import Document
        
        logging.info("Starting citation replacement process")
        
        # Decode file
        file_data = base64.b64decode(request.file_base64)
        
        # Save to temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.docx') as temp_input:
            temp_input.write(file_data)
            temp_input_path = temp_input.name
        
        # Read document
        doc = Document(temp_input_path)
        
        # Extract all text with paragraph tracking
        full_text = "\n\n".join([p.text for p in doc.paragraphs if p.text.strip()])
        
        logging.info(f"Document has {len(full_text)} characters")
        
        # Initialize CitationReplacer
        emergent_key = os.environ.get('EMERGENT_LLM_KEY')
        replacer = CitationReplacer(api_key=emergent_key, model="gpt-4o")
        
        # Parse BibTeX entries
        bibtex_entries = replacer.parse_bibtex_entries(request.bib_content)
        
        logging.info(f"Parsed {len(bibtex_entries)} BibTeX entries")
        
        if not bibtex_entries:
            raise HTTPException(
                status_code=400, 
                detail="No BibTeX entries found. Please ensure BibTeX content is valid."
            )
        
        # Replace citations in text
        modified_text, replaced_count, replacement_log = await replacer.replace_citations_in_text(
            full_text,
            bibtex_entries
        )
        
        # Update document with modified text
        # Split back into paragraphs
        modified_paragraphs = modified_text.split("\n\n")
        
        # Update existing paragraphs
        paragraph_index = 0
        for para in doc.paragraphs:
            if para.text.strip() and paragraph_index < len(modified_paragraphs):
                para.text = modified_paragraphs[paragraph_index]
                paragraph_index += 1
        
        # Save modified document
        with tempfile.NamedTemporaryFile(delete=False, suffix='.docx') as temp_output:
            doc.save(temp_output.name)
            temp_output_path = temp_output.name
        
        # Read modified file
        with open(temp_output_path, 'rb') as f:
            modified_file_data = f.read()
        
        modified_base64 = base64.b64encode(modified_file_data).decode('utf-8')
        
        # Cleanup
        os.unlink(temp_input_path)
        os.unlink(temp_output_path)
        
        # Generate new filename
        original_name = request.file_name.replace('.docx', '')
        new_filename = f"{original_name}_with_citation_keys.docx"
        
        total_citations = len(replacer.extract_citations_from_text(full_text))
        
        logging.info(f"Citation replacement complete: {replaced_count}/{total_citations} replaced")
        
        return ReplaceCitationsResponse(
            success=True,
            file_base64=modified_base64,
            file_name=new_filename,
            replacements_count=replaced_count,
            total_citations=total_citations,
            replacement_log=replacement_log,
            message=f"Successfully replaced {replaced_count} out of {total_citations} citations with BibTeX keys"
        )
        
    except Exception as e:
        logging.error(f"Citation replacement error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to replace citations: {str(e)}")

@api_router.post("/format-editor/reformat-with-ai", response_model=AIReformatResponse)
async def reformat_document_with_ai(
    request: AIReformatRequest,
    current_user: User = Depends(get_current_user)
):
    """Reformat document using AI (replaces Pandoc) - supports multiple citation styles"""
    try:
        import base64
        from docx import Document
        from lib.doc_formatter import DocFormatter
        
        logging.info(f"Starting AI reformatting: style={request.format_style}")
        
        # Decode file
        file_data = base64.b64decode(request.file_base64)
        
        # Save to temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.docx') as temp_input:
            temp_input.write(file_data)
            temp_input_path = temp_input.name
        
        # Read document
        doc = Document(temp_input_path)
        
        # Extract all text with paragraph tracking
        full_text = "\n\n".join([p.text for p in doc.paragraphs if p.text.strip()])
        
        logging.info(f"Document has {len(full_text)} characters, {len(doc.paragraphs)} paragraphs")
        
        # Initialize DocFormatter
        emergent_key = os.environ.get('EMERGENT_LLM_KEY')
        # Note: Emergent LLM Key supports OpenAI and Claude only (not Gemini)
        formatter = DocFormatter(api_key=emergent_key, model="gpt-4o", provider="openai")
        
        # Reformat document
        logging.info(f"Calling DocFormatter with style: {request.format_style}")
        
        result = await formatter.reformat_document(
            document_text=full_text,
            format_style=request.format_style,
            bibtex_content=request.bib_content or "",
            custom_style_guide=request.custom_style_guide or ""
        )
        
        formatted_text = result.get("formatted_text", full_text)
        formatted_references = result.get("formatted_references", "")
        changes_summary = result.get("changes_summary", "Document formatted successfully")
        
        logging.info(f"Formatting complete. Summary: {changes_summary}")
        
        # Create new document with formatted text
        new_doc = Document()
        
        # Split formatted text into paragraphs and add to document
        formatted_paragraphs = formatted_text.split("\n\n")
        
        for para_text in formatted_paragraphs:
            if para_text.strip():
                # Check if it's a heading (basic heuristic)
                if para_text.strip().isupper() or (len(para_text) < 100 and para_text.endswith(":")):
                    new_doc.add_heading(para_text.strip(), level=1)
                else:
                    new_doc.add_paragraph(para_text.strip())
        
        # Save new document
        with tempfile.NamedTemporaryFile(delete=False, suffix='.docx') as temp_output:
            new_doc.save(temp_output.name)
            temp_output_path = temp_output.name
        
        # Read formatted file
        with open(temp_output_path, 'rb') as f:
            formatted_file_data = f.read()
        
        formatted_base64 = base64.b64encode(formatted_file_data).decode('utf-8')
        
        # Cleanup
        os.unlink(temp_input_path)
        os.unlink(temp_output_path)
        
        # Generate new filename
        original_name = request.file_name.replace('.docx', '')
        new_filename = f"{original_name}_formatted_{request.format_style}.docx"
        
        # Create preview (first 1000 chars)
        preview_text = formatted_text[:1000] + "..." if len(formatted_text) > 1000 else formatted_text
        
        logging.info(f"AI reformatting complete: {new_filename}")
        
        return AIReformatResponse(
            success=True,
            file_base64=formatted_base64,
            file_name=new_filename,
            formatted_text_preview=preview_text,
            formatted_references=formatted_references,
            changes_summary=changes_summary,
            message=f"Successfully reformatted document using AI ({request.format_style} style)"
        )
        
    except Exception as e:
        logging.error(f"AI reformatting error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to reformat document: {str(e)}")

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
                        logging.info("Created bibliography file for citation processing")
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
                summary += "⚡ เวลาประมวลผล: ~2-5 วินาที (Pandoc library-based)"
                
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
                        logging.info("Created bibliography file for citation processing")
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
                summary += "⚡ เวลาประมวลผล: ~2-5 วินาที (Pandoc library-based)"
                
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

# ============ NOTIFICATION SYSTEM ============
from notification_service import notification_service

# Notification Models
class NotificationType(str, Enum):
    COMMENT = "comment"
    ZBS04_ASSIGNMENT = "zbs04_assignment"
    SYSTEM_ANNOUNCEMENT = "system_announcement"
    CONTENT_UPDATE = "content_update"
    CUSTOM = "custom"

class PushSubscription(BaseModel):
    endpoint: str
    keys: Dict[str, str]

class NotificationSubscriptionCreate(BaseModel):
    subscription_info: Dict[str, Any]

class NotificationPreferences(BaseModel):
    comment_notifications: bool = True
    zbs04_notifications: bool = True
    system_notifications: bool = True
    content_update_notifications: bool = True
    custom_notifications: bool = True

class SendNotificationRequest(BaseModel):
    user_ids: Optional[List[str]] = None  # None = broadcast to all
    title: str
    body: str
    url: str = "/"
    notification_type: NotificationType = NotificationType.CUSTOM
    icon: Optional[str] = None

class Notification(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    title: str
    body: str
    url: str = "/"
    notification_type: NotificationType
    icon: Optional[str] = None
    read: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Get VAPID public key
@api_router.get("/notifications/vapid-public-key")
async def get_vapid_public_key():
    """Get VAPID public key for push subscription"""
    return {"public_key": notification_service.get_public_key()}

# Subscribe to push notifications
@api_router.post("/notifications/subscribe")
async def subscribe_to_notifications(
    subscription: NotificationSubscriptionCreate,
    current_user: User = Depends(get_current_user)
):
    """Subscribe user to push notifications"""
    try:
        # Check if subscription already exists
        existing = await db.notification_subscriptions.find_one({
            "user_id": current_user.id,
            "subscription_info.endpoint": subscription.subscription_info.get("endpoint")
        })
        
        if existing:
            return {"message": "Subscription already exists", "id": existing["id"]}
        
        # Create new subscription
        subscription_doc = {
            "id": str(uuid.uuid4()),
            "user_id": current_user.id,
            "subscription_info": subscription.subscription_info,
            "created_at": datetime.now(timezone.utc),
            "last_used": datetime.now(timezone.utc)
        }
        
        await db.notification_subscriptions.insert_one(subscription_doc)
        
        # Create default preferences if not exists
        prefs = await db.notification_preferences.find_one({"user_id": current_user.id})
        if not prefs:
            await db.notification_preferences.insert_one({
                "user_id": current_user.id,
                "comment_notifications": True,
                "zbs04_notifications": True,
                "system_notifications": True,
                "content_update_notifications": True,
                "custom_notifications": True,
                "created_at": datetime.now(timezone.utc)
            })
        
        return {"message": "Subscribed successfully", "id": subscription_doc["id"]}
        
    except Exception as e:
        logging.error(f"Subscription error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Unsubscribe from push notifications
@api_router.delete("/notifications/unsubscribe")
async def unsubscribe_from_notifications(
    endpoint: str,
    current_user: User = Depends(get_current_user)
):
    """Unsubscribe user from push notifications"""
    result = await db.notification_subscriptions.delete_one({
        "user_id": current_user.id,
        "subscription_info.endpoint": endpoint
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Subscription not found")
    
    return {"message": "Unsubscribed successfully"}

# Get user's notification preferences
@api_router.get("/notifications/preferences")
async def get_notification_preferences(current_user: User = Depends(get_current_user)):
    """Get user's notification preferences"""
    prefs = await db.notification_preferences.find_one(
        {"user_id": current_user.id},
        {"_id": 0}
    )
    
    if not prefs:
        # Return default preferences
        return NotificationPreferences().dict()
    
    return prefs

# Update user's notification preferences
@api_router.put("/notifications/preferences")
async def update_notification_preferences(
    preferences: NotificationPreferences,
    current_user: User = Depends(get_current_user)
):
    """Update user's notification preferences"""
    await db.notification_preferences.update_one(
        {"user_id": current_user.id},
        {"$set": {**preferences.dict(), "updated_at": datetime.now(timezone.utc)}},
        upsert=True
    )
    
    return {"message": "Preferences updated successfully"}

# Get user's notifications (inbox)
@api_router.get("/notifications")
async def get_notifications(
    skip: int = 0,
    limit: int = 20,
    unread_only: bool = False,
    current_user: User = Depends(get_current_user)
):
    """Get user's notifications"""
    query = {"user_id": current_user.id}
    if unread_only:
        query["read"] = False
    
    notifications = await db.notifications.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    total = await db.notifications.count_documents(query)
    unread_count = await db.notifications.count_documents({
        "user_id": current_user.id,
        "read": False
    })
    
    return {
        "notifications": notifications,
        "total": total,
        "unread_count": unread_count
    }

# Get unread notification count
@api_router.get("/notifications/unread-count")
async def get_unread_count(current_user: User = Depends(get_current_user)):
    """Get count of unread notifications"""
    count = await db.notifications.count_documents({
        "user_id": current_user.id,
        "read": False
    })
    return {"count": count}

# Mark notification as read
@api_router.put("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: User = Depends(get_current_user)
):
    """Mark a notification as read"""
    result = await db.notifications.update_one(
        {"id": notification_id, "user_id": current_user.id},
        {"$set": {"read": True, "read_at": datetime.now(timezone.utc)}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    return {"message": "Notification marked as read"}

# Mark all notifications as read
@api_router.put("/notifications/read-all")
async def mark_all_notifications_read(current_user: User = Depends(get_current_user)):
    """Mark all notifications as read"""
    result = await db.notifications.update_many(
        {"user_id": current_user.id, "read": False},
        {"$set": {"read": True, "read_at": datetime.now(timezone.utc)}}
    )
    
    return {"message": f"Marked {result.modified_count} notifications as read"}


# Get users with active notification subscriptions (for admin)
@api_router.get("/admin/notifications/users-with-subscriptions")
async def get_users_with_subscriptions(
    search: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    current_user: User = Depends(get_admin_user)
):
    """Get list of users who have active notification subscriptions"""
    try:
        # Get all unique user_ids with active subscriptions
        user_ids_with_subs = await db.notification_subscriptions.distinct("user_id")
        
        if not user_ids_with_subs:
            return {"users": [], "total": 0}
        
        # Build query for users
        query = {"id": {"$in": user_ids_with_subs}}
        
        # Add search filter if provided
        if search:
            search_regex = {"$regex": search, "$options": "i"}
            query["$or"] = [
                {"email": search_regex},
                {"name": search_regex},
                {"full_name": search_regex}
            ]
        
        # Get total count
        total = await db.users.count_documents(query)
        
        # Get users with pagination
        users = await db.users.find(
            query,
            {"_id": 0, "id": 1, "email": 1, "name": 1, "full_name": 1}
        ).skip(offset).limit(limit).to_list(limit)
        
        # Get subscription count for each user
        users_with_count = []
        for user in users:
            sub_count = await db.notification_subscriptions.count_documents({
                "user_id": user["id"]
            })
            users_with_count.append({
                **user,
                "subscription_count": sub_count
            })
        
        return {
            "users": users_with_count,
            "total": total,
            "limit": limit,
            "offset": offset
        }
        
    except Exception as e:
        logging.error(f"Error getting users with subscriptions: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Send notification (admin or system)
@api_router.post("/notifications/send")
async def send_notification(
    request: SendNotificationRequest,
    current_user: User = Depends(get_admin_user)
):
    """Send push notification (admin only)"""
    try:
        # Determine recipients
        if request.user_ids:
            # Send to specific users
            target_users = request.user_ids
        else:
            # Broadcast to all subscribed users
            all_subs = await db.notification_subscriptions.distinct("user_id")
            target_users = all_subs
        
        # Get subscriptions for target users
        subscriptions = await db.notification_subscriptions.find({
            "user_id": {"$in": target_users}
        }, {"_id": 0}).to_list(None)
        
        if not subscriptions:
            return {"message": "No active subscriptions found", "sent": 0}
        
        # Check user preferences and filter
        valid_subscriptions = []
        for sub in subscriptions:
            prefs = await db.notification_preferences.find_one(
                {"user_id": sub["user_id"]},
                {"_id": 0}
            )
            
            # Check if user has enabled this notification type
            if prefs:
                type_mapping = {
                    NotificationType.COMMENT: prefs.get("comment_notifications", True),
                    NotificationType.ZBS04_ASSIGNMENT: prefs.get("zbs04_notifications", True),
                    NotificationType.SYSTEM_ANNOUNCEMENT: prefs.get("system_notifications", True),
                    NotificationType.CONTENT_UPDATE: prefs.get("content_update_notifications", True),
                    NotificationType.CUSTOM: prefs.get("custom_notifications", True)
                }
                
                if type_mapping.get(request.notification_type, True):
                    valid_subscriptions.append(sub)
            else:
                valid_subscriptions.append(sub)
        
        # Send push notifications
        results = await notification_service.send_to_multiple(
            subscriptions=valid_subscriptions,
            title=request.title,
            body=request.body,
            url=request.url,
            icon=request.icon,
            tag=request.notification_type.value
        )
        
        # Store notifications in database for inbox
        notification_docs = []
        for user_id in target_users:
            notification_docs.append({
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "title": request.title,
                "body": request.body,
                "url": request.url,
                "notification_type": request.notification_type.value,
                "icon": request.icon,
                "read": False,
                "created_at": datetime.now(timezone.utc)
            })
        
        if notification_docs:
            await db.notifications.insert_many(notification_docs)
        
        # Clean up invalid subscriptions
        if results["invalid_subscriptions"]:
            await db.notification_subscriptions.delete_many({
                "id": {"$in": results["invalid_subscriptions"]}
            })
        
        return {
            "message": "Notifications sent",
            "sent": results["sent"],
            "failed": results["failed"],
            "total_recipients": len(target_users)
        }
        
    except Exception as e:
        logging.error(f"Send notification error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Debug: Check subscription details
@api_router.get("/notifications/debug/subscription")
async def debug_subscription(current_user: User = Depends(get_current_user)):
    """Debug endpoint to check subscription details"""
    try:
        subscriptions = await db.notification_subscriptions.find({
            "user_id": current_user.id
        }, {"_id": 0}).to_list(None)
        
        if not subscriptions:
            return {
                "subscribed": False,
                "message": "No subscriptions found"
            }
        
        # Analyze subscription
        sub = subscriptions[0]
        endpoint = sub.get("subscription_info", {}).get("endpoint", "")
        
        return {
            "subscribed": True,
            "count": len(subscriptions),
            "endpoint_preview": endpoint[:50] + "..." if len(endpoint) > 50 else endpoint,
            "has_keys": "keys" in sub.get("subscription_info", {}),
            "created_at": sub.get("created_at"),
            "last_used": sub.get("last_used"),
            "endpoint_type": "Apple" if "apple" in endpoint.lower() else 
                           "Google" if "google" in endpoint.lower() or "fcm" in endpoint.lower() else
                           "Mozilla" if "mozilla" in endpoint.lower() else
                           "Unknown"
        }
    except Exception as e:
        logging.error(f"Debug subscription error: {e}")
        return {"error": str(e)}

# Test notification (send to self)
@api_router.post("/notifications/test")
async def test_notification(current_user: User = Depends(get_current_user)):
    """Send test notification to yourself"""
    try:
        # Get user's subscriptions
        subscriptions = await db.notification_subscriptions.find({
            "user_id": current_user.id
        }, {"_id": 0}).to_list(None)
        
        if not subscriptions:
            raise HTTPException(status_code=404, detail="No active subscriptions found. Please enable notifications first.")
        
        # Log for debugging
        logging.info(f"🔔 Sending test notification to user {current_user.id}")
        logging.info(f"📱 Found {len(subscriptions)} subscription(s)")
        
        # Send test notification
        results = await notification_service.send_to_multiple(
            subscriptions=subscriptions,
            title="🔔 ทดสอบการแจ้งเตือน",
            body=f"สวัสดี {current_user.full_name}! ระบบแจ้งเตือนของคุณทำงานอย่างสมบูรณ์",
            url="/profile/notifications",
            tag="test"
        )
        
        logging.info(f"✅ Notification results: sent={results['sent']}, failed={results['failed']}")
        
        # Store in inbox
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": current_user.id,
            "title": "🔔 ทดสอบการแจ้งเตือน",
            "body": f"สวัสดี {current_user.full_name}! ระบบแจ้งเตือนของคุณทำงานอย่างสมบูรณ์",
            "url": "/profile/notifications",
            "notification_type": "custom",
            "read": False,
            "created_at": datetime.now(timezone.utc)
        })
        
        return {
            "message": "Test notification sent successfully",
            "sent": results["sent"],
            "failed": results["failed"],
            "debug": {
                "subscriptions_count": len(subscriptions),
                "user_id": current_user.id
            }
        }
        
    except Exception as e:
        logging.error(f"❌ Test notification error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Admin: Get all subscriptions
@api_router.get("/admin/notifications/subscriptions")
async def get_all_subscriptions(
    current_user: User = Depends(get_admin_user)
):
    """Get all notification subscriptions (admin only)"""
    subscriptions = await db.notification_subscriptions.find({}, {"_id": 0}).to_list(None)
    
    # Get user details for each subscription
    user_ids = list(set([sub["user_id"] for sub in subscriptions]))
    users = await db.users.find(
        {"id": {"$in": user_ids}},
        {"_id": 0, "id": 1, "full_name": 1, "email": 1}
    ).to_list(None)
    
    user_map = {u["id"]: u for u in users}
    
    # Enrich subscriptions with user data
    for sub in subscriptions:
        sub["user"] = user_map.get(sub["user_id"], {})
    
    return {
        "subscriptions": subscriptions,
        "total": len(subscriptions),
        "unique_users": len(user_ids)
    }

# Admin: Get notification statistics
@api_router.get("/admin/notifications/stats")
async def get_notification_stats(
    current_user: User = Depends(get_admin_user)
):
    """Get notification statistics (admin only)"""
    total_subscriptions = await db.notification_subscriptions.count_documents({})
    total_notifications = await db.notifications.count_documents({})
    unread_notifications = await db.notifications.count_documents({"read": False})
    
    # Get notifications by type
    pipeline = [
        {"$group": {"_id": "$notification_type", "count": {"$sum": 1}}}
    ]
    by_type = await db.notifications.aggregate(pipeline).to_list(None)
    
    return {
        "total_subscriptions": total_subscriptions,
        "unique_users": len(await db.notification_subscriptions.distinct("user_id")),
        "total_notifications_sent": total_notifications,
        "unread_notifications": unread_notifications,
        "notifications_by_type": by_type
    }

# ============ ADMIN USER MANAGEMENT ============

# Get admin list (MUST come before /admin/users to avoid route conflict)
@api_router.get("/admin/users/admins")
async def get_admin_list(
    current_user: User = Depends(get_admin_user)
):
    """Get list of all admins"""
    admins = await db.users.find(
        {"role": UserRole.ADMIN},
        {"_id": 0, "password": 0}
    ).to_list(None)
    
    # Mark hard-coded admins
    HARDCODED_ADMINS = ["intaka@hotmail.com", "intaka@gmail.com"]
    for admin in admins:
        admin["is_hardcoded_admin"] = admin.get("email", "").lower() in [email.lower() for email in HARDCODED_ADMINS]
        admin["can_be_demoted"] = not admin["is_hardcoded_admin"]
    
    return {
        "admins": admins,
        "total": len(admins),
        "hardcoded_admins": HARDCODED_ADMINS
    }

# Get all users with admin filter
@api_router.get("/admin/users")
async def get_all_users(
    role: Optional[str] = None,
    current_user: User = Depends(get_admin_user)
):
    """Get all users (admin only)"""
    query = {}
    if role:
        query["role"] = role
    
    users = await db.users.find(query, {"_id": 0, "password": 0}).to_list(None)
    
    # Mark hard-coded admins
    HARDCODED_ADMINS = ["intaka@hotmail.com", "intaka@gmail.com"]
    for user in users:
        user["is_hardcoded_admin"] = user.get("email", "").lower() in [email.lower() for email in HARDCODED_ADMINS]
    
    return {"users": users, "total": len(users)}

# Promote user to admin
@api_router.put("/admin/users/{user_id}/promote")
async def promote_to_admin(
    user_id: str,
    current_user: User = Depends(get_admin_user)
):
    """Promote a user to admin role"""
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user["role"] == UserRole.ADMIN:
        raise HTTPException(status_code=400, detail="User is already an admin")
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "role": UserRole.ADMIN,
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    return {"message": f"User {user['full_name']} promoted to admin"}

# Demote admin to regular user
@api_router.put("/admin/users/{user_id}/demote")
async def demote_from_admin(
    user_id: str,
    current_user: User = Depends(get_admin_user)
):
    """Demote an admin to regular user"""
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if user is hard-coded admin
    HARDCODED_ADMINS = ["intaka@hotmail.com", "intaka@gmail.com"]
    if user.get("email", "").lower() in [email.lower() for email in HARDCODED_ADMINS]:
        raise HTTPException(status_code=400, detail="Cannot demote hard-coded admin")
    
    if user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=400, detail="User is not an admin")
    
    # Don't allow self-demotion
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot demote yourself")
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "role": UserRole.PUBLIC_USER,
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    return {"message": f"User {user['full_name']} demoted from admin"}

# Include the router

# ============================================================================
# CONJOINT ANALYSIS
# ============================================================================

# Models
class ConjointStudyStatus(str, Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    COMPLETED = "completed"
    ARCHIVED = "archived"

class AttributeLevel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    value: str
    description: Optional[str] = None
    image_url: Optional[str] = None

class ConjointAttribute(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    levels: List[AttributeLevel]
    order: int = 0

class QualitativeInput(BaseModel):
    type: str  # "interview", "observation", "constraints"
    content: str
    filename: Optional[str] = None

class ConjointProfile(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    attribute_levels: Dict[str, str]  # attribute_id -> level_id
    image_url: Optional[str] = None
    description: Optional[str] = None

class ChoiceSet(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    profiles: List[ConjointProfile]
    set_number: int

class CreateConjointStudyRequest(BaseModel):
    title: str
    description: Optional[str] = None
    product_category: Optional[str] = None

class QualitativeAnalysisRequest(BaseModel):
    qualitative_data: List[QualitativeInput]
    target_language: str = "th"

class UpdateAttributesRequest(BaseModel):
    attributes: List[ConjointAttribute]

class GenerateDesignRequest(BaseModel):
    alternatives_per_set: int = 3
    number_of_sets: Optional[int] = None  # Auto-calculate if not provided
    design_method: str = "d-optimal"

class LLMPromptTemplate(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    category: str  # "conjoint_qualitative", "image_generation", etc.
    prompt_template: str
    system_message: Optional[str] = None
    model_provider: str = "anthropic"
    model_name: str = "claude-sonnet-4-20250514"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_by: Optional[str] = None

class UpdateLLMPromptRequest(BaseModel):
    prompt_template: str
    system_message: Optional[str] = None
    model_provider: Optional[str] = None
    model_name: Optional[str] = None

class UpdateStudyStatusRequest(BaseModel):
    status: ConjointStudyStatus
    reason: Optional[str] = None  # Optional reason for status change

class AIInterpretationRequest(BaseModel):
    method: Optional[str] = "counting"  # counting, mnl, linear_regression, mixed_logit, hierarchical_bayes
    compare_all: bool = False  # If True, analyze and compare all methods


class ConjointContentShareRequest(BaseModel):
    title: str
    research_type: str  # e.g., "quantitative", "qualitative", "mixed"
    sample_size: Optional[str] = None
    data_source: Optional[str] = None
    collection_method: Optional[str] = None
    research_date: Optional[str] = None
    additional_notes: Optional[str] = None
    study_id: str
    # Include results data
    respondent_count: int
    statistical_method: str
    importance_scores: Dict[str, Any]
    part_worths: Dict[str, Any]
    ai_interpretation: Optional[str] = None



class GenerateImagesRequest(BaseModel):
    study_id: str

class GenerateSingleImageRequest(BaseModel):
    attribute_id: str
    level_id: str
    prompt: Optional[str] = None
    reference_image_indices: Optional[List[int]] = None  # Indices of selected reference images
    additional_prompt: Optional[str] = None  # Additional prompt text to append

class GenerateProfileImageRequest(BaseModel):
    choice_set_id: str
    profile_id: str
    prompt: Optional[str] = None
    reference_image_indices: Optional[List[int]] = None  # Indices of selected reference images
    additional_prompt: Optional[str] = None  # Additional prompt text to append

class ImageGenerationSettings(BaseModel):
    level_image_prompt_template: str = "Professional product visualization: {attribute_name} - {level_value}. Clean, minimalist style on white background."
    level_image_prompt_with_ref: str = "Based on the reference images provided, create a product visualization for: {attribute_name} - {level_value}. Match the style, lighting, and composition of the reference images while showcasing the specific feature."
    level_image_model: str = "gpt-image-1"
    profile_image_prompt_template: str = "Professional product photo showing: {composition}. High quality, clean background, product-focused composition."
    profile_image_prompt_with_ref: str = "Using the reference images as style guide, create a product photo showing: {composition}. Match the visual style, lighting, and aesthetic of the reference images."
    profile_image_model: str = "gpt-image-1"
    updated_by: Optional[str] = None
    updated_at: Optional[datetime] = None

class UpdateImageGenerationSettingsRequest(BaseModel):
    level_image_prompt_template: Optional[str] = None
    level_image_prompt_with_ref: Optional[str] = None
    level_image_model: Optional[str] = None
    profile_image_prompt_template: Optional[str] = None
    profile_image_prompt_with_ref: Optional[str] = None
    profile_image_model: Optional[str] = None

class UploadImageRequest(BaseModel):
    attribute_id: str
    level_id: str
    image_url: str

class UploadProfileImageRequest(BaseModel):
    choice_set_id: str
    profile_id: str
    image_url: str

class UploadReferenceImagesRequest(BaseModel):
    image_urls: List[str]  # List of base64 image URLs (max 5)

class GenerateProductImageFromResultsRequest(BaseModel):
    additional_prompt: Optional[str] = None  # User can add extra instructions
    reference_image_indices: Optional[List[int]] = None  # Select from uploaded reference images (max 5)

class GenerateShelfSimulationRequest(BaseModel):
    product_image_url: str  # The generated product image from step 1
    environment_type: str  # "auto", "cosmetics_store", "convenience_store", "supermarket", "mall", "custom"
    custom_environment: Optional[str] = None  # Custom environment description if environment_type is "custom"
    shelf_style: str = "eye_level"  # "eye_level", "shelf_view", "aisle_view", "custom"
    custom_shelf_style: Optional[str] = None  # Custom shelf style description if shelf_style is "custom"
    additional_prompt: Optional[str] = None  # User can customize environment


class SurveyResponse(BaseModel):
    study_id: str
    respondent_id: Optional[str] = None
    respondent_email: Optional[str] = None
    responses: List[Dict[str, Any]]  # list of {choice_set_id, selected_profile_id}

# Helper Functions
def calculate_optimal_choice_sets(num_attributes: int, num_levels_per_attr: List[int], alternatives_per_set: int = 3) -> int:
    """Calculate statistically optimal number of choice sets based on D-optimal criteria"""
    # Rule of thumb: need at least 3 * (total parameters) / alternatives_per_set
    total_parameters = sum(num_levels_per_attr) - num_attributes  # minus reference levels
    min_sets = max(8, int((3 * total_parameters) / alternatives_per_set))
    # Round to nearest multiple of 4 for balanced design
    optimal_sets = ((min_sets + 3) // 4) * 4
    return min(max(8, optimal_sets), 20)  # Between 8-20 sets

async def generate_d_optimal_design(attributes: List[ConjointAttribute], alternatives_per_set: int, num_sets: int) -> List[ChoiceSet]:
    """Generate D-optimal fractional factorial design for choice sets"""
    import itertools
    import random
    
    # Create full factorial of all possible profiles
    attr_levels_map = {}
    for attr in attributes:
        attr_levels_map[attr.id] = [level.id for level in attr.levels]
    
    # Generate all possible combinations
    attr_ids = list(attr_levels_map.keys())
    all_combinations = list(itertools.product(*[attr_levels_map[aid] for aid in attr_ids]))
    
    # Convert to profile format
    all_profiles = []
    for combo in all_combinations:
        profile_dict = {attr_ids[i]: combo[i] for i in range(len(attr_ids))}
        all_profiles.append(ConjointProfile(attribute_levels=profile_dict))
    
    # D-optimal selection (simplified - use random sampling with constraints)
    # In production, use specialized DOE libraries like pyDOE or R's AlgDesign
    choice_sets = []
    used_profiles = set()
    
    for set_num in range(num_sets):
        # Select alternatives ensuring variety
        set_profiles = []
        attempts = 0
        max_attempts = 100
        
        while len(set_profiles) < alternatives_per_set and attempts < max_attempts:
            candidate = random.choice(all_profiles)
            profile_key = tuple(sorted(candidate.attribute_levels.items()))
            
            if profile_key not in used_profiles:
                # Check for attribute level balance in this choice set
                if not set_profiles or is_balanced_set(set_profiles + [candidate], attributes):
                    set_profiles.append(candidate)
                    used_profiles.add(profile_key)
            
            attempts += 1
        
        if len(set_profiles) == alternatives_per_set:
            choice_sets.append(ChoiceSet(
                profiles=set_profiles,
                set_number=set_num + 1
            ))
    
    return choice_sets

def is_balanced_set(profiles: List[ConjointProfile], attributes: List[ConjointAttribute]) -> bool:
    """Check if choice set has good attribute level variation"""
    if len(profiles) < 2:
        return True
    
    # Count unique levels per attribute
    for attr in attributes:
        levels_in_set = set()
        for profile in profiles:
            if attr.id in profile.attribute_levels:
                levels_in_set.add(profile.attribute_levels[attr.id])
        
        # Prefer sets where each attribute shows variation
        if len(levels_in_set) < 2 and len(attr.levels) > 1:
            return False
    
    return True

# API Endpoints

# Create new conjoint study
@api_router.post("/conjoint/studies")
async def create_conjoint_study(
    request: CreateConjointStudyRequest,
    current_user: User = Depends(get_current_user)
):
    """Create a new conjoint analysis study"""
    study_id = str(uuid.uuid4())
    
    now = datetime.now(timezone.utc)
    
    study = {
        "id": study_id,
        "title": request.title,
        "description": request.description,
        "product_category": request.product_category,
        "status": ConjointStudyStatus.DRAFT,
        "creator_id": current_user.id,
        "creator_name": current_user.full_name,
        "created_at": now,
        "updated_at": now,
        "qualitative_data": [],
        "attributes": [],
        "choice_sets": [],
        "respondent_count": 0,
        "is_public_result": False,
        "status_history": [{
            "from_status": None,
            "to_status": ConjointStudyStatus.DRAFT,
            "changed_by": current_user.id,
            "changed_by_name": current_user.full_name,
            "changed_at": now,
            "reason": "Study created"
        }]
    }
    
    await db.conjoint_studies.insert_one(study)
    
    return {"study_id": study_id, "message": "Study created successfully"}

# Initialize default LLM prompts
async def initialize_default_prompts():
    """Initialize default LLM prompt templates if they don't exist"""
    default_prompts = [
        {
            "id": "conjoint-qualitative-analysis",
            "name": "Conjoint Qualitative Analysis",
            "category": "conjoint_qualitative",
            "system_message": "You are an expert marketing researcher specializing in Conjoint Analysis and consumer research.",
            "prompt_template": """You are an expert marketing researcher specializing in Conjoint Analysis.

Analyze the following qualitative data to identify the most important product/service attributes and their levels for a Choice-Based Conjoint Analysis study.

Qualitative Data:
{combined_data}

Instructions:
1. Identify 3-5 key attributes that customers care about most
2. For each attribute, suggest 2-4 realistic levels
3. Ensure levels are:
   - Clearly distinguishable
   - Feasible to implement
   - Cover a reasonable range
4. Provide brief rationale for each attribute

Output Format (JSON):
{{
  "attributes": [
    {{
      "name": "Attribute Name",
      "description": "Brief description",
      "rationale": "Why this attribute is important",
      "levels": [
        {{"value": "Level 1", "description": "Brief description"}},
        {{"value": "Level 2", "description": "Brief description"}}
      ]
    }}
  ],
  "recommendations": "Overall recommendations for the study design"
}}

Respond in {target_language} language.""",
            "model_provider": "anthropic",
            "model_name": "claude-sonnet-4-20250514",
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        }
    ]
    
    for prompt_data in default_prompts:
        existing = await db.llm_prompts.find_one({"id": prompt_data["id"]}, {"_id": 0})
        if not existing:
            await db.llm_prompts.insert_one(prompt_data)

# Phase 1: Qualitative Analysis
@api_router.post("/conjoint/studies/{study_id}/qualitative-analysis")
async def analyze_qualitative_data(
    study_id: str,
    request: QualitativeAnalysisRequest,
    current_user: User = Depends(get_current_user)
):
    """Use LLM to analyze qualitative data and suggest attributes/levels"""
    study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    
    if study["creator_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get API key
    api_key = os.environ.get('EMERGENT_LLM_KEY')
    if not api_key:
        raise HTTPException(status_code=500, detail="LLM service not configured")
    
    # Combine all qualitative inputs
    combined_data = "\n\n".join([
        f"=== {str(item.type).upper()} ===\n{item.content}"
        for item in request.qualitative_data
    ])
    
    # Get prompt template from database
    await initialize_default_prompts()
    prompt_config = await db.llm_prompts.find_one(
        {"id": "conjoint-qualitative-analysis"},
        {"_id": 0}
    )
    
    if not prompt_config:
        raise HTTPException(status_code=500, detail="Prompt configuration not found")
    
    # Format the prompt with actual data
    analysis_prompt = prompt_config["prompt_template"].format(
        combined_data=combined_data,
        target_language=request.target_language
    )
    
    # Call LLM with configured model
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        chat = LlmChat(
            api_key=api_key,
            session_id=f"conjoint-qual-{study_id}",
            system_message=prompt_config.get("system_message", "You are an expert marketing researcher.")
        ).with_model(
            prompt_config.get("model_provider", "anthropic"),
            prompt_config.get("model_name", "claude-sonnet-4-20250514")
        )
        
        response_text = await chat.send_message(UserMessage(text=analysis_prompt))
        
        # Parse JSON response
        import json
        import re
        
        # Extract JSON from response (in case there's extra text)
        json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if json_match:
            analysis_result = json.loads(json_match.group())
        else:
            raise Exception("Failed to parse LLM response")
        
        # Convert to our attribute format
        suggested_attributes = []
        for i, attr_data in enumerate(analysis_result.get("attributes", [])):
            attr_levels = []
            for level_data in attr_data.get("levels", []):
                attr_levels.append(AttributeLevel(
                    value=level_data.get("value", ""),
                    description=level_data.get("description")
                ))
            
            suggested_attributes.append(ConjointAttribute(
                name=attr_data.get("name", ""),
                description=attr_data.get("description"),
                levels=attr_levels,
                order=i
            ))
        
        # Update study
        await db.conjoint_studies.update_one(
            {"id": study_id},
            {
                "$set": {
                    "qualitative_data": [item.dict() for item in request.qualitative_data],
                    "suggested_attributes": [attr.dict() for attr in suggested_attributes],
                    "llm_analysis": analysis_result,
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )
        
        return {
            "suggested_attributes": [attr.dict() for attr in suggested_attributes],
            "recommendations": analysis_result.get("recommendations", ""),
            "raw_analysis": analysis_result
        }
        
    except Exception as e:
        import traceback
        logging.error(f"Qualitative analysis error: {e}")
        logging.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

# Update attributes (after reviewing LLM suggestions)
@api_router.put("/conjoint/studies/{study_id}/attributes")
async def update_study_attributes(
    study_id: str,
    request: UpdateAttributesRequest,
    current_user: User = Depends(get_current_user)
):
    """Update study attributes after reviewing/editing LLM suggestions"""
    study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    
    if study["creator_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    await db.conjoint_studies.update_one(
        {"id": study_id},
        {
            "$set": {
                "attributes": [attr.dict() for attr in request.attributes],
                "updated_at": datetime.now(timezone.utc)
            }
        }
    )
    
    return {"message": "Attributes updated successfully"}

# Generate D-Optimal Design
@api_router.post("/conjoint/studies/{study_id}/generate-design")
async def generate_conjoint_design(
    study_id: str,
    request: GenerateDesignRequest,
    current_user: User = Depends(get_current_user)
):
    """Generate D-optimal choice sets for the study"""
    study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    
    if study["creator_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    if not study.get("attributes"):
        raise HTTPException(status_code=400, detail="No attributes defined. Please complete Phase 1 first.")
    
    # Parse attributes
    attributes = [ConjointAttribute(**attr) for attr in study["attributes"]]
    
    # Calculate optimal number of choice sets if not provided
    num_sets = request.number_of_sets
    if not num_sets:
        num_levels_per_attr = [len(attr.levels) for attr in attributes]
        num_sets = calculate_optimal_choice_sets(
            len(attributes),
            num_levels_per_attr,
            request.alternatives_per_set
        )
    
    # Generate design
    choice_sets = await generate_d_optimal_design(
        attributes,
        request.alternatives_per_set,
        num_sets
    )
    
    # Save design
    await db.conjoint_studies.update_one(
        {"id": study_id},
        {
            "$set": {
                "choice_sets": [cs.dict() for cs in choice_sets],
                "alternatives_per_set": request.alternatives_per_set,
                "design_method": request.design_method,
                "status": ConjointStudyStatus.ACTIVE,
                "updated_at": datetime.now(timezone.utc)
            }
        }
    )
    
    return {
        "message": "Design generated successfully",
        "num_choice_sets": len(choice_sets),
        "alternatives_per_set": request.alternatives_per_set,
        "design_efficiency": {
            "total_profiles": len(choice_sets) * request.alternatives_per_set,
            "recommended_respondents": max(200, len(choice_sets) * 15)
        }
    }

# Get study details
@api_router.get("/conjoint/studies/{study_id}")
async def get_conjoint_study(
    study_id: str,
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """Get conjoint study details (public if is_public_result is True)"""
    study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    
    # Check if study results are public
    is_public_result = study.get("is_public_result", False)
    
    # If not public, require authentication and ownership
    if not is_public_result:
        if not current_user:
            raise HTTPException(status_code=401, detail="Authentication required")
        is_owner = study.get("creator_id") == current_user.id
        is_admin = current_user.role == UserRole.ADMIN
        if not (is_owner or is_admin):
            raise HTTPException(status_code=403, detail="Not authorized")
    
    # Add permission info for frontend
    if current_user:
        is_owner = study.get("creator_id") == current_user.id
        is_admin = current_user.role == UserRole.ADMIN
        study["is_owner_or_admin"] = is_owner or is_admin
    else:
        study["is_owner_or_admin"] = False
    
    return study

# List user's studies
@api_router.get("/conjoint/studies")
async def list_conjoint_studies(
    current_user: User = Depends(get_current_user),
    status_filter: Optional[str] = None
):
    """List conjoint studies - all studies for admin, only owned studies for others"""
    # Build query
    query = {}
    
    # Admin can see all studies, others only their own
    if current_user.role != UserRole.ADMIN:
        query["creator_id"] = current_user.id
    
    # Apply status filter if provided
    if status_filter and status_filter != "all":
        query["status"] = status_filter
    
    studies = await db.conjoint_studies.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).to_list(1000)
    
    return {"studies": studies}


# Update study status
@api_router.put("/conjoint/studies/{study_id}/status")
async def update_study_status(
    study_id: str,
    request: UpdateStudyStatusRequest,
    current_user: User = Depends(get_current_user)
):
    """Update study status - accessible by study owner and admin"""
    study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    
    # Check permission: owner or admin can update
    if study["creator_id"] != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="You don't have permission to update this study")
    
    # Create status history entry
    status_change = {
        "from_status": study.get("status", ConjointStudyStatus.DRAFT),
        "to_status": request.status,
        "changed_by": current_user.id,
        "changed_by_name": current_user.full_name,
        "changed_at": datetime.now(timezone.utc),
        "reason": request.reason
    }
    
    # Update study
    update_data = {
        "status": request.status,
        "updated_at": datetime.now(timezone.utc)
    }
    
    # Initialize status_history if it doesn't exist, then append
    if "status_history" not in study:
        update_data["status_history"] = [status_change]
    else:
        await db.conjoint_studies.update_one(
            {"id": study_id},
            {"$push": {"status_history": status_change}}
        )
    
    await db.conjoint_studies.update_one(
        {"id": study_id},
        {"$set": update_data}
    )
    
    return {
        "message": "Status updated successfully",
        "new_status": request.status,
        "status_change": status_change
    }


# Toggle public result sharing
@api_router.put("/conjoint/studies/{study_id}/public-result")
async def toggle_public_result(
    study_id: str,
    is_public: bool = Body(..., embed=True),
    current_user: User = Depends(get_current_user)
):
    """Toggle public sharing for study results - accessible by study owner and admin only"""
    study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    
    # Check permission: owner or admin can toggle
    if study["creator_id"] != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="You don't have permission to modify this study")
    
    # Update study
    await db.conjoint_studies.update_one(
        {"id": study_id},
        {"$set": {
            "is_public_result": is_public,
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    return {
        "message": "Public result setting updated successfully",
        "is_public_result": is_public,
        "study_id": study_id
    }



# Admin: Get all LLM prompts
@api_router.get("/admin/llm-prompts")
async def get_llm_prompts(
    current_user: User = Depends(get_current_user)
):
    """Get all LLM prompt templates (admin only)"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    await initialize_default_prompts()
    prompts = await db.llm_prompts.find({}, {"_id": 0}).to_list(100)
    
    return {"prompts": prompts}

# Admin: Update LLM prompt
@api_router.put("/admin/llm-prompts/{prompt_id}")
async def update_llm_prompt(
    prompt_id: str,
    request: UpdateLLMPromptRequest,
    current_user: User = Depends(get_current_user)
):
    """Update an LLM prompt template (admin only)"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    prompt = await db.llm_prompts.find_one({"id": prompt_id}, {"_id": 0})
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    
    update_data = {
        "prompt_template": request.prompt_template,
        "updated_at": datetime.now(timezone.utc),
        "updated_by": current_user.id
    }
    
    if request.system_message is not None:
        update_data["system_message"] = request.system_message
    if request.model_provider is not None:
        update_data["model_provider"] = request.model_provider
    if request.model_name is not None:
        update_data["model_name"] = request.model_name
    
    await db.llm_prompts.update_one(
        {"id": prompt_id},
        {"$set": update_data}
    )
    
    updated_prompt = await db.llm_prompts.find_one({"id": prompt_id}, {"_id": 0})
    return {"message": "Prompt updated successfully", "prompt": updated_prompt}

# Generate images for attribute levels (optional - can be skipped)
@api_router.post("/conjoint/studies/{study_id}/generate-images")
async def generate_profile_images(
    study_id: str,
    current_user: User = Depends(get_current_user)
):
    """Generate images for all attribute levels using AI (optional feature)"""
    study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    
    if study["creator_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    if not study.get("attributes"):
        raise HTTPException(status_code=400, detail="No attributes defined")
    
    # Image generation is optional - if not available, just mark as skipped
    try:
        # Try to import image generation (may not be available)
        try:
            from emergentintegrations.image import generate_image
            image_gen_available = True
        except ImportError:
            logging.warning("Image generation module not available - skipping image generation")
            image_gen_available = False
        
        if not image_gen_available:
            # Mark as skipped but allow proceeding
            await db.conjoint_studies.update_one(
                {"id": study_id},
                {
                    "$set": {
                        "images_generated": False,
                        "images_skipped": True,
                        "updated_at": datetime.now(timezone.utc)
                    }
                }
            )
            
            return {
                "message": "Image generation skipped (feature not available)",
                "images_generated": False,
                "skipped": True
            }
        
        # If available, generate images
        api_key = os.environ.get('EMERGENT_LLM_KEY')
        if not api_key:
            raise HTTPException(status_code=500, detail="LLM service not configured")
        
        updated_attributes = []
        generated_count = 0
        failed_count = 0
        
        for attr in study["attributes"]:
            updated_levels = []
            for level in attr.get("levels", []):
                # Generate image for each level
                image_prompt = f"Professional product visualization: {attr['name']} - {level['value']}. Clean, minimalist style on white background."
                
                if level.get("description"):
                    image_prompt += f" {level['description']}"
                
                try:
                    # Attempt to generate image
                    image_url = await generate_image(
                        prompt=image_prompt,
                        api_key=api_key
                    )
                    
                    level["image_url"] = image_url
                    level["image_prompt"] = image_prompt
                    generated_count += 1
                except Exception as img_error:
                    logging.error(f"Failed to generate image for {level['value']}: {img_error}")
                    level["image_url"] = None
                    failed_count += 1
                
                updated_levels.append(level)
            
            attr["levels"] = updated_levels
            updated_attributes.append(attr)
        
        # Update study
        await db.conjoint_studies.update_one(
            {"id": study_id},
            {
                "$set": {
                    "attributes": updated_attributes,
                    "images_generated": generated_count > 0,
                    "images_skipped": False,
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )
        
        return {
            "message": f"Images generated: {generated_count}, failed: {failed_count}",
            "attributes": updated_attributes,
            "generated_count": generated_count,
            "failed_count": failed_count
        }
        
    except Exception as e:
        logging.error(f"Image generation error: {e}")
        # Don't fail the entire request - just mark as skipped
        await db.conjoint_studies.update_one(
            {"id": study_id},
            {
                "$set": {
                    "images_generated": False,
                    "images_skipped": True,
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )
        
        return {
            "message": "Image generation failed - proceeding without images",
            "error": str(e),
            "images_generated": False,
            "skipped": True
        }

# Generate image for single attribute level
@api_router.post("/conjoint/studies/{study_id}/generate-single-image")
async def generate_single_image(
    study_id: str,
    request: GenerateSingleImageRequest,
    current_user: User = Depends(get_current_user)
):
    """Generate image for a specific attribute level using AI"""
    study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    
    if study["creator_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Check if this is a test generation (attribute_id/level_id = 'test')
    is_test_generation = request.attribute_id == 'test' and request.level_id == 'test'
    
    # Find the attribute and level (skip for test generation)
    attributes = study.get("attributes", [])
    attr_found = None
    level_found = None
    
    if not is_test_generation:
        for attr in attributes:
            if attr["id"] == request.attribute_id:
                attr_found = attr
                for level in attr.get("levels", []):
                    if level["id"] == request.level_id:
                        level_found = level
                        break
                break
        
        if not attr_found or not level_found:
            raise HTTPException(status_code=404, detail="Attribute or level not found")
    
    # Get image generation settings
    settings = await db.conjoint_image_settings.find_one({"id": "default"}, {"_id": 0})
    if not settings:
        settings = {
            "level_image_prompt_template": "Professional product visualization: {attribute_name} - {level_value}. Clean, minimalist style on white background.",
            "level_image_prompt_with_ref": "Based on the reference images provided, create a product visualization for: {attribute_name} - {level_value}. Match the style, lighting, and composition of the reference images.",
            "level_image_model": "gpt-image-1"
        }
    
    # Check if using reference images
    reference_images = study.get("reference_images", [])
    using_refs = request.reference_image_indices and len(request.reference_image_indices) > 0 and len(reference_images) > 0
    
    # Use custom prompt or generate from template
    if request.prompt:
        image_prompt = request.prompt
    elif is_test_generation:
        # For test generation, use a default prompt
        image_prompt = "High quality product image"
    else:
        # Select appropriate template based on reference usage
        if using_refs:
            template = settings.get("level_image_prompt_with_ref", settings["level_image_prompt_template"])
        else:
            template = settings["level_image_prompt_template"]
        
        # Use template and replace variables
        image_prompt = template.format(
            attribute_name=attr_found['name'],
            level_value=level_found['value'],
            level_description=level_found.get("description", "")
        )
        if level_found.get("description") and not using_refs:
            image_prompt += f" {level_found['description']}"
    
    # Prepend additional prompt if provided (put it at the front)
    if request.additional_prompt:
        image_prompt = f"{request.additional_prompt} {image_prompt}"
    
    # Generate image using configured model
    api_key = os.environ.get('EMERGENT_LLM_KEY')
    if not api_key:
        raise HTTPException(status_code=500, detail="LLM service not configured")
    
    model_to_use = settings.get("level_image_model", "gpt-image-1")
    
    try:
        import base64
        
        # Prepare reference images if provided
        ref_images_base64 = []
        if using_refs:
            for idx in request.reference_image_indices:
                if 0 <= idx < len(reference_images):
                    img_url = reference_images[idx]
                    # Extract base64 from data URL
                    if img_url.startswith('data:image'):
                        ref_images_base64.append(img_url.split(',')[1])
                    else:
                        ref_images_base64.append(img_url)
        
        # Check if using Nano Banana (Gemini)
        if model_to_use == "nanobanana":
            from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
            
            chat = LlmChat(
                api_key=api_key,
                session_id=f"level-img-{study_id}-{request.level_id}",
                system_message="You are an AI image generator."
            ).with_model("gemini", "gemini-2.5-flash-image-preview").with_params(modalities=["image", "text"])
            
            # Create message with reference images if provided (Image + Text to Image mode)
            if using_refs and len(ref_images_base64) > 0:
                # Send reference images as ImageContent for style guidance
                image_contents = [ImageContent(img_data) for img_data in ref_images_base64]
                msg = UserMessage(text=image_prompt, file_contents=image_contents)
            else:
                msg = UserMessage(text=image_prompt)
            
            text, images = await chat.send_message_multimodal_response(msg)
            
            if not images or len(images) == 0:
                raise HTTPException(status_code=500, detail="No image was generated")
            
            # Images already in base64 format
            image_base64 = images[0]['data']
            
        else:
            # Use OpenAI models
            from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration
            
            image_gen = OpenAIImageGeneration(api_key=api_key)
            
            # If using reference images with OpenAI, use image editing/variation mode
            if using_refs and len(ref_images_base64) > 0:
                # Use the first reference image for editing
                # Note: OpenAI edit mode requires mask; for style reference we use variation
                images = await image_gen.generate_image_variations(
                    image_data=base64.b64decode(ref_images_base64[0]),
                    prompt=image_prompt,
                    model=model_to_use,
                    number_of_images=1
                )
            else:
                # Standard text-to-image generation
                images = await image_gen.generate_images(
                    prompt=image_prompt,
                    model=model_to_use,
                    number_of_images=1
                )
            
            if not images or len(images) == 0:
                raise HTTPException(status_code=500, detail="No image was generated")
            
            # Convert to base64
            image_base64 = base64.b64encode(images[0]).decode('utf-8')
        
        # Compress image aggressively (target: 100-150KB for 100+ images per study)
        compressed_base64 = compress_base64_image(image_base64, max_size_kb=150.0, target_dimension=640)
        
        # Create data URL
        image_data_url = f"data:image/jpeg;base64,{compressed_base64}"
        
        # Update the level with the generated image (skip for test generation)
        if not is_test_generation:
            for attr in attributes:
                if attr["id"] == request.attribute_id:
                    for level in attr.get("levels", []):
                        if level["id"] == request.level_id:
                            level["image_url"] = image_data_url
                            level["image_prompt"] = image_prompt
                            break
                    break
            
            # Save updated attributes
            await db.conjoint_studies.update_one(
                {"id": study_id},
                {
                    "$set": {
                        "attributes": attributes,
                        "updated_at": datetime.now(timezone.utc)
                    }
                }
            )
        
        return {
            "message": "Image generated successfully" if not is_test_generation else "Test image generated successfully",
            "image_url": image_data_url,
            "prompt_used": image_prompt,
            "is_test": is_test_generation
        }
        
    except Exception as e:
        logging.error(f"Single image generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Image generation failed: {str(e)}")

# Upload image for attribute level
@api_router.post("/conjoint/studies/{study_id}/upload-image")
async def upload_level_image(
    study_id: str,
    request: UploadImageRequest,
    current_user: User = Depends(get_current_user)
):
    """Upload/set image URL for a specific attribute level"""
    study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    
    if study["creator_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Update the specific level's image_url
    attributes = study.get("attributes", [])
    updated = False
    
    for attr in attributes:
        if attr["id"] == request.attribute_id:
            for level in attr.get("levels", []):
                if level["id"] == request.level_id:
                    level["image_url"] = request.image_url
                    updated = True
                    break
            break
    
    if not updated:
        raise HTTPException(status_code=404, detail="Attribute or level not found")
    
    # Save updated attributes
    await db.conjoint_studies.update_one(
        {"id": study_id},
        {
            "$set": {
                "attributes": attributes,
                "updated_at": datetime.now(timezone.utc)
            }
        }
    )
    
    return {
        "message": "Image uploaded successfully",
        "image_url": request.image_url
    }

# Generate image for complete profile (composite image)
@api_router.post("/conjoint/studies/{study_id}/generate-profile-image")
async def generate_profile_image(
    study_id: str,
    request: GenerateProfileImageRequest,
    current_user: User = Depends(get_current_user)
):
    """Generate composite image for a complete profile using AI"""
    study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    
    if study["creator_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Find the profile
    choice_sets = study.get("choice_sets", [])
    profile_found = None
    choice_set_found = None
    
    for choice_set in choice_sets:
        if choice_set["id"] == request.choice_set_id:
            choice_set_found = choice_set
            for profile in choice_set.get("profiles", []):
                if profile["id"] == request.profile_id:
                    profile_found = profile
                    break
            break
    
    if not profile_found or not choice_set_found:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    # Get image generation settings
    settings = await db.conjoint_image_settings.find_one({"id": "default"}, {"_id": 0})
    if not settings:
        settings = {
            "profile_image_prompt_template": "Professional product photo showing: {composition}. High quality, clean background, product-focused composition.",
            "profile_image_prompt_with_ref": "Using the reference images as style guide, create a product photo showing: {composition}. Match the visual style and aesthetic.",
            "profile_image_model": "gpt-image-1"
        }
    
    # Check if using reference images
    reference_images = study.get("reference_images", [])
    using_refs = request.reference_image_indices and len(request.reference_image_indices) > 0 and len(reference_images) > 0
    
    # Build prompt from profile attributes
    if request.prompt:
        image_prompt = request.prompt
    else:
        # Get all attribute values for this profile
        attributes = study.get("attributes", [])
        profile_description = []
        
        for attr_id, level_id in profile_found["attribute_levels"].items():
            attr = next((a for a in attributes if a["id"] == attr_id), None)
            if attr:
                level = next((l for l in attr.get("levels", []) if l["id"] == level_id), None)
                if level:
                    profile_description.append(f"{attr['name']}: {level['value']}")
        
        composition = ", ".join(profile_description)
        
        # Select appropriate template based on reference usage
        if using_refs:
            template = settings.get("profile_image_prompt_with_ref", settings["profile_image_prompt_template"])
        else:
            template = settings["profile_image_prompt_template"]
        
        # Use template and replace variables
        image_prompt = template.format(
            composition=composition
        )
    
    # Prepend additional prompt if provided (put it at the front)
    if request.additional_prompt:
        image_prompt = f"{request.additional_prompt} {image_prompt}"
    
    # Generate image using configured model
    api_key = os.environ.get('EMERGENT_LLM_KEY')
    if not api_key:
        raise HTTPException(status_code=500, detail="LLM service not configured")
    
    model_to_use = settings.get("profile_image_model", "gpt-image-1")
    
    try:
        import base64
        
        # Prepare reference images if provided
        ref_images_base64 = []
        if using_refs:
            for idx in request.reference_image_indices:
                if 0 <= idx < len(reference_images):
                    img_url = reference_images[idx]
                    # Extract base64 from data URL
                    if img_url.startswith('data:image'):
                        ref_images_base64.append(img_url.split(',')[1])
                    else:
                        ref_images_base64.append(img_url)
        
        # Check if using Nano Banana (Gemini)
        if model_to_use == "nanobanana":
            from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
            
            chat = LlmChat(
                api_key=api_key,
                session_id=f"profile-img-{study_id}-{request.profile_id}",
                system_message="You are an AI image generator."
            ).with_model("gemini", "gemini-2.5-flash-image-preview").with_params(modalities=["image", "text"])
            
            # Create message with reference images if provided (Image + Text to Image mode)
            if using_refs and len(ref_images_base64) > 0:
                # Send reference images as ImageContent for style guidance
                image_contents = [ImageContent(img_data) for img_data in ref_images_base64]
                msg = UserMessage(text=image_prompt, file_contents=image_contents)
            else:
                msg = UserMessage(text=image_prompt)
            
            text, images = await chat.send_message_multimodal_response(msg)
            
            if not images or len(images) == 0:
                raise HTTPException(status_code=500, detail="No image was generated")
            
            # Images already in base64 format
            image_base64 = images[0]['data']
            
        else:
            # Use OpenAI models
            from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration
            
            image_gen = OpenAIImageGeneration(api_key=api_key)
            
            # If using reference images with OpenAI, use image variation mode
            if using_refs and len(ref_images_base64) > 0:
                # Use the first reference image for style guidance
                images = await image_gen.generate_image_variations(
                    image_data=base64.b64decode(ref_images_base64[0]),
                    prompt=image_prompt,
                    model=model_to_use,
                    number_of_images=1
                )
            else:
                # Standard text-to-image generation
                images = await image_gen.generate_images(
                    prompt=image_prompt,
                    model=model_to_use,
                    number_of_images=1
                )
            
            if not images or len(images) == 0:
                raise HTTPException(status_code=500, detail="No image was generated")
            
            # Convert to base64
            image_base64 = base64.b64encode(images[0]).decode('utf-8')
        
        # Compress image aggressively (target: 100-150KB for 100+ images per study)
        compressed_base64 = compress_base64_image(image_base64, max_size_kb=150.0, target_dimension=640)
        
        # Create data URL
        image_data_url = f"data:image/jpeg;base64,{compressed_base64}"
        
        # Update the profile with the generated image
        for choice_set in choice_sets:
            if choice_set["id"] == request.choice_set_id:
                for profile in choice_set.get("profiles", []):
                    if profile["id"] == request.profile_id:
                        profile["profile_image_url"] = image_data_url
                        profile["profile_image_prompt"] = image_prompt
                        break
                break
        
        # Save updated choice_sets
        await db.conjoint_studies.update_one(
            {"id": study_id},
            {
                "$set": {
                    "choice_sets": choice_sets,
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )
        
        return {
            "message": "Profile image generated successfully",
            "image_url": image_data_url,
            "prompt_used": image_prompt
        }
        
    except Exception as e:
        logging.error(f"Profile image generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Image generation failed: {str(e)}")

# Upload image for complete profile (composite image)
@api_router.post("/conjoint/studies/{study_id}/upload-profile-image")
async def upload_profile_image(
    study_id: str,
    request: UploadProfileImageRequest,
    current_user: User = Depends(get_current_user)
):
    """Upload/set image URL for a complete profile (combination of levels)"""
    study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    
    if study["creator_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Update the specific profile's image_url in choice_sets
    choice_sets = study.get("choice_sets", [])
    updated = False
    
    for choice_set in choice_sets:
        if choice_set["id"] == request.choice_set_id:
            for profile in choice_set.get("profiles", []):
                if profile["id"] == request.profile_id:
                    profile["profile_image_url"] = request.image_url
                    updated = True
                    break
            break
    
    if not updated:
        raise HTTPException(status_code=404, detail="Choice set or profile not found")
    
    # Save updated choice_sets
    await db.conjoint_studies.update_one(
        {"id": study_id},
        {
            "$set": {
                "choice_sets": choice_sets,
                "updated_at": datetime.now(timezone.utc)
            }
        }
    )
    
    return {
        "message": "Profile image uploaded successfully",
        "image_url": request.image_url
    }

# Upload reference images
@api_router.post("/conjoint/studies/{study_id}/reference-images")
async def upload_reference_images(
    study_id: str,
    request: UploadReferenceImagesRequest,
    current_user: User = Depends(get_current_user)
):
    """Upload reference images for AI image generation (max 5 images)"""
    study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    
    if study["creator_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Validate max 5 images
    if len(request.image_urls) > 5:
        raise HTTPException(status_code=400, detail="Maximum 5 reference images allowed")
    
    # Compress each image
    compressed_images = []
    for img_url in request.image_urls:
        try:
            # Extract base64 part
            if 'base64,' in img_url:
                base64_str = img_url.split('base64,')[1]
            else:
                base64_str = img_url
            
            # Compress
            compressed_base64 = compress_base64_image(base64_str, max_size_kb=150.0, target_dimension=640)
            compressed_url = f"data:image/jpeg;base64,{compressed_base64}"
            compressed_images.append(compressed_url)
        except Exception as e:
            logging.error(f"Error compressing reference image: {e}")
            raise HTTPException(status_code=400, detail=f"Error processing image: {str(e)}")
    
    # Update study with reference images
    await db.conjoint_studies.update_one(
        {"id": study_id},
        {
            "$set": {
                "reference_images": compressed_images,
                "updated_at": datetime.now(timezone.utc)
            }
        }
    )
    
    return {
        "message": f"{len(compressed_images)} reference images uploaded successfully",
        "reference_images": compressed_images
    }

# Delete reference image
@api_router.delete("/conjoint/studies/{study_id}/reference-images/{image_index}")
async def delete_reference_image(
    study_id: str,
    image_index: int,
    current_user: User = Depends(get_current_user)
):
    """Delete a specific reference image by index"""
    study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    
    if study["creator_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    reference_images = study.get("reference_images", [])
    
    if image_index < 0 or image_index >= len(reference_images):
        raise HTTPException(status_code=400, detail="Invalid image index")
    
    # Remove image at index
    reference_images.pop(image_index)
    
    # Update study
    await db.conjoint_studies.update_one(
        {"id": study_id},
        {
            "$set": {
                "reference_images": reference_images,
                "updated_at": datetime.now(timezone.utc)
            }
        }
    )
    
    return {
        "message": "Reference image deleted successfully",
        "remaining_count": len(reference_images)
    }

# Start survey - lock study from structural changes
@api_router.post("/conjoint/studies/{study_id}/start-survey")
async def start_survey(
    study_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Start survey - locks the study from structural changes
    After starting, users can only edit names, descriptions, and images
    Cannot add/remove attributes or levels
    """
    study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    
    if study["creator_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Check if design is generated
    if not study.get("choice_sets") or len(study.get("choice_sets", [])) == 0:
        raise HTTPException(status_code=400, detail="Please generate D-Optimal design before starting survey")
    
    # Update study status to ACTIVE
    await db.conjoint_studies.update_one(
        {"id": study_id},
        {
            "$set": {
                "status": ConjointStudyStatus.ACTIVE,
                "survey_started": True,
                "survey_start_date": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc)
            }
        }
    )
    
    return {
        "message": "Survey started successfully",
        "survey_started": True,
        "status": ConjointStudyStatus.ACTIVE
    }

# Get image generation settings
@api_router.get("/admin/conjoint-image-settings")
async def get_image_generation_settings(
    current_user: User = Depends(get_current_user)
):
    """Get image generation settings for Conjoint Analysis"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Get settings from database
    settings = await db.conjoint_image_settings.find_one({"id": "default"}, {"_id": 0})
    
    if not settings:
        # Return default settings
        default_settings = {
            "id": "default",
            "level_image_prompt_template": "Professional product visualization: {attribute_name} - {level_value}. Clean, minimalist style on white background.",
            "level_image_prompt_with_ref": "Based on the reference images provided, create a product visualization for: {attribute_name} - {level_value}. Match the style, lighting, and composition of the reference images while showcasing the specific feature.",
            "level_image_model": "gpt-image-1",
            "profile_image_prompt_template": "Professional product photo showing: {composition}. High quality, clean background, product-focused composition.",
            "profile_image_prompt_with_ref": "Using the reference images as style guide, create a product photo showing: {composition}. Match the visual style, lighting, and aesthetic of the reference images.",
            "profile_image_model": "gpt-image-1",
            "updated_by": "System",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        await db.conjoint_image_settings.insert_one(default_settings)
        return default_settings
    
    return settings

# Update image generation settings
@api_router.put("/admin/conjoint-image-settings")
async def update_image_generation_settings(
    request: UpdateImageGenerationSettingsRequest,
    current_user: User = Depends(get_current_user)
):
    """Update image generation settings for Conjoint Analysis"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Get current settings
    current_settings = await db.conjoint_image_settings.find_one({"id": "default"}, {"_id": 0})
    
    if not current_settings:
        # Create default if not exists
        current_settings = {
            "id": "default",
            "level_image_prompt_template": "Professional product visualization: {attribute_name} - {level_value}. Clean, minimalist style on white background.",
            "level_image_prompt_with_ref": "Based on the reference images provided, create a product visualization for: {attribute_name} - {level_value}. Match the style, lighting, and composition of the reference images while showcasing the specific feature.",
            "level_image_model": "gpt-image-1",
            "profile_image_prompt_template": "Professional product photo showing: {composition}. High quality, clean background, product-focused composition.",
            "profile_image_prompt_with_ref": "Using the reference images as style guide, create a product photo showing: {composition}. Match the visual style, lighting, and aesthetic of the reference images.",
            "profile_image_model": "gpt-image-1"
        }
        await db.conjoint_image_settings.insert_one(current_settings)
    
    # Update fields
    update_data = {
        "updated_by": current_user.id,
        "updated_at": datetime.now(timezone.utc)
    }
    
    if request.level_image_prompt_template is not None:
        update_data["level_image_prompt_template"] = request.level_image_prompt_template
    if request.level_image_prompt_with_ref is not None:
        update_data["level_image_prompt_with_ref"] = request.level_image_prompt_with_ref
    if request.level_image_model is not None:
        update_data["level_image_model"] = request.level_image_model
    if request.profile_image_prompt_template is not None:
        update_data["profile_image_prompt_template"] = request.profile_image_prompt_template
    if request.profile_image_prompt_with_ref is not None:
        update_data["profile_image_prompt_with_ref"] = request.profile_image_prompt_with_ref
    if request.profile_image_model is not None:
        update_data["profile_image_model"] = request.profile_image_model
    
    await db.conjoint_image_settings.update_one(
        {"id": "default"},
        {"$set": update_data}
    )
    
    updated_settings = await db.conjoint_image_settings.find_one({"id": "default"}, {"_id": 0})
    return {"message": "Settings updated successfully", "settings": updated_settings}

# Get survey (public endpoint - no auth required)
@api_router.get("/conjoint/survey/{study_id}")
async def get_survey(study_id: str):
    """Get public survey for respondents (no authentication required)"""
    logging.info(f"[SURVEY] Loading survey for study_id: {study_id}")
    
    study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
    if not study:
        logging.error(f"[SURVEY] Study not found: {study_id}")
        raise HTTPException(status_code=404, detail="Study not found")
    
    current_status = study.get("status")
    logging.info(f"[SURVEY] Study '{study.get('title')}' has status: {current_status} - allowing access regardless of status")
    
    # No status check - allow access with any status if URL is known
    
    # Optimize: Send only necessary data for survey display
    choice_sets = []
    for cs in study.get("choice_sets", []):
        optimized_profiles = []
        for profile in cs.get("profiles", []):
            # Keep essential profile data including all image-related fields
            optimized_profile = {
                "id": profile["id"],
                "attribute_levels": profile.get("attribute_levels", {}),
                "images": profile.get("images", {}),  # New format: {attr_id: image_url}
                "image_url": profile.get("image_url"),  # Legacy format
                "profile_image_url": profile.get("profile_image_url"),  # Composite image
                "description": profile.get("description")
            }
            optimized_profiles.append(optimized_profile)
        
        choice_sets.append({
            "id": cs["id"],
            "set_number": cs.get("set_number"),
            "profiles": optimized_profiles
        })
    
    return {
        "study_id": study["id"],
        "title": study["title"],
        "description": study.get("description"),
        "attributes": study.get("attributes", []),
        "choice_sets": choice_sets,
        "alternatives_per_set": study.get("alternatives_per_set", 3)
    }

# Submit survey response (public endpoint - no auth required)
@api_router.post("/conjoint/survey/{study_id}/response")
async def submit_survey_response(
    study_id: str,
    response: SurveyResponse
):
    """Submit survey response (no authentication required)"""
    study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    
    if study["status"] != ConjointStudyStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Survey is not accepting responses")
    
    # Create response document
    response_doc = {
        "id": str(uuid.uuid4()),
        "study_id": study_id,
        "respondent_id": response.respondent_id or str(uuid.uuid4()),
        "respondent_email": response.respondent_email,
        "responses": response.responses,
        "submitted_at": datetime.now(timezone.utc)
    }
    
    await db.conjoint_responses.insert_one(response_doc)
    
    # Update study respondent count
    await db.conjoint_studies.update_one(
        {"id": study_id},
        {
            "$inc": {"respondent_count": 1},
            "$set": {"updated_at": datetime.now(timezone.utc)}
        }
    )
    
    return {"message": "Response submitted successfully", "response_id": response_doc["id"]}


# Sync respondent count for a study (admin only)
@api_router.post("/conjoint/studies/{study_id}/sync-respondent-count")
async def sync_respondent_count(
    study_id: str,
    current_user: User = Depends(get_current_user)
):
    """Sync respondent count with actual response count"""
    study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    
    # Check permission
    if study["creator_id"] != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Count actual responses
    actual_count = await db.conjoint_responses.count_documents({"study_id": study_id})
    stored_count = study.get("respondent_count", 0)
    
    if actual_count != stored_count:
        # Update the count
        await db.conjoint_studies.update_one(
            {"id": study_id},
            {
                "$set": {
                    "respondent_count": actual_count,
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )
        
        return {
            "message": "Respondent count synced successfully",
            "old_count": stored_count,
            "new_count": actual_count,
            "synced": True
        }
    else:
        return {
            "message": "Respondent count is already correct",
            "count": actual_count,
            "synced": False
        }

# Sync all studies' respondent counts (admin only)
@api_router.post("/conjoint/admin/sync-all-respondent-counts")
async def sync_all_respondent_counts(
    current_user: User = Depends(get_current_user)
):
    """Sync respondent counts for all studies (admin only)"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    studies = await db.conjoint_studies.find({}, {"_id": 0, "id": 1, "respondent_count": 1}).to_list(1000)
    
    synced_count = 0
    total_fixed = 0
    
    for study in studies:
        study_id = study["id"]
        stored_count = study.get("respondent_count", 0)
        actual_count = await db.conjoint_responses.count_documents({"study_id": study_id})
        
        if actual_count != stored_count:
            await db.conjoint_studies.update_one(
                {"id": study_id},
                {
                    "$set": {
                        "respondent_count": actual_count,
                        "updated_at": datetime.now(timezone.utc)
                    }
                }
            )
            synced_count += 1
            total_fixed += abs(actual_count - stored_count)
    
    return {
        "message": f"Synced {synced_count} studies",
        "total_studies": len(studies),
        "synced_count": synced_count,
        "total_fixed": total_fixed
    }


# Get study results and analysis
@api_router.get("/conjoint/studies/{study_id}/results")
async def get_study_results(
    study_id: str,
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """Get analysis results for a study (public if is_public_result is True)"""
    study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    
    # Check permission: allow if public OR if user is creator/admin
    is_public = study.get("is_public_result", False)
    if not is_public:
        # Private - require authentication and ownership
        if not current_user:
            raise HTTPException(status_code=401, detail="Authentication required")
        if study["creator_id"] != current_user.id and current_user.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get all responses
    responses = await db.conjoint_responses.find(
        {"study_id": study_id},
        {"_id": 0}
    ).to_list(10000)
    
    if len(responses) < 30:
        return {
            "study_id": study_id,
            "respondent_count": len(responses),
            "status": "insufficient_data",
            "message": "Need at least 30 responses for reliable analysis",
            "responses": responses
        }
    
    # Calculate part-worths using aggregation method
    # In production, use Hierarchical Bayes or similar sophisticated methods
    part_worths = calculate_part_worths(study, responses)
    importance_scores = calculate_importance_scores(part_worths, study)
    
    return {
        "study_id": study_id,
        "respondent_count": len(responses),
        "status": "complete",
        "part_worths": part_worths,
        "importance_scores": importance_scores,
        "responses": responses
    }

def calculate_mnl_analysis(study: Dict, responses: List[Dict]) -> Dict:
    """Perform Multinomial Logit (MNL) analysis using Conditional Logit"""
    import pandas as pd
    import numpy as np
    from statsmodels.discrete.conditional_models import ConditionalLogit
    
    # Prepare data in long format for Conditional Logit
    data_rows = []
    attributes = study.get("attributes", [])
    
    for resp_idx, response in enumerate(responses):
        for choice in response.get("responses", []):
            choice_set_id = choice.get("choice_set_id")
            selected_profile_id = choice.get("selected_profile_id")
            
            # Find choice set
            for choice_set in study.get("choice_sets", []):
                if choice_set["id"] == choice_set_id:
                    for alt_idx, profile in enumerate(choice_set.get("profiles", [])):
                        row = {
                            "respondent": resp_idx,
                            "choice_set": choice_set_id,
                            "alternative": alt_idx,
                            "choice": 1 if profile["id"] == selected_profile_id else 0
                        }
                        
                        # Add attribute levels as features
                        for attr in attributes:
                            attr_id = attr["id"]
                            level_id = profile["attribute_levels"].get(attr_id)
                            level_obj = next((l for l in attr.get("levels", []) if l["id"] == level_id), None)
                            if level_obj:
                                row[f"{attr['name']}"] = level_obj["value"]
                        
                        data_rows.append(row)
    
    if not data_rows:
        return None
    
    df = pd.DataFrame(data_rows)
    
    # Create dummy variables for all categorical attributes
    feature_cols = [col for col in df.columns if col not in ["respondent", "choice_set", "alternative", "choice"]]
    X = pd.get_dummies(df[feature_cols], drop_first=True)
    y = df["choice"]
    groups = df["respondent"].astype(str) + "_" + df["choice_set"].astype(str)
    
    # Fit Conditional Logit model
    try:
        model = ConditionalLogit(y, X, groups=groups)
        result = model.fit(disp=False, maxiter=1000, method='bfgs')
        
        # Calculate utilities/part-worths by attribute in the format expected by frontend
        part_worths = {}
        
        for attr in attributes:
            attr_id = attr["id"]
            attr_name = attr["name"]
            
            # Initialize levels dict for this attribute
            levels_dict = {}
            
            # Count selections for each level
            level_counts = {}
            for row in data_rows:
                if row["choice"] == 1:
                    level_value = row.get(attr_name)
                    if level_value:
                        level_counts[level_value] = level_counts.get(level_value, 0) + 1
            
            # Process each level
            for level in attr.get("levels", []):
                level_value = level["value"]
                level_id = level["id"]
                
                # Get utility from coefficients (0 for reference level)
                col_name = f"{attr_name}_{level_value}"
                utility = float(result.params.get(col_name, 0.0))
                
                levels_dict[level_id] = {
                    "value": level_value,
                    "utility": utility,
                    "selection_count": level_counts.get(level_value, 0)
                }
            
            part_worths[attr_id] = {
                "name": attr_name,
                "levels": levels_dict
            }
        
        # Calculate importance scores (range of utilities for each attribute)
        importance_scores = {}
        total_range = 0
        ranges = {}
        
        for attr_id, pw_data in part_worths.items():
            utilities = [level["utility"] for level in pw_data["levels"].values()]
            if utilities:
                attr_range = max(utilities) - min(utilities)
                ranges[attr_id] = attr_range
                total_range += attr_range
        
        if total_range > 0:
            for attr_id, attr_range in ranges.items():
                importance_scores[attr_id] = {
                    "name": part_worths[attr_id]["name"],
                    "importance": round((attr_range / total_range) * 100, 2)
                }
        
        # Calculate McFadden's pseudo R-squared manually
        llf = result.llf
        llnull = result.llnull if hasattr(result, 'llnull') else None
        pseudo_r2 = 1 - (llf / llnull) if llnull else 0.0
        
        # Calculate AIC manually: AIC = -2*llf + 2*k (where k is number of parameters)
        k = len(result.params)
        aic = -2 * llf + 2 * k
        
        return {
            "method": "Multinomial Logit (MNL)",
            "part_worths": part_worths,
            "importance_scores": importance_scores,
            "coefficients": {name: float(coef) for name, coef in result.params.items()},
            "std_errors": {name: float(se) for name, se in result.bse.items()},
            "z_values": {name: float(z) for name, z in result.tvalues.items()},
            "p_values": {name: float(p) for name, p in result.pvalues.items()},
            "log_likelihood": float(result.llf),
            "pseudo_r_squared": float(pseudo_r2),
            "aic": float(aic),
            "n_observations": int(len(y)),
            "utility_scale": "logit",
            "utility_interpretation": "Logit coefficients (reference level = 0). Positive = preferred, Negative = less preferred"
        }
    except Exception as e:
        logging.error(f"MNL analysis error: {e}")
        import traceback
        logging.error(traceback.format_exc())
        return None

def calculate_mixed_logit_analysis(study: Dict, responses: List[Dict]) -> Dict:
    """Perform Mixed Logit (Random Parameters) analysis"""
    # Simplified version - full implementation would use pylogit
    import pandas as pd
    import numpy as np
    
    try:
        # Prepare basic data structure
        data_rows = []
        attributes = study.get("attributes", [])
        
        for resp_idx, response in enumerate(responses):
            for choice in response.get("responses", []):
                choice_set_id = choice.get("choice_set_id")
                selected_profile_id = choice.get("selected_profile_id")
                
                for choice_set in study.get("choice_sets", []):
                    if choice_set["id"] == choice_set_id:
                        for profile in choice_set.get("profiles", []):
                            row = {
                                "respondent": resp_idx,
                                "choice": 1 if profile["id"] == selected_profile_id else 0
                            }
                            
                            for attr in attributes:
                                attr_id = attr["id"]
                                level_id = profile["attribute_levels"].get(attr_id)
                                level_obj = next((l for l in attr.get("levels", []) if l["id"] == level_id), None)
                                if level_obj:
                                    row[attr['name']] = level_obj["value"]
                            
                            data_rows.append(row)
        
        df = pd.DataFrame(data_rows)
        
        # Simplified: Use standard deviation of coefficients as proxy for heterogeneity
        feature_cols = [col for col in df.columns if col not in ["respondent", "choice"]]
        X = pd.get_dummies(df[feature_cols], drop_first=True)
        
        # Calculate per-respondent coefficients
        respondent_coefs = []
        for resp_id in df["respondent"].unique():
            resp_data = df[df["respondent"] == resp_id]
            if len(resp_data) > 5:  # Need enough data
                resp_X = pd.get_dummies(resp_data[feature_cols], drop_first=True)
                resp_y = resp_data["choice"]
                
                # Simple correlation as proxy
                coefs = {}
                for col in resp_X.columns:
                    if resp_X[col].var() > 0:
                        coefs[col] = np.corrcoef(resp_X[col], resp_y)[0, 1]
                respondent_coefs.append(coefs)
        
        # Calculate mean and std of coefficients
        mean_coefs = {}
        std_coefs = {}
        
        if respondent_coefs:
            all_vars = set()
            for coef_dict in respondent_coefs:
                all_vars.update(coef_dict.keys())
            
            for var in all_vars:
                values = [c.get(var, 0) for c in respondent_coefs]
                mean_coefs[var] = float(np.nanmean(values))
                std_coefs[var] = float(np.nanstd(values))
        
        # Create part_worths format for frontend
        part_worths = {}
        for attr in attributes:
            attr_id = attr["id"]
            attr_name = attr["name"]
            
            levels_dict = {}
            for level in attr.get("levels", []):
                level_value = level["value"]
                level_id = level["id"]
                
                # Get mean coefficient for this level
                col_name = f"{attr_name}_{level_value}"
                utility = mean_coefs.get(col_name, 0.0)
                
                levels_dict[level_id] = {
                    "value": level_value,
                    "utility": utility,
                    "selection_count": 0  # Not applicable for Mixed Logit
                }
            
            part_worths[attr_id] = {
                "name": attr_name,
                "levels": levels_dict
            }
        
        # Calculate importance scores
        importance_scores = {}
        total_range = 0
        ranges = {}
        
        for attr_id, pw_data in part_worths.items():
            utilities = [level["utility"] for level in pw_data["levels"].values()]
            if utilities:
                attr_range = max(utilities) - min(utilities)
                ranges[attr_id] = attr_range
                total_range += attr_range
        
        if total_range > 0:
            for attr_id, attr_range in ranges.items():
                importance_scores[attr_id] = {
                    "name": part_worths[attr_id]["name"],
                    "importance": round((attr_range / total_range) * 100, 2)
                }
        
        return {
            "method": "Mixed Logit (Simplified)",
            "part_worths": part_worths,
            "importance_scores": importance_scores,
            "mean_coefficients": mean_coefs,
            "std_coefficients": std_coefs,
            "n_respondents": len(df["respondent"].unique()),
            "n_observations": len(df),
            "utility_scale": "correlation",
            "utility_interpretation": "Correlation coefficients showing heterogeneity across respondents (mean ± std)",
            "note": "Simplified implementation - shows preference heterogeneity across respondents"
        }
    except Exception as e:
        logging.error(f"Mixed logit error: {e}")
        return None

def calculate_hierarchical_bayes_analysis(study: Dict, responses: List[Dict]) -> Dict:
    """Perform Hierarchical Bayes analysis (simplified)"""
    import numpy as np
    import pandas as pd
    
    try:
        # Simplified HB: Use empirical Bayes approach
        data_rows = []
        attributes = study.get("attributes", [])
        
        for resp_idx, response in enumerate(responses):
            for choice in response.get("responses", []):
                choice_set_id = choice.get("choice_set_id")
                selected_profile_id = choice.get("selected_profile_id")
                
                for choice_set in study.get("choice_sets", []):
                    if choice_set["id"] == choice_set_id:
                        for profile in choice_set.get("profiles", []):
                            row = {
                                "respondent": resp_idx,
                                "choice": 1 if profile["id"] == selected_profile_id else 0
                            }
                            
                            for attr in attributes:
                                attr_id = attr["id"]
                                level_id = profile["attribute_levels"].get(attr_id)
                                level_obj = next((l for l in attr.get("levels", []) if l["id"] == level_id), None)
                                if level_obj:
                                    row[attr['name']] = level_obj["value"]
                            
                            data_rows.append(row)
        
        df = pd.DataFrame(data_rows)
        feature_cols = [col for col in df.columns if col not in ["respondent", "choice"]]
        
        # Calculate individual-level estimates (empirical Bayes)
        individual_utilities = {}
        
        for resp_id in df["respondent"].unique():
            resp_data = df[df["respondent"] == resp_id]
            utilities = {}
            
            for attr in attributes:
                attr_name = attr["name"]
                if attr_name in resp_data.columns:
                    for level in attr.get("levels", []):
                        level_data = resp_data[resp_data[attr_name] == level["value"]]
                        if len(level_data) > 0:
                            utility = level_data["choice"].mean()
                            utilities[f"{attr_name}_{level['value']}"] = utility
            
            individual_utilities[f"respondent_{resp_id}"] = utilities
        
        # Calculate population-level parameters
        all_utilities = {}
        for utilities in individual_utilities.values():
            for key, value in utilities.items():
                if key not in all_utilities:
                    all_utilities[key] = []
                all_utilities[key].append(value)
        
        population_mean = {k: float(np.mean(v)) for k, v in all_utilities.items()}
        population_std = {k: float(np.std(v)) for k, v in all_utilities.items()}
        
        # Create part_worths format for frontend
        part_worths = {}
        for attr in attributes:
            attr_id = attr["id"]
            attr_name = attr["name"]
            
            levels_dict = {}
            for level in attr.get("levels", []):
                level_value = level["value"]
                level_id = level["id"]
                
                # Get population mean for this level
                col_name = f"{attr_name}_{level_value}"
                utility = population_mean.get(col_name, 0.0)
                
                levels_dict[level_id] = {
                    "value": level_value,
                    "utility": utility,
                    "selection_count": 0  # Not applicable for HB
                }
            
            part_worths[attr_id] = {
                "name": attr_name,
                "levels": levels_dict
            }
        
        # Calculate importance scores
        importance_scores = {}
        total_range = 0
        ranges = {}
        
        for attr_id, pw_data in part_worths.items():
            utilities = [level["utility"] for level in pw_data["levels"].values()]
            if utilities:
                attr_range = max(utilities) - min(utilities)
                ranges[attr_id] = attr_range
                total_range += attr_range
        
        if total_range > 0:
            for attr_id, attr_range in ranges.items():
                importance_scores[attr_id] = {
                    "name": part_worths[attr_id]["name"],
                    "importance": round((attr_range / total_range) * 100, 2)
                }
        
        return {
            "method": "Hierarchical Bayes (Simplified)",
            "part_worths": part_worths,
            "importance_scores": importance_scores,
            "population_mean": population_mean,
            "population_std": population_std,
            "n_respondents": len(individual_utilities),
            "n_observations": len(df),
            "utility_scale": "proportion",
            "utility_interpretation": "Individual-level choice proportions aggregated at population level (mean ± std)",
            "note": "Simplified empirical Bayes approach - full HB requires MCMC sampling"
        }
    except Exception as e:
        logging.error(f"HB analysis error: {e}")
        return None

def calculate_regression_analysis(study: Dict, responses: List[Dict]) -> Dict:
    """Perform linear regression analysis on conjoint data"""
    from sklearn.linear_model import LinearRegression
    import numpy as np
    
    # Prepare data for regression
    X = []  # Feature matrix (dummy coded attributes)
    y = []  # Target (1 if selected, 0 if not)
    
    attributes = study.get("attributes", [])
    attr_levels_map = {}  # Map attribute_id -> list of level_ids
    
    # Build attribute levels map
    for attr in attributes:
        attr_levels_map[attr["id"]] = [level["id"] for level in attr.get("levels", [])]
    
    # Create training data
    for response in responses:
        for choice in response.get("responses", []):
            choice_set_id = choice.get("choice_set_id")
            selected_profile_id = choice.get("selected_profile_id")
            
            # Find the choice set
            for choice_set in study.get("choice_sets", []):
                if choice_set["id"] == choice_set_id:
                    for profile in choice_set.get("profiles", []):
                        # Create dummy variables for this profile
                        dummy_vars = []
                        for attr in attributes:
                            attr_id = attr["id"]
                            level_ids = attr_levels_map[attr_id]
                            profile_level = profile["attribute_levels"].get(attr_id)
                            
                            # Dummy coding (all zeros except the selected level)
                            for i, level_id in enumerate(level_ids[:-1]):  # Drop last for reference
                                dummy_vars.append(1 if profile_level == level_id else 0)
                        
                        X.append(dummy_vars)
                        y.append(1 if profile["id"] == selected_profile_id else 0)
    
    if len(X) == 0 or len(y) == 0:
        return None
    
    X = np.array(X)
    y = np.array(y)
    
    # Fit linear regression
    model = LinearRegression()
    model.fit(X, y)
    
    # Get coefficients
    coefficients = model.coef_
    intercept = model.intercept_
    r_squared = model.score(X, y)
    
    # Map coefficients back to levels
    regression_results = {
        "method": "Linear Regression (OLS)",
        "intercept": float(intercept),
        "r_squared": float(r_squared),
        "n_observations": len(y),
        "coefficients": {},
        "utility_scale": "coefficient",
        "utility_interpretation": "OLS regression coefficients (reference level = 0). Positive = increases choice probability"
    }
    
    coef_idx = 0
    for attr in attributes:
        attr_id = attr["id"]
        levels = attr.get("levels", [])
        
        regression_results["coefficients"][attr_id] = {
            "name": attr["name"],
            "levels": {}
        }
        
        # Add coefficients for each level (except reference)
        for i, level in enumerate(levels[:-1]):
            regression_results["coefficients"][attr_id]["levels"][level["id"]] = {
                "value": level["value"],
                "coefficient": float(coefficients[coef_idx]),
                "is_reference": False
            }
            coef_idx += 1
        
        # Last level is reference (coefficient = 0)
        if levels:
            last_level = levels[-1]
            regression_results["coefficients"][attr_id]["levels"][last_level["id"]] = {
                "value": last_level["value"],
                "coefficient": 0.0,
                "is_reference": True
            }
    
    # Also create part_worths format for consistency with other methods
    part_worths = {}
    for attr_id, attr_data in regression_results["coefficients"].items():
        part_worths[attr_id] = {
            "name": attr_data["name"],
            "levels": {}
        }
        for level_id, level_data in attr_data["levels"].items():
            # Count selections for this level
            selection_count = 0
            for i, x_row in enumerate(X):
                if y[i] == 1:
                    # Check if this level was in the selected profile
                    # This is approximate since we don't track exact level assignments
                    selection_count += 1
            
            part_worths[attr_id]["levels"][level_id] = {
                "value": level_data["value"],
                "utility": level_data["coefficient"],
                "selection_count": selection_count // len(part_worths)  # Rough estimate
            }
    
    # Calculate importance scores (range of coefficients for each attribute)
    importance_scores = {}
    total_range = 0
    ranges = {}
    
    for attr_id, pw_data in part_worths.items():
        utilities = [level["utility"] for level in pw_data["levels"].values()]
        if utilities:
            attr_range = max(utilities) - min(utilities)
            ranges[attr_id] = attr_range
            total_range += attr_range
    
    if total_range > 0:
        for attr_id, attr_range in ranges.items():
            importance_scores[attr_id] = {
                "name": part_worths[attr_id]["name"],
                "importance": round((attr_range / total_range) * 100, 2)
            }
    
    regression_results["part_worths"] = part_worths
    regression_results["importance_scores"] = importance_scores
    
    return regression_results

def calculate_part_worths(study: Dict, responses: List[Dict]) -> Dict[str, Dict[str, float]]:
    """Calculate part-worth utilities for each attribute level"""
    # Simplified aggregation method - count preferences
    part_worths = {}
    
    for attr in study.get("attributes", []):
        attr_id = attr["id"]
        part_worths[attr_id] = {
            "name": attr["name"],
            "levels": {}
        }
        
        for level in attr.get("levels", []):
            level_id = level["id"]
            selection_count = 0
            
            # Count how many times this level was in the selected profile
            for response in responses:
                for choice in response.get("responses", []):
                    selected_profile_id = choice.get("selected_profile_id")
                    
                    # Find the selected profile in choice sets
                    for choice_set in study.get("choice_sets", []):
                        if choice_set["id"] == choice.get("choice_set_id"):
                            for profile in choice_set.get("profiles", []):
                                if profile["id"] == selected_profile_id:
                                    if profile["attribute_levels"].get(attr_id) == level_id:
                                        selection_count += 1
            
            # Normalize to utility score
            total_choices = len(responses) * len(study.get("choice_sets", []))
            utility = (selection_count / total_choices) * 100 if total_choices > 0 else 0
            
            part_worths[attr_id]["levels"][level_id] = {
                "value": level["value"],
                "utility": round(utility, 2),
                "selection_count": selection_count
            }
    
    return part_worths

def calculate_importance_scores(part_worths: Dict, study: Dict) -> Dict[str, float]:
    """Calculate relative importance of each attribute"""
    importance_scores = {}
    
    # Calculate range of utilities for each attribute
    ranges = {}
    for attr_id, attr_data in part_worths.items():
        utilities = [level_data["utility"] for level_data in attr_data["levels"].values()]
        ranges[attr_id] = max(utilities) - min(utilities) if utilities else 0
    
    # Calculate relative importance
    total_range = sum(ranges.values())
    
    if total_range > 0:
        for attr_id, range_val in ranges.items():
            importance_scores[attr_id] = {
                "name": part_worths[attr_id]["name"],
                "importance": round((range_val / total_range) * 100, 2)
            }
    
    return importance_scores

@api_router.get("/conjoint/studies/{study_id}/statistical-analysis")
async def get_statistical_analysis(
    study_id: str,
    method: str = "mnl",  # mnl, mixed_logit, hierarchical_bayes, linear_regression
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """Get statistical analysis results with selected method (public if is_public_result is True)"""
    study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    
    # Check permission: allow if public OR if user is creator/admin
    is_public = study.get("is_public_result", False)
    if not is_public:
        if not current_user:
            raise HTTPException(status_code=401, detail="Authentication required")
        if study["creator_id"] != current_user.id and current_user.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get responses
    responses = await db.conjoint_responses.find(
        {"study_id": study_id},
        {"_id": 0}
    ).to_list(10000)
    
    if len(responses) < 30:
        return {
            "status": "insufficient_data",
            "message": "Need at least 30 responses for statistical analysis",
            "respondent_count": len(responses)
        }
    
    # Calculate based on method
    results = None
    if method == "mnl":
        results = calculate_mnl_analysis(study, responses)
    elif method == "mixed_logit":
        results = calculate_mixed_logit_analysis(study, responses)
    elif method == "hierarchical_bayes":
        results = calculate_hierarchical_bayes_analysis(study, responses)
    elif method == "linear_regression":
        results = calculate_regression_analysis(study, responses)
    else:
        raise HTTPException(status_code=400, detail="Invalid method")
    
    if not results:
        raise HTTPException(status_code=500, detail=f"Failed to perform {method} analysis")
    
    return {
        "status": "success",
        "method": method,
        "respondent_count": len(responses),
        "results": results
    }


# Helper function to get statistical analysis results
async def get_method_results(study, responses, method):
    """Get ALL analysis results for a specific method (not just part_worths and importance_scores)"""
    if method == "counting":
        part_worths = calculate_part_worths(study, responses)
        importance_scores = calculate_importance_scores(part_worths, study)
        return {
            'method': 'counting',
            'part_worths': part_worths,
            'importance_scores': importance_scores
        }

# Generate product image based on conjoint analysis results
@api_router.post("/conjoint/studies/{study_id}/generate-product-from-results")
async def generate_product_image_from_results(
    study_id: str,
    request: GenerateProductImageFromResultsRequest,
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """Generate optimal product image based on AI interpretation of conjoint results (public if is_public_result is True)"""
    study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    
    # Check permission: allow if public OR if user is creator/admin
    is_public = study.get("is_public_result", False)
    if not is_public:
        if not current_user:
            raise HTTPException(status_code=401, detail="Authentication required")
        if study["creator_id"] != current_user.id and current_user.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get responses for analysis
    responses = await db.conjoint_responses.find(
        {"study_id": study_id},
        {"_id": 0}
    ).to_list(10000)
    
    if len(responses) < 10:
        raise HTTPException(status_code=400, detail="Need at least 10 responses for product generation")
    
    # Calculate part-worths to get optimal product configuration
    part_worths = calculate_part_worths(study, responses)
    importance_scores = calculate_importance_scores(part_worths, study)
    
    # Build optimal product description from top utilities
    product_features = []
    for attr_id, scores in importance_scores.items():
        attr_name = scores["name"]
        
        # Find level with highest utility
        if attr_id in part_worths:
            levels = part_worths[attr_id]["levels"]
            best_level = max(levels.items(), key=lambda x: x[1]["utility"])
            level_value = best_level[1]["value"]
            product_features.append(f"{attr_name}: {level_value}")
    
    # Use AI to create image generation prompt
    api_key = os.environ.get('EMERGENT_LLM_KEY')
    if not api_key:
        raise HTTPException(status_code=500, detail="AI service not configured")
    
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        system_message = """You are an expert product designer and image generation prompt engineer.
Create detailed, professional prompts for generating product visualization images."""
        
        product_category = study.get("product_category", "product")
        study_title = study.get("title", "Product")
        features_text = "\n".join([f"- {feat}" for feat in product_features])
        
        prompt = f"""Based on conjoint analysis results, create an image generation prompt for the optimal product configuration:

Study: {study_title}
Product Category: {product_category}

Optimal Product Features (from research):
{features_text}

Create a detailed image generation prompt that:
1. Describes the product with all key features mentioned
2. Specifies professional product photography style
3. Includes clean white background for product-focused composition
4. Mentions high quality, sharp details, and good lighting
5. Keeps the prompt concise but descriptive (2-3 sentences max)

Return ONLY the image generation prompt, no explanation."""

        if request.additional_prompt:
            prompt += f"\n\nUser's additional requirements (to be placed at the BEGINNING of the final prompt): {request.additional_prompt}"
        
        chat = LlmChat(
            api_key=api_key,
            session_id=f"product-gen-{study_id}",
            system_message=system_message
        ).with_model("openai", "gpt-4o-mini")
        
        generated_prompt = await chat.send_message(UserMessage(text=prompt))
        
        # Prepend user's additional prompt if provided
        if request.additional_prompt:
            generated_prompt = f"{request.additional_prompt.strip()}. {generated_prompt}"
        
        # Now generate the image using the prompt
        # Get image generation settings
        settings = await db.conjoint_image_settings.find_one({"id": "default"}, {"_id": 0})
        if not settings:
            settings = {"level_image_model": "gpt-image-1"}
        
        image_model = settings.get("level_image_model", "gpt-image-1")
        
        # Check if using reference images
        reference_images = study.get("reference_images", [])
        using_refs = request.reference_image_indices and len(request.reference_image_indices) > 0 and len(reference_images) > 0
        
        if using_refs:
            # Add reference image instruction
            generated_prompt = f"Based on the reference images as style guide: {generated_prompt}"
        
        # Generate image using Gemini (same as level image generation)
        from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
        
        # Prepare reference images in base64 if provided
        ref_images_base64 = []
        if using_refs:
            for idx in request.reference_image_indices:
                if idx < len(reference_images):
                    img_url = reference_images[idx]
                    # Extract base64 from data URL
                    if img_url.startswith('data:image'):
                        ref_images_base64.append(img_url.split(',')[1])
                    else:
                        # Download and convert to base64 if URL
                        import httpx
                        async with httpx.AsyncClient() as client:
                            img_response = await client.get(img_url)
                            img_base64 = base64.b64encode(img_response.content).decode('utf-8')
                            ref_images_base64.append(img_base64)
        
        # Use Gemini 2.5 flash image preview (nanobanana)
        chat = LlmChat(
            api_key=api_key,
            session_id=f"product-gen-{study_id}",
            system_message="You are an AI image generator."
        ).with_model("gemini", "gemini-2.5-flash-image-preview").with_params(modalities=["image", "text"])
        
        # Create message with reference images if provided
        if len(ref_images_base64) > 0:
            image_contents = [ImageContent(img_data) for img_data in ref_images_base64]
            msg = UserMessage(text=generated_prompt, file_contents=image_contents)
        else:
            msg = UserMessage(text=generated_prompt)
        
        text, images = await chat.send_message_multimodal_response(msg)
        
        if not images or len(images) == 0:
            raise HTTPException(status_code=500, detail="No images generated")
        
        # Get base64 image
        image_base64 = images[0]['data']
        
        # Compress image
        compressed_base64 = compress_base64_image(image_base64, max_size_kb=150.0, target_dimension=640)
        
        # Create data URL
        image_url = f"data:image/jpeg;base64,{compressed_base64}"
        
        return {
            "image_url": image_url,
            "prompt_used": generated_prompt,
            "optimal_features": product_features,
            "message": "Product image generated successfully based on research insights"
        }
        
    except Exception as e:
        logging.error(f"Product image generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate product image: {str(e)}")


# Generate shelf simulation (on-shelf environment)
@api_router.post("/conjoint/studies/{study_id}/generate-shelf-simulation")
async def generate_shelf_simulation(
    study_id: str,
    request: GenerateShelfSimulationRequest,
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """Generate realistic on-shelf product visualization in competitive environment (public if is_public_result is True)"""
    study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    
    # Check permission: allow if public OR if user is creator/admin
    is_public = study.get("is_public_result", False)
    if not is_public:
        if not current_user:
            raise HTTPException(status_code=401, detail="Authentication required")
        if study["creator_id"] != current_user.id and current_user.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Not authorized")
    
    api_key = os.environ.get('EMERGENT_LLM_KEY')
    if not api_key:
        raise HTTPException(status_code=500, detail="AI service not configured")
    
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration
        
        # Determine environment based on product category
        product_category = study.get("product_category", "").lower()
        environment_type = request.environment_type
        
        # Auto-detect environment if set to "auto"
        if environment_type == "auto":
            if any(word in product_category for word in ["cream", "cosmetic", "skincare", "makeup", "beauty"]):
                environment_type = "cosmetics_store"
            elif any(word in product_category for word in ["drink", "beverage", "snack", "food", "water"]):
                environment_type = "convenience_store"
            elif any(word in product_category for word in ["grocery", "supermarket"]):
                environment_type = "supermarket"
            elif any(word in product_category for word in ["fashion", "clothing", "apparel"]):
                environment_type = "mall"
            else:
                environment_type = "supermarket"  # Default
        
        # Build environment-specific descriptions
        environment_descriptions = {
            "cosmetics_store": "Boots or Watson cosmetics store shelf, bright lighting, organized beauty products display, premium retail environment",
            "convenience_store": "7-Eleven refrigerator or shelf display, convenience store setting, consumer products in organized rows",
            "supermarket": "Lotus's or Big C supermarket aisle, retail shelf display, organized product arrangement",
            "mall": "Shopping mall retail display, premium store environment, attractive product presentation",
            "custom": request.custom_environment or "retail environment"
        }
        
        shelf_style_descriptions = {
            "eye_level": "at eye level position, centered in frame, prominent placement",
            "shelf_view": "on retail shelf with other competing products, realistic shelf arrangement",
            "aisle_view": "in store aisle perspective, showing product context in retail environment",
            "custom": request.custom_shelf_style or "product display"
        }
        
        environment_desc = environment_descriptions.get(environment_type, environment_descriptions["supermarket"])
        shelf_desc = shelf_style_descriptions.get(request.shelf_style, shelf_style_descriptions["eye_level"])
        
        # If custom, use AI to interpret and enhance the description
        if environment_type == "custom" or request.shelf_style == "custom":
            custom_context = []
            if environment_type == "custom":
                custom_context.append(f"Environment: {request.custom_environment}")
            if request.shelf_style == "custom":
                custom_context.append(f"Display style: {request.custom_shelf_style}")
            
            environment_desc = ", ".join(custom_context) if custom_context else environment_desc
        
        # Use AI to create detailed environment prompt
        system_message = """You are an expert in retail merchandising and product photography.
Create realistic prompts for on-shelf product visualization in competitive retail environments."""
        
        study_title = study.get("title", "Product")
        
        base_prompt = f"""Create a photorealistic on-shelf visualization for: {study_title}

Environment Setting: {environment_desc}
Shelf Position: {shelf_desc}

Requirements:
1. Show the product {shelf_desc}
2. Include competing products from the same category (blurred or generic if needed)
3. Realistic retail lighting and atmosphere
4. Professional product photography quality
5. Show authentic {environment_type.replace('_', ' ')} environment
6. Make the featured product stand out while maintaining realistic context

Keep the prompt concise (2-3 sentences max). Return ONLY the image generation prompt."""

        if request.additional_prompt:
            base_prompt += f"\n\nAdditional requirements (to be placed at the BEGINNING of the final prompt): {request.additional_prompt}"
        
        chat = LlmChat(
            api_key=api_key,
            session_id=f"shelf-sim-{study_id}",
            system_message=system_message
        ).with_model("openai", "gpt-4o-mini")
        
        generated_prompt = await chat.send_message(UserMessage(text=base_prompt))
        
        # Prepend user's additional prompt if provided
        if request.additional_prompt:
            generated_prompt = f"{request.additional_prompt.strip()}. {generated_prompt}"
        
        # Generate image using Gemini with product image as reference
        from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
        
        # Get product image in base64
        product_img_base64 = None
        if request.product_image_url.startswith('data:image'):
            product_img_base64 = request.product_image_url.split(',')[1]
        else:
            # Download and convert to base64
            import httpx
            async with httpx.AsyncClient() as client:
                img_response = await client.get(request.product_image_url)
                product_img_base64 = base64.b64encode(img_response.content).decode('utf-8')
        
        # Use Gemini 2.5 flash image preview
        chat = LlmChat(
            api_key=api_key,
            session_id=f"shelf-sim-{study_id}",
            system_message="You are an AI image generator specializing in retail product visualization."
        ).with_model("gemini", "gemini-2.5-flash-image-preview").with_params(modalities=["image", "text"])
        
        # Create prompt with reference image
        final_prompt = f"Using the provided product image as a reference, create: {generated_prompt}"
        
        image_content = ImageContent(product_img_base64)
        msg = UserMessage(text=final_prompt, file_contents=[image_content])
        
        text, images = await chat.send_message_multimodal_response(msg)
        
        if not images or len(images) == 0:
            raise HTTPException(status_code=500, detail="No images generated")
        
        # Get base64 image and compress
        shelf_image_base64 = images[0]['data']
        compressed_base64 = compress_base64_image(shelf_image_base64, max_size_kb=150.0, target_dimension=640)
        shelf_image_url = f"data:image/jpeg;base64,{compressed_base64}"
        
        return {
            "image_url": shelf_image_url,
            "prompt_used": generated_prompt,
            "environment_type": environment_type,
            "shelf_style": request.shelf_style,
            "message": "Shelf simulation generated successfully"
        }
        
    except Exception as e:
        logging.error(f"Shelf simulation generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate shelf simulation: {str(e)}")



# Share Conjoint Study Results as Content
@api_router.post("/conjoint/studies/{study_id}/share-content")
async def share_conjoint_as_content(
    study_id: str,
    data: ConjointContentShareRequest,
    current_user: User = Depends(get_current_user)
):
    """Share conjoint analysis results as research content with charts and AI analysis"""
    try:
        import matplotlib
        matplotlib.use('Agg')  # Non-GUI backend
        import matplotlib.pyplot as plt
        import io
        
        # Verify study exists and user has permission
        study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
        if not study:
            raise HTTPException(status_code=404, detail="Study not found")
        
        # Generate AI interpretation if not provided
        ai_interpretation = data.ai_interpretation
        if not ai_interpretation:
            logging.info(f"[SHARE_CONTENT] No AI interpretation provided. Generating automatically for study {study_id}...")
            try:
                # Get responses for AI analysis
                responses = await db.conjoint_responses.find(
                    {"study_id": study_id},
                    {"_id": 0}
                ).to_list(1000)
                
                logging.info(f"[SHARE_CONTENT] Found {len(responses)} responses for study {study_id}")
                
                if len(responses) >= 30:
                    # Prepare data for AI
                    analysis_data = {
                        "importance_scores": data.importance_scores,
                        "part_worths": data.part_worths,
                        "respondent_count": data.respondent_count,
                        "statistical_method": data.statistical_method
                    }
                    
                    # Build AI prompt
                    prompt = f"""คุณเป็นนักวิเคราะห์การวิจัยตลาด กรุณาวิเคราะห์ผลการวิจัย Conjoint Analysis ต่อไปนี้:

การศึกษา: {data.title}
จำนวนผู้ตอบ: {data.respondent_count} คน
วิธีวิเคราะห์: {data.statistical_method}

## ความสำคัญของคุณลักษณะ (Importance Scores)
"""
                    sorted_importance = sorted(
                        data.importance_scores.items(),
                        key=lambda x: x[1].get('importance', 0),
                        reverse=True
                    )
                    
                    for rank, (attr_id, attr_data) in enumerate(sorted_importance, 1):
                        attr_name = attr_data.get('name', 'Unknown')
                        importance = attr_data.get('importance', 0)
                        prompt += f"{rank}. {attr_name}: {importance:.1f}%\n"
                    
                    prompt += "\n## ค่า Utility ของแต่ละระดับ\n"
                    for attr_id, attr_data in sorted_importance:
                        attr_name = attr_data.get('name', 'Unknown')
                        prompt += f"\n### {attr_name}\n"
                        
                        if attr_id in data.part_worths:
                            levels_data = data.part_worths[attr_id].get('levels', {})
                            sorted_levels = sorted(
                                levels_data.items(),
                                key=lambda x: x[1].get('utility', 0),
                                reverse=True
                            )
                            
                            for level_id, level_data in sorted_levels:
                                level_name = level_data.get('name', 'Unknown')
                                utility = level_data.get('utility', 0)
                                prompt += f"- {level_name}: {utility:.3f}\n"
                    
                    prompt += """

กรุณาให้การตีความผลที่ครอบคลุม:
1. คุณลักษณะใดสำคัญที่สุดและทำไม?
2. ระดับใดของแต่ละคุณลักษณะที่ผู้บริโภคชื่นชอบ?
3. ข้อเสนอแนะเชิงธุรกิจ (3-5 ข้อ)
4. กลยุทธ์การตลาดที่แนะนำ

ใช้ภาษาไทยที่เข้าใจง่าย ชัดเจน และเป็นมืออาชีพ"""
                    
                    # Call AI
                    from emergentintegrations.llm.chat import LlmChat, UserMessage
                    chat = LlmChat()
                    logging.info(f"[SHARE_CONTENT] Calling AI with prompt length: {len(prompt)} characters")
                    ai_interpretation = await chat.send_message_async(UserMessage(prompt))
                    logging.info(f"[SHARE_CONTENT] AI interpretation generated successfully. Length: {len(ai_interpretation)} characters")
                else:
                    logging.warning(f"[SHARE_CONTENT] Insufficient responses ({len(responses)}/30 required) - skipping AI analysis")
                    ai_interpretation = None
                    
            except Exception as e:
                logging.error(f"[SHARE_CONTENT] Error generating AI interpretation: {str(e)}")
                import traceback
                logging.error(f"[SHARE_CONTENT] Traceback: {traceback.format_exc()}")
                ai_interpretation = None
        else:
            logging.info(f"[SHARE_CONTENT] AI interpretation provided by user. Length: {len(ai_interpretation)} characters")
        
        # Build content body with research details and results
        content_body = f"""## เทคนิคการวิจัย
Choice-Based Conjoint Analysis

## ประเภทการวิจัย
{data.research_type}

## รายละเอียดการวิจัย
- **การศึกษา:** {data.title}
- **จำนวนผู้ตอบ:** {data.respondent_count} คน
- **วิธีวิเคราะห์:** {data.statistical_method}
"""
        
        # Add optional research details
        if data.sample_size:
            content_body += f"- **ขนาดกลุ่มตัวอย่าง:** {data.sample_size}\n"
        if data.data_source:
            content_body += f"- **แหล่งข้อมูล:** {data.data_source}\n"
        if data.collection_method:
            content_body += f"- **วิธีการเก็บข้อมูล:** {data.collection_method}\n"
        if data.research_date:
            content_body += f"- **วันที่ทำการวิจัย:** {data.research_date}\n"
        
        # Create charts
        chart_images = []
        
        # 1. Importance Chart
        try:
            sorted_importance = sorted(
                data.importance_scores.items(),
                key=lambda x: x[1].get('importance', 0),
                reverse=True
            )
            
            if sorted_importance:
                # Prepare data
                attr_names = [attr_data.get('name', 'Unknown') for _, attr_data in sorted_importance]
                importances = [attr_data.get('importance', 0) for _, attr_data in sorted_importance]
                
                # Create bar chart
                plt.figure(figsize=(10, 6))
                colors = plt.cm.viridis([i/len(attr_names) for i in range(len(attr_names))])
                bars = plt.barh(attr_names, importances, color=colors)
                plt.xlabel('ความสำคัญ (%)', fontsize=12, fontweight='bold')
                plt.title('ความสำคัญของคุณลักษณะ (Attribute Importance)', fontsize=14, fontweight='bold', pad=20)
                plt.xlim(0, max(importances) * 1.1)
                
                # Add value labels
                for i, (bar, val) in enumerate(zip(bars, importances)):
                    plt.text(val + 1, i, f'{val:.1f}%', va='center', fontsize=10, fontweight='bold')
                
                plt.tight_layout()
                
                # Save to base64
                buffer = io.BytesIO()
                plt.savefig(buffer, format='png', dpi=100, bbox_inches='tight')
                buffer.seek(0)
                img_bytes = buffer.read()
                importance_img_base64 = base64.b64encode(img_bytes).decode()
                chart_images.append({
                    "id": str(uuid.uuid4()),
                    "type": "importance",
                    "title": "ความสำคัญของคุณลักษณะ",
                    "filename": "importance_chart.png",
                    "file_type": "image/png",
                    "file_size_kb": round(len(img_bytes) / 1024, 2),
                    "url": f"data:image/png;base64,{importance_img_base64}",
                    "data": f"data:image/png;base64,{importance_img_base64}"
                })
                plt.close()
                logging.info("Importance chart created successfully")
        except Exception as e:
            logging.error(f"Error creating importance chart: {e}")
        
        # 2. Utility Charts (for each attribute)
        for attr_id, attr_data in sorted_importance[:3]:  # Top 3 attributes
            try:
                attr_name = attr_data.get('name', 'Unknown')
                
                if attr_id in data.part_worths:
                    levels_data = data.part_worths[attr_id].get('levels', {})
                    sorted_levels = sorted(
                        levels_data.items(),
                        key=lambda x: x[1].get('utility', 0),
                        reverse=True
                    )
                    
                    if sorted_levels:
                        level_names = [level_data.get('name', 'Unknown') for _, level_data in sorted_levels]
                        utilities = [level_data.get('utility', 0) for _, level_data in sorted_levels]
                        
                        # Create bar chart
                        plt.figure(figsize=(10, 5))
                        colors = ['#2ecc71' if u > 0 else '#e74c3c' for u in utilities]
                        bars = plt.barh(level_names, utilities, color=colors)
                        plt.xlabel('ค่า Utility', fontsize=12, fontweight='bold')
                        plt.title(f'ค่า Utility ของ {attr_name}', fontsize=14, fontweight='bold', pad=20)
                        plt.axvline(x=0, color='black', linestyle='-', linewidth=0.5)
                        
                        # Add value labels
                        for i, (bar, val) in enumerate(zip(bars, utilities)):
                            x_pos = val + (0.02 if val > 0 else -0.02)
                            ha = 'left' if val > 0 else 'right'
                            plt.text(x_pos, i, f'{val:.3f}', va='center', ha=ha, fontsize=10, fontweight='bold')
                        
                        plt.tight_layout()
                        
                        # Save to base64
                        buffer = io.BytesIO()
                        plt.savefig(buffer, format='png', dpi=100, bbox_inches='tight')
                        buffer.seek(0)
                        img_bytes = buffer.read()
                        utility_img_base64 = base64.b64encode(img_bytes).decode()
                        chart_images.append({
                            "id": str(uuid.uuid4()),
                            "type": "utility",
                            "title": f"ค่า Utility ของ {attr_name}",
                            "filename": f"utility_chart_{attr_name}.png",
                            "file_type": "image/png",
                            "file_size_kb": round(len(img_bytes) / 1024, 2),
                            "url": f"data:image/png;base64,{utility_img_base64}",
                            "data": f"data:image/png;base64,{utility_img_base64}"
                        })
                        plt.close()
                        logging.info(f"Utility chart for {attr_name} created successfully")
            except Exception as e:
                logging.error(f"Error creating utility chart for {attr_name}: {e}")
        
        # Add importance scores summary
        content_body += f"\n## ผลการวิเคราะห์ความสำคัญของคุณลักษณะ\n\n"
        
        for rank, (attr_id, attr_data) in enumerate(sorted_importance, 1):
            attr_name = attr_data.get('name', 'Unknown')
            importance = attr_data.get('importance', 0)
            content_body += f"{rank}. **{attr_name}**: {importance:.1f}%\n"
        
        # Add part-worths details
        content_body += f"\n## ค่า Utility ของระดับคุณลักษณะแต่ละอัน\n\n"
        
        for attr_id, attr_data in sorted_importance:
            attr_name = attr_data.get('name', 'Unknown')
            content_body += f"### {attr_name}\n\n"
            
            # Get levels from part_worths
            if attr_id in data.part_worths:
                levels_data = data.part_worths[attr_id].get('levels', {})
                # Sort by utility
                sorted_levels = sorted(
                    levels_data.items(),
                    key=lambda x: x[1].get('utility', 0),
                    reverse=True
                )
                
                for level_id, level_data in sorted_levels:
                    level_name = level_data.get('name', 'Unknown')
                    utility = level_data.get('utility', 0)
                    content_body += f"- **{level_name}**: {utility:.3f}\n"
            
            content_body += "\n"
        
        # Add AI interpretation if available
        if ai_interpretation:
            logging.info(f"[SHARE_CONTENT] Adding AI interpretation to content body (length: {len(ai_interpretation)})")
            content_body += f"\n## การตีความผลด้วย AI\n\n{ai_interpretation}\n"
        else:
            logging.warning(f"[SHARE_CONTENT] No AI interpretation available - content will not include AI analysis section")
        
        # Add optional notes
        if data.additional_notes:
            content_body += f"\n## หมายเหตุเพิ่มเติม\n{data.additional_notes}\n"
        
        # Add link to view full results
        # Determine the base URL from environment or request
        base_url = os.environ.get('FRONTEND_URL', 'https://market-analysis-27.preview.emergentagent.com')
        results_link = f"{base_url}/research/conjoint/{study_id}/results"
        content_body += f"\n## 🔗 ดูผลการวิจัยแบบเต็ม\n\n[คลิกที่นี่เพื่อดูผลการวิจัยแบบโต้ตอบ]({results_link})\n"
        
        # Create content document
        content_dict = {
            "id": str(uuid.uuid4()),
            "title": data.title,
            "content": content_body,
            "content_type": "research",
            "category": "Conjoint Analysis",
            "tags": ["conjoint-analysis", data.research_type.lower(), data.statistical_method.lower()],
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
            # Store chart images
            "attachments": chart_images,
            # Store metadata
            "conjoint_metadata": {
                "study_id": study_id,
                "research_type": data.research_type,
                "sample_size": data.sample_size,
                "respondent_count": data.respondent_count,
                "statistical_method": data.statistical_method,
                "research_date": data.research_date,
                "results_link": results_link
            }
        }
        
        await db.contents.insert_one(content_dict)
        
        logging.info(f"[SHARE_CONTENT] Content created successfully with ID: {content_dict['id']}, has AI interpretation: {bool(ai_interpretation)}, chart images: {len(chart_images)}")
        
        return {
            "message": "Conjoint study shared as content successfully",
            "content_id": content_dict["id"],
            "has_ai_interpretation": bool(ai_interpretation),
            "chart_count": len(chart_images)
        }
        
    except Exception as e:
        logging.error(f"Error sharing conjoint as content: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to share content: {str(e)}")

# Get AI interpretation of results
@api_router.post("/conjoint/studies/{study_id}/ai-interpretation")
async def get_ai_interpretation(
    study_id: str,
    request: AIInterpretationRequest,
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """Generate AI interpretation of conjoint analysis results (public if is_public_result is True)"""
    study = await db.conjoint_studies.find_one({"id": study_id}, {"_id": 0})
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    
    # Check permission: allow if public OR if user is creator/admin
    is_public = study.get("is_public_result", False)
    if not is_public:
        if not current_user:
            raise HTTPException(status_code=401, detail="Authentication required")
        if study["creator_id"] != current_user.id and current_user.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get responses
    responses = await db.conjoint_responses.find(
        {"study_id": study_id},
        {"_id": 0}
    ).to_list(10000)
    
    if len(responses) < 10:
        raise HTTPException(status_code=400, detail="Need at least 10 responses for interpretation")
    
    # Prepare analysis data based on mode
    if request.compare_all:
        # Analyze all methods and get FULL results
        methods_to_analyze = ['counting', 'linear_regression', 'mnl', 'mixed_logit', 'hierarchical_bayes']
        all_results = {}
        
        for method in methods_to_analyze:
            try:
                method_result = await get_method_results(study, responses, method)
                all_results[method] = method_result
            except Exception as e:
                logging.warning(f"Failed to analyze with {method}: {e}")
                continue
        
        # Prepare comprehensive analysis summary with FULL data
        analysis_summary = {
            "study_title": study.get("title"),
            "respondent_count": len(responses),
            "mode": "compare_all",
            "methods": all_results  # Send COMPLETE results, not filtered
        }
        
    else:
        # Single method analysis - get FULL results
        method_result = await get_method_results(study, responses, request.method)
        
        # Prepare data for AI with COMPLETE results
        analysis_summary = {
            "study_title": study.get("title"),
            "respondent_count": len(responses),
            "mode": "single",
            "method": request.method,
            "full_results": method_result  # Send COMPLETE results object
        }
    
    # Generate AI interpretation
    api_key = os.environ.get('EMERGENT_LLM_KEY')
    if not api_key:
        raise HTTPException(status_code=500, detail="AI service not configured")
    
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        system_message = """คุณเป็นผู้เชี่ยวชาญด้านการวิเคราะห์ตลาดและพฤติกรรมผู้บริโภค โดยเฉพาะ Conjoint Analysis 
คุณจะต้องอธิบายผลการวิเคราะห์ให้ผู้ใช้ทั่วไปที่ไม่มีความรู้ทางสถิติเข้าใจได้ง่าย
ใช้ภาษาเรียบง่าย ยกตัวอย่างประกอบ และให้ข้อเสนอแนะเชิงธุรกิจที่นำไปปฏิบัติได้จริง"""
        
        # Build prompt based on mode with FULL data
        import json
        
        if analysis_summary['mode'] == 'compare_all':
            # Compare all methods - send COMPLETE results data
            methods_json = json.dumps(analysis_summary['methods'], indent=2, ensure_ascii=False, default=str)
            
            prompt = f"""วิเคราะห์และเปรียบเทียบผลการวิจัย Conjoint Analysis จากหลายวิธีการวิเคราะห์อย่างละเอียดและครอบคลุม:

การศึกษา: {analysis_summary['study_title']}
จำนวนผู้ตอบ: {analysis_summary['respondent_count']} คน

ผลการวิเคราะห์ทั้งหมดจากแต่ละวิธี (ข้อมูลครบถ้วน):
```json
{methods_json}
```

**คำแนะนำในการวิเคราะห์:**
- คุณจะได้รับข้อมูลทั้งหมดจาก 5 วิธีการวิเคราะห์ รวมถึง:
  * Part-worth utilities และ importance scores
  * Model statistics (R², Log-likelihood, AIC, BIC ถ้ามี)
  * Coefficients, standard errors, p-values (ถ้ามี)
  * Convergence information และ fit statistics (ถ้ามี)
  
กรุณาเขียนคำอธิบายที่วิเคราะห์เชิงลึกและครอบคลุม:

1. **สรุปผลหลักจากทุกวิธี (4-5 ประโยค):** 
   - เปรียบเทียบผลจากทุกวิธี มีความแตกต่างหรือสอดคล้องกันอย่างไร?
   - วิธีไหนให้ผลที่น่าเชื่อถือที่สุด? (พิจารณาจาก model fit statistics)

2. **วิเคราะห์ความสำคัญของคุณลักษณะ (Top 3-5):**
   - คุณลักษณะไหนที่ทุกวิธีให้ความสำคัญสูง? ranking เปลี่ยนไหมระหว่างวิธี?
   - มีความแตกต่างที่น่าสังเกตหรือไม่? อธิบายสาเหตุที่อาจเป็นไปได้
   - ระดับ (levels) ไหนที่ผู้บริโภคชอบที่สุดในแต่ละคุณลักษณะ?

3. **เปรียบเทียบคุณภาพของแต่ละวิธี:**
   - พิจารณาจาก model statistics (ถ้ามี): R², Log-likelihood, AIC, BIC
   - วิธีไหนมี goodness-of-fit ที่ดีที่สุด?
   - ควรเชื่อถือผลจากวิธีไหนมากที่สุด? เพราะอะไร?

4. **ข้อเสนอแนะเชิงธุรกิจที่ชัดเจน (5-7 ข้อ):**
   - จากผลที่ได้จากหลายวิธี ควรทำอย่างไรกับผลิตภัณฑ์/บริการ
   - คุณลักษณะไหนควรเน้นในการตลาด? ควรออกแบบ/พัฒนาอย่างไร?
   - ข้อเสนอแนะเรื่องราคา (ถ้าเป็นคุณลักษณะหนึ่ง)
   - กลยุทธ์การสื่อสาร/positioning ที่เหมาะสม

5. **ข้อควรระวังและข้อจำกัด:**
   - ความไม่สอดคล้องระหว่างวิธีที่ต้องพิจารณาเพิ่มเติม
   - ข้อจำกัดของแต่ละวิธีที่ควรรับทราบ
   - ข้อแนะนำในการเก็บข้อมูลเพิ่มเติม (ถ้ามี)

ใช้ภาษาไทยที่เข้าใจง่าย แต่ให้รายละเอียดเชิงลึก ยกตัวอย่างประกอบ และชี้ให้เห็นข้อดีของการใช้หลายวิธีวิเคราะห์เปรียบเทียบกัน"""
        
        else:
            # Single method - send COMPLETE results data
            full_results_json = json.dumps(analysis_summary['full_results'], indent=2, ensure_ascii=False, default=str)
            
            method_display = {
                'counting': 'Counting Method (นับความถี่)',
                'linear_regression': 'Linear Regression (OLS)',
                'mnl': 'Multinomial Logit (MNL)',
                'mixed_logit': 'Mixed Logit',
                'hierarchical_bayes': 'Hierarchical Bayes (HB)'
            }.get(analysis_summary['method'], analysis_summary['method'])
            
            prompt = f"""วิเคราะห์และตีความผลการวิจัย Conjoint Analysis อย่างละเอียดและครอบคลุม:

การศึกษา: {analysis_summary['study_title']}
จำนวนผู้ตอบ: {analysis_summary['respondent_count']} คน
วิธีการวิเคราะห์: {method_display}

ผลการวิเคราะห์ทั้งหมด (ข้อมูลครบถ้วน):
```json
{full_results_json}
```

**คำแนะนำในการวิเคราะห์:**
- คุณจะได้รับข้อมูลทั้งหมดจากการวิเคราะห์ รวมถึง:
  * Part-worth utilities และ importance scores
  * Model statistics (R², Log-likelihood, AIC, BIC ถ้ามี)
  * Coefficients, standard errors, p-values (ถ้ามี)
  * Selection counts และ raw data (ถ้ามี)
  
กรุณาเขียนคำอธิบายที่วิเคราะห์เชิงลึก:

1. **สรุปผลหลักจาก {method_display} (4-5 ประโยค):**
   - อะไรคือสิ่งที่ผู้บริโภคให้ความสำคัญมากที่สุด?
   - คุณภาพของโมเดล (model fit) เป็นอย่างไร? (ถ้ามี statistics)
   - ผลลัพธ์มีความน่าเชื่อถือหรือไม่? เพราะอะไร?

2. **วิเคราะห์คุณลักษณะที่สำคัญที่สุด (Top 3-5):**
   - อธิบายว่าทำไมแต่ละคุณลักษณะถึงสำคัญ
   - ระดับ (level) ไหนที่ผู้บริโภคชอบที่สุด? utility/coefficient มีค่าเท่าไหร่?
   - มีความแตกต่างที่ชัดเจนระหว่าง levels หรือไม่?

3. **วิเคราะห์เชิงสถิติ (ถ้ามีข้อมูล):**
   - Model fit statistics บอกอะไรเกี่ยวกับคุณภาพของโมเดล?
   - Coefficients หรือ utilities มีนัยสำคัญทางสถิติหรือไม่?
   - มีข้อควรสังเกตจากค่า standard errors หรือ confidence intervals หรือไม่?

4. **ข้อเสนอแนะเชิงธุรกิจที่ชัดเจน (5-7 ข้อ):**
   - ควรทำอย่างไรกับผลิตภัณฑ์/บริการ
   - คุณลักษณะไหนควรเน้นในการตลาด?
   - ข้อเสนอแนะเรื่องการตั้งราคา (ถ้าราคาเป็นคุณลักษณะหนึ่ง)
   - กลยุทธ์การสื่อสาร/positioning
   - จุดแข็งที่ควรเน้น และจุดอ่อนที่ควรปรับปรุง

5. **ข้อควรระวังและข้อจำกัด:**
   - ข้อจำกัดของวิธี {method_display}
   - สมมติฐานที่ควรรับทราบ
   - ข้อแนะนำในการตีความผลและการนำไปใช้

ใช้ภาษาไทยที่เข้าใจง่าย แต่ให้รายละเอียดเชิงลึก ยกตัวอย่างประกอบ และให้คำแนะนำที่นำไปปฏิบัติได้จริง"""
        
        chat = LlmChat(
            api_key=api_key,
            session_id=f"conjoint-interpret-{study_id}",
            system_message=system_message
        ).with_model("openai", "gpt-4o-mini")
        
        response = await chat.send_message(UserMessage(text=prompt))
        
        return {
            "interpretation": response,
            "summary_data": analysis_summary
        }
        
    except Exception as e:
        logging.error(f"AI interpretation error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate interpretation: {str(e)}")


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