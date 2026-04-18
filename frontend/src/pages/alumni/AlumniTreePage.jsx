import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '@/context/AuthContext';
import AlumniLayout from './AlumniLayout';
import { Avatar, Chip, Icon, Modal, useToast } from './AlumniUI';
import './alumni-styles.css';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Visual tree node
const TreeNode = ({ person, isMe, isDesc, onClick }) => (
  <button onClick={onClick} data-testid={`tree-node-${person.user_id}`}
    onMouseEnter={e => e.currentTarget.style.transform = 'translateX(4px)'}
    onMouseLeave={e => e.currentTarget.style.transform = 'none'}
    style={{
      display: 'flex', alignItems: 'center', gap: 14, padding: 14,
      background: isMe ? 'var(--al-ink)' : 'var(--al-card)',
      color: isMe ? 'white' : 'var(--al-ink)',
      border: '1px solid', borderColor: isMe ? 'var(--al-ink)' : 'var(--al-line)',
      borderRadius: 14, cursor: 'pointer', width: '100%', textAlign: 'left',
      boxShadow: 'var(--al-shadow-sm)', transition: 'transform .1s',
    }}>
    <Avatar name={person.name} hue={person.avatar_hue || 210} size="lg"
      verified={person.verified} src={person.avatar_url} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 16, fontWeight: 700 }}>{person.nickname || person.name}</span>
        <span className="al-mono al-tiny" style={{
          background: isMe ? 'rgba(255,255,255,0.15)' : 'var(--al-paper-2)',
          padding: '2px 8px', borderRadius: 999,
        }}>
          รุ่น {person.gen}
        </span>
        {person.relation && (
          <span style={{
            fontSize: 11, fontWeight: 600,
            background: isMe ? 'var(--al-yellow)' : (isDesc ? 'var(--al-blue)' : 'var(--al-red)'),
            color: isMe ? 'var(--al-ink)' : 'white',
            padding: '2px 8px', borderRadius: 999,
          }}>{person.relation}</span>
        )}
      </div>
      <div className="al-small" style={{ opacity: isMe ? 0.85 : 1, color: isMe ? 'white' : 'var(--al-ink-2)' }}>
        {person.position || person.role || '-'}
      </div>
      {person.company && (
        <div className="al-tiny" style={{ opacity: isMe ? 0.6 : 0.7, marginTop: 2, color: isMe ? 'white' : 'var(--al-mute)' }}>
          {person.company}
        </div>
      )}
    </div>
  </button>
);

const TreeConnector = ({ dashed }) => (
  <div style={{ marginLeft: 30, height: 22, position: 'relative', display: 'flex', alignItems: 'center' }}>
    <div style={{
      position: 'absolute', top: 0, bottom: 0, left: 0,
      width: 2, background: dashed ? 'transparent' : 'var(--al-line-2)',
      borderLeft: dashed ? '2px dashed var(--al-line-2)' : 'none',
    }} />
  </div>
);

const PersonPanel = ({ person, onClose, onMessage }) => (
  <div className="al-card al-card-pad al-fade-in" style={{ position: 'relative' }} data-testid="tree-person-panel">
    <button className="al-iconbtn" style={{ position: 'absolute', top: 10, right: 10 }} onClick={onClose}
      data-testid="person-panel-close-btn">
      <Icon name="x" size={16} />
    </button>
    <Avatar name={person.name} hue={person.avatar_hue || 210} size="lg" verified={person.verified} src={person.avatar_url} />
    <h3 style={{ fontSize: 20, margin: '12px 0 2px', letterSpacing: '-0.01em' }}>{person.name}</h3>
    <div className="al-small al-muted" style={{ marginBottom: 14 }}>
      {person.position}{person.company ? ` · ${person.company}` : ''}
    </div>

    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
      {person.relation && <Chip tone="red">{person.relation} · รุ่น {person.gen}</Chip>}
      {person.student_id && <Chip>{person.student_id}</Chip>}
    </div>

    <div style={{ display: 'flex', gap: 8 }}>
      <button className="al-btn al-btn-red al-btn-block" onClick={onMessage} data-testid="person-panel-message-btn">
        <Icon name="message" size={14} /> ส่งข้อความ
      </button>
      <button className="al-btn al-btn-outline al-btn-sm" data-testid="person-panel-star-btn">
        <Icon name="star" size={14} />
      </button>
    </div>
  </div>
);

