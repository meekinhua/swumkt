/**
 * AiActionButton — one button for an AI feature that respects the admin's
 * system-LLM switch (plan §C).
 *
 * Props
 *   feature      registry key, e.g. "conjoint.interpretation" (see /api/platform/llm-policy)
 *   label        button text (Thai), e.g. "วิเคราะห์ด้วย AI"
 *   icon         lucide component (Sparkles) or an element; optional
 *   onSystem     async () => void — the EXISTING system-LLM action. It must do its own
 *                success/error handling. If it rejects with 409 llm_external_only the
 *                button opens the external dialog instead and refetches the policy.
 *                Any other rejection is only console.error'd (handle it inside onSystem).
 *   external     { promptRequest, importUrl?, importExtra?, onlyParts?, onImported?, title? }
 *                — passed to <ExternalAiDialog>. Omit `importUrl` for prompt-only cases.
 *   disabled     disables everything
 *   variant, size, className   passed to <Button> (className applies to the main button).
 *                variant="plain" renders native <button>s carrying ONLY `className`
 *                (no shadcn classes), so page styles such as "be-btn be-btn-red" win.
 *   data-testid  on the main button (the menu trigger gets `${id}-menu`, items
 *                `${id}-system` / `${id}-external`)
 *
 * Behaviour
 *   - system not allowed (or no onSystem): one click opens the dialog; button shows a small
 *     "ใช้ AI ของคุณเอง" hint.
 *   - system allowed and `external` given: main click runs onSystem, a chevron opens a
 *     menu ("ใช้ AI ของระบบ" / "ใช้ AI ของฉันเอง").
 *   - system allowed, no `external`: plain button running onSystem.
 *   - While the policy loads the button is disabled (never flashes the wrong mode).
 *
 * Example
 *   <AiActionButton
 *     feature="conjoint.interpretation" label="วิเคราะห์ด้วย AI" icon={Sparkles}
 *     onSystem={generateInterpretation}
 *     external={{
 *       title: 'วิเคราะห์ผลด้วย AI ของฉันเอง',
 *       promptRequest: { method: 'GET', url: `${API}/conjoint/studies/${id}/interpretation/external-prompt` },
 *       importUrl: `${API}/conjoint/studies/${id}/interpretation/external-import`,
 *       onImported: (data) => setInterpretation(data),
 *     }}
 *     data-testid="cj-interpret-btn"
 *   />
 */
import React, { useState } from 'react';
import { ChevronDown, Loader2, UserRound, Cpu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import ExternalAiDialog from '@/components/ExternalAiDialog';
import { useLlmPolicy } from '@/hooks/useLlmPolicy';
import { isLlmExternalOnly } from '@/lib/llmErrors';

const renderIcon = (icon) => {
  if (!icon) return null;
  if (React.isValidElement(icon)) return icon;
  const Icon = icon;
  return <Icon className="h-4 w-4" aria-hidden="true" />;
};

/** shadcn <Button>, or a bare <button> with only the caller's classes for variant="plain". */
const Btn = React.forwardRef(({ variant, size, className = '', plainExtra = '', ...rest }, ref) => {
  if (variant === 'plain') {
    return <button ref={ref} type="button" className={`${className} ${plainExtra}`.trim()} {...rest} />;
  }
  return <Button ref={ref} variant={variant} size={size} className={className} {...rest} />;
});
Btn.displayName = 'AiActionButtonBtn';

const AiActionButton = ({
  feature, label, icon, onSystem, external, disabled = false,
  variant, size, className = '', 'data-testid': testId,
}) => {
  const { loading, systemAllowed, refetch } = useLlmPolicy();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);

  const canSystem = !!onSystem && systemAllowed(feature);
  const canExternal = !!external;

  const runSystem = async () => {
    if (!onSystem || running) return;
    setRunning(true);
    try {
      await onSystem();
    } catch (e) {
      if (isLlmExternalOnly(e)) {
        refetch();
        if (canExternal) setOpen(true);
      } else {
        // eslint-disable-next-line no-console
        console.error('AiActionButton onSystem failed', e);
      }
    } finally {
      setRunning(false);
    }
  };

  const dialog = canExternal ? (
    <ExternalAiDialog
      open={open}
      onOpenChange={setOpen}
      title={external.title}
      promptRequest={external.promptRequest}
      importUrl={external.importUrl}
      importExtra={external.importExtra}
      onlyParts={external.onlyParts}
      onImported={external.onImported}
    />
  ) : null;

  const base = { variant, size, disabled: disabled || loading };
  const id = testId || 'ai-action-btn';

  // Policy not yet known — don't flash the wrong mode.
  if (loading) {
    return (
      <Btn {...base} className={className} data-testid={testId}>
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {label}
      </Btn>
    );
  }

  // External only (or system action not offered)
  if (!canSystem && canExternal) {
    return (
      <>
        <Btn {...base} className={className} onClick={() => setOpen(true)} data-testid={testId} title="ใช้ AI ของคุณเอง — คัดลอกพรอมต์ไปวางใน ChatGPT / Claude / Gemini">
          {renderIcon(icon)}
          <span>{label}</span>
          <span className="ml-1 rounded-sm bg-black/10 px-1.5 py-0.5 text-[10px] font-semibold leading-none" data-testid={`${id}-hint`}>ใช้ AI ของคุณเอง</span>
        </Btn>
        {dialog}
      </>
    );
  }

  // System only
  if (!canExternal) {
    return (
      <Btn {...base} disabled={base.disabled || running || !canSystem} className={className} onClick={runSystem} data-testid={testId}
        title={!canSystem ? 'AI ของระบบถูกปิดใช้งาน' : undefined}>
        {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : renderIcon(icon)}
        <span>{label}</span>
      </Btn>
    );
  }

  // Both: split button
  return (
    <>
      <div className="inline-flex items-stretch">
        <Btn {...base} disabled={base.disabled || running} className={variant === 'plain' ? className : `rounded-r-none ${className}`}
          style={variant === 'plain' ? { borderTopRightRadius: 0, borderBottomRightRadius: 0 } : undefined}
          onClick={runSystem} data-testid={testId}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : renderIcon(icon)}
          <span>{label}</span>
        </Btn>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Btn
              variant={variant} size={size === 'sm' ? 'sm' : 'default'} disabled={base.disabled || running}
              className={variant === 'plain' ? className : 'rounded-l-none border-l border-white/30 px-2'}
              style={variant === 'plain' ? { borderTopLeftRadius: 0, borderBottomLeftRadius: 0, marginLeft: -1, paddingLeft: 8, paddingRight: 8 } : undefined}
              aria-label="ตัวเลือกการใช้ AI" data-testid={`${id}-menu`}
            >
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            </Btn>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={runSystem} data-testid={`${id}-system`}>
              <Cpu className="h-4 w-4 mr-2" aria-hidden="true" /> ใช้ AI ของระบบ
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setOpen(true)} data-testid={`${id}-external`}>
              <UserRound className="h-4 w-4 mr-2" aria-hidden="true" /> ใช้ AI ของฉันเอง
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {dialog}
    </>
  );
};

export default AiActionButton;
