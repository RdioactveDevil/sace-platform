import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, MessageSquare, SendHorizontal, CircleAlert } from 'lucide-react'
import { THEMES } from '../lib/theme'
import { fetchMessageThreads, fetchMessages, sendMessage, markMessagesRead } from '../lib/db'

const GOLD = '#f1be43'
const FONT_B = "'Plus Jakarta Sans', sans-serif"

/** Re-runs `fn` every `ms` while the tab is visible (and once when it becomes visible again). */
function usePoll(fn, ms, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined
    const tick = () => { if (document.visibilityState === 'visible') fn() }
    const id = setInterval(tick, ms)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick) }
  }, [fn, ms, enabled])
}

function dayLabel(iso) {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}

function shortTime(iso) {
  const d = new Date(iso)
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { day: 'numeric', month: 'short' })
}

/**
 * Direct messages between a tutor and their students. Students see their
 * tutors; tutors see their roster. `active` pauses polling while hidden.
 */
export default function MessagesView({ theme, active = true, initialOtherId = null, emptyHint }) {
  const t = THEMES[theme]
  const isDark = theme === 'dark'
  const [threads, setThreads] = useState(null)
  const [threadsError, setThreadsError] = useState('')
  const [openId, setOpenId] = useState(initialOtherId)
  useEffect(() => { if (initialOtherId) setOpenId(initialOtherId) }, [initialOtherId])
  const [search, setSearch] = useState('')
  const [isNarrow, setIsNarrow] = useState(() => window.innerWidth < 760)

  useEffect(() => {
    const h = () => setIsNarrow(window.innerWidth < 760)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  const loadThreads = useCallback(async () => {
    try { setThreads(await fetchMessageThreads()); setThreadsError('') }
    catch (e) { setThreadsError(e.message || 'Could not load messages.') }
  }, [])
  useEffect(() => { if (active) loadThreads() }, [active, loadThreads])
  usePoll(loadThreads, 30_000, active)

  // Open the first conversation on wide screens so the page isn't empty.
  useEffect(() => {
    if (!openId && !isNarrow && threads?.length) setOpenId(threads[0].other_id)
  }, [threads, openId, isNarrow])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (threads || []).filter(th => !q || th.other_name.toLowerCase().includes(q))
  }, [threads, search])

  const openThread = threads?.find(th => th.other_id === openId) || null
  const card = { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 16, boxShadow: t.shadowCard }

  if (threadsError && !threads) {
    return <div style={{ ...card, padding: 18, color: t.danger, fontSize: 13.5, display: 'flex', gap: 8, alignItems: 'center' }}><CircleAlert size={16} aria-hidden="true" />{threadsError}</div>
  }
  if (!threads) return <div style={{ ...card, height: 420, opacity: 0.6 }} />
  if (threads.length === 0) {
    return (
      <div style={{ ...card, padding: '40px 24px', textAlign: 'center', color: t.textMuted, fontSize: 13.5 }}>
        <MessageSquare size={26} color={t.goldText} aria-hidden="true" style={{ marginBottom: 10 }} />
        <div style={{ fontWeight: 700, color: t.text, marginBottom: 4 }}>No one to message yet</div>
        {emptyHint || 'Once you have a tutor or students, your conversations appear here.'}
      </div>
    )
  }

  const list = (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, borderRight: isNarrow ? 'none' : `1px solid ${t.border}`, width: isNarrow ? '100%' : 300, flexShrink: 0 }}>
      {threads.length > 6 && (
        <div style={{ padding: 12, borderBottom: `1px solid ${t.border}` }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" aria-label="Search conversations"
            style={{ width: '100%', boxSizing: 'border-box', padding: '8px 11px', borderRadius: 9, border: `1px solid ${t.border}`, background: t.bgInput, color: t.text, fontSize: 13, fontFamily: FONT_B, outline: 'none' }} />
        </div>
      )}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {filtered.map(th => {
          const selected = th.other_id === openId
          return (
            <button key={th.other_id} type="button" onClick={() => setOpenId(th.other_id)}
              style={{ display: 'flex', gap: 11, alignItems: 'center', width: '100%', textAlign: 'left', padding: '12px 14px', border: 'none', borderBottom: `1px solid ${t.border}`, cursor: 'pointer', fontFamily: FONT_B,
                background: selected ? (isDark ? 'rgba(241,190,67,0.10)' : '#fff8e6') : 'transparent' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, color: '#0c1037', background: `linear-gradient(135deg,${GOLD},#f9d87a)` }}>
                {th.other_name[0]?.toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: th.unread ? 800 : 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{th.other_name}</span>
                  {th.last_message && <span style={{ fontSize: 11, color: t.textMuted, flexShrink: 0 }}>{shortTime(th.last_message.created_at)}</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: th.unread ? t.text : t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {th.last_message ? `${th.last_message.from_me ? 'You: ' : ''}${th.last_message.body}` : (th.other_role === 'tutor' ? 'Your tutor · say hello' : 'Student · no messages yet')}
                  </span>
                  {th.unread > 0 && <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: GOLD, color: '#171724', fontSize: 10.5, fontWeight: 800, lineHeight: '18px', textAlign: 'center', flexShrink: 0 }}>{th.unread > 9 ? '9+' : th.unread}</span>}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )

  // Phones show the list or one conversation; wider screens show both.
  const showList = !isNarrow || !openThread
  const showConversation = !!openThread

  return (
    <div style={{ ...card, display: 'flex', overflow: 'hidden', height: 'min(640px, calc(100vh - 220px))', minHeight: 420, fontFamily: FONT_B }}>
      {showList && list}
      {showConversation && (
        <Conversation key={openThread.other_id} theme={theme} thread={openThread} active={active}
          onBack={isNarrow ? () => setOpenId(null) : null}
          onChanged={loadThreads} />
      )}
      {!showConversation && !isNarrow && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.textMuted, fontSize: 13 }}>Pick a conversation</div>
      )}
    </div>
  )
}

