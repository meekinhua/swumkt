/**
 * PasteAnswerBox — "have an answer from your own AI? paste it here".
 *
 * A collapsible box for the tool pages where the external-LLM flow is
 * prompt-only (the server gives a prompt but has no import endpoint, or the
 * import needs extra fields the shared dialog cannot send).
 *
 * Props
 *   onApply(text, modelLabel) -> boolean | Promise<boolean>   return false to keep the text
 *   onShowPrompt()            optional; renders a "ดูพรอมต์" button that opens the prompt dialog
 *   title, hint, placeholder, applyLabel, rows, testid, className
 *   defaultOpen               start expanded (e.g. when the system AI is switched off)
 */
import React, { useEffect, useState } from 'react';
import { ClipboardPaste, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const PasteAnswerBox = ({
  onApply, onShowPrompt,
  title = 'มีคำตอบจาก AI ของคุณแล้ว? วางที่นี่',
  hint, placeholder = 'วางคำตอบที่คัดลอกจาก ChatGPT / Claude / Gemini…',
  applyLabel = 'ใช้คำตอบนี้', rows = 6, testid = 'paste-answer', className = '',
  defaultOpen = false,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (defaultOpen) setOpen(true); }, [defaultOpen]);

  const apply = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const ok = await onApply(text, '');
      if (ok !== false) setText('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}
             className={`rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm ${className}`} data-testid={testid}>
      <summary className="flex min-h-[44px] cursor-pointer items-center gap-2 font-semibold text-green-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-800">
        <ClipboardPaste className="h-4 w-4 flex-none" aria-hidden="true" /> {title}
      </summary>
      <div className="space-y-2 pb-2 pt-1">
        {hint && <p className="text-green-900">{hint}</p>}
        {onShowPrompt && (
          <Button type="button" variant="outline" size="sm" onClick={onShowPrompt} data-testid={`${testid}-show-prompt`}
                  className="border-green-600 text-green-900 hover:bg-green-100">
            ดูพรอมต์ที่ต้องส่งให้ AI
          </Button>
        )}
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={rows} placeholder={placeholder}
                  aria-label={title} data-testid={`${testid}-text`}
                  className="border-2 border-green-200 bg-white font-mono text-sm focus:border-green-500" />
        <Button type="button" onClick={apply} disabled={!text.trim() || busy} data-testid={`${testid}-apply`}
                className="w-full bg-green-700 font-bold text-white hover:bg-green-800">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}{applyLabel}
        </Button>
      </div>
    </details>
  );
};

export default PasteAnswerBox;
