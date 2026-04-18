// ============== FAKE DATA ==============

const CURRENT_USER = {
  id: 'u_me',
  name: 'ภูมิ วรรธนะ',
  nickname: 'ภูมิ',
  studentId: '64131xxxxx',
  gen: 64, // รหัส 64 = รุ่นที่ 24
  role: 'นิสิตปัจจุบัน',
  major: 'การตลาด',
  year: 'ปี 4',
  avatarHue: 210,
  company: null,
  position: 'นิสิตฝึกงาน @ Agoda',
  points: 1240,
  streak: 12,
  invites: 8,
  treeSize: 47,
  bio: 'ชอบ consumer insight และ growth marketing — กำลังหาที่ฝึกงานต่อ ปลายปี',
};

// Ancestor chain: take (พี่สายรหัส) → ปู่ → ทวด → เทียด
const ANCESTORS = [
  {
    id: 'u_take',
    name: 'ฟ้า ชนัญญา',
    nickname: 'ฟ้า',
    studentId: '61131xxxxx',
    gen: 61,
    relation: 'พี่ take',
    company: 'Unilever Thailand',
    position: 'Brand Manager, Hellmann\'s',
    years: 3,
    avatarHue: 340,
    verified: true,
    mutual: 12,
    online: true,
    tags: ['FMCG', 'Brand', 'CPG'],
    helpful: ['Brand strategy', 'Career advice', 'Interview prep'],
  },
  {
    id: 'u_pu',
    name: 'ดิน สิรวิชญ์',
    nickname: 'ดิน',
    studentId: '58131xxxxx',
    gen: 58,
    relation: 'ปู่',
    company: 'LINE MAN Wongnai',
    position: 'Head of Growth',
    years: 6,
    avatarHue: 190,
    verified: true,
    mutual: 34,
    tags: ['Tech', 'Growth', 'Product'],
    helpful: ['Growth', 'Mentorship', 'Refer งาน'],
  },
  {
    id: 'u_thuad',
    name: 'แพร พัทธนันท์',
    nickname: 'แพร',
    studentId: '55131xxxxx',
    gen: 55,
    relation: 'ทวด',
    company: 'Ogilvy Bangkok',
    position: 'Group Creative Director',
    years: 9,
    avatarHue: 20,
    verified: true,
    mutual: 58,
    tags: ['Agency', 'Creative', 'Advertising'],
    helpful: ['Portfolio review', 'Pitch', 'Creative direction'],
  },
  {
    id: 'u_thiad',
    name: 'กันต์ ศุภโชค',
    nickname: 'กันต์',
    studentId: '51131xxxxx',
    gen: 51,
    relation: 'เทียด',
    company: 'Sea (Shopee)',
    position: 'VP, Regional Marketing',
    years: 13,
    avatarHue: 280,
    verified: true,
    mutual: 112,
    tags: ['E-commerce', 'Regional', 'Leadership'],
    helpful: ['Mentorship', 'C-level intro', 'Startup advice'],
  },
  {
    id: 'u_kun',
    name: 'อ.ศรีรัตน์ ธนิต',
    nickname: 'พี่อิ๊ก',
    studentId: '47131xxxxx',
    gen: 47,
    relation: 'เทียดทวด',
    company: 'Founder · Studio Soi',
    position: 'Co-founder & CSO',
    years: 17,
    avatarHue: 130,
    verified: true,
    mutual: 203,
    tags: ['Founder', 'Brand', 'Consulting'],
    helpful: ['Founder stories', 'Investor intro', 'Brand consulting'],
  },
];

// Descendants (น้อง take)
const DESCENDANTS = [
  { id: 'd1', name: 'ใบเตย ธัญพร', gen: 66, relation: 'น้อง take', avatarHue: 45, online: true, company: 'กำลังศึกษา · ปี 2' },
  { id: 'd2', name: 'บาส ศุภกร', gen: 66, relation: 'น้อง take', avatarHue: 220, company: 'กำลังศึกษา · ปี 2' },
  { id: 'd3', name: 'มายด์ นภัสสร', gen: 67, relation: 'เหลน', avatarHue: 300, company: 'กำลังศึกษา · ปี 1' },
];

// Suggested to add to tree
const PENDING_MARKS = [
  { id: 'p1', name: 'พลอย วรางคณา', gen: 63, avatarHue: 350, hint: 'พี่กิจกรรม MK Nights 2023' },
  { id: 'p2', name: 'ต้น วรุตม์', gen: 62, avatarHue: 100, hint: 'เจอกันในกรุ๊ป "ตลาดสาย T-Shirt"' },
];

