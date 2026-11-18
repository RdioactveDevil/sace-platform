import { test } from 'node:test'
import assert from 'node:assert/strict'
import { enabledProviders, rememberParentSignup, signupAsParent, forgetParentSignup } from './oauth.js'

test('only the providers named in the setting show, in display order', () => {
  assert.deepEqual(enabledProviders('').map(p => p.id), [])
  assert.deepEqual(enabledProviders(undefined).map(p => p.id), [])
  assert.deepEqual(enabledProviders('apple, google').map(p => p.id), ['google', 'apple'])
  assert.deepEqual(enabledProviders('GOOGLE').map(p => p.id), ['google'])
  assert.deepEqual(enabledProviders('google,facebook').map(p => p.id), ['google'])
})

test('"For my child" is remembered across the trip to Google or Apple', () => {
  const m = new Map()
  const store = { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) }
  assert.equal(signupAsParent(store), false)
  rememberParentSignup(true, store)
  assert.equal(signupAsParent(store), true)
  rememberParentSignup(false, store)
  assert.equal(signupAsParent(store), false)
  rememberParentSignup(true, store)
  forgetParentSignup(store)
  assert.equal(signupAsParent(store), false)
  assert.equal(signupAsParent(null), false)
})
