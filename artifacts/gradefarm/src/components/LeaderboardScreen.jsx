import { useState, useEffect, useMemo } from 'react'
import { getLeaderboard } from '../lib/db'
import { RANK_ICONS, getLevel } from '../lib/engine'
import { THEMES } from '../lib/theme'
import { SkeletonRow } from './Skeleton'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const GOLD = '#f1be43'

export default function LeaderboardScreen({ profile, theme, embedded }) {
  const [board, setBoard] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('all')
  const t = THEMES[theme]

  useEffect(() => {
    getLeaderboard(50).then((data) => {
      setBoard(data)
      setLoading(false)
    })
  }, [])

  const hasSchool = !!profile.school
  const visibleBoard = useMemo(() => {
    if (tab === 'school' && hasSchool) return board.filter(r => r.school === profile.school)
    return board.slice(0, 20)
  }, [board, tab, hasSchool, profile.school])

  const myPosition = visibleBoard.findIndex((r) => r.id === profile.id) + 1
  const myGlobalPosition = board.findIndex((r) => r.id === profile.id) + 1

  return (
    <div style={{ height: embedded ? '100%' : '100vh', minHeight: 0, background: embedded ? 'transparent' : t.bg, color: t.text, fontFamily: FONT_B, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .lb-scroll { flex: 1; min-height: 0; overflow-y: auto; }
        .lb-inner { max-width: 980px; padding: 28px 32px 32px; animation: fadeUp 0.3s ease; }
        @media (max-width: 860px) { .lb-inner { padding: 18px 14px 22px; } }
      `}</style>

      <div className="lb-scroll">
        <div className="lb-inner">
          <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>Competition</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, color: t.text }}>Leaderboard</h1>
              <div style={{ fontSize: 13, color: t.textMuted, marginTop: 6 }}>Top players by XP</div>
            </div>
            {hasSchool && (
              <div style={{ display: 'flex', gap: 6, background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 10, padding: 4 }}>
                {['all', 'school'].map(id => (
                  <button
                    key={id}
                    onClick={() => setTab(id)}
                    style={{
                      padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: FONT_B,
                      background: tab === id ? GOLD : 'transparent',
                      color:      tab === id ? '#080d28' : t.textMuted,
                      transition: 'background 0.15s, color 0.15s',
                    }}
                  >
                    {id === 'all' ? 'Global' : 'My School'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} theme={theme} />)}
            </div>
          ) : (
            <>
              {visibleBoard.length >= 3 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 12, marginBottom: 32, flexWrap: 'wrap' }}>
                  {[visibleBoard[1], visibleBoard[0], visibleBoard[2]].map((p, pos) => {
                    if (!p) return <div key={pos} style={{ width: 88 }} />
                    const heights = [96, 124, 78]
                    const medals = ['🥈', '🥇', '🥉']
                    const colors = [t.textMuted, t.xp, '#cd7c2f']
                    const isMe = p.id === profile.id
                    return (
                      <div key={p.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                        <div style={{ fontSize: 24 }}>{medals[pos]}</div>
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
                {visibleBoard.map((p, i) => {
                  const isMe = p.id === profile.id
                  const lvl = getLevel(p.xp)
                  const rIcon = RANK_ICONS[Math.min(lvl, RANK_ICONS.length - 1)]
                  return (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', background: isMe ? 'rgba(241,190,67,0.08)' : t.bgCard, border: `1px solid ${isMe ? 'rgba(241,190,67,0.4)' : t.border}`, borderRadius: 12, boxShadow: theme === 'light' ? '0 1px 3px rgba(0,0,0,0.05)' : 'none' }}>
                      <div style={{ fontSize: 14, fontWeight: 800, width: 28, textAlign: 'center', color: i < 3 ? [t.xp, t.textSub, '#cd7c2f'][i] : t.textFaint }}>{i + 1}</div>
                      <div style={{ fontSize: 18 }}>{rIcon}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: isMe ? GOLD : t.text }}>{p.display_name}{isMe ? ' (You)' : ''}</div>
                        {p.school && tab !== 'school' && <div style={{ fontSize: 11, color: t.textMuted, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.school}</div>}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: GOLD }}>{p.xp.toLocaleString()} XP</div>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 2 }}>
                          {p.streak > 0 && <span style={{ fontSize: 11, color: t.danger }}>🔥 {p.streak}</span>}
                          {p.best_streak > 0 && <span style={{ fontSize: 11, color: t.textFaint }}>best {p.best_streak}</span>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {myGlobalPosition > 0 && myPosition === 0 && (
                <div style={{ marginTop: 16, padding: '12px 18px', background: 'rgba(241,190,67,0.06)', border: '1px solid rgba(241,190,67,0.25)', borderRadius: 10, fontSize: 13, color: t.textMuted, textAlign: 'center' }}>
                  Your global rank: <strong style={{ color: GOLD }}>#{myGlobalPosition}</strong>
                </div>
              )}
              {myPosition > 0 && (
                <div style={{ marginTop: 16, padding: '12px 18px', background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 10, fontSize: 13, color: t.textMuted, textAlign: 'center' }}>
                  {tab === 'school' ? 'Your school rank:' : 'Your rank:'} <strong style={{ color: t.text }}>#{myPosition}</strong>
                  {tab === 'school' && myGlobalPosition > 0 && <span> · Global: <strong style={{ color: GOLD }}>#{myGlobalPosition}</strong></span>}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
