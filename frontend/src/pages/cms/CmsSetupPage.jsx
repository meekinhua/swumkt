import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { cmsApi } from './cmsApi';

// Two jobs that used to need a terminal on the server: loading the faculty
// seed, and minting the first API key. The key is shown here and nowhere else,
// so it never travels through a chat log or a commit.

const SCOPE_NOTE = {
  'cms.read': 'อ่านเนื้อหาทั้งหมด',
  'cms.posts.write': 'เขียน/แก้บทความ',
  'cms.landing.write': 'แก้หน้าแรก',
  'cms.settings.write': 'แก้ค่าตั้งของเว็บ',
  'cms.media.write': 'อัปโหลด/แก้รูป',
  'cms.faculty.write': 'แก้โปรไฟล์อาจารย์และผลงาน',
  'cms.revisions.restore': 'ย้อนคืนฉบับก่อนหน้า',
};

// The server's wildcard is 'cms.*', not '*' — sending the wrong one is a 400.
const WILDCARD = 'cms.*';

const CmsSetupPage = () => {
  const [seedResult, setSeedResult] = useState(null);
  const [busy, setBusy] = useState('');
  const [counts, setCounts] = useState(null);

  const [label, setLabel] = useState('sitectl · owner');
  const [scopes, setScopes] = useState([WILDCARD]);
  const [minted, setMinted] = useState(null);
  const [keys, setKeys] = useState([]);
  const [allScopes, setAllScopes] = useState({});
  const [wildcard, setWildcard] = useState(WILDCARD);

  const loadKeys = async () => {
    try {
      const r = await cmsApi.listKeys();
      setKeys(r.data?.items || []);
      setAllScopes(r.data?.scopes || {});
      if (r.data?.wildcard) setWildcard(r.data.wildcard);
    } catch { /* admin-only; the page already says so */ }
  };

  const loadCounts = async () => {
    try {
      const [f, p] = await Promise.all([cmsApi.publicFaculty(), cmsApi.publicPublications()]);
      setCounts({ faculty: f.data?.total ?? 0, papers: p.data?.total ?? 0 });
    } catch { setCounts(null); }
  };

  useEffect(() => { loadKeys(); loadCounts(); }, []);

  const runSeed = async (dryRun) => {
    setBusy(dryRun ? 'dry' : 'real');
    try {
      const r = await cmsApi.seedFaculty(dryRun);
      setSeedResult(r.data);
      toast.success(dryRun ? 'ตรวจแล้ว — ยังไม่ได้เขียนอะไร' : 'นำเข้าข้อมูลแล้ว');
      if (!dryRun) setTimeout(loadCounts, 1200);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'ไม่สำเร็จ — ต้องเข้าสู่ระบบเป็นผู้ดูแล');
    } finally { setBusy(''); }
  };

  const mint = async () => {
    if (!label.trim()) { toast.error('ต้องตั้งชื่อกำกับคีย์'); return; }
    setBusy('mint');
    try {
      const r = await cmsApi.createKey({ label: label.trim(), scopes });
      setMinted(r.data);
      loadKeys();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'ออกคีย์ไม่สำเร็จ');
    } finally { setBusy(''); }
  };

  const revoke = async (id) => {
    if (!window.confirm('เพิกถอนคีย์นี้? เครื่องมือที่ใช้คีย์นี้จะใช้งานไม่ได้ทันที')) return;
    try { await cmsApi.revokeKey(id); toast.success('เพิกถอนแล้ว'); loadKeys(); }
    catch { toast.error('เพิกถอนไม่สำเร็จ'); }
  };

  const toggleScope = (s) => setScopes((cur) => (
    s === wildcard ? [wildcard]
      : cur.includes(s) ? cur.filter((x) => x !== s && x !== wildcard)
        : [...cur.filter((x) => x !== wildcard), s]));

  const scopeKeys = (Object.keys(allScopes).length ? Object.keys(allScopes) : Object.keys(SCOPE_NOTE))
    .filter((s) => s !== wildcard);

  return (
    <div data-testid="cms-setup-page" className="min-h-screen bg-white">
      <header className="border-b border-neutral-200">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between">
          <div>
            <div className="text-xs font-mono uppercase tracking-widest text-red-600 mb-1">● Content Studio</div>
            <h1 className="text-3xl font-serif tracking-tight">ตั้งค่าเริ่มต้นของเว็บ</h1>
          </div>
          <Link to="/admin/cms" data-testid="setup-back-link"
                className="px-4 py-2 border border-neutral-900 text-sm font-mono uppercase tracking-wider hover:bg-neutral-100 rounded-full">
            กลับไป CMS
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-10">
        <section data-testid="seed-section">
          <h2 className="text-lg font-serif">ข้อมูลคณาจารย์และผลงาน</h2>
          <p className="text-sm text-neutral-600 mt-1 leading-7">
            นำเข้าจากไฟล์ที่มากับระบบ · <b>เพิ่มเฉพาะรายการที่ยังไม่มี</b> ของเดิมที่อาจารย์แก้ไว้แล้วจะไม่ถูกเขียนทับ
            จึงกดซ้ำได้โดยไม่เสียหาย · ผลงานที่ยังไม่ยืนยันจะถูกพักไว้เป็นสถานะ “รอตรวจ” ไม่ขึ้นหน้าเว็บ
          </p>
          {counts && (
            <p className="text-sm mt-3 font-mono" data-testid="public-counts">
              ตอนนี้หน้าเว็บแสดง: คณาจารย์ {counts.faculty} ท่าน · ผลงาน {counts.papers} เรื่อง
            </p>
          )}
          <div className="flex gap-2 mt-4 flex-wrap">
            <button onClick={() => runSeed(true)} disabled={!!busy} data-testid="seed-dry-run-btn"
                    className="px-5 py-2 border border-neutral-900 text-sm rounded-full hover:bg-neutral-100 disabled:opacity-40">
              {busy === 'dry' ? 'กำลังตรวจ…' : 'ตรวจก่อน (ยังไม่เขียน)'}
            </button>
            <button onClick={() => runSeed(false)} disabled={!!busy} data-testid="seed-run-btn"
                    className="px-5 py-2 bg-blue-600 text-white text-sm rounded-full hover:bg-blue-700 disabled:opacity-40">
              {busy === 'real' ? 'กำลังนำเข้า…' : 'นำเข้าข้อมูล'}
            </button>
          </div>
          {seedResult && (
            <div className="mt-4 border border-neutral-300 p-4 text-sm leading-7" data-testid="seed-result">
              <div>{seedResult.dry_run ? 'จะเพิ่ม' : 'เพิ่มแล้ว'}: คณาจารย์ {seedResult.added_faculty} ท่าน · ผลงาน {seedResult.added_papers} เรื่อง</div>
              <div>มีอยู่แล้ว (ไม่แตะ): คณาจารย์ {seedResult.kept_faculty} ท่าน · ผลงาน {seedResult.kept_papers} เรื่อง</div>
              <div className="text-neutral-600">
                ในไฟล์ต้นทาง: เผยแพร่ {seedResult.seed_public_papers} เรื่อง · รอตรวจ {seedResult.seed_review_papers} เรื่อง
              </div>
              {!seedResult.dry_run && (
                <div className="text-neutral-600">แคชหน้าเว็บสาธารณะหมดอายุภายใน 5 นาที</div>
              )}
            </div>
          )}
        </section>

        <section data-testid="keys-section" className="border-t border-neutral-200 pt-8">
          <h2 className="text-lg font-serif">คีย์สำหรับเครื่องมือภายนอก (sitectl)</h2>
          <p className="text-sm text-neutral-600 mt-1 leading-7">
            คีย์จะแสดง<b>ครั้งเดียว</b>ตรงนี้ ระบบเก็บไว้เฉพาะลายนิ้วมือของคีย์ หายแล้วออกใหม่เท่านั้น กู้คืนไม่ได้
          </p>

          <div className="mt-4 space-y-3">
            <input value={label} onChange={(e) => setLabel(e.target.value)} data-testid="key-label-input"
                   placeholder="ชื่อกำกับ เช่น sitectl · owner"
                   className="px-3 py-2 border border-neutral-300 rounded w-full sm:w-96 text-sm" />
            <div className="flex flex-wrap gap-2">
              <button onClick={() => toggleScope(wildcard)} data-testid="key-scope-all"
                      aria-pressed={scopes.includes(wildcard)}
                      className={`px-3 py-1.5 text-sm rounded-full border ${scopes.includes(wildcard) ? 'bg-neutral-900 text-white border-neutral-900' : 'border-neutral-300'}`}>
                ทุกสิทธิ์ของเนื้อหา
              </button>
              {scopeKeys.map((s) => (
                <button key={s} onClick={() => toggleScope(s)} data-testid={`key-scope-${s}`}
                        aria-pressed={scopes.includes(s)}
                        className={`px-3 py-1.5 text-sm rounded-full border ${scopes.includes(s) ? 'bg-neutral-900 text-white border-neutral-900' : 'border-neutral-300'}`}>
                  {SCOPE_NOTE[s] || s}
                </button>
              ))}
            </div>
            <button onClick={mint} disabled={!!busy} data-testid="mint-key-btn"
                    className="px-5 py-2 bg-neutral-900 text-white text-sm rounded-full hover:bg-neutral-700 disabled:opacity-40">
              {busy === 'mint' ? 'กำลังออกคีย์…' : 'ออกคีย์ใหม่'}
            </button>
          </div>

          {minted && (
            <div className="mt-4 border-2 border-amber-500 bg-amber-50 p-4" data-testid="minted-key">
              <div className="text-sm font-bold">คัดลอกเก็บไว้เดี๋ยวนี้ — จะไม่แสดงอีก</div>
              <code className="block mt-2 p-3 bg-white border border-amber-300 text-sm break-all font-mono"
                    data-testid="minted-key-value">{minted.key}</code>
              <button onClick={() => { navigator.clipboard.writeText(minted.key); toast.success('คัดลอกแล้ว'); }}
                      data-testid="copy-key-btn"
                      className="mt-3 px-4 py-1.5 border border-neutral-900 text-sm rounded-full hover:bg-white">
                คัดลอกคีย์
              </button>
              <button onClick={() => setMinted(null)} data-testid="hide-key-btn"
                      className="mt-3 ml-2 px-4 py-1.5 text-sm rounded-full border border-neutral-300">
                ซ่อน
              </button>
            </div>
          )}

          <div className="mt-6" data-testid="key-list">
            {keys.length === 0 && <p className="text-sm text-neutral-500">ยังไม่มีคีย์</p>}
            {keys.map((k) => (
              <div key={k.id} className="flex items-center justify-between border-b border-neutral-200 py-3 gap-4">
                <div className="text-sm">
                  <div className="font-medium">{k.label}</div>
                  <div className="font-mono text-xs text-neutral-500">
                    {k.fingerprint} · {(k.scopes || []).join(', ')} ·{' '}
                    {k.revoked_at ? 'เพิกถอนแล้ว' : `ใช้ล่าสุด ${String(k.last_used_at || '—').slice(0, 19)}`}
                  </div>
                </div>
                {!k.revoked_at && (
                  <button onClick={() => revoke(k.id)} data-testid={`revoke-key-${k.id}`}
                          className="px-3 py-1.5 text-sm border border-red-600 text-red-600 rounded-full hover:bg-red-50">
                    เพิกถอน
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default CmsSetupPage;
