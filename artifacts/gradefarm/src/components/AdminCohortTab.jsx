import { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { ui, btn, note, accuracyColor, FONT_B } from '../lib/adminUi'

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

  const sortHead = (key, label, right = true) => (
    <th aria-sort={sortKey === key ? (sortAsc ? 'ascending' : 'descending') : undefined} style={{ ...ui.th, textAlign: right ? 'right' : 'left' }}>
      <button type="button" onClick={() => toggleSort(key)}
        style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', fontWeight: 700, color: sortKey === key ? 'var(--t-text)' : 'var(--t-textMuted)', cursor: 'pointer' }}>
        {label}{sortKey === key ? (sortAsc ? ' ↑' : ' ↓') : ''}
      </button>
    </th>
  )

  if (loading) return <div style={{ color: 'var(--t-textMuted)', fontFamily: FONT_B, fontSize: 13, padding: '24px 0' }}>Loading…</div>
  if (error) return (
    <div style={{ fontFamily: FONT_B, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
      <div role="alert" style={note('danger')}>Couldn’t load topic results: {error}</div>
      <button type="button" onClick={load} style={btn('secondary')}>Try again</button>
    </div>
  )
  if (rows.length === 0) return (
    <div style={{ ...ui.empty, fontFamily: FONT_B }}>
      No answers yet. Once students answer questions, how they do on each topic shows up here.
    </div>
  )

  const shown = subjectFilter === 'all' ? rows : rows.filter(r => r.subject === subjectFilter)
  const totalAttempts = shown.reduce((s, r) => s + r.attempts, 0)
  const totalWrong    = shown.reduce((s, r) => s + r.wrong, 0)
  const overall = totalAttempts > 0 ? Math.round(((totalAttempts - totalWrong) / totalAttempts) * 100) : null
  const weak = shown.filter(r => r.attempts >= 10 && r.errorRate >= 0.5).length

  const fact = (value, label) => (
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t-text)', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 12.5, color: 'var(--t-textMuted)' }}>{label}</div>
    </div>
  )

  return (
    <div style={{ fontFamily: FONT_B, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
        {fact(totalAttempts.toLocaleString(), 'answers')}
        {fact(overall == null ? '—' : `${overall}%`, 'correct overall')}
        {fact(shown.length, `topic${shown.length === 1 ? '' : 's'} answered`)}
        {fact(weak, 'under 50% correct (10+ answers)')}
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <select aria-label="Subject" value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)} style={{ ...ui.input, color: subjectFilter === 'all' ? 'var(--t-textMuted)' : 'var(--t-text)' }}>
          {subjects.map(s => <option key={s} value={s}>{s === 'all' ? 'All subjects' : s}</option>)}
        </select>
        <span style={ui.hint}>Every answer students have given, by topic.</span>
      </div>

      <div style={{ ...ui.card, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
          <thead>
            <tr>
              {sortHead('topic', 'Topic', false)}
              {subjectFilter === 'all' && sortHead('subject', 'Subject', false)}
              {sortHead('attempts', 'Answers')}
              {sortHead('wrong', 'Wrong')}
              {sortHead('errorRate', 'Correct')}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const correct = Math.round((1 - r.errorRate) * 100)
              return (
                <tr key={i}>
                  <td style={{ ...ui.td, fontWeight: 700, color: 'var(--t-text)' }}>{r.topic}</td>
                  {subjectFilter === 'all' && <td style={{ ...ui.td, color: 'var(--t-textMuted)' }}>{r.subject}</td>}
                  <td style={{ ...ui.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.attempts.toLocaleString()}</td>
                  <td style={{ ...ui.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.wrong.toLocaleString()}</td>
                  <td style={{ ...ui.td, textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                      <div style={{ width: 72, height: 5, borderRadius: 3, background: 'var(--t-bgSubtle)', overflow: 'hidden' }}>
                        <div style={{ width: `${correct}%`, height: '100%', background: accuracyColor(correct) }} />
                      </div>
                      <span style={{ width: 38, fontWeight: 700, color: accuracyColor(correct), fontVariantNumeric: 'tabular-nums' }}>{correct}%</span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
