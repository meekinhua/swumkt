import React, { useState } from 'react';
import { toast } from 'sonner';
import { copyToClipboard } from '@/lib/clipboard';
import { Icon, DIMENSIONS } from './be-components';
import {
  API, buildFilterParams, downloadFile, blobErrText,
  fmt1, fmt2, fmtPct, fmtSigned, fmtP, fmtCI,
} from './beUtils';

/**
 * Statistics blocks the 2026-11 backend now returns. Everything here is
 * descriptive-first: each block says what the number is, how solid it is, and
 * what it does NOT show.
 */

// ---------------------------------------------------------------------------
// Generic progressive-disclosure container
// ---------------------------------------------------------------------------
export const BeDisclosure = ({ id, eyebrow, title, summary, defaultOpen = false, children, testid, accent = 'var(--be-blue)' }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="be-card" id={id} data-testid={testid} style={{ padding: 20, marginTop: 14 }}>
      <button type="button" className="be-disclosure-head" onClick={() => setOpen(!open)} aria-expanded={open}
              data-testid={testid ? `${testid}-toggle` : undefined}>
        <div>
          {eyebrow && (
            <div className="be-eyebrow" style={{ marginBottom: 6 }}>
              <span className="be-dot-sm" style={{ background: accent }}/>{eyebrow}
            </div>
          )}
          <div style={{ fontWeight: 600, fontSize: 16 }}>{title}</div>
          {summary && <div className="be-small be-muted" style={{ marginTop: 4, lineHeight: 1.55 }}>{summary}</div>}
        </div>
        <span className="be-appendix-arrow">{open ? 'ซ่อน ▲' : 'แสดง ▼'}</span>
      </button>
      {open && <div style={{ marginTop: 14 }}>{children}</div>}
    </div>
  );
};

const EFFECT_TH = { negligible: 'เล็กน้อยมาก', small: 'เล็ก', medium: 'ปานกลาง', large: 'ใหญ่' };

