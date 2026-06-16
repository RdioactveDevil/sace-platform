import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { VERSIONS, BRANDS, brandIdFromHostname, brandTitle, subjectOwnerId } from './brand.js'

describe('brandIdFromHostname', () => {
  test('maps known version subdomains', () => {
    assert.equal(brandIdFromHostname('selective.gradefarm.com.au'), 'selective')
    assert.equal(brandIdFromHostname('vce.gradefarm.com.au'), 'vce')
    assert.equal(brandIdFromHostname('sace.gradefarm.com.au'), 'sace')
    assert.equal(brandIdFromHostname('ucat.gradefarm.com.au'), 'ucat')
    assert.equal(brandIdFromHostname('gamsat.gradefarm.com.au'), 'gamsat')
  })
  test('apex / unknown / preview hosts fall back to default', () => {
    assert.equal(brandIdFromHostname('gradefarm.com.au'), 'default')
    assert.equal(brandIdFromHostname('something.vercel.app'), 'default')
    assert.equal(brandIdFromHostname(''), 'default')
  })
})

describe('subject ownership is derived from the registry', () => {
  const cases = [
    // Selective ships these as built-in subjects (exact names).
    ['Selective Reading Comprehension', 'Selective Entry', 'selective'],
    ['Selective Mathematics', 'Selective Entry', 'selective'],
    // Anything no version claims falls to the SACE catalogue (claimsRemainder).
    ['Chemistry Stage 2', 'Stage 2', 'sace'],
    ['Year 10 Quantitative Reasoning', 'Year 10', 'sace'],
    // VCE auto-claims by naming convention until subjects are listed explicitly.
    ['VCE Chemistry', 'Units 3 & 4', 'vce'],
    ['Mathematical Methods Unit 1', 'Unit 1', 'vce'],
  ]
  for (const [name, level, owner] of cases) {
    test(`${name} → ${owner}`, () => {
      assert.equal(subjectOwnerId(name, level), owner)
      assert.equal(VERSIONS.selective.matchSubject(name, level), owner === 'selective')
      assert.equal(VERSIONS.vce.matchSubject(name, level), owner === 'vce')
      assert.equal(VERSIONS.sace.matchSubject(name, level), owner === 'sace')
      assert.equal(VERSIONS.default.matchSubject(name, level), true)
    })
  }
})

describe('versions registry shape', () => {
  test('selective ships four built-in subjects', () => {
    assert.equal(VERSIONS.selective.subjects.length, 4)
    assert.ok(VERSIONS.selective.subjects.every((s) => s.name && s.level))
  })
  test('vce / ucat / gamsat are shells with no built-in subjects', () => {
    assert.equal(VERSIONS.vce.subjects.length, 0)
    assert.equal(VERSIONS.ucat.subjects.length, 0)
    assert.equal(VERSIONS.gamsat.subjects.length, 0)
    assert.ok(VERSIONS.ucat.comingSoon && VERSIONS.gamsat.comingSoon)
  })
  test('exactly one version claims the remainder', () => {
    const remainder = Object.values(VERSIONS).filter((v) => v.claimsRemainder)
    assert.equal(remainder.length, 1)
    assert.equal(remainder[0].id, 'sace')
  })
  test('BRANDS is a back-compat alias of VERSIONS', () => {
    assert.equal(BRANDS, VERSIONS)
  })
})

describe('brandTitle', () => {
  test('suffixes the subdomain version, plain for default', () => {
    assert.equal(brandTitle(VERSIONS.selective), 'gradefarm. selective')
    assert.equal(brandTitle(VERSIONS.ucat), 'gradefarm. ucat')
    assert.equal(brandTitle(VERSIONS.default), 'gradefarm.')
  })
})
