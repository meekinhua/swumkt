import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '@/context/AuthContext';
import AlumniLayout from './AlumniLayout';
import { Avatar, Chip, Icon, useToast } from './AlumniUI';
import './alumni-styles.css';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const AlumniTriviaPage = () => {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pickedIdx, setPickedIdx] = useState(null);
  const [result, setResult] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);

  const authH = { headers: { Authorization: `Bearer ${token}` } };

  useEffect(() => {
    if (!user) {
      navigate('/login?redirect=/alumni/trivia');
      return;
    }
    loadQuestion();
    loadLeaderboard();
    // eslint-disable-next-line
  }, [user]);

  const loadQuestion = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/alumni/trivia/daily`, authH);
      setQ(r.data);
      if (r.data.answered) {
        setResult({
          is_correct: r.data.is_correct,
          correct_index: r.data.correct_index,
          xp_earned: r.data.is_correct ? 10 : 0,
        });
        setPickedIdx(r.data.answer_index);
      }
    } catch {}
    finally { setLoading(false); }
  };

  const loadLeaderboard = async () => {
    try {
      const r = await axios.get(`${API}/alumni/leaderboard/iq`, authH);
      setLeaderboard(r.data.leaderboard || []);
    } catch {}
  };

  const handleAnswer = async (idx) => {
    if (pickedIdx !== null) return;
    setPickedIdx(idx);
    try {
      const r = await axios.post(`${API}/alumni/trivia/answer`, {
        question_id: q.id, answer_index: idx,
      }, authH);
      setResult(r.data);
      if (r.data.is_correct) {
        toast.show(`🎉 ถูกต้อง! +${r.data.xp_earned} XP · IQ streak ${r.data.trivia_streak}`);
      } else {
        toast.show('ยังไม่ถูก ลองใหม่พรุ่งนี้');
      }
      loadLeaderboard();
    } catch (e) {
      toast.show(e.response?.data?.detail || 'ส่งคำตอบไม่สำเร็จ');
    }
  };

  if (!user) return null;

  return (
    <AlumniLayout>
      <div className="al-page al-fade-in" style={{ maxWidth: 840 }} data-testid="alumni-trivia-page">
        <div style={{ marginBottom: 24 }}>
          <div className="al-eyebrow" style={{ marginBottom: 6 }}>· รู้จักสายของคุณไหม? ·</div>
          <h1 className="al-h-section" style={{ fontSize: 34 }}>Trivia ประจำวัน 🧠</h1>
          <p className="al-muted" style={{ marginTop: 4 }}>ตอบถูก = +10 XP · ตอบถูกติดกัน 7 วัน = Badge 🧠 IQ Master</p>
        </div>

        {loading && <div className="al-muted" style={{ textAlign: 'center', padding: 60 }}>กำลังโหลด...</div>}

        {!loading && !q?.question && (
          <div className="al-card al-card-pad" style={{ textAlign: 'center', padding: 60 }} data-testid="trivia-empty">
            <div style={{ fontSize: 48, marginBottom: 16 }}>🌱</div>
            <h2 className="al-h-card" style={{ marginBottom: 8 }}>ยังไม่มีคนในสายของคุณมากพอ</h2>
            <p className="al-muted" style={{ marginBottom: 20 }}>เริ่มต้นด้วยการ Mark พี่ take ของคุณก่อน</p>
            <button className="al-btn al-btn-red" onClick={() => navigate('/alumni/tree')} data-testid="trivia-goto-tree-btn">
              ไปที่สายตระกูล <Icon name="arrow-right" size={14} />
            </button>
          </div>
        )}

        {!loading && q?.question && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 20 }} className="al-tree-layout">
            {/* Question card */}
            <div className="al-card al-card-pad" style={{ padding: 32 }} data-testid="trivia-question-card">
              <div className="al-eyebrow" style={{ marginBottom: 10 }}>คำถามของวันนี้ · {q.date}</div>
              <h2 style={{ fontSize: 24, lineHeight: 1.3, marginBottom: 24, marginTop: 4 }} data-testid="trivia-question-text">
                {q.question}
              </h2>
              <div style={{ display: 'grid', gap: 10 }}>
                {(q.options || []).map((opt, i) => {
                  const isPicked = pickedIdx === i;
                  const isCorrect = result && result.correct_index === i;
                  const isWrongPick = result && isPicked && !result.is_correct;
                  let bg = 'white', border = 'var(--al-line)', color = 'var(--al-ink)';
                  if (result) {
                    if (isCorrect) { bg = '#D1FAE5'; border = '#10B981'; }
                    else if (isWrongPick) { bg = 'var(--al-red-soft)'; border = 'var(--al-red)'; }
                  } else if (isPicked) { bg = 'var(--al-paper-2)'; border = 'var(--al-ink)'; }

                  return (
                    <button key={i} onClick={() => handleAnswer(i)}
                      disabled={pickedIdx !== null}
                      data-testid={`trivia-option-${i}`}
                      style={{
                        padding: '16px 20px', borderRadius: 12, border: `2px solid ${border}`,
                        background: bg, color,
                        display: 'flex', alignItems: 'center', gap: 14,
                        cursor: pickedIdx !== null ? 'default' : 'pointer',
                        textAlign: 'left', fontSize: 15, fontWeight: 500,
                        transition: 'all .15s',
                      }}>
                      <div className="al-mono" style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: isCorrect ? '#10B981' : (isWrongPick ? 'var(--al-red)' : 'var(--al-paper-2)'),
                        color: (isCorrect || isWrongPick) ? 'white' : 'var(--al-ink)',
                        display: 'grid', placeItems: 'center', fontWeight: 700, flexShrink: 0,
                      }}>
                        {isCorrect ? <Icon name="check" size={16} stroke={3} /> : (isWrongPick ? <Icon name="x" size={16} stroke={3} /> : String.fromCharCode(65 + i))}
                      </div>
                      <span style={{ flex: 1 }}>{opt}</span>
                    </button>
                  );
                })}
              </div>

              {result && (
                <div style={{
                  marginTop: 24, padding: 16, borderRadius: 12,
                  background: result.is_correct ? '#D1FAE5' : 'var(--al-red-soft)',
                  border: `1px solid ${result.is_correct ? '#10B981' : 'var(--al-red)'}`,
                }} data-testid="trivia-result">
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
                    {result.is_correct ? '🎉 ถูกต้อง!' : '❌ ยังไม่ถูก'}
                  </div>
                  <div className="al-small al-muted">
                    {result.is_correct
                      ? `+${result.xp_earned} XP · IQ streak ${result.trivia_streak} วัน · กลับมาเล่นพรุ่งนี้ต่อ`
                      : 'กลับมาลองใหม่พรุ่งนี้'}
                  </div>
                </div>
              )}
            </div>

            {/* Leaderboard */}
            <div className="al-card al-card-pad" data-testid="iq-leaderboard">
              <div className="al-eyebrow" style={{ marginBottom: 12 }}>IQ Leaderboard 🧠</div>
              {leaderboard.length === 0 ? (
                <div className="al-muted al-small">ยังไม่มีผู้ตอบถูกติดกัน</div>
              ) : (
                leaderboard.map((p, i) => (
                  <div key={p.user_id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 0', borderBottom: i < leaderboard.length - 1 ? '1px solid var(--al-line)' : 'none',
                  }}>
                    <div className="al-mono" style={{
                      width: 24, height: 24, borderRadius: 6,
                      background: i === 0 ? 'var(--al-yellow)' : 'var(--al-paper-2)',
                      display: 'grid', placeItems: 'center',
                      fontSize: 11, fontWeight: 700,
                    }}>{i + 1}</div>
                    <Avatar name={p.name} hue={p.avatar_hue || 210} size="sm" src={p.avatar_url} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.nickname || p.name}
                      </div>
                      <div className="al-tiny al-muted">รุ่น {p.gen}</div>
                    </div>
                    <Chip tone="red" icon="flame">{p.trivia_streak}</Chip>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {toast.node}
      </div>
    </AlumniLayout>
  );
};

export default AlumniTriviaPage;