const AlumniTreePage = () => {
  const navigate = useNavigate();
  const { userId } = useParams();
  const { user, token } = useAuth();
  const toast = useToast();

  const [tree, setTree] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notRegistered, setNotRegistered] = useState(false);
  const [mode, setMode] = useState('all'); // ancestors | descendants | all
  const [selected, setSelected] = useState(null);
  const [pending, setPending] = useState([]);
  const [markModal, setMarkModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  const authHeader = { headers: { Authorization: `Bearer ${token}` } };

  useEffect(() => {
    if (!user) {
      navigate('/login?redirect=/alumni/tree');
      return;
    }
    loadTree();
    loadPending();
  }, [user, userId]);

  const loadTree = async () => {
    setLoading(true);
    try {
      const endpoint = userId ? `${API}/alumni/tree/${userId}` : `${API}/alumni/tree/me`;
      const r = await axios.get(endpoint, authHeader);
      setTree(r.data);
      setNotRegistered(false);
    } catch (e) {
      if (e.response?.status === 404) {
        setNotRegistered(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadPending = async () => {
    try {
      const r = await axios.get(`${API}/alumni/relations/pending`, authHeader);
      setPending(r.data.pending || []);
    } catch {}
  };

  useEffect(() => {
    if (!searchTerm || searchTerm.length < 2) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(() => {
      axios.get(`${API}/alumni/search`, { ...authHeader, params: { q: searchTerm, limit: 8 } })
        .then(r => setSearchResults(r.data.results || []))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const handleMark = async (target) => {
    try {
      await axios.post(`${API}/alumni/relations`, {
        to_user_id: target.user_id,
        kind: 'take',
      }, authHeader);
      toast.show(`ส่งคำขอไปยัง ${target.nickname || target.name} · รอการยืนยัน`);
      setMarkModal(false);
      setSearchTerm('');
      setSearchResults([]);
    } catch (e) {
      toast.show(e.response?.data?.detail || 'ไม่สามารถ mark ได้');
    }
  };

  const handleConfirmPending = async (relId, accept) => {
    try {
      await axios.put(`${API}/alumni/relations/${relId}/confirm`, { accept }, authHeader);
      toast.show(accept ? 'ยืนยันการเชื่อมต่อแล้ว' : 'ปฏิเสธแล้ว');
      loadPending();
      loadTree();
    } catch {
      toast.show('ไม่สำเร็จ');
    }
  };

  if (!user) return null;

  if (notRegistered) {
    return (
      <AlumniLayout>
        <div className="al-page al-fade-in" style={{ textAlign: 'center', paddingTop: 80 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🌳</div>
          <h2 className="al-h-section" style={{ marginBottom: 8 }}>คุณยังไม่ได้ลงทะเบียนในระบบสายตระกูล</h2>
          <p className="al-muted" style={{ marginBottom: 24 }}>เริ่มใน 60 วินาที · ระบบจะค้นหาพี่ take ของคุณให้</p>
          <button className="al-btn al-btn-red al-btn-lg" onClick={() => navigate('/alumni/onboarding')}
            data-testid="tree-goto-onboarding-btn">
            ลงทะเบียนเลย <Icon name="arrow-right" size={16} />
          </button>
        </div>
      </AlumniLayout>
    );
  }

  if (loading || !tree) {
    return (
      <AlumniLayout>
        <div className="al-page" style={{ textAlign: 'center', paddingTop: 80 }}>
          <div className="al-muted">กำลังโหลดสายตระกูล...</div>
        </div>
      </AlumniLayout>
    );
  }

  const ancestorsReversed = [...(tree.ancestors || [])].reverse();
  let chainOrder = [];
  if (mode === 'ancestors') chainOrder = [...ancestorsReversed, tree.root];
  else if (mode === 'descendants') chainOrder = [tree.root, ...(tree.descendants || [])];
  else chainOrder = [...ancestorsReversed, tree.root, ...(tree.descendants || [])];

  return (
    <AlumniLayout>
      <div className="al-page al-fade-in" data-testid="alumni-tree-page">
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20, gap: 14, flexWrap: 'wrap' }}>
          <div>
            <div className="al-eyebrow" style={{ marginBottom: 6 }}>สายตระกูลของคุณ</div>
            <h1 className="al-h-section" style={{ fontSize: 36 }} data-testid="tree-title">
              ตระกูล "MKT SWU"
            </h1>
            <div className="al-small al-muted" style={{ marginTop: 4 }}>
              {tree.total} คนในสาย {tree.max_ancestor_gen ? `· ยาวถึงรุ่น ${tree.max_ancestor_gen}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="al-btn al-btn-outline al-btn-sm" data-testid="tree-share-btn">
              <Icon name="share" size={14} /> แชร์ต้นไม้
            </button>
            <button className="al-btn al-btn-primary al-btn-sm" onClick={() => setMarkModal(true)} data-testid="tree-mark-btn">
              <Icon name="plus" size={14} /> Mark คนในสาย
            </button>
          </div>
        </div>

        {/* Mode tabs */}
        <div className="al-tabs" style={{ marginBottom: 22 }}>
          {[
            { id: 'ancestors', label: `สายขึ้น (${tree.ancestors?.length || 0})`, icon: 'arrow-up-right' },
            { id: 'descendants', label: `สายลง (${tree.descendants?.length || 0})`, icon: 'arrow-right' },
            { id: 'all', label: 'ทั้งหมด', icon: 'users' },
          ].map(t => (
            <button key={t.id} className={mode === t.id ? 'active' : ''} onClick={() => setMode(t.id)}
              data-testid={`tree-mode-${t.id}`}>
              <Icon name={t.icon} size={14} style={{ marginRight: 6, verticalAlign: '-2px' }} />
              {t.label}
            </button>
          ))}
        </div>

        <div className="al-tree-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 20 }}>
          {/* Tree viz */}
          <div className="al-tree-canvas" style={{ padding: '28px 20px', minHeight: 560 }} data-testid="tree-canvas">
            {chainOrder.length === 0 && (
              <div style={{ textAlign: 'center', padding: 60, color: 'var(--al-mute)' }}>
                ยังไม่มีสมาชิกในสาย · เริ่มด้วยการ Mark พี่ take ของคุณ
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {chainOrder.map((p, i) => {
                if (!p) return null;
                const isMe = p.user_id === tree.root.user_id && p.direction === 'self';
                const isDesc = p.direction === 'down';
                return (
                  <div key={`${p.user_id}-${i}`}>
                    <TreeNode person={p} isMe={isMe} isDesc={isDesc} onClick={() => setSelected(p)} />
                    {i < chainOrder.length - 1 && <TreeConnector />}
                  </div>
                );
              })}
              {mode !== 'descendants' && (
                <>
                  <TreeConnector dashed />
                  <button onClick={() => setMarkModal(true)} data-testid="tree-unknown-hint"
                    style={{
                      padding: '14px 18px', border: '2px dashed var(--al-line-2)', borderRadius: 14,
                      background: 'var(--al-card)', display: 'flex', alignItems: 'center', gap: 12,
                      cursor: 'pointer', width: '100%', textAlign: 'left',
                    }}>
                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--al-paper-2)', display: 'grid', placeItems: 'center', color: 'var(--al-mute)' }}>
                      <Icon name="plus" size={20} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>หาพี่ทวดของคุณ</div>
                      <div className="al-tiny al-muted">รู้จักพี่รุ่นเก่ากว่านี้? ชวนเข้ามาเพื่อเชื่อมต่อสาย</div>
                    </div>
                    <Icon name="arrow-right" size={16} />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Side panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {selected ? (
              <PersonPanel person={selected} onClose={() => setSelected(null)}
                onMessage={() => toast.show(`ฟีเจอร์ส่งข้อความจะเปิดใน Phase 2`)} />
            ) : (
              <div className="al-card al-card-pad">
                <div className="al-eyebrow" style={{ marginBottom: 10 }}>ตัวช่วยค้นหา</div>
                <h3 className="al-h-card" style={{ marginBottom: 8 }}>คลิกที่คนในสายเพื่อดูรายละเอียด</h3>
                <p className="al-small al-muted" style={{ margin: 0 }}>
                  ตำแหน่ง / บริษัท / สาขาที่ช่วยได้
                </p>
              </div>
            )}

            {/* Pending marks (awaiting MY confirmation) */}
            {pending.length > 0 && (
              <div className="al-card al-card-pad" data-testid="tree-pending-list">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div className="al-eyebrow">รอยืนยัน · {pending.length} คน</div>
                  <Chip tone="red">ใหม่</Chip>
                </div>
                {pending.map(p => {
                  const prof = p.from_profile || {};
                  return (
                    <div key={p.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--al-line)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <Avatar name={prof.name || 'Unknown'} hue={prof.avatar_hue || 200} size="sm" />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>
                            {prof.name} <span className="al-mono al-tiny al-muted">· {prof.gen}</span>
                          </div>
                          <div className="al-tiny al-muted">
                            ขอให้คุณเป็น "พี่ take" ของเขา
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="al-btn al-btn-red al-btn-sm" onClick={() => handleConfirmPending(p.id, true)}
                          data-testid={`pending-accept-${p.id}`}>
                          <Icon name="check" size={12} /> ยืนยัน
                        </button>
                        <button className="al-btn al-btn-outline al-btn-sm" onClick={() => handleConfirmPending(p.id, false)}
                          data-testid={`pending-reject-${p.id}`}>
                          ปฏิเสธ
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Quick stats */}
            <div className="al-card al-card-pad">
              <div className="al-eyebrow" style={{ marginBottom: 12 }}>สถิติตระกูลคุณ</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div className="al-tabular" style={{ fontSize: 22, fontWeight: 700 }}>{tree.total}</div>
                  <div className="al-tiny al-muted">สมาชิกในสาย</div>
                </div>
                <div>
                  <div className="al-tabular" style={{ fontSize: 22, fontWeight: 700, color: 'var(--al-red)' }}>
                    {tree.max_ancestor_gen ? `${tree.ancestors.length} ทอด` : '-'}
                  </div>
                  <div className="al-tiny al-muted">สายขึ้น</div>
                </div>
                <div>
                  <div className="al-tabular" style={{ fontSize: 22, fontWeight: 700 }}>{tree.descendants?.length || 0}</div>
                  <div className="al-tiny al-muted">น้องในสาย</div>
                </div>
                <div>
                  <div className="al-tabular" style={{ fontSize: 22, fontWeight: 700, color: 'var(--al-blue)' }}>
                    {tree.root?.gen || '-'}
                  </div>
                  <div className="al-tiny al-muted">รุ่นคุณ</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {markModal && (
          <Modal onClose={() => setMarkModal(false)}>
            <h3 className="al-h-card" style={{ marginBottom: 6 }}>Mark คนเข้าสายตระกูล</h3>
            <p className="al-small al-muted" style={{ marginBottom: 18 }}>
              ค้นหาจากลิสของระบบ · ทั้งสองฝั่งต้องยืนยันถึงจะปรากฏในสาย
            </p>
            <input placeholder="ค้นหาชื่อ หรือรหัสนิสิต" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--al-line-2)', background: 'var(--al-paper)', marginBottom: 14 }}
              data-testid="mark-modal-search-input"
            />
            <div style={{ display: 'grid', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
              {searchResults.length === 0 && searchTerm.length >= 2 && (
                <div className="al-small al-muted" style={{ textAlign: 'center', padding: 16 }}>ไม่พบผลลัพธ์</div>
              )}
              {searchResults.map(s => (
                <button key={s.user_id} onClick={() => handleMark(s)} data-testid={`mark-result-${s.user_id}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: 10,
                    borderRadius: 10, border: '1px solid var(--al-line)',
                    cursor: 'pointer', textAlign: 'left', width: '100%', background: 'white',
                  }}>
                  <Avatar name={s.name} hue={s.avatar_hue || 200} size="sm" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      {s.name} <span className="al-mono al-tiny al-muted">{s.gen}</span>
                    </div>
                    <div className="al-tiny al-muted">{s.position || s.role}</div>
                  </div>
                  <Chip tone="red">Mark</Chip>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button className="al-btn al-btn-outline al-btn-block" onClick={() => setMarkModal(false)} data-testid="mark-modal-cancel-btn">
                ยกเลิก
              </button>
            </div>
          </Modal>
        )}

        {toast.node}
      </div>
    </AlumniLayout>
  );
};

export default AlumniTreePage;
