import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Avatar, Chip, Icon, Modal, useToast } from './AlumniUI';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ⭐ Star rating input (1-5)
export const StarInput = ({ value, onChange, size = 28, readonly = false }) => {
  const [hover, setHover] = useState(0);
  const display = hover || value;
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button"
          onClick={() => !readonly && onChange?.(n)}
          onMouseEnter={() => !readonly && setHover(n)}
          onMouseLeave={() => !readonly && setHover(0)}
          data-testid={`star-${n}`}
          disabled={readonly}
          style={{
            background: 'none', border: 'none', cursor: readonly ? 'default' : 'pointer',
            color: n <= display ? 'var(--al-yellow)' : 'var(--al-line-2)',
            fontSize: size, lineHeight: 1, padding: 0,
            transition: 'transform .1s',
            transform: !readonly && hover === n ? 'scale(1.15)' : 'none',
          }}
        >★</button>
      ))}
    </div>
  );
};

// Review modal
export const ReviewModal = ({ open, onClose, subject, token, onPosted }) => {
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState([]);
  const [comment, setComment] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [allTags, setAllTags] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (open) {
      axios.get(`${API}/alumni/reviews/tags`).then(r => setAllTags(r.data.tags || [])).catch(() => {});
      setRating(0); setTags([]); setComment(''); setAnonymous(false);
    }
  }, [open]);

  if (!open) return null;

  const toggleTag = (t) => {
    setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  const handleSubmit = async () => {
    if (rating === 0) {
      toast.show('กรุณาให้คะแนน 1-5 ดาว');
      return;
    }
    setSubmitting(true);
    try {
      await axios.post(`${API}/alumni/reviews`, {
        subject_user_id: subject.user_id,
        rating, tags, comment, anonymous,
      }, { headers: { Authorization: `Bearer ${token}` } });
      toast.show('รีวิวสำเร็จ +25 XP · ขอบคุณที่ช่วยตระกูลครับ');
      onPosted?.();
      onClose();
    } catch (e) {
      toast.show(e.response?.data?.detail || 'รีวิวไม่สำเร็จ');
    } finally { setSubmitting(false); }
  };

  return (
    <Modal onClose={onClose}>
      <div data-testid="review-modal">
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 16 }}>
          <Avatar name={subject?.name} hue={subject?.avatar_hue || 210} size="lg" src={subject?.avatar_url} />
          <div>
            <div className="al-eyebrow">· รีวิวพี่ในสาย ·</div>
            <h3 style={{ margin: '4px 0', fontSize: 20 }}>{subject?.name}</h3>
            <div className="al-tiny al-muted">รุ่น {subject?.gen} · {subject?.position}</div>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div className="al-eyebrow" style={{ marginBottom: 8 }}>คะแนน</div>
          <StarInput value={rating} onChange={setRating} size={36} />
        </div>

        <div style={{ marginBottom: 20 }}>
          <div className="al-eyebrow" style={{ marginBottom: 8 }}>แท็ก (เลือกหลายอันได้)</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {allTags.map(t => (
              <button key={t} onClick={() => toggleTag(t)} data-testid={`review-tag-${t}`}
                className={`al-btn al-btn-sm ${tags.includes(t) ? 'al-btn-red' : 'al-btn-outline'}`}>
                {tags.includes(t) && <Icon name="check" size={12} />} {t}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div className="al-eyebrow" style={{ marginBottom: 8 }}>คอมเมนต์ (optional)</div>
          <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3}
            placeholder="ฝากคำพูดดี ๆ ให้พี่..."
            style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid var(--al-line-2)', background: 'var(--al-paper)', resize: 'vertical' }}
            data-testid="review-comment"
          />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, cursor: 'pointer' }}>
          <input type="checkbox" checked={anonymous} onChange={e => setAnonymous(e.target.checked)}
            data-testid="review-anonymous" />
          <span className="al-small">โพสต์แบบไม่ระบุชื่อ</span>
        </label>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="al-btn al-btn-outline al-btn-block" onClick={onClose}>ยกเลิก</button>
          <button className="al-btn al-btn-red al-btn-block" onClick={handleSubmit} disabled={submitting}
            data-testid="review-submit-btn">
            {submitting ? 'กำลังส่ง...' : 'ส่งรีวิว +25 XP'}
          </button>
        </div>
        {toast.node}
      </div>
    </Modal>
  );
};

