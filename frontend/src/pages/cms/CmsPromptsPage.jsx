import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { cmsApi } from './cmsApi';

const SCOPE_LABEL = {
  text: 'Text (Article body)',
  image: 'Image (Cover)',
  summary: 'Summary',
  translate: 'Translate',
};

const CmsPromptsPage = () => {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    try {
      const r = await cmsApi.listPrompts();
      setItems(r.data?.items || []);
    } catch { toast.error('โหลดไม่สำเร็จ'); }
  };
  useEffect(() => { load(); }, []);

  const save = async (data) => {
    try {
      if (data.id) {
        await cmsApi.updatePrompt(data.id, data);
        toast.success('อัปเดตแล้ว');
      } else {
        await cmsApi.createPrompt(data);
        toast.success('สร้างแล้ว');
      }
      setEditing(null); setCreating(false); load();
    } catch (e) { toast.error('บันทึกไม่สำเร็จ: ' + (e.response?.data?.detail || e.message)); }
  };

  const remove = async (id) => {
    if (!window.confirm('ลบ template นี้?')) return;
    try { await cmsApi.deletePrompt(id); toast.success('ลบแล้ว'); load(); }
    catch (e) { toast.error(e.response?.data?.detail || 'ลบไม่สำเร็จ'); }
  };

  return (
    <div className="min-h-screen bg-white" data-testid="cms-prompts-page">
      <header className="border-b border-neutral-200">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
          <div>
            <div className="text-xs font-mono uppercase tracking-widest text-red-600 mb-1">● Prompt Templates</div>
            <h1 className="text-3xl font-serif tracking-tight">AI Prompt Templates</h1>
            <p className="text-sm text-neutral-500 mt-1">
              ปรับ prompt ตั้งต้นที่ AI ใช้ — ใช้ <code className="bg-neutral-100 px-1">{`{title}`}</code>, <code className="bg-neutral-100 px-1">{`{to}`}</code> เป็น placeholder
            </p>
          </div>
          <div className="flex gap-2">
            <Link to="/admin/cms" className="px-4 py-2 border border-neutral-900 text-sm font-mono uppercase rounded-full">
              ← Back
            </Link>
            <button onClick={() => setCreating(true)} data-testid="prompt-new-btn"
                    className="px-5 py-2 bg-blue-600 text-white text-sm font-mono uppercase rounded-full">
              + New Template
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-3" data-testid="prompt-list">
        {items.map(t => (
          <div key={t.id} data-testid={`prompt-row-${t.id}`}
               className="border border-neutral-200 hover:border-neutral-900 rounded-lg p-4 transition">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-red-600">
                    {SCOPE_LABEL[t.scope] || t.scope}
                  </span>
                  {t.post_type && (
                    <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                      · {t.post_type}
                    </span>
                  )}
                  {t.is_default && (
                    <span className="text-[10px] font-mono uppercase tracking-widest bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                      DEFAULT
                    </span>
                  )}
                </div>
                <div className="font-serif text-lg">{t.name}</div>
                <div className="text-xs text-neutral-500">{t.description}</div>
                <pre className="mt-2 text-xs bg-neutral-50 p-3 rounded whitespace-pre-wrap break-words font-mono max-h-32 overflow-auto">
                  {t.template}
                </pre>
              </div>
              <div className="flex flex-col gap-1">
                <button onClick={() => setEditing(t)} data-testid={`prompt-edit-${t.id}`}
                        className="px-3 py-1 text-xs border border-neutral-900 rounded hover:bg-neutral-100">
                  Edit
                </button>
                {!String(t.id).startsWith('default-') && (
                  <button onClick={() => remove(t.id)} data-testid={`prompt-delete-${t.id}`}
                          className="px-3 py-1 text-xs border border-red-500 text-red-600 rounded hover:bg-red-50">
                    Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {(editing || creating) && (
        <PromptModal initial={editing} onClose={() => { setEditing(null); setCreating(false); }} onSave={save}/>
      )}
    </div>
  );
};

const PromptModal = ({ initial, onClose, onSave }) => {
  const [form, setForm] = useState(initial || {
    name: '', description: '', scope: 'text', post_type: null, template: '', is_default: false,
  });
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" data-testid="prompt-modal">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-auto">
        <div className="p-6 border-b border-neutral-200 flex justify-between items-center">
          <h2 className="text-xl font-serif">{initial ? 'แก้ไข Template' : 'สร้าง Template ใหม่'}</h2>
          <button onClick={onClose} className="text-2xl leading-none">×</button>
        </div>
        <div className="p-6 space-y-4">
          <Field label="ชื่อ Template" v={form.name} on={v => setForm({...form, name: v})} testid="prompt-form-name"/>
          <Field label="คำอธิบาย" v={form.description} on={v => setForm({...form, description: v})} testid="prompt-form-desc"/>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider mb-1">Scope</label>
              <select value={form.scope} onChange={e => setForm({...form, scope: e.target.value})}
                      className="w-full border border-neutral-300 rounded px-3 py-2"
                      data-testid="prompt-form-scope">
                {Object.entries(SCOPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider mb-1">Post Type (text only)</label>
              <select value={form.post_type || ''} onChange={e => setForm({...form, post_type: e.target.value || null})}
                      className="w-full border border-neutral-300 rounded px-3 py-2"
                      data-testid="prompt-form-posttype">
                <option value="">— any —</option>
                <option value="article">Article</option>
                <option value="insight">Insight</option>
                <option value="case_story">Case Story</option>
                <option value="announcement">📣 Announcement</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider mb-1">Template Body</label>
            <textarea value={form.template} onChange={e => setForm({...form, template: e.target.value})}
                      rows={10} data-testid="prompt-form-template"
                      className="w-full border border-neutral-300 rounded px-3 py-2 font-mono text-xs"
                      placeholder='ใช้ {title}, {to} เป็น placeholder ที่ frontend จะเติมก่อนส่ง'/>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!form.is_default} onChange={e => setForm({...form, is_default: e.target.checked})}
                   data-testid="prompt-form-default"/>
            ตั้งเป็น Default ของ scope+type นี้
          </label>
        </div>
        <div className="p-6 border-t border-neutral-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border rounded-full text-sm">Cancel</button>
          <button onClick={() => onSave(form)} data-testid="prompt-form-save"
                  className="px-5 py-2 bg-blue-600 text-white rounded-full text-sm font-mono uppercase">
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

const Field = ({ label, v, on, testid }) => (
  <div>
    <label className="block text-xs font-mono uppercase tracking-wider mb-1">{label}</label>
    <input value={v} onChange={e => on(e.target.value)} data-testid={testid}
           className="w-full border border-neutral-300 rounded px-3 py-2"/>
  </div>
);

export default CmsPromptsPage;
