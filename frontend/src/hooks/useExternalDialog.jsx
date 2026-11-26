/**
 * useExternalDialog() — one <ExternalAiDialog> instance for a page that keeps its own
 * (custom-styled) buttons instead of <AiActionButton>.
 *
 *   const ext = useExternalDialog();
 *   ...
 *   ext.open({ title, promptRequest: {method:'POST', url, data}, importUrl?, importExtra?, onlyParts?, onImported? });
 *   ...
 *   {ext.dialog}
 *
 * `runOr(systemFn, opts)` runs the system action and, if the server answers 409
 * llm_external_only, opens the dialog instead (the global interceptor already showed the toast).
 */
import React, { useCallback, useState } from 'react';
import ExternalAiDialog from '@/components/ExternalAiDialog';
import { isLlmExternalOnly } from '@/lib/llmErrors';

export const useExternalDialog = () => {
  const [st, setSt] = useState({ open: false });
  const open = useCallback((opts) => setSt({ ...opts, open: true }), []);
  const close = useCallback(() => setSt((s) => ({ ...s, open: false })), []);
  const runOr = useCallback(async (systemFn, opts) => {
    try {
      return await systemFn();
    } catch (e) {
      if (isLlmExternalOnly(e)) { open(opts); return undefined; }
      throw e;
    }
  }, [open]);
  const dialog = (
    <ExternalAiDialog
      open={!!st.open}
      onOpenChange={(v) => (v ? setSt((s) => ({ ...s, open: true })) : close())}
      title={st.title}
      promptRequest={st.promptRequest}
      importUrl={st.importUrl}
      importExtra={st.importExtra}
      onlyParts={st.onlyParts}
      onImported={st.onImported}
    />
  );
  return { open, close, runOr, dialog };
};

export default useExternalDialog;
