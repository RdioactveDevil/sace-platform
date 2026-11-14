// Which subjects a student sees on the subject picker. A student in Victoria
// isn't shown SACE subjects, one in South Australia isn't shown VCE subjects,
// and nobody is shown subjects for years below theirs (or far above). The
// student's state is profiles.state (migration 20261109000001_profile_state.sql).

import { yearFromStage } from './subjects.js'
import { groupSubject } from './homeSubjects.js'

/** Saved in profiles.state. VIC and SA have their own senior boards. */
export const AU_STATES = [
  ['VIC', 'Victoria'],
  ['SA', 'South Australia'],
  ['NSW', 'New South Wales'],
  ['QLD', 'Queensland'],
  ['WA', 'Western Australia'],
  ['TAS', 'Tasmania'],
  ['ACT', 'ACT'],
  ['NT', 'Northern Territory'],
  ['INTL', 'Outside Australia'],
]

export const stateLabel = (code) => AU_STATES.find(([c]) => c === code)?.[1] || ''

/** The senior board each state studies, if we have subjects for it. */
const BOARD_OF_STATE = { VIC: 'vce', SA: 'sace' }

/** 'vce' | 'sace' for a state with its own senior board, else null. */
export const stateBoard = (state) => BOARD_OF_STATE[state] || null

/** How far above their own year a student might study (accelerated students). */
const YEARS_AHEAD = 3

/** 'vce' | 'sace' | null for a subject tile ({ name, stage }). */
export function subjectBoard(subj) {
  const { group } = groupSubject({ name: subj?.name, level: subj?.stage })
  return group === 'vce' || group === 'sace' ? group : null
}

/** The school year a subject is for, or null if it isn't tied to one. */
export function subjectYear(subj) {
  const y = yearFromStage(subj?.stage)
  if (y) return y
  const units = /units?\s*([13])\s*(?:and|&|-)\s*[24]/i.exec(`${subj?.stage || ''} ${subj?.name || ''}`)
  return units ? (units[1] === '1' ? 11 : 12) : null
}

/**
 * Whether a subject fits a student, by their state and year level. Anything
 * we can't place (no state, no year, a subject not tied to a year) is shown.
 */
export function fitsStudent(subj, { state, year } = {}) {
  const board = subjectBoard(subj)
  const own = BOARD_OF_STATE[state]
  if (board && own && board !== own) return false
  const y = Number(year) || null
  const sy = subjectYear(subj)
  if (y && sy && (sy < y || sy > y + YEARS_AHEAD)) return false
  return true
}

/** The school stages the pricing page lists subjects under, youngest first. */
export const SCHOOL_STAGES = [
  { id: 'primary', title: 'Primary School' },
  { id: 'middle', title: 'Middle School' },
  { id: 'high', title: 'High School' },
  { id: 'other', title: 'More subjects' },
]

/**
 * Which school stage a subject ({ name, stage }) is for: 'primary' up to
 * Year 6, 'middle' for Years 7 to 10 and selective entry, 'high' for Years
 * 11 and 12 (every VCE and SACE subject), and 'other' if it can't be placed.
 */
export function schoolStage(subj) {
  if (subjectBoard(subj)) return 'high'
  const y = subjectYear(subj)
  if (y) return y <= 6 ? 'primary' : y <= 10 ? 'middle' : 'high'
  const stage = String(subj?.stage || '')
  if (/foundation|prep|reception|kindergarten/i.test(stage)) return 'primary'
  return /selective/i.test(stage) ? 'middle' : 'other'
}
