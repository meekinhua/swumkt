import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { cmsApi } from './cmsApi';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

const emptySlide = () => ({
  eyebrow: '', heroPre: ['', ''], heroAccentIdx: 1, lede: '',
  mantra: ['', '', ''], mantraAccentIdx: 1,
  image: '', imageAlt: '', imageCaption: '',
});

const emptyTool = () => ({ tag: '', t: '', s: '', p: '/' });

const DEFAULT_FEATURED_ART = { mode: 'auto', count: 4, ids: [] };
const DEFAULT_FEATURED_BR = { mode: 'auto', count: 5, ids: [] };

const CmsLandingPage = () => {
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [genIdx, setGenIdx] = useState(-1);
  const [articlesPool, setArticlesPool] = useState([]);
  const [brandsPool, setBrandsPool] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const [r, ar, br] = await Promise.all([
        axios.get(`${API}/cms/landing`),
        axios.get(`${API}/cms/posts/public?type=article&limit=200`),
        axios.get(`${API}/brand-equity/showcase`),
      ]);
      const d = r.data;
      // Backfill defaults if missing
      if (!d.featured_articles) d.featured_articles = { ...DEFAULT_FEATURED_ART };
      if (!d.featured_brands) d.featured_brands = { ...DEFAULT_FEATURED_BR };
      setDoc(d);
      setArticlesPool(ar.data?.items || []);
      setBrandsPool(br.data?.showcases || []);
    } catch { toast.error('โหลด landing ไม่สำเร็จ'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/cms/landing`, doc, auth());
      toast.success('บันทึก + เผยแพร่หน้าแรกเรียบร้อย');
    } catch (e) { toast.error(e.response?.data?.detail || 'บันทึกไม่สำเร็จ'); }
    finally { setSaving(false); }
  };

  const reset = async () => {
    if (!window.confirm('คืนค่า default ทั้งหมด? เนื้อหาที่แก้จะหายไป')) return;
    try {
      const r = await axios.post(`${API}/cms/landing/reset`, {}, auth());
      setDoc(r.data);
      toast.success('คืนค่า default แล้ว');
    } catch { toast.error('Reset ไม่สำเร็จ'); }
  };

  const generateSlideImage = async (idx) => {
    const slide = doc.slides[idx];
    const desc = slide.imageAlt || slide.heroPre?.join(' ') || 'editorial photograph';
    setGenIdx(idx);
    try {
      const r = await cmsApi.aiImage({
        prompt: `${desc}. Editorial cover photo for a Thai marketing research platform hero section. Modern Thai+international consumer context. No text on image.`,
        aspect: '4:3',
      });
      updateSlide(idx, 'image', r.data.image_data_url);
      toast.success('สร้างภาพ AI เสร็จแล้ว');
    } catch (e) { toast.error(e.response?.data?.detail || 'สร้างภาพไม่สำเร็จ'); }
    finally { setGenIdx(-1); }
  };

  const updateSlide = (i, key, val) => {
    setDoc(d => {
      const slides = [...d.slides];
      slides[i] = { ...slides[i], [key]: val };
      return { ...d, slides };
    });
  };
  const moveSlide = (i, dir) => {
    setDoc(d => {
      const slides = [...d.slides];
      const j = i + dir;
      if (j < 0 || j >= slides.length) return d;
      [slides[i], slides[j]] = [slides[j], slides[i]];
      return { ...d, slides };
    });
  };
  const addSlide = () => setDoc(d => ({ ...d, slides: [...d.slides, emptySlide()] }));
  const removeSlide = (i) => {
    if (doc.slides.length <= 1) { toast.error('ต้องมีอย่างน้อย 1 slide'); return; }
    setDoc(d => ({ ...d, slides: d.slides.filter((_, k) => k !== i) }));
  };

  const updateTool = (i, key, val) => {
    setDoc(d => {
      const tools = [...d.tools];
      tools[i] = { ...tools[i], [key]: val };
      return { ...d, tools };
    });
  };
  const moveTool = (i, dir) => {
    setDoc(d => {
      const tools = [...d.tools];
      const j = i + dir;
      if (j < 0 || j >= tools.length) return d;
      [tools[i], tools[j]] = [tools[j], tools[i]];
      return { ...d, tools };
    });
  };
  const addTool = () => setDoc(d => ({ ...d, tools: [...d.tools, emptyTool()] }));
  const removeTool = (i) => setDoc(d => ({ ...d, tools: d.tools.filter((_, k) => k !== i) }));

  const updateSection = (key, field, val) => {
    setDoc(d => ({ ...d, [key]: { ...d[key], [field]: val } }));
  };

  if (loading || !doc) return <div className="p-8 text-neutral-500">Loading...</div>;

  return (
    <div className="min-h-screen bg-neutral-50" data-testid="cms-landing-page">
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/admin/cms" className="text-sm font-mono uppercase tracking-wider hover:underline">← CMS</Link>
            <span className="text-neutral-300">|</span>
            <div>
              <div className="text-xs font-mono uppercase tracking-widest text-red-600">● Landing Page Manager</div>
              <h1 className="text-xl font-serif tracking-tight">จัดการหน้าแรก / Home</h1>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={reset} data-testid="landing-reset-btn"
                    className="px-4 py-2 border border-red-500 text-red-600 text-xs font-mono uppercase rounded-full hover:bg-red-50">
              Reset Default
            </button>
            <button onClick={save} disabled={saving} data-testid="landing-save-btn"
                    className="px-5 py-2 bg-blue-600 text-white text-sm font-mono uppercase rounded-full hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save & Publish →'}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {/* Rotation timing */}
        <Card title="● Rotation">
          <Field label="Auto-rotate interval (ms)" type="number"
                 value={doc.rotation_ms}
                 testid="landing-rotation-ms"
                 on={v => setDoc(d => ({ ...d, rotation_ms: parseInt(v) || 5500 }))}/>
        </Card>

        {/* Hero slides */}
        <Card title={`● Hero Slides (${doc.slides.length})`} action={
          <button onClick={addSlide} data-testid="landing-add-slide-btn"
                  className="px-3 py-1 text-xs font-mono uppercase border border-neutral-900 rounded-full">
            + Add Slide
          </button>
        }>
          <div className="space-y-3" data-testid="landing-slides-list">
            {doc.slides.map((s, i) => (
              <div key={i} data-testid={`landing-slide-${i}`}
                   className="border border-neutral-200 rounded-lg p-4 bg-neutral-50/50">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs font-mono uppercase text-red-600">Slide {String(i + 1).padStart(2, '0')}</div>
                  <div className="flex gap-1">
                    <IconBtn onClick={() => moveSlide(i, -1)} disabled={i === 0} testid={`slide-up-${i}`}>↑</IconBtn>
                    <IconBtn onClick={() => moveSlide(i, +1)} disabled={i === doc.slides.length - 1} testid={`slide-down-${i}`}>↓</IconBtn>
                    <IconBtn onClick={() => removeSlide(i)} testid={`slide-remove-${i}`} danger>×</IconBtn>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="Eyebrow" value={s.eyebrow} on={v => updateSlide(i, 'eyebrow', v)} testid={`slide-${i}-eyebrow`}/>
                  <Field label="Caption (image badge)" value={s.imageCaption} on={v => updateSlide(i, 'imageCaption', v)} testid={`slide-${i}-caption`}/>
                </div>

                <div className="mt-3">
                  <label className="block text-xs font-mono uppercase tracking-wider mb-1">Headline lines (each on own line)</label>
                  <textarea value={(s.heroPre || []).join('\n')} rows={3}
                            onChange={e => updateSlide(i, 'heroPre', e.target.value.split('\n'))}
                            data-testid={`slide-${i}-hero`}
                            className="w-full border border-neutral-300 rounded px-3 py-2 text-sm font-serif"/>
                  <Field label="Accent line index (0 = first line, 1 = second...)" type="number"
                         value={s.heroAccentIdx}
                         on={v => updateSlide(i, 'heroAccentIdx', parseInt(v) || 0)}
                         testid={`slide-${i}-heroaccentidx`}/>
                </div>

                <div className="mt-3">
                  <Label>Lede paragraph</Label>
                  <textarea value={s.lede} rows={3}
                            onChange={e => updateSlide(i, 'lede', e.target.value)}
                            data-testid={`slide-${i}-lede`}
                            className="w-full border border-neutral-300 rounded px-3 py-2 text-sm"/>
                </div>

                <div className="mt-3">
                  <label className="block text-xs font-mono uppercase tracking-wider mb-1">Mantra words (· separator, each on own line)</label>
                  <textarea value={(s.mantra || []).join('\n')} rows={3}
                            onChange={e => updateSlide(i, 'mantra', e.target.value.split('\n'))}
                            data-testid={`slide-${i}-mantra`}
                            className="w-full border border-neutral-300 rounded px-3 py-2 text-sm font-serif"/>
                  <Field label="Mantra accent word index" type="number"
                         value={s.mantraAccentIdx}
                         on={v => updateSlide(i, 'mantraAccentIdx', parseInt(v) || 0)}
                         testid={`slide-${i}-mantraaccentidx`}/>
                </div>

                {/* Image */}
                <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <Label>Image URL or AI-generated data URL</Label>
                    <input value={s.image || ''}
                           onChange={e => updateSlide(i, 'image', e.target.value)}
                           data-testid={`slide-${i}-image`}
                           className="w-full border border-neutral-300 rounded px-3 py-2 text-sm font-mono"/>
                    <Field label="Image alt (also used as AI prompt seed)"
                           value={s.imageAlt || ''} on={v => updateSlide(i, 'imageAlt', v)}
                           testid={`slide-${i}-imagealt`}/>
                    <button onClick={() => generateSlideImage(i)} disabled={genIdx === i}
                            data-testid={`slide-${i}-ai-image-btn`}
                            className="mt-2 px-4 py-1.5 bg-blue-600 text-white text-xs font-mono uppercase rounded-full disabled:opacity-50">
                      {genIdx === i ? '⏳ Generating...' : '✨ AI Generate Image'}
                    </button>
                  </div>
                  <div>
                    {s.image ? (
                      <img src={s.image} alt="preview" data-testid={`slide-${i}-preview`}
                           className="w-full rounded border border-neutral-200 aspect-[4/3] object-cover"/>
                    ) : (
                      <div className="w-full aspect-[4/3] border-2 border-dashed border-neutral-300 rounded flex items-center justify-center text-neutral-400 text-xs">
                        no image
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Tools */}
        <Card title={`● Open Tools (${doc.tools.length})`} action={
          <button onClick={addTool} data-testid="landing-add-tool-btn"
                  className="px-3 py-1 text-xs font-mono uppercase border border-neutral-900 rounded-full">
            + Add Tool
          </button>
        }>
          <div className="grid grid-cols-1 gap-2" data-testid="landing-tools-list">
            {doc.tools.map((t, i) => (
              <div key={i} data-testid={`landing-tool-${i}`}
                   className="border border-neutral-200 rounded-lg p-3 grid grid-cols-1 md:grid-cols-12 gap-2 items-start">
                <input value={t.tag} onChange={e => updateTool(i, 'tag', e.target.value)}
                       placeholder="TAG" data-testid={`tool-${i}-tag`}
                       className="md:col-span-2 border border-neutral-300 rounded px-2 py-1.5 text-xs font-mono uppercase"/>
                <input value={t.t} onChange={e => updateTool(i, 't', e.target.value)}
                       placeholder="Title" data-testid={`tool-${i}-title`}
                       className="md:col-span-3 border border-neutral-300 rounded px-2 py-1.5 text-sm font-serif"/>
                <input value={t.s} onChange={e => updateTool(i, 's', e.target.value)}
                       placeholder="Subtitle / description" data-testid={`tool-${i}-sub`}
                       className="md:col-span-4 border border-neutral-300 rounded px-2 py-1.5 text-sm"/>
                <input value={t.p} onChange={e => updateTool(i, 'p', e.target.value)}
                       placeholder="/path" data-testid={`tool-${i}-path`}
                       className="md:col-span-2 border border-neutral-300 rounded px-2 py-1.5 text-sm font-mono"/>
                <div className="md:col-span-1 flex gap-1 justify-end">
                  <IconBtn onClick={() => moveTool(i, -1)} disabled={i === 0} testid={`tool-up-${i}`}>↑</IconBtn>
                  <IconBtn onClick={() => moveTool(i, +1)} disabled={i === doc.tools.length - 1} testid={`tool-down-${i}`}>↓</IconBtn>
                  <IconBtn onClick={() => removeTool(i)} testid={`tool-remove-${i}`} danger>×</IconBtn>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Knowledge Hub */}
        <Card title="● Knowledge Hub Section">
          <SectionEditor data={doc.knowledge_hub} on={(f, v) => updateSection('knowledge_hub', f, v)} prefix="kh"/>
        </Card>

        {/* Featured Articles */}
        <Card title="● Featured Articles (หน้าแรก)">
          <FeaturedPicker
            label="บทความ"
            config={doc.featured_articles}
            on={(field, val) => setDoc(d => ({ ...d, featured_articles: { ...d.featured_articles, [field]: val } }))}
            pool={articlesPool}
            getId={(a) => a.slug}
            getTitle={(a) => a.title}
            getSubtitle={(a) => `${a.category || '-'} · ${a.read_min || 5} min`}
            prefix="art"
          />
        </Card>

        {/* Featured Brands */}
        <Card title="● Featured Brands (หน้าแรก)">
          <FeaturedPicker
            label="แบรนด์"
            config={doc.featured_brands}
            on={(field, val) => setDoc(d => ({ ...d, featured_brands: { ...d.featured_brands, [field]: val } }))}
            pool={brandsPool}
            getId={(s) => s.id}
            getTitle={(s) => s.brand_name || s.name || s.title || '(untitled)'}
            getSubtitle={(s) => `${s.category || '-'} · n=${s.response_count || 0}`}
            prefix="br"
          />
        </Card>

        {/* About Band */}
        <Card title="● About Band (dark)">
          <SectionEditor data={doc.about_band} on={(f, v) => updateSection('about_band', f, v)} prefix="ab"/>
        </Card>

        <div className="text-center pt-4">
          <button onClick={save} disabled={saving} data-testid="landing-save-bottom-btn"
                  className="px-8 py-3 bg-blue-600 text-white text-sm font-mono uppercase rounded-full hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save & Publish →'}
          </button>
        </div>
      </div>
    </div>
  );
};

const FeaturedPicker = ({ label, config, on, pool, getId, getTitle, getSubtitle, prefix }) => {
  const cfg = config || { mode: 'auto', count: 4, ids: [] };
  const toggleId = (id) => {
    const ids = cfg.ids || [];
    on('ids', ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  };
  const moveId = (i, dir) => {
    const ids = [...(cfg.ids || [])];
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    on('ids', ids);
  };

  return (
    <div className="space-y-3" data-testid={`featured-${prefix}`}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-mono uppercase tracking-wider mb-1">Mode</label>
          <select value={cfg.mode || 'auto'} onChange={e => on('mode', e.target.value)}
                  data-testid={`featured-${prefix}-mode`}
                  className="w-full border border-neutral-300 rounded px-3 py-1.5 text-sm">
            <option value="auto">Auto (ล่าสุด/popular)</option>
            <option value="random">Random (สุ่มจาก pool)</option>
            <option value="fixed">Fixed (admin เลือกเอง)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-mono uppercase tracking-wider mb-1">จำนวนที่จะแสดง</label>
          <input type="number" value={cfg.count || 4}
                 onChange={e => on('count', parseInt(e.target.value) || 4)}
                 data-testid={`featured-${prefix}-count`}
                 className="w-full border border-neutral-300 rounded px-3 py-1.5 text-sm"/>
        </div>
        <div className="flex items-end">
          <div className="text-xs text-neutral-500">
            {cfg.mode === 'auto' && `แสดง ${label} ${cfg.count || 4} ตัวล่าสุด/popular อัตโนมัติ`}
            {cfg.mode === 'random' && `สุ่ม ${cfg.count || 4} ตัวจาก pool ${cfg.ids?.length ? `${cfg.ids.length} ที่เลือกไว้` : 'ทั้งหมด'}`}
            {cfg.mode === 'fixed' && `แสดง ${label} ที่เลือก ${cfg.ids?.length || 0} ตัว ตามลำดับ (ไม่เกิน ${cfg.count || 4})`}
          </div>
        </div>
      </div>

      {/* Selected list (ordered, with reorder) */}
      {(cfg.ids || []).length > 0 && (
        <div className="border border-blue-200 rounded p-3 bg-blue-50/40">
          <div className="text-xs font-mono uppercase mb-2 text-blue-700">
            ที่เลือกไว้ ({cfg.ids.length}) — ลากลำดับด้วย ↑↓
          </div>
          <div className="space-y-1" data-testid={`featured-${prefix}-selected`}>
            {(cfg.ids || []).map((id, i) => {
              const item = pool.find(x => getId(x) === id);
              return (
                <div key={id}
                     className="flex items-center gap-2 bg-white border border-neutral-200 rounded px-2 py-1.5">
                  <span className="text-[10px] font-mono text-neutral-400 w-5">{String(i+1).padStart(2,'0')}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-serif truncate">{item ? getTitle(item) : `(missing: ${id})`}</div>
                    <div className="text-[10px] text-neutral-500 truncate">{item ? getSubtitle(item) : id}</div>
                  </div>
                  <IconBtn onClick={() => moveId(i, -1)} disabled={i === 0} testid={`featured-${prefix}-up-${i}`}>↑</IconBtn>
                  <IconBtn onClick={() => moveId(i, +1)} disabled={i === cfg.ids.length - 1} testid={`featured-${prefix}-down-${i}`}>↓</IconBtn>
                  <IconBtn onClick={() => toggleId(id)} testid={`featured-${prefix}-remove-${i}`} danger>×</IconBtn>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pool picker */}
      <details className="border border-neutral-200 rounded">
        <summary className="px-3 py-2 cursor-pointer text-xs font-mono uppercase hover:bg-neutral-50"
                 data-testid={`featured-${prefix}-toggle-pool`}>
          ▸ เลือก {label} ({pool.length} รายการ)
        </summary>
        <div className="max-h-72 overflow-auto border-t border-neutral-200">
          {pool.map(item => {
            const id = getId(item);
            const picked = (cfg.ids || []).includes(id);
            return (
              <button key={id} onClick={() => toggleId(id)}
                      data-testid={`featured-${prefix}-item-${id}`}
                      className={`w-full text-left px-3 py-2 text-xs border-b border-neutral-100 hover:bg-neutral-50 ${picked ? 'bg-blue-50' : ''}`}>
                <div className="font-serif text-sm">{getTitle(item)} {picked && <span className="text-blue-600">· ✓</span>}</div>
                <div className="text-neutral-500">{getSubtitle(item)}</div>
              </button>
            );
          })}
          {pool.length === 0 && <div className="p-4 text-center text-neutral-400 text-xs">— ไม่มี {label} ใน pool —</div>}
        </div>
      </details>
    </div>
  );
};

const SectionEditor = ({ data, on, prefix }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
    <Field label="Eyebrow" value={data.eyebrow} on={v => on('eyebrow', v)} testid={`${prefix}-eyebrow`}/>
    <Field label="Heading (main)" value={data.heading} on={v => on('heading', v)} testid={`${prefix}-heading`}/>
    <Field label="Heading accent (italic word)" value={data.accent} on={v => on('accent', v)} testid={`${prefix}-accent`}/>
    <Field label="CTA label" value={data.cta_label} on={v => on('cta_label', v)} testid={`${prefix}-cta-label`}/>
    <div className="md:col-span-2">
      <Label>Lede / paragraph</Label>
      <textarea value={data.lede} rows={3} onChange={e => on('lede', e.target.value)}
                data-testid={`${prefix}-lede`}
                className="w-full border border-neutral-300 rounded px-3 py-2 text-sm"/>
    </div>
    <Field label="CTA path" value={data.cta_path} on={v => on('cta_path', v)} testid={`${prefix}-cta-path`}/>
  </div>
);

const Card = ({ title, action, children }) => (
  <div className="bg-white border border-neutral-200 rounded-lg p-5">
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-xs font-mono uppercase tracking-widest text-red-600">{title}</h2>
      {action}
    </div>
    {children}
  </div>
);

const Label = ({ children }) => (
  <label className="block text-xs font-mono uppercase tracking-widest text-neutral-700 mb-1">{children}</label>
);

const Field = ({ label, value, on, type, testid }) => (
  <div>
    <Label>{label}</Label>
    <input value={value || ''} type={type || 'text'} onChange={e => on(e.target.value)}
           data-testid={testid}
           className="w-full border border-neutral-300 rounded px-3 py-1.5 text-sm"/>
  </div>
);

const IconBtn = ({ children, onClick, disabled, danger, testid }) => (
  <button onClick={onClick} disabled={disabled} data-testid={testid}
          className={`w-7 h-7 flex items-center justify-center rounded text-xs ${
            danger ? 'border border-red-300 text-red-600 hover:bg-red-50'
                   : 'border border-neutral-300 hover:bg-neutral-100'
          } disabled:opacity-30 disabled:cursor-not-allowed`}>
    {children}
  </button>
);

export default CmsLandingPage;
