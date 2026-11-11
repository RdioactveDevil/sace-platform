import { useEffect, useRef, useState } from 'react'
import { Share2 } from 'lucide-react'
import { THEMES } from '../lib/theme'
import { RANK_TIERS, RANKS, rankAccuracy } from '../lib/engine'
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

/**
 * Shown the moment a student reaches a new rank: the badge, what it took and
 * what the next one needs. Students under 15 don't get a Share button.
 */
export default function RankUpModal({ theme = 'dark', level, profile, onClose }) {
  const t = THEMES[theme]
  const rankName = RANKS[level]
  const next = RANK_TIERS[level + 1]
  const tier = RANK_TIERS[level]
  const accuracy = Math.round(rankAccuracy(profile) * 100)
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

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(8,8,10,0.86)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: FONT_B, color: t.text }}>
      <Celebration burst={1} />
      <section role="dialog" aria-modal="true" aria-labelledby="gf-rankup-title"
        style={{ width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center', animation: 'gfRankIn 0.45s cubic-bezier(.2,1.4,.4,1)' }}>
        <style>{`@keyframes gfRankIn { from { opacity: 0; transform: scale(0.85) } to { opacity: 1; transform: scale(1) } } @media (prefers-reduced-motion: reduce) { [aria-labelledby="gf-rankup-title"] { animation: none !important } }`}</style>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: t.goldText, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Rank up</span>
        <div aria-hidden="true" style={{ width: 136, height: 136, borderRadius: 32, background: t.bgCard, border: `3px solid ${t.accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: t.shadowGold }}>
          <RankIcon level={level} size={72} color={t.accent} strokeWidth={1.6} />
        </div>
        <h2 id="gf-rankup-title" style={{ margin: 0, fontSize: 'clamp(30px, 7vw, 40px)', fontWeight: 800, lineHeight: 1.1 }}>
          You're now <span style={{ color: t.goldText }}>{rankName}</span>
        </h2>
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: t.textSub }}>
          {Number(profile?.xp || 0).toLocaleString('en-AU')} XP{tier.accuracy > 0 ? ` with ${accuracy}% recent accuracy. ${rankName} needs both, so this one was earned on right answers.` : '. Keep it going.'}
        </p>
        {next && (
          <div style={{ width: '100%', boxSizing: 'border-box', background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 14, padding: '14px 16px', textAlign: 'left', display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', fontSize: 14 }}>
            <strong>Next: {next.name}</strong>
            <span style={{ color: t.textMuted }}>{next.xp.toLocaleString('en-AU')} XP{next.accuracy > 0 ? ` · ${Math.round(next.accuracy * 100)}% accuracy` : ''}</span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          {canShare && (
            <button type="button" onClick={share}
              style={{ minHeight: 46, padding: '0 20px', borderRadius: 12, border: `1px solid ${t.borderMid}`, background: 'transparent', color: t.textSub, fontFamily: FONT_B, fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Share2 size={17} aria-hidden="true" /> Share badge
            </button>
          )}
          <button ref={closeRef} type="button" onClick={onClose}
            style={{ minHeight: 46, padding: '0 30px', borderRadius: 12, border: 'none', background: t.accent, color: '#18181b', fontFamily: FONT_B, fontSize: 16, fontWeight: 800, cursor: 'pointer' }}>
            Continue
          </button>
        </div>
        {shareNote && <div role="status" style={{ fontSize: 13, color: t.textMuted }}>{shareNote}</div>}
        {canShare && <p style={{ margin: 0, fontSize: 12.5, color: t.textMuted }}>The image shows your first name and rank, nothing else.</p>}
      </section>
    </div>
  )
}
