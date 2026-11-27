import React, { useState } from 'react';

/**
 * BeMethodology — collapsible expand boxes that document EXACTLY how every
 * score on this dashboard is computed (Aaker-aligned). Sits at the bottom of
 * BrandEquityDashboardPage so curious / academic users can audit the math.
 *
 * Every formula here must match backend/routes/brand_equity.py
 * (DIMENSION_WEIGHTS, _compute_dim_composite, _question_signal_100,
 * BE_ANALYSIS_SCHEMA_VERSION = 2). The thesis export UI lives in BeThesisExport.jsx.
 */

const SECTIONS = [
  {
    id: 'overall',
    eyebrow: 'METHOD · 00',
    title: 'Brand Equity Score (BES) · คะแนนรวม',
    short: 'น้ำหนัก default 25/25/25/25 ของ 4 มิติ — ปรับได้จากปุ่ม "น้ำหนักมิติ" บนหน้านี้',
    body: (
      <>
        <p><strong>BES = Σ (D<sub>i</sub> × w<sub>i</sub>) / Σw<sub>i</sub></strong></p>
        <p>เมื่อ D<sub>i</sub> = composite score ของแต่ละมิติ (0-100) และ w<sub>i</sub> = น้ำหนัก
          (default 25 ทุกมิติ — ไม่มีงานวิจัยกำหนดว่าควรเป็นเท่าไร จึงถ่วงเท่ากันเป็นค่ากลาง;
          ปรับได้จากปุ่ม <strong>"น้ำหนักมิติ"</strong> ที่หัวหน้า dashboard หรือปุ่มด้านล่างนี้
          แล้วคะแนนจะคำนวณใหม่ทันที)</p>
        <p>Tier mapping: ≥80 Champion · 65-79 Strong · 50-64 Healthy · 35-49 At Watch · &lt;35 At Risk
          (สเกลชุดเดียวกันทุกหน้าจอ รวมถึงการ์ดหน้าแรกและไฟล์วิทยานิพนธ์)</p>
        <p className="be-muted-line">มิติที่ไม่มี data จะถูก skip ออกจาก BES (ไม่นับเป็น 0)
          เพื่อไม่ให้ score ถูกดึงลงโดย artefact ของ data ขาด</p>
      </>
    ),
  },
  {
    id: 'awareness',
    eyebrow: 'METHOD · 01',
    title: 'Awareness · Aaker Awareness Pyramid',
    short: 'TOM 40% · Unaided recall (รวม) 25% · Aided 20% · Familiarity 15%',
    body: (
      <>
        <p>Awareness ถูกวัดตามลำดับชั้น "Aaker Awareness Pyramid" — ยิ่งระดับสูงยิ่งสะท้อน
          memory strength มากกว่า:</p>
        <ul>
          <li><strong>Top-of-Mind (TOM) — น้ำหนัก 0.40</strong>
            <br/>คำถาม: <em>"นึกถึงแบรนด์ {`{category}`} แรกที่นึกถึง"</em> (open_short, ai_processing=extract_brand)
            <br/>Score = % ของ respondent ที่พิมพ์ชื่อ target brand เป็นชื่อแรก (AI-normalized)</li>
          <li><strong>Spontaneous / Unaided Recall — 0.25</strong>
            <br/>คำถาม AW-2: <em>"นอกจากแบรนด์ข้างต้น นึกถึงแบรนด์อะไรอีกบ้าง"</em> (open_long)
            <br/>Score = % ของผู้ตอบที่<strong>เอ่ยชื่อ target brand โดยไม่มีตัวช่วย ไม่ว่าจะเป็นแบรนด์แรก (TOM) หรือที่นึกถึงทีหลัง (AW-2)</strong>
              (<code>total_unaided_pct</code>) — เดิมนับเฉพาะ AW-2 ซึ่งถามหา "แบรนด์อื่น" จึงทำให้แบรนด์ที่ทุกคนนึกถึงเป็นอันดับแรกได้คะแนนใกล้ 0</li>
          <li><strong>Aided Recognition — 0.20</strong>
            <br/>คำถาม: <em>"แบรนด์ใดต่อไปนี้ที่คุณรู้จัก"</em> (mcq_multi)
            <br/>Score = % ของ respondent ที่ติ๊ก target brand</li>
          <li><strong>Brand Familiarity — 0.15</strong> (likert_5)
            <br/>Score = (mean−1)/4 × 100</li>
        </ul>
        <p>น้ำหนัก 4 ตัวนี้รวมเป็น 1.00 พอดี · <strong>คำถามด้านภาพ (logo / สี)</strong> ถูกจัดอยู่ใน
          dimension <em>identity</em> จึงไม่ได้เข้าสูตร Awareness (ก่อนหน้านี้ตารางน้ำหนักระบุไว้ 0.25
          แต่จับคู่กับคำถามไม่ได้เลย ทำให้น้ำหนักรวมเป็น 1.25)</p>
        <p>TOM และ Unaided Recall เป็นคำถามปลายเปิด — ระบบ<strong>นับชื่อแบรนด์จากข้อความได้เองโดยไม่ต้องรอ AI</strong>
          (จับคู่ชื่อแบบตรงตัวก่อน แล้วจึงใช้ token ที่ไม่กำกวม) การเข้ารหัสคำตอบ (ด้วย AI ของระบบ, AI ที่คุณใช้เองแล้ววางผลกลับ หรือด้วยมือผ่านสเปรดชีต)
          เพิ่มความแม่นกับคำสะกดผิด ชื่อเล่น และคำทับศัพท์ · รหัสนับต่อ "ข้อความคำตอบที่ไม่ซ้ำ" จึงใช้กับทุก filter / segment / wave ·
          หน้า dashboard แสดงว่าแต่ละข้อนับด้วยฐานไหน (AI / ด้วยมือ / อัตโนมัติ) และข้อที่ยังไม่เข้ารหัสจะแจ้งว่า "ยังไม่ได้เข้ารหัส" แทนการแสดงเลขศูนย์</p>
        <p>น้ำหนักจะ <strong>renormalize</strong> เมื่อ signal บางตัวไม่มี — เช่น study ที่ไม่ใส่
          AW-4 likert ก็ยังได้ Awareness composite จาก 3 signal ที่เหลือ</p>
      </>
    ),
  },
  {
    id: 'quality',
    eyebrow: 'METHOD · 02',
    title: 'Perceived Quality · คุณภาพที่รับรู้',
    short: 'Overall 35% · Reliability 20% · Value 20% · vs Competitor 15% · Design 10%',
    body: (
      <>
        <ul>
          <li><strong>Overall Quality — 0.35</strong> (likert_7)
            <br/>"โดยรวม {`{brand}`} มีคุณภาพระดับใด" — score = (mean−1)/6 × 100</li>
          <li><strong>Reliability — 0.20</strong> ไว้ใจได้ ทำงานตามที่คาดหวัง</li>
          <li><strong>Value-for-Money — 0.20</strong> คุ้มค่ากับราคา</li>
          <li><strong>Comparative vs Competitor — 0.15</strong> (comparative_7 semantic differential)
            <br/>"เทียบ {`{brand}`} กับ {`{competitor}`}" — แบรนด์เราอยู่ซ้ายเสมอ (1) คู่แข่งอยู่ขวา (7)
            <br/>score = <strong>(7 − mean) / 6 × 100</strong> · mean 1 = เราชนะเต็ม (100), mean 4 = เสมอ (50), mean 7 = แพ้ (0)</li>
          <li><strong>Design / Aesthetics — 0.10</strong></li>
        </ul>
        <p className="be-muted-line">น้ำหนัก 5 ตัวรวมเป็น 1.00 · คำถาม "คุณภาพในมุม as Product" อยู่ใน
          dimension identity จึงไม่ได้เข้าสูตรนี้</p>
        <p className="be-muted-line">คุณลักษณะที่ผู้ใช้เพิ่มเองซึ่งเป็น<strong>ข้อความเชิงลบ</strong>
          (เช่น "แพงเกินไป") ต้องประกาศ polarity ไว้ ระบบจะกลับคะแนนให้ (reverse coding);
          ถ้ายังไม่ประกาศ ระบบจะ<strong>ตั้งธงเตือนและไม่นำเข้าคะแนน</strong> แทนการนับเป็นข้อดี</p>
        <p className="be-muted-line">Open-ended <em>"อะไรทำให้คุณรู้สึกว่ามีคุณภาพ"</em> ไม่ใช่ score input
          แต่ feed AI theme extraction ในส่วน Insights</p>
      </>
    ),
  },
  {
    id: 'identity',
    eyebrow: 'METHOD · 03',
    title: 'Identity vs Image · อัตลักษณ์ vs ภาพลักษณ์',
    short: 'Trait Overlap 20% · Brand Promise 15% · Aaker 4 Perspectives 61% (น้ำหนักสัมพัทธ์ ปรับสัดส่วนใหม่ตามข้อที่มีข้อมูล)',
    body: (
      <>
        <p>มิติที่ <strong>เปรียบเทียบ</strong> "Identity (ที่แบรนด์ตั้งใจสื่อ)" กับ "Image
          (ที่ลูกค้ารับรู้จริง)" — core ของ Aaker (1996)</p>
        <ul>
          <li><strong>Trait Pickup vs Intended — 0.20</strong> (trait_grid; key metric)
            <br/>คำถาม BI-1: <em>"เลือก 3-5 ข้อที่อธิบาย {`{brand}`} ได้ดีที่สุด"</em>
            <br/>Score = ค่าเฉลี่ย % ที่ถูกเลือกของ intended traits <strong>ที่ปรากฏใน grid จริง</strong>
              แล้วหารด้วย<strong>เพดานที่ทำได้</strong> (จำนวนที่เลือกได้สูงสุด ÷ จำนวน intended traits)
            <br/><span className="be-muted-line">เดิมหารด้วยจำนวน intended traits ตรง ๆ ทำให้แบรนด์ที่ทุกคน
              รับรู้ตรงเป๊ะได้แค่ 41.7 คะแนนถ้าใส่ 12 traits แต่ได้ 100 ถ้าใส่ 3 traits — ตัววัดวัด
              "จำนวน trait ที่พิมพ์เข้าไป" ไม่ใช่ตัวแบรนด์</span></li>
          <li><strong>Brand Promise Match — 0.15</strong> (BI-4 likert_5)
            <br/>"{`{brand}`} ทำตามสัญญา: '{`{brand_promise}`}'"</li>
          <li><strong>Aaker "Brand as ..." Perspectives</strong>:
            <ul>
              <li><em>as Organization</em> (Trust, Innovation, Responsibility) — 0.06+0.06+0.05</li>
              <li><em>as Person</em> (Personality grid, Relatable, Aspirational) — 0.06+0.05+0.06
                <br/><span className="be-muted-line">Personality grid ใช้คลังคำบุคลิกที่ทับกับ intended
                  traits เพียง 2 จาก 17 คำ — ถ้าคำถามไม่มี intended trait ให้เลือกเลย ระบบจะ
                  <strong>ตัดข้อนั้นออกจากคะแนน</strong> ไม่ใช่ให้ 0 (การให้ 0 คือการลงโทษแบรนด์
                  ด้วยข้อจำกัดของแบบสอบถาม)</span></li>
              <li><em>as Symbol</em> (Recognizability, Distinctiveness) — 0.06+0.06</li>
              <li><em>as Product</em> (Premium, Variety, Quality) — 0.06+0.05+0.04</li>
            </ul>
            รวม 0.61 ของน้ำหนักมิตินี้ (0.96 รวมทุกข้อ — ระบบหารด้วยผลรวมน้ำหนักของข้อที่มีข้อมูลจริง) — ทุก likert_7 score = (mean−1)/6 × 100
          </li>
        </ul>
        <p><strong>การเปลี่ยนแปลง (schema v2, พ.ย. 2026):</strong> "คะแนนความสอดคล้อง Identity–Image ที่ AI ให้" <strong>ไม่ได้เข้าสูตร Identity อีกแล้ว</strong>
          (เดิมถ่วง 10%) เพราะเป็นความเห็นของโมเดลภาษา ไม่ใช่การวัด — ตอบไม่เหมือนกันทุกครั้ง และผลจาก AI ภายนอกที่นำเข้ามาก็แก้ตัวเลขนี้ได้เอง
          ตอนนี้แสดงเป็น <em>"ความเห็นของ AI (ไม่ใช่คะแนน)"</em> เคียงกับกราฟ aligned / lost / unintended traits เท่านั้น
          ส่วนที่วัดจริงคือ Trait Pickup (BI-1) ซึ่งนับจากการเลือกของผู้ตอบ</p>
      </>
    ),
  },
  {
    id: 'loyalty',
    eyebrow: 'METHOD · 04',
    title: 'Loyalty · ความภักดี',
    short: 'NPS 40% · Repurchase Intent 30% · Switching Resistance 30%',
    body: (
      <>
        <ul>
          <li><strong>NPS (Net Promoter Score) — 0.40</strong> (nps_0_10)
            <br/>"คุณจะแนะนำ {`{brand}`} ให้เพื่อน/ครอบครัว" 0-10
            <br/>NPS = % Promoters (9-10) − % Detractors (0-6); แสดง 0-100 scale = (NPS+100)/2</li>
          <li><strong>Repurchase Intent — 0.30</strong> (likert_7)
            <br/>"ครั้งหน้าจะเลือก {`{brand}`} แน่นอน"</li>
          <li><strong>Switching Resistance — 0.30</strong> (likert_7)
            <br/>"ถ้าคู่แข่งลดราคา 20% คุณจะยังเลือก {`{brand}`}"</li>
        </ul>
        <p>Aaker (1991) Loyalty Levels: Switcher → Habitual → Satisfied → Friend of brand → Committed.
          NPS เป็น behavioral predictor ที่ดีที่สุดเชิงสถิติ จึง weight 0.40</p>
      </>
    ),
  },
  {
    id: 'data',
    eyebrow: 'METHOD · 05',
    title: 'Data Pipeline · การประมวลผลข้อมูล',
    short: 'เข้ารหัสคำตอบปลายเปิด → สถิติรายข้อ → คะแนน 0-100 → composite ถ่วงน้ำหนัก',
    body: (
      <>
        <ol>
          <li><strong>Open-ended coding</strong>: รวมชื่อแบรนด์ที่สะกดต่างกัน
            (เช่น "starbuck", "Star Bucks" → "Starbucks") และจัดคำสำคัญที่ความหมายเดียวกัน — ทำได้ 3 ทาง:
            AI ของระบบ · AI ของผู้ใช้เอง (คัดลอกพรอมต์ → วางผล JSON กลับ) · ด้วยมือผ่านสเปรดชีต (codeframe.csv)
            ทุกทางใช้ตัวตรวจรูปแบบเดียวกัน และหน้าจอระบุที่มาของรหัส (ชื่อโมเดลที่ผู้ใช้ระบุ) · ถ้ายังไม่เข้ารหัส ชื่อแบรนด์จะถูกนับด้วยการจับคู่อัตโนมัติ</li>
          <li><strong>Theme extraction</strong>: open_long → ประเด็นพร้อม sentiment + คำพูดตัวอย่าง · จำนวนต่อประเด็น<strong>ระบบนับเองจากรหัสคำตอบ</strong> ไม่รับตัวเลขจาก AI</li>
          <li><strong>Identity-Image (AI)</strong>: สกัดภาพลักษณ์ที่รับรู้จากคำตอบปลายเปิดแล้วเทียบกับ Intended Identity
            — เป็นความเห็นเชิงคุณภาพ ไม่เข้าคะแนน</li>
          <li><strong>Aggregate engine</strong> (`_aggregate_responses`):
            สร้าง stats ต่อ question (counts, mean, score_100) + composite ต่อ dimension</li>
          <li><strong>Filter / Wave compare</strong>: re-aggregate ตาม slice ของ time + segment;
            ผล AI แยกตาม filter signature (SHA1 12-char) ส่วนรหัสคำตอบนับใหม่ทุก slice</li>
          <li><strong>Data quality</strong>: ตั้งธง speeder (&lt; 40% ของเวลามัธยฐาน), straight-liner (ตอบค่าเดียวซ้ำ ≥ 8 ข้อมาตรวัด), คำตอบซ้ำ —
            รายงานเท่านั้น ผู้วิจัยเลือกตัดเองด้วย "ตัดผู้ตอบที่น่าสงสัย"</li>
        </ol>
        <p><strong>เวอร์ชันของวิธีคำนวณ:</strong> schema v2 (พ.ย. 2026) เปลี่ยนตัวเลขที่แสดงของ Identity, Awareness และ α
          (ดูหัวข้อ Identity / Awareness / ความน่าเชื่อถือ) — ตัวเลขที่เคยเห็นหรือส่งออกไว้ก่อนหน้านี้อาจต่างจากปัจจุบัน
          <strong>โดยที่แบรนด์ไม่ได้เปลี่ยน</strong> ประวัติคะแนนบน dashboard คำนวณใหม่ด้วยสูตรปัจจุบันทั้งหมด จึงเทียบกันเองได้</p>
        <p className="be-muted-line">References: Aaker (1991, 1996), Keller (1993, 2001),
          Reichheld (2003), Ehrenberg-Bass mental & physical availability</p>
      </>
    ),
  },
  {
    id: 'validity',
    eyebrow: 'METHOD · 06',
    title: 'ความน่าเชื่อถือและข้อจำกัด · Reliability & Limitations',
    short: 'Cronbach\u2019s α · 95% CI · paired test เทียบคู่แข่ง · สิ่งที่เครื่องมือนี้ไม่ได้ทำ',
    body: (
      <>
        <p><strong>สิ่งที่รายงานจริง</strong></p>
        <ul>
          <li><strong>Cronbach's α ต่อมิติ</strong> (Cronbach, 1951) — คำนวณจากข้อ Likert ในมิติเดียวกัน
            พร้อม mean inter-item r, จำนวนข้อ (k), n, <strong>corrected item-total r และ α-if-item-deleted</strong> รายข้อ ·
            ข้อที่เป็นข้อความเชิงลบถูกกลับคะแนนก่อน (ข้อที่ยังไม่ยืนยันทิศทางถูกตัดออก) · ใช้เฉพาะผู้ตอบที่ตอบครบทุกข้อ (listwise) ·
            ถ้า k &lt; 2 หรือ n &lt; 30 หรือความแปรปรวนเป็น 0 ระบบจะ<strong>แจ้งว่าประเมินไม่ได้ ไม่ใส่ค่าเดา</strong></li>
          <li><strong>95% Confidence Interval</strong>: ค่าเฉลี่ยข้อมาตรวัด (t-distribution), สัดส่วนของตัวเลือก/แบรนด์ (Wilson),
            NPS (ความแปรปรวนแบบ trinomial), unaided recall รวม</li>
          <li><strong>Margin of error</strong> สูงสุดของสัดส่วนที่ 95% (p = .5, สมมติการสุ่มอย่างง่าย)</li>
          <li><strong>Paired t-test แบรนด์ vs คู่แข่ง</strong> (ผู้ตอบคนเดียวกันให้คะแนนทั้งสองแบรนด์, คะแนน POMP 0-100) พร้อมผลต่าง 95% CI,
            Cohen&apos;s d<sub>z</sub> (Cohen, 1988) และ<strong>ปรับ p ด้วย Holm (1979)</strong> ข้ามทุกการเปรียบเทียบ ·
            ข้อเปรียบเทียบตรง 7 ระดับทดสอบเทียบจุดกึ่งกลาง (one-sample t)</li>
          <li><strong>Wave vs wave / segment</strong>: Welch t-test (wave) และ Welch ANOVA + post-hoc ปรับ Holm (segment) ต่อมิติ — BES เป็นดัชนี จึงไม่ถูกทดสอบโดยตรง</li>
          <li><strong>ความไวของ BES ต่อน้ำหนัก</strong>: BES เมื่อถ่วงเท่ากัน และช่วงเมื่อปรับน้ำหนักมิติใดมิติหนึ่ง ×½/×2 พร้อมบอกว่า tier คงเดิมหรือไม่</li>
          <li><strong>Sample adequacy</strong> 4 ระดับ (&lt;10 / &lt;30 / &lt;100 / ≥100) แสดงคู่กับคะแนนรวมเสมอ</li>
          <li><strong>POMP transform</strong> (ค่าเฉลี่ย−1)/(สูงสุด−1)×100 ตาม Cohen, Cohen, Aiken &amp; West (1999)</li>
        </ul>
        <p><strong>ข้อจำกัดที่ต้องเขียนในรายงาน</strong></p>
        <ul>
          <li><strong>ไม่ได้คำนวณ McDonald&apos;s ω, Composite Reliability (CR), AVE และ EFA / CFA</strong>
            (Fornell &amp; Larcker, 1981) — จึงไม่ได้ยืนยันโครงสร้างองค์ประกอบ convergent / discriminant validity ·
            ถ้าต้องใช้ ให้ส่งออกข้อมูลดิบ (xlsx/csv + codebook) ไปวิเคราะห์ใน SPSS / R / JASP</li>
          <li>BES เป็น <strong>weighted composite index</strong> ไม่ใช่ latent variable — น้ำหนักมาจากกรอบทฤษฎี
            ไม่ได้ประมาณค่าจากข้อมูล</li>
          <li>การทดสอบนัยสำคัญบอกว่าความต่าง<strong>ไม่น่าเกิดจากความบังเอิญของการสุ่มในกลุ่มตัวอย่างนี้</strong> ไม่ได้รับรองว่าเป็นตัวแทนประชากร
            และเมื่อทดสอบหลายครั้ง "ยังไม่มีนัยสำคัญ" ไม่ได้แปลว่าไม่ต่าง · ยัง<strong>ไม่มีการทดสอบความต่างของ BES ระหว่าง wave</strong></li>
          <li>ผู้ตอบบางส่วนให้คะแนนคุณภาพ/ความภักดีทั้งที่ไม่ได้ติ๊กว่ารู้จักแบรนด์ (ธง "unaware rater") — แบบสอบถามยังไม่ได้คัดกรองผู้ไม่รู้จักแบรนด์ออก</li>
          <li>ความภักดีวัดเชิงทัศนคติ (NPS, ความตั้งใจซื้อซ้ำ) ไม่ได้วัดพฤติกรรมซื้อจริง · ข้อ "คุ้มค่ากับราคา" ใกล้เคียง perceived value (Zeithaml, 1988) มากกว่า perceived quality</li>
          <li>ผู้ตอบมาจาก<strong>การเลือกแบบสะดวก (convenience sampling)</strong> ผ่านลิงก์ที่แชร์
            ไม่ใช่ตัวแทนประชากรแบบสุ่ม</li>
        </ul>
        <p className="be-muted-line">References: Cronbach (1951); Nunnally &amp; Bernstein (1994);
          Cohen (1988); Cohen, Cohen, Aiken &amp; West (1999); Holm (1979); Fornell &amp; Larcker (1981);
          Zeithaml (1988); J. L. Aaker (1997) Dimensions of Brand Personality</p>
      </>
    ),
  },
];


