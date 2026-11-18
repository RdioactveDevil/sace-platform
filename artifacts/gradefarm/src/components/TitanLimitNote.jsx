import { useEffect, useState } from 'react'
import { minutesUntilReset, formatWait } from '../lib/freeLimit'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const HAND = "'Caveat', 'Segoe Print', 'Comic Sans MS', cursive"
const PEN = '#c2362d' // the red pen, on white paper in every theme

/**
 * Learn, out of free Titan messages: in place of the reply box, a paper slip
 * with where the chat paused (Titan's last question, in red-pen "Paused here")
 * and when Titan's back, then Carry on now (a plan), Practise <topic> and
 * See you tomorrow. With no chat yet, the slip says when Titan's back.
 */
export default function TitanLimitNote({ t, question = '', practiseLabel = '', onCarryOn, onPractise, onDone }) {
  const [wait, setWait] = useState(() => minutesUntilReset())
  useEffect(() => {
    const id = setInterval(() => setWait(minutesUntilReset()), 30000)
    return () => clearInterval(id)
  }, [])
  const pill = (primary) => ({
    padding: '10px 16px', borderRadius: 999, fontFamily: FONT_B, fontSize: 13.5, fontWeight: primary ? 800 : 600, cursor: 'pointer', whiteSpace: 'nowrap',
    border: primary ? 'none' : `1px solid ${t.border}`, background: primary ? t.text : 'transparent', color: primary ? t.bg : t.text,
  })

  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', gap: '16px 24px', flexWrap: 'wrap', padding: '16px 18px', borderRadius: 18, background: t.bgCard, border: `1px solid ${t.border}`, fontFamily: FONT_B, color: t.text }}>
      <style>{"@import url('https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&display=swap');"}</style>
      <div style={{ flex: '0 1 250px', minWidth: 200, background: '#fff', color: '#2a2118', padding: '12px 15px 14px', boxShadow: '0 8px 22px rgba(40,25,5,0.14)', transform: 'rotate(-2deg)' }}>
        <div style={{ fontFamily: HAND, fontSize: 24, fontWeight: 700, color: PEN, lineHeight: 1 }}>{question ? 'Paused here' : 'Back at midnight'}</div>
        <div style={{ fontSize: 14, lineHeight: 1.45, marginTop: 6 }}>{question || `Titan's back in ${formatWait(wait)}.`}</div>
      </div>
      <div style={{ flex: '1 1 280px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 16, fontWeight: 800 }}>That&rsquo;s today&rsquo;s free Titan messages.</div>
        <div style={{ fontSize: 13.5, color: t.textMuted, lineHeight: 1.5 }}>
          {question ? <>This chat is saved. Titan picks it up right here at midnight, in {formatWait(wait)}.</> : <>Your chats are saved. Titan&rsquo;s back at midnight, in {formatWait(wait)}.</>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <button type="button" onClick={onCarryOn} style={pill(true)}>Carry on now</button>
          {onPractise && practiseLabel && <button type="button" onClick={onPractise} style={pill(false)}>Practise {practiseLabel}</button>}
          {onDone && <button type="button" onClick={onDone} style={pill(false)}>See you tomorrow</button>}
        </div>
      </div>
    </div>
  )
}
