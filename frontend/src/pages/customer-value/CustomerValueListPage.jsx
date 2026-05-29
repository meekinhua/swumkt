import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { BeTopbar } from '@/pages/brand-equity/be-components';
import { API } from '@/App';
import { INDUSTRIES, industryRange, scoreBrand } from './cv-lib';
import './customer-value.css';

export default function CustomerValueListPage() {
  const { token } = useAuth();
  const nav = useNavigate();
  const [studies, setStudies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', industry: 'food', description: '' });
  const [showForm, setShowForm] = useState(false);

  const auth = { headers: { Authorization: `Bearer ${token}` } };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/cv/studies`, auth);
      setStudies(r.data.studies || []);
    } catch (e) {
      toast.error('โหลดรายการไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.title.trim()) { toast.error('กรุณาใส่ชื่อการศึกษา'); return; }
    setCreating(true);
    try {
      const r = await axios.post(`${API}/cv/studies`, form, auth);
      toast.success('สร้างแล้ว');
      nav(`/market-research/customer-value/${r.data.id}`);
    } catch (e) {
      toast.error('สร้างไม่สำเร็จ');
    } finally {
      setCreating(false);
    }
  };

  const remove = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm('ย้ายไปถังขยะ?')) return;
    try {
      await axios.delete(`${API}/cv/studies/${id}`, auth);
      toast.success('ย้ายไปถังขยะแล้ว');
      load();
    } catch { toast.error('ลบไม่สำเร็จ'); }
  };

  return (
    <div className="cv-page" data-testid="cv-list-page">
      <BeTopbar active="tools" subtitle="CUSTOMER VALUE LAB" />
      <div className="cv-wrap">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
          <div>
            <div className="cv-eyebrow">CBS04 · Customer Value = Benefit − Price</div>
            <h1 className="cv-h1">Customer Value Lab</h1>
            <p className="cv-lede">
              ออกแบบและเปรียบเทียบ "คุณค่าในมุมมองลูกค้า" ระหว่างแบรนด์เรากับคู่แข่ง พร้อม AI แนะนำว่าควรเพิ่ม Benefit / ลด Cost
              อะไรในแต่ละหมวด และจำลองภาพสินค้า/บริการจริงจาก value proposition ที่ออกแบบ
            </p>
          </div>
          <button className="cv-btn" data-testid="cv-new-btn" onClick={() => setShowForm((s) => !s)}>
            <i className="fa-solid fa-plus" /> สร้างการศึกษาใหม่
          </button>
        </div>

        {showForm && (
          <div className="cv-card pad" style={{ marginBottom: 24 }} data-testid="cv-create-form">
            <div className="cv-eyebrow" style={{ marginBottom: 10 }}>NEW STUDY</div>
            <div style={{ display: 'grid', gap: 12 }}>
              <input className="cv-brand-name" style={{ border: '1.5px solid #14161a', padding: 10, borderRadius: 2 }}
                placeholder="ชื่อการศึกษา เช่น ร้านชานมเรา vs คู่แข่ง" value={form.title}
                data-testid="cv-form-title"
                onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {INDUSTRIES.map((ind) => (
                  <button key={ind.id} className={`cv-chip`} data-testid={`cv-ind-${ind.id}`}
                    onClick={() => setForm({ ...form, industry: ind.id })}
                    style={{ cursor: 'pointer', background: form.industry === ind.id ? '#14161a' : '#fff', color: form.industry === ind.id ? '#fff' : '#14161a' }}>
                    {ind.label}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="cv-btn" disabled={creating} onClick={create} data-testid="cv-create-submit">
                  {creating ? 'กำลังสร้าง…' : 'สร้าง →'}
                </button>
                <button className="cv-btn ghost" onClick={() => setShowForm(false)}>ยกเลิก</button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="cv-empty">กำลังโหลด…</div>
        ) : studies.length === 0 ? (
          <div className="cv-empty" data-testid="cv-empty">
            ยังไม่มีการศึกษา — กด "สร้างการศึกษาใหม่" เพื่อเริ่มวิเคราะห์ Customer Value
          </div>
        ) : (
          <div className="cv-grid" data-testid="cv-studies-grid">
            {studies.map((s) => {
              const rng = industryRange(s.industry);
              const ours = (s.brands || []).find((b) => b.is_ours) || (s.brands || [])[0];
              const sc = ours ? scoreBrand(ours, rng) : { net: 0 };
              const indLabel = (INDUSTRIES.find((i) => i.id === s.industry) || {}).label || s.industry;
              return (
                <div key={s.id} className="cv-card cv-study-card" data-testid={`cv-study-${s.id}`}
                  onClick={() => nav(`/market-research/customer-value/${s.id}`)}>
                  <div className="bar" />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="cv-chip">{indLabel}</span>
                    <button className="cv-x" title="ลบ" data-testid={`cv-del-${s.id}`} onClick={(e) => remove(e, s.id)}>
                      <i className="fa-solid fa-trash" />
                    </button>
                  </div>
                  <h3 style={{ fontFamily: "'IBM Plex Serif', serif", fontSize: 20, margin: '10px 0 4px' }}>{s.title}</h3>
                  <p style={{ color: '#6b7280', fontSize: 13, minHeight: 18 }}>{s.description || '—'}</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 12 }}>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#6b7280' }}>
                      {(s.brands || []).length} แบรนด์ · Net Value (เรา)
                    </span>
                    <span className="cv-net" style={{ fontSize: 24, color: sc.net >= 0 ? '#0e5538' : '#c8102e' }}>
                      {sc.net > 0 ? '+' : ''}{sc.net}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
