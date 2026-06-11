const SUBJECTS = [
  { name: 'Chemistry', stage: 'Stage 2', icon: '⚗️', color: '#f1be43', accent: '#f9d87a', q: 175 },
  { name: 'Biology', stage: 'Stage 2', icon: '🧬', color: '#10b981', accent: '#34d399', q: 143 },
  { name: 'Physics', stage: 'Stage 2', icon: '⚛️', color: '#f59e0b', accent: '#fbbf24', q: 128 },
  { name: 'Mathematics', stage: 'Stage 2', icon: '∫', color: '#6366f1', accent: '#818cf8', q: 210 },
  { name: 'English', stage: 'Stage 2', icon: '📖', color: '#ec4899', accent: '#f472b6', q: 96 },
  { name: 'Mathematics', stage: 'Year 10', icon: '🧮', color: '#8b5cf6', accent: '#a78bfa', q: 88 },
]

const TOPICS: Record<string, string[]> = {
  'Chemistry': ['Organic Chem', 'Equilibrium', 'Redox'],
  'Biology': ['Cell Biology', 'Genetics', 'Ecology'],
  'Physics': ['Mechanics', 'Electricity', 'Waves'],
  'Mathematics': ['Calculus', 'Statistics', 'Algebra'],
  'English': ['Text Analysis', 'Essay Writing', 'Context'],
}

export function VariantA() {
  const [selected, setSelected] = window.React.useState<number | null>(null)

  return (
    <div style={{
      minHeight: '100vh',
      background: '#060b1f',
      backgroundImage: `
        radial-gradient(ellipse 800px 500px at 70% -5%, rgba(241,190,67,0.10) 0%, transparent 65%),
        radial-gradient(ellipse 500px 400px at -5% 90%, rgba(99,102,241,0.10) 0%, transparent 60%),
        linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)
      `,
      backgroundSize: '100% 100%, 100% 100%, 40px 40px, 40px 40px',
      fontFamily: "'Inter', system-ui, sans-serif",
      padding: '48px 40px 120px',
      boxSizing: 'border-box' as const,
      color: '#f1f5f9',
    }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 44 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 18,
            background: 'rgba(241,190,67,0.12)', border: '1px solid rgba(241,190,67,0.25)',
            borderRadius: 99, padding: '5px 14px 5px 10px',
          }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#f1be43', boxShadow: '0 0 8px rgba(241,190,67,0.8)' }} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: '#f1be43' }}>CHOOSE YOUR SUBJECT</span>
          </div>
          <h1 style={{ fontSize: 40, fontWeight: 900, margin: '0 0 10px', letterSpacing: '-1px', lineHeight: 1.1 }}>
            Hey, Alex. <span style={{ color: '#f1be43' }}>Let's study.</span>
          </h1>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.45)', margin: 0, lineHeight: 1.6 }}>
            Your session adapts to exactly where you need the most work.
          </p>
        </div>

        {/* Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 32 }}>
          {SUBJECTS.map((s, i) => {
            const isSel = selected === i
            return (
              <div
                key={i}
                onClick={() => setSelected(i)}
                style={{
                  borderRadius: 20,
                  background: isSel
                    ? `linear-gradient(145deg, ${s.color}28 0%, ${s.color}0c 50%, rgba(15,20,50,0.95) 100%)`
                    : 'rgba(255,255,255,0.03)',
                  border: isSel ? `1.5px solid ${s.color}60` : '1px solid rgba(255,255,255,0.07)',
                  padding: '24px 22px 20px',
                  cursor: 'pointer',
                  transition: 'all 0.18s ease',
                  position: 'relative' as const,
                  overflow: 'hidden',
                  boxShadow: isSel ? `0 0 0 1px ${s.color}18, 0 16px 48px ${s.color}22` : '0 2px 12px rgba(0,0,0,0.3)',
                }}
              >
                {/* glow blob */}
                <div style={{
                  position: 'absolute', top: -30, right: -30, width: 160, height: 160,
                  borderRadius: '50%', pointerEvents: 'none',
                  background: `radial-gradient(circle, ${s.color}${isSel ? '28' : '12'} 0%, transparent 70%)`,
                  transition: 'opacity 0.2s',
                }} />

                {/* icon */}
                <div style={{
                  width: 52, height: 52, borderRadius: 14, marginBottom: 16,
                  background: `linear-gradient(135deg, ${s.color}38 0%, ${s.color}14 100%)`,
                  border: `1.5px solid ${s.color}50`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 26,
                  boxShadow: `0 4px 20px ${s.color}30`,
                }}>
                  {s.icon}
                </div>

                <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 3, color: '#fff' }}>{s.name}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: s.color, letterSpacing: '0.04em', marginBottom: 14 }}>{s.stage}</div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 16 }}>
                  {(TOPICS[s.name] || []).map(t => (
                    <span key={t} style={{
                      fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 99,
                      background: `${s.color}14`, border: `1px solid ${s.color}30`, color: s.color,
                    }}>{t}</span>
                  ))}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{s.q} questions</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 5px rgba(52,211,153,0.7)' }} />
                    <span style={{ fontSize: 10, color: '#34d399', fontWeight: 600 }}>Ready</span>
                  </div>
                </div>

                {isSel && (
                  <div style={{
                    position: 'absolute', top: 14, right: 14, width: 22, height: 22,
                    borderRadius: '50%', background: `linear-gradient(135deg, ${s.color}, ${s.accent})`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, color: '#0c1037', fontWeight: 900,
                    boxShadow: `0 2px 10px ${s.color}60`,
                  }}>✓</div>
                )}
              </div>
            )
          })}
        </div>

        {/* CTA */}
        <div style={{ position: 'sticky', bottom: 0, paddingTop: 20, background: 'linear-gradient(to top, #060b1f 60%, transparent)' }}>
          <button style={{
            width: '100%', padding: '16px',
            borderRadius: 14, border: 'none',
            background: selected !== null
              ? `linear-gradient(135deg, ${SUBJECTS[selected].color}, ${SUBJECTS[selected].accent})`
              : 'rgba(255,255,255,0.05)',
            color: selected !== null ? '#0c1037' : 'rgba(255,255,255,0.25)',
            fontSize: 15, fontWeight: 800, cursor: selected !== null ? 'pointer' : 'default',
            fontFamily: 'inherit',
            boxShadow: selected !== null ? `0 8px 32px ${SUBJECTS[selected!].color}50` : 'none',
            transition: 'all 0.2s ease',
          }}>
            {selected !== null ? `Start ${SUBJECTS[selected].name} · ${SUBJECTS[selected].stage} →` : 'Select a subject above'}
          </button>
        </div>
      </div>
    </div>
  )
}
