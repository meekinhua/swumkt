import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import './brand-equity-styles.css';
import { BeTopbar, Icon, StatusPill, BeLoading, BrandLogo } from './be-components';
import { getBrandHealthTier } from '@/lib/brandHealthVerdict';
import { copyToClipboard } from '@/lib/clipboard';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const LOGO_GRADIENTS = [
  'linear-gradient(140deg,#0E5538 0%,#10B981 60%,#7DDDB1 100%)',
  'linear-gradient(140deg,#1E3A8A,#3B82F6)',
  'linear-gradient(140deg,#7C3AED,#C084FC)',
  'linear-gradient(140deg,#0F766E,#14B8A6)',
  'linear-gradient(140deg,#DC2626,#F87171)',
  'linear-gradient(140deg,#374151,#6B7280)',
];

// One canonical scale — see @/lib/brandHealthVerdict. The private >=70 / >=40
// mapping that used to live here disagreed with the dashboard and the thesis.
const tierColor = (s) => s == null ? '#A6A8AF' : getBrandHealthTier(s).color;

const BrandEquityListPage = () => {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [studies, setStudies] = useState([]);
  const [trash, setTrash] = useState([]);
  const [trashCount, setTrashCount] = useState(0);
  const [view, setView] = useState('active'); // 'active' | 'trash'
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('all'); // admin-only: 'all' | 'mine' | <email>
  const [scores, setScores] = useState({}); // study_id -> {overall, awareness, ...}
  const [confirmAction, setConfirmAction] = useState(null);

  const authH = { headers: { Authorization: `Bearer ${token}` } };

  const refreshAll = () => {
    loadStudies();
    loadTrashCount();
    loadScores();
  };

  useEffect(() => { refreshAll(); /* eslint-disable-next-line */ }, []);
  useEffect(() => {
    if (view === 'trash') loadTrash();
    /* eslint-disable-next-line */
  }, [view]);

  const loadStudies = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/brand-equity/studies`, authH);
      setStudies(r.data.studies || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  // Scores are fetched separately so the cards paint immediately; the study list
  // endpoint carries no aggregates.
  const loadScores = async () => {
    try {
      const r = await axios.get(`${API}/brand-equity/studies/scores`, authH);
      setScores(r.data.scores || {});
    } catch (e) { /* cards fall back to the "open to see" hint */ }
  };

  const loadTrashCount = async () => {
    try {
      const r = await axios.get(`${API}/brand-equity/studies/trash`, authH);
      setTrashCount(r.data.total || 0);
    } catch (e) { /* ignore — count is cosmetic */ }
  };

  const loadTrash = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/brand-equity/studies/trash`, authH);
      setTrash(r.data.studies || []);
      setTrashCount(r.data.total || 0);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const [cleaningDecoys, setCleaningDecoys] = useState(false);
  const cleanupBrandXDecoys = async () => {
    if (!window.confirm(
      'ล้าง "Brand X / Y / Z" ออกจากคำถาม Aided Recognition ทุก study?\n\n' +
      '• ปลอดภัย — แตะเฉพาะตัวเลือกที่เป็นชื่อปลอม Brand X/Y/Z\n' +
      '• ไม่กระทบแบรนด์จริง / responses / question id\n' +
      '• สามารถรันซ้ำได้ (idempotent)'
    )) return;
    setCleaningDecoys(true);
    try {
      const r = await axios.post(`${API}/brand-equity/admin/cleanup-decoys`, {}, authH);
      const n = r.data?.fixed_count ?? 0;
      window.alert(
        n > 0
          ? `เสร็จสิ้น — ล้าง Brand X/Y/Z ออกจาก ${n} studies เรียบร้อย`
          : 'ไม่พบ Brand X/Y/Z ในระบบแล้ว — DB สะอาดอยู่ครับ'
      );
      // Reload to reflect any changes
      loadStudies();
    } catch (e) {
      console.error(e);
      window.alert('ล้างไม่สำเร็จ: ' + (e.response?.data?.detail || e.message));
    } finally {
      setCleaningDecoys(false);
    }
  };

  const isAdmin = user?.role === 'admin';
  const myEmail = (user?.email || '').toLowerCase();

  // Patch a study (status change, etc.)
  const updateStatus = async (id, status) => {
    try {
      await axios.put(`${API}/brand-equity/studies/${id}`, { status }, authH);
      setStudies(prev => prev.map(s => s.id === id ? { ...s, status } : s));
      toast.success('เปลี่ยนสถานะเป็น ' + status.toUpperCase());
    } catch (e) {
      console.error(e);
      toast.error('เปลี่ยนสถานะไม่สำเร็จ — ' + (e.response?.data?.detail || 'ลองใหม่อีกครั้ง'));
    }
  };

  // Soft-delete (move to Trash) — recoverable for 30 days
  const deleteStudy = (id, name) => {
    setConfirmAction({
      kind: 'trash',
      id,
      title: `ย้าย "${name}" ไปถังขยะ?`,
      body: 'Study และคำตอบทั้งหมดจะถูกย้ายไปที่ถังขยะ สามารถกู้คืนได้ภายใน 30 วัน',
      confirmLabel: 'ย้ายไปถังขยะ',
    });
  };

  // Restore from Trash
  const restoreStudy = async (id) => {
    try {
      await axios.post(`${API}/brand-equity/studies/${id}/restore`, {}, authH);
      setTrash(prev => prev.filter(s => s.id !== id));
      setTrashCount(c => Math.max(0, c - 1));
      toast.success('กู้คืน study กลับมาเรียบร้อย');
      loadStudies();
      loadScores();
    } catch (e) {
      console.error(e);
      toast.error('กู้คืนไม่สำเร็จ — ' + (e.response?.data?.detail || 'ลองใหม่อีกครั้ง'));
    }
  };

  // Purge permanently (Trash only)
  const purgeStudy = (id, name) => {
    setConfirmAction({
      kind: 'purge',
      id,
      title: `ลบ "${name}" ถาวร?`,
      body: 'คำตอบทั้งหมดและผลการวิเคราะห์ AI จะถูกลบถาวรและไม่สามารถกู้คืนได้',
      confirmLabel: 'ยืนยันลบถาวร',
    });
  };

  const runConfirmedAction = async () => {
    if (!confirmAction) return;
    const { kind, id } = confirmAction;
    setConfirmAction(null);
    if (kind === 'trash') {
      try {
        await axios.delete(`${API}/brand-equity/studies/${id}`, authH);
        setStudies(prev => prev.filter(s => s.id !== id));
        setTrashCount(c => c + 1);
        toast.success('ย้ายไปถังขยะแล้ว (กู้คืนได้ภายใน 30 วัน)');
      } catch (e) {
        toast.error('ย้ายไปถังขยะไม่สำเร็จ — ' + (e.response?.data?.detail || 'ลองใหม่อีกครั้ง'));
      }
    } else if (kind === 'purge') {
      try {
        await axios.delete(`${API}/brand-equity/studies/${id}/purge`, authH);
        setTrash(prev => prev.filter(s => s.id !== id));
        setTrashCount(c => Math.max(0, c - 1));
        toast.success('ลบถาวรเรียบร้อย');
      } catch (e) {
        toast.error('ลบถาวรไม่สำเร็จ — ' + (e.response?.data?.detail || 'ลองใหม่อีกครั้ง'));
      }
    }
  };

  // Days since deletion (for Trash view labels)
  const daysSinceDelete = (iso) => {
    if (!iso) return 0;
    const ms = Date.now() - new Date(iso).getTime();
    return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
  };

  // Owner-filtered base list (admin only); used for both status counts AND the visible grid
  const ownerScoped = !isAdmin
    ? studies
    : ownerFilter === 'all'  ? studies
    : ownerFilter === 'mine' ? studies.filter(s => (s.owner_email || '').toLowerCase() === myEmail)
    : studies.filter(s => (s.owner_email || '').toLowerCase() === ownerFilter);

  // Build owner chip list (admin only) — unique emails sorted, with counts
  const ownerChips = (() => {
    if (!isAdmin) return [];
    const counts = {};
    studies.forEach(s => {
      const em = (s.owner_email || '').toLowerCase();
      if (!em) return;
      counts[em] = (counts[em] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  })();

  const normalizedStatus = (st) => (st === 'active' ? 'collecting' : st);

  const counts = {
    all: ownerScoped.length,
    draft: ownerScoped.filter(s => normalizedStatus(s.status) === 'draft').length,
    collecting: ownerScoped.filter(s => normalizedStatus(s.status) === 'collecting').length,
    analyzing: ownerScoped.filter(s => normalizedStatus(s.status) === 'analyzing').length,
    completed: ownerScoped.filter(s => normalizedStatus(s.status) === 'completed').length,
    closed: ownerScoped.filter(s => normalizedStatus(s.status) === 'closed').length,
  };
  const qLower = searchQuery.trim().toLowerCase();
  const filtered = ownerScoped.filter(s => {
    if (filter !== 'all' && normalizedStatus(s.status) !== filter) return false;
    if (qLower) {
      const hay = `${s.brand?.name || ''} ${s.brand?.category || ''} ${(s.brand?.competitors || []).join(' ')}`.toLowerCase();
      if (!hay.includes(qLower)) return false;
    }
    return true;
  });

  return (
    <div className="be-root" data-testid="be-list-page">
      <BeTopbar user={user} onLogo={() => navigate('/dashboard')}/>
      <div className="be-page">
        <div className="be-list-hero">
          <div>
            <div className="be-eyebrow" style={{ marginBottom: 10 }}>
              <span className="be-dot-sm" style={{ background: '#C8102E' }}/>
              MODULE · BRAND HEALTH CHECK
            </div>
            <h1 className="be-h1">Brand Equity Studies</h1>
            <div className="be-muted be-small" style={{ marginTop: 8, maxWidth: 580 }}>
              Aaker's 4-dimension framework — automated question generation, statistical engine,
              AI-powered theme extraction & identity-image alignment.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="be-btn" onClick={refreshAll} data-testid="be-list-refresh">
              <Icon name="refresh" size={12}/>Refresh
            </button>
            <button className="be-btn be-btn-red" onClick={() => navigate('/brand-equity/new')}
                    data-testid="be-list-create-btn">
              <Icon name="plus" size={12}/>สร้าง study ใหม่
            </button>
          </div>
        </div>

        <div className="be-list-controls">
          <div className="be-list-filters" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
            {/* View toggle: Active vs Trash */}
            <span className={'be-chip ' + (view === 'active' ? 'solid' : '')}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setView('active')}
                  data-testid="be-view-active">
              ACTIVE · {studies.length}
            </span>
            <span className={'be-chip ' + (view === 'trash' ? 'solid' : '')}
                  style={{ cursor: 'pointer',
                           borderColor: view === 'trash' ? 'var(--be-red)' : undefined,
                           background: view === 'trash' ? 'var(--be-red)' : undefined,
                           color: view === 'trash' ? '#fff' : undefined }}
                  onClick={() => setView('trash')}
                  data-testid="be-view-trash">
              TRASH · {trashCount}
            </span>
            {/* Status filters only apply to Active view */}
            {view === 'active' && (
              <>
                <span className="be-mono be-tiny be-muted"
                      style={{ marginLeft: 12, letterSpacing: '0.10em' }}>
                  STATUS ·
                </span>
                {[
                  ['all',        `ALL · ${counts.all}`],
                  ['draft',      `DRAFT · ${counts.draft}`],
                  ['collecting', `COLLECTING · ${counts.collecting}`],
                  ['analyzing',  `ANALYZING · ${counts.analyzing}`],
                  ['completed',  `COMPLETED · ${counts.completed}`],
                  ['closed',     `CLOSED · ${counts.closed}`],
                ].map(([k, label]) => (
                  <span key={k}
                        className={'be-chip ' + (filter === k ? 'solid' : '')}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setFilter(k)}
                        data-testid={`be-list-filter-${k}`}>
                    {label}
                  </span>
                ))}
                <input
                  className="be-input"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="ค้นหาชื่อแบรนด์ / หมวด…"
                  data-testid="be-list-search"
                  style={{ marginLeft: 'auto', minWidth: 190, maxWidth: 260, padding: '6px 10px', fontSize: 12 }}
                />
              </>
            )}
          </div>
        </div>

        {isAdmin && ownerChips.length > 0 && (
          <div className="be-list-controls" style={{ marginTop: -10 }}
               data-testid="be-list-owner-filters">
            <div className="be-list-filters" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="be-mono be-tiny be-muted"
                    style={{ marginRight: 8, letterSpacing: '0.10em' }}>
                OWNER ·
              </span>
              {[
                ['all',  `ทั้งหมด · ${studies.length}`],
                ['mine', `ของฉัน · ${studies.filter(s => (s.owner_email || '').toLowerCase() === myEmail).length}`],
              ].map(([k, label]) => (
                <span key={k}
                      className={'be-chip ' + (ownerFilter === k ? 'solid' : '')}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setOwnerFilter(k)}
                      data-testid={`be-list-owner-${k}`}>
                  {label}
                </span>
              ))}
              {ownerChips
                .filter(([em]) => em !== myEmail)
                .map(([em, n]) => {
                  const handle = '@' + ((em.split('@')[0] || em).slice(0, 14));
                  return (
                    <span key={em}
                          className={'be-chip ' + (ownerFilter === em ? 'solid' : '')}
                          style={{ cursor: 'pointer' }}
                          onClick={() => setOwnerFilter(em)}
                          title={em}
                          data-testid={`be-list-owner-${em}`}>
                      {handle} · {n}
                    </span>
                  );
                })}
            </div>
          </div>
        )}

        {isAdmin && (
          <div className="be-list-controls" style={{ marginTop: -10 }}>
            <div className="be-list-filters" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="be-mono be-tiny be-muted"
                    style={{ marginRight: 8, letterSpacing: '0.10em' }}>
                ADMIN TOOLS ·
              </span>
              <button
                className="be-btn be-btn-ghost be-btn-sm"
                onClick={cleanupBrandXDecoys}
                disabled={cleaningDecoys}
                style={{ borderColor: '#D4A017', color: cleaningDecoys ? '#999' : '#8a6d10' }}
                title="ล้าง 'Brand X / Y / Z' ออกจากคำถาม Aided Recognition ของ studies เก่า"
                data-testid="be-admin-cleanup-decoys-btn">
                {cleaningDecoys ? 'กำลังล้าง…' : '🧹 ล้าง Brand X/Y/Z (studies เก่า)'}
              </button>
            </div>
          </div>
        )}

        {loading ? <BeLoading text={view === 'trash' ? 'Loading trash…' : 'Loading studies…'}/> :
         view === 'trash' ? (
          // ========= TRASH VIEW =========
          trash.length === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', border: '1px dashed var(--rule)' }}
                 data-testid="be-trash-empty">
              <div className="be-eyebrow" style={{ marginBottom: 12 }}>TRASH IS EMPTY</div>
              <div className="be-muted be-small">
                ไม่มี study ในถังขยะ · studies ที่ถูกลบจะอยู่ที่นี่ 30 วัน ก่อนถูกลบถาวรอัตโนมัติ
              </div>
            </div>
          ) : (
            <div className="be-list-grid" data-testid="be-trash-grid">
              {trash.map((s, i) => {
                const days = daysSinceDelete(s.deleted_at);
                const daysLeft = Math.max(0, 30 - days);
                return (
                  <div key={s.id}
                       className="be-study-card"
                       style={{ opacity: 0.85, borderColor: 'var(--rule-strong)',
                                background: 'repeating-linear-gradient(45deg, var(--paper-2), var(--paper-2) 6px, var(--paper) 6px, var(--paper) 12px)' }}
                       data-testid={`be-trash-card-${s.id}`}>
                    <div className="be-study-top">
                      <div className="be-study-brand">
                        <div className="be-study-logo-wrap" style={{ filter: 'grayscale(0.7)' }}>
                          <BrandLogo brand={s.brand} identity={s.identity}
                                     size={48}
                                     gradient={LOGO_GRADIENTS[i % LOGO_GRADIENTS.length]}
                                     testid={`be-trash-logo-${s.id}`}/>
                        </div>
                        <div>
                          <div className="be-study-name" style={{ textDecoration: 'line-through', color: 'var(--ink-3)' }}>
                            {s.brand?.name || '—'}
                          </div>
                          <div className="be-study-cat">{s.brand?.category || 'general'}</div>
                        </div>
                      </div>
                      <div className="be-mono be-tiny"
                           style={{ padding: '4px 8px', border: '1px solid var(--be-red)',
                                    color: 'var(--be-red)', textTransform: 'uppercase',
                                    letterSpacing: '0.10em' }}>
                        Trash
                      </div>
                    </div>

                    <div className="be-mono be-tiny be-muted" style={{ padding: '10px 0', letterSpacing: '0.06em' }}>
                      ลบเมื่อ <strong style={{ color: 'var(--ink-2)' }}>{days} วันที่แล้ว</strong>
                      {' · '}
                      <span style={{ color: daysLeft <= 7 ? 'var(--be-red)' : 'var(--ink-3)' }}>
                        เหลือ {daysLeft} วัน ก่อนลบถาวร
                      </span>
                    </div>

                    <div className="be-study-foot">
                      <span>
                        n = {s.response_count || 0} · {s.questions?.length || 0} questions
                        {user?.role === 'admin' && s.owner_email && (
                          <span className="be-mono be-tiny"
                                style={{ marginLeft: 10, padding: '1px 6px',
                                         border: '1px solid var(--rule-strong)',
                                         textTransform: 'lowercase', letterSpacing: '0.04em',
                                         color: 'var(--ink-2)' }}>
                            @{(s.owner_email.split('@')[0] || s.owner_email).slice(0, 14)}
                          </span>
                        )}
                      </span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => restoreStudy(s.id)}
                                className="be-mono be-tiny"
                                data-testid={`be-trash-restore-${s.id}`}
                                title="กู้คืนกลับมาในรายการ Active"
                                style={{ background: 'var(--ink)', color: 'var(--paper)',
                                         border: '1px solid var(--ink)',
                                         padding: '4px 10px', cursor: 'pointer',
                                         textTransform: 'uppercase', letterSpacing: '0.10em',
                                         fontSize: 10 }}>
                          ↺ Restore
                        </button>
                        <button onClick={() => purgeStudy(s.id, s.brand?.name || 'study')}
                                className="be-mono be-tiny"
                                data-testid={`be-trash-purge-${s.id}`}
                                title="ลบถาวร — กู้คืนไม่ได้"
                                style={{ background: 'transparent', border: '1px solid var(--be-red)',
                                         padding: '4px 10px', cursor: 'pointer',
                                         textTransform: 'uppercase', letterSpacing: '0.10em',
                                         fontSize: 10, color: 'var(--be-red)' }}>
                          ✕ Purge
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
         ) :
         filtered.length === 0 ? (
          ownerScoped.length > 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', border: '1px dashed var(--rule)' }}
                 data-testid="be-list-filter-empty">
              <div className="be-eyebrow" style={{ marginBottom: 12 }}>NO MATCHING STUDIES</div>
              <div className="be-h3" style={{ marginBottom: 10 }}>ไม่พบ study ในตัวกรองที่เลือก</div>
              <div className="be-muted be-small" style={{ marginBottom: 18 }}>
                ลองล้างตัวกรองสถานะหรือคำค้นหาเพื่อดู study ทั้งหมดของคุณ
              </div>
              <button className="be-btn" onClick={() => { setFilter('all'); setSearchQuery(''); setOwnerFilter('all'); }}
                      data-testid="be-list-clear-filters">
                ล้างตัวกรองทั้งหมด
              </button>
            </div>
          ) : (
            <div style={{ padding: '80px 20px', textAlign: 'center', border: '1px dashed var(--rule)' }}
                 data-testid="be-list-empty">
              <div className="be-eyebrow" style={{ marginBottom: 14 }}>NO STUDIES YET</div>
              <div className="be-h3" style={{ marginBottom: 10 }}>เริ่มต้น Brand Health Check แรกของคุณ</div>
              <div className="be-muted be-small" style={{ marginBottom: 22 }}>
                สร้าง study ใหม่ ระบบจะสร้างแบบสอบถาม Aaker 4-dimension ให้อัตโนมัติ
              </div>
              <button className="be-btn be-btn-red" onClick={() => navigate('/brand-equity/new')}
                      data-testid="be-list-empty-create">
                <Icon name="plus" size={12}/>สร้าง study ใหม่
              </button>
            </div>
          )
         ) : (
          <div className="be-list-grid" data-testid="be-list-grid">
            {filtered.map((s, i) => {
              const sc = scores[s.id] || {};
              const effStatus = normalizedStatus(s.status);
              const dims = [
                ['AW', 'Awareness · การจดจำ', '#1B75BC', sc.awareness ?? s.aggregate?.composite?.awareness ?? null],
                ['PQ', 'Perceived Quality · คุณภาพ', '#D4A017', sc.quality ?? s.aggregate?.composite?.quality ?? null],
                ['BI', 'Identity · อัตลักษณ์', '#C8102E', sc.identity ?? s.aggregate?.composite?.identity ?? null],
                ['LY', 'Loyalty · ความภูกพัน', '#10B981', sc.loyalty ?? s.aggregate?.composite?.loyalty ?? null],
              ];
              const score = sc.overall ?? s.aggregate?.composite?.overall ?? null;
              const targetN = s.target_responses || 100;
              const n = s.response_count || 0;
              return (
                <div key={s.id}
                     className="be-study-card"
                     onClick={() => navigate(`/brand-equity/studies/${s.id}`)}
                     data-testid={`be-study-card-${s.id}`}>
                  <div className="be-study-top">
                    <div className="be-study-brand">
                      <div className="be-study-logo-wrap">
                        <BrandLogo brand={s.brand} identity={s.identity}
                                   size={48}
                                   gradient={LOGO_GRADIENTS[i % LOGO_GRADIENTS.length]}
                                   testid={`be-study-logo-${s.id}`}/>
                      </div>
                      <div>
                        <div className="be-study-name">
                          {s.brand?.name || '—'}
                          {s.is_simulated && (
                            <span className="be-mono be-tiny" style={{
                              marginLeft: 8, padding: '1px 5px', fontSize: 9,
                              border: '1px solid var(--be-gold)', color: '#8A6300',
                            }}>
                              DEMO
                            </span>
                          )}
                        </div>
                        <div className="be-study-cat">{s.brand?.category || 'general'}</div>
                      </div>
                    </div>
                    <StatusPill status={effStatus}/>
                  </div>

                  <div>
                    <div className="be-study-progress">
                      <span><strong>{n}</strong> / {targetN} คน</span>
                      <span>{Math.round(n / targetN * 100)}%</span>
                    </div>
                    <div className="be-study-progress-bar">
                      <div className="fill" style={{ width: Math.min(100, n / targetN * 100) + '%' }}/>
                    </div>
                  </div>

                  <div className="be-study-mini">
                    {dims.map(([label, fullLabel, color, v], j) => (
                      <div key={j} className="col" title={fullLabel}>
                        <div className="lbl" style={{ color: v != null ? color : 'var(--ink-4)' }}>{label}</div>
                        <div className="num">{v != null ? Math.round(v) : '—'}</div>
                        <div className="bar"><div className="bar-fill" style={{ width: (v || 0) + '%', background: color }}/></div>
                      </div>
                    ))}
                  </div>

                  <div className="be-study-foot">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}
                          onClick={(e) => e.stopPropagation()}>
                      {s.share_token && (effStatus === 'collecting' || effStatus === 'analyzing') ? (
                        <button type="button"
                                className="be-mono be-tiny"
                                data-testid={`be-study-copy-link-${s.id}`}
                                title="คัดลอกลิงก์แบบสอบถาม"
                                onClick={() => copyToClipboard(`${window.location.origin}/brand-equity/respond/${s.share_token}`, { successMessage: 'คัดลอกลิงก์แบบสอบถามแล้ว' })}
                                style={{ background: 'transparent', border: '1px solid var(--rule-strong)',
                                         padding: '2px 7px', cursor: 'pointer', fontSize: 10, color: 'var(--ink-2)' }}>
                          Copy survey link
                        </button>
                      ) : (
                        <span className="be-tiny be-muted">{s.share_token ? `/${s.share_token.slice(0, 6)}` : '—'}</span>
                      )}
                      {user?.role === 'admin' && s.owner_email && (
                        <span className="be-mono be-tiny"
                              data-testid={`be-study-owner-${s.id}`}
                              style={{ padding: '1px 6px',
                                       border: '1px solid var(--rule-strong)',
                                       textTransform: 'lowercase', letterSpacing: '0.04em',
                                       color: 'var(--ink-2)' }}>
                          @{(s.owner_email.split('@')[0] || s.owner_email).slice(0, 14)}
                        </span>
                      )}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
                         onClick={(e) => e.stopPropagation()}>
                      <select
                        value={effStatus}
                        onChange={(e) => updateStatus(s.id, e.target.value)}
                        data-testid={`be-study-status-${s.id}`}
                        title="เปลี่ยนสถานะ"
                        style={{
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: 9.5, letterSpacing: '0.10em', textTransform: 'uppercase',
                          padding: '2px 6px', border: '1px solid var(--rule-strong)',
                          background: 'var(--surface)', color: 'var(--ink-2)',
                          cursor: 'pointer', borderRadius: 0,
                        }}
                      >
                        <option value="draft">DRAFT</option>
                        <option value="collecting">COLLECTING</option>
                        <option value="analyzing">ANALYZING</option>
                        <option value="completed">COMPLETED</option>
                        <option value="closed">CLOSED</option>
                      </select>
                      <button onClick={() => navigate(`/brand-equity/studies/${s.id}/edit`)}
                              className="be-mono be-tiny"
                              data-testid={`be-study-edit-${s.id}`}
                              style={{ background: 'transparent', border: '1px solid var(--rule-strong)',
                                       padding: '2px 8px', cursor: 'pointer', textTransform: 'uppercase',
                                       letterSpacing: '0.10em', fontSize: 9.5, color: 'var(--ink-2)' }}>
                        Edit
                      </button>
                      <button onClick={() => deleteStudy(s.id, s.brand?.name || 'study')}
                              className="be-mono be-tiny"
                              data-testid={`be-study-delete-${s.id}`}
                              title="ย้ายไปถังขยะ (กู้คืนได้ใน 30 วัน)"
                              style={{ background: 'transparent', border: '1px solid var(--be-red)',
                                       padding: '2px 8px', cursor: 'pointer', textTransform: 'uppercase',
                                       letterSpacing: '0.10em', fontSize: 9.5, color: 'var(--be-red)' }}>
                        Delete
                      </button>
                      {score !== null && score !== undefined ? (
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                          <span className="big" style={{ color: tierColor(score) }}>{Math.round(score)}</span>
                          <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>BES</span>
                          <span data-testid={`be-study-tier-${s.id}`}
                                style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.10em',
                                         color: tierColor(score), border: `1px solid ${tierColor(score)}`,
                                         padding: '1px 6px' }}>
                            {getBrandHealthTier(score).label}
                          </span>
                        </div>
                      ) : (
                        <span style={{ fontSize: 10, color: 'var(--ink-3)' }}
                              data-testid={`be-study-bes-hint-${s.id}`}>
                          {n >= 10 ? 'กำลังคำนวณ…' : `รออีก ${Math.max(0, 10 - n)} คำตอบเพื่อดูคะแนน`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
         )}
      </div>

      {confirmAction && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,0.45)', zIndex: 1000,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="be-card" style={{ maxWidth: 440, width: '100%' }}>
            <div className="be-eyebrow" style={{ color: 'var(--be-red)', marginBottom: 8 }}>CONFIRM</div>
            <div className="be-h3" style={{ marginBottom: 8 }}>{confirmAction.title}</div>
            <div className="be-small be-muted" style={{ lineHeight: 1.6, marginBottom: 16 }}>
              {confirmAction.body}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="be-btn be-btn-ghost" onClick={() => setConfirmAction(null)}>ยกเลิก</button>
              <button className="be-btn be-btn-red" onClick={runConfirmedAction}>{confirmAction.confirmLabel}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BrandEquityListPage;
