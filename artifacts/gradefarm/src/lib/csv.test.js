import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { escapeCsvValue, rowsToCsv } from './csv.js'

describe('escapeCsvValue', () => {
  test('passes through plain values', () => {
    assert.equal(escapeCsvValue('hello'), 'hello')
    assert.equal(escapeCsvValue(42), '42')
    assert.equal(escapeCsvValue(0), '0')
  })

  test('renders null/undefined as empty string', () => {
    assert.equal(escapeCsvValue(null), '')
    assert.equal(escapeCsvValue(undefined), '')
  })

  test('quotes values containing commas, quotes or newlines', () => {
    assert.equal(escapeCsvValue('a,b'), '"a,b"')
    assert.equal(escapeCsvValue('line1\nline2'), '"line1\nline2"')
    assert.equal(escapeCsvValue('she said "hi"'), '"she said ""hi"""')
  })

  test('serialises objects/arrays as JSON', () => {
    assert.equal(escapeCsvValue({ a: 1 }), '"{""a"":1}"')
    assert.equal(escapeCsvValue([1, 2]), '"[1,2]"')
  })
})

describe('rowsToCsv', () => {
  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'xp', label: 'XP' },
  ]

  test('builds a header from labels and one line per row (CRLF separated)', () => {
    const csv = rowsToCsv(
      [
        { name: 'Ada', email: 'ada@x.com', xp: 10 },
        { name: 'Bo', email: 'bo@x.com', xp: 20 },
      ],
      columns,
    )
    assert.equal(csv, 'Name,Email,XP\r\nAda,ada@x.com,10\r\nBo,bo@x.com,20')
  })

  test('falls back to the key when no label is given', () => {
    const csv = rowsToCsv([{ a: 1 }], [{ key: 'a' }])
    assert.equal(csv, 'a\r\n1')
  })

  test('supports computed columns via get()', () => {
    const csv = rowsToCsv(
      [{ subjects: [{ subject_name: 'Chem' }, { subject_name: 'Bio' }] }],
      [{ key: 'subjects', label: 'Subjects', get: r => r.subjects.map(s => s.subject_name).join('; ') }],
    )
    assert.equal(csv, 'Subjects\r\nChem; Bio')
  })

  test('escapes commas in cell values so columns are preserved', () => {
    const csv = rowsToCsv([{ name: 'Smith, John', email: 'js@x.com', xp: 5 }], columns)
    assert.equal(csv, 'Name,Email,XP\r\n"Smith, John",js@x.com,5')
  })

  test('handles missing fields and empty input gracefully', () => {
    assert.equal(rowsToCsv([{ name: 'X' }], columns), 'Name,Email,XP\r\nX,,')
    assert.equal(rowsToCsv([], columns), 'Name,Email,XP')
    assert.equal(rowsToCsv(null, columns), 'Name,Email,XP')
    assert.equal(rowsToCsv([{ a: 1 }], []), '')
  })
})
