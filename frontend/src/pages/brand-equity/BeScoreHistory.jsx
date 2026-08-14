import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Icon, TrendLine, DIMENSIONS } from './be-components';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SERIES = [
  { key: 'overall', testid: 'bes', label: 'BES', color: '#0A0A0A' },
  { key: 'awareness', label: 'Awareness', color: DIMENSIONS.awareness.color },
  { key: 'quality', label: 'Quality', color: DIMENSIONS.quality.color },
  { key: 'identity', label: 'Identity', color: DIMENSIONS.identity.color },
  { key: 'loyalty', label: 'Loyalty', color: DIMENSIONS.loyalty.color },
];

const GRANULARITIES = [
  { key: 'wave', label: 'ตามรอบเก็บ (WAVE)' },
  { key: 'month', label: 'รายเดือน' },
  { key: 'week', label: 'รายสัปดาห์' },
];

/** Score over time. Wave-vs-wave answered "did it move?"; this answers "which way
 *  has it been going?" — the question a tracking study exists to answer. */
export const BeScoreHistory = ({ studyId, token }) => {
  const [gran, setGran] = useState('wave');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hidden, setHidden] = useState({});

  useEffect(() => {
    if (!studyId || !token) return;
    let cancelled = false;
    setLoading(true);
    axios.get(`${API}/brand-equity/studies/${studyId}/score-history`, {
      params: { granularity: gran },
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => { if (!cancelled) setData(r.data); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [studyId, token, gran]);

  const points = (data?.points || []).map(p => ({
    label: p.label, n: p.n, values: p.composite || {},
  }));
  const usable = points.filter(p => p.n > 0);

  return (
    <div className="be-card" style={{ padding: 20, marginTop: 18 }} data-testid="be-score-history">
      <div className="be-card-h" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 className="be-card-t">Score History · คะแนนตามช่วงเวลา</h3>
          <div className="be-card-d">
            เส้นทึบคือ BES · เส้นประคือ 4 มิติ · ตัวเลข n ใต้แต่ละจุดคือจำนวนผู้ตอบในช่วงนั้น
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {GRANULARITIES.map(g => (
            <button key={g.key}
                    className={'be-btn be-tiny' + (gran === g.key ? ' be-btn-red' : '')}
                    onClick={() => setGran(g.key)}
                    data-testid={`be-history-gran-${g.key}`}>
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="be-muted be-small" style={{ padding: '18px 0' }}>กำลังคำนวณ…</div>}

      {!loading && usable.length < 2 && (
        <div className="be-small be-muted" style={{ padding: '18px 0', lineHeight: 1.6 }}
             data-testid="be-score-history-empty">
          ยังมีข้อมูลไม่พอวาดแนวโน้ม — ต้องมีอย่างน้อย 2 ช่วงที่มีผู้ตอบ
          {gran === 'wave' ? ' (ลองสลับเป็นรายเดือน/รายสัปดาห์)' : ''}
        </div>
      )}

      {!loading && usable.length >= 2 && (
        <>
          <TrendLine points={points}
                     series={SERIES.filter(s => !hidden[s.key])}/>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10 }}>
            {SERIES.map(s => (
              <button key={s.key} className="be-mono be-tiny"
                      onClick={() => setHidden(h => ({ ...h, [s.key]: !h[s.key] }))}
                      data-testid={`be-history-legend-${s.key}`}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none',
                               border: 'none', cursor: 'pointer', letterSpacing: '0.08em',
                               opacity: hidden[s.key] ? 0.35 : 1, padding: 0 }}>
                <span style={{ width: 14, height: 3, background: s.color, display: 'inline-block' }}/>
                {s.label.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="be-tiny be-muted" style={{ marginTop: 10, lineHeight: 1.5 }}>
            {data?.note} · ผลต่างระหว่างสองช่วงมีนัยสำคัญหรือไม่ ดูได้ที่การ์ด "เปรียบเทียบ Wave"
          </div>
        </>
      )}
    </div>
  );
};

/** Unfinished-response nudge for the study owner. */
export const BeUnfinishedCard = ({ studyId, token, shareToken }) => {
  const [s, setS] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!studyId || !token) return;
    axios.get(`${API}/brand-equity/studies/${studyId}/drafts-summary`,
      { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setS(r.data)).catch(() => setS(null));
  }, [studyId, token]);

  if (!s || !s.unfinished) return null;
  const url = `${window.location.origin}/brand-equity/respond/${shareToken}`;

  return (
    <div className="be-card" style={{ padding: 18, marginTop: 18, borderColor: 'var(--be-gold)' }}
         data-testid="be-unfinished-card">
      <div className="be-eyebrow" style={{ marginBottom: 8 }}>
        <span className="be-dot-sm" style={{ background: 'var(--be-gold)' }}/>
        เริ่มทำแต่ยังไม่ส่ง
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.6 }}>
        มี <strong data-testid="be-unfinished-count">{s.unfinished}</strong> คนที่เริ่มตอบแล้วแต่ยังไม่กดส่ง
        (ตอบไปแล้วกลางๆ ประมาณ {s.median_answered} ข้อ)
        — คนกลุ่มนี้กลับมาทำต่อได้จากลิงก์เดิม เพราะระบบเก็บคำตอบค้างไว้ให้แล้ว
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
        <button className="be-btn" data-testid="be-unfinished-copy"
                onClick={() => {
                  navigator.clipboard?.writeText(
                    `อีกไม่กี่ข้อก็เสร็จแล้ว 🙏 กลับมาทำต่อได้จากลิงก์เดิม ระบบจำคำตอบที่ทำไว้ให้: ${url}`
                  );
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}>
          <Icon name="copy" size={11}/>{copied ? 'คัดลอกแล้ว' : 'คัดลอกข้อความเตือน'}
        </button>
      </div>
    </div>
  );
};

export default BeScoreHistory;
