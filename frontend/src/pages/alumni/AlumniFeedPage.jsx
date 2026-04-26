import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '@/context/AuthContext';
import AlumniLayout from './AlumniLayout';
import { Avatar, Chip, Icon, useToast } from './AlumniUI';
import './alumni-styles.css';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const POST_KIND_OPTIONS = [
  { id: 'plain', label: 'ทั่วไป', emoji: '💬', color: 'default' },
  { id: 'throwback', label: 'Throwback', emoji: '📸', color: 'blue' },
  { id: 'review', label: 'รีวิวพี่', emoji: '⭐', color: 'red' },
  { id: 'job_share', label: 'แชร์งาน', emoji: '💼', color: 'red' },
  { id: 'announcement', label: 'ประกาศ', emoji: '📢', color: 'red' },
  { id: 'search_help', label: 'ขอคำแนะนำ', emoji: '🆘', color: 'blue' },
];

const formatTime = (iso) => {
  try {
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'เมื่อกี้';
    if (diff < 3600) return `${Math.floor(diff / 60)} นาที`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} ชม.`;
    return `${Math.floor(diff / 86400)} วัน`;
  } catch { return ''; }
};

const PostCard = ({ post, currentUserId, onReact, onComment, onDelete, onClickAuthor }) => {
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const kindOpt = POST_KIND_OPTIONS.find(k => k.id === post.kind) || POST_KIND_OPTIONS[0];
  const myReacted = post.my_reactions?.includes('❤️');

  const loadComments = async () => {
    if (showComments) { setShowComments(false); return; }
    setShowComments(true);
    setLoadingComments(true);
    try {
      const cs = await onComment.list(post.id);
      setComments(cs);
    } finally { setLoadingComments(false); }
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    const c = await onComment.add(post.id, newComment);
    if (c) {
      setComments(prev => [...prev, c]);
      setNewComment('');
    }
  };

  return (
    <div className="al-card al-card-pad" data-testid={`feed-post-${post.id}`} style={{ marginBottom: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'flex-start' }}>
        <button onClick={() => post.author && onClickAuthor(post.author.user_id)}
          data-testid={`post-author-btn-${post.id}`}>
          <Avatar name={post.author?.name || 'Unknown'} hue={post.author?.avatar_hue || 200}
            size="md" src={post.author?.avatar_url} verified={post.author?.verified} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{post.author?.name || 'ศิษย์เก่า'}</span>
            <span className="al-mono al-tiny al-muted">รุ่น {post.author?.gen || '?'}</span>
            <Chip tone={kindOpt.color} style={{ fontSize: 10, padding: '2px 8px' }}>
              {kindOpt.emoji} {kindOpt.label}
            </Chip>
          </div>
          <div className="al-tiny al-muted">{formatTime(post.created_at)} ที่แล้ว</div>
        </div>
        {post.author_id === currentUserId && (
          <button className="al-iconbtn" onClick={() => onDelete(post.id)} title="ลบ" data-testid={`post-delete-btn-${post.id}`}>
            <Icon name="x" size={14} />
          </button>
        )}
      </div>

      {/* Content */}
      <div style={{ fontSize: 15, lineHeight: 1.5, marginBottom: post.image_url ? 12 : 16, whiteSpace: 'pre-wrap' }}
        data-testid={`post-content-${post.id}`}>
        {post.content}
      </div>
      {post.image_url && (
        <img src={post.image_url} alt="post"
          style={{ width: '100%', maxHeight: 400, objectFit: 'cover', borderRadius: 12, marginBottom: 16 }}
        />
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, paddingTop: 8, borderTop: '1px solid var(--al-line)' }}>
        <button onClick={() => onReact(post.id, '❤️')} data-testid={`post-react-btn-${post.id}`}
          className={`al-btn al-btn-sm ${myReacted ? 'al-btn-red' : 'al-btn-ghost'}`}>
          ❤️ {post.reaction_count > 0 && post.reaction_count}
        </button>
        <button onClick={loadComments} className="al-btn al-btn-ghost al-btn-sm" data-testid={`post-comment-toggle-${post.id}`}>
          <Icon name="message" size={13} /> {post.comment_count || 0} คอมเมนต์
        </button>
      </div>

      {/* Comments */}
      {showComments && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--al-line)' }} data-testid={`post-comments-${post.id}`}>
          {loadingComments && <div className="al-muted al-small">กำลังโหลด...</div>}
          {comments.map(c => (
            <div key={c.id} style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'flex-start' }}>
              <Avatar name={c.author?.name || 'Anon'} hue={c.author?.avatar_hue || 200} size="sm" src={c.author?.avatar_url} />
              <div style={{ flex: 1 }}>
                <div style={{ background: 'var(--al-paper-2)', padding: '8px 12px', borderRadius: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{c.author?.name || 'ศิษย์เก่า'}</div>
                  <div className="al-small">{c.content}</div>
                </div>
                <div className="al-tiny al-muted" style={{ marginTop: 2 }}>{formatTime(c.created_at)} ที่แล้ว</div>
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input value={newComment} onChange={e => setNewComment(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddComment()}
              placeholder="เขียนคอมเมนต์..."
              style={{ flex: 1, padding: '8px 12px', borderRadius: 999, border: '1px solid var(--al-line-2)', background: 'var(--al-paper)' }}
              data-testid={`post-comment-input-${post.id}`}
            />
            <button className="al-btn al-btn-primary al-btn-sm" onClick={handleAddComment} data-testid={`post-comment-submit-${post.id}`}>
              ส่ง
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const AlumniFeedPage = () => {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const toast = useToast();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterKind, setFilterKind] = useState(null);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftKind, setDraftKind] = useState('plain');

  const authH = { headers: { Authorization: `Bearer ${token}` } };

  useEffect(() => {
    if (!user) { navigate('/login?redirect=/alumni/feed'); return; }
    load();
    // eslint-disable-next-line
  }, [user, filterKind]);

  const load = async () => {
    setLoading(true);
    try {
      const params = filterKind ? { kind: filterKind } : {};
      const r = await axios.get(`${API}/alumni/feed/posts`, { ...authH, params });
      setPosts(r.data.posts || []);
    } catch {} finally { setLoading(false); }
  };

  const handleSubmit = async () => {
    if (!draft.trim()) return;
    try {
      await axios.post(`${API}/alumni/feed/posts`, { content: draft, kind: draftKind }, authH);
      setDraft(''); setComposing(false);
      load();
      toast.show('โพสต์สำเร็จ +5 XP');
    } catch (e) {
      toast.show(e.response?.data?.detail || 'โพสต์ไม่สำเร็จ');
    }
  };

  const handleReact = async (postId, emoji) => {
    try {
      const r = await axios.post(`${API}/alumni/feed/posts/${postId}/react`, { emoji }, authH);
      setPosts(prev => prev.map(p => p.id === postId
        ? { ...p, reactions: r.data.reactions, reaction_count: r.data.reaction_count,
            my_reactions: Object.keys(r.data.reactions).filter(e => r.data.reactions[e].includes(user.id)) }
        : p));
    } catch {}
  };

  const handleDelete = async (postId) => {
    if (!window.confirm('ลบโพสต์นี้?')) return;
    try {
      await axios.delete(`${API}/alumni/feed/posts/${postId}`, authH);
      setPosts(prev => prev.filter(p => p.id !== postId));
      toast.show('ลบแล้ว');
    } catch {}
  };

  const commentApi = {
    list: async (postId) => {
      try {
        const r = await axios.get(`${API}/alumni/feed/posts/${postId}/comments`, authH);
        return r.data.comments || [];
      } catch { return []; }
    },
    add: async (postId, content) => {
      try {
        const r = await axios.post(`${API}/alumni/feed/posts/${postId}/comments`, { content }, authH);
        // Update parent post comment_count
        setPosts(prev => prev.map(p => p.id === postId ? { ...p, comment_count: (p.comment_count || 0) + 1 } : p));
        return r.data;
      } catch { return null; }
    },
  };

  if (!user) return null;

  return (
    <AlumniLayout>
      <div className="al-page al-fade-in" style={{ maxWidth: 720 }} data-testid="alumni-feed-page">
        <div style={{ marginBottom: 22 }}>
          <div className="al-eyebrow" style={{ marginBottom: 6 }}>· ฟีดของสายตระกูล ·</div>
          <h1 className="al-h-section" style={{ fontSize: 32 }}>กิจกรรมของรุ่น 📰</h1>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
          <button onClick={() => setFilterKind(null)} data-testid="feed-filter-all"
            className={`al-btn al-btn-sm ${!filterKind ? 'al-btn-primary' : 'al-btn-outline'}`}>
            ทั้งหมด
          </button>
          {POST_KIND_OPTIONS.map(k => (
            <button key={k.id} onClick={() => setFilterKind(k.id)} data-testid={`feed-filter-${k.id}`}
              className={`al-btn al-btn-sm ${filterKind === k.id ? 'al-btn-primary' : 'al-btn-outline'}`}>
              {k.emoji} {k.label}
            </button>
          ))}
        </div>

        {/* Composer */}
        <div className="al-card al-card-pad" style={{ marginBottom: 18 }} data-testid="feed-composer">
          {!composing ? (
            <button onClick={() => setComposing(true)} data-testid="feed-composer-trigger"
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: 12,
                width: '100%', background: 'var(--al-paper-2)', borderRadius: 12,
                cursor: 'pointer', border: 'none', textAlign: 'left', color: 'var(--al-mute)',
              }}>
              <Avatar name={user.full_name || user.email} hue={210} size="md" src={user.avatar_url} />
              <span style={{ flex: 1, fontSize: 14 }}>มีอะไรอยากบอกตระกูลไหม?</span>
              <Chip tone="red" icon="sparkles">+5 XP</Chip>
            </button>
          ) : (
            <div data-testid="feed-composer-active">
              <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                {POST_KIND_OPTIONS.map(k => (
                  <button key={k.id} onClick={() => setDraftKind(k.id)} data-testid={`composer-kind-${k.id}`}
                    className={`al-btn al-btn-sm ${draftKind === k.id ? 'al-btn-primary' : 'al-btn-outline'}`}>
                    {k.emoji} {k.label}
                  </button>
                ))}
              </div>
              <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={4}
                placeholder="เขียนอะไรก็ได้... อยู่ที่ไหน · กำลังหาอะไร · มี throwback มาแชร์"
                style={{ width: '100%', padding: 14, borderRadius: 12, border: '1px solid var(--al-line-2)', background: 'var(--al-paper)', fontSize: 14, resize: 'vertical' }}
                data-testid="composer-textarea"
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
                <button className="al-btn al-btn-outline al-btn-sm" onClick={() => { setComposing(false); setDraft(''); }}
                  data-testid="composer-cancel-btn">ยกเลิก</button>
                <button className="al-btn al-btn-red al-btn-sm" onClick={handleSubmit} data-testid="composer-submit-btn">
                  โพสต์ <Icon name="arrow-right" size={12} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Feed list */}
        {loading && <div className="al-muted" style={{ textAlign: 'center', padding: 40 }}>กำลังโหลด...</div>}
        {!loading && posts.length === 0 && (
          <div className="al-card al-card-pad" style={{ textAlign: 'center', padding: 60 }} data-testid="feed-empty">
            <div style={{ fontSize: 40, marginBottom: 12 }}>🌱</div>
            <h3 className="al-h-card" style={{ marginBottom: 6 }}>ยังไม่มีโพสต์</h3>
            <p className="al-muted al-small">เป็นคนแรกที่โพสต์ให้ตระกูลกัน</p>
          </div>
        )}
        {posts.map(p => (
          <PostCard key={p.id} post={p} currentUserId={user.id}
            onReact={handleReact}
            onComment={commentApi}
            onDelete={handleDelete}
            onClickAuthor={(uid) => navigate(`/alumni/profile/${uid}`)}
          />
        ))}

        {toast.node}
      </div>
    </AlumniLayout>
  );
};

export default AlumniFeedPage;
