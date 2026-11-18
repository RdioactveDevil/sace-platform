import { useNavigate } from 'react-router-dom'

const FONT_B = "'Plus Jakarta Sans', sans-serif"

/**
 * The Privacy Policy and Terms of Service: a plain reading page in the app's
 * own light or dark theme. The wordmark keeps its own font; the rest is the
 * app's body font.
 *
 * sections: [{ title, body }]; other: { label, path } for the other legal page.
 */
export default function LegalPage({ title, updated, sections, other, preLine = false }) {
  const navigate = useNavigate()
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate('/home'))
  return (
    <div className="lg-page" style={{ minHeight: '100vh', background: 'var(--t-bg)', color: 'var(--t-text)', fontFamily: FONT_B }}>
      <style>{`
        @font-face { font-family: 'Sifonn Pro'; src: url('/SIFONN_PRO.otf') format('opentype'); font-display: swap; }
        .lg-page button { font-family: inherit; cursor: pointer; }
        .lg-page button:focus-visible { outline: 2px solid var(--t-accent); outline-offset: 2px; }
        .lg-link:hover { color: var(--t-text) !important; }
        @media (max-width: 640px) { .lg-body { padding: 28px 18px 56px !important; } .lg-bar { padding: 12px 18px !important; } }
      `}</style>

      <div className="lg-bar" style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--t-bg)', borderBottom: '1px solid var(--t-border)', padding: '14px 32px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <button type="button" className="lg-link" onClick={back}
          style={{ border: 'none', background: 'none', padding: 0, color: 'var(--t-textMuted)', fontSize: 14, fontWeight: 700 }}>
          ← Back
        </button>
        <span aria-hidden="true" style={{ width: 1, height: 16, background: 'var(--t-border)' }} />
        <span style={{ fontFamily: "'Sifonn Pro', sans-serif", fontSize: 15, letterSpacing: 0.5 }}>
          <span>grade</span><span style={{ color: 'var(--t-goldText)' }}>farm.</span>
        </span>
      </div>

      <main className="lg-body" style={{ maxWidth: 720, margin: '0 auto', padding: '44px 32px 72px' }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(26px, 4vw, 32px)', fontWeight: 800, letterSpacing: '-0.02em' }}>{title}</h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--t-textMuted)' }}>Last updated: {updated} · Titanium Tutoring</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 28, marginTop: 36 }}>
          {sections.map(s => (
            <section key={s.title}>
              <h2 style={{ margin: '0 0 8px', fontSize: 16.5, fontWeight: 800, letterSpacing: '-0.01em' }}>{s.title}</h2>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.75, color: 'var(--t-textSub)', whiteSpace: preLine ? 'pre-line' : undefined }}>{s.body}</p>
            </section>
          ))}
        </div>

        <div style={{ marginTop: 48, paddingTop: 22, borderTop: '1px solid var(--t-border)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => navigate(other.path)}
            style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--t-border)', background: 'var(--t-bgCard)', color: 'var(--t-text)', fontSize: 13.5, fontWeight: 800 }}>
            {other.label}
          </button>
          <button type="button" onClick={back}
            style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: 'var(--t-accent)', color: 'var(--t-onAccent)', fontSize: 13.5, fontWeight: 800 }}>
            Back to GradeFarm
          </button>
        </div>
      </main>
    </div>
  )
}
