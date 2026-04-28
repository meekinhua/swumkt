/**
 * Robust clipboard copy helper.
 *
 * Why we need this: iframes (like our preview environment) often block
 * `navigator.clipboard.writeText` via permissions policy, raising
 * "NotAllowedError: Failed to execute 'writeText' on 'Clipboard'..."
 *
 * Strategy:
 *  1. Try modern async Clipboard API.
 *  2. Fall back to legacy `document.execCommand('copy')` via a hidden textarea
 *     — which works inside cross-origin iframes.
 *  3. As a last resort, show a toast prompting the user to copy manually.
 *
 * Returns true on success, false otherwise.
 */
import { toast } from 'sonner';

const fallbackCopy = (text) => {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
};

export const copyToClipboard = async (text, opts = {}) => {
  const { successMessage = 'คัดลอกแล้ว', silentSuccess = false } = opts;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      if (!silentSuccess) toast.success(successMessage);
      return true;
    }
  } catch {
    /* fall through to legacy copy */
  }
  if (fallbackCopy(text)) {
    if (!silentSuccess) toast.success(successMessage);
    return true;
  }
  // Final fallback — surface the URL so user can copy manually
  toast.error('คัดลอกอัตโนมัติไม่ได้ — กรุณา copy เอง:\n' + text, { duration: 8000 });
  return false;
};

export default copyToClipboard;
