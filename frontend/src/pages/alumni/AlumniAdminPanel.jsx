import React, { useCallback, useEffect, useState } from 'react';
import { api, errMsg } from './alumniApi';

const Section = ({ title, children, testId }) => (
  <details className="al-card al-card-pad" data-testid={testId}>
    <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{title}</summary>
    <div style={{ marginTop: 14 }}>{children}</div>
  </details>
);

const Funnel = ({ token }) => {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    api.get(token, '/alumni/admin/invite-funnel').then(r => setD(r.data)).catch(e => setErr(errMsg(e)));
  }, [token]);
  if (err) return <div role="alert" className="al-small" style={{ color: 'var(--al-red-ink)' }}>{err}</div>;
  if (!d) return <div className="al-small al-muted">กำลังโหลด...</div>;
  const pc = (x) => `${Math.round((x || 0) * 100)}%`;
  const rows = [
    ['ลิงก์ที่ส่ง', d.invites_sent], ['เปิดดู', `${d.invites_opened} (${pc(d.open_rate)})`],
    ['สมัครแล้ว', `${d.invites_accepted} (${pc(d.conversion)})`], ['คนที่ชวน', d.inviters],
    ['ผู้ถูกชวนที่ไปชวนต่อ', `${d.invitees_who_invited} (${pc(d.next_level_rate)})`],
    ['K-factor', (d.k_factor ?? 0).toFixed(2)], ['สมาชิกทั้งหมด', d.members],
    ['ลิงก์ชวนแทนคนที่ยังไม่มา', d.ghost_invites_sent], ['รับสายต่อแล้ว', d.ghosts_claimed], ['รอเจ้าตัว', d.ghosts_active],
  ];
  return (
    <div data-testid="admin-funnel">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ padding: 10, background: 'var(--al-paper-2)', borderRadius: 10 }}>
            <div className="al-tiny al-muted">{k}</div><div style={{ fontWeight: 700, fontSize: 18 }}>{v}</div>
          </div>
        ))}
      </div>
      {(d.members_by_invite_depth || []).length > 0 && (
        <div className="al-small al-muted" style={{ marginTop: 10 }}>
          สมาชิกตามชั้นของการชวน: {d.members_by_invite_depth.map(x => `ชั้น ${x.depth}: ${x.members}`).join(' · ')}
        </div>
      )}
    </div>
  );
};

