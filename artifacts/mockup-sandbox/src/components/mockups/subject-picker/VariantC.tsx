import { useState } from 'react'

const GOLD = '#f1be43'
const GOLDL = '#f9d87a'

const SUBJECTS = [
  { name: 'Chemistry', stage: 'Stage 2', icon: '⚗️', from: '#c97c00', to: '#f1be43', bg: 'linear-gradient(145deg,#2a1800,#1a1000)', q: 175, topics: ['Organic Chem','Equilibrium','Redox Reactions','Acid-Base'] },
  { name: 'Biology', stage: 'Stage 2', icon: '🧬', from: '#065f46', to: '#10b981', bg: 'linear-gradient(145deg,#001a10,#001208)', q: 143, topics: ['Cell Biology','Genetics','Ecology','Evolution'] },
  { name: 'Physics', stage: 'Stage 2', icon: '⚛️', from: '#92400e', to: '#f59e0b', bg: 'linear-gradient(145deg,#1e1000,#130a00)', q: 128, topics: ['Mechanics','Electricity','Waves','Modern Physics'] },
  { name: 'Mathematics', stage: 'Stage 2', icon: '∫', from: '#3730a3', to: '#6366f1', bg: 'linear-gradient(145deg,#0e0d2a,#080718)', q: 210, topics: ['Calculus','Statistics','Complex Numbers','Matrices'] },
  { name: 'English', stage: 'Stage 2', icon: '📖', from: '#9d174d', to: '#ec4899', bg: 'linear-gradient(145deg,#20051a,#130310)', q: 96, topics: ['Text Analysis','Essay Writing','Context','Intertextuality'] },
  { name: 'Mathematics', stage: 'Year 10', icon: '🧮', from: '#5b21b6', to: '#8b5cf6', bg: 'linear-gradient(145deg,#100a2a,#0a0618)', q: 88, topics: ['Algebra','Trigonometry','Statistics','Geometry'] },
]

export function VariantC() {
  const [selected, setSelected] = useState(0)
  const subj = SUBJECTS[selected]

  return (
    <div style={{
      minHeight: '100vh',
      background: '#06071a',
      fontFamily: "'Inter', system-ui, sans-serif",
      display: 'flex', flexDirection: 'column',
      color: '#f1f5f9',
      boxSizing: 'border-box' as const,
    }}>

      {/* Featured hero card */}
      <div style={{
        flex: '0 0 auto',
        margin: '32px 32px 0',
        borderRadius: 24,
        background: subj.bg,
        border: `1.5px solid ${subj.to}40`,
        padding: '36px 40px',
        position: 'relative' as const,
        overflow: 'hidden',
        minHeight: 280,
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        transition: 'background 0.35s ease, border-color 0.35s ease',
        boxShadow: `0 24px 80px ${subj.to}18, inset 0 1px 0 rgba(255,255,255,0.06)`,
      }}>
        {/* radial glow */}
        <div style={{
          position: 'absolute', bottom: -60, right: -60, width: 320, height: 320,
          borderRadius: '50%', pointerEvents: 'none',
          background: `radial-gradient(circle, ${subj.to}30 0%, transparent 65%)`,
          transition: 'background 0.35s',
        }} />

        {/* top row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', position: 'relative' as const }}>
          <div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 16,
              background: `${subj.to}20`, border: `1px solid ${subj.to}40`,
              borderRadius: 99, padding: '4px 12px',
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: subj.to, boxShadow: `0 0 8px ${subj.to}` }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: subj.to, letterSpacing: '0.08em' }}>SELECTED</span>
            </div>
            <div style={{ fontSize: 34, fontWeight: 900, color: '#fff', marginBottom: 4, letterSpacing: '-0.5px' }}>{subj.name}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: subj.to, letterSpacing: '0.04em' }}>{subj.stage}</div>
          </div>
          <div style={{
            width: 68, height: 68, borderRadius: 18, flexShrink: 0,
            background: `linear-gradient(135deg, ${subj.to}35, ${subj.to}15)`,
            border: `1.5px solid ${subj.to}55`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 32,
            boxShadow: `0 8px 28px ${subj.to}35`,
          }}>
            {subj.icon}
          </div>
        </div>

        {/* topics */}
        <div style={{ position: 'relative' as const }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 24 }}>
            {subj.topics.map(t => (
              <span key={t} style={{
                fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 99,
                background: `${subj.to}16`, border: `1px solid ${subj.to}30`, color: subj.to,
              }}>{t}</span>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 7px rgba(52,211,153,0.8)' }} />
              <span style={{ fontSize: 12, color: '#34d399', fontWeight: 600 }}>{subj.q} questions ready</span>
            </div>
            <button style={{
              padding: '11px 28px', borderRadius: 12, border: 'none',
              background: `linear-gradient(135deg, ${subj.from}, ${subj.to})`,
              color: '#fff', fontSize: 14, fontWeight: 800,
              cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: `0 6px 24px ${subj.to}45`,
              letterSpacing: '0.01em',
              filter: 'brightness(1.15)',
            }}>
              Start Session →
            </button>
          </div>
        </div>
      </div>

      {/* Subject row */}
      <div style={{ padding: '20px 32px 32px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.28)', marginBottom: 12 }}>
          YOUR SUBJECTS
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
          {SUBJECTS.map((s, i) => {
            const isSel = selected === i
            return (
              <div
                key={i}
                onClick={() => setSelected(i)}
                style={{
                  borderRadius: 14, padding: '14px 12px',
                  background: isSel ? `${s.to}18` : 'rgba(255,255,255,0.03)',
                  border: isSel ? `1.5px solid ${s.to}50` : '1px solid rgba(255,255,255,0.07)',
                  cursor: 'pointer', textAlign: 'center' as const,
                  transition: 'all 0.15s ease',
                  boxShadow: isSel ? `0 4px 20px ${s.to}25` : 'none',
                }}
              >
                <div style={{
                  fontSize: 22, marginBottom: 8,
                  filter: isSel ? 'none' : 'grayscale(60%) opacity(0.65)',
                  transition: 'filter 0.2s',
                }}>{s.icon}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: isSel ? '#fff' : 'rgba(255,255,255,0.5)', lineHeight: 1.3 }}>{s.name}</div>
                <div style={{ fontSize: 9, color: isSel ? s.to : 'rgba(255,255,255,0.28)', marginTop: 2, fontWeight: 600 }}>{s.stage}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
