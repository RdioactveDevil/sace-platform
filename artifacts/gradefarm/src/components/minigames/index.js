// Mini games for a break after every BREAK_EVERY answers (lib/engagement.js).
// Each is { id, name, blurb, lowerIsBetter, format(best), Component }; the
// component takes { theme, subject, onResult(score) }. They earn no XP.
import { PAIR_UP } from './PairUp'
import { ORBIT_DODGE } from './OrbitDodge'
import { COLOUR_FLOOD } from './ColourFlood'
import { STACK_DROP } from './StackDrop'

export const BREAK_GAMES = [ORBIT_DODGE, PAIR_UP, COLOUR_FLOOD, STACK_DROP]

const BEST_KEY = (id) => `gf-game-best-${id}`
const LAST_KEY = 'gf-game-last'

/** This browser's best score in a game (a convenience; not saved to the account). */
export function readBest(id) {
  try {
    const v = Number(localStorage.getItem(BEST_KEY(id)))
    return Number.isFinite(v) && v > 0 ? v : null
  } catch { return null }
}

/** Keep `score` if it beats the best; returns whether it did. */
export function saveBest(game, score) {
  const best = readBest(game.id)
  const better = best == null || (game.lowerIsBetter ? score < best : score > best)
  if (better) { try { localStorage.setItem(BEST_KEY(game.id), String(score)) } catch {} }
  return better
}

export function readLastGame() {
  try { return localStorage.getItem(LAST_KEY) } catch { return null }
}

export function saveLastGame(id) {
  try { localStorage.setItem(LAST_KEY, id) } catch {}
}
