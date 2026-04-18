import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import { Avatar, Chip, Icon, Modal, useToast } from './AlumniUI';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const InviteModal = ({ open, onClose, token, currentUser }) => {
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(false);
  const [inviteeName, setInviteeName] = useState('');
  const [relationHint, setRelationHint] = useState('น้อง take');
  const toast = useToast();

  useEffect(() => {
    if (open && !invite) {
      createInvite();
    }
    // eslint-disable-next-line
  }, [open]);

  const createInvite = async () => {
    setLoading(true);
    try {
      const r = await axios.post(`${API}/alumni/invites`, {
        invitee_name: inviteeName || null,
        relation_hint: relationHint,
      }, { headers: { Authorization: `Bearer ${token}` } });
      setInvite(r.data);
    } catch {
      toast.show('สร้างลิงก์เชิญไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  const shareUrl = invite ? `${window.location.origin}${invite.share_url}` : '';
  const inviterName = currentUser?.full_name?.split(' ')[0] || 'เพื่อน';
  const lineShareText = encodeURIComponent(`${inviterName} ชวนคุณเข้าสู่สายตระกูล MKT SWU 🌳 ลงทะเบียนเลย: ${shareUrl}`);
  const lineUrl = `https://line.me/R/msg/text/?${lineShareText}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.show('คัดลอกลิงก์แล้ว');
    } catch {
      toast.show('คัดลอกไม่สำเร็จ · ลองกด long-press');
    }
  };

  const handleDownloadQR = () => {
    const svg = document.getElementById('invite-qr-svg');
    if (!svg) return;
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svg);
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invite-${invite.code}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal onClose={onClose}>
      <div data-testid="invite-modal">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div className="al-eyebrow" style={{ marginBottom: 6 }}>· เชิญเข้าสายตระกูล ·</div>
            <h3 className="al-h-card" style={{ fontSize: 22, marginBottom: 4 }}>ชวน 3 คน · ปลดล็อค Badge "ผู้ก่อร่าง" 🌳</h3>
            <p className="al-small al-muted" style={{ margin: 0 }}>
              เมื่อเพื่อนสมัครผ่านลิงก์นี้ ระบบจะ auto-mark เป็นน้อง take ให้
            </p>
          </div>
          <button className="al-iconbtn" onClick={onClose} data-testid="invite-modal-close-btn"><Icon name="x" /></button>
        </div>

        {loading && <div className="al-muted" style={{ padding: 40, textAlign: 'center' }}>กำลังสร้างลิงก์...</div>}

        {invite && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 20, alignItems: 'center', marginBottom: 20 }}>
              <div style={{ padding: 12, background: 'white', borderRadius: 12, border: '1px solid var(--al-line)' }}>
                <QRCodeSVG id="invite-qr-svg" value={shareUrl} size={140} level="M" includeMargin={false} />
              </div>
              <div>
                <div className="al-eyebrow" style={{ marginBottom: 6 }}>ลิงก์แชร์</div>
                <div className="al-mono" style={{
                  padding: '10px 12px', background: 'var(--al-paper-2)', borderRadius: 10,
                  fontSize: 12, wordBreak: 'break-all', marginBottom: 10,
                }} data-testid="invite-share-url">
                  {shareUrl}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="al-btn al-btn-primary al-btn-sm" onClick={handleCopy} data-testid="invite-copy-btn">
                    <Icon name="link" size={12} /> คัดลอกลิงก์
                  </button>
                  <a className="al-btn al-btn-outline al-btn-sm" href={lineUrl} target="_blank" rel="noopener noreferrer" data-testid="invite-line-share-btn">
                    <Icon name="share" size={12} /> แชร์ผ่าน LINE
                  </a>
                  <button className="al-btn al-btn-outline al-btn-sm" onClick={handleDownloadQR} data-testid="invite-download-qr-btn">
                    <Icon name="qr" size={12} /> ดาวน์โหลด QR
                  </button>
                </div>
              </div>
            </div>

            <div style={{ padding: 14, background: 'var(--al-blue-soft)', borderRadius: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 13, marginBottom: 6 }}>💡 <strong>Tip:</strong> ทุกคนที่สมัครผ่านลิงก์นี้ = <strong>+100 XP</strong> ให้คุณ</div>
              <div className="al-tiny al-muted">ชวนครบ 3 คน → Badge 🌳 | 10 คน → Badge 👑 นายก๊ก</div>
            </div>

            <div className="al-eyebrow" style={{ marginBottom: 8 }}>เพิ่มชื่อ/ข้อความเฉพาะ (optional)</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <input value={inviteeName} onChange={e => setInviteeName(e.target.value)}
                placeholder="ชื่อคนที่จะชวน (เผื่อ track)"
                style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid var(--al-line-2)', background: 'var(--al-paper)' }}
                data-testid="invite-name-input"
              />
              <select value={relationHint} onChange={e => setRelationHint(e.target.value)}
                style={{ padding: 10, borderRadius: 8, border: '1px solid var(--al-line-2)', background: 'var(--al-paper)' }}
                data-testid="invite-relation-hint-select"
              >
                <option value="น้อง take">น้อง take</option>
                <option value="พี่ take">พี่ take</option>
                <option value="เพื่อนรุ่น">เพื่อนรุ่น</option>
              </select>
              <button className="al-btn al-btn-outline" onClick={() => { setInvite(null); createInvite(); }}
                data-testid="invite-new-btn">
                ลิงก์ใหม่
              </button>
            </div>
          </>
        )}

        {toast.node}
      </div>
    </Modal>
  );
};

export default InviteModal;
