// Wizard Step 4 — AI question generation/review
const Wizard = () => {
  const [expanded, setExpanded] = React.useState({ awareness: true, quality: false, identity: true, loyalty: false });
  const toggle = (k) => setExpanded(s => ({ ...s, [k]: !s[k] }));

  const questions = {
    awareness: [
      { id: 'AW-1', type: 'Open-short',  prompt: ['เมื่อพูดถึง ', { v: 'specialty coffee' }, ' แบรนด์แรกที่นึกถึงคืออะไร?'], req: true, ai: true },
      { id: 'AW-2', type: 'Open-long',   prompt: ['นอกจากนั้น คุณนึกถึงแบรนด์อะไรอีกบ้าง?'], req: true, ai: true },
      { id: 'AW-3', type: 'MCQ-multi',   prompt: ['แบรนด์ใดต่อไปนี้ที่คุณรู้จัก? · ', { v: 'Mali, Cafe Amazon, Starbucks, Inthanin, After You' }], req: true, ai: false },
      { id: 'AW-4', type: 'Likert-5',    prompt: ['คุณรู้จัก ', { v: 'Mali' }, ' ในระดับใด?'], req: true, ai: false },
      { id: 'AW-5', type: 'Open-short',  prompt: ['รู้จัก ', { v: 'Mali' }, ' จากที่ไหนเป็นที่แรก?'], req: false, ai: true },
    ],
    quality: [
      { id: 'PQ-1', type: 'Likert-7',     prompt: ['โดยรวม ', { v: 'Mali' }, ' มีคุณภาพระดับใด?'], req: true, ai: false },
      { id: 'PQ-2', type: 'Likert-7',     prompt: [{ v: 'Mali' }, ' มี ', { v: 'reliability' }, ' ระดับใด?'], req: true, ai: false },
      { id: 'PQ-7', type: 'Comparative',  prompt: ['เทียบ ', { v: 'Mali' }, ' กับ ', { v: 'Starbucks' }, ' คุณคิดว่า...'], req: true, ai: false },
      { id: 'PQ-8', type: 'Open-long',    prompt: ['อะไรทำให้รู้สึกว่า ', { v: 'Mali' }, ' มีคุณภาพ / ไม่มี?'], req: false, ai: true },
    ],
    identity: [
      { id: 'BI-1', type: 'Trait-grid', prompt: ['เลือก 3-5 ข้อที่อธิบาย ', { v: 'Mali' }, ' ได้ดีที่สุด'], req: true, ai: false },
      { id: 'BI-2', type: 'Open-long',  prompt: ['ถ้า ', { v: 'Mali' }, ' เป็นคน คุณจะอธิบายว่าเป็นคนแบบไหน?'], req: true, ai: true },
      { id: 'BI-3', type: 'Open-short', prompt: ['อธิบาย ', { v: 'Mali' }, ' ในคำเดียว'], req: true, ai: true },
      { id: 'BI-5', type: 'Likert-5',   prompt: [{ v: 'Mali' }, ' ทำตามสัญญา · ', { v: '"Slow coffee, made with care"' }], req: true, ai: false },
    ],
    loyalty: [
      { id: 'LY-1', type: 'NPS 0-10', prompt: ['คุณจะแนะนำ ', { v: 'Mali' }, ' ให้เพื่อนเท่าไหร่?'], req: true, ai: false },
      { id: 'LY-2', type: 'Likert-7', prompt: ['ครั้งหน้าจะเลือก ', { v: 'Mali' }, ' แน่นอน'], req: true, ai: false },
      { id: 'LY-3', type: 'Likert-7', prompt: ['ถ้าคู่แข่งลดราคา 20% ยังเลือก ', { v: 'Mali' }], req: true, ai: false },
      { id: 'LY-4', type: 'Open-long', prompt: ['ทำไมยังคงเลือก ', { v: 'Mali' }, '?'], req: false, ai: true },
    ],
  };

  const renderPrompt = (parts) => parts.map((p, i) => typeof p === 'string' ? <span key={i}>{p}</span> : <span key={i} className="var">{p.v}</span>);

  return (
    <div className="frame wiz">
      <div className="topbar" style={{padding:'12px 32px'}}>
        <div className="topbar-left">
          <button className="btn btn-ghost" style={{padding:'4px 8px'}}><Icon name="chevronL" size={12}/>My Studies</button>
          <span style={{fontSize:13,fontWeight:600,letterSpacing:'-0.01em'}}>New study · Mali</span>
          <span className="chip">Draft</span>
        </div>
        <div className="topbar-right">
          <span className="mono" style={{fontSize:11}}>Auto-saved 3s ago</span>
          <button className="btn btn-ghost"><Icon name="close" size={12}/></button>
        </div>
      </div>

      <div className="wiz-stepper">
        <div className="wiz-stepper-track">
          <div className="wiz-step done"><div className="top"><span className="nc"><Icon name="check" size={9} stroke="#F7F4EE"/></span>Brand basics</div><div className="progress"></div></div>
          <div className="wiz-step done"><div className="top"><span className="nc"><Icon name="check" size={9} stroke="#F7F4EE"/></span>Brand identity</div><div className="progress"></div></div>
          <div className="wiz-step done"><div className="top"><span className="nc"><Icon name="check" size={9} stroke="#F7F4EE"/></span>Segments</div><div className="progress"></div></div>
          <div className="wiz-step on"><div className="top"><span className="nc">4</span>Question review</div><div className="progress"></div></div>
        </div>
      </div>

      <div className="wiz-body">
        <div className="wiz-main">
          <div className="wiz-h-num">STEP · 04 / 04</div>
          <h1 className="wiz-h">Review your survey · 18 questions</h1>
          <div className="wiz-h-sub">AI ได้สร้างคำถามให้แล้ว — ตรวจสอบ แก้ไข เพิ่มหรือลบได้ตามต้องการ ก่อนเปิดรับคำตอบ</div>

          <div className="ai-status">
            <div className="ai-status-h"><span className="ai-dot" style={{width:6,height:6,background:'var(--be-red)',borderRadius:50,display:'inline-block'}}></span>AI Generation · complete in 14.2s</div>
            <div className="ai-status-msg">สร้างคำถาม 18 ข้อ ครอบคลุม Aaker 4 dimensions · ปรับตามบริบท Mali · specialty coffee</div>
            <div className="ai-status-dims">
              {Object.values(DIMENSIONS).map(d => (
                <div key={d.key} className="ai-status-dim">
                  <span style={{width:6,height:6,borderRadius:50,background:d.color}}></span>
                  {d.label} · {questions[d.key].length} q
                </div>
              ))}
            </div>
          </div>

          {Object.values(DIMENSIONS).map(d => (
            <div key={d.key} className={'dim-block' + (expanded[d.key] ? '' : ' collapsed')}>
              <div className="dim-block-h" onClick={()=>toggle(d.key)}>
                <div className="left">
                  <span style={{width:10,height:10,borderRadius:50,background:d.color}}></span>
                  <span style={{fontSize:14,fontWeight:600,letterSpacing:'-0.01em'}}>{d.label}</span>
                  <span style={{fontSize:11,color:'var(--ink-3)'}} className="mono">· {d.th}</span>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:14}}>
                  <span className="meta mono">{questions[d.key].length} questions</span>
                  <Icon name="chevron" size={12} style={{transform: expanded[d.key] ? 'rotate(0deg)' : 'rotate(-90deg)', transition:'transform 0.2s'}}/>
                </div>
              </div>
              <div className="qlist">
                {questions[d.key].map(q => (
                  <div key={q.id} className="qrow">
                    <div className="qid">{q.id}</div>
                    <div className="qprompt">
                      {renderPrompt(q.prompt)}
                      {q.req && <span style={{color:'var(--be-red)',marginLeft:6,fontSize:11}}>*</span>}
                      {q.ai && <span className="chip-dim" style={{marginLeft:8,color:'var(--be-red)',background:'rgba(200,16,46,0.06)',border:'1px solid rgba(200,16,46,0.2)'}}><span className="dot" style={{background:'var(--be-red)'}}></span>AI</span>}
                    </div>
                    <div className="qtype">{q.type}</div>
                    <div className="qact">
                      <button title="Edit"><Icon name="edit" size={12}/></button>
                      <button title="Duplicate"><Icon name="copy" size={12}/></button>
                      <button title="Delete"><Icon name="trash" size={12}/></button>
                    </div>
                  </div>
                ))}
                <div className="qadd"><Icon name="plus" size={11}/>เพิ่มคำถามเอง</div>
              </div>
            </div>
          ))}
        </div>

        <div className="wiz-side">
          <div className="ai-rail-h">Brand context</div>
          <div className="ai-rail-title">Mali · มะลิ</div>
          <div style={{fontSize:11.5,color:'var(--ink-3)',marginBottom:18,lineHeight:1.6}}>Specialty coffee · Bangkok · 8 branches · target young professionals 25-34</div>

          <div style={{paddingTop:14,borderTop:'1px solid var(--rule)',marginBottom:18}}>
            <div className="ai-rail-h" style={{marginBottom:10}}>Identity traits</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
              {['Modern','Artisanal','Premium','Mindful','Local'].map(t => (
                <span key={t} className="chip">{t}</span>
              ))}
            </div>
          </div>

          <div style={{paddingTop:14,borderTop:'1px solid var(--rule)',marginBottom:18}}>
            <div className="ai-rail-h" style={{marginBottom:10}}>Competitors · 4</div>
            <div style={{fontSize:12,color:'var(--ink-2)',lineHeight:1.7}}>
              {['Cafe Amazon','Starbucks','Inthanin','After You'].map((c, i, a) => <span key={c}>{c}{i<a.length-1 ? ' · ' : ''}</span>)}
            </div>
          </div>

          <div style={{paddingTop:14,borderTop:'1px solid var(--rule)',marginBottom:18}}>
            <div className="ai-rail-h" style={{marginBottom:10}}>Segments · 4</div>
            <div style={{fontSize:12,color:'var(--ink-2)',lineHeight:1.7}}>Age · Gender · Region · Occupation</div>
          </div>

          <div style={{paddingTop:14,borderTop:'1px solid var(--rule)'}}>
            <div className="ai-rail-h" style={{marginBottom:10}}>Estimated time</div>
            <div className="num" style={{fontSize:24,fontWeight:500,letterSpacing:'-0.02em'}}>6-8 <span style={{fontSize:13,color:'var(--ink-3)'}}>min</span></div>
            <div style={{fontSize:11,color:'var(--ink-3)',marginTop:4}}>ต่อผู้ตอบหนึ่งคน</div>
          </div>

          <button className="btn" style={{width:'100%',marginTop:24,justifyContent:'center'}}>
            <Icon name="refresh" size={11}/>Regenerate questions
          </button>
        </div>
      </div>

      <div className="wiz-foot">
        <button className="btn"><Icon name="chevronL" size={11}/>ย้อน · Segments</button>
        <div style={{display:'flex',gap:10,alignItems:'center'}}>
          <span style={{fontSize:11.5,color:'var(--ink-3)'}}>18 questions · 4 dimensions · est 6-8 min</span>
          <button className="btn btn-red">เปิดรับคำตอบ →</button>
        </div>
      </div>
    </div>
  );
};

window.Wizard = Wizard;