// Discover — interesting people you're connected to via chain
const DISCOVER = [
  {
    id: 'disc1',
    name: 'จีน่า ธันยชนก',
    position: 'Head of Marketing · LINE MAN',
    gen: 56,
    degree: 'ทวดของทวด',
    steps: ['ภูมิ', 'ฟ้า (พี่)', 'ดิน (ปู่)', 'แพร (ทวด)', 'จีน่า'],
    reason: 'ทำงานสาย growth ที่คุณสนใจ · รับ mentee 1 คน/ไตรมาส',
    tags: ['Growth', 'Tech', 'Rising star'],
    avatarHue: 15,
    heat: 92,
  },
  {
    id: 'disc2',
    name: 'เบนซ์ กฤตานนท์',
    position: 'Founder · Pomelo Fashion',
    gen: 48,
    degree: 'เทียดของเทียด',
    steps: ['ภูมิ', 'ฟ้า', 'ดิน', 'แพร', 'กันต์', 'เบนซ์'],
    reason: 'Founder e-comm ที่ระดมทุน Series C · เคยแชร์ playbook ใน AMA',
    tags: ['Founder', 'Fashion', 'E-commerce'],
    avatarHue: 260,
    heat: 87,
  },
  {
    id: 'disc3',
    name: 'นุ่น อนัญญา',
    position: 'Creative Planner · Wieden+Kennedy',
    gen: 59,
    degree: 'ปู่ของทวด',
    steps: ['ภูมิ', 'ฟ้า', 'ดิน', 'แพร', 'นุ่น'],
    reason: 'เคยรีวิว portfolio น้อง take มาแล้ว 23 คน',
    tags: ['Creative', 'Agency', 'Review portfolio'],
    avatarHue: 75,
    heat: 78,
  },
];

// Reviews of พี่ take / ปู่ / ทวด
const REVIEWS = [
  {
    id: 'r1',
    reviewer: { name: 'มีน ปิยวรรณ', gen: 63, avatarHue: 320 },
    subject: ANCESTORS[0],
    rating: 5,
    category: 'พี่ take',
    text: 'ฟ้าแนะนำตั้งแต่ปี 1 — ให้หนังสือมาอ่าน 3 เล่ม พาไปเที่ยวตึกคณะคืนแรก และช่วย refer เข้า internship ที่ Unilever จริง ❤️',
    helpful: 42,
    time: '2 สัปดาห์ที่แล้ว',
  },
  {
    id: 'r2',
    reviewer: { name: 'โอ๊ต ชานนท์', gen: 64, avatarHue: 190 },
    subject: ANCESTORS[1],
    rating: 5,
    category: 'ปู่',
    text: 'พี่ดินเปิด AMA ทุกเดือน ตอบทุกคำถามเรื่อง growth marketing — เคยเอา case study จริงมาสอนน้อง take 2 ชั่วโมงเต็ม',
    helpful: 67,
    time: '1 เดือนที่แล้ว',
  },
  {
    id: 'r3',
    reviewer: { name: 'แก้ม นภัส', gen: 62, avatarHue: 30 },
    subject: ANCESTORS[2],
    rating: 4,
    category: 'ทวด',
    text: 'พี่แพรมีประโยชน์มากสำหรับคนสาย agency — รีวิว reel ให้แบบตรงมาก แต่ต้องจองคิวล่วงหน้า 2-3 อาทิตย์',
    helpful: 28,
    time: '2 เดือนที่แล้ว',
  },
];

// Feed
const FEED = [
  {
    id: 'f1',
    type: 'throwback',
    author: { name: 'พี่ใบเฟิร์น · รุ่น 52', gen: 52, avatarHue: 200 },
    content: '2004 — ตลาดนัดคณะครั้งแรกที่เราช่วยกันจัด 🎪 ใครยังจำได้บ้าง? สมัยนั้นยังไม่มีตึก 14',
    image: 'throwback',
    reactions: { like: 342, heart: 89, wow: 23 },
    comments: 56,
    time: '3 ชั่วโมงที่แล้ว',
  },
  {
    id: 'f2',
    type: 'announcement',
    author: { name: 'คณะการตลาด มศว', gen: null, avatarHue: null, verified: true, isOrg: true },
    content: 'รับสมัคร mentor โครงการ "สายตระกูลติดปีก" — เปิดให้รุ่น 55 ขึ้นไป รับ mentee 1-2 คน/เทอม',
    cta: 'สมัครเป็น mentor',
    reactions: { like: 128, heart: 42 },
    comments: 18,
    time: 'เมื่อวาน',
  },
  {
    id: 'f3',
    type: 'job',
    author: { name: 'พี่ดิน · ปู่ของภูมิ', gen: 58, avatarHue: 190 },
    content: 'ทีม growth ที่ LINE MAN เปิดรับ Marketing Associate — refer น้อง MKT SWU ได้โดยตรง งานจริง',
    job: { title: 'Marketing Associate', company: 'LINE MAN Wongnai', salary: '35-45K', type: 'Full-time' },
    reactions: { like: 89, heart: 34 },
    comments: 12,
    time: 'เมื่อวาน',
  },
  {
    id: 'f4',
    type: 'review',
    author: { name: 'มีน · รุ่น 63', gen: 63, avatarHue: 320 },
    content: 'รีวิว 5 ดาวให้พี่ฟ้า (พี่ take) — ช่วย refer เข้า Unilever ได้จริง ❤️',
    reviewSubject: 'พี่ฟ้า ชนัญญา · รุ่น 61',
    rating: 5,
    reactions: { like: 42, heart: 28 },
    comments: 6,
    time: '2 วันที่แล้ว',
  },
];

