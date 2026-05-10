import React, { useState } from 'react';

/**
 * BeMethodology — collapsible expand boxes that document EXACTLY how every
 * score on this dashboard is computed (Aaker-aligned). Sits at the bottom of
 * BrandEquityDashboardPage so curious / academic users can audit the math.
 *
 * Includes a placeholder for the future "Export as thesis report" feature
 * (currently disabled — to be unlocked for ADMIN / อาจารย์ / นิสิต).
 */

const SECTIONS = [
  {
    id: 'overall',
    eyebrow: 'METHOD · 00',
    title: 'Brand Equity Score (BES) · คะแนนรวม',
    short: 'น้ำหนัก default 25/25/25/25 ของ 4 มิติ — ปรับได้ที่ Wizard step 4',
    body: (
      <>
        <p><strong>BES = Σ (D<sub>i</sub> × w<sub>i</sub>) / Σw<sub>i</sub></strong></p>
        <p>เมื่อ D<sub>i</sub> = composite score ของแต่ละมิติ (0-100) และ w<sub>i</sub> = น้ำหนัก
          (default 25 ทุกมิติ; ปรับได้ที่ Wizard → "น้ำหนักมิติ")</p>
        <p>Tier mapping: ≥80 Champion · 65-79 Strong · 50-64 Healthy · 35-49 At Watch · &lt;35 At Risk</p>
        <p className="be-muted-line">มิติที่ไม่มี data จะถูก skip ออกจาก BES (ไม่นับเป็น 0)
          เพื่อไม่ให้ score ถูกดึงลงโดย artefact ของ data ขาด</p>
      </>
    ),
  },
  {
    id: 'awareness',
    eyebrow: 'METHOD · 01',
    title: 'Awareness · Aaker Awareness Pyramid',
    short: 'TOM 40% · Spontaneous 25% · Aided 20% · Familiarity 15%',
    body: (
      <>
        <p>Awareness ถูกวัดตามลำดับชั้น "Aaker Awareness Pyramid" — ยิ่งระดับสูงยิ่งสะท้อน
          memory strength มากกว่า:</p>
        <ul>
          <li><strong>Top-of-Mind (TOM) — น้ำหนัก 0.40</strong>
            <br/>คำถาม: <em>"นึกถึงแบรนด์ {`{category}`} แรกที่นึกถึง"</em> (open_short, ai_processing=extract_brand)
            <br/>Score = % ของ respondent ที่พิมพ์ชื่อ target brand เป็นชื่อแรก (AI-normalized)</li>
          <li><strong>Spontaneous / Unaided Recall — 0.25</strong>
            <br/>คำถาม: <em>"นึกถึงแบรนด์อื่นใน {`{category}`} อีกบ้าง"</em> (open_long, extract_brands)
            <br/>Score = share ของ target brand ใน mentions ทั้งหมด</li>
          <li><strong>Aided Recognition — 0.20</strong>
            <br/>คำถาม: <em>"แบรนด์ใดต่อไปนี้ที่คุณรู้จัก"</em> (mcq_multi)
            <br/>Score = % ของ respondent ที่ติ๊ก target brand</li>
          <li><strong>Brand Familiarity — 0.15</strong> (likert_5)
            <br/>Score = (mean−1)/4 × 100</li>
          <li><strong>Visual Recognition — 0.05-0.10</strong> (เมื่อมี logo asset)
            <br/>logo_unaided + logo_aided + color_recall</li>
        </ul>
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
            <br/>"เทียบ {`{brand}`} กับ {`{competitor}`}" — score = % เห็น brand ดีกว่า + half ของ neutral</li>
          <li><strong>Design / Aesthetics — 0.10</strong></li>
        </ul>
        <p className="be-muted-line">Open-ended <em>"อะไรทำให้คุณรู้สึกว่ามีคุณภาพ"</em> ไม่ใช่ score input
          แต่ feed AI theme extraction ในส่วน Insights</p>
      </>
    ),
  },
  {
    id: 'identity',
    eyebrow: 'METHOD · 03',
    title: 'Identity vs Image · อัตลักษณ์ vs ภาพลักษณ์',
    short: 'Trait Overlap 20% · Brand Promise 15% · Aaker 4 Perspectives ~50% · AI Alignment 10%',
    body: (
      <>
        <p>มิติที่ <strong>เปรียบเทียบ</strong> "Identity (ที่แบรนด์ตั้งใจสื่อ)" กับ "Image
          (ที่ลูกค้ารับรู้จริง)" — core ของ Aaker (1996)</p>
        <ul>
          <li><strong>Trait Pickup vs Intended — 0.20</strong> (trait_grid; key metric)
            <br/>คำถาม BI-1: <em>"เลือก 3-5 ข้อที่อธิบาย {`{brand}`} ได้ดีที่สุด"</em>
            <br/>Score = mean (% pickup ของ traits ที่อยู่ใน "Intended Identity") /
              จำนวน intended traits → ถ้าลูกค้าเลือก trait ที่แบรนด์ตั้งใจ ครบและถี่ → score สูง</li>
          <li><strong>Brand Promise Match — 0.15</strong> (BI-4 likert_5)
            <br/>"{`{brand}`} ทำตามสัญญา: '{`{brand_promise}`}'"</li>
          <li><strong>Aaker "Brand as ..." Perspectives</strong>:
            <ul>
              <li><em>as Organization</em> (Trust, Innovation, Responsibility) — 0.06+0.06+0.05</li>
              <li><em>as Person</em> (Personality grid, Relatable, Aspirational) — 0.06+0.05+0.06</li>
              <li><em>as Symbol</em> (Recognizability, Distinctiveness) — 0.06+0.06</li>
              <li><em>as Product</em> (Premium, Variety, Quality) — 0.06+0.05+0.04</li>
            </ul>
            รวม ~50% — ทุก likert_7 score = (mean−1)/6 × 100
          </li>
          <li><strong>AI Identity-Image Alignment — 0.10</strong>
            <br/>AI วิเคราะห์ open-ended (image_personality, image_one_word) แล้ว match กับ
              intended traits → alignment score 0-100 (ถ้ารัน AI แล้ว)</li>
        </ul>
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
    short: 'AI normalize → frequency stats → likert/NPS scoring → weighted composite',
    body: (
      <>
        <ol>
          <li><strong>Open-ended normalization</strong> (Gemini): canonicalize brand mentions
            (e.g. "starbuck", "Star Bucks" → "Starbucks") + group concept synonyms.
            ผลเก็บใน <code>ai_cache.normalized_by_question</code></li>
          <li><strong>Theme extraction</strong>: open_long → top 5 themes พร้อม sentiment + sample quote</li>
          <li><strong>Identity-Image AI</strong>: extract perceived traits จาก open-ended →
            จับคู่กับ Intended Identity → alignment score 0-100</li>
          <li><strong>Aggregate engine</strong> (`_aggregate_responses`):
            สร้าง stats ต่อ question (counts, mean, score_100) + composite ต่อ dimension</li>
          <li><strong>Filter / Wave compare</strong>: re-aggregate ตาม slice ของ time + segment;
            AI cache แยกตาม signature (SHA1 12-char) เพื่อ cache ผลลัพธ์ AI ต่อ filter</li>
        </ol>
        <p className="be-muted-line">References: Aaker (1991, 1996), Keller's CBBE (1993),
          Reichheld NPS (2003), Ehrenberg-Bass mental & physical availability</p>
      </>
    ),
  },
];


const CHAPTERS_META = [
  { ch: 1, title: 'บทที่ 1 — บทนำ',
    desc: 'ที่มา, วัตถุประสงค์, สมมติฐาน, ขอบเขต, ประโยชน์',
    draft: true },
  { ch: 2, title: 'บทที่ 2 — ทบทวนวรรณกรรม',
    desc: 'ทฤษฎี Aaker · Keller · Kapferer + งานวิจัยที่เกี่ยวข้อง + กรอบแนวคิด',
    draft: true },
  { ch: 3, title: 'บทที่ 3 — ระเบียบวิธีวิจัย',
    desc: 'Research design, สูตรการคำนวณทุกตัว, น้ำหนักของ signal, sampling',
    draft: false },
  { ch: 4, title: 'บทที่ 4 — ผลการศึกษา',
    desc: 'BES + 4 มิติ พร้อมตารางสถิติจริง, Identity vs Image, NPS',
    draft: false },
  { ch: 5, title: 'บทที่ 5 — สรุป อภิปราย ข้อเสนอแนะ',
    desc: 'อภิปรายผลกับทฤษฎี + ข้อเสนอแนะเชิงกลยุทธ์ 5-7 ข้อ + limitations',
    draft: false },
];

export const BeMethodology = ({
  canExportThesis = false,
  thesisProgress,            // 'idle' | 'starting' | 'chapter_X' | 'rendering' | 'failed'
  thesisError,               // optional error string
  selectedChapters,          // array of int
  onSelectedChaptersChange,  // (arr) => void
  extraPrompt,               // string
  onExtraPromptChange,       // (str) => void
  onStartThesisExport,       // () => void
}) => {
  const [openId, setOpenId] = useState(null);
  // Outer panels default closed — like the filter bar — to keep the report clean.
  const [methodOpen, setMethodOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const isWorking = thesisProgress && thesisProgress !== 'idle' && thesisProgress !== 'failed';
  const progressLabel = (() => {
    if (!thesisProgress || thesisProgress === 'idle') return '';
    if (thesisProgress === 'starting') return 'กำลังเริ่มงาน...';
    if (thesisProgress === 'queued')   return 'อยู่ในคิว...';
    if (thesisProgress === 'rendering') return 'กำลังสร้างไฟล์ DOCX...';
    if (thesisProgress === 'downloading') return 'กำลังดาวน์โหลด...';
    if ((thesisProgress || '').startsWith('chapter_')) {
      const ch = thesisProgress.replace('chapter_', '');
      return `AI กำลังเขียนบทที่ ${ch}...`;
    }
    return thesisProgress;
  })();

  const toggleChapter = (ch) => {
    if (!onSelectedChaptersChange) return;
    const set = new Set(selectedChapters || []);
    if (set.has(ch)) set.delete(ch); else set.add(ch);
    onSelectedChaptersChange(Array.from(set).sort((a, b) => a - b));
  };

  return (
    <section className="be-method-wrap" data-testid="be-methodology">
      {/* ============ Methodology — collapsed by default ============ */}
      <div className={`be-appendix-card ${methodOpen ? 'open' : ''}`}>
        <button type="button"
                className="be-appendix-toggle"
                data-testid="be-methodology-toggle"
                onClick={() => setMethodOpen(!methodOpen)}>
          <div className="be-appendix-toggle-text">
            <span className="be-mono be-tiny" style={{ letterSpacing: '0.16em', color: 'var(--be-red)' }}>
              ● METHODOLOGY · APPENDIX
            </span>
            <span className="be-appendix-title">วิธีคำนวณคะแนนทุกตัวบน dashboard นี้</span>
            <span className="be-appendix-short">
              Aaker-aligned weighted composite · 6 sections — สูตร น้ำหนัก และเหตุผลที่ใช้
            </span>
          </div>
          <span className="be-appendix-arrow">{methodOpen ? 'COLLAPSE ▲' : 'EXPAND ▼'}</span>
        </button>

        {methodOpen && (
          <div className="be-appendix-body" data-testid="be-methodology-body">
            <p className="be-method-lede">
              เราใช้สูตร <strong>Aaker-aligned weighted composite</strong> ที่ trace กลับไปงานวิจัย
              Aaker (1991, 1996) + Keller (1993) + Reichheld (2003) ได้ครบ
              — กดที่หัวข้อด้านล่างเพื่อดูสูตร น้ำหนัก และเหตุผลที่ใช้
            </p>
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

      {/* ============ Thesis Export — collapsed by default, role-gated ============ */}
      <div className={`be-appendix-card be-appendix-card--export ${exportOpen ? 'open' : ''}`}
           data-testid="be-thesis-export-card">
        <button type="button"
                className="be-appendix-toggle"
                data-testid="be-thesis-export-toggle"
                onClick={() => setExportOpen(!exportOpen)}>
          <div className="be-appendix-toggle-text">
            <span className="be-mono be-tiny" style={{ letterSpacing: '0.16em', color: 'var(--logo-blue)' }}>
              ◆ ACADEMIC EXPORT {canExportThesis ? '· AI-POWERED' : '· LOCKED'}
            </span>
            <span className="be-appendix-title">สร้างวิทยานิพนธ์ด้วย AI (DOCX, บทที่ 1-5)</span>
            <span className="be-appendix-short">
              {canExportThesis
                ? 'เลือกบทที่ต้องการ · ใส่ Extra Prompt · AI Gemini เขียนเนื้อหาทุกบท + APA 7 references'
                : 'เฉพาะ admin · อาจารย์ · นิสิต ที่ลงทะเบียนแล้ว'}
            </span>
          </div>
          <span className="be-appendix-arrow">{exportOpen ? 'COLLAPSE ▲' : 'EXPAND ▼'}</span>
        </button>

        {exportOpen && (
          <div className="be-appendix-body be-thesis-body" data-testid="be-thesis-export-body">
            {!canExportThesis && (
              <p className="be-thesis-lede">
                ฟีเจอร์นี้เปิดใช้สำหรับ <strong>admin · อาจารย์ · นิสิต</strong> เท่านั้น
                <br/>
                <span className="be-tiny be-muted">
                  หากท่านเป็นนิสิต/อาจารย์ — กรุณาลงทะเบียนกับระบบและ login ก่อน
                </span>
              </p>
            )}

            {canExportThesis && (
              <>
                <p className="be-thesis-lede">
                  AI Gemini จะเขียนเนื้อหาวิทยานิพนธ์ตามบทที่เลือก โดยใช้ <strong>ข้อมูลจริง</strong> จาก
                  study นี้ + อ้างอิงทฤษฎี <em>Aaker · Keller · Kapferer · Reichheld · Kotler</em>
                  ในรูปแบบ APA 7
                  <br/>
                  <span className="be-tiny be-muted">
                    หากเปิด filter อยู่ — รายงานจะ snapshot เฉพาะ slice นั้น
                  </span>
                </p>

                {/* ===== Chapter selection ===== */}
                <div className="be-thesis-block">
                  <div className="be-thesis-block-label">เลือกบทที่ต้องการ</div>
                  <div className="be-thesis-chapters">
                    {CHAPTERS_META.map(({ ch, title, desc, draft }) => {
                      const checked = (selectedChapters || []).includes(ch);
                      return (
                        <label key={ch}
                               className={`be-thesis-chapter ${checked ? 'on' : ''} ${draft ? 'draft' : ''}`}
                               data-testid={`be-thesis-chapter-${ch}`}>
                          <input type="checkbox"
                                 checked={checked}
                                 disabled={isWorking}
                                 onChange={() => toggleChapter(ch)}
                                 data-testid={`be-thesis-chapter-cb-${ch}`}/>
                          <div className="be-thesis-chapter-text">
                            <div className="be-thesis-chapter-title">
                              {title}
                              {draft && (
                                <span className="be-thesis-draft-tag" title="AI ร่างให้เท่านั้น — ผู้เขียนต้องไป fine-tune / revise เอง">
                                  ร่าง · DRAFT
                                </span>
                              )}
                            </div>
                            <div className="be-thesis-chapter-desc">{desc}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  <div className="be-tiny be-muted" style={{ marginTop: 6 }}>
                    บทที่ 1-2 เป็น <strong>ร่าง</strong> ไม่ได้อ้างจากข้อมูลจริง — ต้องนำไป fine-tune /
                    revise เองให้ตรงกับบริบทมหาวิทยาลัยและขอบเขตงาน
                  </div>
                </div>

                {/* ===== Extra prompt ===== */}
                <div className="be-thesis-block">
                  <div className="be-thesis-block-label">
                    คำสั่งเพิ่มเติม (Extra Prompt) — ไม่บังคับ
                  </div>
                  <textarea
                    className="be-thesis-textarea"
                    value={extraPrompt || ''}
                    disabled={isWorking}
                    onChange={(e) => onExtraPromptChange && onExtraPromptChange(e.target.value)}
                    placeholder="เช่น: เน้น positioning ระดับพรีเมียม, อ้างอิง Kotler มากขึ้น, เพิ่มมุมมอง Gen Z, ใช้ภาษาทางการมากขึ้น..."
                    data-testid="be-thesis-extra-prompt"/>
                  <div className="be-tiny be-muted" style={{ marginTop: 4 }}>
                    AI จะนำคำสั่งนี้ไปประกอบทุกบทที่เลือก
                  </div>
                </div>

                {/* ===== Generate button + progress ===== */}
                <div className="be-thesis-actions">
                  <button type="button"
                          className="be-thesis-btn"
                          disabled={!canExportThesis || isWorking || (selectedChapters || []).length === 0}
                          data-testid="be-thesis-export-btn"
                          onClick={onStartThesisExport}>
                    {isWorking
                      ? '⏳ ' + progressLabel
                      : `สร้างวิทยานิพนธ์ ${(selectedChapters || []).length} บท →`}
                  </button>
                  {isWorking && (
                    <div className="be-thesis-progress" data-testid="be-thesis-progress">
                      <div className="be-thesis-progress-bar"/>
                      <div className="be-tiny be-muted" style={{ marginTop: 6 }}>
                        {progressLabel} · ใช้เวลาประมาณ 30-90 วินาทีต่อบท
                      </div>
                    </div>
                  )}
                  {thesisProgress === 'failed' && thesisError && (
                    <div className="be-thesis-error" data-testid="be-thesis-error">
                      ✕ {thesisError}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

export default BeMethodology;
