import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { selectNextQuestion, calcXP, getLevelProgress, getQuestionCounts, RANKS, RANK_ICONS } from '../lib/engine'
import { recordAnswer, addXP, createSession } from '../lib/db'
import { THEMES } from '../lib/theme'

const GOLD   = '#f1be43'
const GOLDL  = '#f9d87a'
const NAVY   = '#0c1037'
const NAVYD  = '#080d28'
const FONT_B = "'Plus Jakarta Sans', sans-serif"
const FONT_D = "'Sifonn Pro', sans-serif"

const NAV_ITEMS = [
  { icon: '⚡', label: 'Question Bank', path: '/question-bank' },
  { icon: '🎓', label: 'Learn',         path: '/learn'         },
  { icon: '📊', label: 'My Progress',   path: '/my-progress'   },
  { icon: '🏆', label: 'Leaderboard',   path: '/leaderboard'   },
  { icon: '📚', label: 'Study Plan',    path: '/study-plan'    },
  { icon: '🕐', label: 'History',       path: '/history'       },
]

export default function QuizScreen({
  profile, setProfile, questions, struggleMap, setStruggleMap, onHome, theme = 'dark',
  // Lifted state from App — persists across tab switches
  currentQ:        _currentQ,        setCurrentQ,
  selected:        _selected,        setSelected,
  showAns:         _showAns,         setShowAns,
  correct:         _correct,         setCorrect,
  earnedXP:        _earnedXP,        setEarnedXP,
  streak:          _streak,          setStreak,
  sessionXP:       _sessionXP,       setSessionXP,
  sessionResults:  _sessionResults,  setSessionResults,
  sessionAnswered: _sessionAnswered, setSessionAnswered,
  qNumber:         _qNumber,         setQNumber,
  aiTip:           _aiTip,           setAiTip,
  loadingTip:      _loadingTip,      setLoadingTip,
  quizMode:        _quizMode,        setQuizMode,
  quizSubtopics:   _quizSubtopics,
}) {
  const t = THEMES[theme]

  // Local transient state — fine to reset
  const [floatXP,   setFloatXP]   = useState(null)
  const [showExit,  setShowExit]  = useState(false)
  const [menuOpen,  setMenuOpen]  = useState(false)
  const [isMobile,  setIsMobile]  = useState(window.innerWidth < 860)
  const [finished,  setFinished]  = useState(false)
  const startTime = useRef(null)



  useEffect(() => {
    const h = () => { setIsMobile(window.innerWidth < 860); if (window.innerWidth >= 860) setMenuOpen(false) }
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  // Resolve safe defaults
  const currentQ        = _currentQ        ?? null
  const selected        = _selected        ?? null
  const showAns         = _showAns         ?? false
  const correct         = _correct         ?? null
  const earnedXP        = _earnedXP        ?? 0
  const streak          = _streak          ?? (profile.streak || 0)
  const sessionXP       = _sessionXP       ?? 0
  const sessionResults  = _sessionResults  ?? []
  const sessionAnswered = _sessionAnswered ?? []
  const qNumber         = _qNumber         ?? 1
  const aiTip           = _aiTip           ?? ''
  const loadingTip      = _loadingTip      ?? false
  const quizMode        = _quizMode        ?? 'new'
  const quizSubtopics   = _quizSubtopics   ?? []

  const navigate    = useNavigate()
  const location    = useLocation()

  const loadNext = useCallback((answered, map, mode = 'new', subtopics = []) => {
    const q = selectNextQuestion(questions, map, answered, mode, subtopics)
    if (!q) {
      setFinished(true)
      return
    }
    setFinished(false)
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
      await createSession(profile.id, 'Chemistry')
    }
    // Only load first question if no session in progress
    if (!_currentQ) {
      init()
      loadNext([], struggleMap, 'new', quizSubtopics)
    }
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
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            max_tokens: 200,
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
    setStruggleMap(prev => { loadNext(newAnswered, prev, quizMode, quizSubtopics); return prev })
  }

  const counts = getQuestionCounts(questions, struggleMap)

  // Finished screen — no more questions in current mode
  if (finished || (!currentQ && sessionResults.length > 0)) {
    const startMode = (mode) => {
      setQuizMode(mode)
      setSessionAnswered([])
      setSessionResults([])
      setQNumber(1)
      setSessionXP(0)
      setFinished(false)
      loadNext([], struggleMap, mode, quizSubtopics)
    }
    return (
      <div style={{ minHeight: '100vh', background: NAVY, fontFamily: FONT_B, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
          <div style={{ fontFamily: FONT_D, fontSize: 28, color: '#fff', letterSpacing: 1, marginBottom: 8 }}>
            {quizMode === 'new' ? "ALL CAUGHT UP!" : quizMode === 'wrong' ? "WRONGS REVIEWED!" : "SESSION COMPLETE!"}
          </div>
          <div style={{ fontSize: 15, color: '#64748b', lineHeight: 1.7, marginBottom: 8 }}>
            {quizMode === 'new'
              ? "You've attempted every question on gradefarm. right now — more are being added soon."
              : "Great work reviewing those questions."}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 32 }}>
            <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 8, padding: '8px 14px', fontSize: 13, color: '#4ade80' }}>
              +{sessionXP} XP this session
            </div>
            <div style={{ background: 'rgba(241,190,67,0.1)', border: '1px solid rgba(241,190,67,0.25)', borderRadius: 8, padding: '8px 14px', fontSize: 13, color: GOLD }}>
              {sessionResults.filter(r => r.correct).length}/{sessionResults.length} correct
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            {counts.wrong > 0 && (
              <button onClick={() => startMode('wrong')} style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#ef4444,#f87171)', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B }}>
                Re-attempt {counts.wrong} wrong answer{counts.wrong !== 1 ? 's' : ''} →
              </button>
            )}
            <button onClick={() => startMode('all')} style={{ width: '100%', padding: '14px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#e2e8f0', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>
              Repeat all questions
            </button>
            <button onClick={onHome} style={{ width: '100%', padding: '14px', borderRadius: 12, border: `1px solid rgba(241,190,67,0.3)`, background: 'transparent', color: GOLD, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>
              ← Back to Question Bank
            </button>
          </div>
        </div>
      </div>
    )
  }

  // First load
  if (!currentQ && sessionResults.length === 0) return (
    <div style={{ minHeight: '100vh', background: NAVYD, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontFamily: FONT_B }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg,${GOLD},${GOLDL})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>⚡</div>
        <div style={{ fontSize: 13 }}>Loading questions…</div>
      </div>
    </div>
  )

  const { pct, level } = getLevelProgress(profile.xp)
  const rank           = RANKS[Math.min(level, RANKS.length - 1)]
  const isStruggle     = (struggleMap[currentQ.id]?.wrong ?? 0) >= 2
  const sessionCorrect = sessionResults.filter(r => r.correct).length
  const sessionTotal   = sessionResults.length
  const accuracy       = sessionTotal > 0 ? Math.round((sessionCorrect / sessionTotal) * 100) : null

  // ── Sidebar content (shared between desktop + mobile drawer) ─────────────
  const SidebarContent = ({ onClose }) => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: NAVYD, fontFamily: FONT_B }}>
      <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ fontFamily: FONT_D, fontSize: 17, letterSpacing: 1, cursor: 'pointer' }} onClick={() => { onHome(); onClose?.() }}>
          <span style={{ color: '#fff' }}>grade</span><span style={{ color: GOLD }}>farm.</span>
        </span>
      </div>

      {/* User + XP */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: NAVYD, flexShrink: 0 }}>
            {profile.display_name[0].toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.display_name}</div>
            <div style={{ fontSize: 10, color: GOLD, fontWeight: 600 }}>{RANK_ICONS[Math.min(level, RANK_ICONS.length-1)]} {rank}</div>
          </div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 4, height: 4, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg,${GOLD},${GOLDL})`, transition: 'width 0.8s' }} />
        </div>
      </div>

      {/* Nav */}
      <nav style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV_ITEMS.map(item => {
          const active = location.pathname === item.path || (item.path === '/question-bank' && location.pathname === '/quiz')
          return (
            <button key={item.path} onClick={() => { navigate(item.path); onClose?.() }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, border: 'none', background: active ? 'rgba(241,190,67,0.12)' : 'transparent', borderLeft: `2px solid ${active ? GOLD : 'transparent'}`, color: active ? GOLD : 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: active ? 700 : 500, cursor: 'pointer', fontFamily: FONT_B, textAlign: 'left', width: '100%', transition: 'all 0.15s' }}>
              <span style={{ fontSize: 15 }}>{item.icon}</span>
              {item.label}
            </button>
          )
        })}
      </nav>

      {/* Session stats — directly under nav */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.07)', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
        <div style={{ fontSize: 10, color: GOLD, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>This session</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 8 }}>
          {[
            { label: 'Correct', val: sessionCorrect,                    color: '#10b981' },
            { label: 'Wrong',   val: sessionTotal - sessionCorrect,     color: '#ef4444' },
            { label: 'XP',      val: `+${sessionXP}`,                   color: GOLD      },
            { label: 'Streak',  val: streak > 0 ? `🔥 ${streak}` : '—', color: '#f59e0b' },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '6px 8px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: s.color }}>{s.val}</div>
              <div style={{ fontSize: 9, color: '#475569', marginTop: 1 }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {sessionResults.map((r, i) => (
            <div key={i} style={{ width: 20, height: 20, borderRadius: '50%', background: r.correct ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', border: `1.5px solid ${r.correct ? '#10b981' : '#ef4444'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: r.correct ? '#4ade80' : '#f87171' }}>
              {i + 1}
            </div>
          ))}
          <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(241,190,67,0.2)', border: `1.5px solid ${GOLD}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: GOLD }}>
            {qNumber}
          </div>
        </div>
      </div>

      {/* Spacer + End Session */}
      <div style={{ flex: 1 }} />
      <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
        <button onClick={() => { setShowExit(true); onClose?.() }} style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.25)', background: 'transparent', color: '#f87171', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_B }}>
          ✕ End Session
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: NAVY, fontFamily: FONT_B, display: 'flex' }}>
      <style>{`
        @font-face{font-family:'Sifonn Pro';src:url('/SIFONN_PRO.otf') format('opentype');font-display:swap;}
        @keyframes fadeUp  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes floatXP { 0%{opacity:1;transform:translateY(0) scale(1)} 100%{opacity:0;transform:translateY(-70px) scale(1.5)} }
        @keyframes popIn   { 0%{transform:scale(0.95);opacity:0} 100%{transform:scale(1);opacity:1} }
        @keyframes slideIn { from{transform:translateX(-100%)} to{transform:translateX(0)} }
        .qopt { transition: all 0.13s ease; cursor: pointer; }
        .qopt:hover { border-color: ${GOLD} !important; background: rgba(241,190,67,0.05) !important; }
      `}</style>

      {/* Float XP */}
      {floatXP && (
        <div style={{ position: 'fixed', top: '30%', left: '50%', transform: 'translateX(-50%)', fontSize: 30, fontWeight: 800, color: GOLD, animation: 'floatXP 1.4s ease forwards', pointerEvents: 'none', zIndex: 9999 }}>
          +{floatXP} XP
        </div>
      )}

      {/* Exit modal */}
      {showExit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(6px)' }}>
          <div style={{ background: '#111a4a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 18, padding: '32px', maxWidth: 340, width: '90%', textAlign: 'center', animation: 'popIn 0.2s ease' }}>
            <div style={{ fontSize: 36, marginBottom: 14 }}>⚠️</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 8 }}>End this session?</div>
            <div style={{ fontSize: 14, color: '#64748b', marginBottom: 24, lineHeight: 1.65 }}>
              You've earned <span style={{ color: GOLD, fontWeight: 700 }}>{sessionXP} XP</span> so far. Your progress is saved.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowExit(false)} style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#94a3b8', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_B }}>Keep going</button>
              <button onClick={onHome} style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: '#ef4444', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>End session</button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile drawer */}
      {isMobile && menuOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999 }}>
          <div onClick={() => setMenuOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }} />
          <div style={{ position: 'absolute', top: 0, left: 0, width: 260, height: '100vh', animation: 'slideIn 0.25s ease', zIndex: 1000 }}>
            <SidebarContent onClose={() => setMenuOpen(false)} />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      {!isMobile && (
        <div style={{ width: 228, flexShrink: 0, height: '100vh', position: 'sticky', top: 0, borderRight: '1px solid rgba(255,255,255,0.07)' }}>
          <SidebarContent />
        </div>
      )}

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Mobile topbar */}
        {isMobile && (
          <div style={{ background: NAVYD, borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <button onClick={() => setMenuOpen(true)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ width: 20, height: 2, background: '#fff', borderRadius: 2 }} />
              <div style={{ width: 14, height: 2, background: '#fff', borderRadius: 2 }} />
              <div style={{ width: 20, height: 2, background: '#fff', borderRadius: 2 }} />
            </button>
            <span style={{ fontFamily: FONT_D, fontSize: 16, letterSpacing: 1 }}>
              <span style={{ color: '#fff' }}>grade</span><span style={{ color: GOLD }}>farm.</span>
            </span>
            <button onClick={() => setShowExit(true)} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 12, cursor: 'pointer', fontFamily: FONT_B }}>End</button>
          </div>
        )}

        {/* Gold header bar */}
        <div style={{ background: `linear-gradient(135deg,${GOLD},${GOLDL})`, padding: '10px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: NAVY }}>Q{qNumber}</span>
            <div style={{ width: 1, height: 14, background: 'rgba(0,0,0,0.15)' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: NAVY, background: 'rgba(0,0,0,0.1)', padding: '2px 10px', borderRadius: 20 }}>{currentQ.subtopic}</span>
            {isStruggle && <span style={{ fontSize: 11, fontWeight: 700, color: '#7f1d1d', background: 'rgba(127,29,29,0.15)', padding: '2px 9px', borderRadius: 20 }}>⚡ Priority</span>}
            <span style={{ fontSize: 11, color: 'rgba(12,16,55,0.6)' }}>{'★'.repeat(currentQ.difficulty)}{'☆'.repeat(5 - currentQ.difficulty)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {streak >= 2 && <span style={{ fontSize: 12, fontWeight: 800, color: NAVY }}>🔥 {streak} streak</span>}
            {accuracy !== null && <span style={{ fontSize: 12, fontWeight: 800, color: NAVY }}>{accuracy}% accuracy</span>}
            <span style={{ fontSize: 12, fontWeight: 800, color: NAVY }}>+{sessionXP} XP</span>
            {!isMobile && (
              <button onClick={() => setShowExit(true)} style={{ padding: '4px 12px', borderRadius: 7, border: '1px solid rgba(0,0,0,0.2)', background: 'transparent', color: NAVY, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>End Session</button>
            )}
          </div>
        </div>

        {/* XP level bar */}
        <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', flexShrink: 0 }}>
          <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg,${GOLD},${GOLDL})`, transition: 'width 0.8s' }} />
        </div>

        {/* Question + explanation layout — equal 50/50 columns desktop, single col mobile */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: isMobile ? 'auto' : 'hidden' }}>

          {/* LEFT — white question card + next button + flag tags below */}
          <div style={{ flex: 1, padding: isMobile ? '16px' : '32px 28px', overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: '100%', maxWidth: 600, animation: 'fadeUp 0.3s ease' }}>

              {/* White card: question + options only */}
              <div style={{ background: '#ffffff', borderRadius: 20, padding: isMobile ? '20px' : '28px', boxShadow: '0 32px 80px rgba(0,0,0,0.45), 0 8px 24px rgba(0,0,0,0.25)', marginBottom: showAns ? 14 : 0 }}>
                <div style={{ fontSize: isMobile ? 15 : 17, fontWeight: 700, color: NAVY, lineHeight: 1.7, marginBottom: 22 }}>
                  {currentQ.question}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {currentQ.options.map((opt, i) => {
                    const isCorrectOpt  = i === currentQ.answer_index
                    const isSelectedOpt = i === selected
                    let bg = '#f5f6ff', border = '1px solid #e2e5f0', color = '#334155', lBg = '#e2e5f0', lCol = '#0c1037'
                    if (showAns) {
                      if (isCorrectOpt)                    { bg = '#f0fdf4'; border = '1px solid #86efac'; color = '#166534'; lBg = '#bbf7d0'; lCol = '#166534' }
                      else if (isSelectedOpt && !correct)  { bg = '#fef2f2'; border = '1px solid #fca5a5'; color = '#991b1b'; lBg = '#fecaca'; lCol = '#991b1b' }
                      else                                 { bg = '#fafafa'; border = '1px solid #f0f0f0'; color = '#9ca3af'; lBg = '#f0f0f0'; lCol = '#9ca3af' }
                    }
                    return (
                      <button key={i} onClick={() => handleAnswer(i)}
                        className={showAns ? '' : 'qopt'}
                        style={{ background: bg, border, color, padding: '12px 16px', borderRadius: 11, fontSize: 14, fontWeight: 600, textAlign: 'left', cursor: showAns ? 'default' : 'pointer', fontFamily: FONT_B, display: 'flex', alignItems: 'center', gap: 12, transition: 'all 0.13s' }}>
                        <span style={{ width: 28, height: 28, borderRadius: '50%', background: lBg, color: lCol, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                          {showAns && isCorrectOpt ? '✓' : showAns && isSelectedOpt ? '✗' : String.fromCharCode(65 + i)}
                        </span>
                        {opt}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Next button + flag tags — below white card, always visible after answering */}
              {showAns && (
                <div style={{ animation: 'popIn 0.2s ease' }}>
                  <button onClick={nextQ} style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, color: NAVY, fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B, boxShadow: `0 6px 20px rgba(241,190,67,0.3)` }}>
                    Next Question →
                  </button>
                </div>
              )}

              {/* Mobile explanation — below next button on small screens */}
              {isMobile && showAns && (
                <div style={{ marginTop: 14, background: NAVYD, borderRadius: 14, padding: '18px', border: '1px solid rgba(255,255,255,0.07)', animation: 'popIn 0.25s ease' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 12px', borderRadius: 20, marginBottom: 14, background: correct ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', border: `1px solid ${correct ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`, fontSize: 12, fontWeight: 700, color: correct ? '#4ade80' : '#f87171' }}>
                    {correct ? `✓ Correct · +${earnedXP} XP` : `✗ Incorrect · +${earnedXP} XP`}
                  </div>
                  <div style={{ fontSize: 10, color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Explanation</div>
                  <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.75, marginBottom: currentQ.tip ? 10 : 0 }}>{currentQ.solution}</div>
                  {currentQ.tip && (
                    <div style={{ marginTop: 10, padding: '9px 12px', background: 'rgba(241,190,67,0.06)', borderRadius: '0 8px 8px 0', borderLeft: `2px solid ${GOLD}`, fontSize: 12, color: GOLD, lineHeight: 1.65 }}>
                      💡 {currentQ.tip}
                    </div>
                  )}
                  {loadingTip && <div style={{ fontSize: 12, color: '#475569', fontStyle: 'italic', marginTop: 8 }}>Getting AI tip…</div>}
                  {aiTip && (
                    <div style={{ marginTop: 8, padding: '9px 12px', background: 'rgba(99,102,241,0.08)', borderRadius: '0 8px 8px 0', borderLeft: '2px solid #6366f1', fontSize: 12, color: '#a5b4fc', lineHeight: 1.65 }}>
                      🤖 {aiTip}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT — dark explanation panel, fixed 340px, desktop only */}
          {!isMobile && (
            <div style={{ width: 340, flexShrink: 0, borderLeft: '1px solid rgba(255,255,255,0.07)', background: NAVYD, overflowY: 'auto', padding: '32px 28px', display: 'flex', flexDirection: 'column' }}>
              {!showAns ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 12 }}>
                  <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>💡</div>
                  <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.65, maxWidth: 200 }}>Select an answer to see the explanation</div>
                </div>
              ) : (
                <div style={{ animation: 'popIn 0.25s ease', maxWidth: 500 }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 14px', borderRadius: 20, marginBottom: 20, background: correct ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', border: `1px solid ${correct ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`, fontSize: 13, fontWeight: 700, color: correct ? '#4ade80' : '#f87171' }}>
                    {correct ? `✓ Correct · +${earnedXP} XP` : `✗ Incorrect · +${earnedXP} XP`}
                  </div>

                  <div style={{ fontSize: 11, color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Explanation</div>
                  <div style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.8, marginBottom: 16 }}>{currentQ.solution}</div>

                  {currentQ.tip && (
                    <div style={{ padding: '12px 14px', background: 'rgba(241,190,67,0.06)', borderRadius: '0 10px 10px 0', borderLeft: `3px solid ${GOLD}`, fontSize: 13, color: GOLD, lineHeight: 1.65, marginBottom: 16 }}>
                      💡 {currentQ.tip}
                    </div>
                  )}

                  {loadingTip && <div style={{ fontSize: 12, color: '#475569', fontStyle: 'italic', marginBottom: 12 }}>Getting AI tip…</div>}
                  {aiTip && (
                    <div style={{ padding: '12px 14px', background: 'rgba(99,102,241,0.08)', borderRadius: '0 10px 10px 0', borderLeft: '3px solid #6366f1', fontSize: 13, color: '#a5b4fc', lineHeight: 1.65, marginBottom: 16 }}>
                      🤖 {aiTip}
                    </div>
                  )}

                  <div>
                    <div style={{ fontSize: 11, color: '#334155', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Flag this question</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {['Too easy', 'Too hard', 'Confusing', 'Typo'].map(tag => (
                        <button key={tag} style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: '#475569', fontSize: 12, cursor: 'pointer', fontFamily: FONT_B }}>{tag}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