const Kinship = ({ token, toast }) => {
  const [ladder, setLadder] = useState(null);
  const [edits, setEdits] = useState({});
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    api.get(token, '/alumni/kinship/settings').then(r => { setLadder(r.data.ladder || []); setEdits({}); }).catch(e => toast(errMsg(e)));
  }, [token, toast]);
  useEffect(() => { load(); }, [load]);
  if (!ladder) return <div className="al-small al-muted">กำลังโหลด...</div>;

  const setCell = (dist, g, v) => setEdits(e => ({ ...e, [`${dist}:${g}`]: v }));
  const val = (row, g) => (edits[`${row.distance}:${g}`] ?? row[g] ?? '');
  const save = async () => {
    const body = { up: {}, down: {} };
    Object.entries(edits).forEach(([k, v]) => {
      const [dist, g] = k.split(':'); const n = parseInt(dist, 10);
      const side = n > 0 ? body.up : body.down; const key = String(Math.abs(n));
      side[key] = { ...(side[key] || {}), [g]: v.trim() || null };
    });
    setBusy(true);
    try { await api.put(token, '/alumni/kinship/settings', body); toast('บันทึกคำเรียกแล้ว'); load(); }
    catch (e) { toast(errMsg(e, 'บันทึกไม่สำเร็จ')); }
    finally { setBusy(false); }
  };
  return (
    <div data-testid="admin-kinship">
      <div className="al-small al-muted" style={{ marginBottom: 10 }}>แก้คำเรียกตามระยะในสาย (ชาย / หญิง / ไม่ระบุ) แถวที่เป็นคำสำรองแก้ไม่ได้</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr className="al-tiny al-muted" style={{ textAlign: 'left' }}><th>ระยะ</th><th>ชาย</th><th>หญิง</th><th>ไม่ระบุ</th></tr></thead>
          <tbody>
            {ladder.filter(r => !r.is_fallback).map(r => (
              <tr key={r.distance}>
                <td style={{ padding: '4px 8px 4px 0' }}>{r.distance > 0 ? `+${r.distance}` : r.distance}{r.unverified ? ' *' : ''}</td>
                {['m', 'f', 'u'].map(g => (
                  <td key={g} style={{ padding: 3 }}>
                    <input className="al-input" style={{ padding: '6px 8px', fontSize: 13 }} value={val(r, g)}
                      aria-label={`คำเรียกระยะ ${r.distance} (${g})`} onChange={e => setCell(r.distance, g, e.target.value)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="al-tiny al-muted" style={{ margin: '8px 0' }}>* คำที่ยังไม่ยืนยันว่าใช้จริงใน มศว</div>
      <button className="al-btn al-btn-red al-btn-sm" onClick={save} disabled={busy || Object.keys(edits).length === 0} data-testid="admin-kinship-save">บันทึก</button>
    </div>
  );
};

const BLANK = { id: '', title: '', description: '', link: '', audience: 'all', interest_key: '', icon: 'star', order: 100, active: true };

const BenefitsEditor = ({ token, toast }) => {
  const [cards, setCards] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get(token, '/alumni/benefits').then(r => setCards(r.data.cards.map(c => ({ ...c, interest_key: c.interest_key || '', link: c.link || '' })))).catch(e => toast(errMsg(e)));
  }, [token, toast]);
  if (!cards) return <div className="al-small al-muted">กำลังโหลด...</div>;
  const upd = (i, k, v) => setCards(cs => cs.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
  const save = async () => {
    setBusy(true);
    try {
      const payload = cards.map(c => ({
        ...c, id: c.id || `card-${Math.random().toString(36).slice(2, 8)}`,
        link: c.link || null, interest_key: c.interest_key || null, order: Number(c.order) || 0,
      }));
      payload.forEach(p => { delete p.my_interest; });
      await api.put(token, '/alumni/benefits', { cards: payload });
      toast('บันทึกการ์ดแล้ว');
    } catch (e) { toast(errMsg(e, 'บันทึกไม่สำเร็จ')); }
    finally { setBusy(false); }
  };
  return (
    <div data-testid="admin-benefits" style={{ display: 'grid', gap: 12 }}>
      {cards.map((c, i) => (
        <div key={c.id || i} style={{ padding: 12, background: 'var(--al-paper-2)', borderRadius: 12, display: 'grid', gap: 8 }}>
          <input className="al-input" aria-label="หัวข้อ" value={c.title} onChange={e => upd(i, 'title', e.target.value)} />
          <input className="al-input" aria-label="คำอธิบาย" value={c.description} onChange={e => upd(i, 'description', e.target.value)} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
            <input className="al-input" aria-label="ลิงก์ (ขึ้นต้นด้วย / หรือ https://)" placeholder="ลิงก์ / หรือ https://" value={c.link} onChange={e => upd(i, 'link', e.target.value)} />
            <select className="al-input" aria-label="กลุ่มผู้เห็น" value={c.audience} onChange={e => upd(i, 'audience', e.target.value)}>
              <option value="all">ทุกคน</option><option value="alumni">ศิษย์เก่า/บุคลากร</option><option value="current_student">นิสิตปัจจุบัน</option>
            </select>
            <select className="al-input" aria-label="ปุ่มสนใจ" value={c.interest_key} onChange={e => upd(i, 'interest_key', e.target.value)}>
              <option value="">ลิงก์ธรรมดา</option><option value="mentor">สนใจเป็น Mentor</option>
              <option value="guest_speaker">สนใจเป็นวิทยากร</option><option value="judge">สนใจเป็นกรรมการ</option>
            </select>
            <input className="al-input" type="number" aria-label="ลำดับ" value={c.order} onChange={e => upd(i, 'order', e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <label className="al-small"><input type="checkbox" checked={!!c.active} onChange={e => upd(i, 'active', e.target.checked)} /> แสดง</label>
            <button className="al-btn al-btn-ghost al-btn-sm" onClick={() => setCards(cs => cs.filter((_, j) => j !== i))}>ลบการ์ด</button>
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="al-btn al-btn-outline al-btn-sm" onClick={() => setCards(cs => [...cs, { ...BLANK }])}>+ เพิ่มการ์ด</button>
        <button className="al-btn al-btn-red al-btn-sm" onClick={save} disabled={busy} data-testid="admin-benefits-save">บันทึกทั้งหมด</button>
      </div>
    </div>
  );
};

const AlumniAdminPanel = ({ token, toast }) => (
  <div style={{ display: 'grid', gap: 12 }} data-testid="alumni-admin-panel">
    <div className="al-eyebrow">เครื่องมือแอดมิน (เห็นเฉพาะแอดมิน)</div>
    <Section title="สถิติการชวน (invite funnel)" testId="admin-sec-funnel"><Funnel token={token} /></Section>
    <Section title="คำเรียกในสายเทค" testId="admin-sec-kinship"><Kinship token={token} toast={toast} /></Section>
    <Section title="การ์ดสิทธิประโยชน์" testId="admin-sec-benefits"><BenefitsEditor token={token} toast={toast} /></Section>
  </div>
);

export default AlumniAdminPanel;
