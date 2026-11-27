import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Bot, Check, CloudDownload, Copy, ExternalLink, KeyRound, QrCode, RotateCcw, Search, ShieldCheck, Star, Trash2, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import DormLayout, { Empty, PageHead, Seg, useShell } from './DormLayout';
import { API, agoTh, authHeaders, baht, errMsg, invalidateBuildings, priceView, thDate } from './dormApi';

const TYPE_TH = { listing: 'ประกาศ', mate: 'โปรไฟล์หาเมท', review: 'รีวิวตึก' };
const VIEWS = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'native', label: 'ลงในเว็บ' },
  { id: 'external', label: 'จากเว็บภายนอก' },
  { id: 'closed', label: 'ปิดแล้ว' },
];
const ACT_VIEWS = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'active', label: 'ย้อนกลับได้' },
  { id: 'undone', label: 'ย้อนกลับแล้ว' },
];
const PROP_KIND_TH = {
  review_verification: 'ตรวจคำขอยืนยัน มศว',
  close_native_listing: 'ปิดประกาศนิสิต',
  delete_listing: 'ลบประกาศ',
  resolve_report: 'จัดการรายงาน',
  feature_listing: 'ปักประกาศแนะนำ',
  upsert_building: 'เพิ่ม/แก้ไขข้อมูลตึก',
  moderate_mate: 'จัดการโปรไฟล์หาเมท',
  moderate_review: 'ลบรีวิวตึก',
  publish_digest: 'สรุปโพสต์กลุ่ม OpenChat',
  mass_external_sync: 'อัปเดตห้องภายนอกชุดใหญ่',
};
const PRIORITY_TH = { high: ['ด่วน', 'high'], normal: ['ปกติ', 'normal'], low: ['รอได้', 'low'] };
const ACTION_TH = {
  close_external_gone: 'ปิดห้องไม่ว่าง',
  reopen_external: 'เปิดห้องคืน',
  clear_false_maybe_gone: 'ล้างธงอาจไม่ว่าง',
  resolve_stale_report: 'ปิดรายงานค้าง',
  patch_external_listing: 'อัปเดตข้อมูลห้อง',
  update_building_media: 'อัปเดตสื่อ/ตึก',
  refresh_external_batch: 'ซิงก์ห้องภายนอก',
  review_verification: 'พิจารณาคำขอยืนยัน',
  close_native_listing: 'ปิดประกาศ',
  delete_listing: 'ลบประกาศ',
  resolve_report: 'ปิดรายงาน',
  feature_listing: 'ปักแนะนำ',
  upsert_building: 'อัปเดตตึก',
  moderate_mate: 'จัดการโปรไฟล์',
  moderate_review: 'ลบรีวิว',
  publish_digest: 'ยืนยันสรุปโพสต์',
  mass_external_sync: 'ซิงก์ห้องชุดใหญ่',
};
const KEY_PRESETS = [
  { value: 'dorm.*', label: 'สิทธิ์เต็มระบบหอพัก (dorm.*)' },
  { value: 'dorm.read,dorm.sync,dorm.propose', label: 'อ่าน + ปิดห้องหาย/ซิงก์ + ส่งข้อเสนอ' },
  { value: 'dorm.read,dorm.propose', label: 'อ่าน + ส่งข้อเสนอเท่านั้น (ไม่แก้ข้อมูลเอง)' },
];

const expiredOf = (x) => !!x.expires_at && new Date(x.expires_at) <= new Date();
// One status word per row, saying who closed it when it is closed.
const statusOf = (x) => {
  if (x.status === 'closed') {
    if (x.external) {
      return x.closed_reason === 'missing' ? ['หายจากไฟล์นำเข้า', 'off']
        : x.closed_reason === 'deleted' ? ['ลบแล้ว', 'off']
          : x.closed_reason === 'gone' ? ['ไม่ว่าง (ผู้ใช้แจ้ง)', 'off']
            : ['ไม่ว่างแล้ว', 'off'];
    }
    return x.closed_reason === 'paused_unconfirmed' ? ['พัก (ไม่ยืนยัน 48 ชม.)', 'hold']
      : x.closed_by === 'admin' ? ['แอดมินปิด', 'off'] : ['เจ้าของปิด', 'off'];
  }
  if (expiredOf(x)) return ['หมดอายุ', 'off'];
  if (x.maybe_gone) return [`อาจไม่ว่าง (${x.gone_reports || 1})`, 'hold'];
  if (x.owner_confirm_needed) return ['รอยืนยันสถานะ', 'hold'];
  return x.status === 'reserved' ? ['มีคนจองแล้ว', 'hold'] : ['แสดงอยู่', 'live'];
};

