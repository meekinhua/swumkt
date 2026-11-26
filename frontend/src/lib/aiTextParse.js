/**
 * Small helpers for the "use my own AI" flow of the tool pages (plan §B).
 *
 * The parsers mirror what the server does with a system-LLM answer (see
 * backend/server.py: /perception/generate-*, /generate-behavior-analysis), so an
 * answer pasted from ChatGPT / Claude / Gemini lands in the UI the same way.
 */

/** Remove a wrapping ```lang ... ``` fence that chat LLMs like to add. */
export const stripFences = (text) => String(text || '')
  .trim()
  .replace(/^```[a-zA-Z0-9_-]*\s*\n?/, '')
  .replace(/\n?```\s*$/, '')
  .trim();

/**
 * "ANALYSIS: ... KEY_FINDINGS: - a - b RECOMMENDATIONS: - c" -> {analysis_text, key_findings, recommendations}.
 * Text without the ANALYSIS: marker is kept whole as analysis_text (same as the server).
 */
export const parseAnalysisSections = (raw) => {
  const text = stripFences(raw);
  const out = { analysis_text: '', key_findings: [], recommendations: [] };
  let section = null;
  const lines = [];
  text.split('\n').forEach((line) => {
    const t = line.trim();
    if (t.startsWith('ANALYSIS:')) { section = 'analysis'; const rest = t.slice('ANALYSIS:'.length).trim(); if (rest) lines.push(rest); return; }
    if (t.startsWith('KEY_FINDINGS:')) { section = 'findings'; return; }
    if (t.startsWith('RECOMMENDATIONS:')) { section = 'recommendations'; return; }
    if (!t) { if (section === 'analysis') lines.push(''); return; }
    if (section === 'analysis') lines.push(t);
    else if (section === 'findings' && /^[-•*]/.test(t)) out.key_findings.push(t.replace(/^[-•*]\s*/, ''));
    else if (section === 'recommendations' && /^[-•*]/.test(t)) out.recommendations.push(t.replace(/^[-•*]\s*/, ''));
  });
  out.analysis_text = lines.join('\n').trim();
  if (!out.analysis_text) out.analysis_text = text;
  return out;
};

/** Numbered / bulleted list -> array of questions (max 12, like the server). */
export const parseNumberedQuestions = (raw) => stripFences(raw)
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean)
  .filter((l) => !/[:：]$/.test(l) && !l.startsWith('#'))
  .map((l) => l.replace(/^\s*(?:\d+\s*[.)]|[-•*])\s*/, '').replace(/^\*\*(.*)\*\*$/, '$1').trim())
  .filter(Boolean)
  .slice(0, 12);
