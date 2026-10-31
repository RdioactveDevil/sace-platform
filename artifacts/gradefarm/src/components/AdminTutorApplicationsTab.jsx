import { useEffect, useState } from 'react'
import { adminListTutorApplications, adminApproveTutor, adminRejectTutor } from '../lib/db'

const FONT_B = "'Plus Jakarta Sans', sans-serif"

export default function AdminTutorApplicationsTab() {
  const [apps, setApps]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [busyId, setBusyId]   = useState(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setApps(await adminListTutorApplications())
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

  return (
    <div style={{ fontFamily: FONT_B, color: 'var(--t-textSub)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <span style={{ fontSize: 12.5, color: 'var(--t-textMuted)', fontWeight: 600, flexShrink: 0 }}>{apps.length} pending application{apps.length === 1 ? '' : 's'}</span>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, fontSize: 13, color: 'var(--t-danger)', marginBottom: 12 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--t-textMuted)', fontSize: 13 }}>Loading…</div>
      ) : apps.length === 0 ? (
        <div style={{ padding: 24, border: '1px dashed rgba(var(--ink-rgb),0.1)', borderRadius: 10, color: 'var(--t-textMuted)', fontSize: 13, textAlign: 'center' }}>
          No pending applications.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {apps.map(a => {
            const busy = busyId === a.id
            return (
              <div key={a.id} style={{
                display: 'flex', alignItems: 'center', gap: 16,
                padding: '14px 16px', borderRadius: 10,
                background: 'rgba(var(--ink-rgb),0.03)',
                border: '1px solid rgba(var(--ink-rgb),0.06)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: 'var(--t-text)' }}>
                    {a.display_name || 'Unnamed user'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--t-textMuted)', marginTop: 2 }}>
                    {a.email || '—'}{a.school ? ` · ${a.school}` : ''}
                  </div>
                  {a.applied_at && (
                    <div style={{ fontSize: 11, color: 'var(--t-textMuted)', marginTop: 2 }}>
                      Applied {new Date(a.applied_at).toLocaleString()}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => run(a.id, () => adminApproveTutor(a.id))}
                    disabled={busy}
                    style={btnPrimary(busy)}
                  >Approve</button>
                  <button
                    onClick={() => run(a.id, () => adminRejectTutor(a.id))}
                    disabled={busy}
                    style={btn(busy)}
                  >Reject</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const btn = (busy) => ({
  padding: '8px 14px', borderRadius: 8,
  border: '1px solid rgba(var(--ink-rgb),0.12)',
  background: 'rgba(var(--ink-rgb),0.04)',
  color: 'var(--t-textSub)', fontSize: 13, fontWeight: 700,
  cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1,
  fontFamily: FONT_B,
})
const btnPrimary = (busy) => ({
  ...btn(busy),
  border: '1px solid #f1be4399',
  background: '#f1be4322',
  color: '#f1be43',
})
