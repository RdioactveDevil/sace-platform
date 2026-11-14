// The school lists onboarding's school picker searches (components/SchoolPicker.jsx):
// ACARA's School Location list, one file per state in public/schools/<STATE>.json,
// built by scripts/build-school-list.py. Each school is [name, suburb, type],
// type P (primary), S (secondary) or C (both).

const LISTED = /^(ACT|NSW|NT|QLD|SA|TAS|VIC|WA)$/
const MAX_RESULTS = 50

const cache = {}
/** A state's schools ([name, suburb, type]), or null if there's no list for it. */
export function loadSchools(state) {
  if (!LISTED.test(state || '')) return Promise.resolve(null)
  if (!cache[state]) {
    cache[state] = fetch(`/schools/${state}.json`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => (Array.isArray(d?.schools) ? d.schools : null))
      .catch(() => { delete cache[state]; return null })
  }
  return cache[state]
}

// "St Peter's College" and "st peters" match: lower case, no apostrophes, other marks as spaces.
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

/** Schools matching every word typed, best first: name starts with it, then a word in it does. */
export function searchSchools(schools, query) {
  const q = norm(query)
  if (!q) return []
  const words = q.split(' ')
  const out = []
  for (const s of schools) {
    const name = norm(s[0]), hay = ` ${name} ${norm(s[1])}`
    if (!words.every(w => hay.includes(` ${w}`))) continue
    const rank = name.startsWith(q) ? 0 : hay.includes(` ${q}`) ? 1 : 2
    out.push([rank, s])
  }
  out.sort((a, b) => a[0] - b[0] || a[1][0].localeCompare(b[1][0]) || a[1][1].localeCompare(b[1][1]))
  return out.slice(0, MAX_RESULTS).map(([, s]) => s)
}
