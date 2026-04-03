import { useState, useEffect, useCallback, useRef } from 'react'
import { selectNextQuestion, calcXP, getLevelProgress } from '../lib/engine'
import { recordAnswer, addXP, createSession, updateSession } from '../lib/db'

export default function QuizScreen({ profile, setProfile, questions, struggleMap, setStruggleMap, onHome }) {
  const [sessionAnswered, setSessionAnswered]   = useState([])
  const [sessionResults, setSessionResults]     = useState([])
  const [currentQ, setCurrentQ]                 = useState(null)
  const [selected, setSelected]                 = useState(null)
  const [showAns, setShowAns]                   = useState(false)
  const [streak, setStreak]                     = useState(profile.streak || 0)
  const [sessionXP, setSessionXP]               = useState(0)
  const [floatXP, setFloatXP]                   = useState(null)
  const [sessionId, setSessionId]               = useState(null)
  const [aiTip, setAiTip]                       = useState('')
  const [loadingTip, setLoadingTip]             = useState(false)
  const [correct, setCorrect]                   = useState(null)
  const [earnedXP, setEarnedXP]                 = useState(0)
  const [showExit, setShowExit]                 = useState(false)
  const [qNumber, setQNumber]                   = useState(1)
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

    setSelected(idx)
    setShowAns(true)
    setCorrect(isCorrect)
    setEarnedXP(xpEarned)
    setStreak(newStreak)
    setSessionXP(s => s + xpEarned)
    setSessionResults(r => [...r, { id: currentQ.id, correct: isCorrect, topic: currentQ.topic }])

    if (isCorrect) {
      setFloatXP(xpEarned)
      setTimeout(() => setFloatXP(null), 1400)
    }

    setStruggleMap(prev => {
      const old = prev[currentQ.id] ?? { attempts: 0, wrong: 0 }
      return { ...prev, [currentQ.id]: { ...old, attempts: old.attempts + 1, wrong: old.wrong + (isCorrect ? 0 : 1), last_seen: new Date().toISOString() } }
    })

    await recordAnswer(profile.id, currentQ.id, isCorrect)
    const newXP = await addXP(profile.id, xpEarned, newStreak, profile)
    setProfile(p => ({ ...p, xp: newXP, streak: newStreak, best_streak: Math.max(p.best_streak || 0, newStreak) }))

    if (!isCorrect) {
      setLoadingTip(true)
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1000,
            system: 'You are a SACE Chemistry tutor. Write exactly 2 sentences: one explaining the conceptual mistake, one giving a memory trick. No markdown. No preamble.',
            messages: [{ role: 'user', content: `Topic: ${currentQ.topic} — ${currentQ.subtopic}\nQ: ${currentQ.question}\nCorrect: ${currentQ.options[currentQ.answer_index]}\nStudent chose: ${currentQ.options[idx]}\nSolution: ${currentQ.solution}` }]
          })
        })
        const d = await res.json()
        setAiTip(d.content?.[0]?.text || '')
      } catch { setAiTip('') }
      setLoadingTip(false)
    }
  }

  const nextQ = () => {
    const newAnswered = [...sessionAnswered, currentQ.id]
    setSessionAnswered(newAnswered)
    setQNumber(n => n + 1)
    setStruggleMap(prev => { loadNext(newAnswered, prev); return prev })
  }

  if (!currentQ) return (
    <div style={{ minHeight: '100vh', background: '#070c16', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      Loading…
    </div>
  )

  const { pct } = getLevelProgress(profile.xp)
  const isStruggle = (struggleMap[currentQ.id]?.wrong ?? 0) >= 2
  const sessionCorrect = sessionResults.filter(r => r.correct).length
  const sessionTotal   = sessionResults.length

  return (
    <div style={{ minHeight: '100vh', background: '#070c16', color: '#e2e8f0', fontFamily: "'Plus Jakarta Sans', sans-serif", display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes fadeUp  { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes floatXP { 0%{opacity:1;transform:translateY(0) scale(1)} 100%{opacity:0;transform:translateY(-80px) scale(1.4)} }
        @keyframes popIn   { 0%{transform:scale(0.94);opacity:0} 100%{transform:scale(1);opacity:1} }
        .opt:hover { border-color: #14b8a6 !important; background: rgba(20,184,166,0.05) !important; }
        .opt { transition: all 0.14s ease !important; cursor: pointer; }
        .exit-btn:hover { border-color: #ef4444 !important; color: #f87171 !important; }
        @media (max-width: 900px) {
          .quiz-layout { grid-template-columns: 1fr !important; }
          .sidebar-left { display: none !important; }
          .sidebar-right { display: none !important; }
        }
      `}</style>

      {floatXP && (
        <div style={{ position: 'fixed', top: '35%', left: '50%', transform: 'translateX(-50%)', fontSize: 32, fontWeight: 800, color: '#14b8a6', animation: 'floatXP 1.4s ease forwards', pointerEvents: 'none', zIndex: 9999, textShadow: '0 0 24px rgba(20,184,166,0.8)' }}>
          +{floatXP} XP
        </div>
      )}

      {showExit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div style={{ background: '#0c1525', border: '1px solid #334155', borderRadius: 16, padding: '32px', maxWidth: 360, width: '90%', textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 14 }}>⚠️</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>End this session?</div>
            <div style={{ fontSize: 14, color: '#64748b', marginBottom: 24, lineHeight: 1.6 }}>
              You've earned <span style={{ color: '#14b8a6', fontWeight: 700 }}>{sessionXP} XP</span> so far. Your progress is saved.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowExit(false)} style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Keep going</button>
              <button onClick={onHome} style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: '#ef4444', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>End session</button>
            </div>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div style={{ background: '#0a1020', borderBottom: '1px solid #1e293b', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <button className="exit-btn" onClick={() => setShowExit(true)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 8, border: '1px solid #334155', background: 'transparent', color: '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'all 0.15s' }}>
          ← End Session
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {streak >= 2 && <span style={{ fontSize: 13, color: '#f59e0b', fontWeight: 700 }}>🔥 {streak} streak</span>}
          <span style={{ fontSize: 13, color: '#14b8a6', fontWeight: 700 }}>+{sessionXP} XP</span>
          <div style={{ width: 100, background: '#1e293b', borderRadius: 4, height: 5, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#14b8a6,#0ea5e9)', transition: 'width 0.8s' }} />
          </div>
        </div>
      </div>

      {/* Three column layout */}
      <div className="quiz-layout" style={{ flex: 1, display: 'grid', gridTemplateColumns: '200px 1fr 260px', maxWidth: 1200, margin: '0 auto', width: '100%', alignItems: 'start' }}>

        {/* LEFT sidebar */}
        <div className="sidebar-left" style={{ padding: '28px 16px', borderRight: '1px solid #1e293b', minHeight: 'calc(100vh - 57px)', position: 'sticky', top: 57 }}>
          <div style={{ fontSize: 11, color: '#475569', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16 }}>Session</div>

          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ width: 68, height: 68, borderRadius: '50%', margin: '0 auto 8px', border: `4px solid ${sessionTotal === 0 ? '#1e293b' : sessionCorrect / sessionTotal >= 0.6 ? '#10b981' : '#ef4444'}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 17, fontWeight: 800 }}>{sessionTotal === 0 ? '—' : `${Math.round(sessionCorrect / sessionTotal * 100)}%`}</div>
            </div>
            <div style={{ fontSize: 11, color: '#475569' }}>{sessionTotal} answered</div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 20 }}>
            {sessionResults.map((r, i) => (
              <div key={i} style={{ width: 26, height: 26, borderRadius: '50%', background: r.correct ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', border: `2px solid ${r.correct ? '#10b981' : '#ef4444'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: r.correct ? '#4ade80' : '#f87171' }}>
                {i + 1}
              </div>
            ))}
            <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(20,184,166,0.15)', border: '2px solid #14b8a6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#14b8a6' }}>
              {qNumber}
            </div>
          </div>

          {[{ label: 'Correct', val: sessionCorrect, color: '#10b981' }, { label: 'Incorrect', val: sessionTotal - sessionCorrect, color: '#ef4444' }, { label: 'XP', val: sessionXP, color: '#14b8a6' }].map(s => (
            <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#0c1525', borderRadius: 8, border: '1px solid #1e293b', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: '#475569' }}>{s.label}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: s.color }}>{s.val}</span>
            </div>
          ))}
        </div>

        {/* CENTRE — Question */}
        <div style={{ padding: '36px 40px', animation: 'fadeUp 0.3s ease' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>Question {qNumber}</span>
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#334155', display: 'inline-block' }} />
            <span style={{ fontSize: 12, background: 'rgba(20,184,166,0.1)', padding: '3px 10px', borderRadius: 20, color: '#14b8a6', fontWeight: 700, border: '1px solid rgba(20,184,166,0.2)' }}>{currentQ.subtopic}</span>
            <span style={{ fontSize: 12, color: '#475569' }}>{'★'.repeat(currentQ.difficulty)}{'☆'.repeat(5 - currentQ.difficulty)}</span>
            {isStruggle && <span style={{ fontSize: 11, background: 'rgba(239,68,68,0.1)', padding: '3px 9px', borderRadius: 20, color: '#f87171', fontWeight: 700, border: '1px solid rgba(239,68,68,0.2)' }}>⚡ Priority</span>}
          </div>

          <div style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.8, color: '#f1f5f9', marginBottom: 30 }}>
            {currentQ.question}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
            {currentQ.options.map((opt, i) => {
              let bg = 'transparent', border = '1px solid #334155', color = '#cbd5e1'
              if (showAns) {
                if (i === currentQ.answer_index)     { bg = 'rgba(16,185,129,0.08)'; border = '1px solid #10b981'; color = '#4ade80' }
                else if (i === selected && !correct) { bg = 'rgba(239,68,68,0.08)'; border = '1px solid #ef4444'; color = '#f87171' }
                else                                 { color = '#334155' }
              }
              return (
                <button key={i} className={showAns ? '' : 'opt'} onClick={() => handleAnswer(i)} style={{ background: bg, border, color, padding: '14px 18px', borderRadius: 10, fontSize: 15, fontWeight: 500, textAlign: 'left', cursor: showAns ? 'default' : 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif", display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: showAns ? (i === currentQ.answer_index ? 'rgba(16,185,129,0.2)' : i === selected ? 'rgba(239,68,68,0.2)' : '#1e293b') : '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#64748b' }}>
                    {showAns && i === currentQ.answer_index ? '✓' : showAns && i === selected ? '✗' : String.fromCharCode(65 + i)}
                  </span>
                  {opt}
                </button>
              )
            })}
          </div>

          {showAns && (
            <button onClick={nextQ} style={{ padding: '14px 32px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #14b8a6, #0ea5e9)', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif", boxShadow: '0 8px 24px rgba(20,184,166,0.25)' }}>
              Next Question →
            </button>
          )}
        </div>

        {/* RIGHT sidebar */}
        <div className="sidebar-right" style={{ padding: '28px 16px', borderLeft: '1px solid #1e293b', minHeight: 'calc(100vh - 57px)', position: 'sticky', top: 57 }}>
          {!showAns ? (
            <div style={{ color: '#334155', fontSize: 13, textAlign: 'center', marginTop: 60, lineHeight: 1.7 }}>
              Select an answer to see the explanation and tips
            </div>
          ) : (
            <div style={{ animation: 'popIn 0.25s ease' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 20, marginBottom: 18, background: correct ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', border: `1px solid ${correct ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`, fontSize: 13, fontWeight: 700, color: correct ? '#4ade80' : '#f87171' }}>
                {correct ? `✓ Correct · +${earnedXP} XP` : `✗ Incorrect · +${earnedXP} XP`}
              </div>

              <div style={{ fontSize: 11, color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Explanation</div>
              <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.75, marginBottom: 14 }}>{currentQ.solution}</div>

              {currentQ.tip && (
                <div style={{ padding: '10px 12px', background: 'rgba(20,184,166,0.06)', borderRadius: 8, borderLeft: '3px solid #14b8a6', fontSize: 12, color: '#5eead4', lineHeight: 1.65, marginBottom: 14 }}>
                  💡 {currentQ.tip}
                </div>
              )}

              {loadingTip && <div style={{ fontSize: 12, color: '#334155', fontStyle: 'italic', marginBottom: 10 }}>Getting AI tip…</div>}
              {aiTip && (
                <div style={{ padding: '10px 12px', background: 'rgba(99,102,241,0.08)', borderRadius: 8, borderLeft: '3px solid #6366f1', fontSize: 12, color: '#a5b4fc', lineHeight: 1.65, marginBottom: 18 }}>
                  🤖 {aiTip}
                </div>
              )}

              <div style={{ fontSize: 11, color: '#334155', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Flag this question</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {['Too easy', 'Too hard', 'Confusing', 'Typo'].map(tag => (
                  <button key={tag} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #1e293b', background: 'transparent', color: '#475569', fontSize: 11, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{tag}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}