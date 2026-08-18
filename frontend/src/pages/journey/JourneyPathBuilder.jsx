import React, { useState } from 'react';
import { COPY } from './copy-th';

/**
 * Tap-to-edit replay (spec 2.5). The confirmed replay is the SOLE source of
 * truth for `path`; branch answers are kept as diagnostics only.
 *
 * Vertical chip list, 44px controls, remove + insert-after. Reordering by drag
 * is deliberately not supported — HTML5 drag does not work on a phone, and a
 * phone is how a shared link gets opened.
 */
export const JourneyPathBuilder = ({
  states = [],
  draftPath = [],
  terminal = 'UNKNOWN',
  terminalLabels = {},
  onChange,
  onTerminalChange,
  onConfirm,
}) => {
  const [sheetAt, setSheetAt] = useState(null); // insert-after index
  const [termOpen, setTermOpen] = useState(false);
  const labelOf = (id) => states.find((s) => s.id === id)?.label_th || id;

  const remove = (i) => onChange(draftPath.filter((_, k) => k !== i));
  const insertAfter = (i, sid) => {
    const next = [...draftPath];
    next.splice(i + 1, 0, sid);
    onChange(next.slice(0, 12));
    setSheetAt(null);
  };

  return (
    <div data-testid="jy-path-builder">
      <div className="jy-steps">
        {draftPath.map((sid, i) => (
          <div className="jy-chip-row" key={`${sid}-${i}`} data-testid={`jy-chip-${i}`}>
            <span className="jy-ord">{i + 1}</span>
            <span className="jy-label">{labelOf(sid)}</span>
            <button
              type="button"
              className="jy-icon-btn"
              aria-label="ลบขั้นนี้"
              data-testid={`jy-chip-remove-${i}`}
              onClick={() => remove(i)}
            >
              ✕
            </button>
            <button
              type="button"
              className="jy-icon-btn"
              aria-label="แทรกขั้นถัดจากนี้"
              data-testid={`jy-chip-insert-${i}`}
              onClick={() => setSheetAt(i)}
            >
              ⊕
            </button>
          </div>
        ))}

        {draftPath.length === 0 && (
          <div className="jy-locked" data-testid="jy-path-empty">
            ยังไม่มีขั้นตอนในลำดับ — กด “แทรกขั้นตอน” เพื่อเพิ่ม
            <div style={{ marginTop: 10 }}>
              <button type="button" className="be-btn be-btn-sm" data-testid="jy-chip-insert-empty"
                      onClick={() => setSheetAt(-1)}>
                แทรกขั้นตอน
              </button>
            </div>
          </div>
        )}

        <div className="jy-chip-row jy-terminal" data-testid="jy-chip-terminal">
          <span className="jy-ord">→</span>
          <span className="jy-label">
            ปลายทาง: <b>{terminalLabels[terminal] || terminal}</b>
          </span>
          <button type="button" className="be-btn be-btn-sm" data-testid="jy-terminal-change"
                  onClick={() => setTermOpen(true)}>
            เปลี่ยน
          </button>
        </div>
      </div>

      <p className="be-tiny" style={{ color: 'var(--ink-3)', margin: '12px 0 18px', lineHeight: 1.6 }}>
        {COPY.replayHelp}
      </p>

      <button type="button" className="be-btn be-btn-primary be-btn-lg" data-testid="jy-replay-confirm"
              onClick={onConfirm}>
        ถูกต้องแล้ว
      </button>

      {sheetAt !== null && (
        <div className="jy-sheet" onClick={() => setSheetAt(null)} data-testid="jy-insert-sheet">
          <div className="jy-sheet-inner" onClick={(e) => e.stopPropagation()}>
            <div className="be-label">แทรกขั้นตอน</div>
            <div className="jy-optlist">
              {states.map((s) => (
                <button key={s.id} type="button" className="jy-opt"
                        data-testid={`jy-insert-opt-${s.id}`}
                        onClick={() => insertAfter(sheetAt, s.id)}>
                  {s.label_th}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {termOpen && (
        <div className="jy-sheet" onClick={() => setTermOpen(false)} data-testid="jy-terminal-sheet">
          <div className="jy-sheet-inner" onClick={(e) => e.stopPropagation()}>
            <div className="be-label">ปลายทางของคุณคือ</div>
            <div className="jy-optlist">
              {['CONV', 'ABANDON', 'UNKNOWN'].map((t) => (
                <button key={t} type="button"
                        className={`jy-opt ${terminal === t ? 'jy-on' : ''}`}
                        data-testid={`jy-terminal-opt-${t}`}
                        onClick={() => { onTerminalChange(t); setTermOpen(false); }}>
                  {terminalLabels[t] || t}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default JourneyPathBuilder;
