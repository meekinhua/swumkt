import React, { useState, useMemo } from 'react';

/**
 * BeFilterBar — filter analysis by time + segments, with optional Wave compare.
 *
 * Props:
 *   value            { from, to, segments }            current active filter
 *   compareValue     { from, to, segments } | null     wave-B filter (null when off)
 *   segmentsAvailable { age: [...], gender: [...] }    auto-derived from API
 *   responsesTotal   number                            all responses
 *   responsesFiltered number                           after wave-A filter
 *   onChange(next)                                     fires when wave-A filter changes
 *   onCompareChange(next | null)                       fires when wave-B filter changes / toggled off
 *   isShowcase       bool                              hides AI-rerun hints when true
 */
export const BeFilterBar = ({
  value, compareValue, segmentsAvailable, responsesTotal, responsesFiltered,
  onChange, onCompareChange, isShowcase = false,
}) => {
  const [open, setOpen] = useState(false);
  const compareOn = !!compareValue;

  const hasActiveFilter = useMemo(() => {
    return !!(value?.from || value?.to || Object.values(value?.segments || {}).some(v => (v || []).length));
  }, [value]);

  const segFields = useMemo(() => Object.keys(segmentsAvailable || {}), [segmentsAvailable]);

  const applyPreset = (days) => {
    if (!days) return onChange({ from: '', to: '', segments: value?.segments || {} });
    const now = new Date();
    const from = new Date(now.getTime() - days * 86400 * 1000);
    onChange({
      from: from.toISOString(),
      to: now.toISOString(),
      segments: value?.segments || {},
    });
  };

  const setRange = (key, raw) => {
    let iso = '';
    if (raw) {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) iso = d.toISOString();
    }
    onChange({ ...(value || {}), [key]: iso });
  };

  const isoToDateInput = (iso) => {
    if (!iso) return '';
    try { return new Date(iso).toISOString().slice(0, 10); } catch { return ''; }
  };

  const toggleSeg = (field, val) => {
    const cur = (value?.segments?.[field] || []);
    const next = cur.includes(val) ? cur.filter(x => x !== val) : [...cur, val];
    onChange({
      ...(value || {}),
      segments: { ...(value?.segments || {}), [field]: next },
    });
  };

  const reset = () => {
    onChange({ from: '', to: '', segments: {} });
    if (compareOn) onCompareChange(null);
  };

  return (
    <div className="be-filter-bar" data-testid="be-filter-bar">
      <div className="be-filter-summary" onClick={() => setOpen(!open)}>
        <div className="be-filter-summary-left">
          <span className="be-filter-icon">⌕</span>
          <span className="be-mono be-tiny" style={{ letterSpacing: '0.14em' }}>
            FILTER · ANALYSIS
          </span>
          <span className="be-filter-count" data-testid="be-filter-count">
            <strong>{responsesFiltered ?? 0}</strong>
            <span className="be-tiny" style={{ color: 'var(--ink-3)' }}>/</span>
            {responsesTotal ?? 0}
            <span className="be-tiny" style={{ color: 'var(--ink-3)', marginLeft: 4 }}>responses</span>
          </span>
          {hasActiveFilter && (
            <span className="be-filter-active-pill" data-testid="be-filter-active">
              ● ACTIVE
            </span>
          )}
          {compareOn && (
            <span className="be-filter-compare-pill" data-testid="be-filter-compare-pill">
              ◆ WAVE COMPARE
            </span>
          )}
        </div>
        <div className="be-filter-summary-right">
          {hasActiveFilter && (
            <button type="button" className="be-filter-clear"
                    data-testid="be-filter-reset"
                    onClick={(e) => { e.stopPropagation(); reset(); }}>
              ✕ Reset
            </button>
          )}
          <span className="be-filter-toggle" data-testid="be-filter-toggle">
            {open ? 'COLLAPSE ▲' : 'EXPAND ▼'}
          </span>
        </div>
      </div>

      {open && (
        <div className="be-filter-body">
          <WaveBlock label="WAVE A · Active" value={value} setRange={setRange}
                     applyPreset={applyPreset} isoToDateInput={isoToDateInput}
                     segFields={segFields} segmentsAvailable={segmentsAvailable}
                     toggleSeg={toggleSeg} testidPrefix="be-filter-a"/>

          <div className="be-filter-divider"/>

          {!isShowcase && (
            <div className="be-filter-compare-row">
              <label className="be-filter-toggle-row">
                <input type="checkbox" checked={compareOn}
                       data-testid="be-filter-compare-toggle"
                       onChange={(e) => onCompareChange(e.target.checked
                         ? { from: '', to: '', segments: {} }
                         : null)}/>
                <span className="be-mono be-tiny" style={{ letterSpacing: '0.12em' }}>
                  COMPARE WAVES — เปรียบเทียบ Wave A vs Wave B (สำหรับ tracking health)
                </span>
              </label>
            </div>
          )}

          {compareOn && (
            <WaveBlock label="WAVE B · Compare" value={compareValue}
                       setRange={(k, v) => {
                         let iso = '';
                         if (v) { const d = new Date(v); if (!isNaN(d.getTime())) iso = d.toISOString(); }
                         onCompareChange({ ...(compareValue || {}), [k]: iso });
                       }}
                       applyPreset={(days) => {
                         if (!days) return onCompareChange({ from: '', to: '', segments: compareValue?.segments || {} });
                         const now = new Date();
                         const from = new Date(now.getTime() - days * 86400 * 1000);
                         onCompareChange({
                           from: from.toISOString(), to: now.toISOString(),
                           segments: compareValue?.segments || {},
                         });
                       }}
                       isoToDateInput={isoToDateInput}
                       segFields={segFields} segmentsAvailable={segmentsAvailable}
                       toggleSeg={(field, val) => {
                         const cur = (compareValue?.segments?.[field] || []);
                         const next = cur.includes(val) ? cur.filter(x => x !== val) : [...cur, val];
                         onCompareChange({
                           ...(compareValue || {}),
                           segments: { ...(compareValue?.segments || {}), [field]: next },
                         });
                       }}
                       testidPrefix="be-filter-b"/>
          )}

          {!isShowcase && hasActiveFilter && (
            <div className="be-filter-ai-hint" data-testid="be-filter-ai-hint">
              💡 AI insights (themes / identity-image / master insights) ที่แสดงอยู่ตอนนี้คำนวณจากชุดข้อมูลนี้
              — กดปุ่ม <strong>"Run AI for this filter"</strong> ที่ topbar เพื่อให้ AI วิเคราะห์เฉพาะ slice นี้
              (ผลถูก cache ตาม filter signature)
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const SEGMENT_LABELS = {
  age: 'อายุ', gender: 'เพศ', region: 'ภูมิภาค', usage_frequency: 'ความถี่การใช้',
};

const WaveBlock = ({ label, value, setRange, applyPreset, isoToDateInput,
                    segFields, segmentsAvailable, toggleSeg, testidPrefix }) => (
  <div className="be-filter-wave" data-testid={testidPrefix}>
    <div className="be-mono be-tiny be-filter-wave-label">{label}</div>

    <div className="be-filter-section">
      <div className="be-mono be-tiny be-muted">TIME RANGE</div>
      <div className="be-filter-presets">
        <button type="button" onClick={() => applyPreset(7)}  data-testid={`${testidPrefix}-preset-7d`}>7D</button>
        <button type="button" onClick={() => applyPreset(30)} data-testid={`${testidPrefix}-preset-30d`}>30D</button>
        <button type="button" onClick={() => applyPreset(90)} data-testid={`${testidPrefix}-preset-90d`}>90D</button>
        <button type="button" onClick={() => applyPreset(0)}  data-testid={`${testidPrefix}-preset-all`}>ALL</button>
      </div>
      <div className="be-filter-dates">
        <label>
          <span className="be-tiny be-muted">FROM</span>
          <input type="date" value={isoToDateInput(value?.from)}
                 data-testid={`${testidPrefix}-from`}
                 onChange={(e) => setRange('from', e.target.value)}/>
        </label>
        <label>
          <span className="be-tiny be-muted">TO</span>
          <input type="date" value={isoToDateInput(value?.to)}
                 data-testid={`${testidPrefix}-to`}
                 onChange={(e) => setRange('to', e.target.value)}/>
        </label>
      </div>
    </div>

    {segFields.length > 0 && (
      <div className="be-filter-section">
        <div className="be-mono be-tiny be-muted">SEGMENTS · เลือกได้หลายค่า</div>
        {segFields.map(field => {
          const opts = segmentsAvailable[field] || [];
          if (opts.length === 0) return null;
          const sel = (value?.segments?.[field] || []);
          return (
            <div key={field} className="be-filter-seg-row">
              <div className="be-tiny" style={{ color: 'var(--ink-2)', minWidth: 70 }}>
                {(SEGMENT_LABELS[field] || field).toUpperCase()}
              </div>
              <div className="be-filter-seg-chips">
                {opts.map(opt => (
                  <button key={opt} type="button"
                          data-testid={`${testidPrefix}-seg-${field}-${opt}`}
                          onClick={() => toggleSeg(field, opt)}
                          className={`be-filter-chip ${sel.includes(opt) ? 'on' : ''}`}>
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    )}
  </div>
);

export default BeFilterBar;
