import { useState, useEffect, useCallback, useRef } from 'react'
import { selectNextQuestion, calcXP, getLevelProgress } from '../lib/engine'
import { recordAnswer, addXP, createSession, updateSession } from '../lib/db'

export default function QuizScreen({ profile, setProfile, questions, struggleMap, setStruggleMap, onHome }) {
  const [sessionAnswered, setSessionAnswered] = useState([])
  const [currentQ, setCurrentQ]               = useState(null)
  const [selected, setSelected]               = useState(null)
  const [showAns, setShowAns]                 = useState(false)
  const [streak, setStreak]                   = useState(profile.streak || 0)
  const [sessionXP, setSessionXP]             = useState(0)
  const [floatXP, setFloatXP]                 = useState(null)
  const [shake, setShake]                     = useState(false)
  const [sessionId, setSessionId]             = useState(null)
  const [aiTip, setAiTip]                     = useState('')
  const [loadingTip, setLoadingTip]           = useState(false)
  const [correct, setCorrect]                 = useState(null)
  const [earnedXP, setEarnedXP]               = useState(0)
  const startTime = useRef(null)

  const loadNext = useCallback((answered, map) => {
    const q = selectNextQuestion(questions, map, answered)
    setCurrentQ(q)
    setSelected(null)
    setShowAns(false)
    setCorrect(null)
    setEarnedXP(0)
    setAiTip('')
    startTime.current = Date.now()
  }, [questions])

  useEffect(() => {
    async function init() {
      const s = await createSession(profile.id, 'Chemistry')
      setSessionId(s.id)
    }
    init()
    loadNext([], struggleMap)
  }, [])

  const handleAnswer = async (idx) => {
    if (showAns || !currentQ) return
    const isCorrect = idx === currentQ.answer_index
    const xpEarned  = calcXP(isCorrect, currentQ.difficulty, streak)
    const newStreak = isCorrect ? streak + 1 : 0
    const timeTaken = Date.now() - (startTime.current || Date.now())

    setSelected(idx)
    setShowAns(true)
    setCorrect(isCorrect)
    setEarnedXP(xpEarned)

    if (!isCorrect) setShake(true), setTimeout(() => setShake(false), 500)

    if (isCorrect) {
      setFloatXP(xpEarned)
      setTimeout(() => setFloatXP(null), 1400)
    }

    setStreak(newStreak)
    setSessionXP(s => s + xpEarned)

    // Update struggle map locally (optimistic)
    setStruggleMap(prev => {
      const old = prev[currentQ.id] ?? { attempts: 0, wrong: 0 }
      return {
        ...prev,
        [currentQ.id]: {
          ...old,
          attempts: old.attempts + 1,
          wrong: old.wrong + (isCorrect ? 0 : 1),
          last_seen: new Date().toISOString(),
        }
      }
    })

    // Persist to Supabase
    await recordAnswer(profile.id, currentQ.id, isCorrect)
    const newXP = await addXP(profile.id, xpEarned, newStreak, profile)
    setProfile(p => ({ ...p, xp: newXP, streak: newStreak, best_streak: Math.max(p.best_streak || 0, newStreak) }))

    // AI tip on wrong answer
    if (!isCorrect) {
      setLoadingTip(true)
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1000,
            system: 'You are a SACE Chemistry tutor. Write exactly 2 sentences: one that explains the conceptual mistake, one that gives a memory trick. No markdown. No preamble.',
            messages: [{
              role: 'user',
              content: `Topic: ${currentQ.topic} — ${currentQ.subtopic}\nQuestion: ${currentQ.question}\nCorrect answer: ${currentQ.options[currentQ.answer_index]}\nStudent chose: ${currentQ.options[idx]}\nSolution: ${currentQ.solution}\nGive your 2-sentence response now.`
            }]
          })
        })
        const d = await res.json()
        setAiTip(d.content?.[0]?.text || '')
      } catch { setAiTip('') }
      setLoadingTip(false)
    }

    // Update session
    if (sessionId) {
      await updateSession(sessionId, {
        questions_attempted: sessionAnswered.length + 1,
        questions_correct: (sessionAnswered.filter(id => {
          const s = struggleMap[id]; return s && s.attempts > s.wrong
        }).length) + (isCorrect ? 1 : 0),
        xp_earned: sessionXP + xpEarned,
      })
    }
  }

  const nextQ = () => {
    const newAnswered = [...sessionAnswered, currentQ.id]
    setSessionAnswered(newAnswered)
    // Pass updated struggle map so next question selection is fresh
    setStruggleMap(prev => {
      loadNext(newAnswered, prev)
      return prev
    })
  }

  if (!currentQ) return (
    <div style={{ minHeight: '100vh', background: '#070c16', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontFamily: "'Syne', sans-serif" }}>
      Loading questions…
    </div>
  )

  const { level, pct } = getLevelProgress(profile.xp)
  const isStruggle = (struggleMap[currentQ.id]?.wrong ?? 0) >= 2
  const diffStars  = '★'.repeat(currentQ.difficulty) + '☆'.repeat(5 - currentQ.difficulty)

  return (
    <div style={{
      minHeight: '100vh', background: '#070c16', color: '#e2e8f0',
      fontFamily: "'Syne', sans-serif", padding: '20px 16px 40px',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      backgroundImage: 'radial-gradient(ellipse at 15% 0%, rgba(20,184,166,0.05) 0%, transparent 50%)',
    }}>
      <style>{`
        @keyframes fadeUp  { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes floatXP { 0%{opacity:1;transform:translateY(0) scale(1)} 100%{opacity:0;transform:translateY(-80px) scale(1.4)} }
        @keyframes shake   { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-7px)} 40%,80%{transform:translateX(7px)} }
        @keyframes popIn   { 0%{transform:scale(0.92);opacity:0} 100%{transform:scale(1);opacity:1} }
        .opt:hover { border-color: #14b8a6 !important; background: #0c2030 !important; transform: translateX(4px); }
        .opt { transition: all 0.14s ease !important; }
        .nxt:hover { opacity: 0.88 !important; }
      `}</style>

      {/* Floating XP */}
      {floatXP && (
        <div style={{
          position: 'fixed', top: '38%', left: '50%', transform: 'translateX(-50%)',
          fontSize: 32, fontWeight: 800, color: '#14b8a6',
          fontFamily: "'JetBrains Mono', monospace",
          animation: 'floatXP 1.4s ease forwards',
          pointerEvents: 'none', zIndex: 9999,
          textShadow: '0 0 24px rgba(20,184,166,0.8)',
        }}>+{floatXP} XP</div>
      )}

      <div style={{
        width: '100%', maxWidth: 620,
        background: 'rgba(12,21,37,0.97)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 18, padding: '22px 22px',
        boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
        animation: 'fadeUp 0.3s ease',
      }}>

        {/* Top bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 11, background: 'rgba(20,184,166,0.12)', padding: '4px 10px',
              borderRadius: 20, color: '#14b8a6', fontWeight: 700, border: '1px solid rgba(20,184,166,0.2)',
            }}>{currentQ.subtopic}</span>
            <span style={{ fontSize: 11, background: '#0c1525', padding: '4px 10px', borderRadius: 20, color: '#475569' }}>
              {diffStars}
            </span>
            {isStruggle && (
              <span style={{
                fontSize: 10, background: 'rgba(239,68,68,0.1)', padding: '3px 9px',
                borderRadius: 20, color: '#f87171', fontWeight: 700, border: '1px solid rgba(239,68,68,0.2)',
              }}>⚡ Priority</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {streak >= 2 && (
              <span style={{ fontSize: 13, color: '#f59e0b', fontWeight: 700 }}>🔥 {streak}</span>
            )}
            <span style={{ fontSize: 12, color: '#334155', fontFamily: "'JetBrains Mono', monospace" }}>
              +{sessionXP} XP
            </span>
          </div>
        </div>

        {/* XP bar */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ background: '#0c1525', borderRadius: 4, height: 4, overflow: 'hidden' }}>
            <div style={{
              width: `${pct}%`, height: '100%',
              background: 'linear-gradient(90deg, #14b8a6, #0ea5e9)',
              transition: 'width 0.8s cubic-bezier(.4,0,.2,1)',
            }} />
          </div>
        </div>

        {/* Question */}
        <div style={{
          fontSize: 17, fontWeight: 600, lineHeight: 1.75,
          color: '#f1f5f9', marginBottom: 22,
          animation: 'popIn 0.3s ease',
        }}>
          {currentQ.question}
        </div>

        {/* Options */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 18,
          animation: shake ? 'shake 0.4s ease' : 'none',
        }}>
          {currentQ.options.map((opt, i) => {
            let bg = '#0c1525', border = '1px solid #1e293b', color = '#94a3b8'
            if (showAns) {
              if (i === currentQ.answer_index)          { bg = '#041f14'; border = '1px solid #10b981'; color = '#4ade80' }
              else if (i === selected && !correct)      { bg = '#1a0808'; border = '1px solid #ef4444'; color = '#f87171' }
            }
            return (
              <button key={i} className={showAns ? '' : 'opt'} onClick={() => handleAnswer(i)} style={{
                background: bg, border, color,
                padding: '13px 16px', borderRadius: 11,
                fontSize: 14, fontWeight: 500, textAlign: 'left',
                cursor: showAns ? 'default' : 'pointer',
                fontFamily: "'Syne', sans-serif",
              }}>
                <span style={{ marginRight: 10, color: '#334155', fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
                  {String.fromCharCode(65 + i)}.
                </span>
                {opt}
              </button>
            )
          })}
        </div>

        {/* Answer feedback */}
        {showAns && (
          <div style={{
            background: correct ? 'rgba(16,185,129,0.05)' : 'rgba(239,68,68,0.05)',
            border: `1px solid ${correct ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
            borderRadius: 12, padding: '14px 16px', marginBottom: 14,
            animation: 'popIn 0.25s ease',
          }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: correct ? '#4ade80' : '#f87171', marginBottom: 8 }}>
              {correct
                ? `✓ Correct${streak >= 2 ? ` · 🔥 ${streak} streak` : ''} · +${earnedXP} XP`
                : `✗ Not quite · +${earnedXP} XP`}
            </div>
            <div style={{ fontSize: 13, color: '#7dd3fc', lineHeight: 1.7 }}>
              {currentQ.solution}
            </div>
            {currentQ.tip && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #1e293b', fontSize: 12, color: '#475569' }}>
                💡 {currentQ.tip}
              </div>
            )}
            {loadingTip && (
              <div style={{ marginTop: 10, fontSize: 12, color: '#334155', fontStyle: 'italic' }}>
                Getting a personalised tip…
              </div>
            )}
            {aiTip && (
              <div style={{
                marginTop: 10, padding: '10px 12px',
                background: 'rgba(99,102,241,0.08)', borderRadius: 8,
                borderLeft: '3px solid #6366f1',
                fontSize: 13, color: '#a5b4fc', lineHeight: 1.65,
              }}>
                🤖 {aiTip}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          {showAns && (
            <button className="nxt" onClick={nextQ} style={{
              flex: 1, padding: '14px', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg, #14b8a6, #0ea5e9)',
              color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer',
              fontFamily: "'Syne', sans-serif",
              boxShadow: '0 8px 24px rgba(20,184,166,0.25)',
            }}>
              Next Question →
            </button>
          )}
          <button onClick={onHome} style={{
            padding: '14px 16px', borderRadius: 12, border: '1px solid #1e293b',
            background: 'transparent', color: '#334155', fontSize: 14,
            cursor: 'pointer', fontFamily: "'Syne', sans-serif",
          }}>⌂</button>
        </div>
      </div>
    </div>
  )
}
