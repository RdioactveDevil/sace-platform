import { useState } from 'react'
import { THEMES } from '../lib/theme'

const SUBJECTS = [
  {
    id: 'chemistry_s1',
    name: 'Chemistry',
    stage: 'Stage 1',
    icon: '⚗️',
    color: '#f1be43',
    topics: ['Atomic Structure', 'Ionic Bonding', 'Quantities', 'Periodic Table', 'Solutions'],
    questionCount: 50,
    available: true,
  },
  {
    id: 'chemistry_s2',
    name: 'Chemistry',
    stage: 'Stage 2',
    icon: '⚗️',
    color: '#f9d87a',
    topics: ['Organic Chemistry', 'Redox', 'Equilibrium', 'Acid/Base', 'Electrochemistry'],
    questionCount: 15,
    available: true,
  },
  {
    id: 'maths_methods_s2',
    name: 'Mathematical Methods',
    stage: 'Stage 2',
    icon: '∫',
    color: '#6366f1',
    topics: ['Differentiation', 'Integration', 'Functions', 'Probability', 'Statistics'],
    questionCount: 0,
    available: false,
    comingSoon: true,
  },
  {
    id: 'physics_s2',
    name: 'Physics',
    stage: 'Stage 2',
    icon: '⚛️',
    color: '#f59e0b',
    topics: ['Motion', 'Forces', 'Electricity', 'Waves', 'Modern Physics'],
    questionCount: 0,
    available: false,
    comingSoon: true,
  },
  {
    id: 'biology_s2',
    name: 'Biology',
    stage: 'Stage 2',
    icon: '🧬',
    color: '#10b981',
    topics: ['Cells', 'DNA', 'Evolution', 'Ecosystems', 'Human Biology'],
    questionCount: 0,
    available: false,
    comingSoon: true,
  },
  {
    id: 'english_s2',
    name: 'English Literary Studies',
    stage: 'Stage 2',
    icon: '📖',
    color: '#ec4899',
    topics: ['Close Analysis', 'Essay Writing', 'Comparative Study', 'Creative Response'],
    questionCount: 0,
    available: false,
    comingSoon: true,
  },
]

export default function SubjectPicker({ profile, onSelect, theme }) {
  const [selected, setSelected] = useState(null)
  const [hovering, setHovering] = useState(null)
  const t = THEMES[theme]

  const available = SUBJECTS.filter(s => s.available)
  const coming    = SUBJECTS.filter(s => !s.available)

  return (
    <div style={{
      minHeight: '100vh', background: '#0c1037', color: t.text,
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'flex-start', padding: '40px 20px 60px',
    }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:0.6} }
      `}</style>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 40, animation: 'fadeUp 0.4s ease' }}>
        <div style={{
          width: 52, height: 52, borderRadius: 14,
          background: `linear-gradient(135deg,#f1be43,#f9d87a)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24, margin: '0 auto 16px',
          boxShadow: `0 8px 24px ${t.accent}40`,
        }}>⚗️</div>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 8px', color: t.text }}>
          Welcome back, {profile.display_name.split(' ')[0]}
        </h1>
        <p style={{ fontSize: 15, color: t.textMuted, margin: 0 }}>
          Choose a subject to practise
        </p>
      </div>

      {/* Available subjects */}
      <div style={{ width: '100%', maxWidth: 680, animation: 'fadeUp 0.5s ease' }}>
        <div style={{ fontSize: 11, color: t.textMuted, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>
          Available Now
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12, marginBottom: 32 }}>
          {available.map(subj => {
            const isSelected = selected?.id === subj.id
            const isHovered  = hovering === subj.id
            return (
              <div
                key={subj.id}
                onClick={() => setSelected(subj)}
                onMouseEnter={() => setHovering(subj.id)}
                onMouseLeave={() => setHovering(null)}
                style={{
                  background: isSelected
                    ? theme === 'dark' ? `rgba(${hexToRgb(subj.color)},0.12)` : `rgba(${hexToRgb(subj.color)},0.08)`
                    : isHovered
                      ? t.bgHover
                      : t.bgCard,
                  border: `2px solid ${isSelected ? subj.color : t.border}`,
                  borderRadius: 14, padding: '20px',
                  cursor: 'pointer', transition: 'all 0.15s ease',
                  boxShadow: isSelected ? `0 4px 20px ${subj.color}30` : theme === 'light' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 42, height: 42, borderRadius: 11,
                      background: `${subj.color}22`,
                      border: `1px solid ${subj.color}44`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 20,
                    }}>{subj.icon}</div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: t.text }}>{subj.name}</div>
                      <div style={{ fontSize: 11, color: subj.color, fontWeight: 700, marginTop: 1 }}>{subj.stage}</div>
                    </div>
                  </div>
                  {isSelected && (
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: subj.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#fff', flexShrink: 0 }}>✓</div>
                  )}
                </div>

                {/* Topics */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
                  {subj.topics.slice(0, 4).map(topic => (
                    <span key={topic} style={{
                      fontSize: 11, padding: '3px 8px', borderRadius: 6,
                      background: theme === 'dark' ? '#0c1525' : t.bgSubtle,
                      border: `1px solid ${t.border}`, color: t.textMuted,
                    }}>{topic}</span>
                  ))}
                  {subj.topics.length > 4 && (
                    <span style={{ fontSize: 11, color: t.textFaint }}>+{subj.topics.length - 4} more</span>
                  )}
                </div>

                {/* Footer */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: t.textMuted }}>
                    {subj.questionCount} questions
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: t.success }} />
                    <span style={{ fontSize: 11, color: t.success, fontWeight: 600 }}>Ready</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Coming soon */}
        <div style={{ fontSize: 11, color: t.textMuted, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>
          Coming Soon
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10, marginBottom: 36, opacity: 0.6 }}>
          {coming.map(subj => (
            <div key={subj.id} style={{
              background: t.bgCard, border: `1px solid ${t.border}`,
              borderRadius: 14, padding: '16px 20px',
              display: 'flex', alignItems: 'center', gap: 14,
              boxShadow: theme === 'light' ? '0 1px 4px rgba(0,0,0,0.04)' : 'none',
            }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: `${subj.color}15`, border: `1px solid ${subj.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{subj.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: t.textSub }}>{subj.name}</div>
                <div style={{ fontSize: 11, color: t.textMuted }}>{subj.stage}</div>
              </div>
              <span style={{ fontSize: 10, background: theme === 'dark' ? '#1e293b' : t.bgSubtle, color: t.textMuted, padding: '3px 8px', borderRadius: 6, border: `1px solid ${t.border}`, fontWeight: 600 }}>SOON</span>
            </div>
          ))}
        </div>

        {/* Continue button */}
        <button
          onClick={() => selected && onSelect(selected)}
          disabled={!selected}
          style={{
            width: '100%', padding: '16px', borderRadius: 14, border: 'none',
            background: selected
              ? `linear-gradient(135deg, ${selected.color}, ${t.accentBlue})`
              : t.border,
            color: selected ? '#fff' : t.textFaint,
            fontSize: 15, fontWeight: 800, cursor: selected ? 'pointer' : 'default',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            boxShadow: selected ? `0 8px 28px ${selected.color}40` : 'none',
            transition: 'all 0.2s ease',
          }}
        >
          {selected ? `Start ${selected.name} ${selected.stage} →` : 'Select a subject above'}
        </button>
      </div>
    </div>
  )
}

// Helper to convert hex to rgb for rgba()
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16)
  const g = parseInt(hex.slice(3,5),16)
  const b = parseInt(hex.slice(5,7),16)
  return `${r},${g},${b}`
}