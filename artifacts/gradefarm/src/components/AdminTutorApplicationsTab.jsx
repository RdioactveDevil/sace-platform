import { useEffect, useState } from 'react'
import { adminListTutorApplications, adminApproveTutor, adminRejectTutor } from '../lib/db'

const FONT_B = "'Plus Jakarta Sans', sans-serif"

export default function AdminTutorApplicationsTab({ onChange }) {
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
      onChange?.()
    } catch (e) {
      setError(e.message)
    }
    setBusyId(null)
  }

  return (
    <div style={{ fontFamily: FONT_B, color: 'var(--t-textSub)' }}>
      {error && (
        <div style={{ fontSize: 13, color: 'var(--t-danger)', marginBottom: 12 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--t-textMuted)', fontSize: 13 }}>Loading…</div>
      ) : apps.length === 0 ? (
        <div style={{ padding: 36, background: 'var(--t-bgCard)', border: '1px solid var(--t-border)', borderRadius: 12, color: 'var(--t-textMuted)', fontSize: 13, textAlign: 'center' }}>
          No one is waiting. People who apply to tutor show up here.
        </div>
      ) : (
        <div style={{ background: 'var(--t-bgCard)', border: '1px solid var(--t-border)', borderRadius: 12, overflow: 'hidden' }}>
          {apps.map(a => {
            const busy = busyId === a.id
            return (
              <div key={a.id} style={{
                display: 'flex', alignItems: 'center', gap: 16,
                padding: '13px 16px', flexWrap: 'wrap',
                borderBottom: '1px solid var(--t-border)',
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
                      Applied {new Date(a.applied_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
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
  padding: '8px 14px', borderRadius: 9,
  border: '1px solid var(--t-border)',
  background: 'var(--t-bgCard)',
  color: 'var(--t-text)', fontSize: 13, fontWeight: 800,
  cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1,
  fontFamily: FONT_B,
})
const btnPrimary = (busy) => ({
  ...btn(busy),
  border: 'none',
  background: 'var(--t-accent)',
  color: '#0c1037',
})
