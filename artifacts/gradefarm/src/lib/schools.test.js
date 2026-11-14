import { test } from 'node:test'
import assert from 'node:assert/strict'
import { searchSchools } from './schools.js'

const list = [
  ['Adelaide High School', 'Adelaide', 'S'],
  ['Adelaide Botanic High School', 'Adelaide', 'S'],
  ["St Peter's College", 'Hackney', 'C'],
  ["St Peter's Woodlands Grammar School", 'Glenelg', 'P'],
  ['Unley High School', 'Netherby', 'S'],
  ['Glenunga International High School', 'Glenunga', 'S'],
]

test('names that start with what was typed come first', () => {
  assert.deepEqual(searchSchools(list, 'adelaide').map(s => s[0]), ['Adelaide Botanic High School', 'Adelaide High School'])
})

test('apostrophes and case do not matter', () => {
  assert.deepEqual(searchSchools(list, 'st peters').map(s => s[0]), ["St Peter's College", "St Peter's Woodlands Grammar School"])
})

test('every word must match, in the name or suburb, at the start of a word', () => {
  assert.deepEqual(searchSchools(list, 'high netherby').map(s => s[0]), ['Unley High School'])
  assert.deepEqual(searchSchools(list, 'igh'), [])
  assert.deepEqual(searchSchools(list, 'peters glenelg').map(s => s[1]), ['Glenelg'])
})

test('nothing typed, nothing found', () => {
  assert.deepEqual(searchSchools(list, '   '), [])
})
