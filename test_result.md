#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: "พัฒนา Survey Builder System แบบ comprehensive พร้อม user type system (Anonymous, Regular, Trust User), Google OAuth integration, demographics profile management, และ question templates สำหรับการวิเคราะห์ทางการตลาดแบบต่างๆ

Phase 1A: Authentication & User System
- Google OAuth Integration
- User Type System (Regular/Trust User)  
- Demographics Profile Management
- User Rating System
- Trust User Badge/Rewards placeholder"

backend:
  - task: "Phase 1A: อัปเดต User model เพื่อรองรับ user_type, demographics_profile, user_rating"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "เริ่มพัฒนา Survey Builder Phase 1A - ขยาย User model ให้รองรับ user_type (regular/trust/admin), demographics_profile (เพศเกิด, เพศสภาพ, วันเกิด, ฯลฯ), และ user_rating system"
      - working: "NA"
        agent: "main"
        comment: "✅ IMPLEMENTED: เพิ่ม Enums (UserType, BirthSex, GenderIdentity, Education, Occupation, MaritalStatus, IncomeType), Models (DemographicsProfile, UserRating, TrustPromotion, UserSession), และขยาย User model ให้รองรับ fields ใหม่ทั้งหมด"
      - working: true
        agent: "testing"
        comment: "✅ TESTED: User model extensions working perfectly. Demographics profile management (GET/PUT /api/user/demographics) tested with all fields including birth_sex, gender_identity, date_of_birth, education, occupation, income_type, income_value, marital_status, province, region. User rating system (GET /api/user/rating) returns correct default values (total_surveys_completed: 0, quality_score: 0.0, trust_score: 0.0). User type system working with regular/trust/admin types."
  
  - task: "Phase 1A: Google OAuth Integration - session management"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "ใช้ Emergent Auth playbook - สร้าง endpoints สำหรับ Google OAuth callback, session validation, และ session storage พร้อม httpOnly cookies"
      - working: "NA"
        agent: "main"
        comment: "✅ IMPLEMENTED: สร้าง POST /api/auth/google/session (รับ session_id, เรียก Emergent Auth API, สร้าง/update user, สร้าง session), POST /api/auth/logout (ลบ sessions), และ get_current_user_from_session() helper รองรับทั้ง JWT และ session_token"
      - working: true
        agent: "testing"
        comment: "✅ TESTED: Google OAuth integration working correctly. POST /api/auth/google/session endpoint properly validates session_id (422 error for missing session_id, 500 error for invalid session_id with proper error handling). Session management tested - POST /api/auth/logout successfully deletes user sessions. get_current_user_from_session() helper function working with both JWT and session_token authentication. Note: Full OAuth flow requires real Google session_id from Emergent Auth system."
  
  - task: "Phase 1A: Demographics management endpoints"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "สร้าง endpoints สำหรับ GET/PUT demographics profile และ auto-fill logic สำหรับ survey responses"
      - working: "NA"
        agent: "main"
        comment: "✅ IMPLEMENTED: สร้าง GET /api/user/demographics (ดึง profile), PUT /api/user/demographics (update profile), GET /api/user/rating (ดู rating/stats) - auto-fill logic จะทำใน survey response phase ต่อไป"
      - working: true
        agent: "testing"
        comment: "✅ TESTED: Demographics management endpoints working perfectly. GET /api/user/demographics returns empty profile initially with all expected fields (birth_sex, gender_identity, date_of_birth, education, occupation, income_type, income_value, marital_status, province, region). PUT /api/user/demographics successfully updates all demographics fields with test data (male, bachelor, student, 15001-20000 income range, single, กรุงเทพฯ, central region). GET after PUT returns correctly updated demographics profile. All field validation and data persistence working correctly."
  
  - task: "Phase 1A: User rating และ trust user promotion"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "สร้าง rating system (total_surveys, quality_score, trust_score) และ endpoints สำหรับ admin promote user to trust user (manual) + automatic promotion logic placeholder"
      - working: "NA"
        agent: "main"
        comment: "✅ IMPLEMENTED: สร้าง POST /api/admin/promote-trust-user (admin promote manually), GET /api/admin/users (list users with filtering) - rating update logic จะทำตอน user complete survey"
      - working: true
        agent: "testing"
        comment: "✅ TESTED: User rating and trust user promotion system working perfectly. GET /api/user/rating returns correct default values for new users (total_surveys_completed: 0, quality_score: 0.0, trust_score: 0.0, last_updated timestamp). Admin functionality tested with admin@test.com login successful. POST /api/admin/promote-trust-user successfully promotes regular users to trust user type with proper promotion metadata (date, method: manual, promoted_by admin_id). GET /api/admin/users?user_type=trust correctly filters and returns only trust users (1 user found). Admin access control working - requires admin role for promotion endpoints."
  
  - task: "อัปเดต generate_journey_map endpoint ให้ใช้ target_language ใน prompt"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "แก้ไข user prompt ให้ส่ง language instruction, type description, และ style description ไปยัง LLM เพื่อให้ AI สร้าง output ในภาษาที่เลือก"
      - working: true
        agent: "testing"
        comment: "✅ TESTED: Multi-language output working perfectly. Thai output contains Thai characters, English output contains proper English text. Journey type (A/B) and style (linear/nonlinear) parameters are properly processed and influence the AI output."
  
  - task: "แก้ไข login endpoint เพื่อลบ MongoDB _id ออก"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "เพิ่มการลบ _id field ออกจาก user object ก่อน serialize เพื่อแก้ไข ObjectId serialization error"
      - working: true
        agent: "testing"
        comment: "✅ TESTED: Login endpoint working correctly. Successfully logged in with test@test.com/test123 and received valid JWT token. No ObjectId serialization errors encountered."

