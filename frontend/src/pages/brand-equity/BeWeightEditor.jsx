import React, { useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Icon, DIMENSIONS } from './be-components';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const DEFAULTS = { awareness: 25, quality: 25, identity: 25, loyalty: 25 };

/**
 * BeWeightEditor — edits the four dimension weights used by
 * BES = Σ(Dᵢ × wᵢ) / Σwᵢ.
 *
 * The methodology appendix has always told researchers the weights were
 * "ปรับได้ที่ Wizard step 4". No such screen existed — the backend read
 * `study.weights` and accepted it on PUT, but nothing ever wrote it. This is
 * that screen.
 */
export const BeWeightEditor = ({ study, token, onClose, onSaved }) => {
  const [w, setW] = useState(() => ({ ...DEFAULTS, ...(study?.weights || {}) }));
  const [saving, setSaving] = useState(false);

  const sum = Object.values(w).reduce((a, b) => a + (Number(b) || 0), 0);
  const effective = (k) => (sum > 0 ? ((Number(w[k]) || 0) / sum * 100) : 0);

  const save = async () => {
    if (sum <= 0) {
      toast.error('น้ำหนักรวมต้องมากกว่า 0');
      return;
    }
    setSaving(true);
    try {
      await axios.put(
        `${API}/brand-equity/studies/${study.id}`,
        { weights: Object.fromEntries(Object.entries(w).map(([k, v]) => [k, Math.round(Number(v) || 0)])) },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      toast.success('บันทึกน้ำหนักแล้ว — คะแนนรวมคำนวณใหม่');
      onSaved?.();
      onClose?.();
    } catch (e) {
      toast.error('บันทึกไม่สำเร็จ: ' + (e.response?.data?.detail || e.message));
    }
    setSaving(false);
  };

  return (
    <div className="be-modal-backdrop" data-testid="be-weight-editor" onClick={onClose}>
      <div className="be-modal" onClick={(e) => e.stopPropagation()}>
        <div className="be-modal-head">
          <div>
            <div className="be-eyebrow">
              <span className="be-dot-sm" style={{ background: 'var(--be-red)' }}/>
              น้ำหนักมิติ · DIMENSION WEIGHTS
            </div>
            <div className="be-h3" style={{ marginTop: 8 }}>ปรับน้ำหนักของ 4 มิติใน Brand Equity Score</div>
          </div>
          <button className="be-btn be-btn-ghost" onClick={onClose} data-testid="be-weight-editor-close">
            <Icon name="close" size={11}/>
          </button>
        </div>

        <p className="be-muted be-small" style={{ lineHeight: 1.6, marginBottom: 16 }}>
          BES = Σ (D<sub>i</sub> × w<sub>i</sub>) / Σw<sub>i</sub> — ค่าเริ่มต้นคือ 25 เท่ากันทุกมิติ
          (ไม่มีงานวิจัยที่กำหนดว่าน้ำหนักควรเป็นเท่าไร จึงถ่วงเท่ากันเป็นค่ากลาง)
          ถ้าหมวดสินค้าของคุณให้ความสำคัญกับมิติใดมากกว่า ให้ปรับที่นี่และ<b>ระบุเหตุผลไว้ในรายงาน</b>
          มิติที่ยังไม่มีข้อมูลจะถูกตัดออกจากการถ่วงน้ำหนักอัตโนมัติ
        </p>

        {Object.values(DIMENSIONS).map(d => (
          <div key={d.key} style={{ marginBottom: 16 }} data-testid={`be-weight-row-${d.key}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 500 }}>
                <span className="be-dot-sm" style={{ background: d.color, marginRight: 8 }}/>
                {d.label} <span className="be-muted">· {d.th}</span>
              </span>
              <span className="be-mono be-tiny be-muted" data-testid={`be-weight-effective-${d.key}`}>
                = {effective(d.key).toFixed(1)}% ของคะแนนรวม
              </span>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <input type="range" min={0} max={100} step={1}
                     value={Number(w[d.key]) || 0}
                     onChange={(e) => setW({ ...w, [d.key]: Number(e.target.value) })}
                     style={{ flex: 1 }}
                     data-testid={`be-weight-slider-${d.key}`}/>
              <input type="number" min={0} max={100}
                     value={Number(w[d.key]) || 0}
                     onChange={(e) => setW({ ...w, [d.key]: Number(e.target.value) })}
                     className="be-input"
                     style={{ width: 74, textAlign: 'right' }}
                     data-testid={`be-weight-input-${d.key}`}/>
            </div>
          </div>
        ))}

        <div className="be-mono be-tiny" style={{ marginTop: 4, color: sum === 100 ? 'var(--be-green)' : 'var(--ink-3)' }}
             data-testid="be-weight-sum">
          รวม {sum} {sum === 100 ? '· ครบ 100' : '· ระบบจะ normalize ให้เอง'}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
          <button className="be-btn be-btn-ghost" onClick={() => setW({ ...DEFAULTS })}
                  data-testid="be-weight-reset">
            คืนค่าเริ่มต้น 25/25/25/25
          </button>
          <button className="be-btn be-btn-red" onClick={save} disabled={saving}
                  data-testid="be-weight-save">
            <Icon name="check" size={11}/>{saving ? 'กำลังบันทึก…' : 'บันทึกและคำนวณใหม่'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BeWeightEditor;
