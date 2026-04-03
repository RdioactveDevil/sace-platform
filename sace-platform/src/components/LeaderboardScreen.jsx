import { useState, useEffect } from 'react'
import { getLeaderboard } from '../lib/db'
import { RANKS, RANK_ICONS, getLevel } from '../lib/engine'

export default function LeaderboardScreen({ profile, onBack }) {
  const [board, setBoard]     = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getLeaderboard(20).then(data => { setBoard(data); setLoading(false) })
  }, [])

  const myPosition = board.findIndex(r => r.id === profile.id) + 1

  return (
    <div style={{
      minHeight: '100vh', background: '#070c16', color: '#e2e8f0',
      fontFamily: "'Syne', sans-serif", padding: '20px 16px 40px',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      backgroundImage: 'radial-gradient(ellipse at 80% 10%, rgba(245,158,11,0.06) 0%, transparent 50%)',
    }}>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}`}</style>

      <div style={{
        width: '100%', maxWidth: 620,
        background: 'rgba(12,21,37,0.97)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 18, padding: '22px 22px',
        animation: 'fadeUp 0.4s ease',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, color: '#f59e0b', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700 }}>
              SACE Chemistry
            </div>
            <h2 style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 800 }}>Leaderboard</h2>
          </div>
          <button onClick={onBack} style={{
            padding: '8px 14px', borderRadius: 8, border: '1px solid #1e293b',
            background: 'transparent', color: '#475569', fontSize: 12,
            cursor: 'pointer', fontFamily: "'Syne', sans-serif",
          }}>← Back</button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#334155' }}>Loading…</div>
        ) : (
          <>
            {/* Podium */}
            {board.length >= 3 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 10, marginBottom: 24 }}>
                {[board[1], board[0], board[2]].map((p, pos) => {
                  if (!p) return <div key={pos} style={{ width: 64 }} />
                  const heights = [80, 104, 64]
                  const medals  = ['🥈', '🥇', '🥉']
                  const colors  = ['#94a3b8', '#f59e0b', '#cd7c2f']
                  const isMe    = p.id === profile.id
                  return (
                    <div key={p.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                      <div style={{ fontSize: 20 }}>{medals[pos]}</div>
                      <div style={{
                        width: 64, height: heights[pos],
                        background: isMe ? 'linear-gradient(180deg,rgba(20,184,166,0.25),rgba(14,165,233,0.15))' : '#0c1525',
                        border: `2px solid ${isMe ? '#14b8a6' : colors[pos]}`,
                        borderRadius: '10px 10px 5px 5px',
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', gap: 2,
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: isMe ? '#14b8a6' : colors[pos], textAlign: 'center', padding: '0 4px' }}>
                          {p.display_name.split(' ')[0]}
                        </div>
                        <div style={{ fontSize: 10, color: '#334155', fontFamily: "'JetBrains Mono', monospace" }}>
                          {p.xp.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Full list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {board.map((p, i) => {
                const isMe  = p.id === profile.id
                const lvl   = getLevel(p.xp)
                const icon  = RANK_ICONS[Math.min(lvl, RANK_ICONS.length - 1)]
                return (
                  <div key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px',
                    background: isMe ? 'rgba(20,184,166,0.08)' : '#0c1525',
                    border: isMe ? '1px solid rgba(20,184,166,0.3)' : '1px solid #1e293b',
                    borderRadius: 11,
                  }}>
                    <div style={{
                      fontSize: 13, fontWeight: 800, width: 24, textAlign: 'center',
                      color: i < 3 ? ['#f59e0b', '#94a3b8', '#cd7c2f'][i] : '#334155',
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>#{i + 1}</div>
                    <div style={{ fontSize: 16 }}>{icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: isMe ? '#5eead4' : '#e2e8f0' }}>
                        {p.display_name}{isMe ? ' (You)' : ''}
                      </div>
                      {p.school && <div style={{ fontSize: 11, color: '#334155' }}>{p.school}</div>}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b', fontFamily: "'JetBrains Mono', monospace" }}>
                        {p.xp.toLocaleString()} XP
                      </div>
                      {p.streak > 0 && (
                        <div style={{ fontSize: 11, color: '#ef4444' }}>🔥 {p.streak}</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {myPosition > 0 && (
              <div style={{
                marginTop: 14, padding: '10px 14px', background: '#08111f',
                border: '1px solid #1e293b', borderRadius: 10,
                fontSize: 12, color: '#334155', textAlign: 'center',
              }}>
                You're ranked #{myPosition} · Leaderboard resets weekly
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
