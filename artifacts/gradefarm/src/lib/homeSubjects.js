// Groups the live subject list for the homepage's Subjects section (see
// LandingPage.jsx): each subject goes in a group by its level.

export const SUBJECT_GROUPS = [
  { id: 'vce', title: 'VCE', note: 'Victoria', phrase: 'VCE in Victoria' },
  { id: 'sace', title: 'SACE', note: 'South Australia', phrase: 'SACE in South Australia' },
  { id: 'middle', title: 'Middle School', note: 'Selective Entry', phrase: 'middle school' },
  { id: 'other', title: 'More subjects', note: '', phrase: 'more' },
]

/** Which group a live subject belongs in, with the name and level to show. */
export function groupSubject({ name = '', level = '' }) {
  const n = String(name).trim(), l = String(level).trim()
  const units = (txt) => txt.match(/units?\s*\d\s*(?:and|&)\s*\d/i)?.[0].replace(/\s*and\s*/i, ' & ').replace(/^unit\b/i, 'Units')
  if (/^VCE\s/i.test(n) || /^units?\s*\d/i.test(l)) {
    const lvl = units(n) || units(l) || l
    return { group: 'vce', name: n.replace(/^VCE\s+/i, '').replace(/\s*Units?\s*\d\s*(?:and|&)\s*\d\s*$/i, ''), level: lvl }
  }
  if (/^stage\s*[12]$/i.test(l) || /\bSACE\b/i.test(n)) {
    return { group: 'sace', name: n.replace(/^SACE\s+/i, '').replace(/\s*Stage\s*[12]\s*$/i, ''), level: l.replace(/^stage/i, 'Stage') }
  }
  const yr = l.match(/^year\s*(\d{1,2})$/i)
  if ((yr && Number(yr[1]) <= 10) || /selective/i.test(l)) {
    return { group: 'middle', name: n.replace(/^year\s*\d{1,2}\s+/i, ''), level: yr ? `Year ${yr[1]}` : l }
  }
  return { group: 'other', name: n, level: l }
}

/** Live subjects grouped for the homepage, each group sorted by level then name. */
export function groupSubjects(list) {
  const out = Object.fromEntries(SUBJECT_GROUPS.map(g => [g.id, []]))
  for (const s of list || []) { const g = groupSubject(s); if (g.name) out[g.group].push(g) }
  const key = (x) => { const m = x.level.match(/\d+/); return m ? Number(m[0]) : 99 }
  for (const id in out) out[id].sort((a, b) => key(a) - key(b) || a.level.localeCompare(b.level) || a.name.localeCompare(b.name))
  return out
}

