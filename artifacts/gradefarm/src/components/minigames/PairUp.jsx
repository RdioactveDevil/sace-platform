import { useEffect, useMemo, useRef, useState } from 'react'
import { THEMES } from '../../lib/theme'

const ELEMENTS = [
  ['Na', 'Sodium'], ['K', 'Potassium'], ['Fe', 'Iron'], ['Cu', 'Copper'], ['Ag', 'Silver'], ['Au', 'Gold'],
  ['Pb', 'Lead'], ['Hg', 'Mercury'], ['Sn', 'Tin'], ['Zn', 'Zinc'], ['Mg', 'Magnesium'], ['Cl', 'Chlorine'],
]
const OPPOSITES = [
  ['ancient', 'modern'], ['scarce', 'plentiful'], ['timid', 'bold'], ['expand', 'shrink'], ['generous', 'stingy'],
  ['vacant', 'occupied'], ['rigid', 'flexible'], ['victory', 'defeat'], ['shallow', 'deep'], ['permanent', 'temporary'],
]

/** Eight pairs for a subject: element symbols, times tables or opposites. */
export function pairsFor(subject, rand = Math.random) {
  const s = String(subject || '').toLowerCase()
  const shuffle = (xs) => xs.map(x => [rand(), x]).sort((a, b) => a[0] - b[0]).map(([, x]) => x)
  if (s.includes('chem')) return shuffle(ELEMENTS).slice(0, 8)
  if (s.includes('english') || s.includes('writing') || s.includes('reading')) return shuffle(OPPOSITES).slice(0, 8)
  const facts = new Map()
  while (facts.size < 8) {
    const a = 3 + Math.floor(rand() * 7)
    const b = 3 + Math.floor(rand() * 7)
    if (![...facts.values()].includes(String(a * b))) facts.set(`${a} × ${b}`, String(a * b))
  }
  return [...facts.entries()]
}

/**
 * Pair Up: flip two cards at a time and match each pair. Reports the seconds
 * taken when every pair is found (lower is better).
 */
export default function PairUp({ theme = 'dark', subject, onResult }) {
  const t = THEMES[theme]
  const cards = useMemo(() => {
    const pairs = pairsFor(subject)
    const deck = pairs.flatMap(([a, b], i) => [{ id: `${i}a`, pair: i, label: a }, { id: `${i}b`, pair: i, label: b }])
    return deck.map(c => [Math.random(), c]).sort((x, y) => x[0] - y[0]).map(([, c]) => c)
  }, [subject])
  const [up, setUp] = useState([])          // ids face up, not yet matched (0–2)
  const [matched, setMatched] = useState(() => new Set())
  const startRef = useRef(Date.now())
  const doneRef = useRef(false)

  useEffect(() => {
    if (up.length !== 2) return undefined
    const [a, b] = up.map(id => cards.find(c => c.id === id))
    if (a.pair === b.pair) {
      setMatched(m => new Set([...m, a.id, b.id]))
      setUp([])
      return undefined
    }
    const id = setTimeout(() => setUp([]), 700)
    return () => clearTimeout(id)
  }, [up, cards])

  useEffect(() => {
    if (!doneRef.current && matched.size === cards.length) {
      doneRef.current = true
      onResult?.(Math.round((Date.now() - startRef.current) / 1000))
    }
  }, [matched, cards.length, onResult])

  const flip = (id) => {
    if (matched.has(id) || up.includes(id) || up.length >= 2) return
    setUp(u => [...u, id])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, width: '100%' }}>
      <p style={{ margin: 0, fontSize: 14, color: t.textSub }}>Flip two cards at a time. Find all {cards.length / 2} pairs.</p>
      <div role="grid" aria-label="Cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, width: '100%', maxWidth: 520 }}>
        {cards.map(c => {
          const isMatched = matched.has(c.id)
          const isUp = isMatched || up.includes(c.id)
          return (
            <button key={c.id} type="button" onClick={() => flip(c.id)} disabled={isMatched}
              aria-label={isUp ? c.label : 'Face-down card'}
              style={{
                aspectRatio: '1', minHeight: 64, borderRadius: 12, cursor: isMatched ? 'default' : 'pointer', padding: 4,
                fontFamily: 'inherit', fontSize: c.label.length > 8 ? 13 : 16, fontWeight: 800, overflowWrap: 'anywhere',
                border: `${isUp && !isMatched ? 2 : 1}px solid ${isMatched ? t.success : isUp ? t.accent : t.borderMid}`,
                background: isMatched ? t.successBg : isUp ? t.accentGlow : t.bgElevated || t.bgHover,
                color: isMatched ? t.success : t.text,
              }}>
              {isUp ? c.label : ''}
            </button>
          )
        })}
      </div>
      <div style={{ fontSize: 13, color: t.textMuted }}>{matched.size / 2} of {cards.length / 2} pairs</div>
    </div>
  )
}

export const PAIR_UP = {
  id: 'pair-up',
  name: 'Pair Up',
  blurb: 'Flip cards two at a time and match every pair.',
  lowerIsBetter: true,
  format: (v) => `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`,
  Component: PairUp,
}
