import { useState, useEffect, useRef } from 'react'
import { THEMES } from '../lib/theme'
import { supabase } from '../lib/supabase'

// ─── DOCUMENT UPLOAD & PROCESSING ─────────────────────────────────────────────
async function extractTextFromFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    if (file.type === 'text/plain') {
      reader.readAsText(file)
    } else {
      // For pptx/docx we read as base64 and send to Claude to extract
      reader.readAsDataURL(file)
    }
  })
}

// ─── TUTOR SYSTEM PROMPT ──────────────────────────────────────────────────────
function buildSystemPrompt(profile, topic, docContext, struggleTopics, interests = 'sport') {
  const struggleList = struggleTopics.length > 0
    ? struggleTopics.map(s => `${s.subtopic} (${Math.round(s.rate * 100)}% error rate)`).join(', ')
    : 'No specific weaknesses identified yet'

  const analogyGuide = {
    sport: 'Use sport analogies — AFL, cricket, soccer, basketball. Think of reactions as plays, molecules as players, energy as fitness, equilibrium as a tied game.',
    gaming: 'Use gaming analogies — think of reactions as quests, molecules as characters, energy as health points, equilibrium as a balanced match.',
    music: 'Use music analogies — think of reactions as songs, molecules as instruments, energy as volume, equilibrium as harmony.',
  }

  return `You are Titan, a SACE tutor for ${profile.display_name}. You work for Titanium Tutoring.

STUDENT PROFILE:
- Name: ${profile.display_name.split(' ')[0]}
- Current topic: ${topic || 'General Chemistry'}
- Known weaknesses: ${struggleList}
- Preferred analogy style: ${interests}

YOUR PERSONALITY:
- Warm, encouraging, never condescending or robotic
- You feel like a cool older student who genuinely gets it and wants to help
- You celebrate wins: "Yes! Exactly right." "That's it — you've got it."
- When wrong: never say "wrong" — say "almost, think about it this way..." or "close! the key thing you're missing is..."
- You're patient. If they don't get it, you try a completely different angle.
- You occasionally use light humour to keep things engaging

YOUR TEACHING METHOD:
- NEVER start with a formula. Always start with a story, scenario or question.
- Ask questions constantly — never lecture more than 2-3 sentences without checking in
- Break every complex idea into the smallest possible steps
- ${analogyGuide[interests] || analogyGuide.sport}
- Use "imagine..." and "picture this..." to set up scenarios
- After explaining, always ask: "Does that click? Want me to try a different way?"
- Celebrate every correct answer, even partial ones

REAL-WORLD TEACHING EXAMPLES:
- pH scale → "Think of it like the AFL injury scale. 0 is the most brutal injury possible (strongest acid), 14 is basically uninjured (strongest base), 7 is neutral — no injury. Each level is 10× worse than the last."
- Moles → "A mole is like a team roster. You don't say 'I have 6,020,000,000,000,000,000,000,000 atoms' just like you don't say 'I have 1 player per atom'. You say 1 mole — like saying '1 team'."
- Ionic bonding → "Metal atoms are like that generous teammate who always gives away the ball (electrons). Non-metals are the selfish ones who always want the ball. Ionic bonding is when the generous one finally gives it up and both are happy."
- Equilibrium → "It's like a game that never ends but stays at a draw. Both teams keep scoring but the scoreline never changes — that's dynamic equilibrium."

LESSON STRUCTURE:
1. Start by finding out what they already know ("Before we dive in, what do you already know about X?")
2. Hook them with a real-world scenario
3. Build the concept step by step, checking in constantly
4. Give a worked example together ("Let's do this one together")
5. Give them one to try solo ("Your turn — have a go")
6. Summarise the key points in dot points at the end

DOCUMENT CONTEXT (this is their actual school material — teach from this):
${docContext || 'No document uploaded yet — use general SACE curriculum knowledge for this topic.'}

IMPORTANT:
- Keep responses conversational and not too long — 3-5 sentences max per turn, then ask something
- Use line breaks generously to avoid walls of text
- If they ask something off-topic, say "Good question — let's park that for now and come back once we nail this"
- Always end your turn with either a question or an invitation to respond
- Format key terms in **bold** when first introduced`
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function LearnScreen({ profile, struggleMap, questions, subject, onBack, theme }) {
  const t = THEMES[theme]

  const [phase, setPhase]             = useState('setup') // setup | chat
  const [topic, setTopic]             = useState('')
  const [messages, setMessages]       = useState([])
  const [input, setInput]             = useState('')
  const [loading, setLoading]         = useState(false)
  const [docContext, setDocContext]    = useState('')
  const [docName, setDocName]         = useState('')
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [interests, setInterests]     = useState('sport')
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)
  const fileRef   = useRef(null)

  // Build struggle list from quiz data
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

  // Handle document upload
  const handleDocUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploadingDoc(true)
    setDocName(file.name)

    try {
      // Send file to Claude to extract text content
      const reader = new FileReader()
      reader.onload = async (ev) => {
        const base64 = ev.target.result.split(',')[1]
        const mediaType = file.type || 'application/octet-stream'

        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1000,
            messages: [{
              role: 'user',
              content: [
                {
                  type: 'document',
                  source: { type: 'base64', media_type: 'application/pdf', data: base64 },
                },
                {
                  type: 'text',
                  text: 'Extract all the educational content from this document. Return it as clean, structured text organized by topic. Include all key concepts, definitions, formulas, and examples. Be comprehensive.'
                }
              ]
            }]
          })
        })

        const data = await res.json()
        const extracted = data.content?.[0]?.text || ''
        setDocContext(extracted.slice(0, 8000)) // limit context size
        setUploadingDoc(false)
      }
      reader.readAsDataURL(file)
    } catch (err) {
      console.error(err)
      setUploadingDoc(false)
    }
  }

  // Start the lesson
  const startLesson = async () => {
    if (!topic.trim()) return
    setPhase('chat')
    setLoading(true)

    const systemPrompt = buildSystemPrompt(profile, topic, docContext, struggleTopics, interests)

    const openingPrompt = struggleTopics.length > 0 && struggleTopics[0]
      ? `Start the lesson. The student's biggest weakness is "${struggleTopics[0].subtopic}". Begin by warmly greeting them, acknowledging what they want to learn (${topic}), and opening with an engaging question to find out what they already know. Keep it short and natural.`
      : `Start the lesson on "${topic}". Warmly greet the student and open with an engaging question to find out what they already know. Keep it short and natural.`

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: systemPrompt,
          messages: [{ role: 'user', content: openingPrompt }]
        })
      })
      const data = await res.json()
      const reply = data.content?.[0]?.text || "Hey! Let's get started. What do you already know about this topic?"

      setMessages([{ role: 'assistant', content: reply, timestamp: Date.now() }])
    } catch (err) {
      setMessages([{ role: 'assistant', content: "Hey! I'm Titan, your SACE tutor. Let's dive in — what do you already know about this topic?", timestamp: Date.now() }])
    }
    setLoading(false)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  // Send a message
  const sendMessage = async () => {
    if (!input.trim() || loading) return
    const userMsg = { role: 'user', content: input.trim(), timestamp: Date.now() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    const systemPrompt = buildSystemPrompt(profile, topic, docContext, struggleTopics, interests)

    // Build conversation history for API
    const apiMessages = newMessages.map(m => ({ role: m.role, content: m.content }))

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: systemPrompt,
          messages: apiMessages
        })
      })
      const data = await res.json()
      const reply = data.content?.[0]?.text || "Let me think about that differently..."
      setMessages(prev => [...prev, { role: 'assistant', content: reply, timestamp: Date.now() }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I had a connection issue. Can you try again?", timestamp: Date.now() }])
    }
    setLoading(false)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  // Format message text — bold, line breaks
  const formatMessage = (text) => {
    return text.split('\n').map((line, i) => {
      const parts = line.split(/\*\*(.*?)\*\*/g)
      return (
        <span key={i}>
          {parts.map((part, j) =>
            j % 2 === 1
              ? <strong key={j} style={{ color: t.text, fontWeight: 700 }}>{part}</strong>
              : part
          )}
          {i < text.split('\n').length - 1 && <br />}
        </span>
      )
    })
  }

  // ── SETUP SCREEN ────────────────────────────────────────────────────────────
  if (phase === 'setup') return (
    <div style={{ minHeight: '100vh', background: t.bg, color: t.text, fontFamily: "'Plus Jakarta Sans', sans-serif", display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 20px' }}>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}`}</style>

      <div style={{ width: '100%', maxWidth: 520, animation: 'fadeUp 0.4s ease' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: `linear-gradient(135deg,${t.accent},${t.purple})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🎓</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: t.text }}>Learn with Titan</h1>
            <p style={{ margin: 0, fontSize: 13, color: t.textMuted }}>Your personal SACE tutor</p>
          </div>
        </div>

        {struggleTopics.length > 0 && (
          <div style={{ background: theme === 'dark' ? 'rgba(239,68,68,0.06)' : '#fff5f5', border: `1px solid ${theme === 'dark' ? 'rgba(239,68,68,0.15)' : 'rgba(220,38,38,0.15)'}`, borderRadius: 12, padding: '12px 16px', marginTop: 16, marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: t.danger, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>⚡ Titan suggests tackling these first</div>
            {struggleTopics.slice(0, 3).map(s => (
              <button key={s.subtopic} onClick={() => setTopic(s.subtopic)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', marginBottom: 4, borderRadius: 8, border: `1px solid ${t.border}`, background: topic === s.subtopic ? `${t.accent}15` : t.bgCard, color: topic === s.subtopic ? t.accent : t.textSub, fontSize: 13, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif', transition: 'all 0.15s'" }}>
                {s.subtopic} <span style={{ color: t.danger, fontSize: 11, marginLeft: 6 }}>{Math.round(s.rate * 100)}% error rate</span>
              </button>
            ))}
          </div>
        )}

        {/* Topic input */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: t.text, display: 'block', marginBottom: 8 }}>
            What do you want to learn today?
          </label>
          <input
            value={topic}
            onChange={e => setTopic(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && startLesson()}
            placeholder="e.g. pH calculations, Ionic bonding, The mole..."
            style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: `1px solid ${t.border}`, background: t.bgCard, color: t.text, fontSize: 14, fontFamily: "'Plus Jakarta Sans', sans-serif", outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        {/* Teaching style */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: t.text, display: 'block', marginBottom: 8 }}>
            How should Titan explain things?
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[{ id: 'sport', label: '🏈 Sport', desc: 'AFL, cricket, soccer' }, { id: 'gaming', label: '🎮 Gaming', desc: 'RPGs, strategy' }, { id: 'music', label: '🎵 Music', desc: 'beats, harmony' }].map(opt => (
              <button key={opt.id} onClick={() => setInterests(opt.id)} style={{ flex: 1, padding: '10px 8px', borderRadius: 10, border: `2px solid ${interests === opt.id ? t.accent : t.border}`, background: interests === opt.id ? `${t.accent}12` : t.bgCard, color: interests === opt.id ? t.accent : t.textMuted, fontSize: 12, fontWeight: interests === opt.id ? 700 : 500, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'all 0.15s', textAlign: 'center' }}>
                <div>{opt.label}</div>
                <div style={{ fontSize: 10, marginTop: 2, opacity: 0.7 }}>{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Document upload */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: t.text, display: 'block', marginBottom: 8 }}>
            Upload your class notes (optional)
          </label>
          <div
            onClick={() => fileRef.current?.click()}
            style={{ border: `2px dashed ${docContext ? t.accent : t.border}`, borderRadius: 12, padding: '16px', textAlign: 'center', cursor: 'pointer', background: docContext ? `${t.accent}08` : 'transparent', transition: 'all 0.2s' }}
          >
            {uploadingDoc ? (
              <div style={{ color: t.textMuted, fontSize: 13 }}>Processing document…</div>
            ) : docContext ? (
              <div>
                <div style={{ fontSize: 20, marginBottom: 4 }}>✅</div>
                <div style={{ fontSize: 13, color: t.accent, fontWeight: 600 }}>{docName}</div>
                <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>Titan will teach from your notes</div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 24, marginBottom: 4 }}>📄</div>
                <div style={{ fontSize: 13, color: t.textMuted }}>Click to upload PDF, PPTX or DOCX</div>
                <div style={{ fontSize: 11, color: t.textFaint, marginTop: 2 }}>Titan will teach from your actual class content</div>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept=".pdf,.pptx,.docx,.txt" onChange={handleDocUpload} style={{ display: 'none' }} />
        </div>

        <button
          onClick={startLesson}
          disabled={!topic.trim() || uploadingDoc}
          style={{ width: '100%', padding: '16px', borderRadius: 12, border: 'none', background: topic.trim() && !uploadingDoc ? `linear-gradient(135deg,${t.accent},${t.accentBlue})` : t.border, color: topic.trim() ? '#fff' : t.textFaint, fontSize: 15, fontWeight: 800, cursor: topic.trim() ? 'pointer' : 'default', fontFamily: "'Plus Jakarta Sans', sans-serif", boxShadow: topic.trim() ? `0 8px 28px ${t.accent}40` : 'none', transition: 'all 0.2s' }}
        >
          Start Learning →
        </button>
      </div>
    </div>
  )

  // ── CHAT / LESSON SCREEN ────────────────────────────────────────────────────
  return (
    <div style={{ height: '100vh', background: t.bg, color: t.text, fontFamily: "'Plus Jakarta Sans', sans-serif", display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        .msg-bubble { animation: fadeUp 0.25s ease; }
      `}</style>

      {/* Top bar */}
      <div style={{ background: t.bgNav, borderBottom: `1px solid ${t.border}`, padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => setPhase('setup')} style={{ background: 'transparent', border: 'none', color: t.textMuted, fontSize: 13, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif", padding: 0 }}>←</button>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: `linear-gradient(135deg,${t.accent},${t.purple})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🎓</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>Titan</div>
            <div style={{ fontSize: 11, color: t.accent }}>Teaching: {topic}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {docName && <span style={{ fontSize: 11, background: `${t.accent}15`, color: t.accent, padding: '3px 8px', borderRadius: 6, border: `1px solid ${t.accent}30` }}>📄 {docName.slice(0, 20)}{docName.length > 20 ? '…' : ''}</span>}
          <button onClick={onBack} style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 12, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Exit</button>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {messages.map((msg, i) => (
          <div key={i} className="msg-bubble" style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 10, alignItems: 'flex-end' }}>

            {msg.role === 'assistant' && (
              <div style={{ width: 30, height: 30, borderRadius: 9, background: `linear-gradient(135deg,${t.accent},${t.purple})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>🎓</div>
            )}

            <div style={{
              maxWidth: '72%',
              padding: '12px 16px',
              borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
              background: msg.role === 'user'
                ? `linear-gradient(135deg,${t.accent},${t.accentBlue})`
                : theme === 'dark' ? '#0c1525' : '#fff',
              color: msg.role === 'user' ? '#fff' : t.text,
              fontSize: 14, lineHeight: 1.7,
              border: msg.role === 'user' ? 'none' : `1px solid ${t.border}`,
              boxShadow: theme === 'light' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
            }}>
              {formatMessage(msg.content)}
            </div>

            {msg.role === 'user' && (
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: `linear-gradient(135deg,${t.accent},${t.purple})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                {profile.display_name[0].toUpperCase()}
              </div>
            )}
          </div>
        ))}

        {/* Typing indicator */}
        {loading && (
          <div className="msg-bubble" style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: `linear-gradient(135deg,${t.accent},${t.purple})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>🎓</div>
            <div style={{ padding: '14px 18px', borderRadius: '18px 18px 18px 4px', background: theme === 'dark' ? '#0c1525' : '#fff', border: `1px solid ${t.border}`, display: 'flex', gap: 5, alignItems: 'center' }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: t.accent, animation: 'pulse 1.2s ease infinite', animationDelay: `${i * 0.2}s` }} />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Quick reply suggestions */}
      {messages.length > 0 && messages.length < 4 && !loading && (
        <div style={{ padding: '0 20px 10px', display: 'flex', gap: 8, overflowX: 'auto' }}>
          {["I don't understand yet", "Can you give an example?", "I think I get it!", "Try a different analogy"].map(suggestion => (
            <button key={suggestion} onClick={() => { setInput(suggestion); setTimeout(() => { setInput(''); sendMessage() }, 0) }}
              style={{ padding: '7px 14px', borderRadius: 20, border: `1px solid ${t.border}`, background: t.bgCard, color: t.textSub, fontSize: 12, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif", whiteSpace: 'nowrap', flexShrink: 0 }}>
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {/* Input bar */}
      <div style={{ padding: '12px 16px', borderTop: `1px solid ${t.border}`, background: t.bgNav, display: 'flex', gap: 10, alignItems: 'flex-end', flexShrink: 0 }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
          placeholder="Type your answer or question…"
          rows={1}
          style={{ flex: 1, padding: '11px 14px', borderRadius: 12, border: `1px solid ${t.border}`, background: t.bgCard, color: t.text, fontSize: 14, fontFamily: "'Plus Jakarta Sans', sans-serif", outline: 'none', resize: 'none', maxHeight: 120, overflowY: 'auto', lineHeight: 1.5 }}
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || loading}
          style={{ width: 44, height: 44, borderRadius: 12, border: 'none', background: input.trim() && !loading ? `linear-gradient(135deg,${t.accent},${t.accentBlue})` : t.border, color: '#fff', fontSize: 18, cursor: input.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}
        >
          ↑
        </button>
      </div>
    </div>
  )
}