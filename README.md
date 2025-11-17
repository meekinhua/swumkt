# SWUMKT Portal

แพลตฟอร์มสาขาการตลาด มหาวิทยาลัยศรีนครินทรวิโรฒ

## 📋 คำอธิบายโปรเจกต์

SWUMKT Portal เป็น web application ที่พัฒนาสำหรับสาขาการตลาด มศว โดยมีระบบและฟีเจอร์หลักดังนี้:

### ✅ ฟีเจอร์ที่พร้อมใช้งานแล้ว

1. **ระบบ Authentication (JWT-based)**
   - สมัครสมาชิก / เข้าสู่ระบบ
   - บทบาทผู้ใช้: Admin, Alumni, Current Student, Public User
   - จัดการโปรไฟล์ส่วนตัว

2. **Content Management System (CMS)**
   - สร้าง แก้ไข และเผยแพร่เนื้อหา
   - ประเภทเนื้อหา: ผลวิจัย, ผลสำรวจ, บทความ, ข่าวสาร
   - รองรับการทำงานร่วมกัน (Collaborative Content) - เพิ่มผู้มีส่วนร่วมได้หลายคน
   - ระบบแสดงความคิดเห็น
   - ระบบแท็กและหมวดหมู่
   - นับจำนวนการเข้าชม

3. **PWA Support**
   - ติดตั้งเป็นแอปบนมือถือได้
   - ทำงานแบบ offline ได้บางส่วน
   - Responsive Design รองรับทั้ง Desktop และ Mobile

### 🚧 ฟีเจอร์ที่เตรียมโครงสร้างไว้แล้ว (Coming Soon)

1. **Market Research Tools**
   - Survey Builder
   - Conjoint Analysis
   - Data Visualization
   - Export Reports (PDF/Excel)

2. **Alumni Zone**
   - เครือข่ายศิษย์เก่า
   - ระบบเชื่อมต่อและแบ่งปัน

3. **External Integrations**
   - LINE Notify
   - Email Service (SendGrid/SMTP)
   - SMS Gateway

4. **Advanced Analytics**
   - วิเคราะห์ข้อมูลเชิงลึก
   - สถิติการใช้งาน

## 🛠 Tech Stack

### Backend
- **Framework**: FastAPI (Python)
- **Database**: MongoDB with Motor (async driver)
- **Authentication**: JWT (JSON Web Tokens)
- **Password Hashing**: bcrypt

### Frontend
- **Framework**: React 19
- **Routing**: React Router v7
- **UI Library**: Shadcn UI (Radix UI + Tailwind CSS)
- **HTTP Client**: Axios
- **Notifications**: Sonner (Toast)
- **Forms**: React Hook Form + Zod

### DevOps
- **Supervisor**: Process management
- **Hot Reload**: Backend & Frontend
- **Kubernetes**: Container orchestration

## 📁 โครงสร้างโปรเจกต์

```
/app/
├── backend/
│   ├── server.py           # FastAPI application
│   ├── requirements.txt    # Python dependencies
│   └── .env               # Environment variables
├── frontend/
│   ├── src/
│   │   ├── pages/         # React page components
│   │   │   ├── LandingPage.js
│   │   │   ├── LoginPage.js
│   │   │   ├── RegisterPage.js
│   │   │   ├── Dashboard.js
│   │   │   ├── ContentBrowse.js
│   │   │   ├── ContentDetail.js
│   │   │   ├── ContentEditor.js
│   │   │   └── ProfilePage.js
│   │   ├── context/       # React context
│   │   │   └── AuthContext.js
│   │   ├── components/    # Reusable components
│   │   │   └── ui/       # Shadcn UI components
│   │   ├── App.js
│   │   ├── App.css
│   │   └── index.js
│   ├── public/
│   │   ├── manifest.json  # PWA manifest
│   │   ├── service-worker.js
│   │   └── index.html
│   ├── package.json
│   ├── tailwind.config.js
│   └── .env              # Environment variables
└── README.md
```

## 🚀 การติดตั้งและรันโปรเจกต์

### Backend
```bash
cd /app/backend
pip install -r requirements.txt
sudo supervisorctl restart backend
```

### Frontend
```bash
cd /app/frontend
yarn install
sudo supervisorctl restart frontend
```

