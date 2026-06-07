import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { THEMES } from '../lib/theme'
import {
  fetchRoster,
  fetchStudentEmails,
  createTutoringSession,
  fetchTutoringSessions,
  cancelTutoringSession,
  fetchTutorClasses,
  createSessionSeries,
  fetchSessionSeries,
  cancelSessionSeries,
} from '../lib/db'

const GOLD = '#f1be43'
const FONT_B = "'Plus Jakarta Sans', sans-serif"

function fmtDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })
}

function statusColor(status) {
  if (status === 'active')    return { bg: '#1e3a2f', text: '#4ade80' }
  if (status === 'completed') return { bg: '#1e2a3a', text: '#60a5fa' }
  if (status === 'cancelled') return { bg: '#2a1a1a', text: '#f87171' }
  return { bg: '#2a2a1a', text: GOLD }
}

function StatusBadge({ status }) {
  const { bg, text } = statusColor(status)
  return (
    <span style={{ background: bg, color: text, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4, textTransform: 'uppercase', fontFamily: FONT_B }}>
      {status}
    </span>
  )
}

/** Recording status pill — reflects LiveKit Egress state for a session. */
function RecordingBadge({ session }) {
  const rs = session.recording_status
  let label, bg, text
  if (rs === 'recording')      { label = '🔴 Recording';        bg = '#2a1a1a'; text = '#f87171' }
  else if (rs === 'ready')     { label = '🎬 Recorded';         bg = '#1e2a3a'; text = '#60a5fa' }
  else if (rs === 'failed')    { label = '⚠ Recording failed';  bg = '#2a2320'; text = '#fbbf24' }
  else if (session.record_session) { label = '● Will record';   bg = '#2a2a1a'; text = GOLD }
  else return null
  return (
    <span style={{ background: bg, color: text, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4, fontFamily: FONT_B }}>
      {label}
    </span>
  )
}

