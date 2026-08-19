import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '@/context/AuthContext';
import '../brand-equity/brand-equity-styles.css';
import './journey-styles.css';
import { BeTopbar, BeLoading, Stepper } from '../brand-equity/be-components';
import { COPY, fmtCI } from './copy-th';
import { copyToClipboard } from '@/lib/clipboard';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const STEPS = ['พื้นฐาน', 'ขั้นตอนของลูกค้า', 'งบเวลา + สิ่งที่ได้', 'เปิดเก็บข้อมูล'];

const JourneyWizardPage = () => {
  const { studyId } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const authH = { headers: { Authorization: `Bearer ${token}` } };

  const [step, setStep] = useState(0);
  const [study, setStudy] = useState(null);
  const [loading, setLoading] = useState(!!studyId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [templates, setTemplates] = useState(null);
  const [runs, setRuns] = useState([]);
  const [budget, setBudget] = useState(null);
  const [preview, setPreview] = useState(null);
  const [copied, setCopied] = useState(false);
  const [seedText, setSeedText] = useState('');

  const [form, setForm] = useState({
    title: '', subject_name: '', category: '', sampling_frame: '',
    recall_window_days: 90, target_responses: 120, template_key: 'retail_product',
  });
  const [labels, setLabels] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [t, q] = await Promise.all([
          axios.get(`${API}/journey/templates`, authH),
          axios.get(`${API}/journey/qualitative-runs`, authH),
        ]);
        setTemplates(t.data);
        setRuns(q.data.runs || []);
      } catch (e) { /* templates are cosmetic on the edit path */ }
      if (studyId) {
        try {
          const r = await axios.get(`${API}/journey/studies/${studyId}`, authH);
          hydrate(r.data);
        } catch (e) { setError('เปิดการศึกษานี้ไม่ได้'); }
      }
      setLoading(false);
    })();
    // eslint-disable-next-line
  }, [studyId]);

  const hydrate = (s) => {
    setStudy(s);
    setForm({
      title: s.title || '', subject_name: s.subject?.name || '',
      category: s.subject?.category || '', sampling_frame: s.sampling_frame || '',
      recall_window_days: s.recall_window_days || 90,
      target_responses: s.target_responses || 120,
      template_key: 'retail_product',
    });
    setLabels((s.states || []).map((x) => x.label_th));
  };

  const refreshBudget = useCallback(async (id) => {
    try {
      const [b, p] = await Promise.all([
        axios.get(`${API}/journey/studies/${id}/budget-estimate`, authH),
        axios.get(`${API}/journey/studies/${id}/design-preview`, authH),
      ]);
      setBudget(b.data); setPreview(p.data);
    } catch (e) { /* shown as "—" */ }
    // eslint-disable-next-line
  }, [token]);

  const createOrUpdate = async () => {
    setSaving(true); setError('');
    try {
      if (!study) {
        const r = await axios.post(`${API}/journey/studies`, {
          title: form.title,
          template_key: form.template_key,
          sampling_frame: form.sampling_frame,
          recall_window_days: Number(form.recall_window_days),
          target_responses: Number(form.target_responses),
          subject: { name: form.subject_name, category: form.category },
        }, authH);
        hydrate(r.data);
        navigate(`/market-research/customer-journey/quant/${r.data.id}/wizard`, { replace: true });
      } else {
        const r = await axios.put(`${API}/journey/studies/${study.id}`, {
          title: form.title,
          sampling_frame: form.sampling_frame,
          recall_window_days: Number(form.recall_window_days),
          target_responses: Number(form.target_responses),
          subject: { name: form.subject_name, category: form.category },
        }, authH);
        hydrate(r.data);
      }
      setStep(1);
    } catch (e) {
      setError(e?.response?.data?.detail || 'บันทึกไม่สำเร็จ');
    }
    setSaving(false);
  };

  const saveLabels = async () => {
    setSaving(true); setError('');
    try {
      const r = await axios.put(`${API}/journey/studies/${study.id}`,
        { state_labels: labels.filter((l) => (l || '').trim()) }, authH);
      hydrate(r.data);
      await refreshBudget(study.id);
      setStep(2);
    } catch (e) {
      setError(e?.response?.data?.detail || 'บันทึกขั้นตอนไม่สำเร็จ');
    }
    setSaving(false);
  };

  const seedFrom = async (runId) => {
    setSaving(true); setError('');
    try {
      const r = await axios.post(`${API}/journey/studies/${study.id}/seed`,
        runId ? { qualitative_run_id: runId } : { raw_text: seedText }, authH);
      hydrate(r.data.study);
    } catch (e) {
      setError(e?.response?.data?.detail || 'ดึงขั้นตอนจากผลวิเคราะห์ไม่สำเร็จ');
    }
    setSaving(false);
  };

  const publish = async () => {
    setSaving(true); setError('');
    try {
      const r = await axios.post(`${API}/journey/studies/${study.id}/lock-instrument`, {}, authH);
      setStudy((s) => ({ ...s, status: 'collecting', structure_hash: r.data.structure_hash }));
      setStep(3);
    } catch (e) {
      setError(e?.response?.data?.detail || 'เปิดเก็บข้อมูลไม่สำเร็จ');
    }
    setSaving(false);
  };

  const shareUrl = study ? `${window.location.origin}/journey/r/${study.share_token}` : '';

  if (loading) {
    return <div className="be-root jy-root"><BeTopbar subtitle="CUSTOMER JOURNEY" active="customer_journey" />
      <div className="be-page"><BeLoading text="กำลังโหลด…" /></div></div>;
  }

  return (
    <div className="be-root jy-root">
      <BeTopbar subtitle="CUSTOMER JOURNEY" active="customer_journey" />
      <div className="be-page be-page-narrow" data-testid="journey-wizard">
        <div className="be-section-num">QUANTITATIVE CJM · {study ? 'แก้ไข' : 'สร้างใหม่'}</div>
        <h1 className="be-h2" style={{ marginBottom: 18 }}>ออกแบบการศึกษาเส้นทางลูกค้า</h1>
        <Stepper steps={STEPS} current={step}
                 onStepClick={study ? (i) => { setStep(i); if (i === 2) refreshBudget(study.id); } : null} />

        {error && <div className="jy-warn" data-testid="journey-wizard-error">{error}</div>}

        {/* ---- 1. basics ------------------------------------------------ */}
        {step === 0 && (
          <div className="be-card" data-testid="journey-step-basics">
            <label className="be-label">ชื่อการศึกษา</label>
            <input className="be-input" data-testid="journey-title" value={form.title}
                   onChange={(e) => setForm({ ...form, title: e.target.value })} />

            <div className="be-grid-2" style={{ marginTop: 14 }}>
              <div>
                <label className="be-label">แบรนด์/ร้านที่ศึกษา</label>
                <input className="be-input" data-testid="journey-subject" value={form.subject_name}
                       onChange={(e) => setForm({ ...form, subject_name: e.target.value })} />
              </div>
              <div>
                <label className="be-label">หมวดสินค้า/บริการ</label>
                <input className="be-input" data-testid="journey-category" value={form.category}
                       onChange={(e) => setForm({ ...form, category: e.target.value })} />
              </div>
            </div>

            <label className="be-label" style={{ marginTop: 14 }}>
              กรอบผู้ตอบ (บังคับ · จะถูกพิมพ์ไว้ในทุกไฟล์ส่งออก)
            </label>
            <textarea className="be-textarea" rows={2} data-testid="journey-frame"
                      placeholder="เช่น นิสิตชั้นปี 3–4 คณะบริหารธุรกิจ ที่เคยสั่งอาหารเดลิเวอรีใน 3 เดือนล่าสุด"
                      value={form.sampling_frame}
                      onChange={(e) => setForm({ ...form, sampling_frame: e.target.value })} />
            <p className="be-tiny" style={{ color: 'var(--ink-3)', marginTop: 6, lineHeight: 1.6 }}>
              {COPY.frameNote}
            </p>

            <div className="be-grid-2" style={{ marginTop: 14 }}>
              <div>
                <label className="be-label">ช่วงเวลาที่ให้นึกย้อน</label>
                <select className="be-select" data-testid="journey-recall"
                        value={form.recall_window_days}
                        onChange={(e) => setForm({ ...form, recall_window_days: e.target.value })}>
                  <option value={30}>30 วัน</option>
                  <option value={90}>90 วัน</option>
                  <option value={365}>1 ปี</option>
                </select>
              </div>
              <div>
                <label className="be-label">เป้าหมายจำนวนผู้ตอบ</label>
                <input className="be-input" type="number" data-testid="journey-target"
                       value={form.target_responses}
                       onChange={(e) => setForm({ ...form, target_responses: e.target.value })} />
                <p className="be-tiny" style={{ color: 'var(--ink-3)', marginTop: 6 }}>
                  ต่ำกว่า 120 คน รองรับได้ไม่เกิน 5 ขั้นตอน · 120–250 คน ไม่เกิน 7 ขั้น
                </p>
              </div>
            </div>

            {!study && templates && (
              <>
                <label className="be-label" style={{ marginTop: 14 }}>เริ่มจากชุดขั้นตอนสำเร็จรูป</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {Object.entries(templates.templates).map(([k, v]) => (
                    <button key={k} type="button"
                            className={`be-chip ${form.template_key === k ? 'solid' : ''}`}
                            aria-pressed={form.template_key === k}
                            data-testid={`journey-tpl-${k}`}
                            onClick={() => setForm({ ...form, template_key: k })}>
                      {v.label_th}
                    </button>
                  ))}
                </div>
              </>
            )}

            <button className="be-btn be-btn-primary be-btn-lg" style={{ marginTop: 20 }}
                    data-testid="journey-basics-next" disabled={saving || !form.title || !form.sampling_frame}
                    onClick={createOrUpdate}>
              {saving ? 'กำลังบันทึก…' : 'บันทึกและไปต่อ'}
            </button>
          </div>
        )}

        {/* ---- 2. states ------------------------------------------------ */}
        {step === 1 && study && (
          <div data-testid="journey-step-states">
            <div className="be-card">
              <h3 className="be-card-t">ขั้นตอนที่ผู้ตอบจะเห็น</h3>
              <p className="be-card-d">
                3–10 ขั้น · ชื่อขั้นควรเป็นสิ่งที่ลูกค้า “ทำ” ไม่ใช่สิ่งที่แบรนด์ทำ
              </p>
              {labels.map((l, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input className="be-input" data-testid={`journey-state-${i}`} value={l}
                         onChange={(e) => setLabels(labels.map((x, k) => (k === i ? e.target.value : x)))} />
                  <button className="jy-icon-btn" data-testid={`journey-state-up-${i}`}
                          disabled={i === 0}
                          onClick={() => { const n = [...labels]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setLabels(n); }}>↑</button>
                  <button className="jy-icon-btn" data-testid={`journey-state-del-${i}`}
                          onClick={() => setLabels(labels.filter((_, k) => k !== i))}>✕</button>
                </div>
              ))}
              <button className="be-btn be-btn-sm" style={{ marginTop: 12 }} data-testid="journey-state-add"
                      disabled={labels.length >= 10}
                      onClick={() => setLabels([...labels, ''])}>+ เพิ่มขั้นตอน</button>

              <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
                <button className="be-btn" onClick={() => setStep(0)} data-testid="journey-states-back">ย้อนกลับ</button>
                <button className="be-btn be-btn-primary" data-testid="journey-states-next"
                        disabled={saving || labels.filter((x) => (x || '').trim()).length < 3}
                        onClick={saveLabels}>
                  {saving ? 'กำลังบันทึก…' : 'บันทึกและดูงบเวลา'}
                </button>
              </div>
            </div>

            <div className="be-card" style={{ marginTop: 14 }} data-testid="journey-seed-card">
              <h3 className="be-card-t">ดึงขั้นตอนจากแผนที่เชิงคุณภาพ</h3>
              <p className="be-card-d">
                ระบบอ่านชื่อขั้นตอนจากผลที่คุณเคยสร้างไว้ในแท็บเชิงคุณภาพ แล้วให้คุณแก้ไขเอง
                — AI ไม่ได้กำหนดตัวเลขใด ๆ
              </p>
              {runs.length > 0 ? (
                <div className="jy-optlist" style={{ marginTop: 10 }}>
                  {runs.slice(0, 5).map((r) => (
                    <button key={r.id} type="button" className="jy-opt" data-testid={`journey-seed-run-${r.id}`}
                            onClick={() => seedFrom(r.id)}>
                      {(r.raw_text || '').slice(0, 70) || 'ผลวิเคราะห์'}…
                      <span className="jy-opt-note">{(r.created_at || '').slice(0, 16).replace('T', ' ')}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  <label className="be-label" style={{ marginTop: 10 }}>หรือวางโค้ด Mermaid / รายการขั้นตอน</label>
                  <textarea className="be-textarea" rows={4} data-testid="journey-seed-text"
                            value={seedText} onChange={(e) => setSeedText(e.target.value)} />
                  <button className="be-btn be-btn-sm" style={{ marginTop: 10 }} data-testid="journey-seed-paste"
                          disabled={!seedText.trim() || saving} onClick={() => seedFrom(null)}>
                    ดึงขั้นตอนจากข้อความนี้
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* ---- 3. budget + design preview -------------------------------- */}
        {step === 2 && study && (
          <div data-testid="journey-step-budget">
            <div className="be-card">
              <h3 className="be-card-t">งบเวลาของผู้ตอบ</h3>
              <p className="be-card-d">
                ถ้าเกินเพดาน ระบบจะไม่ให้เปิดเก็บข้อมูล จนกว่าจะลดขั้นตอนหรือลดคำถาม
              </p>
              {!budget ? <BeLoading text="กำลังคำนวณ…" /> : (
                <>
                  <div className="jy-kv"><span>เวลาที่ผู้ตอบครึ่งหนึ่งใช้</span>
                    <b data-testid="journey-budget-sec">{budget.seconds_median} วินาที ({budget.minutes_median} นาที)</b></div>
                  <div className="jy-kv"><span>75% ของผู้ตอบใช้ไม่เกิน</span><b>{budget.seconds_p75} วินาที</b></div>
                  <div className="jy-kv"><span>จำนวนข้อคำถาม</span><b>{budget.scored_items}</b></div>
                  <div className="jy-kv"><span>จำนวนหน้าจอ</span><b>{budget.screens}</b></div>
                  <div className="jy-kv"><span>เพดานขั้นตอนที่เป้าหมายนี้รองรับ</span>
                    <b>{budget.max_states_for_target} ขั้น</b></div>
                  {budget.blocked ? (
                    <div className="jy-warn" style={{ marginTop: 12 }} data-testid="journey-budget-blocked">
                      เกินเพดาน: {budget.blockers.join(' · ')}
                    </div>
                  ) : (
                    <div className="be-tiny" style={{ marginTop: 12, color: 'var(--ink-3)' }}
                         data-testid="journey-budget-ok">
                      ผ่านเพดาน · เหลือพื้นที่เวลาอีก {budget.headroom_pct}%
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="be-card" style={{ marginTop: 14 }}>
              <h3 className="be-card-t">ผู้ตอบ {preview?.r_target || form.target_responses} คน ซื้ออะไรให้คุณได้บ้าง</h3>
              <p className="be-card-d">ดูก่อนที่จะมีใครเสียเวลาตอบจริง</p>
              {!preview ? <BeLoading text="กำลังคำนวณ…" /> : (
                <>
                  <div className="jy-kv"><span>ต้องส่งลิงก์ประมาณ</span>
                    <b data-testid="journey-preview-sends">{preview.link_sends_needed} ครั้ง</b></div>
                  <div className="jy-kv"><span>คาดว่าแต่ละขั้นจะมีคนผ่าน</span>
                    <b>{preview.expected_visitors_per_step} คน</b></div>
                  <div className="jy-kv"><span>ความคลาดเคลื่อนของความยุ่งยากรายขั้น</span>
                    <b>±{preview.burden_ci_halfwidth_pp} จุด</b></div>
                  <table className="be-table" style={{ width: '100%', marginTop: 12 }}>
                    <thead><tr><th>ถ้าเส้นทางหนึ่งพบ</th><th>ช่วงความเชื่อมั่น 95%</th></tr></thead>
                    <tbody>
                      {preview.route_share_precision.map((r) => (
                        <tr key={r.share}><td>{Math.round(r.share * 100)}%</td>
                          <td className="be-num">{fmtCI(r.ci95)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ marginTop: 12 }}>
                    {preview.bands.map((b) => (
                      <div className="jy-kv" key={b.threshold}>
                        <span>{b.unlocks}</span>
                        <b>{b.met ? `เปิด (≥${b.threshold})` : `ยังไม่ถึง ${b.threshold} คน`}</b>
                      </div>
                    ))}
                  </div>
                  <p className="be-tiny" style={{ color: 'var(--ink-3)', marginTop: 12, lineHeight: 1.6 }}>
                    {preview.note_th}
                  </p>
                </>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              <button className="be-btn" onClick={() => setStep(1)} data-testid="journey-budget-back">ย้อนกลับ</button>
              <button className="be-btn be-btn-primary" data-testid="journey-publish-btn"
                      disabled={saving || budget?.blocked} onClick={publish}>
                {saving ? 'กำลังเปิด…' : 'เปิดเก็บข้อมูลและรับลิงก์'}
              </button>
            </div>
          </div>
        )}

        {/* ---- 4. share -------------------------------------------------- */}
        {step === 3 && study && (
          <div className="be-card" data-testid="journey-step-share">
            <h3 className="be-card-t">เปิดเก็บข้อมูลแล้ว</h3>
            <p className="be-card-d">ส่งลิงก์นี้ให้ผู้ตอบ · เปิดบนมือถือได้ · ตอบค้างไว้แล้วกลับมาต่อได้</p>
            <div className="jy-token" data-testid="journey-share-url">{shareUrl}</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <button className="be-btn be-btn-primary" data-testid="journey-copy-share"
                      onClick={async () => { await copyToClipboard(shareUrl); setCopied(true); }}>
                {copied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}
              </button>
              <button className="be-btn" data-testid="journey-goto-dashboard"
                      onClick={() => navigate(`/market-research/customer-journey/quant/${study.id}`)}>
                ไปหน้าผลวิเคราะห์
              </button>
            </div>
            <p className="be-tiny" style={{ color: 'var(--ink-3)', marginTop: 16, lineHeight: 1.7 }}>
              {COPY.phase1Scope}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default JourneyWizardPage;
