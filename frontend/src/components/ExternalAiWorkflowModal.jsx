import React, { useState, useEffect, useCallback } from 'react';
import { copyToClipboard } from '@/lib/clipboard';
import { toast } from 'sonner';
import {
  Copy,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  ExternalLink,
  Sparkles,
  ClipboardPaste,
  Wrench,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

/**
 * Reusable 3-step Bring-Your-Own-AI modal:
 *   Step 1: Fetch & Copy structured prompt -> open ChatGPT / Gemini / Claude
 *   Step 2: Paste AI output -> validate schema via backend (dry_run) + offer 1-click Repair Prompt
 *   Step 3: Apply validated output cleanly into the app
 */
const ExternalAiWorkflowModal = ({
  open,
  onClose,
  title = 'ใช้ AI ภายนอก (ฟรี · Copy Prompt → วางผล)',
  subtitle = 'คัดลอก Prompt ที่มีข้อมูลจริงไปรันใน ChatGPT, Gemini หรือ Claude แล้วนำผลกลับมาวาง — ระบบจะตรวจความถูกต้องให้อัตโนมัติ',
  extraHint = '',
  fetchPrompt,
  validatePayload,
  applyPayload,
  renderPreview,
}) => {
  const [loadingPrompt, setLoadingPrompt] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [promptError, setPromptError] = useState('');
  const [showFullPrompt, setShowFullPrompt] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedRepair, setCopiedRepair] = useState(false);

  const [rawText, setRawText] = useState('');
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState(null);
  const [applying, setApplying] = useState(false);

  const loadPrompt = useCallback(async () => {
    if (!fetchPrompt) return;
    setLoadingPrompt(true);
    setPromptError('');
    try {
      const res = await fetchPrompt();
      const txt = typeof res === 'string' ? res : (res?.prompt || '');
      if (!txt) {
        setPromptError('ไม่สามารถสร้าง Prompt ได้ในขณะนี้');
      } else {
        setPromptText(txt);
      }
    } catch (e) {
      setPromptError(e?.response?.data?.detail || e?.message || 'โหลด Prompt ไม่สำเร็จ');
    } finally {
      setLoadingPrompt(false);
    }
  }, [fetchPrompt]);

  useEffect(() => {
    if (!open) return;
    setRawText('');
    setValidation(null);
    setPromptText('');
    setPromptError('');
    setShowFullPrompt(false);
    setCopiedPrompt(false);
    setCopiedRepair(false);
    loadPrompt();
  }, [open, loadPrompt]);

  if (!open) return null;

  const handleCopyPrompt = async () => {
    if (!promptText) return;
    const ok = await copyToClipboard(promptText, {
      successMessage: 'คัดลอก Prompt แล้ว! เปิด ChatGPT / Gemini / Claude แล้ววาง (Ctrl+V) ได้เลย',
    });
    if (ok) {
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 3000);
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      if (navigator.clipboard?.readText) {
        const clip = await navigator.clipboard.readText();
        if (clip && clip.trim()) {
          setRawText(clip);
          setValidation(null);
          toast.success('วางคำตอบจาก Clipboard แล้ว กด "ตรวจสอบรูปแบบ" ได้เลย');
          return;
        }
      }
      toast.info('กรุณากด Ctrl+V (หรือ Cmd+V) ลงในช่องข้อความด้านล่าง');
    } catch {
      toast.info('กรุณากด Ctrl+V (หรือ Cmd+V) ลงในช่องข้อความด้านล่าง');
    }
  };

  const handleValidate = async () => {
    if (!rawText.trim()) {
      toast.error('กรุณาวางคำตอบจาก AI ก่อนตรวจสอบ');
      return;
    }
    setValidating(true);
    try {
      const res = await validatePayload(rawText);
      setValidation(res);
      if (res?.valid) {
        toast.success('รูปแบบถูกต้อง! พร้อมนำเข้าสู่ระบบ');
      } else {
        toast.error('พบจุดที่ยังไม่ตรงรูปแบบ — ดูรายละเอียดหรือคัดลอกคำสั่งแก้ด้านล่าง');
      }
    } catch (e) {
      const msg = e?.response?.data?.detail || e?.message || 'ตรวจสอบไม่สำเร็จ';
      setValidation({ valid: false, errors: [msg], warnings: [], preview: null, repair_prompt: null });
      toast.error(msg);
    } finally {
      setValidating(false);
    }
  };

  const handleCopyRepairPrompt = async () => {
    if (!validation?.repair_prompt) return;
    const ok = await copyToClipboard(validation.repair_prompt, {
      successMessage: 'คัดลอก Prompt สั่ง AI แก้แล้ว! นำไปวางต่อในแชท AI เดิมได้เลย',
    });
    if (ok) {
      setCopiedRepair(true);
      setTimeout(() => setCopiedRepair(false), 3000);
    }
  };

  const handleApply = async () => {
    if (!validation?.valid) return;
    setApplying(true);
    try {
      await applyPayload(rawText, validation);
      onClose?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || e?.message || 'นำเข้าผลไม่สำเร็จ');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      data-testid="external-ai-modal"
    >
      <div className="bg-white rounded-xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between gap-3 bg-gradient-to-r from-indigo-50 to-purple-50">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-indigo-900 font-bold text-base sm:text-lg">
              <Sparkles className="w-5 h-5 text-indigo-600 flex-shrink-0" />
              <span>{title}</span>
            </div>
            <p className="text-xs sm:text-sm text-gray-600 mt-1 leading-relaxed">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-white hover:text-gray-800 flex-shrink-0"
            aria-label="ปิดหน้าต่าง"
            data-testid="external-ai-close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {extraHint && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900 leading-relaxed">
              💡 {extraHint}
            </div>
          )}

          {/* STEP 1 */}
          <div className="rounded-lg border border-gray-200 p-4 bg-gray-50/70">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="font-bold text-sm text-gray-900">
                ขั้นที่ 1 · คัดลอก Prompt ไปวางใน AI ของคุณ (ChatGPT / Gemini / Claude)
              </div>
              {promptText && (
                <span className="text-[11px] font-mono text-gray-500">
                  {promptText.length.toLocaleString()} chars
                </span>
              )}
            </div>

            {loadingPrompt ? (
              <div className="text-xs text-indigo-700 py-3">กำลังสร้าง Prompt จากข้อมูลจริงของโครงการ…</div>
            ) : promptError ? (
              <div className="rounded bg-red-50 border border-red-200 p-3 text-xs text-red-700 flex items-center justify-between gap-2">
                <span>{promptError}</span>
                <button
                  type="button"
                  onClick={loadPrompt}
                  className="px-2.5 py-1 rounded bg-white border border-red-300 font-semibold hover:bg-red-50"
                >
                  ลองใหม่
                </button>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyPrompt}
                    disabled={!promptText}
                    data-testid="external-ai-copy-prompt"
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs sm:text-sm font-bold text-white transition-colors ${
                      copiedPrompt ? 'bg-emerald-600' : 'bg-indigo-600 hover:bg-indigo-700'
                    }`}
                  >
                    <Copy className="w-4 h-4" />
                    {copiedPrompt ? 'คัดลอก Prompt แล้ว!' : 'คัดลอก Prompt ทั้งหมด'}
                  </button>

                  <a
                    href="https://chatgpt.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold bg-white border border-gray-300 text-gray-700 hover:bg-gray-100"
                  >
                    ChatGPT <ExternalLink className="w-3 h-3" />
                  </a>
                  <a
                    href="https://gemini.google.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold bg-white border border-gray-300 text-gray-700 hover:bg-gray-100"
                  >
                    Gemini <ExternalLink className="w-3 h-3" />
                  </a>
                  <a
                    href="https://claude.ai/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold bg-white border border-gray-300 text-gray-700 hover:bg-gray-100"
                  >
                    Claude <ExternalLink className="w-3 h-3" />
                  </a>

                  <button
                    type="button"
                    onClick={() => setShowFullPrompt((v) => !v)}
                    className="ml-auto inline-flex items-center gap-1 text-xs text-indigo-700 hover:underline font-medium"
                  >
                    {showFullPrompt ? <><ChevronUp className="w-3.5 h-3.5" /> ซ่อน Prompt</> : <><ChevronDown className="w-3.5 h-3.5" /> ดู Prompt</>}
                  </button>
                </div>

                {showFullPrompt && (
                  <pre className="mt-3 p-3 rounded-lg bg-gray-900 text-gray-100 text-[11px] font-mono max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                    {promptText}
                  </pre>
                )}
              </>
            )}
          </div>

          {/* STEP 2 */}
          <div className="rounded-lg border border-gray-200 p-4 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="font-bold text-sm text-gray-900">
                ขั้นที่ 2 · วางคำตอบที่ได้จาก AI แล้วกดตรวจสอบรูปแบบ
              </div>
              <button
                type="button"
                onClick={handlePasteFromClipboard}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                วางจาก Clipboard
              </button>
            </div>

            <textarea
              value={rawText}
              onChange={(e) => {
                setRawText(e.target.value);
                if (validation) setValidation(null);
              }}
              rows={7}
              data-testid="external-ai-paste-input"
              placeholder={'วางคำตอบจาก ChatGPT / Gemini / Claude ที่นี่ (วางทั้งข้อความได้เลยแม้จะมีคำอธิบายติดมา — ระบบจะดึงส่วน <<<SWUMKT_JSON_START>>> ... <<<SWUMKT_JSON_END>>> ให้อัตโนมัติ)'}
              className="w-full p-3 border-2 border-gray-300 rounded-lg font-mono text-xs focus:border-indigo-500 focus:outline-none"
            />

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleValidate}
                disabled={validating || !rawText.trim()}
                data-testid="external-ai-validate-btn"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs sm:text-sm font-bold bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 text-white"
              >
                {validating ? 'กำลังตรวจสอบ…' : 'ตรวจสอบรูปแบบ (Validate)'}
              </button>
              {rawText && (
                <button
                  type="button"
                  onClick={() => {
                    setRawText('');
                    setValidation(null);
                  }}
                  className="px-3 py-2 text-xs text-gray-500 hover:text-gray-800"
                >
                  ล้างข้อความ
                </button>
              )}
            </div>

            {/* Validation Results */}
            {validation && (
              <div className="mt-4 space-y-2.5" data-testid="external-ai-validation-box">
                {validation.valid ? (
                  <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 p-3.5">
                    <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm mb-2">
                      <CheckCircle className="w-4 h-4 flex-shrink-0" />
                      ข้อมูลถูกต้องครบถ้วน — พร้อมนำเข้าสู่ระบบ
                    </div>
                    {renderPreview && validation.preview && (
                      <div className="text-xs text-emerald-900 bg-white/80 rounded p-2.5 border border-emerald-200">
                        {renderPreview(validation.preview, validation)}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border-2 border-red-300 bg-red-50 p-3.5">
                    <div className="flex items-center gap-2 text-red-800 font-bold text-sm mb-2">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      รูปแบบยังไม่ถูกต้อง ({(validation.errors || []).length} จุด)
                    </div>
                    <ul className="list-disc pl-5 text-xs text-red-700 space-y-1">
                      {(validation.errors || []).map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                    {validation.repair_prompt && (
                      <div className="mt-3 pt-2.5 border-t border-red-200 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-red-800 font-medium">
                          คัดลอกคำสั่งด้านขวาไปวางต่อในแชท AI เพื่อให้ AI แก้รูปแบบให้อัตโนมัติ:
                        </span>
                        <button
                          type="button"
                          onClick={handleCopyRepairPrompt}
                          data-testid="external-ai-copy-repair-btn"
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white ${
                            copiedRepair ? 'bg-emerald-600' : 'bg-red-600 hover:bg-red-700'
                          }`}
                        >
                          <Wrench className="w-3.5 h-3.5" />
                          {copiedRepair ? 'คัดลอก Repair Prompt แล้ว!' : 'คัดลอก Prompt สั่ง AI แก้ให้ถูกต้อง'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {Array.isArray(validation.warnings) && validation.warnings.length > 0 && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                    <div className="flex items-center gap-1.5 font-bold mb-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      หมายเหตุ ({validation.warnings.length})
                    </div>
                    <ul className="list-disc pl-5 space-y-0.5">
                      {validation.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-gray-200 bg-gray-50 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 text-xs sm:text-sm font-semibold text-gray-700 hover:bg-white"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!validation?.valid || applying}
            data-testid="external-ai-apply-btn"
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs sm:text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300"
          >
            <CheckCircle className="w-4 h-4" />
            {applying ? 'กำลังนำเข้าสู่ระบบ…' : 'ขั้นที่ 3 · ยืนยันนำผลเข้าสู่ระบบ'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExternalAiWorkflowModal;
