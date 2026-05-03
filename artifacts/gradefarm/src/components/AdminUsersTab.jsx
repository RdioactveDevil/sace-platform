import { useEffect, useState } from 'react'
import {
  adminListUsers,
  adminSetTutor,
  adminSetAdmin,
  adminApproveTutor,
  adminRejectTutor,
} from '../lib/db'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const GOLD   = '#f1be43'

export default function AdminUsersTab({ profile }) {
  const [users, setUsers]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [busyId, setBusyId]   = useState(null)
  const [filter, setFilter]   = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const json = await adminListUsers(1, 200)
      setUsers(json.users || [])
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const run = async (id, fn) => {
    setBusyId(id)
    try {
      await fn()
      await load()
    } catch (e) {
      setError(e.message)
    }
    setBusyId(null)
  }

  const filtered = users.filter(u => {
    if (!filter.trim()) return true
    const f = filter.toLowerCase()
    return (u.email || '').toLowerCase().includes(f)
        || (u.display_name || '').toLowerCase().includes(f)
  })

  return (
    <div style={{ fontFamily: FONT_B, color: '#e2e8f0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, color: GOLD }}>All users</h2>
        <span style={{ fontSize: 12, color: '#64748b' }}>({users.length})</span>
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter by email or name…"
          style={{
            marginLeft: 'auto',
            padding: '8px 12px', borderRadius: 8,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#f1f5f9', fontSize: 13, fontFamily: FONT_B, outline: 'none',
            minWidth: 240,
          }}
        />
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, fontSize: 13, color: '#f87171', marginBottom: 12 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ color: '#64748b', fontSize: 13 }}>Loading users…</div>
      ) : (
        <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: 'rgba(255,255,255,0.03)', textAlign: 'left' }}>
              <tr>
                <th style={th}>User</th>
                <th style={th}>Role</th>
                <th style={th}>Application</th>
                <th style={{ ...th, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => {
                const isSelf = u.id === profile?.id
                const busy = busyId === u.id
                return (
                  <tr key={u.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={td}>
                      <div style={{ fontWeight: 700, color: '#f1f5f9' }}>{u.display_name || '—'}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{u.email}</div>
                    </td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {u.is_admin && <Badge color="#a78bfa">Admin</Badge>}
                        {u.is_tutor && <Badge color={GOLD}>Tutor</Badge>}
                        {!u.is_admin && !u.is_tutor && <Badge color="#64748b">Student</Badge>}
                      </div>
                    </td>
                    <td style={td}>
                      <span style={{ color: statusColor(u.tutor_application_status) }}>
                        {u.tutor_application_status}
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {u.tutor_application_status === 'pending' && (
                          <>
                            <Btn onClick={() => run(u.id, () => adminApproveTutor(u.id))} disabled={busy} variant="primary">Approve</Btn>
                            <Btn onClick={() => run(u.id, () => adminRejectTutor(u.id))} disabled={busy}>Reject</Btn>
                          </>
                        )}
                        {!u.is_tutor && u.tutor_application_status !== 'pending' && (
                          <Btn onClick={() => run(u.id, () => adminSetTutor(u.id, true))} disabled={busy}>Make tutor</Btn>
                        )}
                        {u.is_tutor && (
                          <Btn onClick={() => run(u.id, () => adminSetTutor(u.id, false))} disabled={busy}>Remove tutor</Btn>
                        )}
                        {!u.is_admin ? (
                          <Btn onClick={() => run(u.id, () => adminSetAdmin(u.id, true))} disabled={busy}>Make admin</Btn>
                        ) : (
                          <Btn onClick={() => run(u.id, () => adminSetAdmin(u.id, false))} disabled={busy || isSelf} title={isSelf ? "You can't remove your own admin role" : ''}>Remove admin</Btn>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td style={{ ...td, color: '#64748b' }} colSpan={4}>No users match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const th = { padding: '10px 12px', fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }
const td = { padding: '10px 12px', verticalAlign: 'middle' }

function statusColor(s) {
  if (s === 'pending')  return '#f1be43'
  if (s === 'approved') return '#4ade80'
  if (s === 'rejected') return '#f87171'
  return '#64748b'
}

function Badge({ children, color }) {
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
      color, border: `1px solid ${color}55`, background: `${color}14`,
    }}>{children}</span>
  )
}

function Btn({ children, onClick, disabled, variant, title }) {
  const isPrimary = variant === 'primary'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        padding: '6px 10px', borderRadius: 6,
        border: '1px solid ' + (isPrimary ? '#f1be4399' : 'rgba(255,255,255,0.12)'),
        background: isPrimary ? '#f1be4322' : 'rgba(255,255,255,0.04)',
        color: isPrimary ? '#f1be43' : '#e2e8f0',
        fontSize: 12, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontFamily: FONT_B,
      }}
    >{children}</button>
  )
}
