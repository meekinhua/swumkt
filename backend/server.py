from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Header
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
    journey_map_metadata: Optional[dict] = None

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
    query = {
        "$or": [
            {"created_by": current_user.id},
            {"is_public": True}
        ]
    }
    
    if survey_type:
        query["survey_type"] = survey_type
    if tag:
        query["tags"] = tag
    
    templates = await db.survey_templates.find(query, {"_id": 0}).to_list(100)
    
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
    """Generate a survey using AI based on description"""
    import json
    import re
    import httpx
    
    try:
        # Get Emergent LLM key
        llm_key = os.environ.get('EMERGENT_LLM_KEY')
        if not llm_key:
            raise HTTPException(status_code=500, detail="LLM key not configured")
        
        # Determine language instructions
        lang_instruction = "English" if request.target_language == "en" else "Thai (ไทย)"
        
        # Build prompt with simpler structure
        prompt = f"""Create a survey in {lang_instruction} language.

Topic: {request.description}
Type: {request.survey_type}
Questions needed: {request.num_questions}

Create 2-3 sections with diverse question types. Return valid JSON only:

{{
  "title": "Survey Title in {lang_instruction}",
  "description": "Brief description",
  "sections": [
    {{
      "id": "section_1",
      "title": "Section 1 Title",
      "description": "Section description",
      "order": 0,
      "questions": [
        {{
          "id": "q1",
          "type": "multiple_choice_single",
          "text": "Question in {lang_instruction}?",
          "required": true,
          "data_type": "nominal",
          "options": [
            {{"id": "opt1", "text": "Option 1", "value": "1"}},
            {{"id": "opt2", "text": "Option 2", "value": "2"}}
          ],
          "order": 0
        }},
        {{
          "id": "q2",
          "type": "rating_scale",
          "text": "Rate this (1-5)?",
          "required": true,
          "data_type": "scale",
          "options": [
            {{"id": "r1", "text": "1", "value": "1"}},
            {{"id": "r2", "text": "2", "value": "2"}},
            {{"id": "r3", "text": "3", "value": "3"}},
            {{"id": "r4", "text": "4", "value": "4"}},
            {{"id": "r5", "text": "5", "value": "5"}}
          ],
          "order": 1
        }},
        {{
          "id": "q3",
          "type": "open_ended",
          "text": "Your thoughts?",
          "required": false,
          "data_type": "nominal",
          "options": [],
          "order": 2
        }}
      ]
    }}
  ]
}}

Types: multiple_choice_single, multiple_choice_multiple, rating_scale, open_ended
Data types: nominal, ordinal, scale
Return JSON only, no markdown."""
        
        # Call OpenAI API directly through Emergent proxy
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {llm_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "gpt-4o-mini",
                    "messages": [
                        {"role": "system", "content": "You are a professional survey designer. Return only valid JSON."},
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0.7,
                    "max_tokens": 4000
                }
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=500,
                    detail=f"AI API error: {response.status_code}"
                )
            
            result = response.json()
            response_text = result['choices'][0]['message']['content']
        
        # Clean response
        response_text = response.strip()
        
        # Remove markdown code blocks
        response_text = re.sub(r'^```(?:json)?\s*', '', response_text, flags=re.MULTILINE)
        response_text = re.sub(r'\s*```$', '', response_text, flags=re.MULTILINE)
        response_text = response_text.strip()
        
        # Try to find JSON in response
        json_match = re.search(r'\{[\s\S]*\}', response_text)
        if json_match:
            response_text = json_match.group(0)
        
        # Parse JSON
        try:
            survey_data = json.loads(response_text)
        except json.JSONDecodeError as e:
            # Log the problematic response
            print(f"Failed to parse JSON: {response_text[:500]}")
            raise HTTPException(
                status_code=500, 
                detail=f"AI returned invalid JSON. Please try again or use templates instead."
            )
        
        # Validate required fields
        if 'title' not in survey_data or 'sections' not in survey_data:
            raise HTTPException(
                status_code=500,
                detail="AI response missing required fields. Please try again."
            )
        
        # Create survey
        survey = Survey(
            title=survey_data['title'],
            description=survey_data.get('description', ''),
            survey_type=request.survey_type,
            sections=survey_data['sections'],
            created_by=current_user.id
        )
        
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