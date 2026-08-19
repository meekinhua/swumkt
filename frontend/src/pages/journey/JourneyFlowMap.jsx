import React, { useMemo, useState } from 'react';
import MermaidViewer from '@/components/MermaidViewer';
import { copyToClipboard } from '@/lib/clipboard';
import { fmtPct, fmtNum } from './copy-th';

/**
 * Observed-flow map, drawn with Mermaid (same renderer as the qualitative tab,
 * so zoom / pan / fullscreen come along).
 *
 * Edge width = number of respondents who actually walked that transition.
 * Nothing here is a model estimate: no probability, no smoothing, no band.
 * Percentages appear only where the source step has enough exits to divide by,
 * and thin evidence is drawn dashed with the count only.
 */

const sanitize = (s) => String(s || '').replace(/["\[\](){}<>|#;]/g, ' ').trim();

const burdenClass = (b) => {
  if (b === null || b === undefined) return 'ndata';
  if (b >= 60) return 'hot';
  if (b >= 40) return 'warm';
  return 'cool';
};

const buildMermaid = (flow, { showLoops, hideThin }) => {
  if (!flow?.nodes?.length) return '';
  const lines = ['flowchart LR'];
  const classes = { hot: [], warm: [], cool: [], ndata: [], term: [], start: [] };

  flow.nodes.forEach((n) => {
    const label = sanitize(n.label_th);
    if (n.kind === 'start') {
      lines.push(`  ${n.id}(("${label}<br/>${n.n_visit} คน"))`);
      classes.start.push(n.id);
    } else if (n.kind === 'terminal') {
      lines.push(`  ${n.id}(["${label}<br/>${n.n_visit} คน · ${fmtPct(n.reach, 1)}"])`);
      classes.term.push(n.id);
    } else {
      const bits = [`${label}`, `ผ่าน ${n.n_visit} คน · ${fmtPct(n.reach, 0)}`];
      if (n.burden !== null && n.burden !== undefined) bits.push(`ยุ่งยาก ${fmtNum(n.burden, 0)}/100`);
      if (n.revisit > 1.05) bits.push(`ทำซ้ำ ${fmtNum(n.revisit, 2)} ครั้ง`);
      lines.push(`  ${n.id}["${bits.join('<br/>')}"]`);
      classes[burdenClass(n.burden)].push(n.id);
    }
  });

  const edges = (flow.edges || [])
    .filter((e) => (showLoops || !e.self_loop))
    .filter((e) => !(hideThin && e.thin));

  const styles = [];
  edges.forEach((e, i) => {
    const pctPart = e.share_of_source === null || e.share_of_source === undefined
      ? '' : ` · ${fmtPct(e.share_of_source, 0)}`;
    const label = `${e.count} คน${pctPart}`;
    const arrow = e.thin ? '-.->' : '-->';
    lines.push(`  ${e.from} ${arrow}|"${label}"| ${e.to}`);
    const w = Math.max(1.2, Math.min(9, (e.count / (flow.max_edge_count || 1)) * 9));
    const color = e.self_loop ? '#B0332A' : (e.to_terminal ? '#6B7280' : '#14161A');
    styles.push(`  linkStyle ${i} stroke-width:${w.toFixed(1)}px,stroke:${color}`);
  });

  lines.push('  classDef hot fill:#F6DCD9,stroke:#B0332A,stroke-width:2px,color:#14161A');
  lines.push('  classDef warm fill:#FBEEDC,stroke:#B4761F,stroke-width:1.5px,color:#14161A');
  lines.push('  classDef cool fill:#E7EFE9,stroke:#2F6B4F,stroke-width:1.5px,color:#14161A');
  lines.push('  classDef ndata fill:#F2F0EC,stroke:#B7B2A8,stroke-dasharray:4 3,color:#6B7280');
  lines.push('  classDef term fill:#FFFFFF,stroke:#14161A,stroke-width:2px,color:#14161A');
  lines.push('  classDef start fill:#14161A,stroke:#14161A,color:#FFFFFF');
  Object.entries(classes).forEach(([k, ids]) => {
    if (ids.length) lines.push(`  class ${ids.join(',')} ${k}`);
  });
  lines.push(...styles);
  return lines.join('\n');
};

export const JourneyFlowMap = ({ flow }) => {
  const [showLoops, setShowLoops] = useState(true);
  const [hideThin, setHideThin] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);

  const code = useMemo(
    () => buildMermaid(flow, { showLoops, hideThin }),
    [flow, showLoops, hideThin],
  );

  if (!flow?.edges?.length) {
    return (
      <div className="jy-locked" data-testid="journey-map-empty">
        ยังไม่มีการเดินจากขั้นหนึ่งไปอีกขั้นมากพอที่จะวาดแผนที่ — รอคำตอบเพิ่ม
      </div>
    );
  }

  const loops = flow.edges.filter((e) => e.self_loop);
  const thin = flow.edges.filter((e) => e.thin);

  return (
    <div data-testid="journey-flow-map">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <button className={`be-chip ${showLoops ? 'solid' : ''}`} aria-pressed={showLoops} data-testid="journey-map-loops"
                onClick={() => setShowLoops((v) => !v)}>
          การทำซ้ำในขั้นเดิม ({loops.length})
        </button>
        <button className={`be-chip ${hideThin ? 'solid' : ''}`} aria-pressed={hideThin} data-testid="journey-map-thin"
                onClick={() => setHideThin((v) => !v)}>
          ซ่อนเส้นที่คนน้อยกว่า {flow.thin_floor} คน ({thin.length})
        </button>
        <button className="be-chip" aria-pressed={showCode} data-testid="journey-map-code"
                onClick={() => setShowCode((v) => !v)}>
          {showCode ? 'ซ่อนโค้ด Mermaid' : 'ดูโค้ด Mermaid'}
        </button>
        <button className="be-chip" data-testid="journey-map-copy"
                onClick={async () => { await copyToClipboard(code); setCopied(true); }}>
          {copied ? 'คัดลอกแล้ว' : 'คัดลอกโค้ดไปวางในวิทยานิพนธ์'}
        </button>
      </div>

      <div className="jy-map-legend" data-testid="journey-map-legend">
        <span><i className="jy-sw jy-sw-cool" />ยุ่งยากน้อย (&lt;40)</span>
        <span><i className="jy-sw jy-sw-warm" />ปานกลาง (40–59)</span>
        <span><i className="jy-sw jy-sw-hot" />ยุ่งยากมาก (≥60)</span>
        <span><i className="jy-sw jy-sw-nd" />ยังไม่มีคนให้คะแนน</span>
        <span>เส้นหนา = คนเดินเส้นนั้นมาก · เส้นประ = หลักฐานบาง</span>
      </div>

      <div className="jy-map-wrap">
        <MermaidViewer code={code} />
      </div>

      {showCode && (
        <pre className="jy-code" data-testid="journey-map-code-block">{code}</pre>
      )}

      <p className="be-tiny" style={{ color: 'var(--ink-3)', marginTop: 12, lineHeight: 1.7 }}>
        {flow.note_th}
      </p>
    </div>
  );
};

export default JourneyFlowMap;
