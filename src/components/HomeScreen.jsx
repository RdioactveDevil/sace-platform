import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { THEMES } from '../lib/theme'
import { getQuestionCounts } from '../lib/engine'
import { supabase } from '../lib/supabase'
import { getAssessments } from '../lib/db'
import { getTopicConfig } from '../lib/saceTopics'

const GOLD   = '#f1be43'
const GOLDL  = '#f9d87a'
const FONT_B = "'Plus Jakarta Sans', sans-serif"

export default function HomeScreen({ profile, struggleMap, questions, subject, onStartSession, theme }) {
  const t = THEMES[theme]
  const { macroGroups: MACRO_GROUPS, normFn: topicNormFn } = getTopicConfig(subject?.stage)
  const navigate = useNavigate()
  const [selectedSubtopics, setSelectedSubtopics] = useState([])
  const [expandedMacros, setExpandedMacros] = useState(() => new Set(['g1','g2','g3','g4','g5','g6']))
  const [assessments, setAssessments] = useState([])

  useEffect(() => {
    let cancelled = false
    getAssessments(profile.id).then(rows => { if (!cancelled) setAssessments(rows) }).catch(() => {})
    return () => { cancelled = true }
  }, [profile.id])

  const questionIds = useMemo(() => new Set(questions.map(q => q.id)), [questions])
  const currentStruggleMap = useMemo(() => {
    const filtered = {}
    Object.entries(struggleMap || {}).forEach(([qid, stats]) => {
      if (questionIds.has(qid)) filtered[qid] = stats
    })
    return filtered
  }, [struggleMap, questionIds])

  // ── Normalised topic helpers ───────────────────────────────────────────────
  // Build a set of macro labels so we can detect when q.topic IS a macro label
  const macroLabelToGroup = {}
  MACRO_GROUPS.forEach(macro => { macroLabelToGroup[macro.label.toLowerCase()] = macro })

  const topicNorm = (raw) => {
    if (!raw) return null
    const canonical = topicNormFn(raw)
    if (canonical) return canonical
    // If the raw topic exactly matches a macro label, leave it as-is so the
    // macro-level fallback below can pick it up
    if (macroLabelToGroup[raw.toLowerCase()]) return raw
    return raw
  }

  const normTopicToSubs = {}
  const normTopicGroups = {}
  questions.forEach(q => {
    const n = topicNorm(q.topic)
    if (!n) return
    if (!normTopicToSubs[n]) normTopicToSubs[n] = []
    if (q.subtopic && !normTopicToSubs[n].includes(q.subtopic)) normTopicToSubs[n].push(q.subtopic)
    if (!normTopicGroups[n]) normTopicGroups[n] = { total: 0, attempted: 0, correct: 0, wrong: 0 }
    normTopicGroups[n].total++
    const s = currentStruggleMap[q.id]
    if (s && s.attempts > 0) {
      normTopicGroups[n].attempted++
      normTopicGroups[n].correct += (s.attempts - s.wrong)
      normTopicGroups[n].wrong += s.wrong
    }
  })
  const allSubtopics = [...new Set(questions.map(q => q.subtopic).filter(Boolean))]
  const selectedNormTopicCount = MACRO_GROUPS.reduce((acc, macro) => {
    return acc + macro.topics.filter(tn => {
      const subs = normTopicToSubs[tn] || []
      return subs.length > 0 && subs.every(s => selectedSubtopics.includes(s))
    }).length
  }, 0)
  const topicsInBankCount = MACRO_GROUPS.reduce((n, m) => n + m.topics.filter(tn => normTopicGroups[tn]).length, 0)
  const hasNoTopicsSelected = selectedSubtopics.length === 0
  const isAllTopicsSelected = allSubtopics.length > 0 && selectedSubtopics.length === allSubtopics.length
  const effectiveSubtopics = selectedSubtopics
  const selectedQuestionTotal = hasNoTopicsSelected
    ? 0
    : questions.filter(q => selectedSubtopics.includes(q.subtopic)).length

  const fullCounts = getQuestionCounts(questions, currentStruggleMap)
  const filteredCounts = hasNoTopicsSelected
    ? { unseen: 0, wrong: 0, total: 0 }
    : getQuestionCounts(questions, currentStruggleMap, effectiveSubtopics)

  const selectedTopicsSummary = hasNoTopicsSelected
    ? 'No topics selected'
    : isAllTopicsSelected
      ? 'All topics'
      : [...new Set(questions.filter(q => selectedSubtopics.includes(q.subtopic)).map(q => q.topic))].join(', ')

  const topStruggles = Object.entries(currentStruggleMap)
    .map(([qid, s]) => {
      const q = questions.find(x => x.id === qid)
      if (!q || s.attempts === 0) return null
      return { q, rate: s.wrong / s.attempts, ...s }
    })
    .filter(x => x && x.rate >= 0.4)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 5)

  const totalAttempts = Object.values(currentStruggleMap).reduce((s, v) => s + (v.attempts || 0), 0)
  const totalWrong = Object.values(currentStruggleMap).reduce((s, v) => s + (v.wrong || 0), 0)
  const accuracy = totalAttempts > 0 ? Math.round(((totalAttempts - totalWrong) / totalAttempts) * 100) : 0
  const days = ['M','T','W','T','F','S','S']
  const [weekActivity, setWeekActivity] = useState([0,0,0,0,0,0,0])
  const [todayStats, setTodayStats]     = useState({ total: 0, correct: 0 })
  const [showComeback, setShowComeback] = useState(false)
  const maxAct = Math.max(...weekActivity, 1)

  useEffect(() => {
    if (!profile?.id) return

    // Comeback check — show banner if away 48h+ and haven't answered today
    const lastActive = profile.last_active ? new Date(profile.last_active) : null
    const hoursSince = lastActive ? (Date.now() - lastActive.getTime()) / 3600000 : 0
    const dismissKey = `gf-comeback-${new Date().toDateString()}`
    if (hoursSince >= 48 && !localStorage.getItem(dismissKey)) setShowComeback(true)

    // Start of this Mon–Sun week
    const now = new Date()
    const monday = new Date(now)
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
    monday.setHours(0, 0, 0, 0)

    // Start of today
    const todayMidnight = new Date()
    todayMidnight.setHours(0, 0, 0, 0)

    supabase
      .from('answer_log')
      .select('answered_at, correct')
      .eq('user_id', profile.id)
      .gte('answered_at', monday.toISOString())
      .then(({ data }) => {
        if (!data?.length) return
        const counts = [0, 0, 0, 0, 0, 0, 0]
        let todayTotal = 0, todayCorrect = 0
        data.forEach(a => {
          counts[(new Date(a.answered_at).getDay() + 6) % 7]++
          if (new Date(a.answered_at) >= todayMidnight) {
            todayTotal++
            if (a.correct) todayCorrect++
          }
        })
        setWeekActivity(counts)
        setTodayStats({ total: todayTotal, correct: todayCorrect })
      })
  }, [profile.id, profile.last_active])

  const card = {
    background: t.bgCard,
    border: `1px solid ${t.border}`,
    borderRadius: 16,
    boxShadow: theme === 'light' ? '0 2px 12px rgba(12,16,55,0.07)' : '0 2px 12px rgba(0,0,0,0.25)',
  }

  const actionButtonBase = {
    width: '100%',
    borderRadius: 12,
    cursor: 'pointer',
    fontFamily: FONT_B,
  }

  const renderActionButton = ({ label, onClick, variant = 'secondary', disabled = false, small = false }) => {
    const styles = {
      primary: {
        border: 'none',
        background: disabled ? (theme === 'dark' ? 'rgba(255,255,255,0.06)' : '#eceef8') : `linear-gradient(135deg,${GOLD},${GOLDL})`,
        color: disabled ? t.textFaint : '#0c1037',
        boxShadow: disabled ? 'none' : '0 6px 24px rgba(241,190,67,0.35)',
      },
      danger: {
        border: '1px solid rgba(239,68,68,0.3)',
        background: disabled ? 'transparent' : 'rgba(239,68,68,0.06)',
        color: disabled ? t.textFaint : t.danger,
      },
      secondary: {
        border: `1px solid ${t.border}`,
        background: 'transparent',
        color: disabled ? t.textFaint : t.textMuted,
      },
    }

    return (
      <button
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        style={{
          ...actionButtonBase,
          ...styles[variant],
          padding: small ? '12px 14px' : '14px 16px',
          fontSize: small ? 13 : 14,
          fontWeight: variant === 'primary' ? 800 : 700,
          opacity: disabled ? 0.65 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {label}
      </button>
    )
  }

  const PriorityCard = () => topStruggles.length > 0 ? (
    <div style={{ ...card, padding: '16px 18px' }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: t.text, marginBottom: 2 }}>Priority Topics</div>
      <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 12 }}>Hit first in your next session</div>
      {topStruggles.map((s, i) => (
        <div key={s.q.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${t.border}` }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: `${t.danger}15`, border: `1px solid ${t.danger}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: t.danger, flexShrink: 0 }}>{i+1}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{topicNorm(s.q.topic) || s.q.topic}</div>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.danger, flexShrink: 0 }}>{Math.round(s.rate*100)}%</div>
        </div>
      ))}
    </div>
  ) : null

  const StatsCard = () => (
    <div style={{ ...card, padding: '16px 18px' }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: t.text, marginBottom: 12 }}>Your Stats</div>
      {[
        { label: 'Total XP',       val: profile.xp.toLocaleString(),         color: GOLD },
        { label: 'Best streak',    val: `${profile.best_streak||0} days 🔥`, color: GOLD },
        { label: 'Questions done', val: totalAttempts,                        color: t.text },
        { label: 'Accuracy',       val: `${accuracy}%`,                      color: accuracy > 70 ? t.success : accuracy > 40 ? GOLD : t.danger },
      ].map(s => (
        <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${t.border}` }}>
          <span style={{ fontSize: 15, color: t.textMuted }}>{s.label}</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: s.color }}>{s.val}</span>
        </div>
      ))}
    </div>
  )

  const SprintCard = () => (
    <div style={{ ...card, padding: '16px 18px', background: theme === 'dark' ? 'rgba(241,190,67,0.05)' : t.bgCard, border: `1px solid ${theme === 'dark' ? 'rgba(241,190,67,0.15)' : t.border}` }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: GOLD, marginBottom: 6 }}>📚 Study Plan</div>
      <div style={{ fontSize: 14, color: t.textMuted, lineHeight: 1.6, marginBottom: 10 }}>See your personalised review schedule and topic mastery.</div>
      <button
        onClick={() => navigate('/study-plan')}
        style={{ width: '100%', padding: '9px', borderRadius: 8, border: `1px solid rgba(241,190,67,0.25)`, background: 'transparent', color: GOLD, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_B }}
      >
        View Study Plan →
      </button>
    </div>
  )

  // ── Daily Missions ────────────────────────────────────────────────────────
  const daysActiveThisWeek = weekActivity.filter(c => c > 0).length
  const missions = [
    { icon: '⚡', label: 'Answer 10 questions', progress: Math.min(todayStats.total, 10), target: 10 },
    { icon: '🎯', label: 'Get 8 correct today',  progress: Math.min(todayStats.correct, 8), target: 8 },
    { icon: '📅', label: 'Study 5 days this week', progress: Math.min(daysActiveThisWeek, 5), target: 5 },
  ]
  const allMissionsDone = missions.every(m => m.progress >= m.target)

  const MissionsCard = () => (
    <div style={{ ...card, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>Daily Missions</div>
        {allMissionsDone && <span style={{ fontSize: 11, color: '#4ade80', fontWeight: 700 }}>✓ All done!</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {missions.map(m => {
          const done = m.progress >= m.target
          const pct  = Math.round((m.progress / m.target) * 100)
          return (
            <div key={m.label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: done ? '#4ade80' : t.text, fontWeight: 600 }}>
                  {m.icon} {m.label}
                </span>
                <span style={{ fontSize: 11, color: done ? '#4ade80' : t.textMuted, fontWeight: 700 }}>
                  {m.progress}/{m.target}
                </span>
              </div>
              <div style={{ background: t.border, borderRadius: 999, height: 5, overflow: 'hidden' }}>
                <div style={{
                  width: `${pct}%`, height: '100%', borderRadius: 999,
                  background: done ? '#4ade80' : `linear-gradient(90deg,${GOLD},${GOLDL})`,
                  transition: 'width 0.5s ease',
                }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  // ── Exam Countdown ────────────────────────────────────────────────────────
  const ExamCountdownCard = () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const upcoming = assessments
      .filter(a => new Date(a.date) >= today)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
    const next = upcoming[0] || null

    if (!next) return (
      <div style={{ ...card, padding: '16px 18px', border: `1px solid ${theme === 'dark' ? 'rgba(241,190,67,0.15)' : t.border}`, background: theme === 'dark' ? 'rgba(241,190,67,0.04)' : t.bgCard }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: GOLD, marginBottom: 6 }}>📅 Exam Countdown</div>
        <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.6, marginBottom: 10 }}>Add assessments in My Progress to track upcoming exams and tests.</div>
        <button onClick={() => navigate('/my-progress')} style={{ width: '100%', padding: '8px', borderRadius: 8, border: `1px solid rgba(241,190,67,0.25)`, background: 'transparent', color: GOLD, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_B }}>
          Add assessment →
        </button>
      </div>
    )

    const daysLeft = Math.max(0, Math.ceil((new Date(next.date) - today) / 86400000))
    const isExam   = next.type === 'Exam'
    const color    = daysLeft > 60 ? '#4ade80' : daysLeft > 21 ? GOLD : '#f87171'
    const message  = daysLeft > 60 ? 'You have time — build strong habits now.'
      : daysLeft > 21 ? 'Crunch mode. Focus on weak topics first.'
      : daysLeft > 7  ? 'Final stretch — revise, revise, revise.'
      : daysLeft > 0  ? 'This week! Review key formulas and past patterns.'
      : 'Today! Best of luck! 🏆'

    return (
      <div style={{ ...card, padding: '16px 18px', border: `1px solid ${color}30`, background: `${color}08` }}>
        <div style={{ fontSize: 11, color, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
          {isExam ? '📅 SACE Exam' : `📋 ${next.type}`}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <div style={{ fontSize: 40, fontWeight: 800, color, lineHeight: 1 }}>{daysLeft}</div>
            <div style={{ fontSize: 10, color: t.textMuted, fontWeight: 600 }}>days left</div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{next.label}</div>
            <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.5 }}>{message}</div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: t.textFaint, marginBottom: upcoming.length > 1 ? 10 : 0 }}>
          {new Date(next.date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
        {upcoming.length > 1 && (
          <div style={{ borderTop: `1px solid ${t.border}`, paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
            {upcoming.slice(1, 4).map(a => {
              const d = Math.max(0, Math.ceil((new Date(a.date) - today) / 86400000))
              const c2 = d > 60 ? '#4ade80' : d > 21 ? GOLD : '#f87171'
              return (
                <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{a.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: c2, flexShrink: 0, marginLeft: 8 }}>{d}d</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  const toggleMacroExpand = (macroId) => {
    setExpandedMacros(prev => {
      const next = new Set(prev)
      if (next.has(macroId)) next.delete(macroId)
      else next.add(macroId)
      return next
    })
  }

  const toggleMacro = (macroId) => {
    const macro = MACRO_GROUPS.find(g => g.id === macroId)
    if (!macro) return
    const macroSubs = macro.topics.flatMap(tp => normTopicToSubs[tp] || [])
    const allSel = macroSubs.length > 0 && macroSubs.every(s => selectedSubtopics.includes(s))
    if (allSel) setSelectedSubtopics(prev => prev.filter(s => !macroSubs.includes(s)))
    else setSelectedSubtopics(prev => [...new Set([...prev, ...macroSubs])])
  }

  const toggleNormTopic = (topicName) => {
    const subs = normTopicToSubs[topicName] || []
    const allSel = subs.length > 0 && subs.every(s => selectedSubtopics.includes(s))
    if (allSel) setSelectedSubtopics(prev => prev.filter(s => !subs.includes(s)))
    else setSelectedSubtopics(prev => [...new Set([...prev, ...subs])])
  }

  const normTopicStatusColor = (topicName) => {
    const tg = normTopicGroups[topicName]
    if (!tg || tg.attempted === 0) return GOLD
    const rate = tg.wrong / tg.attempted
    if (rate >= 0.5) return t.danger
    if (rate >= 0.25) return GOLD
    return t.success
  }

  return (
    <div style={{ color: t.text, fontFamily: FONT_B, animation: 'hs-fadeUp 0.3s ease', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{`
        @keyframes hs-fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        .hs-wrap  { display: flex; align-items: flex-start; gap: 24px; flex: 1; min-height: 0; }
        .hs-main  { flex: 1; min-width: 0; max-width: 980px; padding: 32px 24px 32px 32px; overflow-y: auto; height: 100%; box-sizing: border-box; }
        .hs-right { width: 328px; flex-shrink: 0; padding: 32px 32px 32px 0; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; height: 100%; box-sizing: border-box; }
        .hs-mobile-cards { display: none; flex-direction: column; gap: 14px; margin-top: 14px; }
        .hs-selected-actions { display: grid; grid-template-columns: 1.3fr 1fr 1fr; gap: 10px; }
        .hs-topic-grid { display: grid; grid-template-columns: minmax(280px, 340px) 180px 56px; align-items: center; column-gap: 18px; width: 100%; }
        .hs-topic-track { width: 180px; height: 4px; border-radius: 999px; overflow: hidden; justify-self: start; }
        @media (max-width: 1240px) {
          .hs-main  { max-width: none; padding-right: 16px; }
          .hs-right { width: 300px; padding-right: 24px; }
        }
        @media (max-width: 1100px) {
          .hs-selected-actions { grid-template-columns: 1fr; }
          .hs-topic-grid { grid-template-columns: minmax(220px, 1fr) 140px 48px; column-gap: 14px; }
          .hs-topic-track { width: 140px; }
          .hs-right { width: 280px; padding-right: 20px; }
        }
        @media (max-width: 860px) {
          .hs-wrap  { display: block !important; flex: none !important; height: auto !important; overflow: visible !important; min-height: auto !important; }
          .hs-main  { height: auto !important; overflow-y: visible !important; padding: 18px 14px !important; }
          .hs-right { display: none !important; }
          .hs-mobile-cards { display: flex; }
          .hs-topic-grid { grid-template-columns: minmax(0, 1fr) auto; column-gap: 10px; row-gap: 0; align-items: center; }
          .hs-topic-track { display: none !important; }
        }
        @media (max-width: 560px) {
          .hs-topic-grid { grid-template-columns: minmax(0, 1fr) auto; }
        }
      `}</style>

      <div className="hs-wrap">
        <div className="hs-main">
          {/* Comeback banner */}
          {showComeback && (
            <div style={{ marginBottom: 16, padding: '14px 18px', borderRadius: 14, background: 'rgba(241,190,67,0.08)', border: '1px solid rgba(241,190,67,0.25)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: GOLD, marginBottom: 3 }}>👋 Welcome back!</div>
                <div style={{ fontSize: 12, color: t.textMuted }}>You've been away a while. Pick up where you left off — your study plan is waiting.</div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button onClick={() => onStartSession({ mode: 'wrong', subtopics: [] })} style={{ padding: '8px 14px', borderRadius: 9, border: 'none', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, color: '#0c1037', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B }}>
                  Start session →
                </button>
                <button onClick={() => { setShowComeback(false); localStorage.setItem(`gf-comeback-${new Date().toDateString()}`, '1') }}
                  style={{ padding: '8px 10px', borderRadius: 9, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 12, cursor: 'pointer', fontFamily: FONT_B }}>✕</button>
              </div>
            </div>
          )}

          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4, color: t.text }}>Question Bank</h1>
          <p style={{ fontSize: 13, color: t.textMuted, marginBottom: 20 }}>
            {subject?.stage || 'Stage 1'} · {subject?.name || 'Chemistry'} · {questions.length} questions
          </p>

          <div style={{ ...card, padding: '16px 20px', marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ padding: '5px 14px', borderRadius: 20, background: GOLD, color: '#0c1037', fontSize: 12, fontWeight: 700 }}>This Week</span>
              </div>
              <div style={{ display: 'flex', gap: 20 }}>
                {[
                  { val: totalAttempts, label: 'answered' },
                  { val: `${accuracy}%`, label: 'correct' },
                  { val: profile.streak || 0, label: 'streak' },
                ].map(s => (
                  <div key={s.label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: t.text }}>{s.val}</div>
                    <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 48 }}>
              {days.map((d, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: '100%', background: weekActivity[i] > 0 ? GOLD : t.border, borderRadius: '3px 3px 0 0', height: weekActivity[i] > 0 ? `${Math.max((weekActivity[i]/maxAct)*38, 8)}px` : '3px' }} />
                  <div style={{ fontSize: 10, color: i === (new Date().getDay() + 6) % 7 ? GOLD : t.textFaint, fontWeight: i === (new Date().getDay() + 6) % 7 ? 700 : 400 }}>{d}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...card, padding: '16px 20px', marginBottom: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: t.text }}>Quick Start (All Topics)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {fullCounts.unseen > 0 ? (
                renderActionButton({
                  label: `Start Session · ${fullCounts.unseen} new question${fullCounts.unseen !== 1 ? 's' : ''} →`,
                  variant: 'primary',
                  onClick: () => onStartSession({ mode: 'new', subtopics: [] }),
                })
              ) : (
                <div style={{ borderRadius: 12, padding: '20px 16px', background: theme === 'dark' ? 'rgba(255,255,255,0.03)' : '#f6f7fc', border: `1px solid ${t.border}`, textAlign: 'center' }}>
                  <div style={{ fontSize: 24, marginBottom: 6 }}>🎉</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 4 }}>All questions attempted!</div>
                  <div style={{ fontSize: 12, color: t.textMuted }}>Use the options below to review and repeat.</div>
                </div>
              )}

              {fullCounts.wrong > 0 && renderActionButton({
                label: `Re-attempt ${fullCounts.wrong} wrong answer${fullCounts.wrong !== 1 ? 's' : ''}`,
                variant: 'danger',
                onClick: () => onStartSession({ mode: 'wrong', subtopics: [] }),
              })}

              {fullCounts.attempted > 0 && renderActionButton({
                label: 'Repeat all questions',
                onClick: () => onStartSession({ mode: 'all', subtopics: [] }),
              })}
            </div>
          </div>

          <div style={{ ...card, padding: 0, overflow: 'hidden', marginBottom: 14 }}>
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${t.border}` }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: t.text, marginBottom: 2 }}>Topic Progress</div>
              <div style={{ fontSize: 12, color: t.textMuted }}>{MACRO_GROUPS.length} topics · {questions.length} questions</div>
            </div>

            <div onClick={() => setSelectedSubtopics(isAllTopicsSelected ? [] : allSubtopics)}
              style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', cursor: 'pointer', background: isAllTopicsSelected ? 'rgba(241,190,67,0.07)' : 'transparent', borderBottom: `1px solid ${t.border}` }}>
              <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${isAllTopicsSelected ? GOLD : t.border}`, background: isAllTopicsSelected ? GOLD : 'transparent', marginRight: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {isAllTopicsSelected && <span style={{ fontSize: 10, color: '#0c1037', fontWeight: 800 }}>✓</span>}
              </div>
              <span style={{ fontSize: 14, fontWeight: 800, color: isAllTopicsSelected ? GOLD : t.text, flex: 1 }}>All Topics</span>
              <span style={{ fontSize: 13, color: t.textMuted }}>{Object.values(currentStruggleMap).filter(s => s.attempts > 0).length}/{questions.length}</span>
            </div>

            <div style={{ maxHeight: 560, overflowY: 'auto' }}>
              {MACRO_GROUPS.map((macro, mi) => {
                const macroSubs = macro.topics.flatMap(tp => normTopicToSubs[tp] || [])
                const macroSelected = macroSubs.length > 0 && macroSubs.every(s => selectedSubtopics.includes(s))
                const macroPartial = macroSubs.some(s => selectedSubtopics.includes(s)) && !macroSelected
                const isMacroExpanded = expandedMacros.has(macro.id)
                // Also count questions keyed by the macro label itself (when q.topic = macro label)
                const macroLabelGroup = normTopicGroups[macro.label] || { total: 0, attempted: 0 }
                const macroTotal = macro.topics.reduce((sum, tp) => sum + (normTopicGroups[tp]?.total || 0), 0) + macroLabelGroup.total
                const macroAttempted = macro.topics.reduce((sum, tp) => sum + (normTopicGroups[tp]?.attempted || 0), 0) + macroLabelGroup.attempted
                return (
                  <div key={macro.id}>
                    <div style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: `1px solid ${t.border}`, background: isMacroExpanded ? (theme === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)') : 'transparent', gap: 10 }}>
                      <div onClick={() => toggleMacro(macro.id)} style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${macroSelected || macroPartial ? GOLD : t.border}`, background: macroSelected ? GOLD : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                        {macroSelected && <span style={{ fontSize: 10, color: '#0c1037', fontWeight: 800 }}>✓</span>}
                        {macroPartial && !macroSelected && <span style={{ fontSize: 10, color: GOLD, fontWeight: 800 }}>−</span>}
                      </div>
                      <button onClick={() => toggleMacroExpand(macro.id)} style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', color: t.textMuted, fontSize: 14, lineHeight: 1, width: 14, flexShrink: 0 }}>
                        {isMacroExpanded ? '▾' : '▸'}
                      </button>
                      <div onClick={() => toggleMacroExpand(macro.id)} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
                        <div style={{ fontSize: 10, color: t.textFaint, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase' }}>Topic {macro.num}</div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{macro.label}</div>
                      </div>
                      <span style={{ fontSize: 12, color: t.textMuted, flexShrink: 0 }}>{macroAttempted}/{macroTotal}</span>
                    </div>

                    {isMacroExpanded && macro.topics.map((topicName, ti) => {
                      const tg = normTopicGroups[topicName]
                      if (!tg) return null
                      const subs = normTopicToSubs[topicName] || []
                      const topicSel = subs.length > 0 && subs.every(s => selectedSubtopics.includes(s))
                      const topicPartial = subs.some(s => selectedSubtopics.includes(s)) && !topicSel
                      const accent = normTopicStatusColor(topicName)
                      const topicPct = tg.total > 0 ? Math.round((tg.attempted / tg.total) * 100) : 0
                      return (
                        <div key={topicName}>
                          <div
                            onClick={() => toggleNormTopic(topicName)}
                            style={{ display: 'flex', alignItems: 'center', padding: '9px 16px 9px 30px', borderBottom: `1px solid ${t.border}`, gap: 8, cursor: 'pointer' }}
                            role="button"
                            tabIndex={0}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleNormTopic(topicName) } }}
                          >
                            <div style={{ width: 15, height: 15, borderRadius: 4, border: `2px solid ${topicSel || topicPartial ? GOLD : t.border}`, background: topicSel ? GOLD : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                              {topicSel && <span style={{ fontSize: 9, color: '#0c1037', fontWeight: 800 }}>✓</span>}
                              {topicPartial && !topicSel && <span style={{ fontSize: 9, color: GOLD, fontWeight: 800 }}>−</span>}
                            </div>
                            <div style={{ width: 7, height: 7, borderRadius: '50%', background: accent, flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: t.text }}>{mi + 1}.{ti + 1} {topicName}</span>
                              <span style={{ fontSize: 11, color: t.textMuted }}> ({tg.attempted}/{tg.total})</span>
                            </div>
                            <span style={{ fontSize: 11, color: t.textFaint, flexShrink: 0 }}>{topicPct}%</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>

          <div style={{ ...card, padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>Selected for next session</div>
                <div style={{ fontSize: 12, color: t.textMuted, marginTop: 4 }}>
                  {isAllTopicsSelected
                    ? `${topicsInBankCount} topic${topicsInBankCount !== 1 ? 's' : ''} selected`
                    : `${selectedNormTopicCount} topic${selectedNormTopicCount !== 1 ? 's' : ''} selected`}
                </div>
                <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>{selectedTopicsSummary}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: GOLD }}>{selectedQuestionTotal}</div>
                <div style={{ fontSize: 12, color: t.textMuted }}>questions included</div>
              </div>
            </div>

            <div className="hs-selected-actions">
              {renderActionButton({
                label: `Start selected session · ${filteredCounts.unseen} new`,
                variant: 'primary',
                disabled: hasNoTopicsSelected || filteredCounts.unseen === 0,
                onClick: () => onStartSession({ mode: 'new', subtopics: effectiveSubtopics }),
              })}
              {renderActionButton({
                label: `Re-attempt wrong · ${filteredCounts.wrong}`,
                variant: 'danger',
                disabled: hasNoTopicsSelected || filteredCounts.wrong === 0,
                onClick: () => onStartSession({ mode: 'wrong', subtopics: effectiveSubtopics }),
              })}
              {renderActionButton({
                label: 'Repeat selected',
                disabled: hasNoTopicsSelected || selectedQuestionTotal === 0,
                onClick: () => onStartSession({ mode: 'all', subtopics: effectiveSubtopics }),
              })}
            </div>

            {hasNoTopicsSelected && (
              <div style={{ fontSize: 12, color: t.textMuted, marginTop: 10 }}>Select at least one topic to start a session.</div>
            )}
          </div>

          <div className="hs-mobile-cards">
            <ExamCountdownCard />
            <MissionsCard />
            <PriorityCard />
            <StatsCard />
            <SprintCard />
          </div>
        </div>

        <div className="hs-right">
          <ExamCountdownCard />
          <MissionsCard />
          <PriorityCard />
          <StatsCard />
          <SprintCard />
        </div>
      </div>
    </div>
  )
}
