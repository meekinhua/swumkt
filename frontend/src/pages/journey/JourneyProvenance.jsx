import React, { useState } from 'react';
import { fmtPct, fmtCI } from './copy-th';

/**
 * The cards that tie the quantitative results back to the qualitative step, and
 * report where the qualitative step fell short.
 *
 * Spec: memory/CJM_PAINPOINT_SPEC.md rev 2, sections 2.7 and 2.8.
 *
 * Every number a reader sees about pain has to be able to say where its
 * vocabulary came from. A study still running on the system's built-in list is
 * not wrong, but it must not look like one grounded in its own interviews.
 */

const Card = ({ title, desc, children, testid, right }) => (
  <div className="be-card" style={{ marginBottom: 16 }} data-testid={testid}>
    <div className="be-card-h">
      <div style={{ minWidth: 0 }}>
        <h3 className="be-card-t">{title}</h3>
        {desc && <div className="be-card-d">{desc}</div>}
      </div>
      {right}
    </div>
    {children}
  </div>
);

const SOURCE_LABEL = {
  qualitative: 'จากการลงรหัสข้อมูลเชิงคุณภาพของการศึกษานี้',
  prior_literature: 'นำมาจากงานวิจัยก่อนหน้า',
  library_default: 'ชุดตั้งต้นของระบบ',
};

/** One line under every pain card: where this vocabulary came from. */
export const ProvenanceLine = ({ p, testid = 'journey-provenance-line' }) => {
  if (!p) return null;
  const bits = [SOURCE_LABEL[p.pain_source] || p.pain_source];
  if (p.codebook_version) bits.push(`ชุดรหัส v${p.codebook_version}`);
  if (p.n_interviews) bits.push(`จาก ${p.n_interviews} บทสัมภาษณ์`);
  if (p.n_quotes) bits.push(`${p.n_quotes} ข้อความอ้างอิง`);
  return (
    <div className="be-tiny" style={{ color: 'var(--ink-3)', marginTop: 8, lineHeight: 1.6 }}
         data-testid={testid}>
      ที่มาของประเภทปัญหา: {bits.join(' · ')}
    </div>
  );
};

/** The banner. Loud when the vocabulary did not come from this study's data. */
export const ProvenanceBanner = ({ p }) => {
  if (!p) return null;
  const other = p.other || {};
  return (
    <Card title="ประเภทปัญหาในรายงานนี้มาจากไหน" testid="journey-provenance">
      {p.warning_th && (
        <div className="jy-warn" data-testid="journey-provenance-warning">{p.warning_th}</div>
      )}
      <div className="jy-kv"><span>แหล่งที่มา</span>
        <b>{SOURCE_LABEL[p.pain_source] || p.pain_source}</b></div>
      {p.codebook_version > 0 && (
        <div className="jy-kv"><span>ชุดรหัสที่ใช้</span><b>เวอร์ชัน {p.codebook_version}</b></div>
      )}
      {p.n_interviews != null && (
        <div className="jy-kv"><span>จำนวนผู้ให้สัมภาษณ์</span><b>{p.n_interviews} ราย</b></div>
      )}
      {p.collection_method_th && (
        <div className="jy-kv"><span>วิธีเก็บข้อมูล</span><b>{p.collection_method_th}</b></div>
      )}
      {other.n > 0 && (
        <div className="jy-kv"><span>ผู้ตอบเลือก “อื่น ๆ”</span>
          <b data-testid="journey-other-rate">{fmtPct(other.rate, 0)}
            <span className="be-tiny" style={{ fontWeight: 400 }}> {fmtCI(other.ci95, 0)}</span>
          </b></div>
      )}
      {other.warning_th && (
        <div className="jy-warn" style={{ marginTop: 10 }} data-testid="journey-other-warning">
          {other.warning_th}
        </div>
      )}
      {p.back_coded_rate != null && (
        <div className="jy-kv"><span>ข้อความ “อื่น ๆ” ที่ลงรหัสกลับแล้ว</span>
          <b>{fmtPct(p.back_coded_rate, 0)}</b></div>
      )}
    </Card>
  );
};

