import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '@/context/AuthContext';
import '../brand-equity/brand-equity-styles.css';
import './journey-styles.css';
import { BeTopbar, BeLoading } from '../brand-equity/be-components';
import JourneyFlowMap from './JourneyFlowMap';
import { COPY, fmtPct, fmtNum, fmtCI, fmtCIRaw } from './copy-th';
import { copyToClipboard } from '@/lib/clipboard';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Heat cell: shade by weight inside the matrix, and never print a bare 0.
const cell = (v, total) => {
  if (!v) return <span style={{ color: 'var(--ink-3)' }}>·</span>;
  const alpha = Math.min(0.55, 0.10 + (v / Math.max(1, total)) * 2.2);
  return (
    <span style={{ background: `rgba(176,51,42,${alpha.toFixed(2)})`,
                   padding: '2px 7px', borderRadius: 2 }}>{v}</span>
  );
};

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

const JourneyDashboardPage = () => {
  const { studyId } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const authH = { headers: { Authorization: `Bearer ${token}` } };

  const [study, setStudy] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [openChannel, setOpenChannel] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [s, a] = await Promise.all([
          axios.get(`${API}/journey/studies/${studyId}`, authH),
          axios.get(`${API}/journey/studies/${studyId}/analysis`, authH),
        ]);
        setStudy(s.data);
        setData(a.data);
      } catch (e) {
        setError(e?.response?.data?.detail || 'โหลดผลวิเคราะห์ไม่ได้');
      }
      setLoading(false);
    })();
    // eslint-disable-next-line
  }, [studyId]);

  if (loading) {
    return <div className="be-root jy-root"><BeTopbar subtitle="CUSTOMER JOURNEY" active="customer_journey" />
      <div className="be-page"><BeLoading text="กำลังคำนวณผล…" /></div></div>;
  }
  if (error) {
    return <div className="be-root jy-root"><BeTopbar subtitle="CUSTOMER JOURNEY" active="customer_journey" />
      <div className="be-page"><div className="be-card" data-testid="journey-dash-error">{error}</div></div></div>;
  }

  const res = data?.results || {};
  const nodes = res.nodes || {};
  const R = data?.respondent_count || 0;
  const adequacy = res.sample_adequacy || {};
  const diag = res.diagnostics || {};
  const shareUrl = `${window.location.origin}/journey/r/${study.share_token}`;
  const stateOrder = (study.states || []).map((s) => s.id);
  const stageLabel = (id) => (study.stages || []).find((s) => s.id === id)?.label_th || '—';

  return (
    <div className="be-root jy-root">
      <BeTopbar subtitle="CUSTOMER JOURNEY" active="customer_journey" />
      <div className="be-page" data-testid="journey-dashboard">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
                      gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
          <div>
            <div className="be-section-num">QUANTITATIVE CJM · MODEL-FREE</div>
            <h1 className="be-h2">{study.title}</h1>
            <p className="be-tiny" style={{ color: 'var(--ink-3)', marginTop: 8, maxWidth: 680, lineHeight: 1.6 }}>
              {res.scope_note_th || COPY.phase1Scope}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="be-btn be-btn-sm" data-testid="journey-dash-copy-link"
                    onClick={async () => { await copyToClipboard(shareUrl); setCopied(true); }}>
              {copied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์แบบสอบถาม'}
            </button>
            <button className="be-btn be-btn-sm" data-testid="journey-dash-edit"
                    onClick={() => navigate(`/market-research/customer-journey/quant/${studyId}/wizard`)}>
              แก้ไขการศึกษา
            </button>
          </div>
        </div>

        {/* ---- adequacy ------------------------------------------------- */}
        <Card title="ขนาดตัวอย่างตอนนี้บอกอะไรได้บ้าง" testid="journey-adequacy"
              desc={adequacy.band_note_th}>
          <div className="jy-kv"><span>ผู้ตอบที่นำมาวิเคราะห์</span>
            <b data-testid="journey-r-analysed">{res.n_disclosure?.R_analysed ?? R} คน</b></div>
          <div className="jy-kv"><span>ส่งคำตอบทั้งหมด</span><b>{res.n_disclosure?.R_submitted ?? R} คน</b></div>
          <div className="jy-kv"><span>ถูกคัดออกด้วยเกณฑ์คุณภาพ</span><b>{res.n_disclosure?.n_excluded ?? 0} คน</b></div>
          <div className="jy-kv"><span>จำนวนการเปลี่ยนขั้นที่บันทึกได้</span><b>{res.n_disclosure?.n_transitions ?? 0}</b></div>
          <div className="jy-kv"><span>ยังต้องส่งลิงก์เพิ่มอีกประมาณ</span>
            <b data-testid="journey-link-sends">{adequacy.link_sends_for_next_band ?? 0} ครั้ง</b></div>
          <p className="be-tiny" style={{ color: 'var(--ink-3)', marginTop: 12, lineHeight: 1.6 }}>
            {adequacy.message}
          </p>
          {adequacy.loss_view_reason && (
            <div className="jy-warn" style={{ marginTop: 10 }} data-testid="journey-loss-locked">
              {adequacy.loss_view_reason}
            </div>
          )}
        </Card>

        {/* ---- observed-flow map ---------------------------------------- */}
        <Card title="แผนที่เส้นทางที่พบจริง" testid="journey-map"
              desc={`นับจากผู้ตอบ ${res.n_disclosure?.R_analysed ?? R} คน · การเปลี่ยนขั้นทั้งหมด ${res.observed_flow?.total_transitions ?? 0} ครั้ง`}>
          <JourneyFlowMap flow={res.observed_flow} touchpoints={res.touchpoints}
                          stepTouchpoints={res.step_touchpoints} />
        </Card>

        {/* ---- terminals ------------------------------------------------ */}
        <Card title="ปลายทางของผู้ตอบ" desc={COPY.unknownNote} testid="journey-terminals">
          <table className="be-table" style={{ width: '100%' }}>
            <thead><tr><th>ปลายทาง</th><th>คน</th><th>สัดส่วน</th><th>ช่วง 95%</th></tr></thead>
            <tbody>
              {['CONV', 'ABANDON', 'UNKNOWN'].map((k) => {
                const t = (res.terminals || {})[k] || {};
                return (
                  <tr key={k} data-testid={`journey-terminal-${k}`}>
                    <td>{t.label_th || k}</td>
                    <td className="be-num">{t.count ?? 0}</td>
                    <td className="be-num">{fmtPct(t.share, 1)}</td>
                    <td className="be-num">{fmtCI(t.share_ci95, 1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        {/* ---- routes --------------------------------------------------- */}
        <Card title="เส้นทางที่พบจริง" testid="journey-routes"
              desc={res.routes?.shares_hidden
                ? 'ผู้ตอบยังไม่ถึง 30 คน จึงแสดงเฉพาะจำนวนนับ ไม่แสดงเปอร์เซ็นต์'
                : `เส้นทางยอดนิยมครอบคลุม ${fmtPct(res.routes?.coverage)} ของผู้ตอบ`}>
          {(res.routes?.top || []).length === 0 ? (
            <div className="jy-locked" data-testid="journey-routes-empty">ยังไม่มีคำตอบเข้ามา</div>
          ) : (
            <table className="be-table" style={{ width: '100%' }}>
              <thead><tr><th>เส้นทาง</th><th>คน</th><th>สัดส่วน</th><th>ช่วง 95%</th></tr></thead>
              <tbody>
                {res.routes.top.map((r, i) => (
                  <tr key={i} data-testid={`journey-route-${i}`}>
                    <td style={{ maxWidth: 460 }}>{(r.path_labels || []).join(' → ')}</td>
                    <td className="be-num">{r.count}</td>
                    <td className="be-num">{r.share === null ? '—' : fmtPct(r.share, 1)}</td>
                    <td className="be-num">{r.share_ci95 ? fmtCI(r.share_ci95, 1) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* ---- per-step table ------------------------------------------- */}
        <Card title="รายขั้นตอน" desc={res.burden_definition_th || COPY.burdenDef} testid="journey-steps">
          <div style={{ overflowX: 'auto' }}>
            <table className="be-table" style={{ width: '100%', minWidth: 760 }}>
              <thead>
                <tr>
                  <th>ขั้นตอน</th><th>ระยะ</th><th>ช่องทางหลักที่ลูกค้าใช้</th>
                  <th>ผ่านขั้นนี้</th><th>สัดส่วน (95%)</th>
                  <th>ทำซ้ำเฉลี่ย</th><th>ความยุ่งยาก 0–100</th><th>ช่วง 95%</th>
                  <th>ความกังวล 0–100</th><th>ความรู้สึก</th><th>ระบุว่ามีปัญหา</th>
                  <th>ความรุนแรง (เฉพาะผู้เลือก)</th><th>จับตา</th>
                </tr>
              </thead>
              <tbody>
                {stateOrder.map((sid) => {
                  const n = nodes[sid] || {};
                  return (
                    <tr key={sid} data-testid={`journey-step-${sid}`}>
                      <td>{n.label_th || sid}{n.no_visitors && <div className="be-tiny" style={{ color: 'var(--ink-3)' }}>ไม่มีผู้ตอบผ่านขั้นนี้</div>}</td>
                      <td>{stageLabel(n.stage_id)}</td>
                      <td>{n.dominant_channel || '—'}
                        {n.dominant_channel && (
                          <div className="be-tiny">{fmtPct(n.dominant_channel_share, 0)} · n={n.n_channel}</div>
                        )}
                      </td>
                      <td className="be-num">{n.n_visit ?? 0}</td>
                      <td className="be-num">{fmtPct(n.reach, 1)}<div className="be-tiny">{fmtCI(n.reach_ci95, 0)}</div></td>
                      <td className="be-num">{fmtNum(n.revisit, 2)}</td>
                      <td className="be-num">
                        {n.burden === null || n.burden === undefined ? '—' : (
                          <>
                            {fmtNum(n.burden, 1)}
                            <div className="jy-bar" style={{ marginTop: 4 }}>
                              <span style={{ width: `${Math.max(0, Math.min(100, n.burden))}%` }} />
                            </div>
                          </>
                        )}
                      </td>
                      <td className="be-num">{fmtCIRaw(n.burden_ci95, 1)}</td>
                      <td className="be-num">{fmtNum(n.anxiety, 1)}
                        <div className="be-tiny">{fmtCIRaw(n.anxiety_ci95, 1)}</div></td>
                      <td className="be-num">{fmtNum(n.emotion, 2)}</td>
                      <td className="be-num">{fmtPct(n.pain_nomination_rate, 0)}
                        <div className="be-tiny">n={n.n_visit ?? 0}</div></td>
                      <td className="be-num">
                        {n.severity_conditional?.mean === null || n.severity_conditional?.mean === undefined
                          ? '—' : `${fmtNum(n.severity_conditional.mean, 1)} (m=${n.severity_conditional.m})`}
                      </td>
                      <td>
                        {(n.watch_flags || []).length === 0
                          ? <span className="be-tiny" style={{ color: 'var(--ink-3)' }}>—</span>
                          : (n.watch_flags || []).map((f) => (
                            <div className="be-tiny" key={f.key}
                                 style={{ color: 'var(--be-red)' }}>• {f.label_th}</div>
                          ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="be-tiny" style={{ color: 'var(--ink-3)', marginTop: 12, lineHeight: 1.6 }}>
            {res.interval_caveat_th || COPY.intervalCaveat}
          </p>
        </Card>

        {/* ---- touchpoints (customer-side channels) ---------------------- */}
        <Card title="สรุปตามช่องทางที่ลูกค้าใช้ (touchpoint)" testid="journey-touchpoints"
              desc={res.touchpoints?.measured
                ? `${res.touchpoints.unit_th} · รวม ${res.touchpoints.total_visits} ครั้ง`
                : null}>
          {!res.touchpoints?.measured ? (
            <div className="jy-locked" data-testid="journey-touchpoints-empty">
              {res.touchpoints?.asked
                ? 'ยังไม่มีผู้ตอบระบุช่องทาง — รอคำตอบเพิ่ม'
                : res.touchpoints?.not_measured_th}
            </div>
          ) : (
            <>
              {(res.touchpoints.by_type?.two_way || []).length > 0 && (
                <div style={{ marginBottom: 18 }} data-testid="journey-touchpoint-types">
                  <div className="be-label">ประเภทช่องทาง</div>
                  <table className="be-table" style={{ width: '100%' }}>
                    <thead>
                      <tr><th>ประเภท</th><th>ผ่านกี่ครั้ง</th><th>%</th>
                        <th>ความยุ่งยาก</th><th>ช่วง 95%</th><th>ความรู้สึก</th><th>ระบุว่ามีปัญหา</th></tr>
                    </thead>
                    <tbody>
                      {[...res.touchpoints.by_type.two_way, ...res.touchpoints.by_type.three_way]
                        .map((t, i) => {
                        const isRollup = i < res.touchpoints.by_type.two_way.length;
                        return (
                          <tr key={`${t.type}-${i}`} data-testid={`journey-tptype-${t.type}`}
                              style={isRollup ? { fontWeight: 500 } : { color: 'var(--ink-2)' }}>
                            <td>{isRollup ? t.label_th : `— ${t.label_th}`}
                              <div className="be-tiny" style={{ color: 'var(--ink-3)' }}>
                                {(t.channels || []).join(' · ')}
                              </div>
                            </td>
                            <td className="be-num">{t.n_visit}</td>
                            <td className="be-num">{fmtPct(t.share_of_visits, 1)}</td>
                            <td className="be-num">{fmtNum(t.burden, 1)}</td>
                            <td className="be-num">{fmtCIRaw(t.burden_ci95, 1)}</td>
                            <td className="be-num">{fmtNum(t.emotion, 2)}</td>
                            <td className="be-num">{fmtPct(t.pain_rate, 0)}
                              <div className="be-tiny">{fmtCI(t.pain_rate_ci95, 0)}</div></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="be-tiny" style={{ color: 'var(--ink-3)', marginTop: 8, lineHeight: 1.6 }}>
                    {res.touchpoints.by_type.note_th}
                  </p>
                </div>
              )}

              {(res.touchpoints.by_mode?.rows || []).length > 0 && (
                <div style={{ marginBottom: 18 }} data-testid="journey-touchpoint-modes">
                  <div className="be-label">รูปแบบการปฏิสัมพันธ์</div>
                  <table className="be-table" style={{ width: '100%' }}>
                    <thead>
                      <tr><th>รูปแบบ</th><th>ผ่านกี่ครั้ง</th><th>%</th>
                        <th>ความยุ่งยาก</th><th>ช่วง 95%</th><th>ความรู้สึก</th><th>ระบุว่ามีปัญหา</th></tr>
                    </thead>
                    <tbody>
                      {res.touchpoints.by_mode.rows.map((m) => (
                        <tr key={m.mode} data-testid={`journey-tpmode-${m.mode}`}>
                          <td>{m.label_th}
                            <div className="be-tiny" style={{ color: 'var(--ink-3)' }}>
                              {(m.channels || []).join(' · ')}
                            </div>
                          </td>
                          <td className="be-num">{m.n_visit}</td>
                          <td className="be-num">{fmtPct(m.share_of_visits, 1)}</td>
                          <td className="be-num">{fmtNum(m.burden, 1)}</td>
                          <td className="be-num">{fmtCIRaw(m.burden_ci95, 1)}</td>
                          <td className="be-num">{fmtNum(m.emotion, 2)}</td>
                          <td className="be-num">{fmtPct(m.pain_rate, 0)}
                            <div className="be-tiny">{fmtCI(m.pain_rate_ci95, 0)}</div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="be-tiny" style={{ color: 'var(--ink-3)', marginTop: 8, lineHeight: 1.6 }}>
                    {res.touchpoints.by_mode.note_th}
                  </p>
                </div>
              )}
              <div className="be-label">แยกตามช่องทาง (กดที่แถวเพื่อดูปัญหาในช่องทางนั้น)</div>
              <div style={{ overflowX: 'auto' }}>
                <table className="be-table" style={{ width: '100%', minWidth: 640 }}>
                  <thead>
                    <tr><th>ช่องทาง</th><th>ผ่านกี่ครั้ง</th><th>% ของการผ่านทั้งหมด</th>
                      <th>อยู่กี่ขั้น</th><th>ความยุ่งยาก 0–100</th><th>ช่วง 95%</th>
                      <th>ความรู้สึก</th><th>ระบุว่ามีปัญหา</th></tr>
                  </thead>
                  <tbody>
                    {res.touchpoints.rows.map((t) => (
                      <React.Fragment key={t.label}>
                        <tr data-testid={`journey-touchpoint-${t.label}`}
                            style={{ cursor: 'pointer' }}
                            onClick={() => setOpenChannel(openChannel === t.label ? null : t.label)}>
                          <td>
                            <span className="be-mono be-tiny" style={{ marginRight: 6 }}>
                              {openChannel === t.label ? '−' : '+'}
                            </span>
                            {t.label}
                            {t.thin && <div className="be-tiny" style={{ color: 'var(--ink-3)' }}>ข้อมูลยังน้อย</div>}
                          </td>
                          <td className="be-num">{t.n_visit}</td>
                          <td className="be-num">{fmtPct(t.share_of_visits, 1)}</td>
                          <td className="be-num">{t.n_steps}</td>
                          <td className="be-num">{fmtNum(t.burden, 1)}</td>
                          <td className="be-num">{fmtCIRaw(t.burden_ci95, 1)}</td>
                          <td className="be-num">{fmtNum(t.emotion, 2)}</td>
                          <td className="be-num">{fmtPct(t.pain_rate, 0)}
                            <div className="be-tiny">{fmtCI(t.pain_rate_ci95, 0)}</div></td>
                        </tr>
                        {openChannel === t.label && (
                          <tr data-testid={`journey-touchpoint-detail-${t.label}`}>
                            <td colSpan={8} style={{ background: 'var(--paper-2)' }}>
                              {(t.pain_categories || []).length === 0 ? (
                                <span className="be-tiny">ยังไม่มีผู้ตอบระบุปัญหาในช่องทางนี้</span>
                              ) : (
                                <div className="be-grid-2" style={{ gap: 20 }}>
                                  <div>
                                    <div className="be-label">ปัญหาที่พบในช่องทางนี้ ({t.n_pain} ครั้งที่ระบุ)</div>
                                    {t.pain_categories.map((c) => (
                                      <div className="jy-kv" key={c.label}>
                                        <span>{c.label}</span>
                                        <b>{c.count} · {fmtPct(c.share_of_pain, 0)}</b>
                                      </div>
                                    ))}
                                  </div>
                                  <div>
                                    <div className="be-label">เกิดที่ขั้นตอนไหน</div>
                                    {(t.pain_steps || []).map((s) => (
                                      <div className="jy-kv" key={s.state_id}>
                                        <span>{s.label_th}</span><b>{s.count}</b>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="be-tiny" style={{ color: 'var(--ink-3)', marginTop: 10, lineHeight: 1.6 }}>
                {res.touchpoints.note_th}
              </p>
            </>
          )}
        </Card>

        {/* ---- stages (what the customer is doing) ----------------------- */}
        <Card title="สรุปตามระยะของลูกค้า" desc={res.stages_summary?.note_th} testid="journey-stages">
          <table className="be-table" style={{ width: '100%' }}>
            <thead>
              <tr><th>ระยะ</th><th>ขั้นตอน</th><th>ผู้ตอบที่มาถึงระยะนี้</th>
                <th>ความยุ่งยาก 0–100</th><th>ช่วง 95%</th><th>ระบุว่ามีปัญหา</th></tr>
            </thead>
            <tbody>
              {(res.stages_summary?.rows || []).map((s) => (
                <tr key={s.id} data-testid={`journey-stage-${s.id}`}>
                  <td>{s.label_th}</td>
                  <td className="be-num">{s.n_steps}</td>
                  <td className="be-num">{s.n_reached} · {fmtPct(s.reach, 0)}</td>
                  <td className="be-num">{fmtNum(s.burden, 1)}</td>
                  <td className="be-num">{fmtCIRaw(s.burden_ci95, 1)}</td>
                  <td className="be-num">{fmtPct(s.pain_rate, 0)}
                    <div className="be-tiny">n={s.n_rated}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {/* ---- pain categories ------------------------------------------ */}
        <Card title="ปัญหาที่ผู้ตอบระบุ" testid="journey-pain"
              desc="นับเฉพาะผู้ที่เลือกขั้นนั้นว่ามีปัญหา จึงห้ามนำไปเทียบข้ามขั้น">
          {stateOrder.filter((sid) => (nodes[sid]?.pain_categories || []).length > 0).length === 0 ? (
            <div className="jy-locked" data-testid="journey-pain-empty">ยังไม่มีผู้ตอบระบุปัญหา</div>
          ) : stateOrder.map((sid) => {
            const cats = nodes[sid]?.pain_categories || [];
            if (!cats.length) return null;
            return (
              <div key={sid} style={{ marginBottom: 12 }} data-testid={`journey-pain-${sid}`}>
                <div className="be-label">{nodes[sid]?.label_th}</div>
                {cats.map((c) => (
                  <div className="jy-kv" key={c.label}><span>{c.label}</span><b>{c.count}</b></div>
                ))}
              </div>
            );
          })}
        </Card>

        {/* ---- step x touchpoint ----------------------------------------- */}
        {(res.step_touchpoints || []).some((r) => (r.channels || []).length > 0) && (
          <Card title="ขั้นตอน × ช่องทางที่ลูกค้าใช้" testid="journey-step-touchpoints"
                desc="หนึ่งขั้นมีได้หลายช่องทางพร้อมกัน · ตัวเลขคือจำนวนผู้ตอบที่ใช้ช่องทางนั้นในขั้นนั้น">
            <div style={{ overflowX: 'auto' }}>
              <table className="be-table" style={{ width: '100%', minWidth: 720 }}>
                <thead>
                  <tr><th>ขั้นตอน</th><th>ผ่านขั้นนี้</th><th>ช่องทางเฉลี่ยต่อคน</th>
                    <th>ช่องทางที่ใช้ (คน)</th><th>ลักษณะ</th></tr>
                </thead>
                <tbody>
                  {(res.step_touchpoints || []).map((r) => (
                    <tr key={r.state_id} data-testid={`journey-steptp-${r.state_id}`}>
                      <td>{r.label_th}</td>
                      <td className="be-num">{r.n_visit}</td>
                      <td className="be-num">{fmtNum(r.channels_per_visit, 2)}</td>
                      <td>
                        {(r.channels || []).length === 0 ? '—' : (r.channels || []).map((c) => (
                          <div className="jy-kv" key={c.label}>
                            <span>{c.label} <span className="be-tiny" style={{ color: 'var(--ink-3)' }}>
                              ({c.type_label_th})</span></span>
                            <b>{c.count} · {fmtPct(c.share, 0)}</b>
                          </div>
                        ))}
                      </td>
                      <td>{r.mixed_types
                        ? <span style={{ color: 'var(--be-red)' }}>ผสมทั้งไปที่จริงและออนไลน์</span>
                        : <span className="be-tiny" style={{ color: 'var(--ink-3)' }}>ช่องทางเดียวประเภท</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* ---- pain type x step / touchpoint ----------------------------- */}
        <Card title="ปัญหาแบบไหน เกิดที่ขั้นไหน และช่องทางไหน" testid="journey-pain-matrix"
              desc={res.pain_matrix?.note_th}>
          {(res.pain_matrix?.categories || []).length === 0 ? (
            <div className="jy-locked" data-testid="journey-pain-matrix-empty">
              ยังไม่มีผู้ตอบระบุประเภทของปัญหา
            </div>
          ) : (
            <>
              {(res.pain_matrix.by_type || []).length > 0 && (
                <div style={{ marginBottom: 18 }} data-testid="journey-pain-types">
                  <div className="be-label">ปัญหาแบ่งตามประเภท</div>
                  <table className="be-table" style={{ width: '100%' }}>
                    <thead><tr><th>ประเภทปัญหา</th><th>จำนวนครั้งที่ระบุ</th><th>%</th></tr></thead>
                    <tbody>
                      {res.pain_matrix.by_type.map((t) => (
                        <tr key={t.type} data-testid={`journey-paintype-${t.type}`}>
                          <td>{t.label_th}</td>
                          <td className="be-num">{t.count}</td>
                          <td className="be-num">{fmtPct(t.share, 1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div style={{ overflowX: 'auto' }}>
                <table className="be-table" style={{ width: '100%', minWidth: 720 }}>
                  <thead>
                    <tr>
                      <th>ขั้นตอน</th>
                      {res.pain_matrix.categories.map((c) => <th key={c}>{c}</th>)}
                      <th>รวม</th>
                    </tr>
                  </thead>
                  <tbody>
                    {res.pain_matrix.by_step.map((row) => (
                      <tr key={row.state_id} data-testid={`journey-painmx-step-${row.state_id}`}>
                        <td>{row.label_th}</td>
                        {res.pain_matrix.categories.map((c) => (
                          <td className="be-num" key={c}>{cell(row.counts[c], res.pain_matrix.total)}</td>
                        ))}
                        <td className="be-num"><b>{row.total}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {(res.pain_matrix.by_channel || []).length > 0 && (
                <div style={{ overflowX: 'auto', marginTop: 18 }}>
                  <table className="be-table" style={{ width: '100%', minWidth: 720 }}>
                    <thead>
                      <tr>
                        <th>ช่องทางที่ลูกค้าใช้</th>
                        {res.pain_matrix.categories.map((c) => <th key={c}>{c}</th>)}
                        <th>รวม</th>
                      </tr>
                    </thead>
                    <tbody>
                      {res.pain_matrix.by_channel.map((row) => (
                        <tr key={row.label} data-testid={`journey-painmx-chan-${row.label}`}>
                          <td>{row.label}</td>
                          {res.pain_matrix.categories.map((c) => (
                            <td className="be-num" key={c}>{cell(row.counts[c], res.pain_matrix.total)}</td>
                          ))}
                          <td className="be-num"><b>{row.total}</b></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="be-label" style={{ marginTop: 18 }}>ข้อจำกัดที่ต้องเขียนไว้ในรายงาน</div>
              <ul className="be-tiny" style={{ paddingLeft: 18, lineHeight: 1.8, margin: 0, color: 'var(--ink-3)' }}>
                {(res.pain_matrix.limitations_th || []).map((l) => <li key={l}>{l}</li>)}
              </ul>
            </>
          )}
        </Card>

        {/* ---- diagnostics ---------------------------------------------- */}
        <Card title="คุณภาพของข้อมูลและข้อควรระวัง" testid="journey-diagnostics">
          {(diag.warnings || []).map((w) => (
            <div className="jy-warn" key={w.key} data-testid={`journey-warn-${w.key}`}>{w.message_th}</div>
          ))}
          <div className="jy-kv"><span>ไม่ทราบปลายทาง</span><b>{fmtPct(diag.unknown_rate, 1)}</b></div>
          <div className="jy-kv"><span>ตอบครบตามรายการที่เลือกไว้ตอนแรก</span><b>{fmtPct(diag.set_consistency_rate, 1)}</b></div>
          <div className="jy-kv"><span>เพิ่มขั้นตอนระหว่างทาง</span><b>{fmtPct(diag.late_addition_rate, 1)}</b></div>
          <div className="jy-kv"><span>เลือก “อื่น ๆ”</span><b>{fmtPct(diag.other_rate, 1)}</b></div>
          <div className="jy-kv"><span>ลำดับต่างจากที่ผู้วิจัยคาดไว้</span><b>{fmtPct(diag.mask_violation_rate, 1)}</b></div>
          <div className="jy-kv"><span>ชนเพดาน 12 ขั้น</span><b>{fmtPct(diag.cap_rate, 1)}</b></div>
          <div className="jy-kv"><span>ผลของลำดับตัวเลือก</span>
            <b>{diag.option_position_effect === null || diag.option_position_effect === undefined
              ? 'ยังประเมินไม่ได้' : fmtPct(diag.option_position_effect, 1)}</b></div>
          <div className="jy-kv"><span>คัดออกด้วยเกณฑ์คุณภาพ</span>
            <b>{diag.exclusions?.n ?? 0} คน (ประเมินได้ {diag.exclusions?.applicable_flags ?? 0} จาก 4 ข้อ)</b></div>
          <p className="be-tiny" style={{ color: 'var(--ink-3)', marginTop: 10, lineHeight: 1.6 }}>
            {diag.exclusions?.rule_th}
          </p>
        </Card>

        {/* ---- gates ---------------------------------------------------- */}
        <Card title="สิ่งที่ยังไม่แสดงในรอบนี้" testid="journey-gates">
          <div className="jy-locked" data-testid="journey-gate-note">
            {res.gates?.predictive?.message_th || COPY.gateNotRun}
          </div>
          <div className="be-tiny be-mono" style={{ color: 'var(--ink-3)', marginTop: 12 }}>
            เปิดใช้แล้ว: {(res.gates?.unlocked || []).join(' · ')}
          </div>
        </Card>

        {/* ---- methodology ---------------------------------------------- */}
        <Card title="วิธีวิเคราะห์และข้อจำกัด" testid="journey-methodology">
          <p className="be-tiny" style={{ lineHeight: 1.8 }}>{res.methodology_th}</p>
          <p className="be-tiny" style={{ lineHeight: 1.8, marginTop: 10, color: 'var(--ink-3)' }}>
            {COPY.recallNote}
          </p>
          <div className="jy-kv" style={{ marginTop: 12 }}><span>กรอบผู้ตอบที่ประกาศไว้</span>
            <b style={{ maxWidth: 380, textAlign: 'right', fontWeight: 400 }}>{study.sampling_frame}</b></div>
          <div className="jy-kv"><span>รหัสโครงสร้างแบบสอบถาม</span>
            <b className="be-mono">{(data.structure_hash || '').slice(0, 12)}…</b></div>
          <div className="jy-kv"><span>รุ่นถ้อยคำ</span><b>{data.content_revision}</b></div>
        </Card>
      </div>
    </div>
  );
};

export default JourneyDashboardPage;
