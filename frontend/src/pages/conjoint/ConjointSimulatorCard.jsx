/**
 * Market simulator — POST simulate. The user builds 2-6 product scenarios from the
 * study's attribute levels; the server returns each one's share of preference.
 * Plain-Thai caveats (not market share; IIA) are always shown next to the result.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Layers, Plus, Trash2, Loader2, Play, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { API } from '@/App';
import { apiErrorText, fmtShare, fmtNum, METHOD_INFO } from './cjFormat';

const SIM_METHODS = ['mnl', 'mixed_logit', 'hierarchical_bayes'];

const defaultProducts = (attrs, n = 2) => Array.from({ length: n }, (_, i) => ({
  name: `สินค้า ${String.fromCharCode(65 + i)}`,
  levels: Object.fromEntries((attrs || []).map((a) => [a.id, (a.levels?.[i % (a.levels?.length || 1)] || a.levels?.[0])?.id])),
}));

const ConjointSimulatorCard = ({ studyId, token, study, filterQs, defaultMethod, respondentCount }) => {
  const attrs = study?.attributes || [];
  const [products, setProducts] = useState(() => defaultProducts(attrs));
  const [method, setMethod] = useState(SIM_METHODS.includes(defaultMethod) ? defaultMethod : 'mnl');
  const [rule, setRule] = useState('logit');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const ranOnce = useRef(false);

  const hetero = method !== 'mnl';
  const effRule = hetero ? rule : 'logit';

  const run = useCallback(async (prods = products) => {
    setLoading(true);
    setError('');
    try {
      const r = await axios.post(`${API}/conjoint/studies/${studyId}/simulate?_=1${filterQs || ''}`,
        { method, rule: effRule, products: prods },
        { headers: token ? { Authorization: `Bearer ${token}` } : undefined, timeout: 180000 });
      setResult(r.data);
    } catch (e) {
      setResult(null);
      setError(await apiErrorText(e, 'จำลองไม่สำเร็จ'));
    } finally { setLoading(false); }
  }, [studyId, filterQs, method, effRule, token, products]);

  // first run with the default scenarios so the card never opens empty
  useEffect(() => {
    if (ranOnce.current || !attrs.length || (respondentCount || 0) < 30) return;
    ranOnce.current = true;
    run(products);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attrs.length, respondentCount]);

  const setName = (i, v) => setProducts((p) => p.map((x, k) => (k === i ? { ...x, name: v } : x)));
  const setLevel = (i, attrId, levelId) => setProducts((p) => p.map((x, k) => (k === i ? { ...x, levels: { ...x.levels, [attrId]: levelId } } : x)));
  const add = () => setProducts((p) => (p.length >= 6 ? p : [...p, { ...p[p.length - 1], levels: { ...p[p.length - 1].levels }, name: `สินค้า ${String.fromCharCode(65 + p.length)}` }]));
  const remove = (i) => setProducts((p) => (p.length <= 2 ? p : p.filter((_, k) => k !== i)));

  const maxShare = Math.max(0, ...(result?.products || []).map((p) => p.share || 0));
  const incomplete = products.some((p) => attrs.some((a) => !p.levels?.[a.id]));

  return (
    <Card className="mb-6 border-2 border-violet-200 p-4 sm:p-6" data-testid="simulator-card">
      <div className="mb-3 flex items-start gap-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-violet-600"><Layers className="h-5 w-5 text-white" aria-hidden="true" /></span>
        <div>
          <h2 className="text-lg font-bold text-gray-900 sm:text-xl">จำลองตลาด: ถ้าวางสินค้าเหล่านี้คู่กัน คนจะเลือกอะไร</h2>
          <p className="text-sm text-gray-600">กำหนดสินค้า 2–6 แบบจากระดับของแต่ละคุณลักษณะ แล้วดู “ส่วนแบ่งความชอบ” ของแต่ละแบบ</p>
        </div>
      </div>

      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-gray-700">
          ใช้ผลจากวิธี
          <select value={method} onChange={(e) => { setMethod(e.target.value); setResult(null); }} className="mt-1 w-full rounded-lg border-2 border-gray-300 px-2 py-2 text-sm font-normal" data-testid="sim-method">
            {SIM_METHODS.map((m) => <option key={m} value={m}>{METHOD_INFO[m].label}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-gray-700">
          วิธีนับส่วนแบ่ง
          <select value={effRule} onChange={(e) => setRule(e.target.value)} disabled={!hetero} className="mt-1 w-full rounded-lg border-2 border-gray-300 px-2 py-2 text-sm font-normal disabled:bg-gray-100" data-testid="sim-rule">
            <option value="logit">แบ่งตามความน่าจะเป็น (logit share) — แนะนำ</option>
            <option value="first_choice">ทุกคนเลือกอันที่ชอบที่สุดอันเดียว (first choice)</option>
          </select>
          {!hetero && <span className="mt-1 block font-normal text-gray-500">first choice ใช้ได้เฉพาะ Mixed Logit / ผลรายบุคคล</span>}
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="sim-products">
        {products.map((p, i) => (
          <div key={i} className="rounded-xl border-2 border-violet-100 bg-violet-50/40 p-3" data-testid={`sim-product-${i}`}>
            <div className="mb-2 flex items-center gap-2">
              <input value={p.name} onChange={(e) => setName(i, e.target.value)} maxLength={40} aria-label={`ชื่อสินค้า ${i + 1}`} className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm font-bold" />
              <Button type="button" variant="ghost" size="sm" onClick={() => remove(i)} disabled={products.length <= 2} aria-label={`ลบ ${p.name}`}><Trash2 className="h-4 w-4 text-red-500" /></Button>
            </div>
            <div className="space-y-2">
              {attrs.map((a) => (
                <label key={a.id} className="block text-xs text-gray-600">
                  {a.name}
                  <select value={p.levels?.[a.id] || ''} onChange={(e) => setLevel(i, a.id, e.target.value)} className="mt-0.5 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900" data-testid={`sim-level-${i}-${a.id}`}>
                    {(a.levels || []).map((l) => <option key={l.id} value={l.id}>{l.value}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={products.length >= 6} data-testid="sim-add"><Plus className="mr-1 h-4 w-4" />เพิ่มสินค้า</Button>
        <Button type="button" onClick={() => run()} disabled={loading || incomplete || (respondentCount || 0) < 30} className="bg-violet-600 text-white hover:bg-violet-700" data-testid="sim-run">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}จำลอง
        </Button>
        {(respondentCount || 0) < 30 && <span className="text-xs text-amber-700">ต้องมีผู้ตอบอย่างน้อย 30 คน</span>}
      </div>

      {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert" data-testid="sim-error">{error}</p>}

      {result && (
        <div className="mt-4" data-testid="sim-result">
          <div className="space-y-2">
            {result.products.map((p) => (
              <div key={p.name} className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="text-sm font-bold text-gray-900">{p.name}</span>
                  <span className="font-mono text-lg font-black text-violet-700" data-testid="sim-share">{fmtShare(p.share)}</span>
                </div>
                <div className="h-3 w-full rounded-full bg-gray-100" role="img" aria-label={`ส่วนแบ่งความชอบ ${fmtShare(p.share)}`}>
                  <div className="h-3 rounded-full bg-violet-500" style={{ width: `${maxShare ? (p.share / Math.max(maxShare, 0.0001)) * 100 : 0}%` }} />
                </div>
                <p className="mt-1 text-xs text-gray-500">{Object.entries(p.levels || {}).map(([k, v]) => `${k}: ${v}`).join(' · ')} · utility {fmtNum(p.utility, 2)}</p>
              </div>
            ))}
          </div>
          {result.heterogeneity_simulated && <p className="mt-2 text-xs text-gray-500">จำลองความต่างของผู้บริโภคด้วย {result.n_draws} ชุดสุ่ม</p>}
        </div>
      )}

      <div className="mt-4 rounded-lg border-2 border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" data-testid="sim-caveats">
        <p className="mb-1 flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" aria-hidden="true" />อ่านตัวเลขนี้อย่างระวัง</p>
        <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed">
          <li><b>นี่คือ “ส่วนแบ่งความชอบ” ไม่ใช่ส่วนแบ่งตลาด</b> — แบบสอบถามไม่มีตัวเลือก “ไม่ซื้อ” จึงไม่รู้ว่ามีคนไม่เลือกสินค้าใดเลยกี่คน และไม่รวมการรู้จักแบรนด์ ช่องทางขาย หรือราคาของคู่แข่งจริง</li>
          <li><b>ข้อจำกัด IIA (วิธีมาตรฐาน MNL)</b> — ถ้าเพิ่มสินค้าที่หน้าตาเกือบเหมือนของเดิมเข้ามา โมเดลจะดึงส่วนแบ่งจากทุกสินค้าในสัดส่วนเท่าเดิม ทั้งที่ในความจริงสินค้าที่คล้ายกันมักแย่งลูกค้ากันเองมากกว่า จึงควรทดสอบกับสินค้าที่ต่างกันพอสมควร หรือใช้ Mixed Logit ซึ่งลดข้อจำกัดนี้</li>
          {(result?.caveats_th || []).map((c, i) => <li key={i}>{c}</li>)}
        </ul>
      </div>
    </Card>
  );
};

export default ConjointSimulatorCard;
