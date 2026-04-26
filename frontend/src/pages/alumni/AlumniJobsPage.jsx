import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '@/context/AuthContext';
import AlumniLayout from './AlumniLayout';
import { Avatar, Chip, Icon, Modal, useToast } from './AlumniUI';
import './alumni-styles.css';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const LEVEL_OPTIONS = [
  { id: 'entry', label: 'Entry / Intern' },
  { id: 'mid', label: 'Mid (3-5 ปี)' },
  { id: 'senior', label: 'Senior (5-10 ปี)' },
  { id: 'lead', label: 'Lead / Manager' },
];

const PostJobModal = ({ open, onClose, token, onPosted }) => {
  const [form, setForm] = useState({
    title: '', company: '', location: 'Bangkok / Hybrid',
    description: '', level: 'entry', kind: 'hiring',
    salary_range: '', apply_url: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  if (!open) return null;

  const handleSubmit = async () => {
    if (!form.title || !form.company || !form.description) {
      toast.show('กรุณากรอกข้อมูลให้ครบ');
      return;
    }
    setSubmitting(true);
    try {
      await axios.post(`${API}/alumni/jobs`, form, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.show('ลงประกาศแล้ว +30 XP');
      onPosted();
      onClose();
    } catch (e) {
      toast.show(e.response?.data?.detail || 'ลงประกาศไม่สำเร็จ');
    } finally { setSubmitting(false); }
  };

  return (
    <Modal onClose={onClose}>
      <div data-testid="post-job-modal">
        <h3 className="al-h-card" style={{ fontSize: 22, marginBottom: 4 }}>ลงประกาศงาน</h3>
        <p className="al-small al-muted" style={{ marginBottom: 18 }}>
          แชร์ตำแหน่งให้ตระกูล · เพื่อ refer หรือชวนน้องเข้ามา
        </p>

        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {[
            { id: 'hiring', label: '🟢 กำลังหาคน' },
            { id: 'seeking_referral', label: '🔵 หา referral ให้ตัวเอง' },
          ].map(k => (
            <button key={k.id} onClick={() => setForm(f => ({ ...f, kind: k.id }))}
              data-testid={`postjob-kind-${k.id}`}
              className={`al-btn al-btn-sm ${form.kind === k.id ? 'al-btn-primary' : 'al-btn-outline'}`}>
              {k.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
            placeholder="ตำแหน่ง · เช่น Brand Manager"
            style={{ padding: 12, borderRadius: 10, border: '1px solid var(--al-line-2)', background: 'var(--al-paper)' }}
            data-testid="postjob-title"
          />
          <input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })}
            placeholder="บริษัท · เช่น Unilever"
            style={{ padding: 12, borderRadius: 10, border: '1px solid var(--al-line-2)', background: 'var(--al-paper)' }}
            data-testid="postjob-company"
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <select value={form.level} onChange={e => setForm({ ...form, level: e.target.value })}
              style={{ padding: 12, borderRadius: 10, border: '1px solid var(--al-line-2)', background: 'var(--al-paper)' }}
              data-testid="postjob-level"
            >
              {LEVEL_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })}
              placeholder="ที่ตั้ง"
              style={{ padding: 12, borderRadius: 10, border: '1px solid var(--al-line-2)', background: 'var(--al-paper)' }}
              data-testid="postjob-location"
            />
          </div>
          <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
            placeholder="รายละเอียด · ลักษณะงาน · คุณสมบัติ" rows={4}
            style={{ padding: 12, borderRadius: 10, border: '1px solid var(--al-line-2)', background: 'var(--al-paper)', resize: 'vertical' }}
            data-testid="postjob-description"
          />
          <input value={form.salary_range} onChange={e => setForm({ ...form, salary_range: e.target.value })}
            placeholder="ช่วงเงินเดือน (optional) · เช่น 25-35K"
            style={{ padding: 12, borderRadius: 10, border: '1px solid var(--al-line-2)', background: 'var(--al-paper)' }}
            data-testid="postjob-salary"
          />
          <input value={form.apply_url} onChange={e => setForm({ ...form, apply_url: e.target.value })}
            placeholder="ลิงก์สมัคร (optional)"
            style={{ padding: 12, borderRadius: 10, border: '1px solid var(--al-line-2)', background: 'var(--al-paper)' }}
            data-testid="postjob-url"
          />
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button className="al-btn al-btn-outline al-btn-block" onClick={onClose}>ยกเลิก</button>
          <button className="al-btn al-btn-red al-btn-block" onClick={handleSubmit}
            disabled={submitting} data-testid="postjob-submit">
            {submitting ? 'กำลังลง...' : 'ลงประกาศ +30 XP'}
          </button>
        </div>
        {toast.node}
      </div>
    </Modal>
  );
};

const JobCard = ({ job, currentUserId, onInterest, onDelete }) => {
  const interested = job.interested_users?.includes(currentUserId);
  const isOwner = job.posted_by === currentUserId;
  return (
    <div className="al-card al-card-pad" data-testid={`job-card-${job.id}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
            <Chip tone={job.kind === 'hiring' ? 'red' : 'blue'}>
              {job.kind === 'hiring' ? '🟢 กำลังหาคน' : '🔵 หา referral'}
            </Chip>
            {job.level && <Chip tone="default">{LEVEL_OPTIONS.find(o => o.id === job.level)?.label || job.level}</Chip>}
          </div>
          <h3 style={{ fontSize: 18, margin: '4px 0', fontWeight: 700, letterSpacing: '-0.01em' }}>{job.title}</h3>
          <div className="al-small" style={{ color: 'var(--al-ink-2)' }}>
            <strong>{job.company}</strong> · {job.location || '-'}
            {job.salary_range && ` · 💰 ${job.salary_range}`}
          </div>
        </div>
        {isOwner && (
          <button className="al-iconbtn" onClick={() => onDelete(job.id)} data-testid={`job-delete-${job.id}`}>
            <Icon name="x" size={14} />
          </button>
        )}
      </div>
      <p style={{ fontSize: 14, color: 'var(--al-ink-2)', marginBottom: 14, whiteSpace: 'pre-wrap' }}>
        {job.description}
      </p>
      <div style={{ display: 'flex', gap: 10, paddingTop: 12, borderTop: '1px solid var(--al-line)', alignItems: 'center' }}>
        {job.poster && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1 }}>
            <Avatar name={job.poster.name} hue={job.poster.avatar_hue || 200} size="sm" src={job.poster.avatar_url} />
            <div>
              <div className="al-tiny" style={{ fontWeight: 600 }}>{job.poster.name}</div>
              <div className="al-tiny al-muted">รุ่น {job.poster.gen}</div>
            </div>
          </div>
        )}
        <Chip>{job.interest_count || 0} คนสนใจ</Chip>
        {job.apply_url && (
          <a className="al-btn al-btn-outline al-btn-sm" href={job.apply_url} target="_blank" rel="noopener noreferrer"
            data-testid={`job-apply-link-${job.id}`}>
            ลิงก์สมัคร <Icon name="arrow-up-right" size={12} />
          </a>
        )}
        {!isOwner && (
          <button className={`al-btn al-btn-sm ${interested ? 'al-btn-outline' : 'al-btn-red'}`}
            onClick={() => onInterest(job.id)} disabled={interested}
            data-testid={`job-interest-${job.id}`}>
            <Icon name={interested ? 'check' : 'heart'} size={12} /> {interested ? 'สนใจแล้ว' : 'สนใจ'}
          </button>
        )}
      </div>
    </div>
  );
};

const AlumniJobsPage = () => {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const toast = useToast();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterKind, setFilterKind] = useState(null);
  const [postModal, setPostModal] = useState(false);

  const authH = { headers: { Authorization: `Bearer ${token}` } };

  useEffect(() => {
    if (!user) { navigate('/login?redirect=/alumni/jobs'); return; }
    load();
    // eslint-disable-next-line
  }, [user, filterKind]);

  const load = async () => {
    setLoading(true);
    try {
      const params = filterKind ? { kind: filterKind } : {};
      const r = await axios.get(`${API}/alumni/jobs`, { ...authH, params });
      setJobs(r.data.jobs || []);
    } catch {} finally { setLoading(false); }
  };

  const handleInterest = async (jobId) => {
    try {
      await axios.post(`${API}/alumni/jobs/${jobId}/interest`, {}, authH);
      toast.show('แสดงความสนใจแล้ว · ผู้ลงประกาศจะได้รับแจ้งเตือน');
      load();
    } catch (e) {
      toast.show(e.response?.data?.detail || 'ไม่สำเร็จ');
    }
  };

  const handleDelete = async (jobId) => {
    if (!window.confirm('ปิดประกาศนี้?')) return;
    try {
      await axios.delete(`${API}/alumni/jobs/${jobId}`, authH);
      toast.show('ปิดประกาศแล้ว');
      load();
    } catch {}
  };

  if (!user) return null;

  return (
    <AlumniLayout>
      <div className="al-page al-fade-in" style={{ maxWidth: 920 }} data-testid="alumni-jobs-page">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 22, gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div className="al-eyebrow" style={{ marginBottom: 6 }}>· งานในเครือข่ายตระกูล ·</div>
            <h1 className="al-h-section" style={{ fontSize: 32 }}>Jobs Board 💼</h1>
          </div>
          <button className="al-btn al-btn-red" onClick={() => setPostModal(true)} data-testid="jobs-post-btn">
            <Icon name="plus" size={14} /> ลงประกาศงาน
          </button>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
          <button onClick={() => setFilterKind(null)} data-testid="jobs-filter-all"
            className={`al-btn al-btn-sm ${!filterKind ? 'al-btn-primary' : 'al-btn-outline'}`}>
            ทั้งหมด ({jobs.length})
          </button>
          <button onClick={() => setFilterKind('hiring')} data-testid="jobs-filter-hiring"
            className={`al-btn al-btn-sm ${filterKind === 'hiring' ? 'al-btn-primary' : 'al-btn-outline'}`}>
            🟢 กำลังหาคน
          </button>
          <button onClick={() => setFilterKind('seeking_referral')} data-testid="jobs-filter-referral"
            className={`al-btn al-btn-sm ${filterKind === 'seeking_referral' ? 'al-btn-primary' : 'al-btn-outline'}`}>
            🔵 หา referral
          </button>
        </div>

        {loading && <div className="al-muted" style={{ textAlign: 'center', padding: 40 }}>กำลังโหลด...</div>}
        {!loading && jobs.length === 0 && (
          <div className="al-card al-card-pad" style={{ textAlign: 'center', padding: 60 }} data-testid="jobs-empty">
            <div style={{ fontSize: 40, marginBottom: 12 }}>💼</div>
            <h3 className="al-h-card" style={{ marginBottom: 6 }}>ยังไม่มีประกาศงาน</h3>
            <p className="al-muted al-small">เป็นคนแรกที่ลงประกาศ — ตระกูลของคุณจะได้รับแจ้ง</p>
          </div>
        )}
        <div style={{ display: 'grid', gap: 14 }}>
          {jobs.map(j => (
            <JobCard key={j.id} job={j} currentUserId={user.id}
              onInterest={handleInterest} onDelete={handleDelete} />
          ))}
        </div>

        <PostJobModal open={postModal} onClose={() => setPostModal(false)} token={token}
          onPosted={load} />

        {toast.node}
      </div>
    </AlumniLayout>
  );
};

export default AlumniJobsPage;
