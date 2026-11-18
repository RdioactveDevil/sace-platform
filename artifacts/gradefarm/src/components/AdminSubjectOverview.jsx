import { ui, FONT_B } from '../lib/adminUi'
import { topicCounts, subjectNeeds } from '../lib/subjectHealth'

const TONES = { red: 'var(--t-danger)', amber: 'var(--t-goldText)', grey: 'var(--t-textFaint)' }

/**
 * A subject at a glance: questions by topic (thin topics in amber) and what
 * needs fixing, each linking to the page that fixes it.
 */
export default function AdminSubjectOverview({ health, topics, features, examContext, onSection }) {
  if (!health) return <div style={{ ...ui.hint, padding: 8 }}>Loading…</div>
  const counted = topicCounts(topics, health.rows)
  const max = Math.max(1, ...counted.map(t => t.count))
  const needs = subjectNeeds({ topics, rows: health.rows, openReports: health.openReports, drafts: health.drafts, papers: health.papers, features, examContext })
  const urgent = needs.filter(n => n.tone !== 'grey')

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, alignItems: 'start', fontFamily: FONT_B }}>
      <section style={{ ...ui.card, padding: '16px 18px' }} aria-labelledby="ov-topics">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
          <h3 id="ov-topics" style={{ margin: 0, ...ui.heading }}>Questions by topic</h3>
          <button type="button" onClick={() => onSection('questions')} style={linkBtn}>{health.rows.length.toLocaleString('en-AU')} questions →</button>
        </div>
        {counted.length === 0 ? <div style={ui.hint}>No topics yet. Add them in Topics.</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {counted.map(t => (
              <div key={t.name} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr) 40px', gap: 10, alignItems: 'center', fontSize: 12.5, color: 'var(--t-textSub)' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.name}>{t.name}</span>
                <span style={{ height: 8, borderRadius: 99, background: 'var(--t-bgHover)', overflow: 'hidden' }}>
                  <span style={{ display: 'block', height: '100%', width: `${Math.max(2, Math.round((t.count / max) * 100))}%`, borderRadius: 99, background: t.thin ? 'var(--t-accent)' : 'var(--t-blue)' }} />
                </span>
                <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: t.thin ? 'var(--t-goldText)' : 'var(--t-textSub)', fontWeight: t.thin ? 700 : 500 }}>{t.count}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ ...ui.card, padding: '16px 18px' }} aria-labelledby="ov-needs">
        <h3 id="ov-needs" style={{ margin: '0 0 6px', ...ui.heading }}>Needs you</h3>
        {urgent.length === 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', fontSize: 13.5, color: 'var(--t-textSub)', borderBottom: needs.length ? '1px solid var(--t-border)' : 'none' }}>
            <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--t-success)', flexShrink: 0 }} />
            Nothing urgent. Reports and the review queue are clear.
          </div>
        )}
        {needs.map((n, i) => (
          <div key={n.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', fontSize: 13.5, color: n.tone === 'grey' ? 'var(--t-textMuted)' : 'var(--t-textSub)', borderBottom: i < needs.length - 1 ? '1px solid var(--t-border)' : 'none' }}>
            <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', background: TONES[n.tone], flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}>{n.text}</span>
            <button type="button" onClick={() => onSection(n.section)} style={linkBtn}>{n.action} →</button>
          </div>
        ))}
      </section>
    </div>
  )
}

const linkBtn = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: FONT_B, fontSize: 12.5, fontWeight: 700, color: 'var(--t-goldText)', whiteSpace: 'nowrap' }
