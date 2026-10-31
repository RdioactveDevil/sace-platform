import { useState, useEffect, useMemo } from 'react'
import { fetchClassLeaderboards } from '../lib/db'
import { getLevel, rankAccuracy, RANKS } from '../lib/engine'
import { THEMES } from '../lib/theme'
import { SkeletonRow } from './Skeleton'
import RankIcon from './RankIcon'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
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

  // How far behind the person above: the gap that's worth chasing.
  const above = me && me.position > 1 ? visibleBoard.find(r => r.position === me.position - 1) : null
  const segOn = theme === 'dark' ? { background: t.text, color: t.bg } : { background: '#0c1037', color: '#fff' }
  const card = { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12 }
  const cell = { padding: '10px 12px', borderTop: `1px solid ${t.border}`, fontSize: 13.5, textAlign: 'left' }

  return (
    <div style={{ height: embedded ? '100%' : '100vh', minHeight: 0, background: embedded ? 'transparent' : t.bg, color: t.text, fontFamily: FONT_B, overflowY: 'auto' }}>
      <style>{`
        .lb-inner { max-width: 900px; margin: 0 auto; padding: 24px 32px 40px; display: flex; flex-direction: column; gap: 14px; }
        .lb-inner button:focus-visible { outline: 2px solid ${GOLD}; outline-offset: 2px; }
        @media (max-width: 860px) { .lb-inner { padding: 18px 14px 28px; } .lb-hide { display: none; } }
      `}</style>
      <div className="lb-inner">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontSize: 13, color: t.textMuted }}>{active ? `${active.name} · ranked by XP` : 'Ranked by XP within your class'}</span>
          {classes.length > 1 && (
            <div role="group" aria-label="Class" style={{ display: 'inline-flex', flexWrap: 'wrap', border: `1px solid ${t.border}`, borderRadius: 8, overflow: 'hidden', maxWidth: '100%' }}>
              {classes.map(c => (
                <button key={c.id} type="button" aria-pressed={active?.id === c.id} onClick={() => pickClass(c.id)}
                  style={{ padding: '6px 13px', border: 'none', fontFamily: FONT_B, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', ...(active?.id === c.id ? segOn : { background: 'transparent', color: t.textMuted }) }}>
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} theme={theme} />)}
          </div>
        ) : error ? (
          <div role="alert" style={{ ...card, padding: '24px 20px', textAlign: 'center', fontSize: 13, color: t.danger }}>{error}</div>
        ) : !active ? (
          <div style={{ ...card, padding: '28px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: t.text, marginBottom: 6 }}>You're not in a class yet</div>
            <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.6, maxWidth: 380, margin: '0 auto' }}>
              When your tutor adds you to a class, you'll see how you rank against your classmates here.
            </div>
          </div>
        ) : visibleBoard.length === 0 ? (
          <div style={{ ...card, padding: '24px 20px', textAlign: 'center', fontSize: 13, color: t.textMuted }}>No students in {active.name} yet.</div>
        ) : (
          <>
            <div style={{ ...card, padding: '2px 4px', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
                <thead>
                  <tr>
                    {['#', 'Student', 'Rank', 'Streak', 'XP'].map((h, i) => (
                      <th key={h} className={h === 'Streak' || h === 'Rank' ? 'lb-hide' : undefined}
                        style={{ ...cell, borderTop: 'none', fontSize: 12, fontWeight: 600, color: t.textFaint, textAlign: i >= 3 ? 'right' : 'left', width: i === 0 ? 44 : undefined }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleBoard.map(p => {
                    const isMe = p.id === profile.id
                    const lvl = getLevel(p.xp, rankAccuracy(p))
                    const rowBg = isMe ? (theme === 'dark' ? 'rgba(255,255,255,0.05)' : t.bgSubtle) : 'transparent'
                    return (
                      <tr key={p.id} aria-current={isMe ? 'true' : undefined} style={{ background: rowBg }}>
                        <td style={{ ...cell, fontWeight: 700, color: t.textMuted }}>{p.position}</td>
                        <td style={{ ...cell, fontWeight: isMe ? 800 : 600 }}>{isMe ? 'You' : p.display_name}</td>
                        <td className="lb-hide" style={{ ...cell, color: t.textMuted }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><RankIcon level={lvl} size={14} />{RANKS[lvl]}</span>
                        </td>
                        <td className="lb-hide" style={{ ...cell, textAlign: 'right', color: t.textMuted }}>{p.streak > 0 ? `${p.streak} day${p.streak !== 1 ? 's' : ''}` : '—'}</td>
                        <td style={{ ...cell, textAlign: 'right', fontWeight: 800 }}>{p.xp.toLocaleString()}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {me && (
              <div style={{ fontSize: 13, color: t.textMuted }}>
                {above
                  ? <>You're <strong style={{ color: t.text }}>#{me.position}</strong> of {visibleBoard.length}. Another {(above.xp - me.xp).toLocaleString()} XP and you'll pass {above.display_name.split(' ')[0]}.</>
                  : <>You're <strong style={{ color: t.text }}>top of {active.name}</strong>.</>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
