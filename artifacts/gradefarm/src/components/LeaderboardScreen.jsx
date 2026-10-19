import { useState, useEffect, useMemo } from 'react'
import { fetchClassLeaderboards } from '../lib/db'
import { getLevel } from '../lib/engine'
import { Trophy, Medal, Flame } from 'lucide-react'
import { THEMES } from '../lib/theme'
import { SkeletonRow } from './Skeleton'
import RankIcon from './RankIcon'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const FONT_D = "'Sifonn Pro', sans-serif"
const GOLD = '#f1be43'

const CLASS_KEY = 'gf-leaderboard-class'

// Leaderboards are per class: students compete with their classmates, not
// everyone on the platform.
export default function LeaderboardScreen({ profile, theme, embedded }) {
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [classId, setClassId] = useState(() => {
    try { return localStorage.getItem(CLASS_KEY) || '' } catch { return '' }
  })
  const t = THEMES[theme]

  useEffect(() => {
    fetchClassLeaderboards()
      .then(setClasses)
      .catch(err => setError(err.message || 'Could not load the leaderboard.'))
      .finally(() => setLoading(false))
  }, [])

  // The remembered class, else the first class the user is in, else the first.
  const active = useMemo(
    () => classes.find(c => c.id === classId) || classes.find(c => c.is_member) || classes[0] || null,
    [classes, classId],
  )
  const pickClass = (id) => {
    setClassId(id)
    try { localStorage.setItem(CLASS_KEY, id) } catch {}
  }

  const visibleBoard = active?.board || []
  const me = visibleBoard.find(r => r.id === profile.id)

  return (
    <div style={{ height: embedded ? '100%' : '100vh', minHeight: 0, background: embedded ? 'transparent' : t.bg, color: t.text, fontFamily: FONT_B, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .lb-scroll { flex: 1; min-height: 0; overflow-y: auto; }
        .lb-inner { padding: 28px 32px 32px; animation: fadeUp 0.3s ease; }
        @media (max-width: 860px) { .lb-inner { padding: 18px 14px 22px; } }
      `}</style>

      <div className="lb-scroll">
        <div className="lb-inner">
          <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>Competition</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
            <div>
              <h1 style={{ fontSize: 26, fontFamily: FONT_D, fontWeight: 400, letterSpacing: 1.5, margin: 0, color: t.text }}>Leaderboard</h1>
              <div style={{ fontSize: 13, color: t.textMuted, marginTop: 6 }}>
                {active ? `${active.name} · ranked by XP` : 'Ranked by XP within your class'}
              </div>
            </div>
            {classes.length > 1 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 10, padding: 4, maxWidth: '100%' }}>
                {classes.map(c => (
                  <button
                    key={c.id}
                    onClick={() => pickClass(c.id)}
                    style={{
                      padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: FONT_B,
                      background: active?.id === c.id ? GOLD : 'transparent',
                      color:      active?.id === c.id ? '#080d28' : t.textMuted,
                      transition: 'background 0.15s, color 0.15s',
                    }}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} theme={theme} />)}
            </div>
          ) : error ? (
            <div style={{ padding: '28px 20px', background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, textAlign: 'center', fontSize: 13, color: t.danger }}>{error}</div>
          ) : !active ? (
            <div style={{ padding: '36px 24px', background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, textAlign: 'center' }}>
              <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'center', color: GOLD }}><Trophy size={30} aria-hidden="true" /></div>
              <div style={{ fontSize: 15, fontWeight: 700, color: t.text, marginBottom: 6 }}>You're not in a class yet</div>
              <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.6, maxWidth: 380, margin: '0 auto' }}>
                When your tutor adds you to a class, you'll see how you rank against your classmates here.
              </div>
            </div>
          ) : visibleBoard.length === 0 ? (
            <div style={{ padding: '28px 20px', background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, textAlign: 'center', fontSize: 13, color: t.textMuted }}>
              No students in {active.name} yet.
            </div>
          ) : (
            <>
              {visibleBoard.length >= 3 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 12, marginBottom: 32, flexWrap: 'wrap' }}>
                  {[visibleBoard[1], visibleBoard[0], visibleBoard[2]].map((p, pos) => {
                    if (!p) return <div key={pos} style={{ width: 88 }} />
                    const heights = [96, 124, 78]
                    const colors = [t.textMuted, t.xp, '#cd7c2f']
                    const isMe = p.id === profile.id
                    return (
                      <div key={p.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                        <div style={{ display: 'flex' }}><Medal size={24} color={colors[pos]} aria-hidden="true" /></div>
                        <div style={{ width: 84, height: heights[pos], background: isMe ? 'rgba(241,190,67,0.12)' : t.bgCard, border: `2px solid ${isMe ? GOLD : colors[pos]}`, borderRadius: '12px 12px 6px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, boxShadow: theme === 'light' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none' }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: isMe ? GOLD : colors[pos], textAlign: 'center', padding: '0 6px' }}>{p.display_name.split(' ')[0]}</div>
                          <div style={{ fontSize: 10, color: t.textMuted, fontWeight: 600 }}>{p.xp.toLocaleString()}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {visibleBoard.map((p) => {
                  const isMe = p.id === profile.id
                  const i = p.position - 1
                  const lvl = getLevel(p.xp)
                  return (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', background: isMe ? 'rgba(241,190,67,0.08)' : t.bgCard, border: `1px solid ${isMe ? 'rgba(241,190,67,0.4)' : t.border}`, borderRadius: 12, boxShadow: theme === 'light' ? '0 1px 3px rgba(0,0,0,0.05)' : 'none' }}>
                      <div style={{ fontSize: 14, fontWeight: 800, width: 28, textAlign: 'center', color: i < 3 ? [t.xp, t.textSub, '#cd7c2f'][i] : t.textFaint }}>{i + 1}</div>
                      <div style={{ display: 'flex', color: GOLD }}><RankIcon level={lvl} size={18} /></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: isMe ? GOLD : t.text }}>{p.display_name}{isMe ? ' (You)' : ''}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: GOLD }}>{p.xp.toLocaleString()} XP</div>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 2 }}>
                          {p.streak > 0 && <span style={{ fontSize: 11, color: t.danger, display: 'inline-flex', alignItems: 'center', gap: 3 }}><Flame size={12} aria-hidden="true" /> {p.streak}</span>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {me && (
                <div style={{ marginTop: 16, padding: '12px 18px', background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 10, fontSize: 13, color: t.textMuted, textAlign: 'center' }}>
                  Your rank in {active.name}: <strong style={{ color: t.text }}>#{me.position}</strong> of {visibleBoard.length}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