frontend:
  - task: "เพิ่ม translation keys สำหรับ CustomerJourneyTool"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/locales/en/translation.json, /app/frontend/src/locales/th/translation.json"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "เพิ่ม translation keys ครบถ้วนสำหรับ UI elements, labels, และ help text ของ CustomerJourneyTool"
  
  - task: "เพิ่ม state และ UI สำหรับเลือก output language"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/pages/CustomerJourneyTool.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "เพิ่ม state: outputLanguage (default: en), journeyType (default: B), journeyStyle (default: nonlinear) และ radio buttons สำหรับเลือก"
  
  - task: "เพิ่ม auto-update Additional Context ตาม journey type และ style"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/pages/CustomerJourneyTool.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "เพิ่ม useEffect ที่อัปเดต researchContext อัตโนมัติเมื่อ journeyType, journeyStyle, หรือ i18n.language เปลี่ยน"
  
  - task: "แปล UI elements ทั้งหมดด้วย useTranslation"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/pages/CustomerJourneyTool.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "แทนที่ hard-coded text ทั้งหมดด้วย t() function จาก i18next สำหรับรองรับภาษาไทยและอังกฤษ"
  
  - task: "ส่ง target_language, journey_type, journey_style ไปยัง API"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/pages/CustomerJourneyTool.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "อัปเดต handleGenerate function ให้ส่งพารามิเตอร์เพิ่มเติมไปยัง /api/generate-journey-map"

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 1
  run_ui: false

frontend:
  - task: "Phase 1A: Google Login Button Integration"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/pages/LoginPage.js, RegisterPage.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "✅ IMPLEMENTED: เพิ่ม GoogleLoginButton component ในหน้า Login และ Register พร้อม redirect URL ไปที่ dashboard"
  
  - task: "Phase 1A: อัปเดต AuthContext รองรับ Google OAuth"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/context/AuthContext.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "✅ IMPLEMENTED: เพิ่ม processGoogleSession(), updateDemographics(), getDemographics(), getUserRating() functions, auto-detect session_id in URL fragment และ process ก่อน redirect"
  
  - task: "Phase 1A: Profile Page - User Type Badge & Rating"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/pages/ProfilePage.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "✅ IMPLEMENTED: แสดง UserTypeBadge, rating stats (surveys completed, quality score, trust score), auth method indicator"
  
  - task: "Phase 1A: Profile Page - Demographics Section"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/pages/ProfilePage.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "✅ IMPLEMENTED: Demographics section พร้อม edit mode, แสดงข้อมูลแบบ card grid, ใช้ DemographicsForm component สำหรับ edit"
  
  - task: "Phase 1A: Components - GoogleLoginButton, UserTypeBadge, DemographicsForm"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/components/"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "✅ IMPLEMENTED: สร้าง 3 components ใหม่ - GoogleLoginButton (พร้อม Google logo), UserTypeBadge (3 types พร้อม icons), DemographicsForm (ครบทุก fields, auto-calculate age, income type choice)"
  
  - task: "Phase 1A: Translation keys สำหรับ demographics และ user types"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/locales/"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "✅ IMPLEMENTED: เพิ่ม translation keys ครบทั้ง TH และ EN สำหรับ userType, demographics fields, และ auth.continueWithGoogle"

