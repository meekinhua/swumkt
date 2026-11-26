import React, { useCallback, useEffect, useState } from 'react';
import { Icon } from './AlumniUI';
import { api, errMsg, formatDateTh } from './alumniApi';

const pct = (x) => `${Math.round((x || 0) * 100)}%`;

const Loading = ({ children }) => <div className="al-card al-card-pad al-muted al-small">{children}</div>;
const ErrorBox = ({ msg, onRetry }) => (
  <div className="al-card al-card-pad" role="alert">
    <div className="al-small" style={{ color: 'var(--al-red-ink)', marginBottom: 8 }}>{msg}</div>
    {onRetry && <button className="al-btn al-btn-outline al-btn-sm" onClick={onRetry}>ลองใหม่</button>}
  </div>
);

// ---------- leaderboards + cohort meter ----------
const SORTS = [
  { id: 'longest', label: 'สายยาวที่สุด', hint: 'นับจากจำนวนรุ่นที่สายต่อกันถึง' },
  { id: 'complete', label: 'สายครบที่สุด', hint: 'สัดส่วนคนที่ลงทะเบียนจริง จากทุกคนในสาย (ต้องมีอย่างน้อย 3 คน)' },
  { id: 'largest', label: 'สายใหญ่ที่สุด', hint: 'นับจากจำนวนคนในสาย' },
];

