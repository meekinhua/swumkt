import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Avatar, Icon } from './AlumniUI';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ACTIVITY_META = {
  joined_family: { emoji: '🌱', tone: 'var(--al-blue)' },
  position_changed: { emoji: '🎯', tone: 'var(--al-red)' },
  company_changed: { emoji: '🚀', tone: 'var(--al-blue)' },
  post_created: { emoji: '📝', tone: 'var(--al-ink)' },
  job_posted: { emoji: '💼', tone: 'var(--al-red)' },
  review_given: { emoji: '⭐', tone: 'var(--al-yellow)' },
  tree_extended: { emoji: '🌳', tone: 'var(--al-blue)' },
  level_up: { emoji: '🎉', tone: 'var(--al-red)' },
  badge_earned: { emoji: '🏆', tone: 'var(--al-yellow)' },
};

const formatTime = (iso) => {
  try {
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'เมื่อกี้';
    if (diff < 3600) return `${Math.floor(diff / 60)} นาทีที่แล้ว`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} ชม.ที่แล้ว`;
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} วันที่แล้ว`;
    return new Date(iso).toLocaleDateString('th-TH');
  } catch { return ''; }
};

const ActivityStream = ({ token, scope = 'tree', limit = 20, compact = false, title = 'ความเคลื่อนไหวของตระกูล', refreshInterval = 60000 }) => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(scope);

  const load = async () => {
    try {
      const r = await axios.get(`${API}/alumni/activity/stream`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { scope: tab, limit },
      });
      setItems(r.data.items || []);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => {
    setLoading(true);
    load();
    if (refreshInterval > 0) {
      const t = setInterval(load, refreshInterval);
      return () => clearInterval(t);
    }
    // eslint-disable-next-line
  }, [tab, token]);

  return (
    <div className="al-card al-card-pad" data-testid="activity-stream">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="al-eyebrow">📡 {title}</div>
        <button className="al-iconbtn" onClick={load} title="รีเฟรช" data-testid="activity-refresh-btn">
          <Icon name="sparkles" size={14} />
        </button>
      </div>

      {!compact && (
        <div className="al-tabs" style={{ marginBottom: 12 }}>
          {[
            { id: 'tree', label: 'สายของฉัน' },
            { id: 'global', label: 'ทั้งคณะ' },
            { id: 'self', label: 'ของฉัน' },
          ].map(t => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}
              data-testid={`activity-tab-${t.id}`}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {loading && <div className="al-muted al-small" style={{ padding: 14, textAlign: 'center' }}>กำลังโหลด...</div>}
      {!loading && items.length === 0 && (
        <div className="al-muted al-small" style={{ padding: 24, textAlign: 'center' }} data-testid="activity-empty">
          ยังไม่มีความเคลื่อนไหว · {tab === 'tree' ? 'ชวนเพื่อนเข้าสายเพิ่ม' : ''}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map(it => {
          const meta = ACTIVITY_META[it.kind] || { emoji: '📌', tone: 'var(--al-mute)' };
          return (
            <button key={it.id} onClick={() => it.actor?.user_id && navigate(`/alumni/profile/${it.actor.user_id}`)}
              data-testid={`activity-item-${it.id}`}
              style={{
                display: 'flex', gap: 10, padding: 10, borderRadius: 10,
                background: 'transparent', border: '1px solid var(--al-line)',
                cursor: 'pointer', textAlign: 'left', width: '100%',
                transition: 'background .1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--al-paper-2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{
                fontSize: 20, lineHeight: 1, flexShrink: 0,
                width: 32, height: 32, borderRadius: 8,
                background: 'var(--al-paper-2)',
                display: 'grid', placeItems: 'center',
              }}>
                {meta.emoji}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                  {it.actor && <Avatar name={it.actor.name} hue={it.actor.avatar_hue || 200} size="xs" src={it.actor.avatar_url} />}
                  <span className="al-small" style={{ fontWeight: 500, lineHeight: 1.3 }}>
                    {it.summary}
                  </span>
                </div>
                <div className="al-tiny al-muted">
                  {it.actor?.gen && <>รุ่น {it.actor.gen} · </>}
                  {formatTime(it.created_at)}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ActivityStream;
