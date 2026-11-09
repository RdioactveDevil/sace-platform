// Short sound effects for answering and finishing: a chime for a right
// answer, a soft low note for a wrong one, a rising run for a streak, and a
// fanfare when a quiz or lesson is done. They're made with the Web Audio API,
// so there are no files to download. On by default; the switch is in
// Account → Preferences and is saved on the account (profiles.sounds_enabled,
// migration 20261109000002_sounds_enabled.sql). App.jsx passes the signed-in
// profile's setting here with applySoundsSetting.

let enabled = true

/** A streak of right answers that gets its own sound: 3, 5, then every 5. */
export const isStreakMilestone = (streak) => streak === 3 || (streak >= 5 && streak % 5 === 0)

/** Which sound an answer makes. */
export function answerSound(isCorrect, streak = 0) {
  if (!isCorrect) return 'wrong'
  return isStreakMilestone(streak) ? 'streak' : 'correct'
}

/** Which sound the end of a quiz or lesson makes (none if nothing was answered). */
export function finishSound(correct, total) {
  if (!total) return null
  return correct === total ? 'perfect' : 'complete'
}

/** Worth confetti: every answer right, or at least 70% over three or more. */
export function isCelebration(correct, total) {
  if (!total) return false
  return correct === total || (total >= 3 && correct / total >= 0.7)
}

export function soundsEnabled() {
  return enabled
}

/** The account's setting: anything but an explicit false is on (older rows, signed out). */
export function applySoundsSetting(value) {
  enabled = value !== false
}

// Notes as [frequency Hz, start s, length s, volume 0–1].
const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5, E6 = 1318.5, G6 = 1568
const PATTERNS = {
  correct:  { wave: 'sine', notes: [[C6, 0, 0.12, 0.5], [E6, 0.08, 0.22, 0.5]] },
  wrong:    { wave: 'triangle', notes: [[220, 0, 0.14, 0.45], [174.6, 0.11, 0.26, 0.45]] },
  streak:   { wave: 'sine', notes: [[C6, 0, 0.1, 0.45], [E6, 0.07, 0.1, 0.45], [G6, 0.14, 0.12, 0.45], [C6 * 2, 0.21, 0.3, 0.4]] },
  complete: { wave: 'triangle', notes: [[C5, 0, 0.16, 0.5], [E5, 0.13, 0.16, 0.5], [G5, 0.26, 0.16, 0.5], [C6, 0.39, 0.5, 0.5], [E6, 0.39, 0.5, 0.25]] },
  perfect:  { wave: 'triangle', notes: [[C5, 0, 0.12, 0.5], [E5, 0.1, 0.12, 0.5], [G5, 0.2, 0.12, 0.5], [C6, 0.3, 0.14, 0.5], [E6, 0.42, 0.14, 0.45], [G6, 0.54, 0.6, 0.45], [C6, 0.54, 0.6, 0.3], [E6, 0.54, 0.6, 0.2]] },
}

let ctx = null
function audio() {
  if (typeof window === 'undefined') return null
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return null
  if (!ctx) {
    try { ctx = new Ctx() } catch { return null }
  }
  // Browsers start audio suspended until the page has been clicked; every
  // sound here follows a click, so resuming works.
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

const MASTER_VOLUME = 0.18

/** Play one of: correct, wrong, streak, complete, perfect. Does nothing when sounds are off. */
export function playSound(name) {
  const pattern = PATTERNS[name]
  if (!pattern || !soundsEnabled()) return
  const ac = audio()
  if (!ac) return
  try {
    const now = ac.currentTime + 0.01
    for (const [freq, start, len, vol] of pattern.notes) {
      const osc = ac.createOscillator()
      const gain = ac.createGain()
      osc.type = pattern.wave
      osc.frequency.setValueAtTime(freq, now + start)
      // Quick fade in, then an exponential fade out, so notes don't click.
      gain.gain.setValueAtTime(0.0001, now + start)
      gain.gain.exponentialRampToValueAtTime(vol * MASTER_VOLUME, now + start + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + len)
      osc.connect(gain).connect(ac.destination)
      osc.start(now + start)
      osc.stop(now + start + len + 0.05)
    }
  } catch {
    // Sound is a nice-to-have; never let it break answering.
  }
}
