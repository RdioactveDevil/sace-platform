// Maps an exam-simulator percentage to a track-appropriate indicative score and
// a readiness label. Pure — no I/O. The mappings are deliberately approximate
// and clearly labelled "indicative" in the UI; they exist to make a raw % feel
// like the score scale a candidate actually cares about.

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n))
}

/**
 * Returns { label, sublabel } for a track + percentage.
 *   ucat       → scaled ~1300–2900 per subtest-style band
 *   gamsat     → indicative Section score ~50–90
 *   selective  → scaled raw, framed as a strong/competitive band
 *   default    → the raw percentage
 */
export function predictScore(trackId, percent) {
  const p = clamp(Math.round(percent), 0, 100)
  switch (trackId) {
    case 'ucat': {
      const scaled = Math.round(1300 + (p / 100) * 1600) // 1300–2900
      return { label: `~${scaled}`, sublabel: 'indicative UCAT scaled score' }
    }
    case 'gamsat': {
      const band = Math.round(50 + (p / 100) * 40) // 50–90
      return { label: `~${band}`, sublabel: 'indicative GAMSAT section score' }
    }
    case 'selective': {
      const scaled = Math.round((p / 100) * 120) // 0–120 raw-style
      return { label: `${scaled}/120`, sublabel: 'indicative scaled raw score' }
    }
    default:
      return { label: `${p}%`, sublabel: 'score' }
  }
}

/** A coarse readiness label from a percentage. */
export function readiness(percent) {
  const p = clamp(percent, 0, 100)
  if (p >= 85) return { label: 'Exam-ready', color: '#34d399' }
  if (p >= 70) return { label: 'Strong', color: '#34d399' }
  if (p >= 55) return { label: 'On track', color: '#f1be43' }
  if (p >= 40) return { label: 'Developing', color: '#f1be43' }
  return { label: 'Needs work', color: '#f87171' }
}

/** Phrase a percentile rank against other attempts. */
export function percentileLabel(percentile, attempts) {
  if (percentile == null || !attempts || attempts < 5) {
    return 'Not enough attempts yet to rank — be one of the first!'
  }
  if (percentile >= 50) return `Better than ${percentile}% of attempts on this track`
  return `Top ${100 - percentile}% — keep climbing`
}
