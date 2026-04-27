// Mobile respondent UI — Quality section, Likert question
const Respondent = () => {
  const [selected, setSelected] = React.useState(6);
  const [traits, setTraits] = React.useState(['Cozy', 'Aesthetic', 'Modern']);
  const toggleTrait = (t) => setTraits(s => s.includes(t) ? s.filter(x=>x!==t) : s.length<5 ? [...s,t] : s);

  return (
    <div className="phone">
      <div className="phone-screen">
        <div className="phone-notch"></div>
        <div className="phone-status">
          <span>9:41</span>
          <div className="right">
            <svg width="16" height="11" viewBox="0 0 16 11" fill="currentColor"><rect x="0" y="6" width="3" height="5" rx="0.5"/><rect x="4" y="4" width="3" height="7" rx="0.5"/><rect x="8" y="2" width="3" height="9" rx="0.5"/><rect x="12" y="0" width="3" height="11" rx="0.5"/></svg>
            <svg width="14" height="11" viewBox="0 0 14 11" fill="currentColor"><path d="M7 9.5l3-3a4.24 4.24 0 0 0-6 0l3 3z"/><path d="M7 6.5l1.5-1.5a2.12 2.12 0 0 0-3 0L7 6.5z"/></svg>
            <div style={{width:24,height:11,border:'1px solid currentColor',borderRadius:3,padding:1,position:'relative'}}>
              <div style={{width:'80%',height:'100%',background:'currentColor',borderRadius:1}}></div>
            </div>
          </div>
        </div>

        <div className="resp-head">
          <div className="resp-logo">M</div>
          <div className="resp-brandline">
            <strong>Mali · มะลิ</strong>
            ขอเวลา 6 นาทีของคุณ ช่วยตอบคำถามนี้
          </div>
          <button className="btn-ghost btn" style={{marginLeft:'auto',padding:6,borderRadius:'50%',width:30,height:30,justifyContent:'center'}}><Icon name="close" size={12}/></button>
        </div>

        <div className="resp-progress">
          <div className="resp-progress-segs">
            <div className="s done"></div>
            <div className="s on"></div>
            <div className="s"></div>
            <div className="s"></div>
          </div>
          <div className="resp-progress-meta">
            <span>ตอนที่ 2 · Quality</span>
            <span>Q 8 / 26</span>
          </div>
        </div>

        <div className="resp-body">
          <div className="resp-q-head">
            <div className="resp-q-num"><span className="dot"></span>Quality · คุณภาพที่รับรู้</div>
            <div className="resp-q-prompt">โดยรวม Mali มีคุณภาพระดับใด?</div>
            <div className="resp-q-help">เลือก 1 (แย่มาก) ถึง 7 (ดีมาก)</div>
          </div>
          <div className="resp-likert">
            {[1,2,3,4,5,6,7].map(n => (
              <button key={n} className={n===selected ? 'sel' : ''} onClick={()=>setSelected(n)}>{n}</button>
            ))}
          </div>
          <div className="resp-likert-labels">
            <span>แย่มาก</span>
            <span>ดีมาก</span>
          </div>

          <div style={{marginTop:34}}>
            <div className="resp-q-head" style={{marginBottom:14}}>
              <div className="resp-q-num"><span className="dot"></span>Up next · Identity</div>
              <div style={{fontSize:15,fontWeight:600,letterSpacing:'-0.01em',lineHeight:1.3}}>เลือก 3-5 คำที่อธิบาย Mali ได้ดีที่สุด</div>
              <div className="resp-q-help">เลือกได้ {traits.length} / 5</div>
            </div>
            <div className="resp-trait-grid">
              {['Modern', 'Artisanal', 'Premium', 'Cozy', 'Aesthetic', 'Local', 'Mindful', 'Expensive', 'Friendly', 'Innovative'].map(t => (
                <div key={t} className={'resp-trait ' + (traits.includes(t) ? 'sel' : '')} onClick={()=>toggleTrait(t)}>{t}</div>
              ))}
            </div>
          </div>
        </div>

        <div className="resp-foot">
          <button className="btn btn-ghost">ข้าม</button>
          <button className="btn btn-primary" style={{padding:'9px 18px'}}>ถัดไป →</button>
        </div>
      </div>
    </div>
  );
};

window.Respondent = Respondent;
