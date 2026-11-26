import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errMsg } from './alumniApi';

const ICONS = { chart: '📊', book: '📚', users: '👥', briefcase: '💼', heart: '💛', mic: '🎤', award: '🏅' };

export const BenefitsHub = ({ token, toast }) => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busyKey, setBusyKey] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try { setData((await api.get(token, '/alumni/benefits')).data); }
    catch (e) { setError(errMsg(e, 'โหลดสิทธิประโยชน์ไม่สำเร็จ')); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const toggle = async (card) => {
    const key = card.interest_key;
    const next = !card.my_interest;
    setBusyKey(key);
    try {
      await api.put(token, '/alumni/benefits/interests', { [key]: next });
      setData(d => ({ ...d, cards: d.cards.map(c => (c.interest_key === key ? { ...c, my_interest: next } : c)) }));
      toast(next ? 'บันทึกแล้ว ภาควิชาจะติดต่อกลับ' : 'ยกเลิกความสนใจแล้ว');
    } catch (e) { toast(errMsg(e, 'บันทึกไม่สำเร็จ')); }
    finally { setBusyKey(null); }
  };

  const go = (link) => {
    if (!link) return;
    if (link.startsWith('http')) window.open(link, '_blank', 'noopener,noreferrer');
    else navigate(link);
  };

  return (
    <div data-testid="benefits-hub" id="benefits">
      <div style={{ marginBottom: 14 }}>
        <div className="al-eyebrow" style={{ marginBottom: 6 }}>กลับมาแล้วได้อะไร</div>
        <h2 className="al-h-section" style={{ fontSize: 24 }}>สิทธิประโยชน์ศิษย์เก่า</h2>
        <div className="al-small al-muted">ภาควิชาการตลาดอยากให้ศิษย์เก่าได้ใช้ของจริง และอยากให้คุณกลับมาช่วยน้อง ๆ</div>
      </div>
      {error && (
        <div className="al-card al-card-pad" role="alert">
          <div className="al-small" style={{ color: 'var(--al-red-ink)', marginBottom: 8 }}>{error}</div>
          <button className="al-btn al-btn-outline al-btn-sm" onClick={load}>ลองใหม่</button>
        </div>
      )}
      {!error && !data && <div className="al-card al-card-pad al-muted al-small">กำลังโหลด...</div>}
      {data && data.cards.length === 0 && <div className="al-card al-card-pad al-small al-muted">ยังไม่มีรายการสิทธิประโยชน์</div>}
      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {data.cards.map(c => {
            const isInterest = !!c.interest_key;
            return (
              <div key={c.id} className="al-card al-card-pad" data-testid={`benefit-${c.id}`} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 28 }} aria-hidden="true">{ICONS[c.icon] || '✨'}</div>
                <h3 className="al-h-card">{c.title}</h3>
                <p className="al-small al-muted" style={{ margin: 0, flex: 1 }}>{c.description}</p>
                {isInterest ? (
                  <button role="switch" aria-checked={!!c.my_interest} disabled={busyKey === c.interest_key}
                    onClick={() => toggle(c)} data-testid={`interest-toggle-${c.interest_key}`}
                    className={`al-btn al-btn-sm ${c.my_interest ? 'al-btn-red' : 'al-btn-outline'}`} style={{ alignSelf: 'flex-start' }}>
                    {c.my_interest ? '✓ สนใจ (กดอีกครั้งเพื่อยกเลิก)' : 'สนใจ ให้ภาควิชาติดต่อ'}
                  </button>
                ) : (
                  <button className="al-btn al-btn-outline al-btn-sm" onClick={() => go(c.link)} style={{ alignSelf: 'flex-start' }}
                    data-testid={`benefit-open-${c.id}`}>เปิดดู →</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
