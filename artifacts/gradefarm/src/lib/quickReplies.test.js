import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanReply, splitQuickReplies, MAX_REPLIES } from './quickReplies.js'

test('the replies line is taken out of the message', () => {
  const r = splitQuickReplies("So the turning point is (3, -4). What's the axis of symmetry?\n[[replies: I'm not sure | Give me a hint | x = 3?]]")
  assert.equal(r.text, "So the turning point is (3, -4). What's the axis of symmetry?")
  assert.deepEqual(r.replies, ["I'm not sure", 'Give me a hint', 'x = 3?'])
})

test('no line, no replies, and the message is unchanged', () => {
  assert.deepEqual(splitQuickReplies('Hello there'), { text: 'Hello there', replies: [] })
  assert.deepEqual(splitQuickReplies(null), { text: '', replies: [] })
  // A line that isn't the last thing stays in the message.
  const mid = 'Try this [[replies: a | b]] then tell me'
  assert.equal(splitQuickReplies(mid).text, mid)
})

test('replies are cleaned, de-duplicated and capped', () => {
  const r = splitQuickReplies('Hi\n[[REPLIES: **Show me** | show me | $x^2$ | | One | Two | Three]]')
  assert.deepEqual(r.replies, ['Show me', 'x^2', 'One'].slice(0, MAX_REPLIES))
  assert.equal(cleanReply('x'.repeat(50)), '')
  assert.equal(cleanReply('  Give   me a hint '), 'Give me a hint')
})
