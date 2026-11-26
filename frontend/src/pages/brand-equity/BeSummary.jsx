import React from 'react';
import { DIMENSIONS } from './be-components';
import { fmt0, fmt1, fmtPct } from './beUtils';

/**
 * Top-of-dashboard summary: what the score IS, how solid the sample is, and what
 * to do next — so a reader (practitioner or student) knows where to look before
 * meeting forty charts.
 */

const jump = (id) => {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

export const BeSummary = ({
  aggregate, tier, nFiltered, nTotal, targetN, quality, excludeFlagged, aiCache, isOwner, filterActive,
}) => {
  const comp = aggregate?.composite || {};
  const sens = aggregate?.bes_sensitivity;
  const adeq = aggregate?.sample_adequacy;
  const dq = aggregate?.data_quality;
  const oc = aggregate?.open_coding;
  const meta = aggregate?.composite_meta || {};
  const bes = comp.overall;
  const dims = Object.values(DIMENSIONS)
    .map((d) => ({ ...d, v: comp[d.key] }))
    .filter((d) => typeof d.v === 'number' && d.v > 0);
  const strongest = dims.length ? dims.reduce((a, b) => (b.v > a.v ? b : a)) : null;
  const weakest = dims.length > 1 ? dims.reduce((a, b) => (b.v < a.v ? b : a)) : null;
  const coverages = Object.values(meta).map((m) => m?.coverage).filter((v) => typeof v === 'number');
  const minCov = coverages.length ? Math.min(...coverages) : null;
  const lowN = adeq && (adeq.level === 'insufficient' || adeq.level === 'provisional');

  // ---- next steps (ordered by importance) ----
  const steps = [];
  if (adeq && adeq.level === 'insufficient') {
    steps.push({ k: 'n', text: `เก็บคำตอบเพิ่ม — ตอนนี้ n = ${nFiltered} ยังน้อยเกินกว่าจะสรุป`, action: null });
  } else if (adeq && adeq.level === 'provisional') {
    steps.push({ k: 'n', text: `เก็บคำตอบเพิ่ม (n = ${nFiltered}) — ตัวเลขยังเป็นเบื้องต้น${adeq.min_next ? ` เป้าถัดไป ≈ ${adeq.min_next}` : ''}`, action: null });
  }
  if (isOwner && oc && oc.questions_needing_coding > 0 && (oc.by_status?.uncoded || 0) > 0) {
    steps.push({
      k: 'coding', text: `เข้ารหัสคำตอบปลายเปิดที่ยังไม่ได้ทำ ${oc.by_status.uncoded} ข้อ (ทำได้โดยไม่ต้องใช้ AI ของระบบ)`,
      action: () => jump('be-coding-panel'), label: 'ไปที่การเข้ารหัส',
    });
  }
  if (isOwner && dq && dq.n_flagged_excludable > 0 && !excludeFlagged) {
    steps.push({
      k: 'dq', text: `ตรวจผู้ตอบที่น่าสงสัย ${dq.n_flagged_excludable} คน แล้วตัดสินใจว่าจะตัดออกหรือไม่`,
      action: () => jump('be-quality-toggle-anchor'), label: 'ดูตัวกรองคุณภาพ',
    });
  }
  if (sens && sens.tier_stable === false) {
    steps.push({ k: 'sens', text: 'ระดับ (tier) ไวต่อน้ำหนักมิติ — รายงานเป็นช่วง ไม่ใช่ตัวเลขเดียว', action: () => jump('be-stats-sensitivity'), label: 'ดูช่วง' });
  }
  if (isOwner && (!aiCache || !aiCache.status || aiCache.status === 'idle')) {
    steps.push({ k: 'ai', text: 'วิเคราะห์ประเด็น/อัตลักษณ์/ข้อเสนอแนะจากคำตอบปลายเปิด (ใช้ AI ของคุณเองได้)', action: () => jump('be-ai-panel'), label: 'ไปที่ AI analysis' });
  } else if (isOwner && (aiCache?.status === 'partial' || aiCache?.status === 'error')) {
    steps.push({ k: 'ai', text: 'AI วิเคราะห์ยังไม่ครบ — ทำส่วนที่เหลือต่อ', action: () => jump('be-ai-panel'), label: 'ไปที่ AI analysis' });
  }
  if (isOwner) {
    steps.push({ k: 'export', text: 'จะเขียนวิทยานิพนธ์/รายงาน? ดาวน์โหลดเอกสารหรือข้อมูลดิบ (SPSS/R/JASP) ได้ด้านล่าง', action: () => jump('be-thesis-export'), label: 'ไปที่ส่งออก' });
  }

  return (
    <div className="be-summary" data-testid="be-summary" style={{ marginTop: 18 }}>
      {lowN && (
        <div role="note" data-testid="be-summary-lown"
             style={{ border: `1px solid ${adeq.level === 'insufficient' ? 'var(--be-red)' : 'var(--be-gold)'}`,
                      background: adeq.level === 'insufficient' ? 'rgba(200,16,46,0.06)' : 'rgba(212,160,23,0.09)',
                      padding: '10px 14px', marginBottom: 12, lineHeight: 1.6, fontSize: 14 }}>
          ⚠ <b>{adeq.level === 'insufficient' ? 'ตัวอย่างน้อยเกินไป' : 'ตัวอย่างยังเป็นเบื้องต้น'}</b> — {adeq.message}
        </div>
      )}
      <div className="be-summary-grid">
        <section className="be-card be-summary-card" aria-labelledby="be-sum-1" data-testid="be-summary-what">
          <h3 id="be-sum-1" className="be-eyebrow"><span className="be-dot-sm" style={{ background: 'var(--be-red)' }}/>คะแนนนี้คืออะไร</h3>
          <p className="be-small" style={{ lineHeight: 1.65 }}>
            <b>BES {fmt0(bes)}/100</b> คือดัชนีถ่วงน้ำหนักของ 4 มิติ (การรู้จัก · คุณภาพ · อัตลักษณ์ · ความภักดี)
            {tier ? <> — ระดับ <b style={{ color: tier.color }}>{tier.th || tier.name}</b></> : null}
            {sens?.range_one_weight_halved_or_doubled
              ? <> · ถ้าปรับน้ำหนักมิติใดมิติหนึ่ง ×½ ถึง ×2 อยู่ในช่วง <b>{fmt1(sens.range_one_weight_halved_or_doubled[0])}–{fmt1(sens.range_one_weight_halved_or_doubled[1])}</b></> : null}
          </p>
          {strongest && weakest && strongest.key !== weakest.key && (
            <p className="be-small" style={{ lineHeight: 1.65, marginTop: 6 }} data-testid="be-summary-extremes">
              แข็งที่สุด: <b style={{ color: strongest.color }}>{strongest.label} {fmt0(strongest.v)}</b> ·
              อ่อนที่สุด: <b style={{ color: weakest.color }}>{weakest.label} {fmt0(weakest.v)}</b>
            </p>
          )}
          <p className="be-tiny be-muted" style={{ lineHeight: 1.6, marginTop: 6 }}>
            เป็นดัชนีเชิงพรรณนาจากกรอบ Aaker ไม่ใช่ค่าที่ประมาณจากโมเดลสถิติ · ใช้เทียบข้ามเวลาได้เมื่อใช้แบบสอบถามและสูตรเดียวกัน
          </p>
        </section>

        <section className="be-card be-summary-card" aria-labelledby="be-sum-2" data-testid="be-summary-solid">
          <h3 id="be-sum-2" className="be-eyebrow"><span className="be-dot-sm" style={{ background: 'var(--be-blue)' }}/>ตัวอย่างเชื่อถือได้แค่ไหน</h3>
          <ul className="be-small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.75, listStyle: 'disc' }}>
            <li>ผู้ตอบ <b>n = {nFiltered}</b>{nTotal != null && nTotal !== nFiltered ? ` (จาก ${nTotal} คนทั้งหมด${filterActive ? ' · กำลังกรองอยู่' : ''})` : ''}
              {targetN ? ` · เป้า ${targetN} (${fmtPct(nFiltered / targetN * 100)})` : ''}</li>
            {adeq?.moe_95_pct != null && (
              <li>ความคลาดเคลื่อนสูงสุดของสัดส่วน ≈ <b>±{fmt1(adeq.moe_95_pct)} จุด</b> (95%, ถ้าเป็นการสุ่มอย่างง่าย — ตัวอย่างแบบสะดวกใช้เป็นแนวทางเท่านั้น)</li>
            )}
            {minCov != null && minCov < 1 && <li style={{ color: 'var(--be-gold)' }}>สัญญาณครบ {Math.round(minCov * 100)}% ของที่ออกแบบไว้ — ถือเป็นตัวเลขเบื้องต้น</li>}
            {dq && (
              <li data-testid="be-summary-dq">
                ผู้ตอบที่น่าสงสัย <b>{dq.n_flagged_excludable}</b> คน
                {excludeFlagged ? <> — <b>ตัดออกแล้ว {quality?.excluded ?? 0} คน</b></> : dq.n_flagged_excludable ? ' — ยังนับรวมอยู่' : ''}
              </li>
            )}
            {aggregate?.normalization?.basis && aggregate.normalization.basis !== 'none' && (
              <li>การนับชื่อแบรนด์ปลายเปิด: <b>{({ ai: 'เข้ารหัสด้วย AI', manual: 'เข้ารหัสด้วยมือ', deterministic: 'จับคู่ชื่ออัตโนมัติ (ไม่ใช้ AI)' })[aggregate.normalization.basis] || aggregate.normalization.basis}</b></li>
            )}
          </ul>
        </section>

        <section className="be-card be-summary-card" aria-labelledby="be-sum-3" data-testid="be-summary-next">
          <h3 id="be-sum-3" className="be-eyebrow"><span className="be-dot-sm" style={{ background: 'var(--be-green)' }}/>ควรทำอะไรต่อ</h3>
          {steps.length === 0 ? (
            <p className="be-small be-muted">ไม่มีสิ่งที่ต้องแก้ด่วน — ดูรายละเอียดรายมิติด้านล่าง</p>
          ) : (
            <ol className="be-small" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.65, listStyle: 'decimal' }}>
              {steps.slice(0, 4).map((s) => (
                <li key={s.k} data-testid={`be-next-${s.k}`} style={{ marginBottom: 6 }}>
                  {s.text}
                  {s.action && (
                    <> <button type="button" className="be-link-btn" onClick={s.action}>{s.label} →</button></>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
};

export default BeSummary;