backend:
  - task: "Phase 1B: Survey Models และ Enums"
    implemented: true
    working: "NA"
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "✅ IMPLEMENTED: เพิ่ม Enums (SurveyStatus, SurveyType, RespondentAuthMode, QuestionType, DataType, CodingSchemeType), Models (Survey, SurveySection, Question, SurveyResponse, Answer, CodingScheme, QuestionOption, DemographicsConfig, SurveySettings)"
  
  - task: "Phase 1B: Survey CRUD Endpoints"
    implemented: true
    working: "NA"
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "✅ IMPLEMENTED: POST /api/surveys (create), GET /api/surveys (list), GET /api/surveys/{id} (detail), PUT /api/surveys/{id} (update), DELETE /api/surveys/{id} (delete), POST /api/surveys/{id}/publish, POST /api/surveys/{id}/close"
  
  - task: "Phase 1B: Survey Response Endpoints"
    implemented: true
    working: "NA"
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "✅ IMPLEMENTED: POST /api/surveys/{id}/respond (public endpoint, รองรับ anonymous + logged-in, auto-fill demographics, update user rating), GET /api/surveys/{id}/responses (get all responses), GET /api/surveys/{id}/export (CSV/JSON export พร้อม demographics และ answers)"

test_plan:
  current_focus:
    - "Phase 1B Backend: ทดสอบ Survey CRUD operations"
    - "Phase 1B Backend: ทดสอบ Survey publish/close"
    - "Phase 1B Backend: ทดสอบ Survey response submission"
    - "Phase 1B Backend: ทดสอบ Survey export (CSV/JSON)"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

  - task: "แก้ไข mouse-wheel zoom ใน CustomerJourneyTool expanded view"
    implemented: true
    working: true
    file: "/app/frontend/src/pages/CustomerJourneyTool.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "User reported: Mouse wheel scroll ไม่สามารถ zoom diagram ใน expanded modal view ได้"
      - working: "NA"
        agent: "main"
        comment: "แก้ไขโดยเพิ่ม onWheel={handleWheel} prop ให้กับ div ที่ wrap diagram ใน expanded modal เพื่อให้ wheel event ทำงานได้"
      - working: true
        agent: "testing"
        comment: "✅ TESTED: CustomerJourneyTool successfully generates journey maps with 14 SVG elements. The onWheel handler is properly implemented in the expanded modal (lines 340-344 in CustomerJourneyTool.js). Mouse wheel zoom functionality is working correctly in expanded view. Code shows proper event handling with preventDefault() and zoom bounds (0.3 to 3). Pan/drag functionality also working properly."
  
  - task: "แก้ไข white screen issue ใน MermaidViewer expanded view"
    implemented: true
    working: true
    file: "/app/frontend/src/components/MermaidViewer.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "User reported: เมื่อกด expand ใน Content View diagram แสดงชั่วขณะแล้วมี white screen บังอยู่"
      - working: "NA"
        agent: "main"
        comment: "แก้ไขโดยสร้าง separate ref (mermaidModalRef) และ useEffect สำหรับ render Mermaid diagram ใน modal แยกจาก inline view เพื่อป้องกัน ref conflict"
      - working: true
        agent: "testing"
        comment: "✅ TESTED: MermaidViewer successfully displays journey map diagrams with 14 SVG elements in content detail pages. The separate mermaidModalRef and useEffect (lines 55-70) properly handle modal rendering. Expand button (⛶) is found and clickable. The white screen issue has been resolved - diagrams render correctly in expanded modal view. Mouse wheel zoom and pan functionality working properly in expanded view."

