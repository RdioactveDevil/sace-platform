import { Sprout, Swords, Shield, Star, Gem, Diamond, Crown, Flame, Trophy } from 'lucide-react'
import { RANKS } from '../lib/engine'

// One icon per rank in RANKS (Rookie … SACE Legend).
const RANK_ICON_COMPONENTS = [Sprout, Swords, Swords, Shield, Shield, Star, Gem, Diamond, Crown, Flame, Trophy]

/** The icon for a player level, sized to sit inline with text. */
export default function RankIcon({ level = 0, size = 14, color = 'currentColor', strokeWidth = 2, style }) {
  const Icon = RANK_ICON_COMPONENTS[Math.max(0, Math.min(level, RANKS.length - 1))]
  return <Icon size={size} color={color} strokeWidth={strokeWidth} aria-hidden="true" style={{ flexShrink: 0, ...style }} />
}