export const BeMethodology = ({
  onOpenWeights,             // () => void — opens the dimension-weight editor (owner only)
}) => {
  const [openId, setOpenId] = useState(null);
  // Outer panels default closed — like the filter bar — to keep the report clean.
  const [methodOpen, setMethodOpen] = useState(false);

  return (
    <section className="be-method-wrap" data-testid="be-methodology">
      {/* ============ Methodology — collapsed by default ============ */}
      <div className={`be-appendix-card ${methodOpen ? 'open' : ''}`}>
        <button type="button"
                className="be-appendix-toggle"
                data-testid="be-methodology-toggle"
                aria-expanded={methodOpen}
                onClick={() => setMethodOpen(!methodOpen)}>
          <div className="be-appendix-toggle-text">
            <span className="be-mono be-tiny" style={{ letterSpacing: '0.16em', color: 'var(--be-red)' }}>
              ● METHODOLOGY · APPENDIX
            </span>
            <span className="be-appendix-title">วิธีคำนวณคะแนนทุกตัวบน dashboard นี้</span>
            <span className="be-appendix-short">
              Aaker-aligned weighted composite · schema v2 — สูตร น้ำหนัก และเหตุผลที่ใช้
            </span>
          </div>
          <span className="be-appendix-arrow">{methodOpen ? 'COLLAPSE ▲' : 'EXPAND ▼'}</span>
        </button>

        {methodOpen && (
          <div className="be-appendix-body" data-testid="be-methodology-body">
            <p className="be-method-lede">
              เราใช้สูตร <strong>Aaker-aligned weighted composite</strong> ที่ trace กลับไปงานวิจัย
              Aaker (1991, 1996) + Keller (1993) + Reichheld (2003) ได้
              — กดที่หัวข้อด้านล่างเพื่อดูสูตร น้ำหนัก และเหตุผลที่ใช้
            </p>
            {onOpenWeights && (
              <button type="button" className="be-btn" style={{ marginBottom: 14 }}
                      onClick={onOpenWeights} data-testid="be-methodology-open-weights">
                ปรับน้ำหนักมิติของ study นี้ →
              </button>
            )}
            <div className="be-method-list">
              {SECTIONS.map(s => (
                <div key={s.id}
                     className={`be-method-item ${openId === s.id ? 'open' : ''}`}
                     data-testid={`be-method-item-${s.id}`}>
                  <button type="button"
                          className="be-method-toggle"
                          data-testid={`be-method-toggle-${s.id}`}
                          onClick={() => setOpenId(openId === s.id ? null : s.id)}>
                    <div className="be-method-toggle-text">
                      <span className="be-mono be-tiny" style={{ color: 'var(--ink-3)' }}>{s.eyebrow}</span>
                      <span className="be-method-title">{s.title}</span>
                      <span className="be-method-short">{s.short}</span>
                    </div>
                    <span className="be-method-arrow">{openId === s.id ? '−' : '+'}</span>
                  </button>
                  {openId === s.id && (
                    <div className="be-method-body" data-testid={`be-method-body-${s.id}`}>
                      {s.body}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

    </section>
  );
};

export default BeMethodology;
