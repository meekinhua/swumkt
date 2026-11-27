import React, { useCallback, useEffect, useState } from 'react';
import { Avatar, Icon } from './AlumniUI';
import { api, errMsg, errCode, shortName } from './alumniApi';
import { StatusBadge, HistoryModal } from './LineKit';

const PersonMini = ({ p, role }) => (
  <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
      <Avatar name={p.name} hue={p.avatar_hue || 200} size="lg" src={p.avatar_url} />
    </div>
    <div style={{ fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis' }}>{shortName(p)}</div>
    <div className="al-tiny al-muted">รุ่น {p.gen}{p.is_ghost ? ' · ยังไม่ลงทะเบียน' : ''}</div>
    <span className={`al-tag ${role === 'senior' ? 'red' : 'blue'}`} style={{ marginTop: 6 }}>{role === 'senior' ? 'พี่เทค' : 'น้องเทค'}</span>
  </div>
);

// ---------- claims where I am one end: my answer outranks every vote ----------
export const PendingClaims = ({ token, pending, onAnswered, toast, compact = false }) => {
  const [busy, setBusy] = useState(null);
  const [history, setHistory] = useState(null);
  if (!pending || pending.length === 0) return null;

  const answer = async (rel, accept) => {
    setBusy(rel.id);
    try {
      await api.put(token, `/alumni/relations/${rel.id}/respond`, { accept });
      toast(accept ? 'ยืนยันแล้ว สายเชื่อมกันเรียบร้อย' : 'ปฏิเสธแล้ว');
      onAnswered && onAnswered();
    } catch (e) { toast(errMsg(e, 'ตอบไม่สำเร็จ')); }
    finally { setBusy(null); }
  };

  return (
    <div className="al-card al-card-pad" data-testid="tree-pending-list"
      style={{ border: '2px solid var(--al-red)', background: 'var(--al-card)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 }}>
        <div>
          <div className="al-eyebrow" style={{ color: 'var(--al-red-ink)' }}>รอคุณตอบ · {pending.length} เรื่อง</div>
          {!compact && <div className="al-tiny al-muted" style={{ marginTop: 2 }}>คำตอบของคุณมีน้ำหนักมากกว่าโหวตของเพื่อนเสมอ</div>}
        </div>
        <span className="al-tag red">ใหม่</span>
      </div>
      {pending.map(p => {
        const o = p.other_profile || p.from_profile || {};
        const meIsSenior = p.my_role === 'senior';
        return (
          <div key={p.id} style={{ padding: '12px 0', borderTop: '1px solid var(--al-line)' }} data-testid={`pending-item-${p.id}`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <Avatar name={o.name || '?'} hue={o.avatar_hue || 200} size="md" src={o.avatar_url} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, lineHeight: 1.4 }}>
                  <b>{p.claimed_by?.nickname || shortName(o)}</b> บอกว่า
                  {meIsSenior
                    ? <> คุณเป็น<b>พี่เทค</b>ของ <b>{shortName(o)}</b> (รุ่น {o.gen}) ใช่ไหม?</>
                    : <> <b>{shortName(o)}</b> (รุ่น {o.gen}) เป็น<b>พี่เทค</b>ของคุณ ใช่ไหม?</>}
                </div>
                <div className="al-tiny al-muted">ถ้าตอบว่าใช่ {shortName(o)} จะเป็น{p.term || 'คนในสาย'}ของคุณ</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="al-btn al-btn-red al-btn-sm" disabled={busy === p.id} onClick={() => answer(p, true)}
                data-testid={`pending-accept-${p.id}`}><Icon name="check" size={12} /> ใช่ ยืนยัน</button>
              <button className="al-btn al-btn-outline al-btn-sm" disabled={busy === p.id} onClick={() => answer(p, false)}
                data-testid={`pending-reject-${p.id}`}>ไม่ใช่</button>
              <button className="al-btn al-btn-ghost al-btn-sm" onClick={() => setHistory(p.id)}>ดูประวัติ</button>
            </div>
          </div>
        );
      })}
      {history && <HistoryModal relationId={history} token={token} onClose={() => setHistory(null)} />}
    </div>
  );
};

// ---------- ghost-claim approvals ("นี่คือฉัน" requests) ----------
export const GhostClaimApprovals = ({ token, toast, onChanged }) => {
  const [claims, setClaims] = useState([]);
  const [busy, setBusy] = useState(null);
  const load = useCallback(() => {
    api.get(token, '/alumni/ghost-claims/pending').then(r => setClaims(r.data.claims || [])).catch(() => {});
  }, [token]);
  useEffect(() => { load(); }, [load]);
  if (claims.length === 0) return null;

  const decide = async (c, approve) => {
    setBusy(c.id);
    try {
      await api.post(token, `/alumni/ghost-claims/${c.id}/decide`, { approve });
      toast(approve ? 'อนุมัติแล้ว เขารับสายต่อเรียบร้อย' : 'ปฏิเสธคำขอแล้ว');
      load(); onChanged && onChanged();
    } catch (e) { toast(errMsg(e, 'ทำรายการไม่สำเร็จ')); }
    finally { setBusy(null); }
  };

  return (
    <div className="al-card al-card-pad" data-testid="ghost-claims-card">
      <div className="al-eyebrow" style={{ marginBottom: 10 }}>มีคนขอรับสายต่อ · {claims.length}</div>
      {claims.map(c => (
        <div key={c.id} style={{ padding: '10px 0', borderTop: '1px solid var(--al-line)' }} data-testid={`ghost-claim-${c.id}`}>
          <div className="al-small" style={{ marginBottom: 8, lineHeight: 1.5 }}>
            <b>{c.claimant?.nickname || c.claimant?.name}</b> (รุ่น {c.claimant?.gen}) บอกว่าตัวเองคือ <b>"{c.ghost?.name}"</b> (รุ่น {c.ghost?.gen}) ที่ถูกเพิ่มไว้ในสาย
            <div className="al-tiny al-muted">ถ้าคุณรู้จัก ช่วยตอบหน่อยว่าใช่ไหม</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="al-btn al-btn-red al-btn-sm" disabled={busy === c.id} onClick={() => decide(c, true)} data-testid={`ghost-claim-approve-${c.id}`}>ใช่ คนนี้แหละ</button>
            <button className="al-btn al-btn-outline al-btn-sm" disabled={busy === c.id} onClick={() => decide(c, false)}>ไม่ใช่</button>
          </div>
        </div>
      ))}
    </div>
  );
};

// ---------- "ช่วยยืนยันสาย": one card at a time ----------
export const VouchQueue = ({ token, toast, onChanged }) => {
  const [prompts, setPrompts] = useState(null);
  const [error, setError] = useState(null);
  const [idx, setIdx] = useState(0);
  const [helped, setHelped] = useState(0);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(null);
  const [shake, setShake] = useState(0);

  const load = useCallback(async () => {
    setPrompts(null); setError(null);
    try {
      const r = await api.get(token, '/alumni/vouch/prompts', { limit: 20 });
      setPrompts(r.data.prompts || []); setIdx(0);
    } catch (e) { setError(errMsg(e, 'โหลดคำถามไม่สำเร็จ')); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  if (error) return (
    <div className="al-card al-card-pad" data-testid="vouch-error">
      <div role="alert" className="al-small" style={{ color: 'var(--al-red-ink)', marginBottom: 10 }}>{error}</div>
      <button className="al-btn al-btn-outline al-btn-sm" onClick={load}>ลองใหม่</button>
    </div>
  );
  if (!prompts) return <div className="al-card al-card-pad al-muted al-small" data-testid="vouch-loading">กำลังหาสายที่ต้องการเพื่อนช่วย...</div>;

  const cur = prompts[idx];
  if (!cur) {
    return (
      <div className="al-card al-card-pad" style={{ textAlign: 'center', padding: 36 }} data-testid="vouch-empty">
        <div style={{ fontSize: 44, marginBottom: 8 }}>🙌</div>
        <h3 className="al-h-card" style={{ marginBottom: 6 }}>{helped > 0 ? `ช่วยยืนยันแล้ว ${helped} เรื่อง ขอบคุณมาก!` : 'ตอนนี้ยังไม่มีสายที่ต้องการให้ช่วย'}</h3>
        <p className="al-small al-muted" style={{ margin: '0 0 16px' }}>
          เมื่อมีคนบอกว่าใครเป็นพี่เทคของใคร และคุณอยู่ใกล้ ๆ สายนั้น คำถามจะมาโผล่ที่นี่
        </p>
        <button className="al-btn al-btn-outline" onClick={load} data-testid="vouch-reload-btn">ตรวจดูอีกครั้ง</button>
      </div>
    );
  }

  const rel = cur.relation;
  const disputed = cur.status === 'disputed' || rel?.status === 'disputed';
  const needed = cur.votes?.needed || 2;
  const advance = () => setIdx(i => i + 1);

  const vote = async (v) => {
    setBusy(true);
    try {
      await api.post(token, `/alumni/relations/${rel.id}/vouch`, { vote: v });
      toast(`ขอบคุณที่ช่วยยืนยัน · ได้ XP เล็กน้อย (+3 XP ใน 10 โหวตแรกของวัน)`);
      setHelped(h => h + 1);
      advance(); onChanged && onChanged();
    } catch (e) {
      const code = errCode(e);
      toast(errMsg(e, 'โหวตไม่สำเร็จ'));
      if (code === 'decided' || code === 'not_eligible') advance();
      else setShake(s => s + 1);
    } finally { setBusy(false); }
  };

  return (
    <div data-testid="vouch-queue">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }} className="al-small al-muted">
        <span>คำถามที่ {Math.min(idx + 1, prompts.length)} จาก {prompts.length}</span>
        <span>ช่วยแล้ว {helped}</span>
      </div>
      <div className="al-progress" style={{ marginBottom: 14 }}><div style={{ width: `${(idx / prompts.length) * 100}%` }} /></div>

      <div key={`${rel.id}-${shake}`} className={`al-card al-fade-in ${shake ? 'al-shake' : ''}`} data-testid="vouch-card"
        style={{ padding: 24, borderColor: disputed ? 'var(--al-red)' : undefined, borderWidth: disputed ? 2 : 1 }}>
        {disputed && (
          <div style={{ background: 'var(--al-red)', color: 'white', margin: '-24px -24px 16px', padding: '8px 24px', borderRadius: '20px 20px 0 0', fontWeight: 700, fontSize: 14 }}
            data-testid="vouch-disputed-header">
            ⚖️ ช่วยตัดสิน · สายนี้ข้อมูลขัดกัน
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <PersonMini p={cur.junior} role="junior" />
          <div style={{ color: 'var(--al-mute)', textAlign: 'center', fontSize: 12 }}>
            <Icon name="arrow-right" size={18} /><div>ตามพี่</div>
          </div>
          <PersonMini p={cur.senior} role="senior" />
        </div>
        <h3 className="al-h-card" style={{ fontSize: 20, textAlign: 'center', marginBottom: 6 }} data-testid="vouch-question">
          {cur.senior.nickname || cur.senior.name} รุ่น {cur.senior.gen} เป็นพี่เทคของ {cur.junior.nickname || cur.junior.name} รุ่น {cur.junior.gen} ใช่ไหม?
        </h3>
        <div className="al-tiny al-muted" style={{ textAlign: 'center', marginBottom: 14 }}>
          {cur.claimed_by ? `${cur.claimed_by.nickname} เป็นคนบอกไว้` : ''}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          <StatusBadge status={cur.status} />
          <span className="al-small al-muted" data-testid="vouch-progress">รับรองแล้ว {cur.votes?.yes || 0}/{needed}</span>
        </div>
        <div className="al-meter" style={{ margin: '0 auto 18px', maxWidth: 260 }}><div style={{ width: `${Math.min(100, ((cur.votes?.yes || 0) / needed) * 100)}%` }} /></div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <button className="al-btn al-btn-red al-btn-block" disabled={busy} onClick={() => vote('yes')} data-testid="vouch-yes-btn">ใช่</button>
          <button className="al-btn al-btn-outline al-btn-block" disabled={busy} onClick={() => vote('no')} data-testid="vouch-no-btn">ไม่ใช่</button>
          <button className="al-btn al-btn-ghost al-btn-block" disabled={busy} onClick={advance} data-testid="vouch-skip-btn">ไม่รู้</button>
        </div>
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button className="al-btn al-btn-ghost al-btn-sm" onClick={() => setHistory(rel.id)} data-testid="vouch-history-btn">ดูประวัติของความสัมพันธ์นี้</button>
        </div>
      </div>
      <p className="al-tiny al-muted" style={{ textAlign: 'center', marginTop: 10 }}>
        ตอบเฉพาะเรื่องที่คุณรู้จริง ๆ · ถ้าไม่แน่ใจกด "ไม่รู้" ได้เลย
      </p>
      {history && <HistoryModal relationId={history} token={token} onClose={() => setHistory(null)} />}
    </div>
  );
};
