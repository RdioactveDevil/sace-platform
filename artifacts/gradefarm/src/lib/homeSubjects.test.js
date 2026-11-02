import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groupSubject, groupSubjects } from './homeSubjects.js'

test('subjects land in the right group with a clean name and level', () => {
  const cases = [
    [{ name: 'VCE Mathematical Methods Units 1 and 2', level: 'Year 11' }, ['vce', 'Mathematical Methods', 'Units 1 & 2']],
    [{ name: 'VCE Physics', level: 'Units 3 & 4' }, ['vce', 'Physics', 'Units 3 & 4']],
    [{ name: 'Mathematical Methods', level: 'Stage 2' }, ['sace', 'Mathematical Methods', 'Stage 2']],
    [{ name: 'Chemistry Stage 1', level: 'Stage 1' }, ['sace', 'Chemistry', 'Stage 1']],
    [{ name: 'Year 6 English', level: 'Year 6' }, ['middle', 'English', 'Year 6']],
    [{ name: 'Year 10 Mathematics', level: 'Year 10' }, ['middle', 'Mathematics', 'Year 10']],
    [{ name: 'Selective Mathematics', level: 'Selective Entry' }, ['middle', 'Selective Mathematics', 'Selective Entry']],
    [{ name: 'Quantitative and Numerical Reasoning', level: 'Year 10' }, ['middle', 'Quantitative and Numerical Reasoning', 'Year 10']],
    [{ name: 'Psychology', level: 'Year 12' }, ['other', 'Psychology', 'Year 12']],
  ]
  for (const [input, [group, name, level]] of cases) assert.deepEqual(groupSubject(input), { group, name, level }, input.name)
})

test('groups are sorted by level then name, and empty groups stay empty', () => {
  const g = groupSubjects([
    { name: 'Year 7 Mathematics', level: 'Year 7' }, { name: 'Year 6 Mathematics', level: 'Year 6' }, { name: 'Year 6 English', level: 'Year 6' },
    { name: 'VCE Mathematical Methods Units 1 and 2', level: 'Year 11' },
  ])
  assert.deepEqual(g.middle.map(x => `${x.level} ${x.name}`), ['Year 6 English', 'Year 6 Mathematics', 'Year 7 Mathematics'])
  assert.equal(g.vce.length, 1)
  assert.equal(g.sace.length, 0)
  assert.deepEqual(groupSubjects(null), { vce: [], sace: [], middle: [], other: [] })
})
