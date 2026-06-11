import { useState } from 'react'

const SUBJECTS = [
  { name: 'Chemistry', stage: 'Stage 2', icon: '⚗️', color: '#f1be43', q: 175, desc: 'Organic reactions, equilibrium & electrochemistry' },
  { name: 'Biology', stage: 'Stage 2', icon: '🧬', color: '#10b981', q: 143, desc: 'Cell biology, genetics & ecosystem dynamics' },
  { name: 'Physics', stage: 'Stage 2', icon: '⚛️', color: '#f59e0b', q: 128, desc: 'Mechanics, electricity & modern physics' },
  { name: 'Mathematics', stage: 'Stage 2', icon: '∫', color: '#6366f1', q: 210, desc: 'Calculus, statistics & complex numbers' },
  { name: 'English', stage: 'Stage 2', icon: '📖', color: '#ec4899', q: 96, desc: 'Text analysis, essay craft & intertextuality' },
]

export function VariantB() {
  const [selected, setSelected] = useState<number | null>(null)
  const [hover, setHover] = useState<number | null>(null)

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f5f6fa',
      fontFamily: "'Inter', system-ui, sans-serif",
      padding: '52px 48px 120px',
      boxSizing: 'border-box' as const,
    }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 44 }}>
          <div style={{
            display: 'inline-block', marginBottom: 16,
            background: '#0c1037', borderRadius: 99, padding: '4px 12px',
          }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', color: '#f1be43' }}>gradefarm.</span>
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 900, margin: '0 0 8px', letterSpacing: '-0.8px', color: '#0c1037', lineHeight: 1.1 }}>
            What are you<br />studying today?
          </h1>
          <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>Pick a subject — we'll build your session from there.</p>
        </div>

        {/* List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
          {SUBJECTS.map((s, i) => {
            const isSel = selected === i
            const isHov = hover === i
            return (
              <div
                key={i}
                onClick={() => setSelected(i)}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 20,
                  padding: '20px 24px',
                  borderRadius: 16,
                  background: isSel ? '#0c1037' : isHov ? '#fff' : '#fff',
                  border: isSel ? `2px solid ${s.color}` : `2px solid ${isHov ? '#e2e5f0' : '#eef0f6'}`,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: isSel
                    ? `0 8px 32px rgba(12,16,55,0.2), 0 0 0 1px ${s.color}30`
                    : isHov ? '0 4px 20px rgba(0,0,0,0.08)' : '0 1px 4px rgba(0,0,0,0.04)',
                  transform: isHov && !isSel ? 'translateX(4px)' : 'none',
                }}
              >
                {/* icon pill */}
                <div style={{
                  width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                  background: isSel ? `${s.color}22` : `${s.color}14`,
                  border: `1.5px solid ${s.color}${isSel ? '60' : '30'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 24,
                  boxShadow: isSel ? `0 4px 16px ${s.color}40` : 'none',
                }}>
                  {s.icon}
                </div>

                {/* text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 3 }}>
                    <span style={{ fontSize: 16, fontWeight: 800, color: isSel ? '#fff' : '#0c1037' }}>{s.name}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                      padding: '2px 8px', borderRadius: 99,
                      background: isSel ? `${s.color}22` : `${s.color}14`,
                      color: isSel ? s.color : s.color,
                      border: `1px solid ${s.color}30`,
                    }}>{s.stage}</span>
                  </div>
                  <div style={{ fontSize: 13, color: isSel ? 'rgba(255,255,255,0.55)' : '#64748b', lineHeight: 1.4 }}>{s.desc}</div>
                </div>

                {/* right side */}
                <div style={{ flexShrink: 0, textAlign: 'right' as const }}>
                  {isSel ? (
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: `linear-gradient(135deg, ${s.color}, ${s.color}bb)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, color: '#0c1037', fontWeight: 900,
                      boxShadow: `0 2px 12px ${s.color}60`,
                    }}>✓</div>
                  ) : (
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#0c1037' }}>{s.q}</div>
                      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>Qs</div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* CTA */}
        <button style={{
          width: '100%', padding: '15px',
          borderRadius: 14, border: 'none',
          background: selected !== null ? '#0c1037' : '#e8eaf4',
          color: selected !== null ? '#f1be43' : '#94a3b8',
          fontSize: 15, fontWeight: 800,
          cursor: selected !== null ? 'pointer' : 'default',
          fontFamily: 'inherit',
          boxShadow: selected !== null ? '0 8px 28px rgba(12,16,55,0.25)' : 'none',
          transition: 'all 0.2s ease',
          letterSpacing: '0.01em',
        }}>
          {selected !== null ? `Start ${SUBJECTS[selected].name} →` : 'Select a subject above'}
        </button>
      </div>
    </div>
  )
}
