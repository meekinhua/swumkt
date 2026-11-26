import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import AlumniLayout from './AlumniLayout';
import { Avatar, Chip, Icon, Modal, useToast } from './AlumniUI';
import ActivityStream from './ActivityStream';
import { api, errMsg, errCode, statusOf, shortName } from './alumniApi';
import { StatusBadge, StatusLegend, useGaps, GapPanel, AddPersonForm, HistoryModal, attachNodeFor } from './LineKit';
import { PendingClaims, GhostClaimApprovals, VouchQueue } from './ConfirmQueue';
import { Leaderboards, Meetups } from './LineCommunity';
import './alumni-styles.css';

const TABS = [
  { id: 'line', label: 'สายของฉัน' },
  { id: 'confirm', label: 'ช่วยยืนยันสาย' },
  { id: 'rank', label: 'อันดับสาย' },
  { id: 'meetup', label: 'เลี้ยงสาย' },
];

// ---------- one person on the line ----------
const TreeNode = ({ person, isMe, isDesc, onClick }) => {
  const ghost = person.is_ghost;
  return (
    <button onClick={onClick} data-testid={`tree-node-${person.user_id}`}
      className={ghost ? 'al-node-ghost' : ''}
      aria-label={`${person.nickname || person.name} ${person.term || ''} รุ่น ${person.gen}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: 14,
        background: isMe ? 'var(--al-ink)' : 'var(--al-card)',
        color: isMe ? 'white' : 'var(--al-ink)',
        border: '1px solid', borderColor: isMe ? 'var(--al-ink)' : 'var(--al-line)',
        borderRadius: 14, cursor: 'pointer', width: '100%', textAlign: 'left',
        boxShadow: 'var(--al-shadow-sm)',
      }}>
      <Avatar name={person.name} hue={person.avatar_hue || 210} size="lg" verified={person.verified} src={person.avatar_url} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>{person.nickname || person.name}</span>
          <span className="al-mono al-tiny" style={{ background: isMe ? 'rgba(255,255,255,0.15)' : 'var(--al-paper-2)', padding: '2px 8px', borderRadius: 999 }}>
            รุ่น {person.gen}
          </span>
          {(person.term || person.relation) && (
            <span style={{
              fontSize: 11, fontWeight: 600,
              background: isMe ? 'var(--al-yellow)' : (isDesc ? 'var(--al-blue)' : 'var(--al-red)'),
              color: isMe ? 'var(--al-ink)' : 'white', padding: '2px 8px', borderRadius: 999,
            }}>{person.term || person.relation}</span>
          )}
        </div>
        {ghost ? (
          <div className="al-small" style={{ color: 'var(--al-ink-2)' }}>ยังไม่ลงทะเบียน · เพิ่มไว้โดยเพื่อนในสาย</div>
        ) : (
          <>
            <div className="al-small" style={{ color: isMe ? 'rgba(255,255,255,.85)' : 'var(--al-ink-2)' }}>{person.position || (person.role === 'alumni' ? 'ศิษย์เก่า' : person.role === 'current_student' ? 'นิสิตปัจจุบัน' : person.role) || '-'}</div>
            {person.company && <div className="al-tiny" style={{ marginTop: 2, color: isMe ? 'rgba(255,255,255,.7)' : 'var(--al-mute)' }}>{person.company}</div>}
          </>
        )}
      </div>
    </button>
  );
};

// connector between two people. status tells how solid the link is.
const Edge = ({ status, gap }) => {
  const s = statusOf(status);
  const cls = gap ? 'al-edge-gap' : s ? `al-edge-${status === 'pending' ? 'claimed' : status}` : '';
  return (
    <div className={`al-edge ${cls}`} data-testid={s ? `edge-${status}` : 'edge'}>
      {s && !gap && <StatusBadge status={status} />}
    </div>
  );
};

const GapSlot = ({ slot, down, onClick }) => (
  <button className={`al-slot ${down ? 'down' : ''}`} onClick={onClick} data-testid={down ? 'tree-slot-down' : 'tree-slot-up'}>
    <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'white', border: `2px dashed ${down ? 'var(--al-blue)' : 'var(--al-red)'}`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
      <Icon name="plus" size={20} />
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontWeight: 700, fontSize: 15 }}>{slot.headline || `${slot.term}ของคุณยังไม่มา`}</div>
      <div className="al-small" style={{ color: 'var(--al-ink-2)' }}>
        {down ? 'ชวนน้องเข้ามาต่อสาย หรือเพิ่มชื่อไว้ก่อน' : 'เพิ่มชื่อ ชวนมา หรือให้เพื่อนในสายช่วยตามหา'}
      </div>
    </div>
    <Icon name="arrow-right" size={18} />
  </button>
);

// ---------- person detail ----------
const PersonPanel = ({ person, isMe, onClose, token, canEdit, toast, onChanged, onInviteGhost, onHistory, ownTree }) => {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const st = statusOf(person.link_status);
  const notConfirmed = person.relation_id && person.link_status && person.link_status !== 'confirmed';

  const run = async (fn, okMsg) => {
    setBusy(true);
    try { await fn(); okMsg && toast(okMsg); onChanged(); }
    catch (e) { toast(errMsg(e)); }
    finally { setBusy(false); }
  };
  const vouch = (v) => run(() => api.post(token, `/alumni/relations/${person.relation_id}/vouch`, { vote: v }), 'ขอบคุณที่ช่วยยืนยัน');
  const removeLink = () => {
    if (!window.confirm('ลบความสัมพันธ์นี้ออกจากสายใช่ไหม?')) return;
    run(() => api.del(token, `/alumni/relations/${person.relation_id}`), 'ลบแล้ว');
  };
  const claimGhost = async () => {
    setBusy(true);
    try {
      const r = await api.post(token, `/alumni/ghosts/${person.user_id}/claim`, {});
      toast(r.data.status === 'merged' ? 'รวมเข้ากับบัญชีของคุณแล้ว' : 'ส่งคำขอแล้ว รอสมาชิกในสายช่วยยืนยันว่าเป็นคุณ');
      onChanged();
    } catch (e) {
      toast(errCode(e) === 'gen_mismatch' ? 'รุ่นไม่ตรงกัน ถ้าเป็นคุณจริง ๆ ขอลิงก์ชวนจากคนที่เพิ่มชื่อไว้' : errMsg(e));
    } finally { setBusy(false); }
  };
  const removeGhost = () => {
    if (!window.confirm(`ลบ "${person.name}" ออกจากสายใช่ไหม?`)) return;
    run(() => api.post(token, `/alumni/ghosts/${person.user_id}/remove`, {}), 'ลบแล้ว');
  };

  return (
    <div className="al-card al-card-pad al-fade-in" role="dialog" aria-label="รายละเอียดคนในสาย" style={{ position: 'relative' }} data-testid="tree-side-panel">
      <button className="al-iconbtn" style={{ position: 'absolute', top: 10, right: 10 }} onClick={onClose} aria-label="ปิด" data-testid="person-panel-close-btn">
        <Icon name="x" size={16} />
      </button>
      <Avatar name={person.name} hue={person.avatar_hue || 210} size="lg" verified={person.verified} src={person.avatar_url} />
      <h3 style={{ fontSize: 20, margin: '12px 0 2px', letterSpacing: '-0.01em' }}>{person.name}</h3>
      <div className="al-small al-muted" style={{ marginBottom: 12 }}>
        {person.is_ghost ? 'ยังไม่ลงทะเบียน' : `${person.position || ''}${person.company ? ` · ${person.company}` : ''}`}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {(person.term || person.relation) && !isMe && <Chip tone="red">{person.term || person.relation} · รุ่น {person.gen}</Chip>}
        {person.is_ghost && <Chip tone="outline">ยังไม่ลงทะเบียน</Chip>}
        {person.link_status && <StatusBadge status={person.link_status} />}
      </div>
      {st && <p className="al-small" style={{ margin: '0 0 12px', color: 'var(--al-ink-2)' }}>{st.desc}</p>}

      <div style={{ display: 'grid', gap: 8 }}>
        {!person.is_ghost && !isMe && (
          <button className="al-btn al-btn-outline al-btn-block" onClick={() => navigate(`/alumni/profile/${person.user_id}`)} data-testid="person-panel-profile-btn">
            <Icon name="user" size={14} /> ดูโปรไฟล์
          </button>
        )}
        {person.is_ghost && ownTree && (
          <>
            <button className="al-btn al-btn-red al-btn-block" onClick={() => onInviteGhost(person)} data-testid="person-panel-invite-btn">
              <Icon name="share" size={14} /> ชวน {shortName(person)} เข้าสาย
            </button>
            <button className="al-btn al-btn-outline al-btn-block" onClick={claimGhost} disabled={busy} data-testid="person-panel-claim-btn">
              นี่คือฉัน
            </button>
          </>
        )}
        {notConfirmed && ownTree && person.distance > 1 && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="al-btn al-btn-primary al-btn-sm" style={{ flex: 1 }} disabled={busy} onClick={() => vouch('yes')} data-testid="person-panel-vouch-yes">ใช่ ช่วยรับรอง</button>
            <button className="al-btn al-btn-outline al-btn-sm" style={{ flex: 1 }} disabled={busy} onClick={() => vouch('no')} data-testid="person-panel-vouch-no">ไม่ใช่</button>
          </div>
        )}
        {person.relation_id && (
          <button className="al-btn al-btn-ghost al-btn-sm" onClick={() => onHistory(person.relation_id)} data-testid="person-panel-history-btn">
            <Icon name="feed" size={13} /> ดูประวัติของความสัมพันธ์นี้
          </button>
        )}
        {canEdit && notConfirmed && ownTree && (
          <button className="al-btn al-btn-ghost al-btn-sm" disabled={busy} onClick={removeLink} data-testid="person-panel-remove-link">ลบความสัมพันธ์นี้</button>
        )}
        {person.is_ghost && ownTree && (
          <button className="al-btn al-btn-ghost al-btn-sm" disabled={busy} onClick={removeGhost} data-testid="person-panel-remove-ghost">ลบชื่อนี้ออก</button>
        )}
      </div>
    </div>
  );
};

// ---------- add someone: registered member or a placeholder ----------
const AddPersonModal = ({ token, me, onClose, onDone, toast }) => {
  const [mode, setMode] = useState('member'); // member | ghost
  const [role, setRole] = useState('senior'); // what the OTHER person is to me
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (mode !== 'member' || q.length < 2) { setResults([]); return undefined; }
    setSearching(true);
    const t = setTimeout(() => {
      api.get(token, '/alumni/search', { q, limit: 8 }).then(r => setResults((r.data.results || []).filter(x => x.user_id !== me.user_id)))
        .catch(() => setResults([])).finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q, mode, token, me.user_id]);

  const pick = async (s) => {
    setErr(null);
    try {
      await api.post(token, '/alumni/relations/claim',
        role === 'senior' ? { junior_id: me.user_id, senior_id: s.user_id } : { junior_id: s.user_id, senior_id: me.user_id });
      toast(`ส่งเรื่องให้ ${shortName(s)} ยืนยันแล้ว`);
      onDone();
    } catch (e) { setErr(errMsg(e, 'เชื่อมไม่สำเร็จ')); }
  };

  return (
    <Modal onClose={onClose}>
      <div data-testid="add-person-modal">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <h3 className="al-h-card" style={{ fontSize: 20 }}>เพิ่มคนเข้าสายเทค</h3>
          <button className="al-iconbtn" onClick={onClose} aria-label="ปิด" data-testid="mark-modal-cancel-btn"><Icon name="x" /></button>
        </div>
        <div style={{ display: 'grid', gap: 12, marginBottom: 14 }}>
          <div>
            <div className="al-label">เขาเป็นอะไรของคุณ</div>
            <div className="al-seg" role="group" aria-label="บทบาท">
              <button aria-pressed={role === 'senior'} onClick={() => setRole('senior')} data-testid="add-role-senior">พี่เทคของฉัน</button>
              <button aria-pressed={role === 'junior'} onClick={() => setRole('junior')} data-testid="add-role-junior">น้องเทคของฉัน</button>
            </div>
          </div>
          <div className="al-seg" role="group" aria-label="วิธีเพิ่ม">
            <button aria-pressed={mode === 'member'} onClick={() => setMode('member')} data-testid="add-mode-member">ค้นหาคนที่ลงทะเบียนแล้ว</button>
            <button aria-pressed={mode === 'ghost'} onClick={() => setMode('ghost')} data-testid="add-mode-ghost">ยังไม่ได้ลงทะเบียน</button>
          </div>
        </div>

        {mode === 'member' ? (
          <>
            <label className="al-label" htmlFor="mark-search">ค้นหาชื่อ ชื่อเล่น หรือรหัสนิสิต</label>
            <input id="mark-search" className="al-input" placeholder="พิมพ์อย่างน้อย 2 ตัวอักษร" value={q} onChange={e => setQ(e.target.value)} data-testid="mark-modal-search-input" />
            <div className="al-help">ทั้งสองฝั่งหรือเพื่อนในสายช่วยกันยืนยัน ถึงจะขึ้นเป็นเส้นสีเขียว</div>
            {err && <div role="alert" className="al-small" style={{ color: 'var(--al-red-ink)', marginTop: 8 }}>{err}</div>}
            <div style={{ display: 'grid', gap: 6, maxHeight: 300, overflowY: 'auto', marginTop: 12 }}>
              {searching && <div className="al-small al-muted" style={{ textAlign: 'center', padding: 10 }}>กำลังค้นหา...</div>}
              {!searching && results.length === 0 && q.length >= 2 && (
                <div className="al-small al-muted" style={{ textAlign: 'center', padding: 14 }}>
                  ไม่พบ ลองเลือก "ยังไม่ได้ลงทะเบียน" เพื่อเพิ่มชื่อไว้ก่อน
                </div>
              )}
              {results.map(s => (
                <button key={s.user_id} onClick={() => pick(s)} data-testid={`mark-result-${s.user_id}`} className="al-card"
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, textAlign: 'left', width: '100%' }}>
                  <Avatar name={s.name} hue={s.avatar_hue || 200} size="sm" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{s.name} <span className="al-mono al-tiny al-muted">รุ่น {s.gen}</span></div>
                    <div className="al-tiny al-muted">{s.position || s.role}</div>
                  </div>
                  <Chip tone="red">{role === 'senior' ? 'เป็นพี่เทค' : 'เป็นน้องเทค'}</Chip>
                </button>
              ))}
            </div>
          </>
        ) : (
          <AddPersonForm token={token} term={role === 'senior' ? 'พี่เทค' : 'น้องเทค'}
            attach={{ as: role, toId: me.user_id }}
            defaultGen={me.gen ? (role === 'senior' ? me.gen - 1 : me.gen + 1) : ''}
            submitLabel="เพิ่มเข้าสาย"
            onCreated={(g) => { toast(`เพิ่ม ${shortName(g)} แล้ว`); onDone(); }} />
        )}
      </div>
    </Modal>
  );
};

const AlumniTreePage = () => {
  const navigate = useNavigate();
  const { userId } = useParams();
  const [params, setParams] = useSearchParams();
  const { user, token } = useAuth();
  const toast = useToast();
  const ownTree = !userId;
  const tab = ownTree && TABS.some(t => t.id === params.get('tab')) ? params.get('tab') : 'line';

  const [tree, setTree] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [notRegistered, setNotRegistered] = useState(false);
  const [mode, setMode] = useState('all');
  const [selected, setSelected] = useState(null);
  const [pending, setPending] = useState([]);
  const [addOpen, setAddOpen] = useState(false);
  const [throwback, setThrowback] = useState([]);
  const [gapSlot, setGapSlot] = useState(null);
  const [history, setHistory] = useState(null);
  const gapsState = useGaps(token, !!user && ownTree && !notRegistered);

  const loadTree = useCallback(async () => {
    setLoading(true); setLoadError(null);
    try {
      const r = await api.get(token, userId ? `/alumni/tree/${userId}` : '/alumni/tree/me');
      setTree(r.data); setNotRegistered(false);
    } catch (e) {
      if (e.response?.status === 404) setNotRegistered(true);
      else setLoadError(errMsg(e, 'โหลดสายเทคไม่สำเร็จ'));
    } finally { setLoading(false); }
  }, [token, userId]);

  const loadPending = useCallback(async () => {
    try { setPending((await api.get(token, '/alumni/relations/pending')).data.pending || []); } catch { /* optional */ }
  }, [token]);

  const loadThrowback = useCallback(async () => {
    try { setThrowback((await api.get(token, '/alumni/throwback/random', { count: 4 })).data.items || []); } catch { /* optional */ }
  }, [token]);

  useEffect(() => {
    if (!user) { navigate('/login?redirect=/alumni/tree'); return; }
    loadTree();
    if (ownTree) { loadPending(); loadThrowback(); }
    // eslint-disable-next-line
  }, [user, userId]);

  const refreshAll = () => { setSelected(null); loadTree(); loadPending(); gapsState.reload(); };
  const setTab = (id) => setParams(id === 'line' ? {} : { tab: id }, { replace: true });

  if (!user) return null;

  if (notRegistered) {
    return (
      <AlumniLayout>
        <div className="al-page al-fade-in" style={{ textAlign: 'center', paddingTop: 80 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🌳</div>
          <h2 className="al-h-section" style={{ marginBottom: 8 }}>คุณยังไม่ได้ลงทะเบียนในสายเทค</h2>
          <p className="al-muted" style={{ marginBottom: 24 }}>เริ่มใน 60 วินาที · บอกเราว่าใครคือพี่เทคของคุณ แล้วเราช่วยต่อสายขึ้นไป</p>
          <button className="al-btn al-btn-red al-btn-lg" onClick={() => navigate('/alumni/onboarding')} data-testid="tree-goto-onboarding-btn">
            ลงทะเบียนเลย <Icon name="arrow-right" size={16} />
          </button>
        </div>
      </AlumniLayout>
    );
  }

  if (loadError) {
    return (
      <AlumniLayout>
        <div className="al-page" style={{ textAlign: 'center', paddingTop: 80 }} data-testid="tree-error">
          <div style={{ fontSize: 40 }}>😵</div>
          <p className="al-muted" role="alert">{loadError}</p>
          <button className="al-btn al-btn-outline" onClick={loadTree}>ลองใหม่</button>
        </div>
      </AlumniLayout>
    );
  }

  if (loading || !tree) {
    return (
      <AlumniLayout>
        <div className="al-page" style={{ textAlign: 'center', paddingTop: 80 }} data-testid="tree-loading">
          <div className="al-muted">กำลังโหลดสายเทค...</div>
        </div>
      </AlumniLayout>
    );
  }

  const me = tree.root;
  const ancestorsTopFirst = [...(tree.ancestors || [])].reverse();
  const descendants = tree.descendants || [];
  const showUp = mode !== 'descendants';
  const showDown = mode !== 'ancestors';
  const items = [];
  if (showUp) ancestorsTopFirst.forEach((n, j) => items.push({ n, above: j > 0 ? ancestorsTopFirst[j - 1].link_status : null }));
  items.push({ n: me, above: showUp && ancestorsTopFirst.length ? ancestorsTopFirst[ancestorsTopFirst.length - 1].link_status : null, me: true });
  if (showDown) descendants.forEach(n => items.push({ n, above: n.link_status, desc: true }));

  const gaps = gapsState.gaps;
  const upSlot = ownTree && showUp && gaps ? (gaps.up || []).find(s => s.state === 'missing') : null;
  const downSlot = ownTree && showDown && gaps ? (gaps.down || []).find(s => s.state === 'missing') : null;
  const ghostSlotFor = (node) => {
    const found = gaps && (gaps.up || []).find(s => s.node && s.node.user_id === node.user_id);
    return found || { distance: node.distance, term: node.term || node.relation, state: 'ghost', node, best_inviters: [] };
  };
  const unconfirmedCount = items.filter(i => i.n.link_status && i.n.link_status !== 'confirmed').length;

  return (
    <AlumniLayout>
      <div className="al-page al-fade-in" data-testid="alumni-tree-page">
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 18, gap: 14, flexWrap: 'wrap' }}>
          <div>
            <div className="al-eyebrow" style={{ marginBottom: 6 }}>{ownTree ? 'สายเทคของคุณ' : 'สายเทคของ'}</div>
            <h1 className="al-h-section" style={{ fontSize: 'clamp(26px, 6vw, 36px)' }} data-testid="tree-title">
              {ownTree ? 'สายเทค MKT SWU' : shortName(me)}
            </h1>
            <div className="al-small al-muted" style={{ marginTop: 4 }}>
              {tree.total} คนในสายที่รู้จัก {tree.max_ancestor_gen ? `· ยาวถึงรุ่น ${tree.max_ancestor_gen}` : ''}
            </div>
          </div>
          {ownTree && (
            <button className="al-btn al-btn-primary al-btn-sm" onClick={() => setAddOpen(true)} data-testid="tree-mark-btn">
              <Icon name="plus" size={14} /> เพิ่มคนในสาย
            </button>
          )}
        </div>

        {ownTree && pending.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <PendingClaims token={token} pending={pending} toast={toast.show} onAnswered={refreshAll} />
          </div>
        )}

        {ownTree && (
          <div className="al-tabs al-tabs-scroll" style={{ marginBottom: 20 }} role="tablist" data-testid="tree-tabs">
            {TABS.map(t => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''}
                onClick={() => setTab(t.id)} data-testid={`tree-tab-${t.id}`}>{t.label}</button>
            ))}
          </div>
        )}

        {tab === 'confirm' && (
          <div style={{ maxWidth: 640, margin: '0 auto', display: 'grid', gap: 16 }} data-testid="tab-confirm">
            <div>
              <h2 className="al-h-section" style={{ fontSize: 24 }}>ช่วยยืนยันสาย</h2>
              <p className="al-small al-muted" style={{ margin: '4px 0 0' }}>
                ยังไม่มีรายชื่อทางการว่าใครเป็นพี่เทคของใคร สายนี้สร้างจากพวกเรากันเอง ถ้าคุณรู้จักสองคนนี้ ช่วยตอบสั้น ๆ หน่อย
              </p>
            </div>
            <GhostClaimApprovals token={token} toast={toast.show} onChanged={refreshAll} />
            <VouchQueue token={token} toast={toast.show} onChanged={refreshAll} />
            <StatusLegend />
          </div>
        )}

        {tab === 'rank' && (
          <div style={{ maxWidth: 720, margin: '0 auto' }} data-testid="tab-rank">
            <Leaderboards token={token} />
          </div>
        )}

        {tab === 'meetup' && (
          <div style={{ maxWidth: 720, margin: '0 auto' }} data-testid="tab-meetup">
            <Meetups token={token} toast={toast.show} />
          </div>
        )}

        {tab === 'line' && (
          <>
            <div className="al-tabs" style={{ marginBottom: 20 }}>
              {[
                { id: 'ancestors', label: `สายขึ้น (${tree.ancestors?.length || 0})`, icon: 'arrow-up-right' },
                { id: 'descendants', label: `สายลง (${descendants.length})`, icon: 'arrow-right' },
                { id: 'all', label: 'ทั้งหมด', icon: 'users' },
              ].map(t => (
                <button key={t.id} className={mode === t.id ? 'active' : ''} onClick={() => setMode(t.id)} data-testid={`tree-mode-${t.id}`}>
                  <Icon name={t.icon} size={14} style={{ marginRight: 6, verticalAlign: '-2px' }} />{t.label}
                </button>
              ))}
            </div>

            <div className="al-tree-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 20 }}>
              <div className="al-tree-canvas" style={{ padding: '24px 16px', minHeight: 420 }} data-testid="tree-canvas">
                {ownTree && gapsState.error && (
                  <div className="al-small" role="alert" style={{ color: 'var(--al-red-ink)', marginBottom: 12 }} data-testid="gaps-error">
                    {gapsState.error} <button className="al-btn al-btn-ghost al-btn-sm" onClick={gapsState.reload}>ลองใหม่</button>
                  </div>
                )}
                {upSlot && (
                  <>
                    <GapSlot slot={upSlot} onClick={() => setGapSlot(upSlot)} />
                    <Edge gap />
                  </>
                )}
                {items.length === 1 && !upSlot && !downSlot && !gapsState.loading && (
                  <div style={{ textAlign: 'center', padding: '10px 0 20px', color: 'var(--al-mute)' }} data-testid="tree-empty">
                    ยังไม่มีใครในสายของคุณ เริ่มจากเพิ่มพี่เทคของคุณเลย
                  </div>
                )}
                <div>
                  {items.map((it, i) => (
                    <div key={`${it.n.user_id}-${i}`}>
                      {i > 0 && <Edge status={it.above} />}
                      <TreeNode person={it.n} isMe={!!it.me} isDesc={!!it.desc} onClick={() => setSelected(it.me ? { ...it.n, isMe: true } : it.n)} />
                      {ownTree && it.n.is_ghost && !it.me && (
                        <div style={{ margin: '8px 0 0 30px' }}>
                          <button className="al-btn al-btn-red al-btn-sm" onClick={() => setGapSlot(ghostSlotFor(it.n))} data-testid={`ghost-invite-${it.n.user_id}`}>
                            <Icon name="share" size={12} /> ชวน {shortName(it.n)} เข้าสาย
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {downSlot && (
                  <>
                    <Edge gap />
                    <GapSlot slot={downSlot} down onClick={() => setGapSlot(downSlot)} />
                  </>
                )}
                {ownTree && gapsState.loading && !gaps && <div className="al-tiny al-muted" style={{ marginTop: 12 }}>กำลังดูช่องว่างของสาย...</div>}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {selected ? (
                  <PersonPanel person={selected} isMe={!!selected.isMe} onClose={() => setSelected(null)} token={token}
                    canEdit ownTree={ownTree} toast={toast.show} onChanged={refreshAll}
                    onInviteGhost={(p) => setGapSlot(ghostSlotFor(p))} onHistory={setHistory} />
                ) : (
                  <div className="al-card al-card-pad">
                    <div className="al-eyebrow" style={{ marginBottom: 10 }}>ตัวช่วย</div>
                    <h3 className="al-h-card" style={{ marginBottom: 8 }}>แตะที่คนในสายเพื่อดูรายละเอียด</h3>
                    <p className="al-small al-muted" style={{ margin: 0 }}>
                      เส้นเชื่อมบอกว่าความสัมพันธ์นั้นแน่นแค่ไหน {unconfirmedCount > 0 ? `ตอนนี้มี ${unconfirmedCount} เส้นที่ยังรอยืนยัน` : ''}
                    </p>
                  </div>
                )}
                {ownTree && <GhostClaimApprovals token={token} toast={toast.show} onChanged={refreshAll} />}
                {ownTree && unconfirmedCount > 0 && (
                  <button className="al-btn al-btn-outline al-btn-block" onClick={() => setTab('confirm')} data-testid="goto-confirm-btn">
                    ช่วยยืนยันสายของเพื่อน <Icon name="arrow-right" size={14} />
                  </button>
                )}
                <StatusLegend />
                <div className="al-card al-card-pad">
                  <div className="al-eyebrow" style={{ marginBottom: 12 }}>สถิติสายเทค</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div><div className="al-tabular" style={{ fontSize: 22, fontWeight: 700 }}>{tree.total}</div><div className="al-tiny al-muted">คนในสาย</div></div>
                    <div><div className="al-tabular" style={{ fontSize: 22, fontWeight: 700, color: 'var(--al-red)' }}>{tree.ancestors?.length || 0} ขั้น</div><div className="al-tiny al-muted">สายขึ้น</div></div>
                    <div><div className="al-tabular" style={{ fontSize: 22, fontWeight: 700 }}>{descendants.length}</div><div className="al-tiny al-muted">น้องในสาย</div></div>
                    <div><div className="al-tabular" style={{ fontSize: 22, fontWeight: 700, color: 'var(--al-blue)' }}>{me.gen || '-'}</div><div className="al-tiny al-muted">รุ่นคุณ</div></div>
                  </div>
                </div>

                {ownTree && throwback.length > 0 && (
                  <div className="al-card al-card-pad" data-testid="throwback-widget">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div className="al-eyebrow">📸 Throwback · ขำเล่น</div>
                      <button className="al-btn al-btn-ghost al-btn-sm" onClick={loadThrowback} data-testid="throwback-refresh-btn">
                        <Icon name="sparkles" size={12} /> สุ่มใหม่
                      </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      {throwback.map(t => (
                        <div key={t.user_id} data-testid={`throwback-card-${t.user_id}`} style={{ padding: 12, background: 'var(--al-paper-2)', borderRadius: 12, textAlign: 'center' }}>
                          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}><Avatar name={t.name} hue={t.avatar_hue || 210} size="lg" src={t.avatar_url} /></div>
                          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{t.nickname || t.name}</div>
                          <div className="al-tiny al-muted" style={{ marginBottom: 4 }}>รุ่น {t.gen}</div>
                          <div className="al-tiny" style={{ fontStyle: 'italic', color: 'var(--al-ink-2)', lineHeight: 1.3 }}>"{t.caption}"</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <ActivityStream token={token} scope="tree" limit={10} compact title="ความเคลื่อนไหวของสาย" />
              </div>
            </div>
          </>
        )}

        {addOpen && <AddPersonModal token={token} me={me} toast={toast.show} onClose={() => setAddOpen(false)} onDone={() => { setAddOpen(false); refreshAll(); }} />}
        {gapSlot && (
          <GapPanel slot={gapSlot} me={me} attachNode={attachNodeFor(gaps, gapSlot, me)} token={token}
            userName={user.full_name?.split(' ')[0]} toast={toast.show}
            onClose={(ch) => { setGapSlot(null); if (ch) refreshAll(); }} />
        )}
        {history && <HistoryModal relationId={history} token={token} onClose={() => setHistory(null)} />}
        {toast.node}
      </div>
    </AlumniLayout>
  );
};

export default AlumniTreePage;
