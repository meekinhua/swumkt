/**
 * Shared handling of the "system LLM is switched off" answer.
 *
 * The backend answers HTTP 409 with
 *   { detail: { code: "llm_external_only", feature, message, hint } }
 * whenever a request would have used the platform's own (paid) LLM while the
 * admin switch forbids it.
 *
 *   import { isLlmExternalOnly, installLlmPolicyInterceptor } from '@/lib/llmErrors';
 *
 *   try { await axios.post(...) }
 *   catch (e) { if (isLlmExternalOnly(e)) openExternalDialog(); else ... }
 *
 * `installLlmPolicyInterceptor()` is called once from App.js. It shows ONE
 * Thai toast (de-duplicated for a few seconds, however many requests fail at
 * once) and still rejects, so every caller can react in its own way.
 */
import axios from 'axios';
import { toast } from 'sonner';

export const LLM_EXTERNAL_ONLY = 'llm_external_only';

/** True when `error` is the 409 `llm_external_only` response. */
export const isLlmExternalOnly = (error) => {
  const r = error && error.response;
  return !!r && r.status === 409 && !!r.data && !!r.data.detail
    && typeof r.data.detail === 'object' && r.data.detail.code === LLM_EXTERNAL_ONLY;
};

/** The `hint` the admin wrote for users, if the error carries one. */
export const llmExternalOnlyHint = (error) =>
  (isLlmExternalOnly(error) && error.response.data.detail.hint) || '';

const TOAST_ID = 'llm-external-only';
let lastShown = 0;
let installedId = null;

export const showLlmExternalOnlyToast = (hint) => {
  const now = Date.now();
  if (now - lastShown < 4000) return; // de-duplicate bursts
  lastShown = now;
  toast.info('AI ของระบบถูกปิดใช้งานอยู่', {
    id: TOAST_ID,
    description: `กรุณาเลือก "ใช้ AI ของฉันเอง" — คัดลอกพรอมต์ไปใช้ใน ChatGPT / Claude / Gemini แล้ววางผลลัพธ์กลับมา${hint ? `\n${hint}` : ''}`,
    duration: 9000,
  });
};

/** Install once (idempotent). Returns the interceptor id. */
export const installLlmPolicyInterceptor = () => {
  if (installedId !== null) return installedId;
  installedId = axios.interceptors.response.use(
    (response) => response,
    (error) => {
      if (isLlmExternalOnly(error)) {
        showLlmExternalOnlyToast(error.response.data.detail.hint);
      }
      return Promise.reject(error);
    }
  );
  return installedId;
};
