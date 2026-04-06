import { useState, useEffect } from 'react'
import { getLeaderboard } from '../lib/db'
import { RANK_ICONS, getLevel } from '../lib/engine'
import { THEMES } from '../lib/theme'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const GOLD = '#f1be43'

export default function LeaderboardScreen({ profile, theme, embedded }) {
  const [board, setBoard] = useState([])
  const [loading, setLoading] = useState(true)
  const t = THEMES[theme]

  useEffect(() => {
    getLeaderboard(20).then((data) => {
      setBoard(data)
      setLoading(false)
    })
  }, [])

  const myPosition = board.findIndex((r) => r.id === profile.id) + 1

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
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, color: t.text }}>Leaderboard</h1>
          <div style={{ fontSize: 13, color: t.textMuted, marginTop: 6, marginBottom: 28 }}>Weekly rankings · resets every Monday</div>

          {loading ? (
            <div style={{ color: t.textMuted, padding: '40px 0' }}>Loading…</div>
          ) : (
            <>
              {board.length >= 3 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 12, marginBottom: 32, flexWrap: 'wrap' }}>
                  {[board[1], board[0], board[2]].map((p, pos) => {
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
                {board.map((p, i) => {
                  const isMe = p.id === profile.id
                  const lvl = getLevel(p.xp)
                  const rIcon = RANK_ICONS[Math.min(lvl, RANK_ICONS.length - 1)]
                  return (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', background: isMe ? 'rgba(241,190,67,0.08)' : t.bgCard, border: `1px solid ${isMe ? 'rgba(241,190,67,0.4)' : t.border}`, borderRadius: 12, boxShadow: theme === 'light' ? '0 1px 3px rgba(0,0,0,0.05)' : 'none' }}>
                      <div style={{ fontSize: 14, fontWeight: 800, width: 28, textAlign: 'center', color: i < 3 ? [t.xp, t.textSub, '#cd7c2f'][i] : t.textFaint }}>{i + 1}</div>
                      <div style={{ fontSize: 18 }}>{rIcon}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: isMe ? GOLD : t.text }}>{p.display_name}{isMe ? ' (You)' : ''}</div>
                        {p.school && <div style={{ fontSize: 11, color: t.textMuted, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.school}</div>}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: GOLD }}>{p.xp.toLocaleString()} XP</div>
                        {p.streak > 0 && <div style={{ fontSize: 11, color: t.danger, marginTop: 2 }}>🔥 {p.streak}</div>}
                      </div>
                    </div>
                  )
                })}
              </div>

              {myPosition > 0 && (
                <div style={{ marginTop: 16, padding: '12px 18px', background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 10, fontSize: 13, color: t.textMuted, textAlign: 'center' }}>
                  You're ranked <strong style={{ color: t.text }}>#{myPosition}</strong> right now.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
