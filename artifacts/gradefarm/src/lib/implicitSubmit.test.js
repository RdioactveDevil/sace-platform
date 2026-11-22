import test from 'node:test'
import assert from 'node:assert/strict'
import { blocksImplicitSubmit } from './implicitSubmit.js'

const key = (tagName, type, k = 'Enter') => ({ key: k, target: { tagName, type } })

test('Enter in text-like inputs and selects is blocked', () => {
  assert.equal(blocksImplicitSubmit(key('INPUT', 'text')), true)
  assert.equal(blocksImplicitSubmit(key('INPUT', 'email')), true)
  assert.equal(blocksImplicitSubmit(key('INPUT', 'checkbox')), true)
  assert.equal(blocksImplicitSubmit(key('SELECT', 'select-one')), true)
})

test('Enter in textareas and on buttons is left alone', () => {
  assert.equal(blocksImplicitSubmit(key('TEXTAREA', 'textarea')), false)
  assert.equal(blocksImplicitSubmit(key('BUTTON', 'submit')), false)
  assert.equal(blocksImplicitSubmit(key('INPUT', 'submit')), false)
  assert.equal(blocksImplicitSubmit(key('INPUT', 'button')), false)
})

test('other keys are never blocked', () => {
  assert.equal(blocksImplicitSubmit(key('INPUT', 'text', ' ')), false)
  assert.equal(blocksImplicitSubmit(key('INPUT', 'text', 'Tab')), false)
})
