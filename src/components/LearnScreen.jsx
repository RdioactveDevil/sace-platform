import { useState, useEffect, useRef } from 'react'
import { THEMES } from '../lib/theme'
import { supabase } from '../lib/supabase'

const GOLD   = '#f1be43'
const GOLDL  = '#f9d87a'
const NAVY   = '#0c1037'
const FONT_B = "'Plus Jakarta Sans', sans-serif"

// ─── SYSTEM PROMPT ────────────────────────────────────────────────────────────
function buildSystemPrompt(profile, topic, docContext, struggleTopics, interests) {
  const struggleList = struggleTopics.length > 0
    ? struggleTopics.map(s => `${s.subtopic} (${Math.round(s.rate * 100)}% error rate)`).join(', ')
    : 'No specific weaknesses identified yet'

  const analogyGuide = {
    sport:  'Use sport analogies — AFL, cricket, soccer, basketball. Reactions = plays, molecules = players, energy = fitness, equilibrium = a tied game.',
    gaming: 'Use gaming analogies — reactions = quests, molecules = characters, energy = health points, equilibrium = a balanced match.',
    music:  'Use music analogies — reactions = songs, molecules = instruments, energy = volume, equilibrium = harmony.',
  }

  return `You are Titan AI, a SACE tutor for ${profile.display_name}. You work for Titanium Tutoring (gradefarm.).

STUDENT PROFILE:
- Name: ${profile.display_name.split(' ')[0]}
- Topic today: ${topic || 'General Chemistry'}
- Known weaknesses: ${struggleList}
- Analogy style: ${interests}

YOUR PERSONALITY:
- Warm, encouraging, never condescending
- You feel like a cool older student who genuinely gets it
- Celebrate wins: "Yes! Exactly right." "That's it!"
- When wrong: never say "wrong" — say "almost, think about it this way..."
- Patient — if they don't get it, try a completely different angle

YOUR TEACHING METHOD:
- NEVER start with a formula. Always start with a story or scenario
- Ask questions constantly — never lecture more than 2–3 sentences without checking in
- ${analogyGuide[interests] || analogyGuide.sport}
- Use "imagine..." and "picture this..." to set up scenarios
- After explaining, always ask: "Does that click? Want me to try a different way?"
- Keep responses short — 3–4 sentences max, then ask something
- Use **bold** for key terms when first introduced

DOCUMENT CONTEXT (teach from this if provided):
${docContext || 'No document uploaded — use general SACE curriculum knowledge.'}

IMPORTANT: Always end your turn with a question or invitation to respond.`
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
// All persistent state lives in App.jsx and is passed as props.
// LearnScreen owns nothing persistent — this is what survives navigation.
export default function LearnScreen({
  profile, struggleMap, questions, subject, onBack, theme,
  phase,       setPhase,
  topic,       setTopic,
  messages,    setMessages,
  interests,   setInterests,
  docContext,  setDocContext,
  docName,     setDocName,
}) {
  const t = THEMES[theme]

  // Truly transient — fine to reset on unmount
  const [input, setInput]               = useState('')
  const [loading, setLoading]           = useState(false)
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [sessionId, setSessionId]       = useState(null)

  const bottomRef = useRef(null)
  const inputRef  = useRef(null)
  const fileRef   = useRef(null)

  const struggleTopics = Object.entries(struggleMap)
    .map(([qid, s]) => {
      const q = questions.find(x => x.id === qid)
      if (!q || s.attempts === 0) return null
      return { subtopic: q.subtopic, rate: s.wrong / s.attempts }
    })
    .filter(x => x && x.rate >= 0.4)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 5)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Document upload
  const handleDocUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploadingDoc(true)
    setDocName(file.name)
    try {
      const reader = new FileReader()
      reader.onload = async (ev) => {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1000,
            messages: [{
              role: 'user',
              content: [
                { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: ev.target.result.split(',')[1] } },
                { type: 'text', text: 'Extract all educational content from this document. Return clean structured text organised by topic. Include all key concepts, definitions, formulas and examples.' }
              ]
            }]
          })
        })
        const data = await res.json()
        setDocContext((data.content?.[0]?.text || '').slice(0, 8000))
        setUploadingDoc(false)
      }
      reader.readAsDataURL(file)
    } catch {
      setUploadingDoc(false)
    }
  }

  // Start lesson
  const startLesson = async () => {
    if (!topic.trim()) return
    setPhase('chat')
    setLoading(true)
    const systemPrompt = buildSystemPrompt(profile, topic, docContext, struggleTopics, interests)
    const openingPrompt = `Start the lesson on "${topic}". Warmly greet ${profile.display_name.split(' ')[0]} and open with a short engaging question to find out what they already know. Keep it brief and natural.`
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, system: systemPrompt, messages: [{ role: 'user', content: openingPrompt }] })
      })
      const data = await res.json()
      const firstMsg = { role: 'assistant', content: data.content?.[0]?.text || "Hey! Let's dive in. What do you already know about this topic?" }
      setMessages([firstMsg])
      // Create session in Supabase
      try {
        const { data: sess } = await supabase
          .from('learn_sessions')
          .insert({ user_id: profile.id, topic, interests, messages: [firstMsg] })
          .select('id')
          .single()
        if (sess?.id) setSessionId(sess.id)
      } catch {}
    } catch {
      setMessages([{ role: 'assistant', content: "Hey! I'm Titan AI, your SACE tutor. What do you already know about this topic?" }])
    }
    setLoading(false)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  // Send message
  const sendMessage = async () => {
    if (!input.trim() || loading) return
    const userMsg = { role: 'user', content: input.trim() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514', max_tokens: 1000,
          system: buildSystemPrompt(profile, topic, docContext, struggleTopics, interests),
          messages: newMessages.map(m => ({ role: m.role, content: m.content }))
        })
      })
      const data = await res.json()
      setMessages(prev => {
        const updated = [...prev, { role: 'assistant', content: data.content?.[0]?.text || "Let me try a different approach..." }]
        // Update session in Supabase
        if (sessionId) {
          supabase.from('learn_sessions')
            .update({ messages: updated, updated_at: new Date().toISOString() })
            .eq('id', sessionId)
            .then(() => {})
        }
        return updated
      })
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: "Connection issue — try again?" }])
    }
    setLoading(false)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  // Format bold + line breaks
  const formatMessage = (text) => text.split('\n').map((line, i) => (
    <span key={i}>
      {line.split(/\*\*(.*?)\*\*/g).map((part, j) =>
        j % 2 === 1 ? <strong key={j} style={{ color: t.text, fontWeight: 700 }}>{part}</strong> : part
      )}
      {i < text.split('\n').length - 1 && <br />}
    </span>
  ))

  const STYLE_OPTS = [
    { id: 'sport',  emoji: '🏈', label: 'Sport',  desc: 'AFL, cricket' },
    { id: 'gaming', emoji: '🎮', label: 'Gaming', desc: 'RPGs, strategy' },
    { id: 'music',  emoji: '🎵', label: 'Music',  desc: 'beats, harmony' },
  ]

  // ── SETUP PHASE ─────────────────────────────────────────────────────────────
  // Guard: if phase is undefined (props not passed yet), show setup
  if (!phase || phase === 'setup') return (
    <div style={{ color: t.text, fontFamily: FONT_B }}>
      <style>{`
        @font-face{font-family:'Sifonn Pro';src:url('/SIFONN_PRO.otf') format('opentype');font-display:swap;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        .ls-wrap { display:flex; min-height:calc(100vh - 80px); }
        .ls-sidebar { width:260px; flex-shrink:0; padding:24px 20px; border-right:1px solid ${t.border}; display:flex; flex-direction:column; gap:16px; background:${t.bgNav}; }
        .ls-main { flex:1; padding:28px 32px; background:${t.bg}; }
        @media(max-width:860px){
          .ls-wrap { flex-direction:column; }
          .ls-sidebar { width:100%; border-right:none; border-bottom:1px solid ${t.border}; padding:16px; gap:12px; }
          .ls-main { padding:16px; }
        }
        input::placeholder{color:${t.textFaint};}
        input:focus{border-color:${GOLD} !important; outline:none;}
        textarea:focus{border-color:${GOLD} !important; outline:none;}
      `}</style>

      {/* Gold hero header */}
      <div style={{ background: `linear-gradient(135deg,rgba(241,190,67,0.15),rgba(241,190,67,0.06))`, borderBottom: `1px solid rgba(241,190,67,0.25)`, padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: `linear-gradient(135deg,${GOLD},${GOLDL})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🎓</div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: t.text }}>Learn with <span style={{ color: GOLD }}>Titan AI</span></div>
          <div style={{ fontSize: 12, color: t.textMuted, marginTop: 1 }}>Your personal SACE tutor · {subject?.name || 'Chemistry'}</div>
        </div>
      </div>

      <div className="ls-wrap">

        {/* Sidebar — weak topics */}
        <div className="ls-sidebar">
          <div>
            <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>⚡ Titan suggests</div>
            {struggleTopics.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {struggleTopics.slice(0, 4).map(s => (
                  <button key={s.subtopic} onClick={() => setTopic(s.subtopic)} style={{ textAlign: 'left', padding: '9px 12px', borderRadius: 9, border: `1px solid ${topic === s.subtopic ? GOLD : t.border}`, background: topic === s.subtopic ? 'rgba(241,190,67,0.12)' : t.bgCard, cursor: 'pointer', fontFamily: FONT_B, transition: 'all 0.15s' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: topic === s.subtopic ? GOLD : t.text, marginBottom: 2 }}>{s.subtopic}</div>
                    <div style={{ fontSize: 10, color: t.danger, fontWeight: 600 }}>{Math.round(s.rate * 100)}% error rate</div>
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.6 }}>Do some quiz sessions first — Titan will suggest your weakest topics here.</div>
            )}
          </div>

          {/* Upload */}
          <div>
            <div style={{ fontSize: 11, color: t.textMuted, fontWeight: 600, marginBottom: 8 }}>UPLOAD CLASS NOTES</div>
            <div onClick={() => fileRef.current?.click()} style={{ border: `2px dashed ${docContext ? GOLD : t.border}`, borderRadius: 10, padding: '14px', textAlign: 'center', cursor: 'pointer', background: docContext ? 'rgba(241,190,67,0.06)' : 'transparent', transition: 'all 0.2s' }}>
              {uploadingDoc ? (
                <div style={{ fontSize: 12, color: t.textMuted }}>Processing…</div>
              ) : docContext ? (
                <>
                  <div style={{ fontSize: 18, marginBottom: 4 }}>✅</div>
                  <div style={{ fontSize: 11, color: GOLD, fontWeight: 600 }}>{docName.slice(0, 24)}{docName.length > 24 ? '…' : ''}</div>
                  <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>Titan will teach from your notes</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 20, marginBottom: 4 }}>📄</div>
                  <div style={{ fontSize: 11, color: t.textMuted }}>PDF, PPTX or DOCX</div>
                  <div style={{ fontSize: 10, color: t.textFaint, marginTop: 2 }}>optional</div>
                </>
              )}
            </div>
            <input ref={fileRef} type="file" accept=".pdf,.pptx,.docx,.txt" onChange={handleDocUpload} style={{ display: 'none' }} />
          </div>
        </div>

        {/* Main — topic + style + start */}
        <div className="ls-main">
          <div style={{ maxWidth: 540 }}>

            <label style={{ fontSize: 13, fontWeight: 700, color: t.text, display: 'block', marginBottom: 8 }}>
              What do you want to learn today?
            </label>
            <input
              value={topic}
              onChange={e => setTopic(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && startLesson()}
              placeholder="e.g. pH calculations, Ionic bonding, The mole..."
              style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: `1px solid ${t.border}`, background: t.bgCard, color: t.text, fontSize: 14, fontFamily: FONT_B, boxSizing: 'border-box', marginBottom: 20 }}
            />

            <label style={{ fontSize: 13, fontWeight: 700, color: t.text, display: 'block', marginBottom: 10 }}>
              How should Titan AI explain things?
            </label>
            <div style={{ display: 'flex', gap: 10, marginBottom: 28 }}>
              {STYLE_OPTS.map(opt => {
                const active = interests === opt.id
                return (
                  <button key={opt.id} onClick={() => setInterests(opt.id)} style={{ flex: 1, padding: '12px 8px', borderRadius: 12, border: `2px solid ${active ? GOLD : t.border}`, background: active ? GOLD : t.bgCard, color: active ? '#0c1037' : t.textMuted, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B, transition: 'all 0.15s', textAlign: 'center' }}>
                    <div style={{ fontSize: 18, marginBottom: 4 }}>{opt.emoji}</div>
                    <div>{opt.label}</div>
                    <div style={{ fontSize: 10, marginTop: 2, fontWeight: 500, opacity: 0.75 }}>{opt.desc}</div>
                  </button>
                )
              })}
            </div>

            <button onClick={startLesson} disabled={!topic.trim() || uploadingDoc} style={{ width: '100%', padding: '16px', borderRadius: 12, border: 'none', background: topic.trim() && !uploadingDoc ? `linear-gradient(135deg,${GOLD},${GOLDL})` : t.border, color: topic.trim() ? '#0c1037' : t.textFaint, fontSize: 15, fontWeight: 800, cursor: topic.trim() ? 'pointer' : 'default', fontFamily: FONT_B, boxShadow: topic.trim() ? `0 8px 28px rgba(241,190,67,0.35)` : 'none', transition: 'all 0.2s' }}>
              Start lesson with Titan AI →
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  // ── CHAT PHASE ───────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 0px)', color: t.text, fontFamily: FONT_B }}>
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        .msg-in { animation: fadeUp 0.2s ease; }
        .ls-chat-desktop { display:flex; flex:1; min-height:0; }
        .ls-chat-aside { width:220px; flex-shrink:0; border-right:1px solid rgba(255,255,255,0.07); padding:16px; background:#080d28; display:flex; flex-direction:column; gap:12px; overflow-y:auto; }
        .ls-chat-body { flex:1; display:flex; flex-direction:column; min-width:0; }
        @media(max-width:860px){
          .ls-chat-desktop { flex-direction:column; }
          .ls-chat-aside { display:none; }
        }
      `}</style>

      {/* Gold hero header — always visible in chat */}
      <div style={{ background: theme === 'dark' ? 'rgba(241,190,67,0.1)' : 'rgba(241,190,67,0.15)', borderBottom: `1px solid rgba(241,190,67,0.25)`, padding: '12px 18px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg,${GOLD},${GOLDL})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>🎓</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: t.text }}>Titan <span style={{ color: GOLD }}>AI</span></div>
              <div style={{ fontSize: 11, color: t.textMuted }}>Teaching: <span style={{ color: GOLD, fontWeight: 600 }}>{topic}</span></div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {STYLE_OPTS.map(opt => {
              const active = interests === opt.id
              return (
                <button key={opt.id} onClick={() => setInterests(opt.id)} style={{ padding: '5px 10px', borderRadius: 20, border: `1px solid ${active ? GOLD : t.border}`, background: active ? GOLD : 'transparent', color: active ? '#0c1037' : t.textMuted, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B, transition: 'all 0.15s' }}>
                  {opt.emoji} {opt.label}
                </button>
              )
            })}
            <div style={{ width: 1, height: 20, background: t.border, margin: '0 4px' }} />
            <button onClick={() => setPhase('setup')} style={{ padding: '5px 10px', borderRadius: 8, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 11, cursor: 'pointer', fontFamily: FONT_B }}>← Setup</button>
            <button onClick={onBack} style={{ padding: '5px 10px', borderRadius: 8, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 11, cursor: 'pointer', fontFamily: FONT_B }}>Exit</button>
          </div>
        </div>
        {docName && (
          <div style={{ marginTop: 8, fontSize: 10, color: GOLD, background: 'rgba(241,190,67,0.1)', border: '1px solid rgba(241,190,67,0.2)', padding: '3px 10px', borderRadius: 6, display: 'inline-block' }}>📄 {docName}</div>
        )}
      </div>

      <div className="ls-chat-desktop">

        {/* Desktop aside — quick suggestions + weak topics */}
        <div className="ls-chat-aside">
          <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Quick replies</div>
          {["I don't get it", "Give me an example", "I think I get it!", "Different analogy"].map(s => (
            <button key={s} onClick={() => { const msg = { role: 'user', content: s }; setMessages(prev => [...prev, msg]); setLoading(true); fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:1000,system:buildSystemPrompt(profile,topic,docContext,struggleTopics,interests),messages:[...messages,msg].map(m=>({role:m.role,content:m.content}))})}).then(r=>r.json()).then(d=>{setMessages(prev=>[...prev,{role:'assistant',content:d.content?.[0]?.text||'Let me try differently...'}]);setLoading(false)}).catch(()=>setLoading(false)) }}
              style={{ textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.55)', fontSize: 12, cursor: 'pointer', fontFamily: FONT_B, transition: 'all 0.15s', width: '100%' }}>
              {s}
            </button>
          ))}
          {struggleTopics.length > 0 && (
            <>
              <div style={{ fontSize: 11, color: '#ef4444', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 4 }}>Your weak spots</div>
              {struggleTopics.slice(0, 3).map(s => (
                <div key={s.subtopic} style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.15)', background: 'rgba(239,68,68,0.05)', fontSize: 11 }}>
                  <div style={{ color: '#fca5a5', fontWeight: 600 }}>{s.subtopic}</div>
                  <div style={{ color: '#ef4444', fontSize: 10, marginTop: 2 }}>{Math.round(s.rate * 100)}% error</div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Chat body */}
        <div className="ls-chat-body">
          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {messages.map((msg, i) => (
              <div key={i} className="msg-in" style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 8, alignItems: 'flex-end' }}>
                {msg.role === 'assistant' && (
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: `linear-gradient(135deg,${GOLD},${GOLDL})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>🎓</div>
                )}
                <div style={{ maxWidth: '75%', padding: '11px 14px', borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px', background: msg.role === 'user' ? `linear-gradient(135deg,${GOLD},${GOLDL})` : theme === 'dark' ? '#0c1525' : '#fff', color: msg.role === 'user' ? '#0c1037' : t.text, fontSize: 14, lineHeight: 1.7, border: msg.role === 'user' ? 'none' : `1px solid ${t.border}`, fontWeight: msg.role === 'user' ? 600 : 400 }}>
                  {formatMessage(msg.content)}
                </div>
                {msg.role === 'user' && (
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#0c1037', flexShrink: 0 }}>
                    {profile.display_name[0].toUpperCase()}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="msg-in" style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: `linear-gradient(135deg,${GOLD},${GOLDL})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>🎓</div>
                <div style={{ padding: '12px 16px', borderRadius: '16px 16px 16px 4px', background: theme === 'dark' ? '#0c1525' : '#fff', border: `1px solid ${t.border}`, display: 'flex', gap: 4, alignItems: 'center' }}>
                  {[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: GOLD, animation: 'pulse 1.2s ease infinite', animationDelay: `${i*0.2}s` }} />)}
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Mobile quick replies */}
          {messages.length > 0 && messages.length < 5 && !loading && (
            <div style={{ padding: '0 16px 8px', display: 'flex', gap: 6, overflowX: 'auto' }}>
              {["I don't get it", "Example?", "Got it!", "Different analogy"].map(s => (
                <button key={s} onClick={() => { setInput(s); setTimeout(() => sendMessage(), 50) }} style={{ padding: '6px 12px', borderRadius: 20, border: `1px solid ${t.border}`, background: t.bgCard || '#111a4a', color: 'rgba(255,255,255,0.5)', fontSize: 11, cursor: 'pointer', fontFamily: FONT_B, whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{ padding: '10px 16px', borderTop: `1px solid rgba(255,255,255,0.07)`, background: '#080d28', display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
            <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }} placeholder="Type your answer or question…" rows={1}
              style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: `1px solid rgba(255,255,255,0.1)`, background: 'rgba(255,255,255,0.06)', color: '#f1f5f9', fontSize: 14, fontFamily: FONT_B, outline: 'none', resize: 'none', maxHeight: 100, lineHeight: 1.5 }} />
            <button onClick={sendMessage} disabled={!input.trim() || loading}
              style={{ width: 40, height: 40, borderRadius: 10, border: 'none', background: input.trim() && !loading ? `linear-gradient(135deg,${GOLD},${GOLDL})` : 'rgba(255,255,255,0.08)', color: input.trim() ? '#0c1037' : 'rgba(255,255,255,0.3)', fontSize: 16, fontWeight: 800, cursor: input.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
              ↑
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}