import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { BRANDS, brandIdFromHostname, brandTitle } from './brand.js'

describe('brandIdFromHostname', () => {
  test('maps known subdomains', () => {
    assert.equal(brandIdFromHostname('selective.gradefarm.com.au'), 'selective')
    assert.equal(brandIdFromHostname('vce.gradefarm.com.au'), 'vce')
    assert.equal(brandIdFromHostname('sace.gradefarm.com.au'), 'sace')
  })
  test('apex / unknown / preview hosts fall back to default', () => {
    assert.equal(brandIdFromHostname('gradefarm.com.au'), 'default')
    assert.equal(brandIdFromHostname('something.vercel.app'), 'default')
    assert.equal(brandIdFromHostname(''), 'default')
  })
})

describe('matchSubject ownership is a clean partition', () => {
  const cases = [
    ['Selective Reading Comprehension', 'Selective Entry', 'selective'],
    ['Chemistry Stage 2', 'Stage 2', 'sace'],
    ['Year 10 Quantitative Reasoning', 'Year 10', 'sace'],
    ['VCE Chemistry', 'Units 3 & 4', 'vce'],
    ['Mathematical Methods Unit 1', 'Unit 1', 'vce'],
  ]
  for (const [name, level, owner] of cases) {
    test(`${name} → ${owner}`, () => {
      assert.equal(BRANDS.selective.matchSubject(name, level), owner === 'selective')
      assert.equal(BRANDS.vce.matchSubject(name, level), owner === 'vce')
      assert.equal(BRANDS.sace.matchSubject(name, level), owner === 'sace')
      assert.equal(BRANDS.default.matchSubject(name, level), true)
    })
  }
})

describe('brandTitle', () => {
  test('suffixes the subdomain brand, plain for default', () => {
    assert.equal(brandTitle(BRANDS.selective), 'gradefarm. selective')
    assert.equal(brandTitle(BRANDS.default), 'gradefarm.')
  })
})
