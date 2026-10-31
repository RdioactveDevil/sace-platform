import { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { ChartColumn } from 'lucide-react'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const GOLD   = '#f1be43'
const BG     = 'var(--t-bgInput)'

export default function AdminCohortTab() {
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [rows, setRows]         = useState([])
  const [sortKey, setSortKey]   = useState('errorRate')
  const [sortAsc, setSortAsc]   = useState(false)
  const [subjectFilter, setSubjectFilter] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
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
      setRows(fetched || [])
    } catch (err) {
      setError(err.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

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
    color: sortKey === key ? GOLD : 'rgba(var(--ink-rgb),0.45)',
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap',
  })

  const cellStyle = (align = 'right') => ({
    padding: '10px 14px',
    fontSize: 13,
    color: 'var(--t-textSub)',
    textAlign: align,
    borderBottom: '1px solid rgba(var(--ink-rgb),0.06)',
  })

  if (loading) return (
    <div style={{ color: 'rgba(var(--ink-rgb),0.4)', fontFamily: FONT_B, padding: 40, textAlign: 'center' }}>
      Loading cohort data…
    </div>
  )

  if (error) return (
    <div style={{ fontFamily: FONT_B }}>
      <div style={{
        padding: '20px 22px', borderRadius: 14,
        background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.28)',
        display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start',
      }}>
        <div style={{ color: 'var(--t-danger)', fontSize: 14, fontWeight: 700 }}>Couldn't load cohort analytics</div>
        <div style={{ color: 'rgba(var(--ink-rgb),0.55)', fontSize: 13 }}>{error}</div>
        <button
          onClick={load}
          style={{ padding: '8px 18px', borderRadius: 9, border: 'none', background: GOLD, color: '#0c1037', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B }}
        >
          Retry
        </button>
      </div>
    </div>
  )

  if (rows.length === 0) return (
    <div style={{ fontFamily: FONT_B }}>
      <div style={{
        textAlign: 'center', padding: '64px 24px',
        border: '1px dashed rgba(var(--ink-rgb),0.1)', borderRadius: 14, color: 'var(--t-textMuted)',
      }}>
        <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center', color: 'var(--t-goldText)' }}><ChartColumn size={30} aria-hidden="true" /></div>
        <div style={{ fontSize: 15, color: 'var(--t-textSub)', fontWeight: 700, marginBottom: 6 }}>No answer data yet</div>
        <div style={{ fontSize: 13, maxWidth: 420, margin: '0 auto', lineHeight: 1.6 }}>
          Once students start answering questions, class-wide topic performance and error rates will appear here.
        </div>
      </div>
    </div>
  )

  const totalAttempts = rows.reduce((s, r) => s + r.attempts, 0)
  const totalWrong    = rows.reduce((s, r) => s + r.wrong, 0)
  const overallAccuracy = totalAttempts > 0 ? Math.round(((totalAttempts - totalWrong) / totalAttempts) * 100) : 0

  return (
    <div style={{ fontFamily: FONT_B }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, color: 'rgba(var(--ink-rgb),0.45)' }}>
          Class-wide topic performance · {totalAttempts.toLocaleString()} total answers · {overallAccuracy}% overall accuracy
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Answers', val: totalAttempts.toLocaleString() },
          { label: 'Overall Accuracy', val: `${overallAccuracy}%` },
          { label: 'Topics Tracked', val: rows.length },
        ].map(s => (
          <div key={s.label} style={{ padding: '14px 20px', borderRadius: 12, background: 'rgba(var(--ink-rgb),0.04)', border: '1px solid rgba(var(--ink-rgb),0.08)' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t-goldText)' }}>{s.val}</div>
            <div style={{ fontSize: 11, color: 'rgba(var(--ink-rgb),0.4)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {subjects.map(s => (
          <button
            key={s}
            onClick={() => setSubjectFilter(s)}
            style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${subjectFilter === s ? GOLD : 'rgba(var(--ink-rgb),0.12)'}`, background: subjectFilter === s ? 'rgba(241,190,67,0.1)' : 'transparent', color: subjectFilter === s ? GOLD : 'rgba(var(--ink-rgb),0.5)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}
          >
            {s === 'all' ? 'All subjects' : s}
          </button>
        ))}
      </div>

      <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(var(--ink-rgb),0.08)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'rgba(var(--ink-rgb),0.04)' }}>
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
                <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(var(--ink-rgb),0.02)' }}>
                  <td style={{ ...cellStyle('left'), color: 'rgba(var(--ink-rgb),0.5)', fontSize: 11 }}>{r.subject}</td>
                  <td style={{ ...cellStyle('left'), fontWeight: 700, color: 'var(--t-text)' }}>{r.topic}</td>
                  <td style={cellStyle()}>{r.attempts.toLocaleString()}</td>
                  <td style={{ ...cellStyle(), color: r.wrong > 0 ? '#f87171' : 'rgba(var(--ink-rgb),0.4)' }}>{r.wrong.toLocaleString()}</td>
                  <td style={{ ...cellStyle(), fontWeight: 700, color: barColor }}>{pct}%</td>
                  <td style={cellStyle()}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                      <div style={{ width: 72, height: 5, borderRadius: 3, background: 'rgba(var(--ink-rgb),0.08)', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 3 }} />
                      </div>
                    </div>
                  </td>
                </tr>
              )
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'rgba(var(--ink-rgb),0.3)', fontSize: 13 }}>
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
