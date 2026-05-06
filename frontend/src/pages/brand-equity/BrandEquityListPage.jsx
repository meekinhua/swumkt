import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '@/context/AuthContext';
import './brand-equity-styles.css';
import { BeTopbar, Icon, StatusPill, BeLoading, BrandLogo } from './be-components';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const LOGO_GRADIENTS = [
  'linear-gradient(140deg,#0E5538 0%,#10B981 60%,#7DDDB1 100%)',
  'linear-gradient(140deg,#1E3A8A,#3B82F6)',
  'linear-gradient(140deg,#7C3AED,#C084FC)',
  'linear-gradient(140deg,#0F766E,#14B8A6)',
  'linear-gradient(140deg,#DC2626,#F87171)',
  'linear-gradient(140deg,#374151,#6B7280)',
];

const tierColor = (s) => s == null ? '#A6A8AF' : s >= 70 ? '#10B981' : s >= 40 ? '#D4A017' : '#C8102E';

const BrandEquityListPage = () => {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [studies, setStudies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const authH = { headers: { Authorization: `Bearer ${token}` } };

  useEffect(() => { loadStudies(); /* eslint-disable-next-line */ }, []);

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

  const counts = {
    all: studies.length,
    draft: studies.filter(s => s.status === 'draft').length,
    collecting: studies.filter(s => s.status === 'collecting').length,
    analyzing: studies.filter(s => s.status === 'analyzing').length,
    completed: studies.filter(s => s.status === 'completed').length,
  };
  const filtered = filter === 'all' ? studies : studies.filter(s => s.status === filter);

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
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="be-btn" onClick={loadStudies} data-testid="be-list-refresh">
              <Icon name="refresh" size={12}/>Refresh
            </button>
            <button className="be-btn be-btn-red" onClick={() => navigate('/brand-equity/new')}
                    data-testid="be-list-create-btn">
              <Icon name="plus" size={12}/>สร้าง study ใหม่
            </button>
          </div>
        </div>

        <div className="be-list-controls">
          <div className="be-list-filters">
            {[
              ['all',        `ALL · ${counts.all}`],
              ['draft',      `DRAFT · ${counts.draft}`],
              ['collecting', `COLLECTING · ${counts.collecting}`],
              ['analyzing',  `ANALYZING · ${counts.analyzing}`],
              ['completed',  `COMPLETED · ${counts.completed}`],
            ].map(([k, label]) => (
              <span key={k}
                    className={'be-chip ' + (filter === k ? 'solid' : '')}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setFilter(k)}
                    data-testid={`be-list-filter-${k}`}>
                {label}
              </span>
            ))}
          </div>
        </div>

        {loading ? <BeLoading text="Loading studies…"/> :
         filtered.length === 0 ? (
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
         ) : (
          <div className="be-list-grid" data-testid="be-list-grid">
            {filtered.map((s, i) => {
              const dims = [
                ['AW', '#1B75BC', s.aggregate?.composite?.awareness ?? 0],
                ['PQ', '#D4A017', s.aggregate?.composite?.quality ?? 0],
                ['BI', '#C8102E', s.aggregate?.composite?.identity ?? 0],
                ['LY', '#10B981', s.aggregate?.composite?.loyalty ?? 0],
              ];
              const score = s.aggregate?.composite?.overall ?? null;
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
                        <div className="be-study-name">{s.brand?.name || '—'}</div>
                        <div className="be-study-cat">{s.brand?.category || 'general'}</div>
                      </div>
                    </div>
                    <StatusPill status={s.status}/>
                  </div>

                  <div>
                    <div className="be-study-progress">
                      <span><strong>{n}</strong> / {targetN}</span>
                      <span>{Math.round(n / targetN * 100)}%</span>
                    </div>
                    <div className="be-study-progress-bar">
                      <div className="fill" style={{ width: Math.min(100, n / targetN * 100) + '%' }}/>
                    </div>
                  </div>

                  <div className="be-study-mini">
                    {dims.map(([label, color, v], j) => (
                      <div key={j} className="col">
                        <div className="lbl" style={{ color: v > 0 ? color : 'var(--ink-4)' }}>{label}</div>
                        <div className="num">{v > 0 ? Math.round(v) : '—'}</div>
                        <div className="bar"><div className="bar-fill" style={{ width: v + '%', background: color }}/></div>
                      </div>
                    ))}
                  </div>

                  <div className="be-study-foot">
                    <span>
                      {s.share_token ? `/${s.share_token.slice(0, 6)}` : '—'}
                      {user?.role === 'admin' && s.owner_email && (
                        <span className="be-mono be-tiny"
                              data-testid={`be-study-owner-${s.id}`}
                              style={{ marginLeft: 10, padding: '1px 6px',
                                       border: '1px solid var(--rule-strong)',
                                       textTransform: 'lowercase', letterSpacing: '0.04em',
                                       color: 'var(--ink-2)' }}>
                          @{(s.owner_email.split('@')[0] || s.owner_email).slice(0, 14)}
                        </span>
                      )}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button onClick={(e) => { e.stopPropagation(); navigate(`/brand-equity/studies/${s.id}/edit`); }}
                              className="be-mono be-tiny"
                              data-testid={`be-study-edit-${s.id}`}
                              style={{ background: 'transparent', border: '1px solid var(--rule-strong)',
                                       padding: '2px 8px', cursor: 'pointer', textTransform: 'uppercase',
                                       letterSpacing: '0.10em', fontSize: 9.5, color: 'var(--ink-2)' }}>
                        Edit
                      </button>
                      {score ? (
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                          <span className="big" style={{ color: tierColor(score) }}>{Math.round(score)}</span>
                          <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>BES</span>
                        </div>
                      ) : (
                        <span>BES locked · {Math.max(0, 10 - n)} more</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
         )}
      </div>
    </div>
  );
};

export default BrandEquityListPage;