// ── Schedule Session Modal ────────────────────────────────────────────────────
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function ScheduleModal({ profile, theme, roster, emails, classes, onClose, onCreated }) {
  const t = THEMES[theme]
  const [sessionType, setSessionType] = useState('individual')
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurrenceType, setRecurrenceType] = useState('weekly')
  const [dayOfWeek, setDayOfWeek] = useState(new Date().getDay())
  const [endsAt, setEndsAt] = useState('')
  const [studentId, setStudentId] = useState('')
  const [selectedStudentIds, setSelectedStudentIds] = useState([])
  const [classId, setClassId] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('16:00')
  const [duration, setDuration] = useState(60)
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [recordSession, setRecordSession] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [createdLink, setCreatedLink] = useState(null)
  const [copied, setCopied] = useState(false)

  const isGroup = sessionType === 'group'

  const toggleStudent = (id) => {
    setSelectedStudentIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const handleCopyLink = () => {
    navigator.clipboard.writeText(createdLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (isRecurring && dayOfWeek === undefined) { setError('Please select a day of week.'); return }
    if (!isRecurring && (!date || !time)) { setError('Please fill in date and time.'); return }
    setLoading(true)
    setError('')
    try {
      if (isRecurring) {
        const startsAt = date || new Date().toISOString().split('T')[0]
        const result = await createSessionSeries({
          session_type: sessionType,
          student_id: isGroup ? undefined : studentId || undefined,
          student_ids: isGroup ? selectedStudentIds : undefined,
          class_id: isGroup && classId ? classId : undefined,
          recurrence_type: recurrenceType,
          day_of_week: dayOfWeek,
          time_of_day: time,
          duration_minutes: duration,
          title: title || undefined,
          notes: notes || undefined,
          starts_at: startsAt,
          ends_at: endsAt || undefined,
        })
        onCreated({ series: result.series, occurrence_count: result.occurrence_count })
        onClose()
      } else {
        const scheduledAt = new Date(`${date}T${time}:00`).toISOString()
        const session = await createTutoringSession({
          session_type: sessionType,
          student_id: isGroup ? undefined : studentId || undefined,
          student_ids: isGroup ? selectedStudentIds : undefined,
          class_id: isGroup && classId ? classId : undefined,
          scheduled_at: scheduledAt,
          duration_minutes: duration,
          title: title || undefined,
          notes: notes || undefined,
          record_session: recordSession,
        })
        onCreated({ session })
        const link = session.join_link || `${window.location.origin}/session/${session.id}`
        setCreatedLink(link)
      }
    } catch (e) {
      setError(e.message || 'Failed to create session.')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: `1px solid ${t.border}`, background: t.bgNav,
    color: t.text, fontFamily: FONT_B, fontSize: 14, boxSizing: 'border-box',
  }
  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: t.textMuted, marginBottom: 6, fontFamily: FONT_B }

  const typeBtn = (type, label, icon) => ({
    flex: 1, padding: '10px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
    fontFamily: FONT_B, fontSize: 14, fontWeight: 600,
    background: sessionType === type ? GOLD : t.bgNav,
    color: sessionType === type ? '#1a1a2e' : t.textMuted,
  })

  if (createdLink) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}>
        <div style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 16, padding: 32, width: '100%', maxWidth: 480, fontFamily: FONT_B, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
          <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: t.text }}>Meeting Created</h2>
          <p style={{ margin: '0 0 24px', fontSize: 14, color: t.textMuted }}>
            Share this link with anyone you want in the session.
          </p>
          <div style={{ background: t.bgNav, border: `1px solid ${t.border}`, borderRadius: 10, padding: '14px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ flex: 1, fontSize: 13, color: t.text, wordBreak: 'break-all', textAlign: 'left', fontFamily: 'monospace' }}>
              {createdLink}
            </span>
            <button
              onClick={handleCopyLink}
              style={{ flexShrink: 0, background: copied ? '#1e3a2f' : GOLD, color: copied ? '#4ade80' : '#1a1a2e', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT_B, transition: 'background 0.2s' }}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <button
            onClick={onClose}
            style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: GOLD, color: '#1a1a2e', fontFamily: FONT_B, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16, overflowY: 'auto' }}>
      <div style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 16, padding: 32, width: '100%', maxWidth: 520, fontFamily: FONT_B, margin: 'auto' }}>
        <h2 style={{ margin: '0 0 24px', fontSize: 18, fontWeight: 700, color: t.text }}>📅 New Meeting</h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Session type toggle */}
          <div>
            <label style={labelStyle}>Session Type</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" style={typeBtn('individual')} onClick={() => setSessionType('individual')}>
                👤 1-on-1
              </button>
              <button type="button" style={typeBtn('group')} onClick={() => setSessionType('group')}>
                👥 Group
              </button>
            </div>
          </div>

          {/* Recurring toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: t.bgNav, border: `1px solid ${t.border}`, borderRadius: 8, padding: '12px 16px' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: t.text }}>🔁 Recurring session</div>
              <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>Same link every week — students bookmark it once</div>
            </div>
            <button
              type="button"
              onClick={() => setIsRecurring(r => !r)}
              style={{
                width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', flexShrink: 0,
                background: isRecurring ? GOLD : t.border, position: 'relative', transition: 'background 0.2s',
              }}
            >
              <span style={{
                position: 'absolute', top: 3, left: isRecurring ? 23 : 3,
                width: 18, height: 18, borderRadius: '50%', background: '#fff',
                transition: 'left 0.2s', display: 'block',
              }} />
            </button>
          </div>

          {/* Recurring settings */}
          {isRecurring && (
            <div style={{ background: t.bgNav, border: `1px solid ${t.border}`, borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Repeats</label>
                  <select value={recurrenceType} onChange={e => setRecurrenceType(e.target.value)} style={inputStyle}>
                    <option value="weekly">Weekly</option>
                    <option value="fortnightly">Fortnightly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Day of week</label>
                  <select value={dayOfWeek} onChange={e => setDayOfWeek(Number(e.target.value))} style={inputStyle}>
                    {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Start from</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} min={new Date().toISOString().split('T')[0]} placeholder="Today" />
                </div>
                <div>
                  <label style={labelStyle}>End date (optional)</label>
                  <input type="date" value={endsAt} onChange={e => setEndsAt(e.target.value)} style={inputStyle} min={new Date().toISOString().split('T')[0]} />
                </div>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: t.textMuted }}>
                First 12 sessions will be generated automatically. Students get one email with their permanent link.
              </p>
            </div>
          )}

          {/* Individual: student picker (optional) */}
          {!isGroup && (
            <div>
              <label style={labelStyle}>Invite student <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional — or share the link directly)</span></label>
              <select value={studentId} onChange={e => setStudentId(e.target.value)} style={inputStyle}>
                <option value="">None — I'll share the link myself</option>
                {roster.map(s => (
                  <option key={s.student_id} value={s.student_id}>
                    {s.display_name || emails[s.student_id] || s.student_id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Group: class picker + multi-select students */}
          {isGroup && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {classes.length > 0 && (
                <div>
                  <label style={labelStyle}>Add entire class (optional)</label>
                  <select value={classId} onChange={e => setClassId(e.target.value)} style={inputStyle}>
                    <option value="">None — pick students individually below</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name}{c.subject ? ` · ${c.subject}` : ''}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label style={labelStyle}>
                  Invite students <span style={{ fontWeight: 400, opacity: 0.6 }}>{classId ? '(optional extras on top of class)' : '(optional)'}</span>
                </label>
                <div style={{ border: `1px solid ${t.border}`, borderRadius: 8, maxHeight: 180, overflowY: 'auto', background: t.bgNav }}>
                  {roster.length === 0 ? (
                    <p style={{ padding: 12, color: t.textMuted, fontSize: 13, margin: 0 }}>No students on your roster yet.</p>
                  ) : roster.map(s => {
                    const name = s.display_name || emails[s.student_id] || s.student_id.slice(0, 8)
                    const checked = selectedStudentIds.includes(s.student_id)
                    return (
                      <label key={s.student_id} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                        cursor: 'pointer', borderBottom: `1px solid ${t.border}`,
                        background: checked ? (t.bg === '#ffffff' ? '#fdf8e8' : '#2a2a1a') : 'transparent',
                      }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleStudent(s.student_id)}
                          style={{ accentColor: GOLD, width: 16, height: 16, flexShrink: 0 }}
                        />
                        <span style={{ color: t.text, fontSize: 14 }}>{name}</span>
                      </label>
                    )
                  })}
                </div>
                {(selectedStudentIds.length > 0 || classId) && (
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: t.textMuted }}>
                    {classId && `Class selected`}{classId && selectedStudentIds.length > 0 ? ` + ` : ''}{selectedStudentIds.length > 0 ? `${selectedStudentIds.length} individual student${selectedStudentIds.length !== 1 ? 's' : ''}` : ''}
                    {' '}— all will receive an email invite
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Date / time — for one-off sessions only */}
          {!isRecurring && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Date *</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} required={!isRecurring} min={new Date().toISOString().split('T')[0]} />
              </div>
              <div>
                <label style={labelStyle}>Time *</label>
                <input type="time" value={time} onChange={e => setTime(e.target.value)} style={inputStyle} required={!isRecurring} />
              </div>
            </div>
          )}
          {/* Time for recurring (day already picked above) */}
          {isRecurring && (
            <div>
              <label style={labelStyle}>Session time *</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} style={inputStyle} required />
            </div>
          )}

          <div>
            <label style={labelStyle}>Duration</label>
            <select value={duration} onChange={e => setDuration(Number(e.target.value))} style={inputStyle}>
              <option value={30}>30 minutes</option>
              <option value={45}>45 minutes</option>
              <option value={60}>1 hour</option>
              <option value={90}>1.5 hours</option>
              <option value={120}>2 hours</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>Topic / Title</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Chemistry Unit 3 — Acids & Bases" style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Notes for {isGroup ? 'students' : 'student'}</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything to prepare…" rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>

          {/* Record toggle — works for one-off sessions and recurring series */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: t.bgNav, border: `1px solid ${t.border}`, borderRadius: 8, padding: '12px 16px' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: t.text }}>🔴 Record {isRecurring ? 'these sessions' : 'this session'}</div>
              <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>
                {isRecurring
                  ? 'Every session in the series is saved to Resources automatically'
                  : 'Saved to Resources automatically when the class ends'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setRecordSession(r => !r)}
              style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', flexShrink: 0, background: recordSession ? GOLD : t.border, position: 'relative', transition: 'background 0.2s' }}
            >
              <span style={{ position: 'absolute', top: 3, left: recordSession ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', display: 'block' }} />
            </button>
          </div>

          {error && <p style={{ color: '#f87171', fontSize: 13, margin: 0 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" onClick={onClose} style={{ padding: '10px 20px', borderRadius: 8, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontFamily: FONT_B, fontSize: 14, cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={loading} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: GOLD, color: '#1a1a2e', fontFamily: FONT_B, fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Creating…' : isRecurring ? 'Create Recurring Series' : 'Create Meeting Link'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Session Card ──────────────────────────────────────────────────────────────
function SessionCard({ session, theme, onJoin, onCancel }) {
  const t = THEMES[theme]
  const [cancelling, setCancelling] = useState(false)
  const [copied, setCopied] = useState(false)
  const isPast = new Date(session.scheduled_at) < new Date()
  const canJoin = session.status === 'scheduled' || session.status === 'active'
  const canCancel = session.status === 'scheduled'

  const handleCancel = async () => {
    if (!window.confirm('Cancel this session?')) return
    setCancelling(true)
    try { await onCancel(session.id) } finally { setCancelling(false) }
  }

  const handleCopyLink = () => {
    const link = `${window.location.origin}/session/${session.id}`
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{
      background: t.bgNav, border: `1px solid ${t.border}`, borderRadius: 12,
      padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 20,
      flexWrap: 'wrap',
    }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: t.text }}>
            {session.title || 'Tutoring Session'}
          </span>
          <StatusBadge status={session.status} />
          <RecordingBadge session={session} />
        </div>
        <div style={{ fontSize: 13, color: t.textMuted, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <span>
            {session.session_type === 'group' ? '👥' : '👤'}{' '}
            {session.other_party_name || 'Student'}
            {session.session_type === 'group' && session.participant_count > 0 && ` (${session.participant_count})`}
          </span>
          <span>📅 {fmtDateTime(session.scheduled_at)}</span>
          <span>⏱ {session.duration_minutes} min</span>
        </div>
        {session.notes && (
          <p style={{ margin: '8px 0 0', fontSize: 13, color: t.textMuted, fontStyle: 'italic' }}>
            {session.notes}
          </p>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button
          onClick={handleCopyLink}
          style={{ background: copied ? '#1e3a2f' : t.bgNav, color: copied ? '#4ade80' : t.textMuted, border: `1px solid ${t.border}`, borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 600, fontFamily: FONT_B, cursor: 'pointer', transition: 'all 0.2s' }}
          title="Copy meeting link"
        >
          {copied ? '✓' : '🔗'}
        </button>
        {canJoin && (
          <button
            onClick={() => onJoin(session.id)}
            style={{ background: GOLD, color: '#1a1a2e', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 700, fontFamily: FONT_B, cursor: 'pointer' }}
          >
            {session.status === 'active' ? '🔴 Rejoin' : '▶ Join'}
          </button>
        )}
        {canCancel && (
          <button
            onClick={handleCancel}
            disabled={cancelling}
            style={{ background: 'transparent', color: '#f87171', border: '1px solid #7f1d1d', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 600, fontFamily: FONT_B, cursor: 'pointer' }}
          >
            {cancelling ? '…' : 'Cancel'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Series Card ───────────────────────────────────────────────────────────────
function SeriesCard({ series, theme, onCancel }) {
  const t = THEMES[theme]
  const [cancelling, setCancelling] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCancel = async () => {
    if (!window.confirm('Cancel this recurring series? All future sessions will be cancelled.')) return
    setCancelling(true)
    try { await onCancel(series.id) } finally { setCancelling(false) }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(series.permanent_link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ background: t.bgNav, border: `1px solid ${GOLD}33`, borderRadius: 12, padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: t.text }}>{series.title || 'Recurring Session'}</span>
            <span style={{ background: series.status === 'active' ? '#1e3a2f' : '#2a1a1a', color: series.status === 'active' ? '#4ade80' : '#f87171', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4, textTransform: 'uppercase' }}>
              🔁 {series.status}
            </span>
          </div>
          <div style={{ fontSize: 13, color: t.textMuted, display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
            <span>📅 {series.schedule_label}</span>
            <span>⏱ {series.duration_minutes} min</span>
            {series.participant_count > 0 && (
              <span>{series.session_type === 'group' ? '👥' : '👤'} {series.participant_names.join(', ')}</span>
            )}
            {series.record_session && <span style={{ color: GOLD, fontWeight: 600 }}>🔴 Auto-records</span>}
          </div>
          {/* Permanent link */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 12px' }}>
            <span style={{ fontSize: 12, color: t.textMuted, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              🔗 {series.permanent_link}
            </span>
            <button
              onClick={handleCopy}
              style={{ background: copied ? '#1e3a2f' : t.bgNav, color: copied ? '#4ade80' : t.textMuted, border: `1px solid ${t.border}`, borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_B, flexShrink: 0 }}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </div>
        {series.status === 'active' && (
          <button onClick={handleCancel} disabled={cancelling} style={{ background: 'transparent', color: '#f87171', border: '1px solid #7f1d1d', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, fontFamily: FONT_B, cursor: 'pointer', flexShrink: 0 }}>
            {cancelling ? '…' : 'Cancel Series'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── SessionsTab ───────────────────────────────────────────────────────────────
export default function SessionsTab({ profile, theme }) {
  const t = THEMES[theme]
  const navigate = useNavigate()

  const [sessions, setSessions] = useState([])
  const [seriesList, setSeriesList] = useState([])
  const [roster, setRoster] = useState([])
  const [emails, setEmails] = useState({})
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [filter, setFilter] = useState('upcoming')
  const [view, setView] = useState('sessions') // 'sessions' | 'recurring'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [allSessions, rosterData, classData, allSeries] = await Promise.all([
        fetchTutoringSessions({ limit: 50 }),
        fetchRoster(profile.id),
        fetchTutorClasses(profile.id),
        fetchSessionSeries(),
      ])
      setSessions(allSessions || [])
      setSeriesList(allSeries || [])
      setRoster(rosterData || [])
      setClasses(classData || [])
      if (rosterData?.length) {
        const ids = rosterData.map(s => s.student_id)
        const emailMap = await fetchStudentEmails(ids)
        setEmails(emailMap || {})
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [profile.id])

  useEffect(() => { load() }, [load])

  const handleCancel = async (id) => {
    await cancelTutoringSession(id)
    setSessions(prev => prev.map(s => s.id === id ? { ...s, status: 'cancelled' } : s))
  }

  const handleCancelSeries = async (id) => {
    await cancelSessionSeries(id)
    setSeriesList(prev => prev.map(s => s.id === id ? { ...s, status: 'cancelled' } : s))
  }

  const handleCreated = ({ session, series, occurrence_count }) => {
    if (series) {
      setSeriesList(prev => [{ ...series, participant_names: [], participant_count: 0, permanent_link: series.livekit_room_name ? `/room/${series.livekit_room_name}` : '', schedule_label: '' }, ...prev])
      load() // reload to get enriched series data
    } else if (session) {
      setSessions(prev => [session, ...prev])
    }
  }

  const now = new Date()
  const filtered = sessions.filter(s => {
    if (filter === 'upcoming') return (s.status === 'scheduled' || s.status === 'active')
    if (filter === 'past') return (s.status === 'completed' || (s.status === 'scheduled' && new Date(s.scheduled_at) < now))
    if (filter === 'cancelled') return s.status === 'cancelled'
    return true
  })

  const tabBtn = (id, label) => ({
    padding: '9px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: FONT_B, fontSize: 13, fontWeight: 600,
    background: view === id ? GOLD : t.bgNav,
    color: view === id ? '#1a1a2e' : t.textMuted,
  })

  const filterStyle = (id) => ({
    padding: '7px 16px', borderRadius: 20, border: 'none', cursor: 'pointer', fontFamily: FONT_B, fontSize: 13, fontWeight: 600,
    background: filter === id ? GOLD : t.bgNav,
    color: filter === id ? '#1a1a2e' : t.textMuted,
  })

  return (
    <div style={{ fontFamily: FONT_B, color: t.text }}>
      <style>{`@font-face{font-family:'Sifonn Pro';src:url('/SIFONN_PRO.otf') format('opentype');font-display:swap;}`}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700 }}>📹 Video Sessions</h2>
          <p style={{ margin: 0, color: t.textMuted, fontSize: 14 }}>
            Schedule live video calls with your students.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{ background: GOLD, color: '#1a1a2e', border: 'none', borderRadius: 8, padding: '11px 20px', fontSize: 14, fontWeight: 700, fontFamily: FONT_B, cursor: 'pointer' }}
        >
          + Schedule Session
        </button>
      </div>

      {/* View toggle: Sessions vs Recurring */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button style={tabBtn('sessions', 'Sessions')} onClick={() => setView('sessions')}>
          Sessions {sessions.length > 0 && `(${sessions.length})`}
        </button>
        <button style={tabBtn('recurring', 'Recurring')} onClick={() => setView('recurring')}>
          🔁 Recurring {seriesList.length > 0 && `(${seriesList.length})`}
        </button>
      </div>

      {/* Recurring series view */}
      {view === 'recurring' && (
        <div>
          {seriesList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: t.textMuted }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🔁</div>
              <p style={{ fontSize: 15, margin: 0 }}>No recurring series yet. Create one with the "Schedule Session" button and toggle Recurring on.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {seriesList.map(s => (
                <SeriesCard key={s.id} series={s} theme={theme} onCancel={handleCancelSeries} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* One-off sessions view */}
      {view === 'sessions' && (
        <>
          {/* Filter tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
            <button style={filterStyle('upcoming')} onClick={() => setFilter('upcoming')}>Upcoming</button>
            <button style={filterStyle('past')} onClick={() => setFilter('past')}>Past</button>
            <button style={filterStyle('cancelled')} onClick={() => setFilter('cancelled')}>Cancelled</button>
            <button style={filterStyle('all')} onClick={() => setFilter('all')}>All</button>
          </div>

          {/* Session list */}
          {loading ? (
            <div style={{ color: t.textMuted, textAlign: 'center', padding: '40px 0', fontSize: 15 }}>
              <div style={{ width: 32, height: 32, border: `3px solid ${GOLD}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
              Loading sessions…
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: t.textMuted }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
              <p style={{ fontSize: 15, margin: 0 }}>
                {filter === 'upcoming' ? 'No upcoming sessions. Schedule one to get started.' : `No ${filter} sessions.`}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filtered.map(session => (
                <SessionCard
                  key={session.id}
                  session={session}
                  theme={theme}
                  onJoin={(id) => navigate(`/session/${id}`)}
                  onCancel={handleCancel}
                />
              ))}
            </div>
          )}
        </>
      )}

      {showModal && (
        <ScheduleModal
          profile={profile}
          theme={theme}
          roster={roster}
          emails={emails}
          classes={classes}
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  )
}
