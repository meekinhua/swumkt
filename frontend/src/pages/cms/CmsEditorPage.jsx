import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { cmsApi, POST_TYPE_LABEL, SOURCE_TYPE_LABEL } from './cmsApi';
import { youtubeId } from '../../components/SlideMedia';

const CmsEditorPage = () => {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const nav = useNavigate();

  const [post, setPost] = useState({
    type: 'article', title: '', title_en: '', slug: '', category: 'Brand Strategy',
    excerpt: '', body_md: '', cover_image: null, cover_caption: '', read_min: 5,
    tags: [], source_refs: [], status: 'draft',
    media: [], pinned_to_home: false, pinned_order: 0, cta_url: '',
    hero_title_lines: ['', ''], hero_accent_idx: 1,
  });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState({ text: false, image: false, summary: false, translate: false });
  const [allSources, setAllSources] = useState([]);
  const [sourceQuery, setSourceQuery] = useState('');
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [prompts, setPrompts] = useState([]);
  const [selectedTextPrompt, setSelectedTextPrompt] = useState(null);
  const [selectedImagePrompt, setSelectedImagePrompt] = useState(null);
  const [extraPrompt, setExtraPrompt] = useState('');
  const [extraImagePrompt, setExtraImagePrompt] = useState('');
  const [editingTemplate, setEditingTemplate] = useState(false);
  const [editingImageTemplate, setEditingImageTemplate] = useState(false);

  // Load existing post (edit mode)
  useEffect(() => {
    if (isNew) return;
    (async () => {
      setLoading(true);
      try {
        const r = await cmsApi.getPost(id);
        setPost({ ...r.data, source_refs: r.data.source_refs || [], tags: r.data.tags || [] });
      } catch { toast.error('โหลด post ไม่สำเร็จ'); }
      finally { setLoading(false); }
    })();
  }, [id, isNew]);

  // Load prompts + sources
  useEffect(() => {
    (async () => {
      try {
        const [pr, sr] = await Promise.all([cmsApi.listPrompts(), cmsApi.listSources()]);
        setPrompts(pr.data?.items || []);
        setAllSources(sr.data?.items || []);
      } catch (e) { /* silent */ }
    })();
  }, []);

  // Pick default text/image prompts based on post type
  useEffect(() => {
    // For announcement, try to match by category keyword too (กิจกรรม, ประกวด, โครงงาน, อบรม)
    const sameType = prompts.filter(p => p.scope === 'text' && p.post_type === post.type);
    let txt = null;
    if (post.type === 'announcement' && post.category) {
      const cat = String(post.category).toLowerCase();
      const keyMap = [
        ['ประกวด', 'contest'], ['แข่งขัน', 'contest'],
        ['โครงงาน', 'project'], ['วิจัย', 'project'],
        ['อบรม', 'training'], ['workshop', 'training'],
        ['กิจกรรม', 'activity'],
      ];
      for (const [thaiKw, slugKw] of keyMap) {
        if (cat.includes(thaiKw)) {
          txt = sameType.find(p => (p.id || '').includes(slugKw)) || txt;
          if (txt) break;
        }
      }
    }
    if (!txt) {
      txt = sameType.find(p => p.is_default)
         || sameType[0]
         || prompts.find(p => p.scope === 'text' && p.is_default)
         || prompts.find(p => p.scope === 'text');
    }
    const img = prompts.find(p => p.scope === 'image' && p.is_default) || prompts.find(p => p.scope === 'image');
    setSelectedTextPrompt(txt || null);
    setSelectedImagePrompt(img || null);
  }, [prompts, post.type, post.category]);

  const filteredSources = useMemo(() => {
    if (!sourceQuery) return allSources;
    const q = sourceQuery.toLowerCase();
    return allSources.filter(s => (s.title || '').toLowerCase().includes(q) || (s.subtitle || '').toLowerCase().includes(q));
  }, [allSources, sourceQuery]);

  const togglePickSource = (s) => {
    const exists = (post.source_refs || []).find(r => r.type === s.type && r.id === s.id);
    if (exists) {
      setPost({ ...post, source_refs: post.source_refs.filter(r => !(r.type === s.type && r.id === s.id)) });
    } else {
      setPost({ ...post, source_refs: [...(post.source_refs || []), { type: s.type, id: s.id, title: s.title }] });
    }
  };

  const fillTemplate = (tpl) => {
    return (tpl || '').replaceAll('{title}', post.title || '(ยังไม่มีชื่อ)');
  };

  const aiGenerateText = async () => {
    if (!post.title) { toast.error('กรอก title ก่อน เพื่อให้ AI เขียนได้'); return; }
    setBusy(b => ({ ...b, text: true }));
    try {
      const base = fillTemplate(selectedTextPrompt?.template || '');
      const r = await cmsApi.aiText({
        base_prompt: base,
        extra_prompt: extraPrompt,
        sources: post.source_refs || [],
      });
      setPost(p => ({
        ...p,
        body_md: r.data.text,
        generation_meta: { base_prompt_id: selectedTextPrompt?.id, extra_prompt: extraPrompt, model: r.data.model },
      }));
      toast.success('AI เขียนเรียบร้อย — ตรวจ + แก้ได้ตามต้องการ');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'AI text gen ล้มเหลว');
    } finally { setBusy(b => ({ ...b, text: false })); }
  };

  const aiGenerateImage = async () => {
    if (!post.title) { toast.error('กรอก title ก่อน'); return; }
    setBusy(b => ({ ...b, image: true }));
    try {
      const base = fillTemplate(selectedImagePrompt?.template || '');
      const final = extraImagePrompt ? `${base}. ${extraImagePrompt}` : base;
      const r = await cmsApi.aiImage({ prompt: final, aspect: '16:9' });
      setPost(p => ({ ...p, cover_image: r.data.image_data_url }));
      toast.success('สร้างภาพ cover เสร็จแล้ว');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'AI image gen ล้มเหลว');
    } finally { setBusy(b => ({ ...b, image: false })); }
  };

  const aiSummarize = async () => {
    if ((post.source_refs || []).length === 0) { toast.error('เลือก source ก่อน'); return; }
    setBusy(b => ({ ...b, summary: true }));
    try {
      const r = await cmsApi.aiSummarize({ sources: post.source_refs, extra_prompt: extraPrompt });
      setPost(p => ({ ...p, body_md: (p.body_md || '') + '\n\n## สรุป Source\n' + r.data.text }));
      toast.success('สรุปเสร็จ — ต่อท้าย body แล้ว');
    } catch (e) { toast.error(e.response?.data?.detail || 'สรุปล้มเหลว'); }
    finally { setBusy(b => ({ ...b, summary: false })); }
  };

  const aiTranslate = async (to) => {
    if (!post.body_md) { toast.error('ไม่มีเนื้อหาให้แปล'); return; }
    setBusy(b => ({ ...b, translate: true }));
    try {
      const r = await cmsApi.aiTranslate({ text: post.body_md, to });
      setPost(p => ({ ...p, body_md: r.data.text }));
      toast.success(`แปลเป็น ${to.toUpperCase()} แล้ว`);
    } catch (e) { toast.error('แปลล้มเหลว'); }
    finally { setBusy(b => ({ ...b, translate: false })); }
  };

  const save = async (publish = false) => {
    if (!post.title) { toast.error('กรอก title ก่อน'); return; }
    try {
      let saved;
      if (isNew) {
        const r = await cmsApi.createPost(post);
        saved = r.data;
        toast.success('บันทึก draft แล้ว');
        if (publish) {
          await cmsApi.updatePost(saved.id, { status: 'published' });
          toast.success('Published!');
        }
        nav(`/admin/cms/${saved.id}`);
      } else {
        await cmsApi.updatePost(id, { ...post, ...(publish ? { status: 'published' } : {}) });
        toast.success(publish ? 'Published!' : 'บันทึกแล้ว');
      }
    } catch (e) { toast.error(e.response?.data?.detail || 'บันทึกไม่สำเร็จ'); }
  };

  if (loading) return <div className="p-8 text-neutral-500">Loading...</div>;

  return (
    <div className="min-h-screen bg-neutral-50" data-testid="cms-editor-page">
      {/* Header */}
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/admin/cms" className="text-sm font-mono uppercase tracking-wider hover:underline">← CMS</Link>
            <span className="text-neutral-300">|</span>
            <span className="text-xs font-mono uppercase tracking-widest text-red-600">
              {isNew ? '● NEW POST' : `● EDIT · ${post.status?.toUpperCase()}`}
            </span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => save(false)} data-testid="cms-save-draft-btn"
                    className="px-4 py-2 border border-neutral-900 text-sm font-mono uppercase rounded-full">
              Save Draft
            </button>
            <button onClick={() => save(true)} data-testid="cms-publish-btn"
                    className="px-5 py-2 bg-blue-600 text-white text-sm font-mono uppercase rounded-full hover:bg-blue-700">
              Publish →
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left — main content */}
        <div className="lg:col-span-2 space-y-4">
          {/* Title + meta */}
          <Card>
            <Label>Title</Label>
            <input value={post.title} onChange={e => setPost({...post, title: e.target.value})}
                   data-testid="cms-input-title"
                   className="w-full text-3xl font-serif border-b border-neutral-200 focus:border-neutral-900 outline-none py-2"
                   placeholder="ชื่อบทความ — เช่น การอ่านใจ Gen Z ผ่าน Brand Loyalty"/>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
              <SelectField label="ประเภท" value={post.type} testid="cms-input-type"
                           on={v => setPost({...post, type: v})}
                           options={[['article','บทความ'],['insight','Insight'],['case_story','Case Story'],['announcement','📣 ประชาสัมพันธ์']]}/>
              <Field label="Category" value={post.category} testid="cms-input-category"
                     on={v => setPost({...post, category: v})}/>
              <Field label="Slug (auto)" value={post.slug || ''} testid="cms-input-slug"
                     on={v => setPost({...post, slug: v})}/>
              <Field label="Read min" value={post.read_min} testid="cms-input-readmin"
                     type="number" on={v => setPost({...post, read_min: parseInt(v) || 5})}/>
            </div>

            {/* Announcement-specific: pin to home hero */}
            {post.type === 'announcement' && (
              <>
                <div className="mt-4 p-3 rounded border-2 border-yellow-300 bg-yellow-50 flex flex-wrap items-center gap-4"
                     data-testid="cms-announcement-pin-block">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={!!post.pinned_to_home}
                           onChange={e => setPost({...post, pinned_to_home: e.target.checked})}
                           data-testid="cms-pin-toggle"/>
                    <span className="text-sm font-bold">📌 ปักหมุดบนหน้าแรก (Hero)</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-neutral-600">ลำดับ:</span>
                    <input type="number" value={post.pinned_order ?? 0}
                           onChange={e => setPost({...post, pinned_order: parseInt(e.target.value) || 0})}
                           data-testid="cms-pin-order"
                           className="w-20 border border-neutral-300 rounded px-2 py-1 text-sm"/>
                    <span className="text-[11px] text-neutral-500">เลขน้อย = แสดงก่อน</span>
                  </div>
                  <span className="text-[11px] text-neutral-500 italic">
                    เลิกปักหมุดได้ตลอด — เนื้อหายังเก็บไว้ในหน้า ประชาสัมพันธ์
                  </span>
                </div>

                {/* CTA URL for announcement — overrides default /learn/{slug} */}
                <div className="mt-3 p-3 rounded border-2 border-red-200 bg-red-50/50"
                     data-testid="cms-announcement-cta-block">
                  <Label>🔗 CTA URL — ลิงก์ปลายทางเมื่อคลิก hero ของข่าวนี้</Label>
                  <input value={post.cta_url || ''}
                         onChange={e => setPost({...post, cta_url: e.target.value})}
                         placeholder="/learn/my-slug  หรือ  https://example.com/news"
                         data-testid="cms-input-cta-url"
                         className="w-full border border-neutral-300 rounded px-3 py-2 text-sm font-mono"/>
                  <p className="text-[11px] text-neutral-500 mt-1 italic">
                    ว่างไว้ = ไปหน้ารายละเอียดอัตโนมัติ (<code className="font-mono">/learn/{post.slug || '{slug}'}</code>) ·
                    รองรับทั้ง internal path และ external URL (เปิดแท็บใหม่)
                  </p>
                </div>

                {/* Hero short headline — overrides post.title when shown in homepage hero */}
                {(() => {
                  const lines = post.hero_title_lines && post.hero_title_lines.length
                    ? post.hero_title_lines
                    : ['', ''];
                  const setLine = (idx, v) => {
                    const next = [lines[0] || '', lines[1] || ''];
                    next[idx] = v;
                    setPost({ ...post, hero_title_lines: next });
                  };
                  const accent = post.hero_accent_idx ?? 1;
                  return (
                    <div className="mt-3 p-3 rounded border-2 border-blue-200 bg-blue-50/50"
                         data-testid="cms-hero-title-block">
                      <Label>✨ พาดหัวสั้นสำหรับ Hero หน้าแรก (ถ้าเว้นว่างจะใช้ title ปกติ)</Label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1">
                        <div>
                          <div className="text-[10px] font-mono uppercase text-neutral-500 mb-1">
                            บรรทัด 1 {accent === 0 && <span className="text-red-600">(เน้นสีแดง · italic)</span>}
                          </div>
                          <input value={lines[0] || ''}
                                 onChange={e => setLine(0, e.target.value)}
                                 placeholder="เช่น งานสัมมนา"
                                 maxLength={60}
                                 data-testid="cms-hero-line-0"
                                 className="w-full border border-neutral-300 rounded px-3 py-2 text-sm font-serif"/>
                        </div>
                        <div>
                          <div className="text-[10px] font-mono uppercase text-neutral-500 mb-1">
                            บรรทัด 2 {accent === 1 && <span className="text-red-600">(เน้นสีแดง · italic)</span>}
                          </div>
                          <input value={lines[1] || ''}
                                 onChange={e => setLine(1, e.target.value)}
                                 placeholder="เช่น Brand Equity 2026"
                                 maxLength={60}
                                 data-testid="cms-hero-line-1"
                                 className="w-full border border-neutral-300 rounded px-3 py-2 text-sm font-serif"/>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <span className="text-[11px] font-mono uppercase text-neutral-600">เน้นสีแดงที่:</span>
                        <label className="inline-flex items-center gap-1 text-xs cursor-pointer">
                          <input type="radio" name="hero-accent" checked={accent === 0}
                                 onChange={() => setPost({ ...post, hero_accent_idx: 0 })}
                                 data-testid="cms-hero-accent-0"/>
                          บรรทัด 1
                        </label>
                        <label className="inline-flex items-center gap-1 text-xs cursor-pointer">
                          <input type="radio" name="hero-accent" checked={accent === 1}
                                 onChange={() => setPost({ ...post, hero_accent_idx: 1 })}
                                 data-testid="cms-hero-accent-1"/>
                          บรรทัด 2
                        </label>
                        <span className="text-[11px] text-neutral-500 italic">
                          (สูงสุดบรรทัดละ 60 ตัวอักษร)
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </>
            )}

            <div className="mt-4">
              <Label>Excerpt</Label>
              <textarea value={post.excerpt} onChange={e => setPost({...post, excerpt: e.target.value})}
                        rows={2} data-testid="cms-input-excerpt"
                        className="w-full border border-neutral-300 rounded px-3 py-2 text-sm"/>
            </div>
          </Card>

          {/* Cover image */}
          <Card>
            <div className="flex items-center justify-between mb-2">
              <Label>Cover Image</Label>
              <button onClick={aiGenerateImage} disabled={busy.image} data-testid="cms-ai-image-btn"
                      className="text-xs font-mono uppercase tracking-wider px-3 py-1.5 bg-blue-600 text-white rounded-full disabled:opacity-50">
                {busy.image ? '⏳ Generating...' : '✨ AI Generate Image'}
              </button>
            </div>
            {post.cover_image ? (
              <div className="relative">
                <img src={post.cover_image} alt="cover" className="w-full rounded border" data-testid="cms-cover-preview"/>
                <button onClick={() => setPost({...post, cover_image: null})}
                        className="absolute top-2 right-2 bg-white/90 border px-2 py-1 text-xs rounded">Remove</button>
              </div>
            ) : (
              <div className="border-2 border-dashed border-neutral-300 rounded p-8 text-center text-neutral-400 text-sm">
                ยังไม่มี cover image — กด AI Generate ด้านบน หรือ paste URL ด้านล่าง
              </div>
            )}
            <input value={typeof post.cover_image === 'string' && !post.cover_image.startsWith('data:') ? post.cover_image : ''}
                   onChange={e => setPost({...post, cover_image: e.target.value})}
                   placeholder="หรือ paste image URL"
                   className="mt-2 w-full text-sm border border-neutral-300 rounded px-3 py-2"/>
            <input value={post.cover_caption || ''} onChange={e => setPost({...post, cover_caption: e.target.value})}
                   placeholder="Caption (optional)"
                   className="mt-2 w-full text-sm border border-neutral-300 rounded px-3 py-2"
                   data-testid="cms-input-cover-caption"/>

            {/* Image prompt edit */}
            <div className="mt-3 border-t border-neutral-100 pt-3">
              <button onClick={() => setEditingImageTemplate(v => !v)}
                      className="text-xs font-mono uppercase text-blue-600 hover:underline">
                {editingImageTemplate ? '▾ ซ่อน prompt ตั้งต้น' : '▸ ปรับ prompt รูป (ตั้งต้น + เพิ่ม)'}
              </button>
              {editingImageTemplate && (
                <div className="mt-2 space-y-2">
                  <div className="text-[10px] font-mono uppercase text-neutral-500">Base ({selectedImagePrompt?.name})</div>
                  <pre className="text-xs bg-neutral-50 p-2 rounded font-mono whitespace-pre-wrap">{fillTemplate(selectedImagePrompt?.template || '')}</pre>
                  <input value={extraImagePrompt} onChange={e => setExtraImagePrompt(e.target.value)}
                         placeholder="Extra prompt (เช่น 'aerial view, dramatic light')"
                         data-testid="cms-image-extra"
                         className="w-full text-sm border border-neutral-300 rounded px-3 py-2"/>
                </div>
              )}
            </div>
          </Card>

          {/* Media gallery — multi-image + YouTube สำหรับทุก post type */}
          <Card>
            <div className="flex items-center justify-between mb-1">
              <Label>
                {post.type === 'announcement'
                  ? '📣 Media Gallery — ภาพ + วิดีโอ (สลับใน hero แต่ละสไลด์)'
                  : '🖼 รูปประกอบ + วิดีโอ YouTube (แสดงในหน้าบทความ)'}
              </Label>
              <span className="text-[11px] text-neutral-500">{(post.media || []).length} items</span>
            </div>
            <div className="text-[11px] text-neutral-500 mb-3 italic">
              {post.type === 'announcement'
                ? 'Media จะหมุนใน hero สไลด์เมื่อปักหมุดบนหน้าแรก'
                : 'อัปโหลดรูปได้หลายรูป (≤4MB) หรือแนบลิงก์ YouTube — จะปรากฏใต้ cover ในหน้าบทความ'}
            </div>
            <PostMediaEditor items={post.media || []}
                             onChange={(next) => setPost({...post, media: next})}/>
          </Card>

          {/* Body editor */}
          <Card>
            <div className="flex items-center justify-between mb-2">
              <Label>Body (Markdown)</Label>
              <div className="flex gap-1">
                <button onClick={() => aiTranslate('en')} disabled={busy.translate} data-testid="cms-translate-en"
                        className="text-[10px] font-mono uppercase px-2 py-1 border rounded">→ EN</button>
                <button onClick={() => aiTranslate('th')} disabled={busy.translate} data-testid="cms-translate-th"
                        className="text-[10px] font-mono uppercase px-2 py-1 border rounded">→ TH</button>
              </div>
            </div>
            <textarea value={post.body_md} onChange={e => setPost({...post, body_md: e.target.value})}
                      rows={20} data-testid="cms-input-body"
                      className="w-full border border-neutral-300 rounded px-3 py-2 font-mono text-sm leading-relaxed"
                      placeholder="# Body content (Markdown)..."/>
            <div className="text-xs text-neutral-400 mt-1">{(post.body_md || '').length} chars</div>
          </Card>
        </div>

        {/* Right — AI sidebar */}
        <div className="space-y-4">
          {/* Source picker */}
          <Card>
            <div className="flex items-center justify-between mb-2">
              <Label>Sources ({(post.source_refs || []).length})</Label>
              <button onClick={() => setShowSourcePicker(v => !v)} data-testid="cms-toggle-source-picker"
                      className="text-xs font-mono uppercase text-blue-600 hover:underline">
                {showSourcePicker ? '▾ Hide' : '▸ Pick'}
              </button>
            </div>
            <div className="text-xs text-neutral-500 mb-2">
              เลือกข้อมูลจากระบบ ให้ AI ใช้อ้างอิงตอนเขียน — Brand Equity, Conjoint, หรือ post อื่น
            </div>

            {/* Selected chips */}
            {(post.source_refs || []).length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2" data-testid="cms-selected-sources">
                {(post.source_refs || []).map(s => (
                  <span key={`${s.type}-${s.id}`}
                        className="text-[10px] font-mono uppercase bg-blue-50 text-blue-700 px-2 py-1 rounded-full inline-flex items-center gap-1">
                    {SOURCE_TYPE_LABEL[s.type]} · {s.title?.slice(0, 24)}
                    <button onClick={() => setPost({...post, source_refs: post.source_refs.filter(r => !(r.type===s.type && r.id===s.id))})}
                            className="hover:text-red-600">×</button>
                  </span>
                ))}
              </div>
            )}

            {showSourcePicker && (
              <>
                <input value={sourceQuery} onChange={e => setSourceQuery(e.target.value)}
                       placeholder="Search sources..."
                       data-testid="cms-source-search"
                       className="w-full text-sm border border-neutral-300 rounded px-3 py-2 mb-2"/>
                <div className="max-h-72 overflow-auto border border-neutral-200 rounded">
                  {filteredSources.map(s => {
                    const picked = (post.source_refs || []).some(r => r.type===s.type && r.id===s.id);
                    return (
                      <button key={`${s.type}-${s.id}`} onClick={() => togglePickSource(s)}
                              data-testid={`cms-source-${s.type}-${s.id}`}
                              className={`w-full text-left px-3 py-2 text-xs border-b border-neutral-100 hover:bg-neutral-50 ${picked ? 'bg-blue-50' : ''}`}>
                        <div className="font-mono text-[9px] uppercase text-red-600">{SOURCE_TYPE_LABEL[s.type]}{picked ? ' · ✓' : ''}</div>
                        <div className="font-serif">{s.title}</div>
                        <div className="text-neutral-500">{s.subtitle}</div>
                      </button>
                    );
                  })}
                  {filteredSources.length === 0 && <div className="p-4 text-center text-neutral-400 text-xs">— ไม่พบ source —</div>}
                </div>
                <button onClick={aiSummarize} disabled={busy.summary || (post.source_refs || []).length === 0}
                        data-testid="cms-ai-summarize-btn"
                        className="mt-2 w-full text-xs font-mono uppercase px-3 py-2 border border-blue-500 text-blue-600 rounded hover:bg-blue-50 disabled:opacity-50">
                  {busy.summary ? '⏳ Summarizing...' : 'Summarize Sources → Body'}
                </button>
              </>
            )}
          </Card>

          {/* AI text gen */}
          <Card>
            <Label>✨ AI Write Body</Label>
            <div className="text-xs text-neutral-500 mb-2">ใช้ template ตั้งต้น + extra prompt + sources</div>

            <div className="text-[10px] font-mono uppercase text-neutral-500 mt-2">Base Template</div>
            <select value={selectedTextPrompt?.id || ''}
                    onChange={e => setSelectedTextPrompt(prompts.find(p => p.id === e.target.value))}
                    data-testid="cms-prompt-select"
                    className="w-full text-sm border border-neutral-300 rounded px-2 py-1.5 mt-1">
              {(() => {
                const all = prompts.filter(p => p.scope === 'text');
                const matching = all.filter(p => p.post_type === post.type);
                const generic = all.filter(p => !p.post_type);
                const others = all.filter(p => p.post_type && p.post_type !== post.type);
                return (
                  <>
                    {matching.length > 0 && (
                      <optgroup label={`◆ สำหรับ ${post.type}`}>
                        {matching.map(p => (
                          <option key={p.id} value={p.id}>{p.name} {p.is_default ? '(★)' : ''}</option>
                        ))}
                      </optgroup>
                    )}
                    {generic.length > 0 && (
                      <optgroup label="◇ ทั่วไป">
                        {generic.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </optgroup>
                    )}
                    {others.length > 0 && (
                      <optgroup label="∙ ของ post type อื่น">
                        {others.map(p => (
                          <option key={p.id} value={p.id}>{p.name} ({p.post_type})</option>
                        ))}
                      </optgroup>
                    )}
                  </>
                );
              })()}
            </select>

            <button onClick={() => setEditingTemplate(v => !v)}
                    className="text-xs font-mono uppercase text-blue-600 hover:underline mt-2">
              {editingTemplate ? '▾ ซ่อน preview' : '▸ Preview prompt'}
            </button>
            {editingTemplate && (
              <pre className="text-xs bg-neutral-50 p-2 rounded mt-1 font-mono whitespace-pre-wrap max-h-48 overflow-auto">
                {fillTemplate(selectedTextPrompt?.template || '')}
              </pre>
            )}

            <div className="text-[10px] font-mono uppercase text-neutral-500 mt-3">Extra Prompt (เสริม)</div>
            <textarea value={extraPrompt} onChange={e => setExtraPrompt(e.target.value)}
                      placeholder="เช่น 'เน้นมุม Gen Z, ยกตัวอย่าง 7-Eleven, จบด้วยคำถามชวนคิด'"
                      data-testid="cms-extra-prompt"
                      rows={3}
                      className="w-full text-sm border border-neutral-300 rounded px-3 py-2 mt-1"/>

            <button onClick={aiGenerateText} disabled={busy.text} data-testid="cms-ai-text-btn"
                    className="mt-3 w-full px-4 py-2 bg-blue-600 text-white text-sm font-mono uppercase rounded-full disabled:opacity-50">
              {busy.text ? '⏳ Writing...' : '✨ Generate Body'}
            </button>
            <div className="text-[10px] text-neutral-400 mt-1 text-center">จะ overwrite body ปัจจุบัน</div>
          </Card>
        </div>
      </div>
    </div>
  );
};

const Card = ({ children }) => (
  <div className="bg-white border border-neutral-200 rounded-lg p-4">{children}</div>
);
const Label = ({ children }) => (
  <label className="block text-xs font-mono uppercase tracking-widest text-neutral-700 mb-1">{children}</label>
);
const Field = ({ label, value, on, type, testid }) => (
  <div>
    <Label>{label}</Label>
    <input value={value || ''} type={type || 'text'} onChange={e => on(e.target.value)} data-testid={testid}
           className="w-full border border-neutral-300 rounded px-3 py-1.5 text-sm"/>
  </div>
);
const SelectField = ({ label, value, on, options, testid }) => (
  <div>
    <Label>{label}</Label>
    <select value={value} onChange={e => on(e.target.value)} data-testid={testid}
            className="w-full border border-neutral-300 rounded px-3 py-1.5 text-sm">
      {options.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  </div>
);

// Multi-media editor for announcement posts (Image + YouTube)
const PostMediaEditor = ({ items, onChange }) => {
  const update = (idx, key, val) => onChange(items.map((m, i) => i === idx ? { ...m, [key]: val } : m));
  const remove = (idx) => onChange(items.filter((_, i) => i !== idx));
  const move = (idx, dir) => {
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  };
  const addImage = () => onChange([...items, { kind: 'image', src: '', alt: '', caption: '' }]);
  const addYoutube = () => onChange([...items, { kind: 'youtube', src: '', alt: '', caption: '' }]);
  const onUpload = (idx, file) => {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { toast.error('ไฟล์ใหญ่เกิน 4MB'); return; }
    const reader = new FileReader();
    reader.onload = (e) => update(idx, 'src', String(e.target?.result || ''));
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-3" data-testid="post-media-editor">
      <div className="flex gap-2">
        <button onClick={addImage} data-testid="post-media-add-image"
                className="px-3 py-1.5 text-xs font-mono uppercase border border-neutral-900 rounded-full hover:bg-neutral-900 hover:text-white">
          + Image
        </button>
        <button onClick={addYoutube} data-testid="post-media-add-youtube"
                className="px-3 py-1.5 text-xs font-mono uppercase border border-red-600 text-red-600 rounded-full hover:bg-red-600 hover:text-white">
          + YouTube
        </button>
      </div>
      {items.length === 0 && (
        <div className="text-xs text-neutral-500 italic py-3">
          ยังไม่มี media — กดปุ่ม + Image หรือ + YouTube เพื่อแนบ
        </div>
      )}
      {items.map((m, i) => {
        const ytId = m.kind === 'youtube' ? youtubeId(m.src) : '';
        return (
          <div key={i} className="grid grid-cols-12 gap-2 items-start p-2 border border-neutral-200 rounded bg-neutral-50"
               data-testid={`post-media-item-${i}`}>
            <div className="col-span-12 md:col-span-1 flex md:flex-col items-center gap-1">
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded
                                ${m.kind === 'youtube' ? 'bg-red-100 text-red-700' : 'bg-neutral-200 text-neutral-700'}`}>
                {m.kind === 'youtube' ? 'YT' : 'IMG'}
              </span>
              <button onClick={() => move(i, -1)} disabled={i === 0} className="text-xs px-1 disabled:opacity-30">▲</button>
              <button onClick={() => move(i, 1)} disabled={i === items.length - 1} className="text-xs px-1 disabled:opacity-30">▼</button>
            </div>
            <div className="col-span-12 md:col-span-7 space-y-1">
              <input value={m.src || ''} onChange={e => update(i, 'src', e.target.value)}
                     placeholder={m.kind === 'youtube' ? 'https://youtube.com/watch?v=...' : 'https://... หรือ data:image/...;base64,...'}
                     data-testid={`post-media-src-${i}`}
                     className="w-full border border-neutral-300 rounded px-2 py-1 text-xs font-mono"/>
              <input value={m.caption || ''} onChange={e => update(i, 'caption', e.target.value)}
                     placeholder="คำบรรยายภาพ (ไม่บังคับ)"
                     data-testid={`post-media-caption-${i}`}
                     className="w-full border border-neutral-300 rounded px-2 py-1 text-xs"/>
              {m.kind === 'image' && (
                <label className="inline-flex text-[10px] font-mono uppercase border border-neutral-400 rounded px-2 py-1 cursor-pointer hover:bg-neutral-900 hover:text-white">
                  ↑ Upload (≤ 4MB)
                  <input type="file" accept="image/*" hidden onChange={e => onUpload(i, e.target.files?.[0])}
                         data-testid={`post-media-upload-${i}`}/>
                </label>
              )}
              {m.kind === 'youtube' && m.src && !ytId && (
                <div className="text-[10px] text-red-600">⚠ URL/ID ไม่ valid</div>
              )}
            </div>
            <div className="col-span-12 md:col-span-3">
              {m.kind === 'image' && m.src && (
                <img src={m.src} alt="preview" className="w-full aspect-video object-cover rounded border border-neutral-200"/>
              )}
              {m.kind === 'youtube' && ytId && (
                <img src={`https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`} alt="yt preview"
                     className="w-full aspect-video object-cover rounded border border-red-200"/>
              )}
              {(!m.src || (m.kind === 'youtube' && !ytId)) && (
                <div className="w-full aspect-video border-2 border-dashed border-neutral-300 rounded flex items-center justify-center text-[10px] text-neutral-400">
                  no preview
                </div>
              )}
            </div>
            <div className="col-span-12 md:col-span-1 flex justify-end">
              <button onClick={() => remove(i)} title="Remove" className="text-xs px-2 py-1 text-red-600 hover:bg-red-50 rounded">✕</button>
            </div>
          </div>
        );
      })}
    </div>
  );
};



export default CmsEditorPage;
