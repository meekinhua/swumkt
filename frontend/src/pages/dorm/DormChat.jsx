import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, BadgeCheck, Check, Copy, ExternalLink, Inbox, MessageCircle, Power, Send, Share2, TriangleAlert, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Avatar, Empty, Sheet, Skeleton, useShell } from './DormLayout';
import { API, agoTh, authHeaders, errMsg, invalidateBuildings, useMediaQuery } from './dormApi';

const ICEBREAKERS = {
  listing: [
    'ห้องยังว่างไหมครับ/คะ',
    'ขอนัดดูห้องได้วันไหนบ้างครับ/คะ',
    'สนใจหารห้องนี้ครับ/คะ สะดวกคุยไหม',
  ],
  mate: [
    'สนใจหารห้องด้วยกันครับ/คะ',
    'งบกับโซนตรงกันเลย ลองคุยกันไหม',
    'เล็งตึกไหนไว้บ้างครับ/คะ',
  ],
  mate_room: [
    'สนใจหารห้องนี้ด้วยกันไหมครับ/คะ',
    'เราสนใจห้องนี้เหมือนกัน ลองคุยเงื่อนไขกันไหม',
    'สะดวกนัดดูห้องนี้ด้วยกันไหมครับ/คะ',
  ],
};

const tokOf = (t) => t || (() => { try { return localStorage.getItem('token'); } catch { return null; } })();

const MsgBubble = ({ m, onCopyLine }) => {
  if (m.kind === 'line_card') {
    const clean = (m.body || '').replace(/^@?/, '');
    return (
      <div className={`dm-msg ${m.is_mine ? 'is-mine' : ''}`}>
        <div className="dm-msg-linecard">
          <small>{m.is_mine ? 'คุณส่ง LINE ID' : 'อีกฝั่งส่ง LINE ID ให้คุณ'}</small>
          <b>{m.body}</b>
          <div className="dm-msg-lineacts">
            <button type="button" className="dm-btn dm-btn-quiet dm-btn-sm" onClick={() => onCopyLine(m.body)}>
              <Copy size={13} aria-hidden="true" />คัดลอก
            </button>
            <a className="dm-btn dm-btn-line dm-btn-sm" target="_blank" rel="noreferrer" href={`https://line.me/R/ti/p/~${encodeURIComponent(clean)}`}>
              เพิ่มเพื่อน LINE
            </a>
          </div>
        </div>
        <span className="dm-msg-time">{agoTh(m.created_at)}</span>
      </div>
    );
  }
  return (
    <div className={`dm-msg ${m.is_mine ? 'is-mine' : ''}`}>
      <div className="dm-msg-bubble">{m.body}</div>
      <span className="dm-msg-time">{agoTh(m.created_at)}</span>
    </div>
  );
};

