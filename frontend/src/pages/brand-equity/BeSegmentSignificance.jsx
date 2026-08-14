import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { DIMENSIONS } from './be-components';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const DIM_ORDER = ['awareness', 'quality', 'identity', 'loyalty'];

/**
 * Segment significance. The dashboard could always FILTER by gender or age, but a
 * 6-point gap between two groups of 15 people looks identical to a real
 * difference, and nothing said which one you were looking at.
 */
export const BeSegmentSignificance = ({ studyId, token, fields = [] }) => {
  const [field, setField] = useState(fields[0] || '');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (!field && fields.length) setField(fields[0]); }, [fields, field]);

  useEffect(() => {
    if (!studyId || !token || !field) return;
    let cancelled = false;
    setLoading(true);
    axios.get(`${API}/brand-equity/studies/${studyId}/segment-significance`, {
      params: { field },
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => { if (!cancelled) setData(r.data); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [studyId, token, field]);

  if (!fields.length) return null;
  const fmtP = (p) => (p == null ? '—' : p < 0.001 ? '< 0.001' : p.toFixed(3));

  return (
    <div className="be-card" style={{ padding: 20, marginTop: 18 }} data-testid="be-segment-significance">
      <div className="be-card-h" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 className="be-card-t">Segment Significance · กลุ่มไหนต่างกันจริง?</h3>
          <div className="be-card-d">
            ทดสอบว่าช่องว่างระหว่างกลุ่มผู้ตอบเป็นของจริง หรือแค่ความคลาดเคลื่อนของการสุ่ม
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {fields.map(f => (
            <button key={f} className={'be-btn be-tiny' + (field === f ? ' be-btn-red' : '')}
                    onClick={() => setField(f)} data-testid={`be-segment-field-${f}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="be-muted be-small" style={{ padding: '16px 0' }}>กำลังคำนวณ…</div>}

      {!loading && data && !data.testable && (
        <div className="be-small be-muted" style={{ padding: '14px 0', lineHeight: 1.6 }}
             data-testid="be-segment-not-testable">
          {data.interpretation || 'ยังทดสอบไม่ได้'}
        </div>
      )}

      {!loading && data?.testable && (
        <>
          <div className="be-mono be-tiny be-muted" style={{ marginBottom: 10 }}
               data-testid="be-segment-groups">
            กลุ่มที่ทดสอบ: {Object.entries(data.groups).map(([g, n]) => `${g} (n=${n})`).join(' · ')}
            {' '}· {data.excluded_note}
          </div>
          <table className="be-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>มิติ</th><th>ค่าเฉลี่ยแต่ละกลุ่ม</th><th>สถิติทดสอบ</th>
                <th>p (Holm)</th><th>ผล</th><th>สรุป</th>
              </tr>
            </thead>
            <tbody>
              {DIM_ORDER.map(k => {
                const t = data.by_dimension?.[k];
                if (!t) return null;
                const color = DIMENSIONS[k]?.color;
                return (
                  <tr key={k} data-testid={`be-segment-row-${k}`}>
                    <td className="be-mono be-tiny" style={{ color, textTransform: 'uppercase' }}>{k}</td>
                    {t.testable ? (
                      <>
                        <td className="be-tiny">
                          {Object.entries(t.groups).map(([g, v]) => (
                            <div key={g}>{g}: <b>{v.mean}</b> <span className="be-muted">(n={v.n})</span></div>
                          ))}
                        </td>
                        <td className="be-mono be-tiny">
                          {t.test === 'welch_t_two_sided'
                            ? <>t = {t.t} (df {t.df})</>
                            : <>F* = {t.statistic}</>}
                          <div className="be-muted">{t.test}</div>
                        </td>
                        <td className="be-mono be-tiny"
                            style={{ fontWeight: 600,
                                     color: t.significant ? 'var(--be-green)' : 'var(--ink-3)' }}>
                          {fmtP(t.p_value_holm)}
                        </td>
                        <td>
                          <span className="be-mono" data-testid={`be-segment-verdict-${k}`}
                                style={{ fontSize: 9, padding: '1px 5px',
                                         border: `1px solid ${t.significant ? 'var(--be-green)' : 'var(--ink-4)'}`,
                                         color: t.significant ? 'var(--be-green)' : 'var(--ink-3)' }}>
                            {t.significant ? 'SIG' : 'ns'}
                          </span>
                        </td>
                        <td className="be-tiny">
                          {t.interpretation}
                          {t.pairwise?.length > 0 && (
                            <div style={{ marginTop: 6 }}>
                              {t.pairwise.map((p, i) => (
                                <div key={i} className="be-muted"
                                     style={{ color: p.significant ? 'var(--be-green)' : undefined }}>
                                  {p.group_a} vs {p.group_b}: {p.diff > 0 ? '+' : ''}{p.diff}
                                  {' '}(p {fmtP(p.p_value_holm)}{p.cohens_d != null ? `, d=${p.cohens_d}` : ''})
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </>
                    ) : (
                      <td colSpan={5} className="be-tiny be-muted">{t.interpretation}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="be-tiny be-muted" style={{ marginTop: 10, lineHeight: 1.6 }}>
            วิธี: {data.method} · {data.caveat}
          </div>
        </>
      )}
    </div>
  );
};

export default BeSegmentSignificance;
