import React, { useState, useEffect } from 'react';
import { Icon, Modal, useToast } from './AlumniUI';
import { api, errMsg } from './alumniApi';
import { SharePanel } from './LineKit';

const InviteModal = ({ open, onClose, token, currentUser }) => {
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [inviteeName, setInviteeName] = useState('');
  const [relationHint, setRelationHint] = useState('น้องเทค');
  const [reveal, setReveal] = useState(true);
  const [clue, setClue] = useState('');
  const toast = useToast();

  const createInvite = async () => {
    setLoading(true); setErr(null);
    try {
      const r = await api.post(token, '/alumni/invites', {
        invitee_name: inviteeName || null,
        relation_hint: relationHint,
        reveal_game: reveal,
        clue: reveal && clue ? clue : null,
      });
      setInvite(r.data);
    } catch (e) {
      setErr(errMsg(e, 'สร้างลิงก์เชิญไม่สำเร็จ'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && !invite) createInvite();
    // eslint-disable-next-line
  }, [open]);

  if (!open) return null;
  const inviterName = currentUser?.full_name?.split(' ')[0] || 'เพื่อน';

  return (
    <Modal onClose={onClose}>
      <div data-testid="invite-modal">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12, gap: 8 }}>
          <div>
            <div className="al-eyebrow" style={{ marginBottom: 6 }}>· ชวนเข้าสายเทค ·</div>
            <h3 className="al-h-card" style={{ fontSize: 22, marginBottom: 4 }}>ชวนเพื่อน พี่ หรือน้อง มาต่อสาย 🌳</h3>
            <p className="al-small al-muted" style={{ margin: 0 }}>
              ส่งลิงก์ทาง LINE ได้เลย ชวนครบ 5 คนได้ Badge "ผู้ก่อร่าง" และครบ 10 คนได้ "นายก๊ก"
            </p>
          </div>
          <button className="al-iconbtn" onClick={onClose} aria-label="ปิด" data-testid="invite-modal-close-btn"><Icon name="x" /></button>
        </div>

        {loading && <div className="al-muted" style={{ padding: 30, textAlign: 'center' }}>กำลังสร้างลิงก์...</div>}
        {err && <div role="alert" className="al-small" style={{ color: 'var(--al-red-ink)', marginBottom: 10 }} data-testid="invite-modal-error">{err}</div>}

        {invite && !loading && (
          <div style={{ marginBottom: 16 }}>
            <SharePanel invite={invite} revealGame={!!invite.reveal_game} inviterName={inviterName} onToast={toast.show}
              ids={{ url: 'invite-share-url', copy: 'invite-copy-btn', line: 'invite-line-share-btn', native: 'invite-native-share-btn' }} />
          </div>
        )}

        <div className="al-eyebrow" style={{ marginBottom: 8 }}>ปรับลิงก์ (ไม่บังคับ)</div>
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input className="al-input" style={{ flex: '1 1 160px' }} value={inviteeName} onChange={e => setInviteeName(e.target.value)}
              aria-label="ชื่อคนที่จะชวน" placeholder="ชื่อคนที่จะชวน (เผื่อจำ)" data-testid="invite-name-input" />
            <select className="al-input" style={{ flex: '0 1 150px' }} value={relationHint} onChange={e => setRelationHint(e.target.value)}
              aria-label="เขาเป็นอะไรของคุณ" data-testid="invite-relation-hint-select">
              <option value="น้องเทค">เป็นน้องเทค</option>
              <option value="พี่เทค">เป็นพี่เทค</option>
              <option value="เพื่อนรุ่น">เพื่อนรุ่น</option>
            </select>
          </div>
          <label className="al-small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={reveal} onChange={e => setReveal(e.target.checked)} data-testid="invite-reveal-toggle" />
            เล่นเกม "เฉลยสาย" (ให้ปลายทางทายก่อนว่าใครชวน)
          </label>
          {reveal && (
            <input className="al-input" maxLength={140} value={clue} onChange={e => setClue(e.target.value)}
              aria-label="คำใบ้" placeholder="ใบ้ให้หน่อย เช่น คนที่เคยพาไปกินหมูกระทะ" data-testid="invite-clue-input" />
          )}
          <button className="al-btn al-btn-outline" onClick={() => { setInvite(null); createInvite(); }} disabled={loading} data-testid="invite-new-btn">
            สร้างลิงก์ใหม่ตามที่ตั้งไว้
          </button>
        </div>
        {toast.node}
      </div>
    </Modal>
  );
};

export default InviteModal;
