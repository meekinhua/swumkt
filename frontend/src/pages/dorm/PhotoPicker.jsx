import React, { useRef, useState } from 'react';
import axios from 'axios';
import { useAuth } from '@/context/AuthContext';
import { ImagePlus, X } from 'lucide-react';
import { photoSrc } from './DormLayout';
import { API, authHeaders, errMsg } from './dormApi';

const MAX = 8;
const isPhoto = (p) => p.startsWith('/api/dorm/photos/');

// Phone photos are 3–8 MB; shrink to 1280px JPEG (~150–300 KB) before upload.
const compress = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const s = Math.min(1, 1280 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * s);
    c.height = Math.round(img.height * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    resolve(c.toDataURL('image/jpeg', 0.82));
  };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('เปิดไฟล์รูปไม่ได้')); };
  img.src = url;
});

// Signed in: each photo is compressed and uploaded at once. Guest: photos are compressed and kept in memory
// (`pending`, data: URLs) so they show in the preview right away; the post page uploads them right after
// sign-in when the listing is published. Memory only: a page reload loses them (the post page says so).
// onChange / onPending receive updaters (current list -> new list), so uploads finishing one by one never
// undo a second batch or a removal made meanwhile.
export default function PhotoPicker({ value, onChange, pending = [], onPending }) {
  const { token, user } = useAuth();
  const input = useRef(null);
  const [busy, setBusy] = useState(0);
  const [err, setErr] = useState('');
  const photos = value.filter(isPhoto);
  const count = photos.length + pending.length;

  const add = async (files) => {
    setErr('');
    const room = MAX - count - busy;   // work still running counts too
    const list = [...files].filter((f) => f.type.startsWith('image/')).slice(0, room);
    const tok = token || localStorage.getItem('token');
    for (const f of list) {
      setBusy((n) => n + 1);
      try {
        const data_url = await compress(f);
        if (!user || !tok) {
          const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          onPending((cur) => (cur.length + photos.length >= MAX ? cur : [...cur, { key, url: data_url }]));
        } else {
          const r = await axios.post(`${API}/photos`, { data_url }, authHeaders(tok));
          const url = r.data.url;
          onChange((cur) => {
            const ph = cur.filter(isPhoto);
            if (ph.includes(url) || ph.length >= MAX) return cur;
            return [...ph, url, ...cur.filter((p) => !isPhoto(p))];
          });
        }
      } catch (e) {
        setErr(errMsg(e, e.message || 'อัปโหลดไม่สำเร็จ'));
      }
      setBusy((n) => n - 1);
    }
  };
  const remove = (p) => onChange((cur) => cur.filter((x) => x !== p));
  const move = (p) => onChange((cur) => [p, ...cur.filter((x) => x !== p)]);   // tap a photo to make it the cover
  const removePending = (k) => onPending((cur) => cur.filter((x) => x.key !== k));
  const movePending = (k) => onPending((cur) => [...cur.filter((x) => x.key === k), ...cur.filter((x) => x.key !== k)]);

  return (
    <div>
      <div className="dm-photos-edit">
        {photos.map((p, i) => (
          <div key={p} className="dm-photo-tile">
            <button type="button" className="dm-photo-cover" onClick={() => move(p)} disabled={i === 0}
                    aria-label={i === 0 ? 'รูปปก' : `ตั้งรูปที่ ${i + 1} เป็นรูปปก`}>
              <img src={photoSrc(p)} alt="" />
            </button>
            <button type="button" onClick={() => remove(p)} aria-label={`ลบรูปที่ ${i + 1}`}><span><X size={16} aria-hidden="true" /></span></button>
            {i === 0 && <span className="dm-pill sun">รูปปก</span>}
          </div>
        ))}
        {pending.map((p, j) => {
          const i = photos.length + j;
          return (
            <div key={p.key} className="dm-photo-tile">
              <button type="button" className="dm-photo-cover" onClick={() => movePending(p.key)} disabled={i === 0 || j === 0}
                      aria-label={i === 0 ? 'รูปปก' : `เลื่อนรูปที่ ${i + 1} ขึ้นก่อน`}>
                <img src={p.url} alt="" />
              </button>
              <button type="button" onClick={() => removePending(p.key)} aria-label={`ลบรูปที่ ${i + 1}`}><span><X size={16} aria-hidden="true" /></span></button>
              {i === 0 && <span className="dm-pill sun">รูปปก</span>}
            </div>
          );
        })}
        {Array.from({ length: busy }).map((_, i) => <div key={`b${i}`} className="dm-photo-tile dm-skel" aria-label={user ? 'กำลังอัปโหลด' : 'กำลังย่อรูป'} />)}
        {count + busy < MAX && (
          <button type="button" className="dm-photo-add" onClick={() => input.current?.click()} data-testid="dorm-photo-add">
            <ImagePlus size={24} aria-hidden="true" />เพิ่มรูป
          </button>
        )}
      </div>
      <input ref={input} id="dm-photo-input" type="file" accept="image/*" multiple hidden
             onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      <small className="dm-hint dm-photo-hint">
        {pending.length > 0 ? `${pending.length} รูปจะอัปโหลดตอนกดลงประกาศ ` : ''}สูงสุด {MAX} รูป แตะรูปเพื่อตั้งเป็นรูปปก ห้องที่มีรูปจริงมีคนกดดูมากกว่า
      </small>
      {err && <div className="dm-err" role="alert">{err}</div>}
    </div>
  );
}
