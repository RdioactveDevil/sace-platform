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
    // SACE owns only SACE curricula (Stage 1 / Stage 2 by name or level_label).
    ['Chemistry Stage 2', 'Stage 2', 'sace'],
    ['SACE Stage 1 Biology', 'Stage 1', 'sace'],
    // Unrelated subjects belong to NO version subdomain — only the apex catalogue.
    ['Year 10 Quantitative Reasoning', 'Year 10', 'default'],
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
  test('no subdomain version is a catch-all; unclaimed subjects go to apex only', () => {
    assert.equal(Object.values(VERSIONS).filter((v) => v.claimsRemainder).length, 0)
    // Something no version owns resolves to the default (apex) catalogue.
    assert.equal(subjectOwnerId('Year 10 Quantitative Reasoning', 'Year 10'), 'default')
    assert.equal(VERSIONS.sace.matchSubject('Year 10 Quantitative Reasoning', 'Year 10'), false)
  })
  test('BRANDS is a back-compat alias of VERSIONS', () => {
    assert.equal(BRANDS, VERSIONS)
  })

  test('every subdomain version ships landing content for the themed page', () => {
    for (const v of Object.values(VERSIONS)) {
      if (v.id === 'default') continue
      assert.ok(v.landing, `${v.id} missing landing config`)
      assert.ok(v.landing.headline && v.landing.subhead, `${v.id} landing needs headline + subhead`)
      assert.ok(Array.isArray(v.landing.bullets) && v.landing.bullets.length > 0, `${v.id} landing needs bullets`)
    }
  })

  test('coming-soon versions are flagged in their landing copy', () => {
    assert.ok(VERSIONS.ucat.landing.comingSoon)
    assert.ok(VERSIONS.gamsat.landing.comingSoon)
    assert.ok(!VERSIONS.selective.landing.comingSoon)
  })
})

describe('brandTitle', () => {
  test('suffixes the subdomain version, plain for default', () => {
    assert.equal(brandTitle(VERSIONS.selective), 'gradefarm. selective')
    assert.equal(brandTitle(VERSIONS.ucat), 'gradefarm. ucat')
    assert.equal(brandTitle(VERSIONS.default), 'gradefarm.')
  })
})
