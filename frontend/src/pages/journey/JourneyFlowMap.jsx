import React, { useMemo, useState } from 'react';
import MermaidViewer from '@/components/MermaidViewer';
import { copyToClipboard } from '@/lib/clipboard';
import { fmtPct, fmtNum } from './copy-th';

/**
 * Observed-flow map, drawn with Mermaid (same renderer as the qualitative tab,
 * so zoom / pan / fullscreen come along).
 *
 * Everything on it is read from the customer's side: the box shape is the
 * channel THEY said they used, the frames are the phase THEY were in, the edge
 * width is how many of them actually walked it. No probability is estimated,
 * nothing is smoothed and no certainty band is drawn — that is Phase 2.
 */

const sanitize = (s) => String(s || '').replace(/["\[\](){}<>|#;]/g, ' ').trim();

// Shape per channel, assigned in the order the channels appear in the data so
// the same channel keeps the same shape across every study view.
const SHAPES = [
  { open: '["', close: '"]', name: 'สี่เหลี่ยม' },
  { open: '("', close: '")', name: 'มุมมน' },
  { open: '{{"', close: '"}}', name: 'หกเหลี่ยม' },
  { open: '[/"', close: '"/]', name: 'มุมเฉียง' },
  { open: '[["', close: '"]]', name: 'กรอบซ้อน' },
  { open: '[("', close: '")]', name: 'ทรงกระบอก' },
];
const NO_CHANNEL_SHAPE = { open: '["', close: '"]', name: 'ไม่ระบุช่องทาง' };

const burdenClass = (b) => {
  if (b === null || b === undefined) return 'ndata';
  if (b >= 60) return 'hot';
  if (b >= 40) return 'warm';
  return 'cool';
};

const PAIN_FLAG = 0.30;   // a step a third of its visitors call a problem

const buildMermaid = (flow, channelOrder, { showLoops, hideThin, groupStages }) => {
  if (!flow?.nodes?.length) return '';
  const lines = ['flowchart LR'];
  const classes = { hot: [], warm: [], cool: [], ndata: [], term: [], start: [] };
  const painNodes = [];

  const shapeOf = (ch) => {
    if (!ch) return NO_CHANNEL_SHAPE;
    const i = channelOrder.indexOf(ch);
    return SHAPES[(i < 0 ? 0 : i) % SHAPES.length];
  };

  const stepLine = (n) => {
    const bits = [sanitize(n.label_th), `ผ่าน ${n.n_visit} คน · ${fmtPct(n.reach, 0)}`];
    if (n.dominant_channel) {
      bits.push(`ผ่าน${sanitize(n.dominant_channel)} ${fmtPct(n.dominant_channel_share, 0)}`);
    }
    if (n.burden !== null && n.burden !== undefined) bits.push(`ยุ่งยาก ${fmtNum(n.burden, 0)}/100`);
    if (n.pain_nomination_rate) bits.push(`มีปัญหา ${fmtPct(n.pain_nomination_rate, 0)}`);
    if (n.revisit > 1.05) bits.push(`ทำซ้ำ ${fmtNum(n.revisit, 2)} ครั้ง`);
    const sh = shapeOf(n.dominant_channel);
    classes[burdenClass(n.burden)].push(n.id);
    if ((n.pain_nomination_rate || 0) >= PAIN_FLAG) painNodes.push(n.id);
    return `    ${n.id}${sh.open}${bits.join('<br/>')}${sh.close}`;
  };

  const start = flow.nodes.find((n) => n.kind === 'start');
  if (start) {
    lines.push(`  ${start.id}(("${sanitize(start.label_th)}<br/>${start.n_visit} คน"))`);
    classes.start.push(start.id);
  }

  const steps = flow.nodes.filter((n) => n.kind === 'step');
  if (groupStages && (flow.stages || []).length) {
    (flow.stages || []).forEach((st) => {
      const inStage = steps.filter((n) => n.stage_id === st.id);
      if (!inStage.length) return;
      lines.push(`  subgraph st_${st.id}["${sanitize(st.label_th)}"]`);
      lines.push('    direction LR');
      inStage.forEach((n) => lines.push(stepLine(n)));
      lines.push('  end');
    });
    const orphans = steps.filter((n) => !(flow.stages || []).some((st) => st.id === n.stage_id));
    orphans.forEach((n) => lines.push(stepLine(n)));
  } else {
    steps.forEach((n) => lines.push(stepLine(n)));
  }

  flow.nodes.filter((n) => n.kind === 'terminal').forEach((n) => {
    lines.push(`  ${n.id}(["${sanitize(n.label_th)}<br/>${n.n_visit} คน · ${fmtPct(n.reach, 1)}"])`);
    classes.term.push(n.id);
  });

  const edges = (flow.edges || [])
    .filter((e) => (showLoops || !e.self_loop))
    .filter((e) => !(hideThin && e.thin));

  const styles = [];
  edges.forEach((e, i) => {
    const pctPart = e.share_of_source === null || e.share_of_source === undefined
      ? '' : ` · ${fmtPct(e.share_of_source, 0)}`;
    const arrow = e.thin ? '-.->' : '-->';
    lines.push(`  ${e.from} ${arrow}|"${e.count} คน${pctPart}"| ${e.to}`);
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
  lines.push('  classDef painflag stroke:#B0332A,stroke-width:4px');
  Object.entries(classes).forEach(([k, ids]) => {
    if (ids.length) lines.push(`  class ${ids.join(',')} ${k}`);
  });
  if (painNodes.length) lines.push(`  class ${painNodes.join(',')} painflag`);
  lines.push(...styles);
  return lines.join('\n');
};

export const JourneyFlowMap = ({ flow, touchpoints }) => {
  const [showLoops, setShowLoops] = useState(true);
  const [hideThin, setHideThin] = useState(false);
  const [groupStages, setGroupStages] = useState(true);
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);

  const channelOrder = useMemo(
    () => (touchpoints?.rows || []).map((r) => r.label),
    [touchpoints],
  );

  const code = useMemo(
    () => buildMermaid(flow, channelOrder, { showLoops, hideThin, groupStages }),
    [flow, channelOrder, showLoops, hideThin, groupStages],
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
  const shapeLegend = channelOrder.slice(0, SHAPES.length)
    .map((c, i) => `${c} = ${SHAPES[i].name}`);

  return (
    <div data-testid="journey-flow-map">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <button className="be-chip" aria-pressed={groupStages} data-testid="journey-map-stages"
                onClick={() => setGroupStages((v) => !v)}>
          จัดกลุ่มตามระยะของลูกค้า
        </button>
        <button className="be-chip" aria-pressed={showLoops} data-testid="journey-map-loops"
                onClick={() => setShowLoops((v) => !v)}>
          การทำซ้ำในขั้นเดิม ({loops.length})
        </button>
        <button className="be-chip" aria-pressed={hideThin} data-testid="journey-map-thin"
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
        <span><i className="jy-sw jy-sw-pain" />ขอบหนาแดง = ผู้ผ่านขั้นนี้ระบุว่ามีปัญหา ≥30%</span>
        <span>เส้นหนา = คนเดินเส้นนั้นมาก · เส้นประ = หลักฐานบาง · เส้นแดงวนกลับ = ทำซ้ำ</span>
      </div>

      {shapeLegend.length > 0 && (
        <div className="jy-map-legend" data-testid="journey-map-shape-legend">
          <span>รูปทรงกล่อง = ช่องทางหลักที่ลูกค้าใช้:</span>
          {shapeLegend.map((s) => <span key={s}>{s}</span>)}
        </div>
      )}

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