// ---------------------------------------------------------------------------
// Reliability (Cronbach's alpha) with item diagnostics
// ---------------------------------------------------------------------------
export const BeReliabilityDetail = ({ reliability, notComputed, questions = [] }) => {
  const [openDim, setOpenDim] = useState(null);
  if (!reliability) return null;
  const byId = Object.fromEntries(questions.map((q) => [q.id, q]));
  return (
    <div data-testid="be-reliability-card">
      <p className="be-muted be-small" style={{ marginBottom: 12, lineHeight: 1.65 }}>
        ค่า α บอกว่า <b>ข้อคำถามในมิติเดียวกันวัดเรื่องเดียวกันจริงไหม</b> (เกณฑ์ที่นิยม α ≥ 0.70) — คำนวณจากข้อมาตรวัดเท่านั้น
        ข้อที่เป็นข้อความเชิงลบถูกกลับคะแนนก่อน และ<b>ระบบจะไม่เดาค่า</b>ถ้าข้อน้อยกว่า 2 หรือ n &lt; 30
      </p>
      <div className="be-dim-grid">
        {Object.values(DIMENSIONS).map((d) => {
          const r = reliability[d.key] || {};
          const a = r.alpha;
          const col = a == null ? 'var(--ink-4)' : a >= 0.70 ? 'var(--be-green)' : a >= 0.60 ? 'var(--be-gold)' : 'var(--be-red)';
          const hasItems = (r.items || []).length > 0;
          return (
            <div key={d.key} className="be-dim-card" data-testid={`be-reliability-${d.key}`}>
              <div className="be-dim-name">{d.label}</div>
              <div className="be-dim-num" style={{ color: col, fontSize: 26 }}>{a == null ? '—' : fmt2(a)}</div>
              <div className="be-mono be-tiny be-muted">
                {a == null ? 'ประเมินไม่ได้' : `α · k = ${r.k_items} ข้อ · n = ${r.n_complete}`}
              </div>
              <div className="be-small be-muted" style={{ marginTop: 6, lineHeight: 1.45 }}>{r.interpretation || '—'}</div>
              {hasItems && (
                <button type="button" className="be-btn be-btn-ghost be-tiny" style={{ marginTop: 8 }}
                        onClick={() => setOpenDim(openDim === d.key ? null : d.key)}
                        aria-expanded={openDim === d.key} data-testid={`be-reliability-items-toggle-${d.key}`}>
                  {openDim === d.key ? 'ซ่อนรายข้อ' : 'ดูรายข้อ'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {openDim && (reliability[openDim]?.items || []).length > 0 && (() => {
        const r = reliability[openDim];
        return (
          <div style={{ marginTop: 14 }} data-testid={`be-reliability-items-${openDim}`}>
            <div className="be-small" style={{ marginBottom: 6, lineHeight: 1.6 }}>
              <b>{DIMENSIONS[openDim].label}</b> · α = {fmt2(r.alpha)} (k = {r.k_items}, n = {r.n_complete}
              {r.mean_inter_item_r != null ? `, mean inter-item r = ${fmt2(r.mean_inter_item_r)}` : ''})
              {r.missing_data_rule ? ` · ข้อมูลหาย: ${r.missing_data_rule}` : ''}
            </div>
            <div className="be-table-wrap">
              <table className="be-table" style={{ width: '100%' }}>
                <thead>
                  <tr><th>ข้อคำถาม</th><th>กลับคะแนน</th><th>item-total r (corrected)</th><th>α ถ้าตัดข้อนี้</th><th>ข้อสังเกต</th></tr>
                </thead>
                <tbody>
                  {r.items.map((it) => {
                    const q = byId[it.question_id];
                    const up = r.alpha != null && it.alpha_if_deleted != null && it.alpha_if_deleted > r.alpha + 0.005;
                    const weak = it.corrected_item_total_r != null && it.corrected_item_total_r < 0.3;
                    return (
                      <tr key={it.question_id}>
                        <td style={{ maxWidth: 340 }}>
                          <span className="be-mono be-tiny be-muted">{it.question_id.split('--')[0]}</span> {q?.prompt || it.kind}
                        </td>
                        <td className="be-tiny">{it.reverse_scored ? 'ใช่' : '—'}</td>
                        <td className="be-mono be-tiny" style={{ color: weak ? 'var(--be-red)' : 'inherit' }}>{fmt2(it.corrected_item_total_r)}</td>
                        <td className="be-mono be-tiny" style={{ color: up ? 'var(--be-gold)' : 'inherit' }}>{fmt2(it.alpha_if_deleted)}</td>
                        <td className="be-tiny">
                          {weak ? 'สัมพันธ์กับข้ออื่นต่ำ (< .30)' : ''}
                          {weak && up ? ' · ' : ''}
                          {up ? 'ตัดแล้ว α สูงขึ้น' : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      <p className="be-muted be-tiny" style={{ marginTop: 12, lineHeight: 1.6 }} data-testid="be-reliability-not-computed">
        <b>สิ่งที่ไม่ได้คำนวณ:</b>{' '}
        {notComputed || 'McDonald’s ω, composite reliability (CR), AVE และ EFA/CFA ไม่ได้ถูกคำนวณ — ถ้าต้องใช้ ให้ส่งออกข้อมูลดิบไปวิเคราะห์ใน SPSS / R / JASP'}
      </p>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Paired brand-vs-competitor comparisons
// ---------------------------------------------------------------------------
export const BePairedComparisons = ({ cc }) => {
  const [showAll, setShowAll] = useState(false);
  if (!cc) return null;
  const paired = cc.paired || [];
  const mid = cc.comparative_vs_midpoint || [];
  if (!paired.length && !mid.length) {
    return <div className="be-small be-muted" data-testid="be-paired-empty">ยังไม่มีคู่ข้อคำถามแบรนด์–คู่แข่งที่ทดสอบได้ในชุดข้อมูลนี้</div>;
  }
  const nTests = paired.filter((p) => p.testable).length + mid.filter((m) => m.testable).length;
  const rows = showAll ? paired : paired.slice(0, 12);
  return (
    <div data-testid="be-paired-comparisons">
      <p className="be-small" style={{ lineHeight: 1.65, marginBottom: 10 }}>
        เทียบ<b>แบรนด์หลักกับคู่แข่งทีละด้าน</b> โดยใช้ผู้ตอบคนเดียวกันที่ให้คะแนนทั้งสองแบรนด์ (paired t-test บนคะแนน 0–100)
        ผลต่างบวก = แบรนด์หลักสูงกว่า · <b>ผลต่าง ± ช่วงเชื่อมั่น 95%</b> บอกว่าความต่างน่าจะอยู่ช่วงไหน ·
        effect size (Cohen&apos;s d<sub>z</sub>) บอกว่าต่างมากแค่ไหน ไม่ใช่แค่ต่างจริงหรือไม่
      </p>
      <div className="be-small" style={{ background: 'rgba(212,160,23,0.09)', border: '1px solid rgba(212,160,23,0.4)', padding: '8px 12px', lineHeight: 1.6, marginBottom: 12 }}
           data-testid="be-paired-multiple-caveat">
        <b>ข้อควรระวังเรื่องการเปรียบเทียบหลายครั้ง:</b> ทดสอบทั้งหมด {nTests} ครั้งพร้อมกัน ยิ่งทดสอบมาก
        ยิ่งมีโอกาสเจอ &quot;ความต่าง&quot; จากความบังเอิญ จึงรายงาน <b>p ที่ปรับด้วย Holm</b> (ใช้ตัดสิน) แทน p ดิบ ·
        &quot;ยังไม่มีนัยสำคัญ&quot; ไม่ได้แปลว่าแบรนด์เท่ากัน แต่แปลว่าข้อมูลชุดนี้ยังสรุปไม่ได้
      </div>

      {paired.length > 0 && (
        <div className="be-table-wrap">
          <table className="be-table" style={{ width: '100%' }} data-testid="be-paired-table">
            <thead>
              <tr>
                <th>ด้าน</th><th>คู่แข่ง</th><th>n คู่</th><th>ผลต่าง (95% CI)</th>
                <th>t (df)</th><th>p (Holm)</th><th>effect size</th><th>อ่านว่า</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => (
                <tr key={`${p.axis}-${p.competitor}-${i}`} data-testid={`be-paired-row-${i}`}>
                  <td>{p.axis}{p.reverse_scored ? <span className="be-tiny be-muted"> (กลับคะแนน)</span> : null}</td>
                  <td>{p.competitor}</td>
                  <td className="be-mono be-tiny">{p.n_pairs}{p.low_n ? <span title="n น้อย — ตีความอย่างระวัง" style={{ color: 'var(--be-gold)' }}> ⚠</span> : null}</td>
                  {p.testable ? (
                    <>
                      <td className="be-mono be-tiny">
                        {fmtSigned(p.mean_diff)} <span className="be-muted">[{fmtCI(p.diff_ci95)}]</span>
                      </td>
                      <td className="be-mono be-tiny">{fmt2(p.t)} ({p.df})</td>
                      <td className="be-mono be-tiny" title={`p ดิบ = ${fmtP(p.p_value)}`}
                          style={{ color: p.significant ? 'var(--be-green)' : 'var(--ink-3)', fontWeight: 600 }}>
                        {fmtP(p.p_value_holm)}
                      </td>
                      <td className="be-tiny">d<sub>z</sub> = {fmt2(p.cohens_dz)} · {EFFECT_TH[p.effect_label] || p.effect_label}</td>
                      <td className="be-tiny" style={{ minWidth: 220, whiteSpace: 'normal' }}>
                        <b style={{ color: p.significant ? 'var(--be-green)' : 'var(--ink-3)' }}>
                          {p.significant ? 'มีนัยสำคัญ' : 'ยังไม่มีนัยสำคัญ'}
                        </b>{' — '}{p.interpretation}
                      </td>
                    </>
                  ) : (
                    <td colSpan={5} className="be-tiny be-muted" style={{ whiteSpace: 'normal' }}>
                      ทดสอบไม่ได้: {p.interpretation || p.reason}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {paired.length > 12 && (
        <button type="button" className="be-btn be-btn-ghost be-tiny" style={{ marginTop: 8 }} onClick={() => setShowAll(!showAll)}
                data-testid="be-paired-show-all">
          {showAll ? 'แสดงน้อยลง' : `แสดงทั้งหมด (${paired.length} แถว)`}
        </button>
      )}

      {mid.length > 0 && (
        <div style={{ marginTop: 16 }} data-testid="be-comparative-midpoint">
          <div className="be-small" style={{ fontWeight: 600, marginBottom: 6 }}>ข้อเปรียบเทียบตรง (7 ระดับ) — ทดสอบเทียบจุดกึ่งกลาง (4 = เสมอ)</div>
          <div className="be-table-wrap">
            <table className="be-table" style={{ width: '100%' }}>
              <thead><tr><th>คู่แข่ง</th><th>n</th><th>ค่าเฉลี่ย (1–7)</th><th>แบรนด์หลักได้เปรียบ (95% CI, ระดับ)</th><th>t (df)</th><th>p (Holm)</th><th>effect</th></tr></thead>
              <tbody>
                {mid.map((m, i) => (
                  <tr key={`${m.question_id}-${i}`}>
                    <td>{m.competitor}</td>
                    <td className="be-mono be-tiny">{m.n}</td>
                    {m.testable ? (
                      <>
                        <td className="be-mono be-tiny">{fmt2(m.mean)}</td>
                        <td className="be-mono be-tiny">{fmtCI(m.mean_favour_focal_ci95, 2)}</td>
                        <td className="be-mono be-tiny">{fmt2(m.t)} ({m.df})</td>
                        <td className="be-mono be-tiny" style={{ color: m.significant ? 'var(--be-green)' : 'var(--ink-3)', fontWeight: 600 }}>{fmtP(m.p_value_holm)}</td>
                        <td className="be-mono be-tiny">d = {fmt2(m.cohens_d)}</td>
                      </>
                    ) : <td colSpan={5} className="be-tiny be-muted">ทดสอบไม่ได้: {m.reason || m.interpretation}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="be-tiny be-muted" style={{ marginTop: 6 }}>ค่าเฉลี่ย &lt; 4 = ผู้ตอบเอนเอียงไปทางแบรนด์หลัก (แบรนด์หลักอยู่ซ้ายของสเกล)</div>
        </div>
      )}
      {cc.caveat && <p className="be-tiny be-muted" style={{ marginTop: 12, lineHeight: 1.6 }}>วิธี: {cc.method} · {cc.caveat}</p>}
    </div>
  );
};

// ---------------------------------------------------------------------------
// BES sensitivity
// ---------------------------------------------------------------------------
export const BeSensitivity = ({ s, bes }) => {
  if (!s) return null;
  const [lo, hi] = s.range_one_weight_halved_or_doubled || [];
  return (
    <div data-testid="be-bes-sensitivity">
      <p className="be-small" style={{ lineHeight: 1.65, marginBottom: 10 }}>
        BES เป็นดัชนีถ่วงน้ำหนัก และน้ำหนักมาจากกรอบทฤษฎี ไม่ได้ประมาณจากข้อมูล — ตารางนี้แสดงว่าถ้าน้ำหนักเปลี่ยน BES ขยับแค่ไหน
      </p>
      <div className="be-grid-3" style={{ marginBottom: 10 }}>
        <div className="be-stat-tile"><div className="be-mono be-tiny be-muted">BES ปัจจุบัน</div><div className="be-num be-stat-big">{fmt1(bes)}</div></div>
        <div className="be-stat-tile"><div className="be-mono be-tiny be-muted">น้ำหนักเท่ากันทุกมิติ</div><div className="be-num be-stat-big">{fmt1(s.equal_weights)}</div></div>
        <div className="be-stat-tile"><div className="be-mono be-tiny be-muted">ช่วงเมื่อปรับน้ำหนัก 1 มิติ ×½ หรือ ×2</div>
          <div className="be-num be-stat-big">{fmt1(lo)}–{fmt1(hi)}</div></div>
      </div>
      <div className="be-small" data-testid="be-bes-tier-stability"
           style={{ color: s.tier_stable ? 'var(--ink-2)' : 'var(--be-red)', lineHeight: 1.6 }}>
        {s.tier_stable ? '✓ ระดับ (tier) ของแบรนด์คงเดิมในทุกกรณีที่ลอง' : '⚠ ระดับ (tier) ของแบรนด์เปลี่ยนได้เมื่อน้ำหนักเปลี่ยน — อย่าอ่านระดับนี้เป็นข้อสรุปเด็ดขาด'}
        {s.note ? <div className="be-muted be-tiny" style={{ marginTop: 4 }}>{s.note}</div> : null}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Data quality
// ---------------------------------------------------------------------------
const DQ_LABEL = {
  speeder: 'ตอบเร็วผิดปกติ (speeder)', straightliner: 'ตอบค่าเดียวซ้ำทุกข้อ (straight-liner)',
  duplicate: 'คำตอบซ้ำกับผู้ตอบก่อนหน้า', unaware_rater: 'ให้คะแนนแบรนด์ที่ตัวเองไม่ได้ติ๊กว่ารู้จัก',
};

export const BeDataQuality = ({ dq, quality, exclude, onToggle, nFiltered, busy }) => {
  if (!dq) return null;
  const excluded = quality?.excluded || 0;
  // With the toggle ON the backend recomputes data_quality on the remaining
  // respondents, so the flagged count that was removed comes from quality_filter.
  const flaggedNow = exclude ? excluded : dq.n_flagged_excludable;
  return (
    <div data-testid="be-data-quality">
      <p className="be-small" style={{ lineHeight: 1.65, marginBottom: 10 }}>
        ระบบ<b>ตรวจและรายงาน</b>ผู้ตอบที่น่าสงสัย แต่<b>ไม่ตัดออกเอง</b> — คุณเลือกเองว่าจะตัดหรือไม่ (ตัดแล้วคะแนนทั้งหน้า ส่งออกข้อมูล และตารางสถิติจะคำนวณใหม่)
      </p>
      <div className="be-table-wrap">
        <table className="be-table" style={{ width: '100%' }}>
          <thead><tr><th>ธง</th><th>จำนวนผู้ตอบ</th><th>เกณฑ์</th><th>ตัดได้</th></tr></thead>
          <tbody>
            {Object.keys(DQ_LABEL).map((k) => (
              <tr key={k} data-testid={`be-dq-flag-${k}`}>
                <td>{DQ_LABEL[k]}</td>
                <td className="be-mono be-tiny">{dq.flags?.[k] ?? 0} จาก {dq.n_total}</td>
                <td className="be-tiny" style={{ whiteSpace: 'normal' }}>{dq.rules?.[k]}</td>
                <td className="be-tiny">{k === 'unaware_rater' ? 'ไม่ (แจ้งเพื่อทราบ)' : 'ได้'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="be-small" style={{ marginTop: 12, lineHeight: 1.7 }} data-testid="be-dq-summary">
        ผู้ตอบที่น่าสงสัยและตัดได้ <b>{flaggedNow}</b> คน
        {dq.median_duration_sec ? <> · เวลาตอบมัธยฐาน {Math.round(dq.median_duration_sec)} วินาที</> : null}
        {' '}· ตอนนี้ใช้ผู้ตอบ <b>n = {nFiltered}</b>
        {exclude ? <> (ตัดออกแล้ว {excluded} คน จาก {nFiltered + excluded})</> : null}
        {!exclude && dq.n_flagged_excludable > 0 ? <> · ถ้าตัด จะเหลือ n ≈ {dq.n_total - dq.n_flagged_excludable}</> : null}
        {exclude ? <div className="be-tiny be-muted">ตารางธงด้านบนนับจากผู้ตอบที่เหลือหลังตัดแล้ว — ปิดการตัดเพื่อดูจำนวนธงเดิม</div> : null}
      </div>
      <label className="be-check-row" style={{ marginTop: 10 }}>
        <input type="checkbox" checked={!!exclude} disabled={busy} onChange={(e) => onToggle(e.target.checked)}
               data-testid="be-dq-exclude-toggle-detail"/>
        <span>ตัดผู้ตอบที่น่าสงสัย (speeder / straight-liner / ซ้ำ) ออกจากการวิเคราะห์</span>
      </label>
      {dq.note && <p className="be-tiny be-muted" style={{ marginTop: 8, lineHeight: 1.6 }}>{dq.note}</p>}
    </div>
  );
};

/** Compact toggle shown next to the filter bar — it changes the whole view, so it is not buried. */
export const BeQualityToggle = ({ dq, quality, exclude, onToggle, busy, nFiltered }) => {
  if (!dq) return null;
  const flagged = exclude ? (quality?.excluded || 0) : (dq.n_flagged_excludable || 0);
  return (
    <div className="be-quality-toggle" data-testid="be-quality-toggle"
         style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '10px 14px',
                  border: '1px solid var(--rule)', background: 'var(--surface)', marginTop: 10 }}>
      <label className="be-check-row" style={{ margin: 0 }}>
        <input type="checkbox" checked={!!exclude} disabled={busy || (!exclude && flagged === 0)}
               onChange={(e) => onToggle(e.target.checked)} data-testid="be-dq-exclude-toggle"/>
        <span>ตัดผู้ตอบที่น่าสงสัยออก</span>
      </label>
      <span className="be-small be-muted" data-testid="be-dq-inline-summary" style={{ lineHeight: 1.5 }}>
        {flagged === 0
          ? 'ไม่พบผู้ตอบที่ควรตัดออก (ตอบเร็วผิดปกติ / ตอบซ้ำค่าเดียว / คำตอบซ้ำ)'
          : <>พบ <b>{flagged}</b> คนจาก {exclude ? nFiltered + flagged : dq.n_total} ที่น่าสงสัย
              {exclude ? <> · <b>ตัดออกแล้ว {quality?.excluded ?? flagged} คน</b> เหลือ n = {nFiltered}</> : <> · ยังนับรวมอยู่ (n = {nFiltered})</>}</>}
      </span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Per-item table with 95% CI
// ---------------------------------------------------------------------------
export const BeItemTable = ({ questions = [] }) => {
  const items = questions.filter((q) => q.stats && q.stats.score_100 != null && q.stats.n && !q.compare_brand);
  if (!items.length) return null;
  const dimOf = (q) => DIMENSIONS[q.dimension]?.label || q.dimension;
  return (
    <div data-testid="be-item-table">
      <p className="be-small" style={{ lineHeight: 1.65, marginBottom: 10 }}>
        คะแนน 0–100 (POMP) ของแต่ละข้อพร้อม <b>ช่วงเชื่อมั่น 95%</b> — ช่วงกว้าง = ตัวเลขยังไม่นิ่ง (n น้อยหรือความเห็นกระจาย) ·
        n ของแต่ละข้ออาจน้อยกว่าจำนวนผู้ตอบทั้งหมด เพราะบางข้อไม่บังคับตอบ
      </p>
      <div className="be-table-wrap">
        <table className="be-table" style={{ width: '100%' }}>
          <thead><tr><th>มิติ</th><th>ข้อคำถาม</th><th>n</th><th>ค่าเฉลี่ย</th><th>SD</th><th>คะแนน 0–100</th><th>95% CI</th><th>T2B</th></tr></thead>
          <tbody>
            {items.map((q) => {
              const s = q.stats;
              const isNps = q.type === 'nps_0_10';
              return (
                <tr key={q.id} data-testid={`be-item-row-${q.id}`}>
                  <td className="be-tiny">{dimOf(q)}</td>
                  <td style={{ maxWidth: 320, whiteSpace: 'normal' }}>
                    <span className="be-mono be-tiny be-muted">{q.id.split('--')[0]}</span> {q.prompt}
                    {q.reverse_scored ? <span className="be-tiny be-muted"> (กลับคะแนน)</span> : null}
                  </td>
                  <td className="be-mono be-tiny">{s.n}</td>
                  <td className="be-mono be-tiny">{fmt2(s.mean)}</td>
                  <td className="be-mono be-tiny">{s.std != null ? fmt2(s.std) : '—'}</td>
                  <td className="be-mono be-tiny" style={{ fontWeight: 600 }}>{fmt1(s.score_100)}</td>
                  <td className="be-mono be-tiny">{fmtCI(s.score_100_ci95)}</td>
                  <td className="be-mono be-tiny">{isNps ? `NPS ${fmtSigned(s.score, 0)}` : s.t2b != null ? fmtPct(s.t2b) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Methods paragraph + copy
// ---------------------------------------------------------------------------
export const BeMethodsParagraph = ({ text }) => {
  if (!text) return null;
  return (
    <div data-testid="be-methods-paragraph-block">
      <p className="be-small" style={{ lineHeight: 1.65, marginBottom: 10 }}>
        ย่อหน้าวิธีการวิจัยที่สร้างจากข้อเท็จจริงของ study นี้ (ขนาดตัวอย่าง วิธีให้คะแนน ข้อจำกัด) — ใช้เป็นต้นร่างในบทที่ 3
        <b> ตรวจตัวเลขและปรับถ้อยคำให้ตรงกับงานของคุณก่อนส่ง</b>
      </p>
      <blockquote data-testid="be-methods-paragraph"
                  style={{ margin: 0, padding: '12px 16px', borderLeft: '3px solid var(--be-blue)', background: 'var(--paper-2)',
                           fontFamily: 'IBM Plex Serif, serif', lineHeight: 1.8, fontSize: 14, whiteSpace: 'pre-line' }}>
        {text}
      </blockquote>
      <button type="button" className="be-btn" style={{ marginTop: 10 }} data-testid="be-methods-copy"
              onClick={() => copyToClipboard(text, { successMessage: 'คัดลอกย่อหน้าวิธีการวิจัยแล้ว' })}>
        <Icon name="copy" size={11}/>คัดลอกย่อหน้านี้
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Raw data export
// ---------------------------------------------------------------------------
export const BeRawExport = ({ studyId, token, filter, excludeFlagged, nFiltered }) => {
  const [busy, setBusy] = useState('');
  const go = async (format, fallbackName) => {
    setBusy(format);
    try {
      const params = [...buildFilterParams(filter), `format=${format}`, excludeFlagged ? 'exclude_flagged=true' : ''].filter(Boolean);
      await downloadFile({
        url: `${API}/brand-equity/studies/${studyId}/export/raw?${params.join('&')}`, token, fallbackName,
      });
      toast.success('ดาวน์โหลดแล้ว');
    } catch (e) {
      toast.error(await blobErrText(e, 'ส่งออกข้อมูลไม่สำเร็จ'));
    }
    setBusy('');
  };
  return (
    <div data-testid="be-raw-export">
      <p className="be-small" style={{ lineHeight: 1.65, marginBottom: 10 }}>
        ข้อมูลดิบ <b>1 แถว = ผู้ตอบ 1 คน</b> สำหรับวิเคราะห์ต่อใน <b>SPSS / R / JASP / Excel</b> — ชื่อตัวแปรใช้ได้กับโปรแกรมสถิติ
        มีคอลัมน์คะแนนกลับทิศ (<code>_r</code>) ตัวแปร 0/1 ของข้อเลือกหลายคำตอบ รหัสคำตอบปลายเปิด และธงคุณภาพข้อมูล (<code>dq_*</code>)
        พร้อม codebook อธิบายทุกตัวแปร · ส่งออกตามชุดข้อมูลที่กรองอยู่ (n = {nFiltered}{excludeFlagged ? ' · ตัดผู้ตอบที่น่าสงสัยแล้ว' : ''})
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="be-btn be-btn-primary" disabled={!!busy} onClick={() => go('xlsx', 'brand-equity-data.xlsx')}
                data-testid="be-export-xlsx">
          <Icon name="download" size={11}/>{busy === 'xlsx' ? 'กำลังสร้าง…' : 'Excel (.xlsx) — ข้อมูล + codebook'}
        </button>
        <button type="button" className="be-btn" disabled={!!busy} onClick={() => go('csv', 'brand-equity-data.csv')}
                data-testid="be-export-csv">
          <Icon name="download" size={11}/>{busy === 'csv' ? 'กำลังสร้าง…' : 'CSV — ข้อมูลดิบ (SPSS/R/JASP)'}
        </button>
        <button type="button" className="be-btn" disabled={!!busy} onClick={() => go('codebook_csv', 'brand-equity-codebook.csv')}
                data-testid="be-export-codebook">
          <Icon name="download" size={11}/>{busy === 'codebook_csv' ? 'กำลังสร้าง…' : 'Codebook (CSV)'}
        </button>
      </div>
    </div>
  );
};

