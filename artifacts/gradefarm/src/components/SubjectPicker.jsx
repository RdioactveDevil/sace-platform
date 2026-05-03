import { useState, useEffect } from 'react'
import { THEMES } from '../lib/theme'
import { ALL_SUBJECTS, QUESTIONS_SUBJECT_BY_ID } from '../lib/subjects'
import { countQuestionsForSubject } from '../lib/db'

const GOLD   = '#f1be43'
const GOLDL  = '#f9d87a'
const FONT_B = `'Plus Jakarta Sans', sans-serif`

export default function SubjectPicker({ profile, subscriptions = [], onSelect, onGetAccess, theme }) {
  const [selected, setSelected] = useState(null)
  const [hovering, setHovering] = useState(null)
  const [liveQuestionCounts, setLiveQuestionCounts] = useState({})
  const t = THEMES[theme]

  useEffect(() => {
    let cancelled = false
    const ids = ALL_SUBJECTS.filter((s) => s.available && QUESTIONS_SUBJECT_BY_ID[s.id]).map((s) => s.id)
    if (ids.length === 0) return undefined
    Promise.all(
      ids.map(async (id) => {
        const n = await countQuestionsForSubject(QUESTIONS_SUBJECT_BY_ID[id])
        return [id, n]
      })
    )
      .then((pairs) => {
        if (!cancelled) setLiveQuestionCounts(Object.fromEntries(pairs))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const hasSubscriptions = subscriptions.length > 0

  const subscribed = ALL_SUBJECTS.filter(s =>
    s.available && (
      !hasSubscriptions ||
      subscriptions.some(sub => sub.subject_name === s.name && sub.stage === s.stage)
    )
  )

  const notSubscribed = hasSubscriptions
    ? ALL_SUBJECTS.filter(s =>
        s.available &&
        !subscriptions.some(sub => sub.subject_name === s.name && sub.stage === s.stage)
      )
    : []

  const comingSoon = ALL_SUBJECTS.filter(s => !s.available)

  const SubjectCard = ({ subj, locked = false }) => {
    const isSelected = selected?.id === subj.id
    return (
      <div
        onClick={() => !locked && setSelected(subj)}
        onMouseEnter={() => !locked && setHovering(subj.id)}
        onMouseLeave={() => setHovering(null)}
        style={{
          background: locked ? '#f8f9ff' : '#ffffff',
          border: locked ? '1.5px dashed #c7d0e8' : isSelected ? `2px solid #0c1037` : '1px solid #e2e5f0',
          borderRadius: 14, padding: '20px',
          cursor: locked ? 'default' : 'pointer',
          transition: 'all 0.15s ease',
          boxShadow: isSelected ? '0 4px 20px rgba(12,16,55,0.14)' : '0 1px 4px rgba(0,0,0,0.06)',
          position: 'relative',
        }}
      >
        {locked && (
          <div style={{ position: 'absolute', top: 10, right: 10, fontSize: 10, background: '#eef0ff', border: '1px solid #c7d0e8', color: '#6b7db3', padding: '3px 8px', borderRadius: 6, fontWeight: 700, letterSpacing: '0.04em' }}>
            LOCKED
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 11, background: locked ? '#f0f2ff' : `${subj.color}22`, border: locked ? '1px solid #c7d0e8' : `1px solid ${subj.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, opacity: locked ? 0.45 : 1 }}>
              {locked ? '🔒' : subj.icon}
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: locked ? '#8896b3' : '#0c1037' }}>{subj.name}</div>
              <div style={{ fontSize: 11, color: locked ? '#a0aec0' : subj.color, fontWeight: 700, marginTop: 1 }}>{subj.stage}</div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 14 }}>
          {subj.topics.slice(0, 4).map(topic => (
            <span key={topic} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: locked ? '#eef0ff' : '#f1f5f9', border: `1px solid ${locked ? '#c7d0e8' : '#e2e5f0'}`, color: locked ? '#8896b3' : '#334155' }}>{topic}</span>
          ))}
          {subj.topics.length > 4 && <span style={{ fontSize: 11, color: '#94a3b8' }}>+{subj.topics.length - 4} more</span>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: locked ? '#a0aec0' : '#64748b' }}>
            {liveQuestionCounts[subj.id] !== undefined ? liveQuestionCounts[subj.id] : subj.questionCount} questions
          </span>
          {locked ? (
            <button
              onClick={e => { e.stopPropagation(); onGetAccess && onGetAccess(subj) }}
              style={{
                fontSize: 12, fontWeight: 700, color: '#ffffff',
                background: 'linear-gradient(135deg, #0c1037, #1e2a6e)',
                padding: '6px 14px', borderRadius: 8,
                border: 'none', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontFamily: FONT_B,
                boxShadow: '0 2px 8px rgba(12,16,55,0.2)',
              }}
            >
              ✦ Get Access
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#059669' }} />
              <span style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>Ready</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8f9ff', color: '#0c1037', fontFamily: FONT_B, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px 60px', boxSizing: 'border-box' }}>
      <style>{`*, *::before, *::after { box-sizing: border-box; } @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }`}</style>

      <div style={{ textAlign: 'center', marginBottom: 40, animation: 'fadeUp 0.4s ease' }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, background: `linear-gradient(135deg,${GOLD},${GOLDL})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 16px' }}>⚗️</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 8px', color: '#0c1037' }}>
          Welcome back, {profile.display_name.split(' ')[0]}
        </h1>
        <p style={{ fontSize: 15, color: '#64748b', margin: 0 }}>Choose a subject to practise</p>
      </div>

      <div style={{ width: '100%', maxWidth: 680, animation: 'fadeUp 0.5s ease' }}>

        {subscribed.length > 0 && (
          <>
            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>Your Subjects</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12, marginBottom: 28 }}>
              {subscribed.map(subj => <SubjectCard key={subj.id} subj={subj} />)}
            </div>
          </>
        )}

        {notSubscribed.length > 0 && (
          <>
            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>Not in Your Plan</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12, marginBottom: 28 }}>
              {notSubscribed.map(subj => <SubjectCard key={subj.id} subj={subj} locked />)}
            </div>
          </>
        )}

        {comingSoon.length > 0 && (
          <>
            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>Coming Soon</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10, marginBottom: 36, opacity: 0.55 }}>
              {comingSoon.map(subj => (
                <div key={subj.id} style={{ background: '#f0f2ff', border: '1px solid #e2e5f0', borderRadius: 14, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: `${subj.color}15`, border: `1px solid ${subj.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{subj.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1e2a5e' }}>{subj.name}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{subj.stage}</div>
                  </div>
                  <span style={{ fontSize: 10, background: '#e2e5f0', color: '#64748b', padding: '3px 8px', borderRadius: 6, fontWeight: 600 }}>SOON</span>
                </div>
              ))}
            </div>
          </>
        )}

        {subscribed.length === 0 && notSubscribed.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 20px', color: '#64748b', fontSize: 14 }}>
            No subjects available. Please complete onboarding to set up your subjects.
          </div>
        )}

        <button
          onClick={() => selected && onSelect(selected)}
          disabled={!selected}
          style={{
            width: '100%', padding: '16px', borderRadius: 14, border: 'none',
            background: selected ? '#0c1037' : '#e2e5f0',
            color: selected ? GOLD : '#94a3b8',
            fontSize: 15, fontWeight: 800,
            cursor: selected ? 'pointer' : 'default',
            fontFamily: FONT_B,
            boxShadow: selected ? '0 8px 28px rgba(12,16,55,0.25)' : 'none',
            transition: 'all 0.2s ease',
          }}
        >
          {selected ? `Start ${selected.name} ${selected.stage} →` : 'Select a subject above'}
        </button>
      </div>
    </div>
  )
}