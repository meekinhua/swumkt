import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Icon } from './AlumniUI';
import { useNavigate } from 'react-router-dom';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const NotificationBell = ({ token }) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);

  const load = async () => {
    try {
      const r = await axios.get(`${API}/alumni/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setItems(r.data.notifications || []);
      setUnread(r.data.unread || 0);
    } catch {}
  };

  useEffect(() => {
    if (!token) return;
    load();
    const t = setInterval(load, 30000);  // poll every 30s
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [token]);

  const handleMarkRead = async (id) => {
    try {
      await axios.put(`${API}/alumni/notifications/${id}/read`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      load();
    } catch {}
  };

  const handleMarkAllRead = async () => {
    try {
      await axios.put(`${API}/alumni/notifications/read-all`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      load();
    } catch {}
  };

  const handleClickItem = (n) => {
    if (!n.read) handleMarkRead(n.id);
    // Route by kind
    if (n.kind === 'mark_request' || n.kind === 'relation_confirmed') {
      navigate('/alumni/tree');
    } else if (n.kind === 'invite_accepted') {
      navigate('/alumni/invites');
    } else if (n.kind === 'badge' || n.kind === 'level_up' || n.kind === 'streak') {
      navigate('/alumni/profile');
    }
    setOpen(false);
  };

  const formatTime = (iso) => {
    try {
      const d = new Date(iso);
      const diff = (Date.now() - d.getTime()) / 1000;
      if (diff < 60) return 'เมื่อกี้';
      if (diff < 3600) return `${Math.floor(diff / 60)} นาทีที่แล้ว`;
      if (diff < 86400) return `${Math.floor(diff / 3600)} ชม.ที่แล้ว`;
      return `${Math.floor(diff / 86400)} วันที่แล้ว`;
    } catch { return ''; }
  };

  return (
    <div style={{ position: 'relative' }}>
      <button className="al-iconbtn" title="แจ้งเตือน" onClick={() => setOpen(!open)} data-testid="notif-bell-btn">
        <Icon name="bell" />
        {unread > 0 && <span className="al-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} data-testid="notif-dropdown-backdrop"
            style={{ position: 'fixed', inset: 0, zIndex: 41 }} />
          <div data-testid="notif-dropdown" role="menu" style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 8,
            width: 340, maxHeight: 440, overflowY: 'auto',
            background: 'var(--al-card)', border: '1px solid var(--al-line)',
            borderRadius: 14, boxShadow: 'var(--al-shadow-lg)',
            zIndex: 42,
          }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--al-line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700 }}>แจ้งเตือน {unread > 0 && <span style={{ color: 'var(--al-red)', fontSize: 12 }}>· {unread} ใหม่</span>}</div>
              {unread > 0 && (
                <button className="al-btn al-btn-ghost al-btn-sm" onClick={handleMarkAllRead} data-testid="notif-read-all-btn">
                  อ่านทั้งหมด
                </button>
              )}
            </div>
            {items.length === 0 ? (
              <div className="al-muted al-small" style={{ padding: 30, textAlign: 'center' }}>ยังไม่มีแจ้งเตือน</div>
            ) : (
              items.map(n => (
                <button key={n.id} onClick={() => handleClickItem(n)} data-testid={`notif-item-${n.id}`}
                  style={{
                    padding: '12px 16px', borderBottom: '1px solid var(--al-line)',
                    background: n.read ? 'transparent' : 'var(--al-red-soft)',
                    display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                  }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                    {n.title}
                    {!n.read && <span style={{ marginLeft: 6, width: 6, height: 6, borderRadius: '50%', background: 'var(--al-red)', display: 'inline-block' }} />}
                  </div>
                  {n.body && <div className="al-small" style={{ color: 'var(--al-ink-2)', marginBottom: 4 }}>{n.body}</div>}
                  <div className="al-tiny al-muted">{formatTime(n.created_at)}</div>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default NotificationBell;
