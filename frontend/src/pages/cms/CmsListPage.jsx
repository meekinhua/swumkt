import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { cmsApi, POST_TYPE_LABEL } from './cmsApi';

const TABS = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'article', label: 'บทความ' },
  { id: 'insight', label: 'Insight' },
  { id: 'case_story', label: 'Case Story' },
  { id: 'announcement', label: '📣 ประชาสัมพันธ์' },
  { id: 'trash', label: 'ถังขยะ' },
];

const CmsListPage = () => {
  const nav = useNavigate();
  const [tab, setTab] = useState('all');
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = tab === 'trash'
        ? await cmsApi.listTrash()
        : await cmsApi.listPosts({ ...(tab !== 'all' ? { type: tab } : {}), ...(q ? { q } : {}) });
      setItems(r.data?.items || []);
    } catch (e) {
      toast.error('โหลดข้อมูลไม่สำเร็จ — ต้องเป็น Admin');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab]);

  const handleDelete = async (id) => {
    if (!window.confirm('ย้ายเข้าถังขยะ?')) return;
    try {
      await cmsApi.softDelete(id);
      toast.success('ย้ายเข้าถังขยะแล้ว');
      load();
    } catch { toast.error('ลบไม่สำเร็จ'); }
  };
  const handleRestore = async (id) => {
    try { await cmsApi.restore(id); toast.success('กู้คืนแล้ว'); load(); }
    catch { toast.error('กู้คืนไม่สำเร็จ'); }
  };
  const handlePurge = async (id) => {
    if (!window.confirm('ลบถาวร? ไม่สามารถกู้คืนได้')) return;
    try { await cmsApi.purge(id); toast.success('ลบถาวรแล้ว'); load(); }
    catch { toast.error('ลบไม่สำเร็จ'); }
  };

  return (
    <div data-testid="cms-list-page" className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
          <div>
            <div className="text-xs font-mono uppercase tracking-widest text-red-600 mb-1">● Content Studio</div>
            <h1 className="text-3xl font-serif tracking-tight">CMS — Content Management</h1>
          </div>
          <div className="flex gap-2">
            <Link to="/admin/cms/landing" data-testid="cms-landing-link"
                  className="px-4 py-2 border border-blue-600 text-blue-600 text-sm font-mono uppercase tracking-wider hover:bg-blue-50 rounded-full">
              Landing Page
            </Link>
            <Link to="/admin/cms/prompts" data-testid="cms-prompts-link"
                  className="px-4 py-2 border border-neutral-900 text-sm font-mono uppercase tracking-wider hover:bg-neutral-100 rounded-full">
              Prompt Templates
            </Link>
            <Link to="/admin/cms/setup" data-testid="cms-setup-link"
                  className="px-4 py-2 border border-neutral-900 text-sm font-mono uppercase tracking-wider hover:bg-neutral-100 rounded-full">
              ตั้งค่าเริ่มต้น
            </Link>
            <button onClick={() => nav('/admin/cms/new')} data-testid="cms-new-post-btn"
                    className="px-5 py-2 bg-blue-600 text-white text-sm font-mono uppercase tracking-wider hover:bg-blue-700 rounded-full">
              + New Post
            </button>
          </div>
        </div>
      </header>

      {/* Tabs + search */}
      <div className="max-w-7xl mx-auto px-6 pt-6 flex flex-wrap items-center gap-2 justify-between">
        <div className="flex gap-1 flex-wrap">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} data-testid={`cms-tab-${t.id}`}
                    className={`px-4 py-1.5 text-sm rounded-full border transition ${
                      tab === t.id ? 'bg-neutral-900 text-white border-neutral-900' : 'border-neutral-300 hover:border-neutral-900'
                    }`}>
              {t.label}
            </button>
          ))}
        </div>
        {tab !== 'trash' && (
          <div className="flex gap-2">
            <input data-testid="cms-search-input" value={q} onChange={e => setQ(e.target.value)}
                   placeholder="ค้นหา title / slug / excerpt..."
                   className="px-3 py-1.5 border border-neutral-300 rounded text-sm w-72"/>
            <button onClick={load} className="px-4 py-1.5 border border-neutral-900 text-sm rounded">Search</button>
          </div>
        )}
      </div>

      {/* List */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {loading && <div className="text-neutral-500 font-mono text-xs">Loading...</div>}
        {!loading && items.length === 0 && (
          <div className="text-neutral-400 py-16 text-center font-serif italic">— ไม่มี post ในหมวดนี้ —</div>
        )}
        <div className="grid gap-3" data-testid="cms-post-list">
          {items.map(p => (
            <div key={p.id} data-testid={`cms-row-${p.id}`}
                 className="border border-neutral-200 hover:border-neutral-900 rounded-lg p-4 flex items-center gap-4 transition group">
              <div className="flex-shrink-0 w-2 h-12 rounded-full"
                   style={{ background: p.status === 'published' ? '#3597E4' : '#aaa' }}/>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-red-600">
                    {POST_TYPE_LABEL[p.type] || p.type}
                  </span>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                    · {p.status} · {p.category}
                  </span>
                  {p.pinned_to_home && (
                    <span className="text-[10px] font-mono uppercase tracking-widest text-yellow-700 bg-yellow-100 px-1.5 py-0.5 rounded"
                          data-testid={`cms-pin-badge-${p.id}`} title="ปักหมุดอยู่บนหน้าแรก">
                      📌 PIN
                    </span>
                  )}
                </div>
                <div className="font-serif text-lg leading-tight truncate">{p.title}</div>
                <div className="text-xs text-neutral-500 truncate">{p.slug} · {(p.excerpt || '').slice(0, 80)}</div>
              </div>
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition">
                {tab === 'trash' ? (
                  <>
                    <button onClick={() => handleRestore(p.id)} data-testid={`cms-restore-${p.id}`}
                            className="px-3 py-1 text-xs border border-blue-500 text-blue-600 rounded hover:bg-blue-50">
                      Restore
                    </button>
                    <button onClick={() => handlePurge(p.id)} data-testid={`cms-purge-${p.id}`}
                            className="px-3 py-1 text-xs border border-red-500 text-red-600 rounded hover:bg-red-50">
                      Delete Forever
                    </button>
                  </>
                ) : (
                  <>
                    <Link to={`/admin/cms/${p.id}`} data-testid={`cms-edit-${p.id}`}
                          className="px-3 py-1 text-xs border border-neutral-900 rounded hover:bg-neutral-100">
                      Edit
                    </Link>
                    <button onClick={() => handleDelete(p.id)} data-testid={`cms-delete-${p.id}`}
                            className="px-3 py-1 text-xs border border-red-500 text-red-600 rounded hover:bg-red-50">
                      Trash
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CmsListPage;
