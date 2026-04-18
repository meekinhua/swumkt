// ============== TWEAKS PANEL ==============
const TweaksPanel = ({ visible, tweaks, setTweaks }) => {
  if (!visible) return null;
  const set = (k, v) => {
    setTweaks(t => ({ ...t, [k]: v }));
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { [k]: v } }, '*');
  };
  return (
    <div className="tweaks-panel">
      <h4>Tweaks</h4>
      <div className="tweaks-row">
        <label>Theme</label>
        <div className="tweaks-btns">
          <button className={tweaks.theme === 'light' ? 'on' : ''} onClick={() => set('theme', 'light')}>Light</button>
          <button className={tweaks.theme === 'dark' ? 'on' : ''} onClick={() => set('theme', 'dark')}>Dark</button>
        </div>
      </div>
      <div className="tweaks-row">
        <label>Accent</label>
        <div className="tweaks-btns">
          <button className={tweaks.accent === 'red' ? 'on' : ''} onClick={() => set('accent', 'red')} style={{ background: tweaks.accent === 'red' ? '#C8102E' : undefined, color: tweaks.accent === 'red' ? 'white' : undefined }}>แดง</button>
          <button className={tweaks.accent === 'blue' ? 'on' : ''} onClick={() => set('accent', 'blue')} style={{ background: tweaks.accent === 'blue' ? '#1B75BC' : undefined, color: tweaks.accent === 'blue' ? 'white' : undefined }}>ฟ้า</button>
        </div>
      </div>
      <div className="tweaks-row">
        <label>Gamification</label>
        <div className="tweaks-btns">
          <button className={tweaks.showGamification ? 'on' : ''} onClick={() => set('showGamification', true)}>On</button>
          <button className={!tweaks.showGamification ? 'on' : ''} onClick={() => set('showGamification', false)}>Off</button>
        </div>
      </div>
      <div className="tweaks-row">
        <label>Tree compact</label>
        <div className="tweaks-btns">
          <button className={tweaks.compactTree ? 'on' : ''} onClick={() => set('compactTree', true)}>Yes</button>
          <button className={!tweaks.compactTree ? 'on' : ''} onClick={() => set('compactTree', false)}>No</button>
        </div>
      </div>
    </div>
  );
};

window.TweaksPanel = TweaksPanel;
