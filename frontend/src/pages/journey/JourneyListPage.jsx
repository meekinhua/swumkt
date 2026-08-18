import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '@/context/AuthContext';
import '../brand-equity/brand-equity-styles.css';
import './journey-styles.css';
import { BeLoading, StatusPill } from '../brand-equity/be-components';
import { copyToClipboard } from '@/lib/clipboard';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const JourneyListPage = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [studies, setStudies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState(null);
  const authH = { headers: { Authorization: `Bearer ${token}` } };

  const load = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/journey/studies`, authH);
      setStudies(r.data.studies || []);
    } catch (e) { /* an empty list is a valid state */ }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const trash = async (id) => {
    if (!window.confirm('ย้ายการศึกษานี้ไปถังขยะ?')) return;
    await axios.delete(`${API}/journey/studies/${id}`, authH);
    load();
  };

  const copyLink = async (s) => {
    await copyToClipboard(`${window.location.origin}/journey/r/${s.share_token}`);
    setCopiedId(s.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) return <BeLoading text="กำลังโหลดการศึกษา…" />;

  return (
    <div data-testid="journey-list">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
                    gap: 16, flexWrap: 'wrap', marginBottom: 22 }}>
        <div>
          <div className="be-section-num">QUANTITATIVE CJM</div>
          <h2 className="be-h2">เส้นทางลูกค้าเชิงปริมาณ</h2>
          <p className="be-tiny" style={{ color: 'var(--ink-3)', marginTop: 8, maxWidth: 620, lineHeight: 1.6 }}>
            เก็บลำดับขั้นตอนจริงของผู้ตอบผ่านลิงก์ แล้วอ่านผลเป็นตาราง — เส้นทางที่พบบ่อย
            คนที่ผ่านแต่ละขั้น ความยุ่งยากรายขั้น และปัญหาที่ผู้ตอบระบุเอง
          </p>
        </div>
        <button className="be-btn be-btn-primary be-btn-lg" data-testid="journey-new-btn"
                onClick={() => navigate('/market-research/customer-journey/quant/new')}>
          + สร้างการศึกษาใหม่
        </button>
      </div>

      {studies.length === 0 && (
        <div className="jy-locked" data-testid="journey-list-empty">
          ยังไม่มีการศึกษาเชิงปริมาณ — กด “สร้างการศึกษาใหม่” เพื่อเริ่ม
        </div>
      )}

      <div className="be-grid-2">
        {studies.map((s) => (
          <div className="be-card" key={s.id} data-testid={`journey-card-${s.id}`}>
            <div className="be-card-h">
              <div style={{ minWidth: 0 }}>
                <h3 className="be-card-t" style={{ wordBreak: 'break-word' }}>{s.title}</h3>
                <div className="be-card-d">
                  {(s.states || []).length} ขั้นตอน · เป้าหมาย {s.target_responses} คน
                </div>
              </div>
              <StatusPill status={s.status} />
            </div>

            <div className="jy-kv"><span>คำตอบที่เก็บได้</span><b data-testid={`journey-count-${s.id}`}>{s.response_count || 0}</b></div>
            <div className="jy-kv"><span>กรอบผู้ตอบ</span><b style={{ maxWidth: 260, textAlign: 'right', fontWeight: 400 }}>{s.sampling_frame}</b></div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
              <button className="be-btn be-btn-sm" data-testid={`journey-open-${s.id}`}
                      onClick={() => navigate(`/market-research/customer-journey/quant/${s.id}`)}>
                ดูผล
              </button>
              <button className="be-btn be-btn-sm" data-testid={`journey-edit-${s.id}`}
                      onClick={() => navigate(`/market-research/customer-journey/quant/${s.id}/wizard`)}>
                แก้ไข
              </button>
              {s.status !== 'draft' && (
                <button className="be-btn be-btn-sm" data-testid={`journey-copy-${s.id}`}
                        onClick={() => copyLink(s)}>
                  {copiedId === s.id ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}
                </button>
              )}
              <button className="be-btn be-btn-sm be-btn-ghost" data-testid={`journey-trash-${s.id}`}
                      onClick={() => trash(s.id)}>ลบ</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default JourneyListPage;
