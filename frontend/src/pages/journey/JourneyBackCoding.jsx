import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { fmtPct } from './copy-th';

/**
 * The back-coding queue: what respondents typed under "other", and the act of
 * folding it back into the codebook.
 *
 * Spec: memory/CJM_PAINPOINT_SPEC.md rev 2, sections 2.1 (S5) and 2.7(1).
 *
 * This is the return leg of the loop. A high other-rate says the qualitative
 * step missed something; this screen is where that gets repaired instead of
 * merely noted. Only categories already approved in the active codebook can be
 * assigned — inventing one here would put a label in front of respondents with
 * no quote behind it and no approval, which is the single thing the whole
 * module exists to prevent.
 */

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const JourneyBackCoding = ({ studyId, token, categories = [], states = [], onChanged }) => {
  const [queue, setQueue] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [picked, setPicked] = useState({});

  const load = useCallback(async () => {
    const h = { headers: { Authorization: `Bearer ${token}` } };
    try {
      const r = await axios.get(`${API}/journey/studies/${studyId}/pain-other-texts`, h);
      setQueue(r.data);
    } catch (e) {
      setError(e?.response?.data?.detail || 'โหลดคิวไม่ได้');
    }
  }, [studyId, token]);

  useEffect(() => { if (studyId) load(); }, [studyId, load]);

  const keyOf = (it) => `${it.response_id}|${it.state_id}`;

  const toggle = (it, cid) => setPicked((p) => {
    const k = keyOf(it);
    const cur = p[k] || [];
    return { ...p, [k]: cur.includes(cid) ? cur.filter((x) => x !== cid) : [...cur, cid] };
  });

  const apply = async (it) => {
    const k = keyOf(it);
    const ids = picked[k] || [];
    if (!ids.length) return;
    setBusy(k); setError('');
    try {
      await axios.post(`${API}/journey/studies/${studyId}/pain-back-code`, {
        response_id: it.response_id, state_id: it.state_id, category_ids: ids,
      }, { headers: { Authorization: `Bearer ${token}` } });
      setPicked((p) => ({ ...p, [k]: [] }));
      await load();
      if (onChanged) onChanged();
    } catch (e) {
      setError(e?.response?.data?.detail || 'ลงรหัสไม่สำเร็จ');
    } finally { setBusy(''); }
  };

  if (!queue) return null;
  if (!queue.n_pending && !queue.n_back_coded) return null;

  return (
    <div className="be-card" style={{ marginBottom: 16 }} data-testid="journey-backcoding">
      <div className="be-card-h">
        <div>
          <h3 className="be-card-t">ข้อความ “อื่น ๆ” ที่รอลงรหัส</h3>
          <div className="be-card-d">
            ผู้ตอบเขียนเองเพราะไม่มีตัวเลือกไหนตรง — จับเข้าประเภทที่มีอยู่ ถ้าไม่มีอันไหนตรงจริง ๆ
            ให้กลับไปสร้างชุดรหัสเวอร์ชันใหม่ในวิซาร์ด
          </div>
        </div>
      </div>

      <div className="jy-kv"><span>รอลงรหัส</span>
        <b data-testid="bc-pending">{queue.n_pending} ข้อความ</b></div>
      <div className="jy-kv"><span>ลงรหัสแล้ว</span>
        <b data-testid="bc-done">{queue.n_back_coded} ข้อความ
          {queue.back_coded_rate != null && ` · ${fmtPct(queue.back_coded_rate, 0)}`}</b></div>

      {error && <div className="jy-warn" style={{ marginTop: 10 }} data-testid="bc-error">{error}</div>}

      {(queue.pending || []).map((it) => {
        const k = keyOf(it);
        // One respondent can leave an "อื่น ๆ" note on several steps, so the DOM key
        // has to be the same (response, step) pair the state key already uses.
        const stepLabel = states.find((x) => x.id === it.state_id)?.label_th || it.state_id;
        const sel = picked[k] || [];
        return (
          <div key={k} style={{ border: '1px solid var(--rule)', padding: 12, marginTop: 10 }}
               data-testid={`bc-item-${k}`}>
            <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>“{it.text}”</div>
            <div className="be-tiny" style={{ color: 'var(--ink-3)', marginTop: 4 }}>
              ขั้น: {stepLabel}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {categories.map((c) => (
                <button key={c.id} className="be-chip be-chip-sm" aria-pressed={sel.includes(c.id)}
                        data-testid={`bc-cat-${k}-${c.id}`}
                        onClick={() => toggle(it, c.id)}>{c.label_th}</button>
              ))}
            </div>
            <button className="be-btn be-btn-sm" style={{ marginTop: 10 }}
                    data-testid={`bc-apply-${k}`}
                    disabled={!sel.length || busy === k}
                    onClick={() => apply(it)}>
              {busy === k ? 'กำลังบันทึก…' : 'ลงรหัสข้อความนี้'}
            </button>
          </div>
        );
      })}

      {queue.n_pending === 0 && (
        <div className="jy-locked" style={{ marginTop: 10 }} data-testid="bc-empty">
          ลงรหัสครบทุกข้อความแล้ว
        </div>
      )}
    </div>
  );
};

export default JourneyBackCoding;
