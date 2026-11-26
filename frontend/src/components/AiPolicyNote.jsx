/**
 * useAiGate(feature) + <AiPolicyNote feature="..."/> — small helpers for AI actions
 * that have NO server-side external-prompt companion.
 *
 *   const gate = useAiGate('survey.ai');
 *   <Button disabled={gate.blocked} title={gate.blockedReason}>…</Button>
 *   <AiPolicyNote feature="survey.ai" alternative="สร้างเองใน Survey Builder หรือเริ่มจากเทมเพลต" />
 *
 * `blocked` is true only once the policy is known and the system LLM is not
 * allowed for this user, so buttons never flash disabled while loading.
 * The server remains the source of truth (409 llm_external_only).
 */
import React from 'react';
import { Info } from 'lucide-react';
import { useLlmPolicy } from '@/hooks/useLlmPolicy';

export const useAiGate = (feature) => {
  const { loading, systemAllowed, hint } = useLlmPolicy();
  const allowed = systemAllowed(feature);
  const blocked = !loading && !allowed;
  return {
    loading,
    allowed,
    blocked,
    hint,
    blockedReason: blocked
      ? 'ผู้ดูแลระบบปิดการใช้ AI ของระบบสำหรับฟังก์ชันนี้ — ใช้ AI ของคุณเองหรือทำด้วยมือแทน'
      : undefined,
  };
};

export const AiPolicyNote = ({ feature, alternative, className = '' }) => {
  const gate = useAiGate(feature);
  if (!gate.blocked) return null;
  return (
    <div
      role="note"
      data-testid={`ai-policy-note-${feature}`}
      className={`flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 ${className}`}
    >
      <Info className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
      <p>
        <strong>AI ของระบบปิดใช้งานอยู่</strong> — ฟังก์ชันนี้ยังไม่มีทางใช้ AI ส่วนตัวภายในหน้านี้
        {alternative ? <> · {alternative}</> : null}
        {gate.hint ? <> · {gate.hint}</> : null}
      </p>
    </div>
  );
};

export default AiPolicyNote;