// Inline review section to embed in profile page
export const ReviewsSection = ({ userId, currentUserId, token, profile }) => {
  const [data, setData] = useState({ reviews: [], total: 0, average_rating: 0, top_tags: [], rating_breakdown: {} });
  const [showModal, setShowModal] = useState(false);
  const isOwn = userId === currentUserId;

  const load = async () => {
    try {
      const r = await axios.get(`${API}/alumni/reviews/user/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(r.data);
    } catch {}
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [userId]);

  return (
    <div className="al-card al-card-pad" data-testid="profile-reviews-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="al-eyebrow">· รีวิวจากตระกูล ·</div>
        {!isOwn && (
          <button className="al-btn al-btn-red al-btn-sm" onClick={() => setShowModal(true)} data-testid="open-review-modal-btn">
            <Icon name="star" size={12} /> รีวิว
          </button>
        )}
      </div>

      {data.total === 0 ? (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <div className="al-muted al-small">{isOwn ? 'ยังไม่มีรีวิว' : 'เป็นคนแรกที่รีวิว'}</div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 38, fontWeight: 700, lineHeight: 1, color: 'var(--al-yellow)' }}>
                {data.average_rating.toFixed(1)}
              </div>
              <StarInput value={Math.round(data.average_rating)} readonly size={14} />
              <div className="al-tiny al-muted" style={{ marginTop: 4 }}>{data.total} รีวิว</div>
            </div>
            <div style={{ flex: 1 }}>
              {[5, 4, 3, 2, 1].map(n => {
                const count = data.rating_breakdown?.[n] || 0;
                const pct = data.total ? (count / data.total) * 100 : 0;
                return (
                  <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <span className="al-tiny" style={{ width: 10 }}>{n}</span>
                    <div className="al-progress" style={{ flex: 1 }}><div style={{ width: `${pct}%`, background: 'var(--al-yellow)' }} /></div>
                    <span className="al-tiny al-muted al-tabular" style={{ width: 22 }}>{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {data.top_tags.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid var(--al-line)' }}>
              {data.top_tags.map(t => (
                <Chip key={t.tag} tone="default">{t.tag} · {t.count}</Chip>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {data.reviews.slice(0, 5).map(r => (
              <div key={r.id || r.created_at} data-testid={`review-item-${r.id}`} style={{ paddingBottom: 12, borderBottom: '1px solid var(--al-line)' }}>
                <div style={{ display: 'flex', gap: 10, marginBottom: 6, alignItems: 'center' }}>
                  <Avatar name={r.reviewer?.name} hue={r.reviewer?.avatar_hue || 200} size="sm" src={r.reviewer?.avatar_url} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>
                      {r.anonymous ? 'ศิษย์เก่า MKT' : (r.reviewer?.name || 'ไม่ทราบ')}
                    </div>
                    <StarInput value={r.rating} readonly size={12} />
                  </div>
                </div>
                {r.tags?.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                    {r.tags.map(t => <Chip key={t} tone="red">{t}</Chip>)}
                  </div>
                )}
                {r.comment && <p className="al-small" style={{ margin: 0, color: 'var(--al-ink-2)' }}>{r.comment}</p>}
              </div>
            ))}
          </div>
        </>
      )}

      <ReviewModal open={showModal} onClose={() => setShowModal(false)}
        subject={{ ...profile, user_id: userId }} token={token}
        onPosted={load} />
    </div>
  );
};
