import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';

/**
 * Wizard step: turn qualitative material into an approved Journey Codebook.
 *
 * Spec: memory/CJM_PAINPOINT_SPEC.md rev 2, sections 2.1 (Q2-Q4), 2.4 and 2.6.
 *
 * The screen exists to make one rule physically visible: nothing a respondent
 * will see may exist without a human approving it and a real quote behind it.
 * So every candidate row shows its quotes, approval is a per-row act, and the
 * activate button stays dead until the server says every gate has cleared —
 * listing all the reasons at once, because fixing them one round-trip at a time
 * is how a student abandons the tool.
 */

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PAIN_TYPES = [
  ['process', 'ขั้นตอน'], ['time', 'เวลา'], ['information', 'ข้อมูล'],
  ['money', 'ค่าใช้จ่าย'], ['service', 'การบริการ'], ['functional', 'ตัวสินค้า'],
  ['emotional', 'ความรู้สึก'], ['access', 'การเข้าถึง'], ['other', 'อื่น ๆ'],
];

const CandidateRow = ({ row, states, onChange, onRemove, kind }) => {
  const [open, setOpen] = useState(false);
  const quotes = (row.provenance || {}).quotes || [];
  const set = (patch) => onChange({ ...row, ...patch });

  return (
    <div style={{
      border: '1px solid var(--rule)', padding: 12, marginBottom: 10,
      opacity: row.status === 'rejected' ? 0.45 : 1,
    }} data-testid={`cb-row-${row.id}`}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <input className="be-input" value={row.label_th || ''} placeholder="ชื่อที่ผู้ตอบจะเห็น"
               data-testid={`cb-label-${row.id}`}
               onChange={(e) => set({ label_th: e.target.value })} />
        <button className="jy-icon-btn" title="ดูข้อความต้นทาง"
                data-testid={`cb-quotes-${row.id}`}
                onClick={() => setOpen(!open)}>“{quotes.length}”</button>
        <button className="jy-icon-btn" title="ลบออกจากชุดนี้"
                data-testid={`cb-del-${row.id}`} onClick={onRemove}>✕</button>
      </div>

      <textarea className="be-input" rows={2} style={{ marginTop: 8 }}
                placeholder="คำนิยาม — เกณฑ์ว่าแบบไหนนับ แบบไหนไม่นับ (ผู้ลงรหัสคนที่สองต้องอ่านแล้วตัดสินเหมือนกัน)"
                value={row.definition_th || ''}
                data-testid={`cb-def-${row.id}`}
                onChange={(e) => set({ definition_th: e.target.value })} />

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
        {kind === 'pain' && (
          <select className="be-input" style={{ width: 'auto' }} value={row.pain_type || 'other'}
                  data-testid={`cb-type-${row.id}`}
                  onChange={(e) => set({ pain_type: e.target.value })}>
            {PAIN_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        )}
        <select className="be-input" style={{ width: 'auto' }} value={row.applies_to || 'all'}
                data-testid={`cb-scope-${row.id}`}
                onChange={(e) => set({ applies_to: e.target.value })}>
          <option value="all">ถามทุกขั้น</option>
          <option value="selected">เฉพาะบางขั้น</option>
        </select>
        <button className="be-chip be-chip-sm" aria-pressed={row.status === 'approved'}
                data-testid={`cb-approve-${row.id}`}
                onClick={() => set({ status: row.status === 'approved' ? 'suggested' : 'approved' })}>
          {row.status === 'approved' ? '✓ อนุมัติแล้ว' : 'อนุมัติ'}
        </button>
        <button className="be-chip be-chip-sm" aria-pressed={row.status === 'rejected'}
                data-testid={`cb-reject-${row.id}`}
                onClick={() => set({ status: row.status === 'rejected' ? 'suggested' : 'rejected' })}>
          ไม่ใช้
        </button>
      </div>

      {row.applies_to === 'selected' && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {states.map((st) => {
            const on = (row.state_ids || []).includes(st.id);
            return (
              <button key={st.id} className="be-chip be-chip-sm" aria-pressed={on}
                      data-testid={`cb-state-${row.id}-${st.id}`}
                      onClick={() => set({
                        state_ids: on ? (row.state_ids || []).filter((x) => x !== st.id)
                                      : [...(row.state_ids || []), st.id],
                      })}>
                {st.label_th || st.label}
              </button>
            );
          })}
        </div>
      )}

      {open && (
        <div style={{ marginTop: 10, borderLeft: '3px solid var(--rule)', paddingLeft: 10 }}
             data-testid={`cb-quotelist-${row.id}`}>
          <div className="be-label">ข้อความต้นทาง</div>
          {quotes.length === 0
            ? <div className="be-tiny" style={{ color: 'var(--be-red)' }}>
                ไม่มีข้อความต้นทาง — อนุมัติไม่ได้
              </div>
            : quotes.map((q, i) => (
                <div className="be-tiny" key={i} style={{ marginTop: 4, lineHeight: 1.6 }}>
                  “{q.text}”
                  {q.interview_index != null && (
                    <span style={{ color: 'var(--ink-3)' }}> — บทสัมภาษณ์ที่ {q.interview_index + 1}</span>
                  )}
                </div>
              ))}
        </div>
      )}
    </div>
  );
};