function Conversation({ theme, thread, active, onBack, onChanged }) {
  const t = THEMES[theme]
  const isDark = theme === 'dark'
  const [messages, setMessages] = useState(null)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const listRef = useRef(null)
  const lastCount = useRef(0)

  const load = useCallback(async () => {
    try {
      const json = await fetchMessages(thread.other_id)
      setMessages(json.messages)
      setError('')
      if (json.messages.some(m => !m.from_me && !m.read_at)) {
        await markMessagesRead(thread.other_id).catch(() => {})
        onChanged?.()
      }
    } catch (e) { setError(e.message || 'Could not load this conversation.') }
  }, [thread.other_id, onChanged])
  useEffect(() => { if (active) load() }, [active, load])
  usePoll(load, 10_000, active)

  useEffect(() => {
    const el = listRef.current
    if (el && messages && messages.length !== lastCount.current) {
      el.scrollTop = el.scrollHeight
      lastCount.current = messages.length
    }
  }, [messages])

  const submit = async (e) => {
    e.preventDefault()
    const body = draft.trim()
    if (!body || sending) return
    setSending(true); setError('')
    try {
      const msg = await sendMessage(thread.other_id, body)
      setMessages(prev => [...(prev || []), msg])
      setDraft('')
      onChanged?.()
    } catch (err) { setError(err.message || 'Could not send.') }
    setSending(false)
  }

  // Group by day for date separators.
  let lastDay = null

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${t.border}` }}>
        {onBack && (
          <button type="button" onClick={onBack} aria-label="Back to conversations" style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 8, background: 'transparent', color: t.textMuted, cursor: 'pointer' }}>
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: t.text }}>{thread.other_name}</div>
          <div style={{ fontSize: 11.5, color: t.textMuted }}>{thread.other_role === 'tutor' ? 'Your tutor' : 'Student'}</div>
        </div>
      </div>

      <div ref={listRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {messages === null ? (
          <div style={{ margin: 'auto', color: t.textMuted, fontSize: 13 }}>Loading…</div>
        ) : messages.length === 0 ? (
          <div style={{ margin: 'auto', textAlign: 'center', color: t.textMuted, fontSize: 13, maxWidth: 320, lineHeight: 1.5 }}>
            {thread.other_role === 'tutor'
              ? `Ask ${thread.other_name.split(' ')[0]} a question about your work, a lesson, or anything you're stuck on.`
              : `Send ${thread.other_name.split(' ')[0]} a message. They'll get an email and can reply here.`}
          </div>
        ) : messages.map(m => {
          const day = dayLabel(m.created_at)
          const sep = day !== lastDay
          lastDay = day
          return (
            <div key={m.id} style={{ display: 'flex', flexDirection: 'column' }}>
              {sep && <div style={{ alignSelf: 'center', margin: '10px 0 6px', fontSize: 11, fontWeight: 700, color: t.textMuted, letterSpacing: '0.04em' }}>{day}</div>}
              <div style={{ alignSelf: m.from_me ? 'flex-end' : 'flex-start', maxWidth: '78%' }}>
                <div style={{ padding: '9px 13px', borderRadius: 14, fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
                  background: m.from_me ? (isDark ? 'rgba(241,190,67,0.18)' : '#fdf0c8') : (isDark ? 'rgba(255,255,255,0.07)' : '#eef0f6'),
                  color: t.text,
                  borderBottomRightRadius: m.from_me ? 4 : 14, borderBottomLeftRadius: m.from_me ? 14 : 4 }}>
                  {m.body}
                </div>
                <div style={{ fontSize: 10.5, color: t.textMuted, marginTop: 3, textAlign: m.from_me ? 'right' : 'left' }}>
                  {new Date(m.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  {m.from_me && m.read_at ? ' · Seen' : ''}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {error && <div style={{ padding: '0 16px 8px', fontSize: 12, color: t.danger }}>{error}</div>}
      <form onSubmit={submit} style={{ display: 'flex', gap: 8, padding: 12, borderTop: `1px solid ${t.border}` }}>
        <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={1} maxLength={4000}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(e) } }}
          placeholder={`Message ${thread.other_name.split(' ')[0]}…`} aria-label="Message"
          style={{ flex: 1, minWidth: 0, resize: 'none', maxHeight: 120, padding: '10px 12px', borderRadius: 10, border: `1px solid ${t.border}`, background: t.bgInput, color: t.text, fontSize: 13.5, fontFamily: FONT_B, outline: 'none' }} />
        <button type="submit" disabled={!draft.trim() || sending} aria-label="Send"
          style={{ width: 42, height: 42, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 10, background: GOLD, color: '#171724', cursor: !draft.trim() || sending ? 'default' : 'pointer', opacity: !draft.trim() || sending ? 0.45 : 1 }}>
          <SendHorizontal size={17} aria-hidden="true" />
        </button>
      </form>
    </div>
  )
}
