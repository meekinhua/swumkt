/**
 * Image helpers for the Conjoint tool (feature `conjoint.images`).
 *
 * Images are OPTIONAL everywhere: a study never needs AI — respondents see the level
 * text when there is no picture. When the system LLM is off, <ImageAiButton> shows the
 * image prompt (prompt-only dialog; no paste-back) so the user makes the picture in
 * their own tool and then uploads it with <ImageFileButton>.
 */
import React, { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Sparkles, Upload, Loader2, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AiActionButton from '@/components/AiActionButton';
import { readFileAsDataUrl } from './cjFormat';

const MAX_MB = 6;

/**
 * promptRequest: { method:'POST', url, data }  — the …/external-prompt endpoint
 * onSystem: async () => void — the existing system generator (handles its own errors)
 */
export const ImageAiButton = ({ promptRequest, onSystem, label = 'สร้างภาพด้วย AI', title, size = 'sm', className = '', disabled, testId }) => (
  <AiActionButton
    feature="conjoint.images"
    label={label}
    icon={Sparkles}
    onSystem={onSystem}
    external={{ title: title || 'พรอมต์สำหรับสร้างภาพด้วย AI ของคุณเอง', promptRequest }}
    size={size}
    disabled={disabled}
    className={className}
    data-testid={testId}
  />
);

/** File picker -> data: URL -> onData(dataUrl). Validates type and size. */
export const ImageFileButton = ({ onData, label = 'อัปโหลดไฟล์ภาพ', busy = false, size = 'sm', className = '', testId }) => {
  const ref = useRef(null);
  const [reading, setReading] = useState(false);
  const pick = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (!/^image\//.test(f.type)) { toast.error('เลือกไฟล์ภาพ (PNG / JPG / WebP) เท่านั้น'); return; }
    if (f.size > MAX_MB * 1024 * 1024) { toast.error(`ไฟล์ใหญ่เกิน ${MAX_MB} MB — ย่อภาพก่อนอัปโหลด`); return; }
    setReading(true);
    try { await onData(await readFileAsDataUrl(f), f); } catch { toast.error('อ่านไฟล์ภาพไม่สำเร็จ'); } finally { setReading(false); }
  };
  return (
    <>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={pick} data-testid={testId ? `${testId}-input` : undefined} />
      <Button type="button" variant="outline" size={size} className={className} disabled={busy || reading} onClick={() => ref.current && ref.current.click()} data-testid={testId}>
        {busy || reading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Upload className="mr-1 h-3 w-3" />}
        {label}
      </Button>
    </>
  );
};

export const ImagesOptionalNote = ({ className = '' }) => (
  <p className={`flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900 ${className}`} data-testid="images-optional-note">
    <ImageIcon className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
    <span><b>รูปภาพไม่บังคับ</b> — ข้ามได้ทั้งหมด ผู้ตอบจะเห็นข้อความของแต่ละระดับแทน การไม่มี AI ของระบบไม่ได้ขัดขวางการทำแบบสอบถาม: ขอพรอมต์ไปสร้างภาพกับ ChatGPT / Gemini ของคุณเองแล้วอัปโหลดกลับมาได้</span>
  </p>
);