const JourneyCodebookStep = ({ study, token, onBack, onDone }) => {
  const authH = { headers: { Authorization: `Bearer ${token}` } };
  const studyId = study?.id;

  const [runs, setRuns] = useState([]);
  const [pickedRuns, setPickedRuns] = useState([]);
  // one textarea per informant — pooling them into one blob is what makes a
  // saturation curve impossible, so the UI keeps them apart from the start
  const [interviews, setInterviews] = useState(['']);
  const [mermaid, setMermaid] = useState('');

  const [draft, setDraft] = useState(null);
  const draftRef = useRef(null);
  useEffect(() => { draftRef.current = draft; }, [draft]);
  const [active, setActive] = useState(null);
  const [blockers, setBlockers] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [budget, setBudget] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [canEdit, setCanEdit] = useState(true);

  const states = study?.states || [];

  // Headers are rebuilt inside the callback rather than closed over, so the
  // dependency list is genuinely complete instead of being silenced.
  const load = useCallback(async () => {
    const h = { headers: { Authorization: `Bearer ${token}` } };
    try {
      const [cb, qr] = await Promise.all([
        axios.get(`${API}/journey/studies/${studyId}/codebook`, h),
        axios.get(`${API}/journey/qualitative-runs`, h).catch(() => ({ data: { runs: [] } })),
      ]);
      setDraft(cb.data.draft);
      setActive(cb.data.active);
      // Server-side gates arrive with the codebook, so the activate button is
      // disabled with its reasons on first paint rather than after a click.
      setBlockers(cb.data.blockers || []);
      setCanEdit(cb.data.can_edit !== false);
      setRuns(qr.data?.runs || qr.data || []);
    } catch (e) {
      setError(e?.response?.data?.detail || 'โหลดชุดรหัสไม่ได้');
    }
  }, [studyId, token]);

  useEffect(() => { if (studyId) load(); }, [studyId, load]);

  const extract = async () => {
    setBusy('extract'); setError('');
    try {
      const body = {
        qualitative_run_ids: pickedRuns,
        interviews: interviews.map((t) => t.trim()).filter(Boolean),
        mermaid_code: mermaid.trim() || undefined,
      };
      const r = await axios.post(`${API}/journey/studies/${studyId}/codebook/extract`, body, authH);
      setDraft(r.data.draft);
      setBlockers([]); setWarnings([]);
    } catch (e) {
      setError(e?.response?.data?.detail || 'สกัดข้อเสนอไม่สำเร็จ');
    } finally { setBusy(''); }
  };

  const save = async () => {
    setBusy('save'); setError('');
    // Read through the ref, not the closed-over `draft`: edits made in the same
    // tick as the click have not re-rendered yet and would be sent stale.
    const next = draftRef.current;
    if (!next) { setBusy(''); return; }
    try {
      const r = await axios.put(`${API}/journey/studies/${studyId}/codebook`, {
        source: next.source, states: next.states, edges: next.edges,
        touchpoints: next.touchpoints, pain_categories: next.pain_categories,
      }, authH);
      setDraft(r.data.draft);
      setBlockers(r.data.blockers || []);
      setWarnings(r.data.warnings || []);
      setBudget(r.data.budget || null);
    } catch (e) {
      setError(e?.response?.data?.detail || 'บันทึกไม่สำเร็จ');
    } finally { setBusy(''); }
  };

  const activate = async () => {
    setBusy('activate'); setError('');
    try {
      const r = await axios.post(`${API}/journey/studies/${studyId}/codebook/activate`, {}, authH);
      setActive(r.data.codebook); setDraft(null); setBlockers([]);
      if (onDone) onDone(r.data);
    } catch (e) {
      const d = e?.response?.data?.detail;
      if (d && d.blockers) { setBlockers(d.blockers); setError(d.message || ''); }
      else setError(d || 'เปิดใช้ไม่สำเร็จ');
    } finally { setBusy(''); }
  };

  // Functional updates, not `{...draft}`: several rows can be edited before
  // React re-renders, and reading `draft` from the closure makes each edit
  // start from the same stale copy so all but the last one are lost.
  const patchRow = (key, id, row) => setDraft((d) => (
    { ...d, [key]: (d[key] || []).map((r) => (r.id === id ? row : r)) }));
  const removeRow = (key, id) => setDraft((d) => (
    { ...d, [key]: (d[key] || []).filter((r) => r.id !== id) }));

  const approvedPain = ((draft || active)?.pain_categories || []).filter((r) => r.status === 'approved');

  // Once answers exist the vocabulary is frozen. Showing the extract/edit panel
  // anyway only produces a 400 on click, so the step turns into the record of
  // what was approved — with the quotes, which is what a reader must check.
  if (!canEdit) {
    const cb = active || draft;
    const rows = (cb?.pain_categories || []).filter((r) => r.status === 'approved');
    const typeLabel = (t) => (PAIN_TYPES.find(([v]) => v === t) || [null, 'อื่น ๆ'])[1];
    return (
      <div data-testid="journey-step-codebook">
        <div className="be-card" style={{ marginBottom: 16 }} data-testid="cb-readonly">
          <h3 className="be-card-t">
            {cb ? `ชุดรหัสเวอร์ชัน ${cb.version} · แก้ไขไม่ได้แล้ว` : 'ยังไม่มีชุดรหัส'}
          </h3>
          <p className="be-card-d">
            ประเภทปัญหา {rows.length} รายการ
            {cb?.activated_at ? ` · เปิดใช้เมื่อ ${(cb.activated_at || '').slice(0, 10)}` : ''}
          </p>
          {blockers.map((b, i) => <div className="jy-warn" key={i}>{b}</div>)}
          {(cb?.source?.collection_method_th) && (
            <div className="jy-kv" style={{ marginTop: 10 }}>
              <span>วิธีเก็บข้อมูลเชิงคุณภาพ</span><b>{cb.source.collection_method_th}</b>
            </div>
          )}
          {cb?.source?.n_interviews != null && (
            <div className="jy-kv"><span>จำนวนผู้ให้สัมภาษณ์</span>
              <b>{cb.source.n_interviews} ราย</b></div>
          )}
        </div>

        <div className="be-card" style={{ marginBottom: 16 }}>
          <h3 className="be-card-t">ประเภทปัญหาที่อนุมัติแล้ว และข้อความต้นทาง</h3>
          <p className="be-card-d">ทุกประเภทต้องมีคำพูดของผู้ให้สัมภาษณ์รองรับ — นี่คือหลักฐานนั้น</p>
          {rows.map((r) => (
            <div key={r.id} style={{ border: '1px solid var(--rule)', padding: 12, marginTop: 10 }}
                 data-testid={`cb-ro-${r.id}`}>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
                <b style={{ fontSize: 14 }}>{r.label_th}</b>
                <span className="be-tiny" style={{ color: 'var(--ink-3)' }}>
                  {typeLabel(r.pain_type)}
                </span>
              </div>
              {r.definition_th && (
                <div className="be-tiny" style={{ marginTop: 4, lineHeight: 1.7 }}>{r.definition_th}</div>
              )}
              {((r.provenance || {}).quotes || []).map((q, i) => (
                <div className="be-tiny" key={i}
                     style={{ marginTop: 6, paddingLeft: 10, borderLeft: '3px solid var(--rule)',
                              lineHeight: 1.7 }}>
                  “{q.text}”{q.source_ref ? <span style={{ color: 'var(--ink-3)' }}> — {q.source_ref}</span> : null}
                </div>
              ))}
            </div>
          ))}
          <button className="be-btn" style={{ marginTop: 16 }} onClick={onBack}
                  data-testid="cb-back">ย้อนกลับ</button>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="journey-step-codebook">
      {active && (
        <div className="be-card" style={{ marginBottom: 16 }} data-testid="cb-active">
          <h3 className="be-card-t">ใช้ชุดรหัสเวอร์ชัน {active.version} อยู่</h3>
          <p className="be-card-d">
            ประเภทปัญหา {(active.pain_categories || []).filter((c) => c.status === 'approved').length} รายการ ·
            เปิดใช้เมื่อ {(active.activated_at || '').slice(0, 10)}
          </p>
          {active.saturation?.warnings?.map((w, i) => (
            <div className="jy-warn" key={i}>{w}</div>
          ))}
        </div>
      )}

      {/* ---- 1. bring the qualitative material in ------------------------- */}
      <div className="be-card" style={{ marginBottom: 16 }}>
        <h3 className="be-card-t">1 · นำข้อมูลเชิงคุณภาพเข้ามา</h3>
        <p className="be-card-d">
          วางบทสัมภาษณ์ <b>ทีละคน</b> — ระบบใช้ลำดับนี้คำนวณว่าเก็บข้อมูลจนอิ่มตัวหรือยัง
          ถ้าวางรวมกันเป็นก้อนเดียวจะดูไม่ได้ว่าอิ่มตัวเมื่อไร
        </p>

        {runs.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div className="be-label">หรือเลือกผลวิเคราะห์เชิงคุณภาพที่เคยทำไว้</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {runs.slice(0, 8).map((r) => {
                const on = pickedRuns.includes(r.id);
                return (
                  <button key={r.id} className="be-chip be-chip-sm" aria-pressed={on}
                          data-testid={`cb-run-${r.id}`}
                          onClick={() => setPickedRuns(on ? pickedRuns.filter((x) => x !== r.id)
                                                          : [...pickedRuns, r.id])}>
                    {(r.context || r.created_at || r.id).toString().slice(0, 28)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {interviews.map((t, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <textarea className="be-input" rows={2} placeholder={`บทสัมภาษณ์คนที่ ${i + 1}`}
                      value={t} data-testid={`cb-interview-${i}`}
                      onChange={(e) => setInterviews(interviews.map((x, k) => (k === i ? e.target.value : x)))} />
            <button className="jy-icon-btn" data-testid={`cb-interview-del-${i}`}
                    disabled={interviews.length === 1}
                    onClick={() => setInterviews(interviews.filter((_, k) => k !== i))}>✕</button>
          </div>
        ))}
        <button className="be-btn be-btn-sm" style={{ marginTop: 10 }} data-testid="cb-interview-add"
                onClick={() => setInterviews([...interviews, ''])}>+ เพิ่มบทสัมภาษณ์</button>

        <div className="be-label" style={{ marginTop: 14 }}>
          แผนภาพเส้นทาง (Mermaid) — ถ้ามี ระบบจะเก็บเส้นเชื่อมไว้ตรวจกับข้อมูลจริงภายหลัง
        </div>
        <textarea className="be-input" rows={3} value={mermaid} data-testid="cb-mermaid"
                  placeholder="graph TD&#10;  A[ค้นหา] --> B[เปรียบเทียบ]"
                  onChange={(e) => setMermaid(e.target.value)} />

        <button className="be-btn be-btn-primary" style={{ marginTop: 12 }} data-testid="cb-extract"
                disabled={busy === 'extract'
                          || (!pickedRuns.length && !interviews.some((t) => t.trim()) && !mermaid.trim())}
                onClick={extract}>
          {busy === 'extract' ? 'กำลังอ่าน…' : 'อ่านและเสนอรายการ'}
        </button>
      </div>

      {error && <div className="jy-warn" data-testid="cb-error">{error}</div>}

      {/* ---- 2. code it -------------------------------------------------- */}
      {draft && (
        <>
          <div className="be-card" style={{ marginBottom: 16 }}>
            <h3 className="be-card-t">2 · ลงรหัส</h3>
            <p className="be-card-d">
              ทุกรายการเป็นเพียง “ข้อเสนอ” จนกว่าจะกดอนุมัติ · ตั้งชื่อด้วยภาษาที่ลูกค้าใช้จริง
              ไม่ใช่ศัพท์ของแบรนด์ · กดปุ่ม “ ” เพื่อดูข้อความต้นทาง
            </p>

            <div className="be-label" style={{ marginTop: 12 }}>
              ประเภทปัญหา ({approvedPain.length} อนุมัติแล้ว · ต้องมี 3–12)
            </div>
            {(draft.pain_categories || []).map((row) => (
              <CandidateRow key={row.id} row={row} states={states} kind="pain"
                            onChange={(r) => patchRow('pain_categories', row.id, r)}
                            onRemove={() => removeRow('pain_categories', row.id)} />
            ))}

            {(draft.touchpoints || []).length > 0 && (
              <>
                <div className="be-label" style={{ marginTop: 16 }}>จุดสัมผัส</div>
                {draft.touchpoints.map((row) => (
                  <CandidateRow key={row.id} row={row} states={states} kind="touchpoint"
                                onChange={(r) => patchRow('touchpoints', row.id, r)}
                                onRemove={() => removeRow('touchpoints', row.id)} />
                ))}
              </>
            )}
          </div>

          {/* ---- 3. method note, then activate ---------------------------- */}
          <div className="be-card" style={{ marginBottom: 16 }}>
            <h3 className="be-card-t">3 · วิธีเก็บข้อมูล และเปิดใช้</h3>
            <p className="be-card-d">ข้อความนี้จะถูกพิมพ์ลงภาคผนวกของวิทยานิพนธ์</p>
            <textarea className="be-input" rows={2} data-testid="cb-method"
                      placeholder="เช่น สัมภาษณ์กึ่งโครงสร้าง 12 ราย ระหว่าง ก.ค.–ส.ค. 2569"
                      value={draft.source?.collection_method_th || ''}
                      onChange={(e) => setDraft((d) => ({
                        ...d,
                        source: { ...d.source, collection_method_th: e.target.value },
                      }))} />

            <div style={{ display: 'flex', gap: 6, marginTop: 10, alignItems: 'center' }}>
              <span className="be-tiny">รูปแบบเส้นทางที่งานเชิงคุณภาพสรุปไว้</span>
              {['linear', 'nonlinear'].map((v) => (
                <button key={v} className="be-chip be-chip-sm" data-testid={`cb-style-${v}`}
                        aria-pressed={(draft.source?.journey_style || 'nonlinear') === v}
                        onClick={() => setDraft((d) => (
                          { ...d, source: { ...d.source, journey_style: v } }))}>
                  {v === 'linear' ? 'เรียงลำดับ' : 'ไม่เรียงลำดับ'}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              <button className="be-btn" onClick={onBack} data-testid="cb-back">ย้อนกลับ</button>
              <button className="be-btn" onClick={save} data-testid="cb-save"
                      disabled={busy === 'save'}>
                {busy === 'save' ? 'กำลังบันทึก…' : 'บันทึกและตรวจ'}
              </button>
              <button className="be-btn be-btn-primary" onClick={activate} data-testid="cb-activate"
                      disabled={busy === 'activate' || blockers.length > 0}>
                {busy === 'activate' ? 'กำลังเปิดใช้…' : 'เปิดใช้ชุดรหัสนี้'}
              </button>
            </div>

            {blockers.length > 0 && (
              <div style={{ marginTop: 12 }} data-testid="cb-blockers">
                <div className="be-label">ยังเปิดใช้ไม่ได้ เพราะ</div>
                {blockers.map((b, i) => <div className="jy-warn" key={i}>{b}</div>)}
              </div>
            )}
            {warnings.length > 0 && (
              <div style={{ marginTop: 12 }} data-testid="cb-warnings">
                <div className="be-label">ข้อควรพิจารณา (ไม่บล็อก)</div>
                {warnings.map((w, i) => (
                  <div className="be-tiny" key={i} style={{ color: 'var(--ink-3)', lineHeight: 1.7 }}>• {w}</div>
                ))}
              </div>
            )}
            {budget && (
              <div className="jy-kv" style={{ marginTop: 12 }}>
                <span>เวลาตอบโดยประมาณ</span>
                <b>{budget.seconds_median} วินาที · {budget.scored_items} ข้อ</b>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default JourneyCodebookStep;
