import { useEffect, useRef, useState } from 'react'
import { Share2, Lock, ChevronRight, Check } from 'lucide-react'
import { THEMES } from '../lib/theme'
import { RANKS, rankAccuracy, nextRankChecklist } from '../lib/engine'
import { needsParentConsent } from '../lib/parentConsent'
import RankIcon from './RankIcon'
import Celebration from './Celebration'

const FONT_B = "'Plus Jakarta Sans', sans-serif"

/** A PNG of the badge: first name only, for sharing. */
async function badgeImage(rankName, firstName) {
  const W = 1080
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = W
  const c = canvas.getContext('2d')
  c.fillStyle = '#18181b'
  c.fillRect(0, 0, W, W)
  c.strokeStyle = '#e2b54c'
  c.lineWidth = 16
  c.beginPath()
  c.moveTo(540, 160); c.lineTo(760, 240); c.lineTo(760, 420)
  c.quadraticCurveTo(760, 600, 540, 700); c.quadraticCurveTo(320, 600, 320, 420)
  c.lineTo(320, 240); c.closePath(); c.stroke()
  c.fillStyle = '#e2b54c'
  c.textAlign = 'center'
  c.font = "800 120px 'Plus Jakarta Sans', sans-serif"
  c.fillText('★', 540, 480)
  c.fillStyle = '#ececef'
  c.font = "800 84px 'Plus Jakarta Sans', sans-serif"
  c.fillText(rankName, 540, 830)
  c.fillStyle = '#a1a1aa'
  c.font = "600 44px 'Plus Jakarta Sans', sans-serif"
  c.fillText(`${firstName ? `${firstName} reached` : 'Reached'} ${rankName} on gradefarm.`, 540, 920)
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
}

// Each rank's metal: [light, dark]. Bronze I–II, Silver I–II share theirs.
const METALS = [
  ['#bbf7d0', '#15803d'], // Rookie
  ['#f3cba4', '#9a5524'], ['#f3cba4', '#9a5524'], // Bronze
  ['#f4f6fa', '#7d8796'], ['#f4f6fa', '#7d8796'], // Silver
  ['#fde68a', '#b7791f'], // Gold
  ['#d5f3f1', '#3f8f8c'], // Platinum
  ['#dbeafe', '#2b7fc4'], // Diamond
  ['#ede9fe', '#6d3fd1'], // Master
  ['#fecdd3', '#b4233f'], // Grandmaster
  ['#fde68a', '#c2410c'], // Legend
]
const metal = (level) => METALS[Math.max(0, Math.min(level, METALS.length - 1))]

/** A rank's medal: a ring in its metal around its icon. `size` is the outer width. */
function Medal({ level, size, ring = true }) {
  const [light, dark] = metal(level)
  const inner = Math.round(size * (ring ? 0.8 : 1))
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
      background: ring ? `conic-gradient(from 200deg, ${light}, ${dark}, ${light}, ${dark}, ${light})` : `linear-gradient(150deg, ${light}, ${dark})`,
      boxShadow: ring ? `0 10px 24px -10px ${dark}` : 'none',
    }}>
      {ring ? (
        <div style={{ width: inner, height: inner, borderRadius: '50%', display: 'grid', placeItems: 'center', background: `linear-gradient(160deg, #ffffff, ${light})` }}>
          <RankIcon level={level} size={Math.round(size * 0.4)} color={dark} strokeWidth={1.8} />
        </div>
      ) : <RankIcon level={level} size={Math.round(size * 0.5)} color="#ffffff" strokeWidth={2} />}
    </div>
  )
}

/**
 * Shown the moment a student reaches a new rank: the rank before, this one
 * and the next one (locked), then what the next one still needs. Students
 * under 15 don't get a Share button.
 */