export const Leaderboards = ({ token }) => {
  const [sort, setSort] = useState('longest');
  const [data, setData] = useState(null);
  const [cohorts, setCohorts] = useState(null);
  const [error, setError] = useState(null);
  const [cError, setCError] = useState(null);

  const loadLines = useCallback(async () => {
    setData(null); setError(null);
    try { setData((await api.get(token, '/alumni/leaderboard/lines', { sort, limit: 20 })).data); }
    catch (e) { setError(errMsg(e, 'โหลดอันดับไม่สำเร็จ')); }
  }, [token, sort]);
  const loadCohorts = useCallback(async () => {
    setCError(null);
    try { setCohorts((await api.get(token, '/alumni/leaderboard/cohorts')).data.cohorts || []); }
    catch (e) { setCError(errMsg(e, 'โหลดความคืบหน้าของรุ่นไม่สำเร็จ')); }
  }, [token]);
  useEffect(() => { loadLines(); }, [loadLines]);
  useEffect(() => { loadCohorts(); }, [loadCohorts]);

  const cur = SORTS.find(s => s.id === sort);
  const mine = data?.my_line;

  return (
    <div style={{ display: 'grid', gap: 20 }} data-testid="leaderboards">
      <div>
        <div className="al-seg" role="group" aria-label="เรียงอันดับสายตาม" style={{ flexWrap: 'wrap', marginBottom: 8 }}>
          {SORTS.map(s => (
            <button key={s.id} aria-pressed={sort === s.id} onClick={() => setSort(s.id)} data-testid={`lb-sort-${s.id}`}>{s.label}</button>
          ))}
        </div>
        <div className="al-tiny al-muted" style={{ marginBottom: 12 }}>{cur.hint}</div>

        {mine && (
          <div className="al-card al-card-pad" data-testid="lb-my-line" style={{ background: 'var(--al-red-soft)', borderColor: 'rgba(200,16,46,.25)', marginBottom: 12 }}>
            <div className="al-eyebrow" style={{ color: 'var(--al-red-ink)' }}>สายของคุณ</div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>
              {mine.rank ? `อันดับ ${mine.rank}` : 'ยังไม่ติดอันดับ'} · {mine.name}
            </div>
            <div className="al-small al-muted">{mine.size} คน · ลงทะเบียน {mine.registered} · ต่อกัน {mine.span} รุ่น · ครบ {pct(mine.completeness)}</div>
          </div>
        )}

        {error && <ErrorBox msg={error} onRetry={loadLines} />}
        {!error && !data && <Loading>กำลังนับสาย...</Loading>}
        {data && data.lines.length === 0 && (
          <div className="al-card al-card-pad" style={{ textAlign: 'center' }} data-testid="lb-empty">
            <div style={{ fontSize: 36 }}>🌱</div>
            <div style={{ fontWeight: 600, margin: '6px 0' }}>ยังไม่มีสายที่ติดอันดับ</div>
            <div className="al-small al-muted">สายจะขึ้นอันดับเมื่อความสัมพันธ์ได้รับการยืนยันหรือรับรองแล้ว ช่วยกันยืนยันสายได้ที่แท็บ "ช่วยยืนยันสาย"</div>
          </div>
        )}
        {data && data.lines.length > 0 && (
          <div style={{ display: 'grid', gap: 8 }} data-testid="lb-list">
            {data.lines.map(l => (
              <div key={l.line_id} className="al-card" data-testid={`lb-row-${l.rank}`}
                style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, borderColor: mine && mine.line_id === l.line_id ? 'var(--al-red)' : undefined }}>
                <div className="al-mono al-tabular" style={{ fontSize: 22, fontWeight: 700, width: 34, textAlign: 'center', color: l.rank <= 3 ? 'var(--al-red)' : 'var(--al-mute)' }}>
                  {l.rank}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</div>
                  <div className="al-tiny al-muted">
                    {l.size} คน · ลงทะเบียน {l.registered}{l.ghosts ? ` · รอเจ้าตัว ${l.ghosts}` : ''} · ต่อกัน {l.span} รุ่น
                  </div>
                  <div className="al-meter" style={{ marginTop: 6, maxWidth: 220 }} aria-label={`ครบ ${pct(l.completeness)}`}><div style={{ width: pct(l.completeness) }} /></div>
                </div>
                <div className="al-small al-tabular" style={{ fontWeight: 700 }}>{pct(l.completeness)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="al-h-card" style={{ marginBottom: 4 }}>แต่ละรุ่นมาถึงไหนแล้ว</h3>
        <div className="al-tiny al-muted" style={{ marginBottom: 10 }}>เปรียบเทียบจำนวนที่ลงทะเบียนกับจำนวนที่รู้จัก ถ้าภาควิชายังไม่ระบุจำนวนจริง จะนับจากรายชื่อที่รู้จักเท่านั้น</div>
        {cError && <ErrorBox msg={cError} onRetry={loadCohorts} />}
        {!cError && !cohorts && <Loading>กำลังโหลด...</Loading>}
        {cohorts && cohorts.length === 0 && <div className="al-card al-card-pad al-small al-muted">ยังไม่มีข้อมูลรุ่น</div>}
        {cohorts && cohorts.length > 0 && (
          <div className="al-card al-card-pad" data-testid="cohort-meter" style={{ display: 'grid', gap: 12 }}>
            {cohorts.map(c => (
              <div key={c.gen} data-testid={`cohort-${c.gen}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600 }}>รุ่น {c.gen} มาแล้ว {pct(c.completion)}</span>
                  <span className="al-tiny al-muted">
                    {c.registered}{c.expected ? `/${c.expected}` : ''} คน{c.basis === 'known_members' ? ' · จากรายชื่อที่รู้จัก' : ''}
                  </span>
                </div>
                <div className="al-meter"><div style={{ width: pct(c.completion) }} /></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ---------- เลี้ยงสาย meetups ----------
const RSVPS = [
  { v: 'going', l: 'ไป' },
  { v: 'maybe', l: 'อาจจะไป' },
  { v: 'no', l: 'ไม่ไป' },
];

export const Meetups = ({ token, toast }) => {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', when: '', place: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try { setItems((await api.get(token, '/alumni/meetups')).data.meetups || []); }
    catch (e) { setError(errMsg(e, 'โหลดนัดเลี้ยงสายไม่สำเร็จ')); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault(); setFormErr(null);
    if (!form.title.trim() || !form.when || !form.place.trim()) { setFormErr('กรอกชื่อนัด วันเวลา และสถานที่ให้ครบนะ'); return; }
    setBusy(true);
    try {
      await api.post(token, '/alumni/meetups', {
        title: form.title.trim(), starts_at: `${form.when}:00+07:00`,
        place: form.place.trim(), note: form.note.trim() || null,
      });
      toast('นัดเลี้ยงสายแล้ว ทุกคนในสายจะได้รับแจ้ง');
      setCreating(false); setForm({ title: '', when: '', place: '', note: '' }); load();
    } catch (er) { setFormErr(errMsg(er, 'สร้างนัดไม่สำเร็จ')); }
    finally { setBusy(false); }
  };

  const rsvp = async (m, response) => {
    try {
      await api.post(token, `/alumni/meetups/${m.id}/rsvp`, { response });
      load();
    } catch (er) { toast(errMsg(er, 'ตอบรับไม่สำเร็จ')); }
  };
  const cancel = async (m) => {
    if (!window.confirm(`ยกเลิกนัด "${m.title}" ใช่ไหม?`)) return;
    try { await api.post(token, `/alumni/meetups/${m.id}/cancel`); toast('ยกเลิกนัดแล้ว'); load(); }
    catch (er) { toast(errMsg(er, 'ยกเลิกไม่สำเร็จ')); }
  };

  return (
    <div data-testid="meetups">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 className="al-h-card">เลี้ยงสาย 🍻</h3>
          <div className="al-tiny al-muted">นัดกินข้าวกับคนในสายเทค ทุกคนในสายจะได้รับแจ้งและกดตอบรับได้</div>
        </div>
        <button className="al-btn al-btn-red al-btn-sm" onClick={() => setCreating(c => !c)} data-testid="meetup-create-toggle">
          <Icon name="plus" size={14} /> {creating ? 'ปิดฟอร์ม' : 'นัดเลี้ยงสาย'}
        </button>
      </div>

      {creating && (
        <form className="al-card al-card-pad al-fade-in" onSubmit={create} style={{ marginBottom: 14, display: 'grid', gap: 12 }} data-testid="meetup-form">
          <div>
            <label className="al-label" htmlFor="mt-title">ชื่อนัด</label>
            <input id="mt-title" className="al-input" value={form.title} maxLength={80} placeholder="เช่น เลี้ยงสายปลายปี"
              onChange={e => setForm({ ...form, title: e.target.value })} data-testid="meetup-title" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            <div>
              <label className="al-label" htmlFor="mt-when">วันและเวลา</label>
              <input id="mt-when" type="datetime-local" className="al-input" value={form.when}
                onChange={e => setForm({ ...form, when: e.target.value })} data-testid="meetup-when" />
              <div className="al-help">เวลาประเทศไทย</div>
            </div>
            <div>
              <label className="al-label" htmlFor="mt-place">สถานที่</label>
              <input id="mt-place" className="al-input" value={form.place} placeholder="เช่น ร้านหมูกระทะหน้า มศว"
                onChange={e => setForm({ ...form, place: e.target.value })} data-testid="meetup-place" />
            </div>
          </div>
          <div>
            <label className="al-label" htmlFor="mt-note">หมายเหตุ <span className="al-muted" style={{ fontWeight: 400 }}>(ไม่บังคับ)</span></label>
            <input id="mt-note" className="al-input" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} data-testid="meetup-note" />
          </div>
          {formErr && <div role="alert" className="al-small" style={{ color: 'var(--al-red-ink)' }}>{formErr}</div>}
          <button className="al-btn al-btn-red" disabled={busy} data-testid="meetup-submit">{busy ? 'กำลังสร้าง...' : 'สร้างนัด'}</button>
        </form>
      )}

      {error && <ErrorBox msg={error} onRetry={load} />}
      {!error && !items && <Loading>กำลังโหลดนัด...</Loading>}
      {items && items.length === 0 && (
        <div className="al-card al-card-pad" style={{ textAlign: 'center' }} data-testid="meetup-empty">
          <div style={{ fontSize: 36 }}>🍽️</div>
          <div style={{ fontWeight: 600, margin: '6px 0' }}>ยังไม่มีนัดเลี้ยงสาย</div>
          <div className="al-small al-muted">เริ่มเป็นคนแรกเลย พี่ ๆ น้อง ๆ ในสายรออยู่</div>
        </div>
      )}
      <div style={{ display: 'grid', gap: 12 }}>
        {(items || []).map(m => (
          <div key={m.id} className="al-card al-card-pad" data-testid={`meetup-${m.id}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 17 }}>{m.title}</div>
                <div className="al-small" style={{ color: 'var(--al-ink-2)' }}>🗓️ {formatDateTh(m.starts_at)} · 📍 {m.place}</div>
                {m.note && <div className="al-small al-muted" style={{ marginTop: 4 }}>{m.note}</div>}
              </div>
              {m.is_owner && <button className="al-btn al-btn-ghost al-btn-sm" onClick={() => cancel(m)} data-testid={`meetup-cancel-${m.id}`}>ยกเลิกนัด</button>}
            </div>
            <div className="al-small al-muted" style={{ margin: '10px 0 8px' }} data-testid={`meetup-counts-${m.id}`}>
              ไป {m.counts?.going || 0} · อาจจะ {m.counts?.maybe || 0} · ไม่ไป {m.counts?.no || 0}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="ตอบรับนัด">
              {RSVPS.map(r => (
                <button key={r.v} onClick={() => rsvp(m, r.v)} aria-pressed={m.my_rsvp === r.v}
                  data-testid={`rsvp-${m.id}-${r.v}`}
                  className={`al-btn al-btn-sm ${m.my_rsvp === r.v ? 'al-btn-primary' : 'al-btn-outline'}`}>
                  {m.my_rsvp === r.v && <Icon name="check" size={12} />} {r.l}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