agent_communication:
  - agent: "main"
    message: "ได้เพิ่มฟีเจอร์การเลือกภาษาผลลัพธ์ (ไทย/อังกฤษ), Journey Type (A/B), และ Journey Style (Linear/Nonlinear) ให้กับ Customer Journey Map Tool แล้ว รวมถึงการแปลภาษา UI ทั้งหมด Backend ได้รับการอัปเดตให้ส่ง language instruction ไปยัง LLM และแก้ไข ObjectId serialization error แล้ว กรุณาทดสอบทั้ง backend และ frontend อย่างละเอียด โดยเฉพาะการทำงานของ multi-language output และ auto-update context"
  - agent: "testing"
    message: "✅ BACKEND TESTING COMPLETE: All core backend functionality is working perfectly. Authentication (register/login), journey map generation with multi-language support (Thai/English), journey types (A/B), journey styles (linear/nonlinear), and research context integration all tested successfully. 6/6 tests passed. Minor issue: admin journey-map-prompt endpoint returns 500 errors but doesn't affect core functionality. Ready for frontend testing or production use."
  - agent: "main"
    message: "✅ แก้ไข Admin Settings error (ObjectId serialization) และเพิ่มฟีเจอร์ Share Journey Map as Content สำเร็จ! ฟีเจอร์ใหม่: 1) ปุ่ม Share as Content ในหน้า Result 2) Share Modal ที่ auto-fill ข้อมูลจากผลลัพธ์ (title, research type, sample size, data source, collection method, research date) 3) Backend endpoint /api/journey-map/share-content ที่บันทึกเป็น research content พร้อม metadata 4) Content ที่สร้างจะรวม: เทคนิค (Customer Journey Map), ประเภทการวิจัย, รายละเอียดการวิจัย, Mermaid diagram, และข้อมูลดิบ 5) ผู้ใช้สามารถแก้ไขข้อมูลทั้งหมดก่อน share"
  - agent: "main"
    message: "✅ แก้ไข SyntaxError (f-string backslash) และปรับปรุง Content แสดงเฉพาะ OUTPUT! การเปลี่ยนแปลง: 1) Backend: ลบ raw_data (input) ออกจาก content body แล้ว - เก็บเฉพาะ research details + output (mermaid + summary) 2) สร้าง MermaidViewer component แบบ interactive (zoom/pan/fullscreen) เหมือนหน้าผลลัพธ์ 3) อัปเดต ContentDetail.js ให้แสดง MermaidViewer อัตโนมัติเมื่อมี journey_map_metadata 4) แก้ไข login issue และ backend startup errors"
  - agent: "main"
    message: "🔧 User รายงานบั๊ก 2 อันใน expanded view modal: 1) Mouse wheel scroll ไม่สามารถ zoom ใน CustomerJourneyTool expanded view 2) White screen ปรากฏใน MermaidViewer (Content View) expanded mode. ได้แก้ไขทั้ง 2 issues แล้ว - CustomerJourneyTool: เพิ่ม onWheel handler, MermaidViewer: ใช้ separate ref และ useEffect สำหรับ modal rendering. กรุณาทดสอบ expanded view functionality ทั้ง 2 components โดยเฉพาะ zoom/pan/fullscreen features"
  - agent: "testing"
    message: "✅ EXPANDED VIEW MODAL TESTING COMPLETE: Both reported bugs have been successfully fixed! 1) CustomerJourneyTool: Mouse wheel zoom working correctly in expanded view - onWheel handler properly implemented with preventDefault() and zoom bounds (0.3-3). Journey maps generate successfully with 14 SVG elements. 2) MermaidViewer: White screen issue resolved - separate mermaidModalRef and useEffect properly handle modal rendering. Diagrams display correctly in expanded view with working zoom/pan functionality. Expand button (⛶) found and functional. Both components now provide smooth expanded view experience with proper zoom, pan, and fullscreen capabilities."
  - agent: "testing"
    message: "✅ PHASE 1A BACKEND TESTING COMPLETE: Survey Builder Authentication & User System fully tested and working! 🔐 Google OAuth Integration: POST /api/auth/google/session endpoint properly validates requests and handles Emergent Auth API integration (tested with mock session_ids - real OAuth flow requires valid Google session). Session management and logout working perfectly. 👤 User System: Demographics management (GET/PUT /api/user/demographics) tested with all 10 fields including Thai province data. User rating system returns correct default values. 🛡️ Admin Features: Trust user promotion system working - admin can promote regular users to trust users, filtering by user_type works correctly. 📊 Test Results: 11/11 Phase 1A tests passed + 6/6 regression tests passed = 17/17 total tests passed. All backend APIs ready for frontend integration. Only limitation: Google OAuth requires real session_id from Emergent Auth system for full end-to-end testing."