// Jobs
const JOBS = [
  {
    id: 'j1',
    title: 'Marketing Associate',
    company: 'LINE MAN Wongnai',
    companyLogo: 'LM',
    companyColor: '#06C755',
    type: 'Full-time',
    salary: '35,000 - 45,000 ฿',
    location: 'BKK · Hybrid',
    referrer: { name: 'พี่ดิน', relation: 'ปู่', gen: 58, avatarHue: 190 },
    tags: ['Growth', 'B2C', 'Tech'],
    posted: '2 วันที่แล้ว',
    applicants: 12,
  },
  {
    id: 'j2',
    title: 'Brand Executive (FMCG)',
    company: 'Unilever Thailand',
    companyLogo: 'UL',
    companyColor: '#1F36C7',
    type: 'Full-time',
    salary: '40,000 - 55,000 ฿',
    location: 'BKK · On-site',
    referrer: { name: 'พี่ฟ้า', relation: 'พี่ take', gen: 61, avatarHue: 340 },
    tags: ['FMCG', 'Brand', 'Entry-level OK'],
    posted: '5 วันที่แล้ว',
    applicants: 34,
  },
  {
    id: 'j3',
    title: 'Creative Strategist Intern',
    company: 'Ogilvy Bangkok',
    companyLogo: 'OG',
    companyColor: '#C8102E',
    type: 'Internship · 6 เดือน',
    salary: '15,000 ฿',
    location: 'BKK · On-site',
    referrer: { name: 'พี่แพร', relation: 'ทวด', gen: 55, avatarHue: 20 },
    tags: ['Agency', 'Creative', 'Portfolio needed'],
    posted: '1 สัปดาห์ที่แล้ว',
    applicants: 48,
  },
  {
    id: 'j4',
    title: 'Social Media Manager',
    company: 'Pomelo Fashion',
    companyLogo: 'PM',
    companyColor: '#E91E63',
    type: 'Full-time',
    salary: '45,000 - 60,000 ฿',
    location: 'BKK · Hybrid',
    referrer: { name: 'พี่เบนซ์', relation: 'เทียดของเทียด · ผ่าน 4 ทอด', gen: 48, avatarHue: 260 },
    tags: ['Fashion', 'E-commerce', 'Content'],
    posted: '3 วันที่แล้ว',
    applicants: 19,
  },
];

// Alumni-owned businesses
const BUSINESSES = [
  { id: 'b1', name: 'Roast Coffee & Eatery', owner: 'พี่แป้ง · รุ่น 49', category: 'Café · EmQuartier', perk: 'ลด 15% โชว์ student ID', avatarHue: 25 },
  { id: 'b2', name: 'Studio Soi', owner: 'อ.ศรีรัตน์ · รุ่น 47', category: 'Branding Agency', perk: 'ให้คำปรึกษา brand ฟรี 1 ชม./เดือน', avatarHue: 130 },
  { id: 'b3', name: 'กระโปรงแม่ภา', owner: 'ภา · รุ่น 60', category: 'E-commerce · Fashion', perk: 'โค้ดส่วนลด MKTSWU20', avatarHue: 310 },
  { id: 'b4', name: 'Nong Data Labs', owner: 'พี่น้อง · รุ่น 57', category: 'Consulting · Data', perk: 'Workshop ฟรีให้รุ่นน้อง', avatarHue: 200 },
];

// Stats for landing
const STATS = {
  alumni: 2847,
  current: 412,
  companies: 683,
  connections: 18452,
  jobsReferred: 234,
};

window.DATA = {
  CURRENT_USER, ANCESTORS, DESCENDANTS, PENDING_MARKS,
  DISCOVER, REVIEWS, FEED, JOBS, BUSINESSES, STATS,
};