// Reusable conversation view (used both inside the in-page ChatSheet and inside the /dorm/me Inbox).
export function ChatThread({ threadId, initialThread, initialMessages, initialLine = '', onBack, onSent, onOpenInbox }) {
  const { token } = useAuth();
  const { toast, confirm } = useShell();
  const [thread, setThread] = useState(initialThread || null);
  const [msgs, setMsgs] = useState(initialMessages || null);
  const [myLine, setMyLine] = useState(initialLine || '');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [lineAsk, setLineAsk] = useState(false);
  const [lineDraft, setLineDraft] = useState('');
  const [err, setErr] = useState('');
  const [listingBusy, setListingBusy] = useState(false);
  const [lStatus, setLStatus] = useState(initialThread?.listing_status || '');
  const [confirmNeeded, setConfirmNeeded] = useState(!!initialThread?.listing_confirm_needed);
  const endRef = useRef(null);

  useEffect(() => {
    if (thread?.listing_status) setLStatus(thread.listing_status);
    setConfirmNeeded(!!thread?.listing_confirm_needed);
  }, [thread?.listing_status, thread?.listing_confirm_needed]);

  const load = useCallback((silent = false) => {
    if (!threadId) return undefined;
    const ctl = new AbortController();
    axios.get(`${API}/threads/${threadId}/messages`, { ...authHeaders(tokOf(token)), signal: ctl.signal })
      .then((r) => {
        setThread(r.data.thread);
        setMsgs(r.data.messages || []);
        if (r.data.my_line) setMyLine(r.data.my_line);
        setErr('');
      })
      .catch((e) => { if (!axios.isCancel(e) && !silent) setErr(errMsg(e)); });
    return () => ctl.abort();
  }, [threadId, token]);

  useEffect(() => {
    if (!initialMessages) load();
    const t = setInterval(() => load(true), 8000);
    return () => clearInterval(t);
  }, [load, initialMessages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs?.length]);

  const send = async (body, kind = 'text') => {
    const clean = (body || '').trim();
    if (!clean || !threadId || sending) return;
    setSending(true); setErr('');
    try {
      const r = await axios.post(`${API}/threads/${threadId}/messages`, { body: clean, kind }, authHeaders(tokOf(token)));
      setMsgs((cur) => [...(cur || []), r.data.message]);
      if (kind === 'text') setText('');
      if (kind === 'line_card') {
        setLineAsk(false); setLineDraft(''); setMyLine(clean);
        toast('ส่ง LINE ID ของคุณในแชทแล้ว');
      }
      if (onSent) onSent(r.data.message);
    } catch (e) { setErr(errMsg(e, 'ส่งข้อความไม่สำเร็จ')); }
    setSending(false);
  };

  const shareLine = () => {
    if (myLine) { send(myLine, 'line_card'); return; }
    setLineAsk((v) => !v);
  };
  const copyLine = async (v) => {
    try { await navigator.clipboard.writeText(v); toast('คัดลอก LINE ID แล้ว'); } catch { toast(`LINE ID: ${v}`); }
  };
  const confirmStillOpen = async () => {
    if (!thread?.context_id || listingBusy) return;
    setListingBusy(true);
    try {
      await axios.post(`${API}/listings/${thread.context_id}/confirm-available`, {}, authHeaders(tokOf(token)));
      setConfirmNeeded(false);
      setLStatus('active');
      invalidateBuildings();
      toast('ยืนยันว่ายังว่างและต่ออายุประกาศแล้ว');
    } catch (e) { toast(errMsg(e)); }
    setListingBusy(false);
  };
  const quickStatus = async (status) => {
    if (!thread?.context_id || listingBusy) return;
    if (status === 'closed') {
      const ok = await confirm({ title: 'ปิดประกาศนี้?', body: 'คนอื่นจะไม่เห็นประกาศนี้อีก เปิดใหม่ได้ภายหลังในหน้าของฉัน', action: 'ปิดประกาศ', danger: true });
      if (!ok) return;
    }
    setListingBusy(true);
    try {
      await axios.post(`${API}/listings/${thread.context_id}/status`, { status }, authHeaders(tokOf(token)));
      setLStatus(status);
      setConfirmNeeded(false);
      invalidateBuildings();
      toast(status === 'reserved' ? 'ติดป้ายมีคนจองแล้ว (แสดงต่อ 5 วัน)' : 'ปิดประกาศแล้ว');
    } catch (e) { toast(errMsg(e)); }
    setListingBusy(false);
  };

  const isMateRoom = thread?.context_type === 'mate' && (thread?.context_link || '').startsWith('/dorm/rooms/');
  const prompts = isMateRoom ? ICEBREAKERS.mate_room : (ICEBREAKERS[thread?.context_type] || ICEBREAKERS.listing);
  const showDealBar = !!(thread?.is_listing_owner && lStatus && lStatus !== 'closed' && (confirmNeeded || (msgs?.length || 0) >= 2));

  return (
    <div className="dm-chatbox-wrap" data-testid="dorm-chat-thread">
      {thread && (
        <div className="dm-chat-ctx">
          {onBack && (
            <button type="button" className="dm-iconbtn" onClick={onBack} aria-label="กลับไปรายการแชท">
              <ArrowLeft size={18} aria-hidden="true" />
            </button>
          )}
          <Avatar name={thread.other_name} size={36} />
          <div className="dm-chat-ctx-id">
            <b>
              <span className="dm-ellipsis">{thread.other_name}</span>
              {thread.other_verified && <BadgeCheck size={14} className="dm-chat-v" aria-label="ยืนยันนิสิต มศว" />}
            </b>
            {thread.context_link
              ? <Link to={thread.context_link} className="dm-chat-ctx-link" onClick={onOpenInbox}><span className="dm-ellipsis">{thread.context_title}</span><ExternalLink size={11} aria-hidden="true" /></Link>
              : <span className="dm-ellipsis">{thread.context_title}</span>}
          </div>
          {onOpenInbox ? (
            <Link to="/dorm/me?tab=chat" className="dm-chat-inboxlink" onClick={onOpenInbox} title="เปิดกล่องข้อความทั้งหมด">
              <Inbox size={14} aria-hidden="true" /><span>กล่องแชท</span>
            </Link>
          ) : (
            <span className="dm-chat-live" title="ดึงข้อความใหม่อัตโนมัติทุก 8 วินาที"><i aria-hidden="true" />อัปเดตอัตโนมัติ</span>
          )}
        </div>
      )}

      <div className="dm-chat-log" aria-live="polite">
        {msgs === null ? (
          <div style={{ display: 'grid', gap: 10 }}><Skeleton h={44} r={14} /><Skeleton h={44} r={14} /></div>
        ) : msgs.length === 0 ? (
          <div className="dm-chat-empty">
            <p className="dm-small dm-muted">คุยเช็กเงื่อนไขในเว็บก่อนได้ ไม่ต้องรีบแอด LINE · พอใจแล้วค่อยกด “ส่ง LINE” แลกช่องทางติดต่อ</p>
            <div className="dm-chat-ice">
              {prompts.map((p) => (
                <button key={p} type="button" className="dm-chip" disabled={sending} onClick={() => send(p)}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          msgs.map((m) => <MsgBubble key={m.id} m={m} onCopyLine={copyLine} />)
        )}
        <div ref={endRef} />
      </div>

      {err && <div className="dm-err" role="alert" style={{ margin: '0 0 8px' }}>{err}</div>}

      {lineAsk && (
        <form className="dm-chat-lineask" onSubmit={(e) => { e.preventDefault(); send(lineDraft, 'line_card'); }}>
          <input value={lineDraft} onChange={(e) => setLineDraft(e.target.value)} placeholder="ใส่ LINE ID ที่จะส่งให้อีกฝั่ง" maxLength={60} autoCapitalize="none" autoFocus />
          <button type="submit" className="dm-btn dm-btn-line dm-btn-sm" disabled={sending || !lineDraft.trim()}>ส่ง</button>
          <button type="button" className="dm-iconbtn" onClick={() => setLineAsk(false)} aria-label="ยกเลิก"><X size={16} aria-hidden="true" /></button>
        </form>
      )}

      {showDealBar && (
        <div className={`dm-chat-dealbar ${confirmNeeded ? 'is-warn' : ''}`} data-testid="dorm-chat-dealbar">
          <span>
            {confirmNeeded ? <><TriangleAlert size={14} aria-hidden="true" />มีคนแจ้งว่าห้องนี้อาจไม่ว่าง</> : 'ตกลงกันได้แล้ว?'}
          </span>
          <div className="dm-chat-dealacts">
            {confirmNeeded && (
              <button type="button" className="dm-btn dm-btn-ink dm-btn-sm" disabled={listingBusy} onClick={confirmStillOpen}>
                <Check size={13} aria-hidden="true" />ยังว่างอยู่
              </button>
            )}
            {!confirmNeeded && lStatus === 'active' && (
              <button type="button" className="dm-btn dm-btn-tint dm-btn-sm" disabled={listingBusy} onClick={() => quickStatus('reserved')}>
                ติดป้ายจอง
              </button>
            )}
            <button type="button" className="dm-btn dm-btn-quiet dm-btn-sm" disabled={listingBusy} onClick={() => quickStatus('closed')}>
              <Power size={13} aria-hidden="true" />ปิดประกาศ
            </button>
          </div>
        </div>
      )}

      <form className="dm-chat-compose" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <button type="button" className="dm-btn dm-btn-quiet dm-btn-sm dm-chat-shareline" onClick={shareLine} disabled={sending} title="ส่ง LINE ID ของคุณให้อีกฝั่ง">
          <Share2 size={15} aria-hidden="true" /><span>ส่ง LINE</span>
        </button>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="พิมพ์ข้อความ..." maxLength={1000} aria-label="พิมพ์ข้อความ" />
        <button type="submit" className="dm-btn dm-btn-primary dm-btn-sm dm-chat-send" disabled={sending || !text.trim()} aria-label="ส่งข้อความ" data-testid="dorm-chat-send">
          <Send size={16} aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}

// In-page Sheet opened when clicking "ทักคุยในเว็บ" from any room detail page or mate card.
export function ChatSheet({ target, onClose, onActivity }) {
  const { token } = useAuth();
  const [boot, setBoot] = useState(null);
  const [err, setErr] = useState('');
  const tok = tokOf(token);
  const kind = target?.kind || '';
  const id = target?.id || '';
  const roomId = target?.roomId || '';

  useEffect(() => {
    if (!kind || !id || !tok) return undefined;
    let on = true;
    setBoot(null); setErr('');
    axios.post(`${API}/threads`, { target_type: kind, target_id: id, ...(roomId ? { room_id: roomId } : {}) }, authHeaders(tok))
      .then((r) => { if (on) setBoot(r.data); })
      .catch((e) => { if (on) setErr(errMsg(e, 'เปิดห้องแชทไม่สำเร็จ')); });
    return () => { on = false; };
  }, [kind, id, roomId, tok]);

  if (!target) return null;
  return (
    <Sheet title={boot?.thread ? `คุยกับ ${boot.thread.other_name}` : 'ส่งข้อความ'} onClose={onClose} testid="dorm-chat-sheet">
      {err ? <div className="dm-err" role="alert">{err}</div>
        : !boot ? <div style={{ display: 'grid', gap: 10 }}><Skeleton h={48} r={14} /><Skeleton h={180} r={14} /></div>
          : <ChatThread threadId={boot.thread.id} initialThread={boot.thread} initialMessages={boot.messages}
                        initialLine={boot.my_line} onSent={onActivity} onOpenInbox={onClose} />}
    </Sheet>
  );
}

// Inbox tab in /dorm/me?tab=chat
export function InboxPanel({ onRead }) {
  const { token } = useAuth();
  const desk = useMediaQuery('(min-width: 900px)');
  const [items, setItems] = useState(null);
  const [myLine, setMyLine] = useState('');
  const [activeId, setActiveId] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback((silent = false) => {
    const ctl = new AbortController();
    axios.get(`${API}/threads`, { ...authHeaders(tokOf(token)), signal: ctl.signal })
      .then((r) => {
        setItems(r.data.items || []);
        if (r.data.my_line) setMyLine(r.data.my_line);
        setErr('');
      })
      .catch((e) => { if (!axios.isCancel(e) && !silent) setErr(errMsg(e)); });
    return () => ctl.abort();
  }, [token]);

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 12000);
    return () => clearInterval(t);
  }, [load]);

  const openThread = useCallback((id) => {
    setActiveId(id);
    setItems((cur) => (cur || []).map((x) => (x.id === id ? { ...x, unread: false } : x)));
    if (onRead) onRead();
  }, [onRead]);

  // On wide screens, auto-open the newest thread so the user sees the conversation immediately without an extra click.
  useEffect(() => {
    if (desk && items?.length && !activeId) openThread(items[0].id);
  }, [desk, items, activeId, openThread]);

  if (err) return <div className="dm-err" role="alert">{err}</div>;
  if (items === null) return <div style={{ display: 'grid', gap: 10 }}><Skeleton h={72} r={14} /><Skeleton h={72} r={14} /></div>;
  if (!items.length) {
    return (
      <Empty title="ยังไม่มีข้อความแชท" action={<Link to="/dorm/rooms" className="dm-btn dm-btn-ink">ดูห้องว่าง</Link>}>
        กด “ทักคุยในเว็บ” ที่หน้าห้องหรือการ์ดหาเมท เพื่อเริ่มคุยและตกลงกันในเว็บได้เลย
      </Empty>
    );
  }

  const active = items.find((x) => x.id === activeId) || null;

  return (
    <div className={`dm-inbox ${active ? 'has-open' : ''}`} data-testid="dorm-inbox">
      <ul className="dm-inbox-list" aria-label="รายการแชท">
        {items.map((t) => (
          <li key={t.id}>
            <button type="button" className={`dm-trow ${activeId === t.id ? 'on' : ''} ${t.unread ? 'is-unread' : ''}`} onClick={() => openThread(t.id)}>
              <Avatar name={t.other_name} size={42} />
              <span className="dm-trow-body">
                <span className="dm-trow-top">
                  <b className="dm-trow-name">
                    <span className="dm-ellipsis">{t.other_name}</span>
                    {t.other_verified && <BadgeCheck size={14} className="dm-chat-v" aria-label="ยืนยันนิสิต มศว" />}
                  </b>
                  <span className="dm-tiny dm-muted">{agoTh(t.last_at)}</span>
                </span>
                <span className="dm-trow-ctx dm-ellipsis">{t.context_title}</span>
                <span className="dm-trow-last dm-ellipsis">{t.last_is_mine ? 'คุณ: ' : ''}{t.last_message}</span>
              </span>
              {t.unread && <span className="dm-trow-new">ใหม่</span>}
            </button>
          </li>
        ))}
      </ul>
      <div className="dm-inbox-pane">
        {active ? (
          <ChatThread key={active.id} threadId={active.id} initialThread={active} initialLine={myLine}
                      onBack={desk ? undefined : () => setActiveId('')} onSent={() => load(true)} />
        ) : (
          <div className="dm-inbox-pick">
            <MessageCircle size={28} aria-hidden="true" />
            <p className="dm-small dm-muted">เลือกแชททางซ้ายเพื่อดูข้อความและตอบกลับ</p>
          </div>
        )}
      </div>
    </div>
  );
}