/**
 * Did the qualitative map survive contact with the data?
 *
 * Three buckets, not a score. A missing edge and a surprise edge mean different
 * things to a researcher and collapsing them into one number would hide both.
 */
export const QualitativeAuditCard = ({ audit, states = [] }) => {
  const [open, setOpen] = useState(false);
  if (!audit) return null;

  const confirmed = audit.claimed_and_observed || [];
  const missing = audit.claimed_not_observed || [];
  const surprise = (audit.observed_not_claimed || []).filter((e) => e.material);
  const nameOf = (id) => states.find((s) => s.id === id)?.label_th
    || ({ START: 'เริ่มต้น', CONV: 'สำเร็จ', ABANDON: 'เลิกสนใจ',
         UNKNOWN: 'ไม่ทราบปลายทาง' }[id] || id);
  const rows = (list, tone) => (
    list.length === 0
      ? <div className="be-tiny" style={{ color: 'var(--ink-3)' }}>— ไม่มี —</div>
      : (
        <table className="be-table" style={{ marginTop: 6 }}>
          <thead><tr><th>จาก</th><th>ไป</th><th className="be-num">สัดส่วน</th></tr></thead>
          <tbody>
            {list.map((e, i) => (
              <tr key={i}>
                <td>{nameOf(e.from)}</td><td>{nameOf(e.to)}</td>
                <td className="be-num">
                  {e.share == null ? '—' : fmtPct(e.share, 0)}
                  {e.ci95 && <div className="be-tiny">{fmtCI(e.ci95, 0)}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )
  );

  return (
    <Card
      title="ขั้นเชิงคุณภาพตรงกับข้อมูลจริงแค่ไหน"
      testid="journey-qual-audit"
      desc="เทียบเส้นทางที่แผนที่เชิงคุณภาพระบุไว้ กับการเปลี่ยนขั้นที่วัดได้จากผู้ตอบจริง"
      right={<button className="be-btn be-btn-sm" onClick={() => setOpen(!open)}
                     data-testid="journey-qual-audit-toggle">
               {open ? 'ย่อ' : 'ดูรายเส้นทาง'}</button>}
    >
      {audit.warning_th && (
        <div className="jy-warn" data-testid="journey-linear-warning">{audit.warning_th}</div>
      )}
      {audit.unmatched_note_th && (
        <div className="jy-warn" style={{ marginTop: 8 }}>{audit.unmatched_note_th}</div>
      )}

      <div className="jy-kv"><span>ระบุไว้และพบจริง</span>
        <b data-testid="journey-audit-confirmed">{confirmed.length} เส้นทาง</b></div>
      <div className="jy-kv"><span>ระบุไว้แต่ไม่พบเลย</span>
        <b data-testid="journey-audit-missing">{missing.length} เส้นทาง</b></div>
      <div className="jy-kv"><span>พบจริงแต่ไม่ได้ระบุไว้</span>
        <b data-testid="journey-audit-surprise">{surprise.length} เส้นทาง</b></div>

      <p className="be-tiny" style={{ color: 'var(--ink-3)', marginTop: 10, lineHeight: 1.6 }}>
        “ระบุไว้แต่ไม่พบ” คือสมมติฐานจากงานเชิงคุณภาพที่ข้อมูลไม่รองรับ ·
        “พบจริงแต่ไม่ได้ระบุ” คือเส้นทางที่งานเชิงคุณภาพมองข้าม ทั้งสองอย่างควรเขียนไว้ในบทอภิปราย
      </p>

      {open && (
        <div style={{ marginTop: 14 }} data-testid="journey-audit-detail">
          <div className="be-label">ระบุไว้และพบจริง</div>{rows(confirmed)}
          <div className="be-label" style={{ marginTop: 14 }}>ระบุไว้แต่ไม่พบเลย</div>{rows(missing)}
          <div className="be-label" style={{ marginTop: 14 }}>พบจริงแต่ไม่ได้ระบุไว้</div>{rows(surprise)}
        </div>
      )}
    </Card>
  );
};

/** How many new categories each successive interview produced. */
export const SaturationCard = ({ sat }) => {
  if (!sat || !(sat.rows || []).length) return null;
  const max = Math.max(1, ...sat.rows.map((r) => r.cumulative));
  return (
    <Card title="ข้อมูลเชิงคุณภาพอิ่มตัวหรือยัง" testid="journey-saturation"
          desc="แต่ละบทสัมภาษณ์ทำให้พบประเภทปัญหาใหม่กี่ประเภท — ถ้าท้าย ๆ ยังพบใหม่ แปลว่าควรเก็บเพิ่ม">
      {(sat.warnings || []).map((w, i) => (
        <div className="jy-warn" key={i} data-testid={`journey-saturation-warn-${i}`}>{w}</div>
      ))}
      <table className="be-table" style={{ marginTop: 8 }}>
        <thead><tr><th>บทสัมภาษณ์ที่</th><th className="be-num">ประเภทใหม่</th>
          <th className="be-num">สะสม</th><th style={{ width: '45%' }} /></tr></thead>
        <tbody>
          {sat.rows.map((r) => (
            <tr key={r.interview_index}>
              <td>{r.interview_index}</td>
              <td className="be-num">{r.n_new_categories || '·'}</td>
              <td className="be-num">{r.cumulative}</td>
              <td>
                <div className="jy-bar" style={{ width: `${(r.cumulative / max) * 100}%` }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {sat.unattributed_categories > 0 && (
        <p className="be-tiny" style={{ color: 'var(--ink-3)', marginTop: 8 }}>
          มี {sat.unattributed_categories} ประเภทที่ไม่ทราบว่ามาจากบทสัมภาษณ์ใด จึงไม่นับในเส้นนี้
        </p>
      )}
    </Card>
  );
};

/**
 * Coder agreement — per category, always beside prevalence.
 *
 * Deliberately renders no pooled figure. With ten mostly-rare categories a
 * single kappa collapses toward zero even at 95% agreement, and a student would
 * read that as a failure of their coding rather than of the statistic.
 */
export const ReliabilityCard = ({ rel }) => {
  if (!rel) return null;
  const MODE = { none: 'ไม่ได้ตรวจ', second_coder: 'ผู้ลงรหัสคนที่สอง',
                 test_retest: 'ลงรหัสซ้ำโดยผู้วิจัยคนเดิม' };
  const rows = rel.per_category || [];
  return (
    <Card title="ความน่าเชื่อถือของการลงรหัส" testid="journey-reliability"
          desc="รายงานเป็นรายประเภทคู่กับความถี่ที่พบเสมอ — ประเภทที่พบน้อยมาก ค่า κ ไม่มีความหมาย">
      <div className="jy-kv"><span>วิธีตรวจ</span><b>{MODE[rel.mode] || rel.mode}</b></div>
      {rel.n_double_coded > 0 && (
        <>
          <div className="jy-kv"><span>หน่วยที่ลงรหัสซ้ำ</span><b>{rel.n_double_coded}</b></div>
          <div className="jy-kv"><span>ตรงกันทั้งชุด</span>
            <b>{fmtPct(rel.percent_agreement, 0)}</b></div>
          {rel.krippendorff_alpha != null && (
            <div className="jy-kv"><span>Krippendorff’s α</span>
              <b data-testid="journey-alpha">{rel.krippendorff_alpha.toFixed(3)}</b></div>
          )}
        </>
      )}
      {(rel.limitations_th || []).map((t, i) => (
        <div className="jy-warn" key={i} style={{ marginTop: 8 }}
             data-testid={`journey-reliability-limit-${i}`}>{t}</div>
      ))}
      {rows.length > 0 && (
        <table className="be-table" style={{ marginTop: 10 }} data-testid="journey-kappa-table">
          <thead><tr><th>ประเภทปัญหา</th><th className="be-num">κ</th>
            <th className="be-num">ความถี่ที่พบ</th><th className="be-num">ตรงกัน</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.category_id}>
                <td>{r.category_id}</td>
                <td className="be-num">
                  {r.kappa == null
                    ? <span style={{ color: 'var(--ink-3)' }}>n/a</span>
                    : r.kappa.toFixed(3)}
                  {r.note_th && <div className="be-tiny">{r.note_th}</div>}
                </td>
                <td className="be-num">{fmtPct(r.prevalence, 0)}</td>
                <td className="be-num">{fmtPct(r.percent_agreement, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
};
