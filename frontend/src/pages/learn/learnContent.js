/* SEO content database for /learn/* articles
   Each article targets specific Thai marketing keywords and links into the platform tools.
   Long-form Thai content with English keyword variants for SEO ranking. */

export const ARTICLES = {
  'brand-equity': {
    slug: 'brand-equity',
    title: 'Brand Equity คืออะไร · เข้าใจคุณค่าแบรนด์ตามแนว Aaker',
    titleEn: 'What is Brand Equity? Aaker Framework Explained',
    description: 'Brand Equity (แบรนด์เอควิตี้) คือคุณค่าของแบรนด์ที่สร้างความได้เปรียบในตลาด เรียนรู้กรอบ Aaker 4 มิติ — Awareness, Quality, Identity, Loyalty พร้อมเครื่องมือวัดผลฟรีจาก SWU MKT',
    keywords: 'brand equity คือ, แบรนด์เอควิตี้, Aaker framework, brand awareness, perceived quality, brand identity, brand loyalty, การวัดคุณค่าแบรนด์',
    category: 'BRAND STRATEGY',
    readMin: 9,
    publishedAt: '2026-02-01',
    updatedAt: '2026-02-06',
    tool: { name: 'Brand Health Check', path: '/brand-equity', description: 'สร้าง survey วัด Brand Equity ตาม Aaker framework — ฟรี + AI insights' },
    related: ['conjoint-analysis', 'positioning-strategy', 'customer-perception'],
    image: 'https://images.unsplash.com/photo-1645658043538-fc2bb1702cfe?crop=entropy&cs=srgb&fm=jpg&w=900&q=85',
    sections: [
      {
        h: 'Brand Equity คืออะไร',
        body: `**Brand Equity (แบรนด์เอควิตี้)** หรือ "คุณค่าของแบรนด์" คือสินทรัพย์ทางการตลาดที่ผู้บริโภคให้กับแบรนด์ — ไม่ได้อยู่ในงบดุล แต่กำหนดราคา ส่วนแบ่งตลาด และความสามารถในการขยายไลน์สินค้า กรอบ **Aaker (1991)** จัดโครงสร้าง Brand Equity ออกเป็น 4 มิติหลัก ที่งานวิจัยตลาดของ SWU MKT ใช้เป็นมาตรฐาน:

**1. Brand Awareness — การจดจำแบรนด์** วัดว่าผู้บริโภคนึกถึงแบรนด์เราในหมวดสินค้าได้แค่ไหน (Top-of-mind, Unaided recall, Aided recognition)

**2. Perceived Quality — คุณภาพที่รับรู้** การประเมินคุณภาพจากมุมผู้บริโภค ซึ่งมักไม่ตรงกับคุณภาพจริงเสมอไป

**3. Brand Identity vs Image — อัตลักษณ์เทียบภาพลักษณ์** ส่วนต่างระหว่างสิ่งที่แบรนด์ตั้งใจสื่อสาร กับสิ่งที่ผู้บริโภครับรู้จริง

**4. Brand Loyalty — ความภักดี** อัตราการซื้อซ้ำ + Net Promoter Score + ราคาเปรียบเทียบที่ลูกค้ายอมจ่าย`,
      },
      {
        h: 'ทำไม Brand Equity ถึงสำคัญ',
        body: `แบรนด์ที่มี Brand Equity สูงสามารถ **ตั้งราคาพรีเมียมได้ ~20-30% เหนือคู่แข่ง** (Interbrand 2024) มีต้นทุนการได้ลูกค้าใหม่ต่ำกว่า และสามารถ extend brand ไปสินค้าใหม่ได้สำเร็จมากกว่า

ในเชิงวิจัย การวัด Brand Equity เป็นพื้นฐานของ:
- การวาง **Positioning Strategy** ที่ชัดเจน
- การประเมินผลแคมเปญโฆษณา (pre-post test)
- การทำ **Brand Tracking** รายไตรมาส
- การตัดสินใจ M&A และการประเมินมูลค่าแบรนด์`,
      },
      {
        h: 'วิธีวัด Brand Equity ด้วย Survey',
        body: `แบบสอบถาม Brand Equity ที่มาตรฐานควรมีอย่างน้อย 18-24 คำถาม ครอบคลุมทั้ง 4 มิติ:

- **AW-1 Top of mind**: "เมื่อพูดถึง [หมวด] แบรนด์แรกที่นึกถึงคืออะไร?" (open-ended)
- **PQ-1 Overall quality**: 7-point Likert
- **BI-1 Image traits**: trait grid 3-5 ข้อจาก pool
- **LY-1 NPS**: 0-10 likelihood to recommend
- **LY-2 Repurchase intent**: 5-point scale

ขนาดกลุ่มตัวอย่างที่ยอมรับได้: **n ≥ 100** สำหรับ pilot, **n ≥ 384** สำหรับ population estimate ที่ confidence 95%`,
      },
      {
        h: 'จาก Survey สู่ Insight ด้วย AI',
        body: `เครื่องมือ **Brand Health Check** ของ SWU MKT รวมการสร้าง survey อัตโนมัติ + การวิเคราะห์ข้อมูลด้วย AI (Gemini 2.5):

1. **Auto-generate questions** ปรับตามแบรนด์/หมวด/คู่แข่งของคุณ
2. **Identity-Image alignment**: AI วิเคราะห์ว่าภาพลักษณ์ที่ผู้บริโภครับรู้ ตรงกับ identity ที่ตั้งใจไว้แค่ไหน
3. **Master Insights**: 5 actionable recommendations พร้อม cited evidence
4. **Brand Association** ตามกรอบ Aaker 4 perspectives (Organization / Person / Symbol / Product)`,
      },
    ],
  },

  'conjoint-analysis': {
    slug: 'conjoint-analysis',
    title: 'Conjoint Analysis คืออะไร · เทคนิควิจัยตลาดที่นักการตลาดต้องรู้',
    titleEn: 'Conjoint Analysis Explained — A Practical Guide for Marketers',
    description: 'Conjoint Analysis (การวิเคราะห์ประกอบ) คือเทคนิควิจัยตลาดที่ใช้คำนวณ Part-worth Utility ของคุณสมบัติสินค้า เรียนรู้ Choice-Based Conjoint, D-Optimal Design และวิธีจำลอง Market Share',
    keywords: 'conjoint analysis คือ, choice-based conjoint, CBC, part-worth utility, market share simulation, D-optimal design, willingness to pay, การวิเคราะห์ประกอบ',
    category: 'RESEARCH METHOD',
    readMin: 11,
    publishedAt: '2026-02-01',
    updatedAt: '2026-02-06',
    tool: { name: 'Conjoint Analysis Tool', path: '/market-research/conjoint-analysis', description: 'สร้าง CBC study ตั้งแต่ qualitative → D-optimal design → market simulation' },
    related: ['brand-equity', 'segmentation-targeting', 'marketing-research-methods'],
    image: 'https://images.unsplash.com/photo-1533750349088-cd871a92f312?crop=entropy&cs=srgb&fm=jpg&w=900&q=85',
    sections: [
      {
        h: 'Conjoint Analysis คืออะไร',
        body: `**Conjoint Analysis** เป็นเทคนิควิจัยตลาดที่ใช้แยกแยะว่า "คุณสมบัติไหนของสินค้า" สำคัญต่อการตัดสินใจซื้อมากที่สุด โดยให้ผู้ตอบเลือกระหว่างชุดสินค้าจำลอง (profiles) ที่ผสมผสานคุณสมบัติต่างกัน

แทนที่จะถามตรงๆ ว่า "คุณให้ความสำคัญกับราคาแค่ไหน" ซึ่งคนมักตอบไม่ตรงพฤติกรรมจริง Conjoint บังคับให้ผู้ตอบ **trade-off** ระหว่างคุณสมบัติ — ผลที่ได้สะท้อน real-world preference ดีกว่ามาก`,
      },
      {
        h: 'Choice-Based Conjoint (CBC) — มาตรฐานปัจจุบัน',
        body: `CBC ให้ผู้ตอบเลือก 1 ตัวเลือกจาก 3-4 profiles ใน 8-15 task รวม จากนั้นใช้ **Multinomial Logit (MNL)** หรือ **Hierarchical Bayes (HB)** ประมาณค่า Part-worth Utility

**Part-worth Utility** บอกว่า "ระดับ" ของคุณสมบัตินั้นเพิ่ม/ลดความน่าจะเป็นในการเลือกซื้อแค่ไหน เช่น:
- ราคา 199 บาท: utility +0.8
- ราคา 299 บาท: utility +0.2
- ราคา 399 บาท: utility -0.6

**Importance Score** = (max utility - min utility) / sum of all attribute ranges`,
      },
      {
        h: 'D-Optimal Design ทำไมสำคัญ',
        body: `Full factorial design (ทุก combinations) สำหรับ 5 attributes × 3 levels = 243 profiles — เป็นไปไม่ได้ในการสำรวจจริง

**D-Optimal Design** คือการเลือก subset ของ profiles ที่ minimum determinant ของ information matrix → ทำให้ประมาณ utility ได้แม่นที่สุดด้วยจำนวน task ที่น้อยที่สุด

แอป SWU MKT ใช้ algorithm จาก **scikit-learn + custom optimizer** สร้าง D-optimal CBC อัตโนมัติ`,
      },
      {
        h: 'Market Share Simulator',
        body: `เมื่อมี Part-worth utilities แล้ว เราสามารถจำลอง market share ของสินค้าใหม่ได้ด้วย **Logit Choice Rule**:

\`P(Brand A) = exp(U_A) / Σ exp(U_i)\`

ใช้ตอบคำถามเชิงกลยุทธ์:
- ถ้าเราเพิ่ม feature X ราคาขึ้น 50 บาท จะได้ market share เท่าไร
- คู่แข่งลดราคาลง 20% เราต้องตอบโต้ยังไง
- Cannibalization: สินค้าใหม่จะกินส่วนแบ่งของไลน์เดิมเราเองหรือคู่แข่ง`,
      },
      {
        h: 'Cases การประยุกต์ใช้',
        body: `- **FMCG**: ทดสอบ packaging × price × promotion combinations
- **Telecom**: ออกแบบ data plan ใหม่ที่ดึงลูกค้าจากคู่แข่ง
- **Banking**: feature mix ของบัตรเครดิตที่ต้องการลูกค้าวัย Gen Z
- **Healthcare**: medication adherence — co-pay × dosing × side-effects
- **Public Policy**: choice experiment สำหรับ traffic policy, healthcare access`,
      },
    ],
  },

  'customer-journey-mapping': {
    slug: 'customer-journey-mapping',
    title: 'Customer Journey Mapping · แผนที่การเดินทางของลูกค้า ฉบับสมบูรณ์',
    titleEn: 'Customer Journey Mapping — A Complete Practical Guide',
    description: 'Customer Journey Map คือเครื่องมือออกแบบประสบการณ์ลูกค้าตลอด 5 stages — Awareness, Consideration, Purchase, Retention, Advocacy เรียนรู้ touchpoints, pain points และ moments of truth',
    keywords: 'customer journey map, customer journey คือ, touchpoint, pain point, moment of truth, AIDA model, customer experience, CX, ประสบการณ์ลูกค้า',
    category: 'CUSTOMER EXPERIENCE',
    readMin: 8,
    publishedAt: '2026-02-02',
    updatedAt: '2026-02-06',
    tool: { name: 'Customer Journey Tool', path: '/market-research', description: 'แม็พ touchpoints + pain points ทั้ง funnel ด้วย LLM-assisted analysis' },
    related: ['customer-perception', 'customer-behavior', '4ps-marketing-mix'],
    image: 'https://images.unsplash.com/photo-1533750349088-cd871a92f312?crop=entropy&cs=srgb&fm=jpg&w=900&q=85',
    sections: [
      {
        h: 'Customer Journey คืออะไร',
        body: `**Customer Journey** คือลำดับขั้นที่ผู้บริโภคผ่านตั้งแต่รู้จักแบรนด์ครั้งแรกจนกลายเป็นแฟนตัวยง โมเดล modern ส่วนใหญ่แบ่งเป็น 5 stages:

1. **Awareness** — รู้จัก / เห็นโฆษณา
2. **Consideration** — เปรียบเทียบกับคู่แข่ง
3. **Purchase** — ตัดสินใจซื้อ
4. **Retention** — ใช้งานซ้ำ
5. **Advocacy** — แนะนำต่อคนอื่น`,
      },
      {
        h: 'Touchpoints และ Pain Points',
        body: `**Touchpoint** = จุดสัมผัสระหว่างลูกค้ากับแบรนด์ (เว็บ, แอป, SMS, ร้านค้า, call center, social, LINE OA)

**Pain Point** = อุปสรรค/ความน่ารำคาญที่ลูกค้าเจอในแต่ละ touchpoint เช่น checkout flow ยาวเกิน, รอ admin LINE 3 ชั่วโมง

**Moment of Truth (MoT)** = touchpoint ที่ตัดสินผลการ convert จริงๆ — ส่วนใหญ่อยู่ใน stage Consideration → Purchase`,
      },
      {
        h: 'วิธีสร้าง Journey Map',
        body: `1. **กำหนด persona** — เลือก 1-2 segment เป้าหมาย อย่าทำหลายๆ persona พร้อมกัน
2. **สัมภาษณ์ลูกค้าจริง 8-12 คน** ถามคำถามแบบ retrospective ("เล่าให้ฟังครั้งล่าสุดที่ซื้อ...")
3. **Plot timeline** วาง stages ในแนวนอน, touchpoints ในแนวตั้ง
4. **Layer emotions** ใส่กราฟอารมณ์ (😡 → 😐 → 😍) ในแต่ละขั้น
5. **Identify gaps** — ที่ไหนคือ moment ที่อารมณ์ดิ่งที่สุด → priority แก้ก่อน`,
      },
    ],
  },

  'customer-perception': {
    slug: 'customer-perception',
    title: 'Customer Perception · การรับรู้ของลูกค้า ที่กำหนดยอดขายของแบรนด์',
    titleEn: 'Customer Perception — How Consumers Form Their Opinions',
    description: 'Customer Perception คือกระบวนการรับรู้ของผู้บริโภคที่ส่งผลต่อพฤติกรรมการซื้อ เรียนรู้ Selective Attention, Perceptual Map และ Sentiment Analysis ด้วย AI',
    keywords: 'customer perception, การรับรู้ของลูกค้า, perceptual map, sentiment analysis, selective attention, perception คืออะไร',
    category: 'CONSUMER PSYCHOLOGY',
    readMin: 7,
    publishedAt: '2026-02-03',
    updatedAt: '2026-02-06',
    tool: { name: 'Customer Perception Tool', path: '/market-research', description: 'วิเคราะห์ perception map + sentiment ของแบรนด์ vs คู่แข่ง' },
    related: ['brand-equity', 'positioning-strategy', 'customer-behavior'],
    image: 'https://images.unsplash.com/photo-1645658043538-fc2bb1702cfe?crop=entropy&cs=srgb&fm=jpg&w=900&q=85',
    sections: [
      {
        h: 'Perception ≠ Reality',
        body: `ในการตลาด **"การรับรู้คือความจริง"** — สิ่งที่ลูกค้าคิดว่าแบรนด์เป็น สำคัญกว่าสิ่งที่แบรนด์เป็นจริง เพราะมันกำหนดการตัดสินใจซื้อ

กระบวนการรับรู้ผ่าน 3 ขั้น:
1. **Selective Exposure** — เห็น/ไม่เห็น
2. **Selective Attention** — สนใจ/ไม่สนใจ
3. **Selective Retention** — จำ/ลืม`,
      },
      {
        h: 'Perceptual Map',
        body: `**Perceptual Map** คือการ plot แบรนด์บน 2 axes (เช่น price × quality, traditional × modern) เพื่อหาช่องว่างในตลาดที่ยังไม่มีแบรนด์ครอง

วิธีสร้าง:
1. ทำ survey ให้ผู้บริโภค rate แต่ละแบรนด์ตาม attributes 7-10 ข้อ
2. ใช้ **Multi-Dimensional Scaling (MDS)** หรือ **Factor Analysis** ลดมิติ
3. Plot บน 2D — แบรนด์ที่อยู่ใกล้กัน = competitor ตรงๆ`,
      },
      {
        h: 'AI-Powered Sentiment Analysis',
        body: `ในยุค social media การวัด perception ทำได้แบบ real-time ด้วย:
- **Sentiment Analysis** บน comments/reviews (positive/neutral/negative)
- **Topic Modeling** หาประเด็นที่ลูกค้าพูดถึงบ่อย (LDA, BERTopic)
- **Aspect-Based Sentiment** วิเคราะห์ feeling ต่อ feature เฉพาะ (เช่น "บริการเร็ว แต่อาหารแพง")

แอป SWU MKT รวม **Gemini 2.5 multimodal** เพื่อวิเคราะห์ทั้งข้อความและรูปภาพ`,
      },
    ],
  },

  'customer-behavior': {
    slug: 'customer-behavior',
    title: 'Consumer Behavior · พฤติกรรมผู้บริโภค ที่นักการตลาดควรเข้าใจ',
    titleEn: 'Consumer Behavior — Understanding the Modern Buyer',
    description: 'Consumer Behavior คือการศึกษากระบวนการตัดสินใจซื้อของผู้บริโภค เรียนรู้ Maslow Hierarchy, EBM Model, FMCG vs Durables behavior และ Generational shift',
    keywords: 'consumer behavior คือ, พฤติกรรมผู้บริโภค, EBM model, Maslow, decision making process, generational marketing, Gen Z behavior',
    category: 'CONSUMER PSYCHOLOGY',
    readMin: 7,
    publishedAt: '2026-02-03',
    updatedAt: '2026-02-06',
    tool: { name: 'Customer Behavior Tool', path: '/market-research', description: 'วิเคราะห์ purchase decision factors + segmentation behavior' },
    related: ['customer-perception', 'segmentation-targeting', 'customer-journey-mapping'],
    image: 'https://images.unsplash.com/photo-1533750349088-cd871a92f312?crop=entropy&cs=srgb&fm=jpg&w=900&q=85',
    sections: [
      {
        h: '5-Stage Decision Process',
        body: `Engel-Blackwell-Miniard (EBM) Model อธิบายว่า ผู้บริโภคผ่าน 5 ขั้นในการตัดสินใจซื้อ:

1. **Need Recognition** — รู้ตัวว่ามีปัญหา/ต้องการ
2. **Information Search** — หาข้อมูล (Google, รีวิว, ถามเพื่อน)
3. **Evaluation of Alternatives** — เปรียบเทียบ
4. **Purchase Decision** — ซื้อจริง
5. **Post-Purchase Evaluation** — พอใจ/ไม่พอใจ → influence การซื้อครั้งหน้า`,
      },
      {
        h: 'Maslow และแรงจูงใจ',
        body: `Maslow's Hierarchy of Needs ยังคงใช้กันมากในการวาง messaging:
- **Physiological** (อาหาร, น้ำ) → FMCG, ขนส่ง
- **Safety** → ประกัน, ธนาคาร
- **Belonging** → social media, fashion
- **Esteem** → luxury, premium brand
- **Self-actualization** → education, art, experiences`,
      },
      {
        h: 'พฤติกรรมที่ต่างกันตาม Product Category',
        body: `- **High-involvement** (รถ, บ้าน, เครื่องใช้ไฟฟ้า): research นาน, compare หลายๆ option, ราคาสำคัญ
- **Low-involvement** (ขนม, น้ำดื่ม): habitual buying, brand loyalty ต่ำ, packaging/promotion สำคัญ
- **Variety-seeking** (รสชาติเครื่องดื่ม): switch บ่อยเพื่อหาความใหม่
- **Dissonance-reducing** (ของขวัญ, ของแต่งบ้าน): กลัวซื้อผิด → ต้องการ social proof`,
      },
    ],
  },

  'positioning-strategy': {
    slug: 'positioning-strategy',
    title: 'Positioning Strategy · การวางตำแหน่งแบรนด์ ฉบับ Trout & Ries',
    titleEn: 'Brand Positioning Strategy — A Modern Application',
    description: 'Positioning คือการวางตำแหน่งแบรนด์ในใจผู้บริโภค เรียนรู้ Trout & Ries framework, Positioning Statement template, และ Repositioning Cases',
    keywords: 'positioning คืออะไร, brand positioning, positioning statement, Trout Ries, repositioning, การวางตำแหน่งแบรนด์, USP',
    category: 'BRAND STRATEGY',
    readMin: 8,
    publishedAt: '2026-02-04',
    updatedAt: '2026-02-06',
    tool: { name: 'Brand Equity Tool', path: '/brand-equity', description: 'วัด positioning gap ระหว่าง intended identity vs perceived image' },
    related: ['brand-equity', 'segmentation-targeting', 'customer-perception'],
    image: 'https://images.unsplash.com/photo-1645658043538-fc2bb1702cfe?crop=entropy&cs=srgb&fm=jpg&w=900&q=85',
    sections: [
      {
        h: 'Positioning คืออะไร',
        body: `**Al Ries & Jack Trout** (1981) นิยามว่า "Positioning ไม่ใช่สิ่งที่คุณทำกับสินค้า แต่เป็นสิ่งที่คุณทำกับใจของลูกค้า" — คือการสร้าง association ที่ unique ในใจผู้บริโภคจนแบรนด์เรากลายเป็น default choice ในหมวดนั้น`,
      },
      {
        h: 'Positioning Statement Template',
        body: `\`สำหรับ [target customer] ที่ต้องการ [need] แบรนด์ของเราคือ [category] ที่ [unique benefit] เพราะ [reason to believe]\`

ตัวอย่าง:
> สำหรับนักศึกษาที่ต้องการอาหารเช้าเร็วและถูก แบรนด์ A คือเครือข่ายร้านอาหารที่ "ส่งฟรีในชั่วโมงแรกของวัน" เพราะมีคลังกระจาย 200 จุดในกรุงเทพ`,
      },
      {
        h: 'Strategies การ Position',
        body: `- **Attribute positioning** — Volvo = ปลอดภัย
- **Benefit positioning** — Crest = ฟันขาว
- **User positioning** — Marlboro = ผู้ชายแกร่ง
- **Competitor positioning** — Avis "We try harder" (เทียบกับ Hertz)
- **Quality/Price** — IKEA = ดีไซน์ดี + ราคาต่ำ
- **Cultural symbol** — Apple = creative class`,
      },
    ],
  },

  'segmentation-targeting': {
    slug: 'segmentation-targeting',
    title: 'STP Marketing · Segmentation, Targeting, Positioning ฉบับ Kotler',
    titleEn: 'STP Marketing — Segmentation, Targeting, Positioning',
    description: 'STP คือกระบวนการ 3 ขั้นในการวางกลยุทธ์การตลาด เริ่มจาก Segmentation (แบ่งตลาด), Targeting (เลือกกลุ่ม), Positioning (วางตำแหน่ง) เรียนรู้ตัวแปรและเทคนิค',
    keywords: 'STP คือ, market segmentation, targeting, positioning, demographic segmentation, psychographic, Kotler, การแบ่งกลุ่มตลาด',
    category: 'MARKETING STRATEGY',
    readMin: 8,
    publishedAt: '2026-02-04',
    updatedAt: '2026-02-06',
    tool: { name: 'Customer Behavior Tool', path: '/market-research', description: 'segmentation analysis ด้วย LLM-clustering' },
    related: ['positioning-strategy', 'customer-behavior', '4ps-marketing-mix'],
    image: 'https://images.unsplash.com/photo-1533750349088-cd871a92f312?crop=entropy&cs=srgb&fm=jpg&w=900&q=85',
    sections: [
      {
        h: 'S — Segmentation',
        body: `แบ่งตลาดเป็นกลุ่มย่อยตาม:
- **Demographic** — อายุ, เพศ, รายได้, การศึกษา
- **Geographic** — ภูมิภาค, เมือง/ชนบท, climate
- **Psychographic** — lifestyle, ค่านิยม, personality (VALS framework)
- **Behavioral** — การใช้งาน, occasion, loyalty status

เทคนิควิเคราะห์: K-means clustering, Latent Class Analysis (LCA), Conjoint-based segmentation`,
      },
      {
        h: 'T — Targeting',
        body: `เลือก segment ที่จะเข้าถึง 5 กลยุทธ์:
1. **Undifferentiated** — ตลาดเดียวกันหมด (mass marketing)
2. **Differentiated** — หลาย segment พร้อมกัน
3. **Concentrated** — focus segment เดียว (niche)
4. **Micro-marketing** — ระดับ local หรือ individual
5. **Customized** — 1-to-1 marketing (D2C model)

เกณฑ์ประเมิน segment น่าสนใจ: ขนาดใหญ่พอ, growth rate สูง, accessibility, profitability, fit กับ company strength`,
      },
      {
        h: 'P — Positioning',
        body: `→ ลึกในบทความ [Positioning Strategy](/learn/positioning-strategy)`,
      },
    ],
  },

  '4ps-marketing-mix': {
    slug: '4ps-marketing-mix',
    title: '4Ps Marketing Mix · สูตรการตลาดคลาสสิกที่ยังใช้ได้ + 7Ps',
    titleEn: '4Ps Marketing Mix Explained — Plus the 7Ps Extension',
    description: '4Ps Marketing Mix (Product, Price, Place, Promotion) คือพื้นฐานของแผนการตลาดทุกแบรนด์ เรียนรู้การประยุกต์กับธุรกิจบริการผ่าน 7Ps',
    keywords: '4P marketing, 7P marketing, marketing mix, product price place promotion, ส่วนประสมการตลาด, McCarthy',
    category: 'MARKETING FUNDAMENTALS',
    readMin: 6,
    publishedAt: '2026-02-05',
    updatedAt: '2026-02-06',
    tool: { name: 'Marketing Research', path: '/market-research', description: 'เครื่องมือวางแผน + วิจัย Marketing Mix' },
    related: ['segmentation-targeting', 'positioning-strategy', 'customer-journey-mapping'],
    image: 'https://images.unsplash.com/photo-1533750349088-cd871a92f312?crop=entropy&cs=srgb&fm=jpg&w=900&q=85',
    sections: [
      {
        h: 'Product, Price, Place, Promotion',
        body: `เสนอโดย **E. Jerome McCarthy (1960)** เป็น 4 ตัวแปรหลักที่นักการตลาดควบคุมได้:

- **Product**: feature, design, packaging, brand, warranty
- **Price**: list price, discounts, payment terms, credit
- **Place**: channels, coverage, locations, logistics
- **Promotion**: advertising, PR, sales promotion, personal selling, digital

ความท้าทายของยุคนี้ Place และ Promotion เปลี่ยนจาก mass-media → digital + omnichannel`,
      },
      {
        h: '7Ps สำหรับธุรกิจบริการ',
        body: `Booms & Bitner (1981) ขยายเป็น 7Ps เพิ่ม:
- **People** — พนักงาน, training, attitude
- **Process** — service blueprint, queue management
- **Physical Evidence** — สิ่งแวดล้อม, packaging, uniforms

ธุรกิจที่ควรใช้ 7Ps: ร้านอาหาร, healthcare, education, banking, hospitality`,
      },
    ],
  },

  'swot-analysis': {
    slug: 'swot-analysis',
    title: 'SWOT Analysis · วิเคราะห์ธุรกิจให้ครบทุกมุม',
    titleEn: 'SWOT Analysis — A Strategic Planning Framework',
    description: 'SWOT (Strengths, Weaknesses, Opportunities, Threats) คือ framework วิเคราะห์กลยุทธ์ที่ใช้ได้ตั้งแต่ startup ถึง multinational เรียนรู้ TOWS Matrix และวิธีหา insight',
    keywords: 'SWOT analysis คือ, TOWS matrix, strategic planning, business analysis, การวิเคราะห์ SWOT',
    category: 'STRATEGIC PLANNING',
    readMin: 5,
    publishedAt: '2026-02-05',
    updatedAt: '2026-02-06',
    tool: { name: 'Customer Journey Tool', path: '/market-research', description: 'ใช้ AI ช่วยร่าง SWOT จากผลวิจัยตลาด' },
    related: ['marketing-research-methods', 'positioning-strategy'],
    image: 'https://images.unsplash.com/photo-1533750349088-cd871a92f312?crop=entropy&cs=srgb&fm=jpg&w=900&q=85',
    sections: [
      {
        h: 'SWOT 4 มิติ',
        body: `**Internal** (ควบคุมได้):
- **Strengths**: brand, team, IP, capital, supply chain
- **Weaknesses**: skills gap, legacy systems, low awareness

**External** (ควบคุมไม่ได้):
- **Opportunities**: market growth, new tech, regulation change
- **Threats**: new competitor, economic downturn, substitution`,
      },
      {
        h: 'TOWS Matrix — เปลี่ยน SWOT เป็น Action',
        body: `SWOT ธรรมดาบอกแค่ "เรามีอะไร" แต่ TOWS Matrix สร้าง strategy ผ่าน 4 combinations:

- **SO** (Strength × Opportunity): aggressive growth
- **ST** (Strength × Threat): defensive, leverage strength
- **WO** (Weakness × Opportunity): turnaround, fix weakness
- **WT** (Weakness × Threat): defensive, minimize loss`,
      },
    ],
  },

  'marketing-research-methods': {
    slug: 'marketing-research-methods',
    title: 'Marketing Research Methods · 7 วิธีวิจัยตลาดที่ทุกแบรนด์ควรรู้',
    titleEn: 'Marketing Research Methods — Quant, Qual, and Hybrid',
    description: 'รวมวิธีวิจัยตลาด 7 แบบ — Survey, In-depth Interview, Focus Group, Conjoint, Eye-tracking, A/B Test, Ethnographic เปรียบเทียบ Quant vs Qual',
    keywords: 'marketing research, การวิจัยตลาด, qualitative research, quantitative research, focus group, A/B testing, survey research',
    category: 'RESEARCH METHOD',
    readMin: 9,
    publishedAt: '2026-02-05',
    updatedAt: '2026-02-06',
    tool: { name: 'Brand Equity + Conjoint', path: '/market-research', description: 'รวมเครื่องมือวิจัยทั้งหมดของ SWU MKT' },
    related: ['conjoint-analysis', 'brand-equity', 'customer-perception'],
    image: 'https://images.unsplash.com/photo-1533750349088-cd871a92f312?crop=entropy&cs=srgb&fm=jpg&w=900&q=85',
    sections: [
      {
        h: 'Quantitative — เน้นตัวเลข',
        body: `1. **Survey** (online/offline) — ใหญ่, statistical inference, generalizable
2. **A/B Test** — causal evidence, fast iteration
3. **Conjoint Analysis** — preference modeling, market simulation
4. **Eye-tracking + Click-tracking** — UX/packaging research`,
      },
      {
        h: 'Qualitative — เน้นเข้าใจลึก',
        body: `5. **In-depth Interview (IDI)** — 60-90 min, semi-structured, n=12-20 reach saturation
6. **Focus Group** — 6-10 คน, group dynamics, ใช้ moderator
7. **Ethnographic / Observational** — ดูลูกค้าใช้งานจริงในบริบทธรรมชาติ`,
      },
      {
        h: 'เลือกวิธีไหนเมื่อไร',
        body: `- **Discovery phase**: qualitative ก่อน (IDI, ethno) → หา hypothesis
- **Validation phase**: quantitative (survey, conjoint) → ยืนยัน + measure
- **Optimization phase**: A/B test, eye-tracking
- **Tracking phase**: panel survey รายไตรมาส`,
      },
    ],
  },
};

export const ARTICLE_LIST = Object.values(ARTICLES).sort((a, b) =>
  (b.publishedAt || '').localeCompare(a.publishedAt || '')
);