export default function DormAdminPage() {
  const { user, token } = useAuth();
  const { toast, confirm } = useShell();
  const [o, setO] = useState(null);
  const [keys, setKeys] = useState(null);
  const [days, setDays] = useState(7);
  const [digest, setDigest] = useState(null);
  const [err, setErr] = useState('');
  const [view, setView] = useState('all');
  const [actView, setActView] = useState('all');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const [imported, setImported] = useState(null);
  const [qrTag, setQrTag] = useState('poster-tuek14');
  const [qrPath, setQrPath] = useState('/dorm');
  const [propEdits, setPropEdits] = useState({});
  const [keyLabel, setKeyLabel] = useState('');
  const [keyPreset, setKeyPreset] = useState('dorm.*');
  const [keyDays, setKeyDays] = useState('90');
  const [mintedKey, setMintedKey] = useState(null);

  const authToken = token || (() => { try { return localStorage.getItem('token'); } catch { return null; } })();

  const load = useCallback(() => {
    const t = token || (() => { try { return localStorage.getItem('token'); } catch { return null; } })();
    if (!t) return;
    axios.get(`${API}/admin/overview`, authHeaders(t)).then((r) => { setO(r.data); setErr(''); }).catch((e) => setErr(errMsg(e)));
    axios.get(`${API}/admin/keys`, authHeaders(t)).then((r) => setKeys(r.data.items || [])).catch(() => setKeys([]));
  }, [token]);
  useEffect(() => { if (user?.role === 'admin') load(); }, [user, load]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (o?.listings || []).filter((x) => (view === 'native' ? !x.external : view === 'external' ? x.external : view === 'closed' ? x.status === 'closed' : true)
      && (!s || `${x.title} ${x.building_name || ''} ${x.source || ''} ${x.id}`.toLowerCase().includes(s)));
  }, [o, view, q]);

  const actions = useMemo(() => {
    const list = o?.recent_actions || [];
    if (actView === 'active') return list.filter((a) => a.can_undo);
    if (actView === 'undone') return list.filter((a) => !!a.undone_at);
    return list;
  }, [o, actView]);

  if (user?.role !== 'admin') return <DormLayout title="แอดมิน"><Empty title="หน้านี้สำหรับแอดมินเท่านั้น" /></DormLayout>;

  const proposals = o?.proposals || [];
  const getPayload = (p) => ({ ...(p.payload || {}), ...(propEdits[p.id] || {}) });
  const patchProp = (p, patch) => setPropEdits((prev) => ({ ...prev, [p.id]: { ...(p.payload || {}), ...(prev[p.id] || {}), ...patch } }));

  const makeDigest = async () => {
    try {
      const r = await axios.get(`${API}/admin/digest`, { params: { days, base_url: window.location.origin }, ...authHeaders(authToken) });
      setDigest(r.data);
    } catch (e) { setErr(errMsg(e)); }
  };
  const copyText = async (txt, okMsg = 'คัดลอกแล้ว') => {
    try { await navigator.clipboard.writeText(txt); toast(okMsg); } catch { toast('คัดลอกไม่ได้ ลองเลือกข้อความเอง'); }
  };
  const call = async (key, fn, msg) => {
    setBusy(key);
    try { await fn(); if (msg) toast(msg); invalidateBuildings(); load(); } catch (e) { toast(errMsg(e)); }
    setBusy('');
  };
  const runImport = () => call('import', async () => {
    const r = await axios.post(`${API}/admin/import-external`, {}, authHeaders(authToken));
    setImported({ ...r.data, at: new Date() });
  }, 'นำเข้าประกาศภายนอกแล้ว');
  const setStatus = (x, status, msg) => call(x.id, () => axios.post(`${API}/listings/${x.id}/status`, { status }, authHeaders(authToken)), msg);
  const feature = (x) => call(x.id, () => axios.post(`${API}/admin/listings/${x.id}/feature`, { featured: !x.featured }, authHeaders(authToken)),
    x.featured ? 'เลิกปักแนะนำแล้ว' : 'ปักแนะนำแล้ว');
  const close = async (x) => {
    const ok = await confirm(x.external
      ? { title: 'ห้องนี้ไม่ว่างแล้ว?', body: `${x.title} จะหายจากเว็บ และการนำเข้ารอบต่อไปจะไม่ดึงกลับมา เปิดอีกครั้งได้จากหน้านี้`, action: 'ไม่ว่างแล้ว' }
      : { title: 'ปิดประกาศนี้?', body: `${x.title} จะหายจากเว็บ เจ้าของจะเปิดเองไม่ได้ แอดมินเปิดอีกครั้งได้จากหน้านี้`, action: 'ปิดประกาศ' });
    if (ok) setStatus(x, 'closed', x.external ? 'ปิดเป็นไม่ว่างแล้ว' : 'ปิดประกาศแล้ว');
  };
  const del = async (x) => {
    const ok = await confirm({
      title: 'ลบประกาศนี้ถาวร?', danger: true, action: 'ลบประกาศ',
      body: x.external ? `${x.title} จะหายจากเว็บ และการนำเข้ารอบต่อไปจะไม่ดึงกลับมา` : `${x.title} พร้อมรูปและสถิติจะหายไป กู้คืนไม่ได้`,
    });
    if (ok) call(x.id, () => axios.delete(`${API}/listings/${x.id}`, authHeaders(authToken)), 'ลบประกาศแล้ว');
  };
  const resolve = (r) => call(r.id, () => axios.post(`${API}/admin/reports/${r.id}/resolve`, {}, authHeaders(authToken)), 'ตรวจแล้ว');
  const reviewVerify = (v, action) => call(`v-${v.user_id}`, () => axios.post(`${API}/admin/verifications/${v.user_id}`, { action }, authHeaders(authToken)),
    action === 'approve' ? 'อนุมัติป้ายยืนยัน มศว แล้ว' : 'ปฏิเสธคำขอยืนยันแล้ว');

  const confirmProp = async (p) => {
    const pl = getPayload(p);
    const destructive = p.kind === 'delete_listing'
      || p.kind === 'moderate_review'
      || (p.kind === 'moderate_mate' && pl.action === 'delete')
      || (p.kind === 'resolve_report' && pl.decision === 'delete_target');
    if (destructive) {
      const ok = await confirm({
        title: `ยืนยัน: ${p.title}`,
        body: 'รายการนี้จะลบข้อมูลเป้าหมาย (ยังสามารถกดย้อนกลับจากประวัติการทำรายการได้)',
        danger: true,
        action: 'ยืนยันทำตามนี้',
      });
      if (!ok) return;
    }
    await call(`prop-${p.id}`, async () => {
      const r = await axios.post(`${API}/admin/proposals/${p.id}/confirm`, { payload: pl }, authHeaders(authToken));
      if (p.kind === 'publish_digest' && r.data?.result?.text) {
        try { await navigator.clipboard.writeText(r.data.result.text); } catch { /* ignore */ }
      }
      setPropEdits((prev) => { const next = { ...prev }; delete next[p.id]; return next; });
    }, 'ยืนยันและดำเนินการเรียบร้อยแล้ว');
  };
  const rejectProp = (p) => call(`prop-${p.id}`, async () => {
    await axios.post(`${API}/admin/proposals/${p.id}/reject`, {}, authHeaders(authToken));
    setPropEdits((prev) => { const next = { ...prev }; delete next[p.id]; return next; });
  }, 'ปัดตกข้อเสนอแล้ว');

  const undoAction = (a) => call(`act-${a.id}`, () => axios.post(`${API}/admin/actions/${a.id}/undo`, {}, authHeaders(authToken)), 'ย้อนกลับเรียบร้อยแล้ว');

  const mintKey = async (e) => {
    e.preventDefault();
    const label = keyLabel.trim();
    if (!label) { toast('กรุณาตั้งชื่อคีย์ เช่น dorm-bot'); return; }
    const scopes = keyPreset.split(',').map((s) => s.trim()).filter(Boolean);
    const body = { label, scopes };
    if (Number(keyDays) > 0) body.expires_days = Number(keyDays);
    await call('mint-key', async () => {
      const r = await axios.post(`${API}/admin/keys`, body, authHeaders(authToken));
      setMintedKey(r.data);
      setKeyLabel('');
    }, 'สร้าง Agent API key แล้ว — คัดลอกเก็บไว้ทันที');
  };
  const revokeKey = async (k) => {
    const ok = await confirm({ title: `ยกเลิกคีย์ "${k.label}"?`, body: 'Agent ที่ใช้คีย์นี้จะเข้าถึงระบบไม่ได้ทันที', danger: true, action: 'ยกเลิกคีย์' });
    if (ok) call(`key-${k.id}`, () => axios.delete(`${API}/admin/keys/${k.id}`, authHeaders(authToken)), 'ยกเลิกคีย์แล้ว');
  };

  const nExt = (o?.listings || []).filter((x) => x.external && x.status !== 'closed' && !expiredOf(x)).length;
  const nNative = (o?.listings || []).filter((x) => !x.external && x.status !== 'closed' && !expiredOf(x)).length;

  return (
    <DormLayout title="แอดมิน" className="dm-adminpage">
      <PageHead title="แอดมิน" sub={o ? `เปิดอยู่ ลงในเว็บ ${nNative} จากเว็บภายนอก ${nExt} โปรไฟล์หาเมท ${o.mates_total} กดดูช่องทางติดต่อ 30 วัน ${o.leads_30d} ครั้ง` : undefined} />
      {err && <div className="dm-err" role="alert">{err}</div>}

      <section className="dm-admin-card dm-prop-section" aria-labelledby="dm-ad-prop" data-testid="dorm-admin-proposals">
        <div className="dm-prop-head">
          <h2 id="dm-ad-prop">
            <ShieldCheck size={18} aria-hidden="true" />
            งานรอแอดมินพิจารณา {o ? <span className="dm-admin-n">{proposals.length}</span> : null}
          </h2>
          <span className="dm-tiny dm-muted">Agent เตรียมข้อมูลและทางเลือกไว้ให้แล้ว แก้สั้นๆ แล้วกดยืนยันได้เลย (ย้อนกลับทีหลังได้)</span>
        </div>
        {o && !proposals.length && (
          <p className="dm-muted dm-small">ยังไม่มีงานที่รอตัดสินใจ — งานประจำอย่างปิดห้องภายนอกที่หายไป Agent จัดการให้และลงประวัติไว้ด้านล่างแล้ว</p>
        )}
        {proposals.length > 0 && (
          <ul className="dm-prop-list">
            {proposals.map((p) => {
              const pl = getPayload(p);
              const [prLabel, prCls] = PRIORITY_TH[p.priority] || PRIORITY_TH.normal;
              const working = busy === `prop-${p.id}`;
              return (
                <li key={p.id} className="dm-prop-card" data-testid="dorm-proposal-card">
                  <div className="dm-prop-top">
                    <div className="dm-prop-badges">
                      <span className={`dm-prop-pri is-${prCls}`}>{prLabel}</span>
                      <span className="dm-admin-type">{PROP_KIND_TH[p.kind] || p.kind}</span>
                      <span className="dm-tiny dm-muted">{p.created_by} · {agoTh(p.created_at) || thDate(p.created_at)}</span>
                    </div>
                    <div className="dm-prop-title">
                      {p.target_link ? <Link to={p.target_link} className="dm-admin-target">{p.title}</Link> : <b>{p.title}</b>}
                    </div>
                    {p.summary && <p className="dm-small dm-muted">{p.summary}</p>}
                    {(p.evidence || []).length > 0 && (
                      <div className="dm-prop-ev">
                        {p.evidence.map((ev, idx) => (ev.url ? (
                          <a key={idx} href={ev.url} target="_blank" rel="noopener noreferrer" className="dm-ev-chip is-link">
                            <span>{ev.label}:</span> <b>{ev.value}</b> <ExternalLink size={11} aria-hidden="true" />
                          </a>
                        ) : (
                          <span key={idx} className="dm-ev-chip"><span>{ev.label}:</span> <b>{ev.value}</b></span>
                        )))}
                      </div>
                    )}
                  </div>

                  <div className="dm-prop-edit">
                    {p.kind === 'review_verification' && (
                      <div className="dm-prop-inline">
                        <div className="dm-prop-toggle" role="group" aria-label="ผลการพิจารณา">
                          <button type="button" className={`dm-btn dm-btn-sm ${ (pl.action || 'approve') === 'approve' ? 'dm-btn-tint' : 'dm-btn-quiet' }`}
                                  onClick={() => patchProp(p, { action: 'approve' })}>อนุมัติ</button>
                          <button type="button" className={`dm-btn dm-btn-sm ${ pl.action === 'reject' ? 'dm-btn-tint dm-btn-del' : 'dm-btn-quiet' }`}
                                  onClick={() => patchProp(p, { action: 'reject' })}>ไม่อนุมัติ</button>
                        </div>
                        <input value={pl.reason || ''} onChange={(e) => patchProp(p, { reason: e.target.value })}
                               placeholder="หมายเหตุ / เหตุผล (ถ้าไม่อนุมัติ)" aria-label="เหตุผลยืนยัน" />
                      </div>
                    )}

                    {p.kind === 'resolve_report' && (
                      <div className="dm-prop-inline">
                        <select value={pl.decision || 'resolve_only'} onChange={(e) => patchProp(p, { decision: e.target.value })} aria-label="การจัดการรายงาน">
                          <option value="resolve_only">ยกฟ้อง (ปิดรายงานอย่างเดียว)</option>
                          <option value="close_target">ปิดประกาศ/โปรไฟล์ + ปิดรายงาน</option>
                          <option value="delete_target">ลบเป้าหมาย + ปิดรายงาน</option>
                        </select>
                        <input value={pl.note || ''} onChange={(e) => patchProp(p, { note: e.target.value })}
                               placeholder="บันทึกแอดมิน (ไม่บังคับ)" aria-label="บันทึกแอดมิน" />
                      </div>
                    )}

                    {(p.kind === 'close_native_listing' || p.kind === 'delete_listing' || p.kind === 'moderate_review') && (
                      <div className="dm-prop-inline">
                        <input value={pl.reason || ''} onChange={(e) => patchProp(p, { reason: e.target.value })}
                               placeholder="เหตุผลแอดมิน (ไม่บังคับ)" aria-label="เหตุผล" />
                      </div>
                    )}

                    {p.kind === 'moderate_mate' && (
                      <div className="dm-prop-inline">
                        <select value={pl.action || 'close'} onChange={(e) => patchProp(p, { action: e.target.value })} aria-label="จัดการโปรไฟล์">
                          <option value="close">ปิดซ่อนโปรไฟล์</option>
                          <option value="delete">ลบโปรไฟล์</option>
                        </select>
                        <input value={pl.reason || ''} onChange={(e) => patchProp(p, { reason: e.target.value })}
                               placeholder="เหตุผล (ไม่บังคับ)" aria-label="เหตุผล" />
                      </div>
                    )}

                    {p.kind === 'feature_listing' && (
                      <div className="dm-prop-inline">
                        <div className="dm-prop-toggle" role="group" aria-label="ปักแนะนำ">
                          <button type="button" className={`dm-btn dm-btn-sm ${ pl.featured !== false ? 'dm-btn-tint' : 'dm-btn-quiet' }`}
                                  onClick={() => patchProp(p, { featured: true })}>ปักแนะนำ</button>
                          <button type="button" className={`dm-btn dm-btn-sm ${ pl.featured === false ? 'dm-btn-tint' : 'dm-btn-quiet' }`}
                                  onClick={() => patchProp(p, { featured: false })}>เลิกปักแนะนำ</button>
                        </div>
                      </div>
                    )}

                    {p.kind === 'upsert_building' && (
                      <div className="dm-prop-grid">
                        <input value={pl.name || ''} onChange={(e) => patchProp(p, { name: e.target.value })} placeholder="ชื่อตึก" aria-label="ชื่อตึก" />
                        <input type="number" min={1} max={120} value={pl.minutes_to_swu || ''} onChange={(e) => patchProp(p, { minutes_to_swu: e.target.value ? Number(e.target.value) : null })}
                               placeholder="นาทีถึง มศว" aria-label="นาทีถึง มศว" />
                        <input value={pl.price_seen || ''} onChange={(e) => patchProp(p, { price_seen: e.target.value })} placeholder="ช่วงราคาที่พบ" aria-label="ช่วงราคา" />
                        <input value={pl.web_review_summary || ''} onChange={(e) => patchProp(p, { web_review_summary: e.target.value })} placeholder="สรุปรีวิว" aria-label="สรุปรีวิว" />
                      </div>
                    )}

                    {p.kind === 'publish_digest' && (
                      <textarea rows={4} value={pl.text || ''} onChange={(e) => patchProp(p, { text: e.target.value })}
                                placeholder="ข้อความสรุปสำหรับโพสต์ลงกลุ่ม" aria-label="ข้อความสรุป" />
                    )}

                    {p.kind === 'mass_external_sync' && (
                      <p className="dm-tiny dm-muted">จะนำเข้า/ซิงก์รายการทั้งหมด <b>{Array.isArray(pl.listings) ? pl.listings.length : 0}</b> ห้องตามแผนที่ Agent เตรียมไว้</p>
                    )}
                  </div>

                  <div className="dm-prop-btns">
                    <button type="button" className="dm-btn dm-btn-tint dm-btn-sm" disabled={working}
                            onClick={() => confirmProp(p)} data-testid="dorm-proposal-confirm">
                      <Check size={15} aria-hidden="true" />ยืนยันทำตามนี้
                    </button>
                    <button type="button" className="dm-btn dm-btn-quiet dm-btn-sm" disabled={working}
                            onClick={() => rejectProp(p)} data-testid="dorm-proposal-reject">
                      <X size={15} aria-hidden="true" />ปัดตก
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="dm-admin-top">
        <div className="dm-admin-maincol">
          <section className="dm-admin-card" aria-labelledby="dm-ad-act" data-testid="dorm-admin-actions">
            <div className="dm-act-head">
              <h2 id="dm-ad-act">
                <Bot size={18} aria-hidden="true" />
                สิ่งที่ Agent ทำไปแล้ว (ย้อนกลับได้) {o ? <span className="dm-admin-n">{actions.length}</span> : null}
              </h2>
              <Seg value={actView} onChange={setActView} label="ตัวกรองประวัติ" options={ACT_VIEWS} />
            </div>
            {o && !actions.length && <p className="dm-muted dm-small">ยังไม่มีรายการในหมวดนี้</p>}
            {actions.length > 0 && (
              <ul className="dm-act-list">
                {actions.map((a) => (
                  <li key={a.id} className={`dm-act-row ${a.undone_at ? 'is-undone' : ''}`} data-testid="dorm-agent-action">
                    <div className="dm-act-body">
                      <div className="dm-act-meta">
                        <span className="dm-admin-type">{ACTION_TH[a.action] || a.action}</span>
                        {a.source === 'proposal_confirmed' && <span className="dm-act-src">ยืนยันจากข้อเสนอ</span>}
                        <span className="dm-tiny dm-muted">{a.actor} · {agoTh(a.created_at) || thDate(a.created_at)}</span>
                      </div>
                      <div className="dm-act-title">
                        {a.target_link && a.target_link.startsWith('/dorm/')
                          ? <Link to={a.target_link} className="dm-admin-target">{a.title}</Link>
                          : <span>{a.title}</span>}
                      </div>
                      {a.reason && <div className="dm-tiny dm-muted">{a.reason}</div>}
                      {a.undone_at && <div className="dm-tiny dm-act-undone">ย้อนกลับแล้ว ({a.undone_by || 'admin'} · {agoTh(a.undone_at) || thDate(a.undone_at)})</div>}
                    </div>
                    <div className="dm-act-right">
                      {a.can_undo ? (
                        <button type="button" className="dm-btn dm-btn-quiet dm-btn-sm" disabled={busy === `act-${a.id}`}
                                onClick={() => undoAction(a)} data-testid="dorm-action-undo">
                          <RotateCcw size={14} aria-hidden="true" />ย้อนกลับ
                        </button>
                      ) : (
                        <span className="dm-tiny dm-muted">{a.undone_at ? 'ย้อนแล้ว' : 'บันทึกไว้'}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="dm-admin-card" aria-labelledby="dm-ad-rep">
            <h2 id="dm-ad-rep">รายงานรอตรวจ {o ? <span className="dm-admin-n">{o.reports.length}</span> : null}</h2>
            {o && !o.reports.length && <p className="dm-muted dm-small">ไม่มีรายงานค้าง</p>}
            {o?.reports.length > 0 && (
              <ul className="dm-admin-reports">
                {o.reports.map((r) => (
                  <li key={r.id} className="dm-admin-report" data-testid="dorm-admin-report">
                    <div className="dm-admin-report-main">
                      <span className="dm-admin-type">{TYPE_TH[r.target_type] || r.target_type}</span>
                      {r.target_link
                        ? <Link to={r.target_link} className="dm-admin-target">{r.target_title || r.target_id}</Link>
                        : <span className="dm-admin-target dm-muted">{r.target_title}</span>}
                      {r.target_status === 'closed' && <span className="dm-status off"><i aria-hidden="true" />ปิดแล้ว</span>}
                      <div className="dm-admin-reason"><b>{r.reason}</b>{r.note ? <span className="dm-admin-note">“{r.note}”</span> : null}</div>
                      <span className="dm-tiny dm-muted">{thDate(r.created_at)}</span>
                    </div>
                    <button type="button" className="dm-btn dm-btn-quiet dm-btn-sm dm-admin-btn" disabled={busy === r.id} onClick={() => resolve(r)}>ตรวจแล้ว</button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="dm-admin-side">
          <section className="dm-admin-card" aria-labelledby="dm-ad-ver">
            <h2 id="dm-ad-ver">คำขอยืนยันนิสิต มศว {o ? <span className="dm-admin-n">{(o.verifications || []).length}</span> : null}</h2>
            {o && !(o.verifications || []).length && <p className="dm-muted dm-small">ไม่มีคำขอค้าง</p>}
            {(o?.verifications || []).length > 0 && (
              <ul className="dm-admin-reports">
                {o.verifications.map((v) => (
                  <li key={v.user_id} className="dm-admin-report" data-testid="dorm-admin-verify">
                    <div className="dm-admin-report-main">
                      <span className="dm-admin-type">{v.status_label || v.kind}</span>
                      <span className="dm-admin-target">{v.user_name || v.user_email}</span>
                      <div className="dm-admin-reason">
                        <b>{v.faculty}</b>
                        {v.entry_year ? <span>เข้าปี {v.entry_year}</span> : null}
                        {v.swu_email ? <span className="dm-muted">{v.swu_email}</span> : null}
                      </div>
                      {v.note ? <span className="dm-admin-note dm-small">“{v.note}”</span> : null}
                      <span className="dm-tiny dm-muted">{v.user_email} · {thDate(v.updated_at || v.created_at)}</span>
                    </div>
                    <div className="dm-actions" style={{ flexDirection: 'column', gap: 6 }}>
                      <button type="button" className="dm-btn dm-btn-tint dm-btn-sm dm-admin-btn" disabled={busy === `v-${v.user_id}`} onClick={() => reviewVerify(v, 'approve')}>อนุมัติ</button>
                      <button type="button" className="dm-btn dm-btn-quiet dm-btn-sm dm-admin-btn dm-btn-del" disabled={busy === `v-${v.user_id}`} onClick={() => reviewVerify(v, 'reject')}>ไม่อนุมัติ</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="dm-admin-card" aria-labelledby="dm-ad-keys" data-testid="dorm-admin-keys">
            <h2 id="dm-ad-keys">
              <KeyRound size={16} aria-hidden="true" />
              คีย์สำหรับ Agent ข้างนอก {keys ? <span className="dm-admin-n">{keys.filter((k) => !k.revoked_at).length}</span> : null}
            </h2>
            <p className="dm-small dm-muted">สร้าง API key แยกสิทธิ์ให้ agent/บอทข้างนอก (ไม่สามารถยืนยันข้อเสนอแทนคนหรือสร้างคีย์เพิ่มได้)</p>
            <form className="dm-key-form" onSubmit={mintKey}>
              <input value={keyLabel} onChange={(e) => setKeyLabel(e.target.value.slice(0, 80))}
                     placeholder="ชื่อคีย์ เช่น dorm-bot" aria-label="ชื่อ Agent API key" />
              <div className="dm-key-row2">
                <select value={keyPreset} onChange={(e) => setKeyPreset(e.target.value)} aria-label="ขอบเขตสิทธิ์">
                  {KEY_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
                <select value={keyDays} onChange={(e) => setKeyDays(e.target.value)} aria-label="อายุคีย์">
                  <option value="90">หมดอายุ 90 วัน</option>
                  <option value="30">หมดอายุ 30 วัน</option>
                  <option value="0">ไม่หมดอายุ</option>
                </select>
              </div>
              <button type="submit" className="dm-btn dm-btn-tint dm-btn-sm" disabled={busy === 'mint-key'} data-testid="dorm-key-mint">
                สร้างคีย์
              </button>
            </form>

            {mintedKey?.key && (
              <div className="dm-key-once" role="status" data-testid="dorm-key-minted">
                <div className="dm-tiny"><b>คีย์ใหม่ (แสดงครั้งเดียว — รีบคัดลอกเก็บไว้):</b></div>
                <code>{mintedKey.key}</code>
                <div className="dm-key-once-acts">
                  <button type="button" className="dm-btn dm-btn-quiet dm-btn-sm" onClick={() => copyText(mintedKey.key, 'คัดลอกคีย์แล้ว')}>
                    <Copy size={13} aria-hidden="true" />คัดลอกคีย์
                  </button>
                  <button type="button" className="dm-btn dm-btn-quiet dm-btn-sm" onClick={() => copyText(
                    `curl -s "${window.location.origin}/api/dorm/admin/agent/brief" -H "Authorization: Bearer ${mintedKey.key}"`,
                    'คัดลอกคำสั่ง curl แล้ว',
                  )}>
                    <Copy size={13} aria-hidden="true" />คัดลอก curl ทดสอบ
                  </button>
                </div>
              </div>
            )}

            {keys && keys.length > 0 && (
              <ul className="dm-key-list">
                {keys.map((k) => (
                  <li key={k.id} className={`dm-key-item ${k.revoked_at ? 'is-revoked' : ''}`} data-testid="dorm-key-row">
                    <div className="dm-key-info">
                      <b>{k.label}</b> <code>{k.fingerprint}…</code>
                      <div className="dm-tiny dm-muted">
                        {(k.scopes || []).join(', ')} · {k.last_used_at ? `ใช้ล่าสุด ${agoTh(k.last_used_at)}` : 'ยังไม่เคยใช้'}
                        {k.revoked_at ? ' · ยกเลิกแล้ว' : ''}
                      </div>
                    </div>
                    {!k.revoked_at && (
                      <button type="button" className="dm-btn dm-btn-quiet dm-btn-sm dm-btn-del" disabled={busy === `key-${k.id}`}
                              onClick={() => revokeKey(k)} aria-label={`ยกเลิก ${k.label}`} data-testid="dorm-key-revoke">
                        <Trash2 size={13} aria-hidden="true" />ยกเลิก
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="dm-admin-card" aria-labelledby="dm-ad-qr">
            <h2 id="dm-ad-qr">
              <QrCode size={16} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 6 }} />
              ยอดสแกน QR / ลิงก์โปรโมต (30 วัน) {o ? <span className="dm-admin-n">{o.qr_total_30d || 0}</span> : null}
            </h2>
            {o && !(o.qr_scans_30d || []).length && (
              <p className="dm-muted dm-small">ยังไม่มีคนสแกนลิงก์ที่มี <code>?src=</code> ใน 30 วันล่าสุด</p>
            )}
            {(o?.qr_scans_30d || []).length > 0 && (() => {
              const top = Math.max(1, ...o.qr_scans_30d.map((x) => x.count));
              return (
                <ul className="dm-qr-list" data-testid="dorm-admin-qr-list">
                  {o.qr_scans_30d.map((x) => (
                    <li key={x.src} className="dm-qr-row">
                      <div className="dm-qr-meta">
                        <code>{x.src}</code>
                        <span><b>{x.count}</b> ครั้ง · ล่าสุด {thDate(x.last_at)}</span>
                      </div>
                      <div className="dm-qr-bar" aria-hidden="true"><i style={{ width: `${Math.max(8, Math.round((x.count / top) * 100))}%` }} /></div>
                    </li>
                  ))}
                </ul>
              );
            })()}
            <div className="dm-qr-builder">
              <span className="dm-tiny dm-muted">สร้างลิงก์ติดโปสเตอร์ / สติกเกอร์แพนด้า (ใส่ชื่อจุดติดเป็นอังกฤษ/ตัวเลข)</span>
              <div className="dm-qr-inputs">
                <input value={qrTag} onChange={(e) => setQrTag(e.target.value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48))}
                       placeholder="เช่น canteen-swu" aria-label="ชื่อจุดติด QR" />
                <select value={qrPath} onChange={(e) => setQrPath(e.target.value)} aria-label="หน้าปลายทาง">
                  <option value="/dorm">หน้าแรก</option>
                  <option value="/dorm/rooms">ห้องว่าง</option>
                  <option value="/dorm/mates">หาเมท</option>
                  <option value="/dorm/post">ลงประกาศ</option>
                </select>
              </div>
              {qrTag && (() => {
                const url = `${window.location.origin}${qrPath}?src=${qrTag}`;
                return (
                  <div className="dm-qr-preview">
                    <code>{url}</code>
                    <button type="button" className="dm-btn dm-btn-quiet dm-btn-sm" onClick={() => copyText(url, 'คัดลอกลิงก์ QR แล้ว')}>
                      <Copy size={13} aria-hidden="true" />คัดลอก
                    </button>
                  </div>
                );
              })()}
            </div>
          </section>

          <section className="dm-admin-card" aria-labelledby="dm-ad-imp">
            <h2 id="dm-ad-imp">ประกาศจากเว็บภายนอก</h2>
            <p className="dm-small dm-muted">อ่านไฟล์ข้อมูลห้องอีกรอบ ห้องที่แอดมินปิดหรือลบไว้จะไม่ถูกดึงกลับมา</p>
            <button type="button" className="dm-btn dm-btn-tint dm-btn-sm" onClick={runImport} disabled={busy === 'import'} data-testid="dorm-admin-import">
              <CloudDownload size={16} aria-hidden="true" />{busy === 'import' ? 'กำลังนำเข้า' : 'นำเข้าประกาศภายนอก'}
            </button>
            {imported && (
              <p className="dm-small dm-admin-result" role="status" data-testid="dorm-admin-import-result">
                อัปเดต <b>{imported.upserted ?? 0}</b> ห้อง, ปิด <b>{imported.closed ?? 0}</b> ห้องที่หายจากไฟล์, ข้าม <b>{imported.skipped ?? 0}</b> ห้องที่แอดมินปิดไว้
              </p>
            )}
          </section>

          <section className="dm-admin-card" aria-labelledby="dm-ad-dig">
            <h2 id="dm-ad-dig">ข้อความสรุปสำหรับกลุ่ม OpenChat</h2>
            <p className="dm-small dm-muted">สร้างแล้วคัดลอกไปโพสต์เองสัปดาห์ละครั้ง ควรขออนุญาตแอดมินกลุ่มก่อน</p>
            <div className="dm-actions">
              <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="ช่วงเวลา" style={{ width: 'auto' }}>
                {[3, 7, 14, 30].map((d) => <option key={d} value={d}>ย้อนหลัง {d} วัน</option>)}
              </select>
              <button type="button" className="dm-btn dm-btn-quiet dm-btn-sm" onClick={makeDigest} data-testid="dorm-make-digest">สร้างข้อความ</button>
              {digest && <button type="button" className="dm-btn dm-btn-quiet dm-btn-sm" onClick={() => copyText(digest.text, 'คัดลอกข้อความแล้ว')}>คัดลอก</button>}
            </div>
            {digest && <pre className="dm-digest" data-testid="dorm-digest">{digest.text}</pre>}
          </section>
        </div>
      </div>

      <section className="dm-admin-card dm-admin-listings" aria-labelledby="dm-ad-lst">
        <div className="dm-admin-lhead">
          <h2 id="dm-ad-lst">ประกาศ {o ? <span className="dm-admin-n">{rows.length}</span> : null}</h2>
          <Seg value={view} onChange={setView} label="แสดงประกาศ" options={VIEWS} />
          <label className="dm-search-input dm-admin-q">
            <Search size={16} aria-hidden="true" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นชื่อ ตึก หรือเว็บ" aria-label="ค้นประกาศ" />
          </label>
        </div>
        {!o ? <p className="dm-muted dm-small">กำลังโหลด</p> : !rows.length ? <p className="dm-muted dm-small">ไม่มีประกาศในมุมมองนี้</p> : (
          <div className="dm-admin-table" role="table" aria-label="ประกาศทั้งหมด">
            <div className="dm-admin-tr dm-admin-th" role="row">
              <span role="columnheader">ประกาศ</span><span role="columnheader">ราคา</span><span role="columnheader">สถานะ</span>
              <span role="columnheader">สถิติ</span><span role="columnheader" className="dm-admin-acts-h">จัดการ</span>
            </div>
            {rows.map((x) => {
              const [st, cls] = statusOf(x);
              const pv = priceView(x);
              const closed = x.status === 'closed';
              const working = busy === x.id;
              return (
                <div key={x.id} className="dm-admin-tr" role="row" data-testid="dorm-admin-listing">
                  <span role="cell" className="dm-admin-title">
                    {closed ? <span className="dm-admin-tlink">{x.title}</span> : <Link to={`/dorm/rooms/${x.id}`} className="dm-admin-tlink">{x.title}</Link>}
                    <span className="dm-tiny dm-muted">
                      {x.featured && <span className="dm-admin-feat"><Star size={12} fill="currentColor" strokeWidth={0} aria-hidden="true" />แนะนำ </span>}
                      {x.external ? <>จาก {x.source}{x.source_url && <a href={x.source_url} target="_blank" rel="nofollow noopener noreferrer" className="dm-admin-src" aria-label={`เปิดประกาศต้นทางที่ ${x.source}`}><ExternalLink size={12} aria-hidden="true" /></a>}</> : 'ลงในเว็บ'}
                      {` ลง ${thDate(x.created_at)}`}
                    </span>
                  </span>
                  <span role="cell" className="dm-admin-num">{pv ? <>{baht(pv.head)} <small>{pv.unit}</small></> : ''}</span>
                  <span role="cell"><span className={`dm-status ${cls}`}><i aria-hidden="true" />{st}</span>
                    {!closed && x.expires_at && <span className="dm-tiny dm-muted dm-admin-exp">ถึง {thDate(x.expires_at)}</span>}
                  </span>
                  <span role="cell" className="dm-tiny dm-admin-stats">ดู {x.views || 0} ทัก {x.contact_reveals || 0} รายงาน {x.reports || 0}</span>
                  <span role="cell" className="dm-admin-acts">
                    <button type="button" className="dm-btn dm-btn-quiet dm-btn-sm dm-admin-btn" disabled={working || closed} onClick={() => feature(x)}
                            aria-pressed={!!x.featured} aria-label={`${x.featured ? 'เลิกปักแนะนำ' : 'ปักแนะนำ'} ${x.title}`}>
                      {x.featured ? 'เลิกแนะนำ' : 'ปักแนะนำ'}
                    </button>
                    {closed ? (
                      <button type="button" className="dm-btn dm-btn-quiet dm-btn-sm dm-admin-btn" disabled={working}
                              onClick={() => setStatus(x, 'active', 'เปิดอีกครั้งแล้ว')} aria-label={`เปิดอีกครั้ง ${x.title}`}>เปิดอีกครั้ง</button>
                    ) : (
                      <button type="button" className="dm-btn dm-btn-quiet dm-btn-sm dm-admin-btn" disabled={working} onClick={() => close(x)}
                              aria-label={`${x.external ? 'ไม่ว่างแล้ว' : 'ปิดประกาศ'} ${x.title}`}>{x.external ? 'ไม่ว่างแล้ว' : 'ปิดประกาศ'}</button>
                    )}
                    <button type="button" className="dm-btn dm-btn-quiet dm-btn-sm dm-admin-btn dm-btn-del" disabled={working || (x.external && x.closed_reason === 'deleted')}
                            onClick={() => del(x)} aria-label={`ลบ ${x.title}`}>ลบ</button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </DormLayout>
  );
}