export default function RankUpModal({ theme = 'dark', level, profile, onClose }) {
  const t = THEMES[theme]
  const rankName = RANKS[level]
  const prevName = RANKS[level - 1]
  const nextName = RANKS[level + 1]
  const checklist = nextRankChecklist(level, profile?.xp, rankAccuracy(profile))
  const canShare = !needsParentConsent(profile?.dob, profile?.year_level)
  const [shareNote, setShareNote] = useState('')
  const closeRef = useRef(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const share = async () => {
    try {
      const firstName = String(profile?.display_name || '').trim().split(/\s+/)[0] || ''
      const blob = await badgeImage(rankName, firstName)
      if (!blob) throw new Error('no image')
      const file = new File([blob], `gradefarm-${rankName.toLowerCase().replace(/\s+/g, '-')}.png`, { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `${rankName} on gradefarm` })
        return
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = file.name
      a.click()
      URL.revokeObjectURL(url)
      setShareNote('Badge saved as an image.')
    } catch (e) {
      if (e?.name !== 'AbortError') setShareNote("Couldn't make the image just now.")
    }
  }

  const step = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 72, flexShrink: 0 }
  const arrow = <ChevronRight size={20} strokeWidth={2.4} color={t.borderMid} aria-hidden="true" style={{ flexShrink: 0, marginBottom: 22 }} />

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(12,16,55,0.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: FONT_B, color: t.text }}>
      <Celebration burst={1} />
      <section role="dialog" aria-modal="true" aria-labelledby="gf-rankup-title"
        style={{ width: '100%', maxWidth: 420, boxSizing: 'border-box', background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 22, padding: '24px 20px 20px', boxShadow: '0 30px 70px -25px rgba(12,16,55,0.55)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center', animation: 'gfRankIn 0.45s cubic-bezier(.2,1.4,.4,1)' }}>
        <style>{`
          @keyframes gfRankIn { from { opacity: 0; transform: scale(0.88) } to { opacity: 1; transform: scale(1) } }
          @keyframes gfRankMedal { 0% { transform: scale(0.6); opacity: 0 } 60% { transform: scale(1.08); opacity: 1 } 100% { transform: scale(1) } }
          @media (prefers-reduced-motion: reduce) { [aria-labelledby="gf-rankup-title"], .gf-rank-now { animation: none !important } }
        `}</style>
        <span style={{ fontSize: 12, fontWeight: 800, color: t.textMuted, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Rank up</span>

        {/* The ladder: the rank before, this one, the next (locked). */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, width: '100%' }}>
          {prevName && (
            <>
              <div style={{ ...step, opacity: 0.55 }}>
                <Medal level={level - 1} size={50} ring={false} />
                <span style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.2 }}>{prevName}</span>
              </div>
              {arrow}
            </>
          )}
          <div style={{ ...step, width: 108 }}>
            <div className="gf-rank-now" style={{ borderRadius: '50%', boxShadow: `0 0 0 5px ${t.accent}33`, animation: 'gfRankMedal 0.6s 0.15s cubic-bezier(.2,1.4,.4,1) both' }}>
              <Medal level={level} size={88} />
            </div>
            <span style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.2 }}>{rankName}</span>
          </div>
          {nextName && (
            <>
              {arrow}
              <div style={step}>
                <div style={{ width: 50, height: 50, borderRadius: '50%', border: `2px dashed ${t.borderMid}`, boxSizing: 'border-box', display: 'grid', placeItems: 'center', color: t.textMuted }}>
                  <Lock size={20} strokeWidth={2} aria-hidden="true" />
                </div>
                <span style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.2, color: t.textMuted }}>{nextName}</span>
              </div>
            </>
          )}
        </div>

        <h2 id="gf-rankup-title" style={{ margin: 0, fontSize: 'clamp(24px, 6.5vw, 28px)', fontWeight: 800, lineHeight: 1.15 }}>
          {nextName ? `You're now ${rankName}` : `You're a ${rankName}`}
        </h2>

        {checklist.length > 0 && (
          <div style={{ width: '100%', boxSizing: 'border-box', textAlign: 'left', background: t.bgHover, borderRadius: 14, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
            <strong>For {nextName}</strong>
            {checklist.map(item => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {item.done
                  ? <Check size={16} strokeWidth={3} color={t.success} aria-label="Done" />
                  : <span aria-label="Still to do" style={{ width: 14, height: 14, margin: '0 1px', borderRadius: '50%', border: `2px solid ${t.borderMid}`, boxSizing: 'border-box', flexShrink: 0 }} />}
                <span style={{ flex: 1 }}>{item.label}</span>
                <span style={{ color: t.textMuted }}>{item.now}</span>
              </div>
            ))}
          </div>
        )}
        {!nextName && <p style={{ margin: 0, fontSize: 15, color: t.textSub }}>The top rank. Nothing left to unlock.</p>}

        <div style={{ display: 'flex', gap: 10, width: '100%' }}>
          {canShare && (
            <button type="button" onClick={share}
              style={{ flex: '1 1 0', minWidth: 0, justifyContent: 'center', whiteSpace: 'nowrap', minHeight: 46, padding: '0 10px', borderRadius: 12, border: `1px solid ${t.borderMid}`, background: 'transparent', color: t.textSub, fontFamily: FONT_B, fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Share2 size={17} aria-hidden="true" /> Share badge
            </button>
          )}
          <button ref={closeRef} type="button" onClick={onClose}
            style={{ flex: '1 1 0', minWidth: 0, minHeight: 46, padding: '0 14px', borderRadius: 12, border: 'none', background: t.accent, color: '#18181b', fontFamily: FONT_B, fontSize: 16, fontWeight: 800, cursor: 'pointer' }}>
            Continue
          </button>
        </div>
        {shareNote && <div role="status" style={{ fontSize: 13, color: t.textMuted }}>{shareNote}</div>}
        {canShare && <p style={{ margin: 0, fontSize: 12, color: t.textMuted }}>The image shows your first name and rank, nothing else.</p>}
      </section>
    </div>
  )
}