## 🔐 Environment Variables

### Backend (.env)
```
MONGO_URL=mongodb://localhost:27017
DB_NAME=swumkt_database
CORS_ORIGINS=*
JWT_SECRET=your-secret-key-here
```

### Frontend (.env)
```
REACT_APP_BACKEND_URL=https://your-domain.com
WDS_SOCKET_PORT=443
```

## 📡 API Endpoints

### Authentication
- `POST /api/auth/register` - สมัครสมาชิก
- `POST /api/auth/login` - เข้าสู่ระบบ
- `GET /api/auth/me` - ข้อมูลผู้ใช้ปัจจุบัน
- `PUT /api/auth/profile` - อัปเดตโปรไฟล์

### Content Management
- `GET /api/content` - ดึงรายการเนื้อหาทั้งหมด
- `POST /api/content` - สร้างเนื้อหาใหม่
- `GET /api/content/{id}` - ดูเนื้อหาแต่ละรายการ
- `PUT /api/content/{id}` - แก้ไขเนื้อหา
- `DELETE /api/content/{id}` - ลบเนื้อหา
- `POST /api/content/{id}/contributor` - เพิ่มผู้มีส่วนร่วม

### Comments
- `GET /api/comments/{content_id}` - ดึงความคิดเห็น
- `POST /api/comments` - เพิ่มความคิดเห็น

### Future Features (Placeholder)
- `GET /api/market-research/projects` - Market Research Tools
- `GET /api/alumni/connections` - Alumni Zone
- `GET /api/integrations/status` - External Integrations Status

## 👥 User Roles

1. **Admin** - ผู้ดูแลระบบ
   - จัดการเนื้อหาทั้งหมด
   - เข้าถึงฟีเจอร์พิเศษทั้งหมด

2. **Alumni** - ศิษย์เก่า
   - สร้างและแชร์เนื้อหา
   - เข้าถึง Alumni Zone

3. **Current Student** - นิสิตปัจจุบัน
   - เข้าถึงบริการสำหรับนิสิต
   - สร้างเนื้อหาได้

4. **Public User** - ผู้ใช้ทั่วไป
   - อ่านเนื้อหาที่เผยแพร่แล้ว
   - แสดงความคิดเห็น

## 🎨 Design System

- **Font**: Space Grotesk (Headings), Inter (Body)
- **Colors**: Blue (#2563eb), Indigo (#4f46e5)
- **UI Framework**: Shadcn UI with Tailwind CSS
- **Responsive**: Mobile-first approach

## 🔒 Security Features

- JWT token-based authentication
- Password hashing with bcrypt
- Protected routes
- CORS configuration
- Role-based access control

## 📱 PWA Features

- Installable on mobile devices
- Offline support
- Custom app icon
- Splash screen
- Service worker caching

## 🚀 Deployment

โปรเจกต์นี้ถูกออกแบบให้รันบน Kubernetes cluster พร้อม:
- Backend: Port 8001 (internal)
- Frontend: Port 3000 (internal)
- API routes: `/api/*` ถูก redirect ไปที่ backend
- External URL: ตาม REACT_APP_BACKEND_URL

## 📝 Development Roadmap

### Phase 1 (✅ เสร็จแล้ว)
- ✅ Authentication System
- ✅ Content Management
- ✅ User Profiles
- ✅ Comments System
- ✅ PWA Setup

### Phase 2 (Coming Soon)
- 🚧 Market Research Tools
- 🚧 Survey Builder
- 🚧 Conjoint Analysis
- 🚧 Data Visualization

### Phase 3 (Planned)
- 📋 Alumni Zone
- 📋 Networking Features
- 📋 External Integrations (LINE, Email, SMS)

### Phase 4 (Future)
- 📋 Advanced Analytics
- 📋 AI-powered Insights
- 📋 Export & Reporting Tools

## 🤝 Contributing

โปรเจกต์นี้ถูกออกแบบให้สามารถพัฒนาและเพิ่มฟีเจอร์ทีละส่วนได้ง่าย:
1. โครงสร้าง API มีความชัดเจน
2. Frontend components แยกเป็นหน้าๆ
3. Database schema ยืดหยุ่น
4. พร้อมเชื่อมต่อ external services

---

**Built with ❤️ for SWUMKT**
