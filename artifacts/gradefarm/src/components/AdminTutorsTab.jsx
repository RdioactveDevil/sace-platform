import { useEffect, useState, useMemo } from 'react'
import { adminListTutors, adminGetTutor } from '../lib/db'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const GOLD   = '#f1be43'

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtRelative(iso) {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7)  return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return fmtDate(iso)
}

function statusColor(s) {
  if (s === 'completed') return '#4ade80'
  if (s === 'overdue')   return '#f87171'
  return GOLD
}

export default function AdminTutorsTab() {
  const [tutors, setTutors]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [search, setSearch]   = useState('')
  const [selected, setSelected] = useState(null)
  const [detail, setDetail]   = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailTab, setDetailTab] = useState('roster') // 'roster' | 'assignments'

  const load = async () => {
    setLoading(true); setError('')
    try { setTutors(await adminListTutors()) }
    catch (e) { setError(e.message) }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const openDetail = (tutor) => {
    setSelected(tutor)
    setDetail(null)
    setDetailTab('roster')
    setDetailLoading(true)
    adminGetTutor(tutor.id)
      .then(d => { setDetail(d); setDetailLoading(false) })
      .catch(e => { setError(e.message); setDetailLoading(false) })
  }
  const closeDetail = () => { setSelected(null); setDetail(null) }

  const filtered = useMemo(() => {
    if (!search.trim()) return tutors
    const q = search.toLowerCase()
    return tutors.filter(t =>
      (t.display_name || '').toLowerCase().includes(q) ||
      (t.email || '').toLowerCase().includes(q) ||
      (t.school || '').toLowerCase().includes(q)
    )
  }, [tutors, search])

  return (
    <div style={{ fontFamily: FONT_B, color: '#e2e8f0', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 18, color: GOLD }}>
          Tutors
          {!loading && <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8, fontWeight: 400 }}>({filtered.length}{search ? ` of ${tutors.length}` : ''})</span>}
        </h2>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name, email, or school…"
          style={inputStyle}
        />
      </div>

      {error && (
        <div style={errorBox}>{error}</div>
      )}

      {loading ? (
        <div style={{ color: '#64748b', fontSize: 13, padding: '24px 0' }}>Loading tutors…</div>
      ) : filtered.length === 0 ? (
        <div style={emptyBox}>{search ? 'No tutors match your search.' : 'No tutors found.'}</div>
      ) : (
        <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 880 }}>
            <thead style={{ background: 'rgba(255,255,255,0.03)', textAlign: 'left' }}>
              <tr>
                <th style={th}>Tutor</th>
                <th style={th}>Roster</th>
                <th style={th}>Total</th>
                <th style={th}>Completed</th>
                <th style={th}>Pending</th>
                <th style={th}>Overdue</th>
                <th style={th}>Last Active</th>
                <th style={th}>Last Assigned</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id}
                  onClick={() => openDetail(t)}
                  style={{
                    borderTop: '1px solid rgba(255,255,255,0.04)',
                    cursor: 'pointer',
                    background: selected?.id === t.id ? 'rgba(241,190,67,0.06)' : 'transparent',
                  }}
                  onMouseEnter={e => { if (selected?.id !== t.id) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = selected?.id === t.id ? 'rgba(241,190,67,0.06)' : 'transparent' }}
                >
                  <td style={td}>
                    <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: 13 }}>{t.display_name || '—'}</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{t.email || '—'}</div>
                    {t.school && <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>{t.school}</div>}
                  </td>
                  <td style={td}><span style={{ color: '#e2e8f0', fontWeight: 600 }}>{t.roster_size}</span></td>
                  <td style={td}><span style={{ color: '#e2e8f0', fontWeight: 600 }}>{t.assignments_total}</span></td>
                  <td style={td}><span style={{ color: '#4ade80', fontWeight: 600 }}>{t.assignments_completed}</span></td>
                  <td style={td}><span style={{ color: GOLD, fontWeight: 600 }}>{t.assignments_pending}</span></td>
                  <td style={td}><span style={{ color: t.assignments_overdue > 0 ? '#f87171' : '#475569', fontWeight: 600 }}>{t.assignments_overdue}</span></td>
                  <td style={{ ...td, color: '#94a3b8', whiteSpace: 'nowrap' }}>{fmtRelative(t.last_active)}</td>
                  <td style={{ ...td, color: '#94a3b8', whiteSpace: 'nowrap' }}>{fmtRelative(t.last_assignment_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <>
          <div onClick={closeDetail} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.45)' }} />
          <div style={panelStyle}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: '#f1f5f9' }}>{selected.display_name || 'Unnamed tutor'}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{selected.email}</div>
              </div>
              <button onClick={closeDetail} style={closeBtn}>×</button>
            </div>

            <div style={{ display: 'flex', gap: 4, padding: '10px 20px 0', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              {[['roster', `Roster${detail ? ` (${detail.roster.length})` : ''}`], ['assignments', `Assignments${detail ? ` (${detail.assignments.length})` : ''}`]].map(([key, label]) => (
                <button key={key} onClick={() => setDetailTab(key)}
                  style={{
                    padding: '8px 14px', borderRadius: '8px 8px 0 0',
                    fontSize: 12, fontWeight: 700, fontFamily: FONT_B, cursor: 'pointer',
                    color: detailTab === key ? GOLD : '#64748b',
                    background: detailTab === key ? 'rgba(241,190,67,0.08)' : 'transparent',
                    border: 'none', borderBottom: detailTab === key ? `2px solid ${GOLD}` : '2px solid transparent',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <div style={{ padding: 18, flex: 1, overflowY: 'auto' }}>
              {detailLoading ? (
                <div style={{ color: '#64748b', fontSize: 13 }}>Loading…</div>
              ) : !detail ? (
                <div style={{ color: '#64748b', fontSize: 13 }}>Could not load tutor details.</div>
              ) : detailTab === 'roster' ? (
                detail.roster.length === 0 ? (
                  <div style={emptyBox}>This tutor has no students on their roster yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {detail.roster.map(s => (
                      <div key={s.student_id} style={rosterRow}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>{s.display_name || '—'}</div>
                          {s.email && <div style={{ fontSize: 11, color: '#64748b' }}>{s.email}</div>}
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                            Added {fmtDate(s.invited_at)} · Last active {fmtRelative(s.last_active)}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                          <Stat label="XP"       value={s.xp.toLocaleString()} color={GOLD} />
                          <Stat label="Streak"   value={s.streak} color="#f97316" />
                          <Stat
                            label="Accuracy"
                            value={s.accuracy == null ? '—' : `${s.accuracy}%`}
                            color={s.accuracy == null ? '#475569' : s.accuracy >= 70 ? '#4ade80' : s.accuracy >= 50 ? GOLD : '#f87171'}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                detail.assignments.length === 0 ? (
                  <div style={emptyBox}>This tutor has not issued any assignments yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {detail.assignments.map(a => (
                      <div key={a.id} style={asgnRow}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>{a.type}</span>
                            <StatusBadge status={a.status} />
                          </div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>
                            <strong style={{ color: '#cbd5e1' }}>{a.student_name || a.student_id}</strong> · {a.subject}
                          </div>
                          {a.topics?.length > 0 && (
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{a.topics.join(', ')}</div>
                          )}
                          <div style={{ fontSize: 10, color: '#475569', marginTop: 3 }}>
                            Created {fmtDate(a.created_at)} · Due {fmtDate(a.due_date)}
                            {a.completed_at && ` · Completed ${fmtDate(a.completed_at)}`}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 50 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 9, color: '#64748b', fontWeight: 600, letterSpacing: 0.4 }}>{label.toUpperCase()}</div>
    </div>
  )
}

function StatusBadge({ status }) {
  const c = statusColor(status)
  return (
    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 12, border: `1px solid ${c}40`, background: `${c}15`, color: c, fontWeight: 700, textTransform: 'capitalize' }}>{status}</span>
  )
}

const th = { padding: '9px 10px', fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap' }
const td = { padding: '9px 10px', verticalAlign: 'middle' }
const inputStyle = { padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#f1f5f9', fontSize: 13, fontFamily: FONT_B, outline: 'none', minWidth: 240, flex: 1, maxWidth: 320 }
const errorBox = { padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, fontSize: 13, color: '#f87171', marginBottom: 12 }
const emptyBox = { padding: '24px 16px', textAlign: 'center', color: '#64748b', fontSize: 13, border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 10 }
const panelStyle = { position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 50, width: 460, maxWidth: '100vw', background: '#0f172a', borderLeft: '1px solid rgba(255,255,255,0.08)', overflowY: 'auto', fontFamily: FONT_B, display: 'flex', flexDirection: 'column' }
const closeBtn = { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: 4 }
const rosterRow = { display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 9 }
const asgnRow = { padding: '11px 13px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 9 }
