import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const GOLD   = '#f1be43'
const BG     = '#080d28'

export default function AdminCohortTab() {
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [rows, setRows]         = useState([])
  const [sortKey, setSortKey]   = useState('errorRate')
  const [sortAsc, setSortAsc]   = useState(false)
  const [subjectFilter, setSubjectFilter] = useState('all')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) throw new Error('Not authenticated')
        const res = await fetch('/api/admin/cohort-stats', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `HTTP ${res.status}`)
        }
        const { rows: fetched } = await res.json()
        if (!cancelled) {
          setRows(fetched || [])
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) { setError(err.message || 'Failed to load'); setLoading(false) }
      }
    })()
    return () => { cancelled = true }
  }, [])

  const subjects = useMemo(() => ['all', ...new Set(rows.map(r => r.subject).filter(Boolean))], [rows])

  const sorted = useMemo(() => {
    const filtered = subjectFilter === 'all' ? rows : rows.filter(r => r.subject === subjectFilter)
    return [...filtered].sort((a, b) => {
      const diff = (a[sortKey] ?? 0) < (b[sortKey] ?? 0) ? -1 : (a[sortKey] ?? 0) > (b[sortKey] ?? 0) ? 1 : 0
      return sortAsc ? diff : -diff
    })
  }, [rows, sortKey, sortAsc, subjectFilter])

  const toggleSort = (key) => {
    if (sortKey === key) setSortAsc(v => !v)
    else { setSortKey(key); setSortAsc(false) }
  }

  const chevron = (key) => sortKey !== key ? '' : sortAsc ? ' ▲' : ' ▼'

  const colStyle = (key) => ({
    padding: '10px 14px',
    textAlign: key === 'topic' || key === 'subject' ? 'left' : 'right',
    fontSize: 12,
    fontWeight: 700,
    color: sortKey === key ? GOLD : 'rgba(255,255,255,0.45)',
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap',
  })

  const cellStyle = (align = 'right') => ({
    padding: '10px 14px',
    fontSize: 13,
    color: '#e2e8f0',
    textAlign: align,
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  })

  if (loading) return (
    <div style={{ color: 'rgba(255,255,255,0.4)', fontFamily: FONT_B, padding: 40, textAlign: 'center' }}>
      Loading cohort data…
    </div>
  )

  if (error) return (
    <div style={{ color: '#f87171', fontFamily: FONT_B, padding: 40 }}>Error: {error}</div>
  )

  const totalAttempts = rows.reduce((s, r) => s + r.attempts, 0)
  const totalWrong    = rows.reduce((s, r) => s + r.wrong, 0)
  const overallAccuracy = totalAttempts > 0 ? Math.round(((totalAttempts - totalWrong) / totalAttempts) * 100) : 0

  return (
    <div style={{ fontFamily: FONT_B }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 6 }}>Cohort Analytics</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>
          Class-wide topic performance · {totalAttempts.toLocaleString()} total answers · {overallAccuracy}% overall accuracy
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Answers', val: totalAttempts.toLocaleString() },
          { label: 'Overall Accuracy', val: `${overallAccuracy}%` },
          { label: 'Topics Tracked', val: rows.length },
        ].map(s => (
          <div key={s.label} style={{ padding: '14px 20px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: GOLD }}>{s.val}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {subjects.map(s => (
          <button
            key={s}
            onClick={() => setSubjectFilter(s)}
            style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${subjectFilter === s ? GOLD : 'rgba(255,255,255,0.12)'}`, background: subjectFilter === s ? 'rgba(241,190,67,0.1)' : 'transparent', color: subjectFilter === s ? GOLD : 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}
          >
            {s === 'all' ? 'All subjects' : s}
          </button>
        ))}
      </div>

      <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
              <th style={colStyle('subject')} onClick={() => toggleSort('subject')}>Subject{chevron('subject')}</th>
              <th style={colStyle('topic')} onClick={() => toggleSort('topic')}>Topic{chevron('topic')}</th>
              <th style={colStyle('attempts')} onClick={() => toggleSort('attempts')}>Attempts{chevron('attempts')}</th>
              <th style={colStyle('wrong')} onClick={() => toggleSort('wrong')}>Wrong{chevron('wrong')}</th>
              <th style={colStyle('errorRate')} onClick={() => toggleSort('errorRate')}>Error Rate{chevron('errorRate')}</th>
              <th style={{ ...colStyle('errorRate'), cursor: 'default' }}>Health</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const pct = Math.round(r.errorRate * 100)
              const barColor = pct >= 50 ? '#f87171' : pct >= 25 ? GOLD : '#4ade80'
              return (
                <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                  <td style={{ ...cellStyle('left'), color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>{r.subject}</td>
                  <td style={{ ...cellStyle('left'), fontWeight: 700, color: '#f1f5f9' }}>{r.topic}</td>
                  <td style={cellStyle()}>{r.attempts.toLocaleString()}</td>
                  <td style={{ ...cellStyle(), color: r.wrong > 0 ? '#f87171' : 'rgba(255,255,255,0.4)' }}>{r.wrong.toLocaleString()}</td>
                  <td style={{ ...cellStyle(), fontWeight: 700, color: barColor }}>{pct}%</td>
                  <td style={cellStyle()}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                      <div style={{ width: 72, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 3 }} />
                      </div>
                    </div>
                  </td>
                </tr>
              )
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
                  No data yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
