import test from 'node:test'
import assert from 'node:assert/strict'
import { formatLyricsTime, splitLine, validateLocalLines } from './lyricsEditor.js'
import { getActiveLineIndex } from './lrc.js'

test('formatLyricsTime preserves milliseconds', () => assert.equal(formatLyricsTime(84.35), '01:24.350'))
test('splitLine keeps coherent timings and text', () => {
  const [left, right] = splitLine({ id: 'one', start: 10, end: 14, text: 'hello world' }, 5)
  assert.deepEqual([left.text, right.text, left.end, right.start], ['hello', 'world', 12, 12])
})
test('validateLocalLines accepts overlaps and intentional empty lines but rejects invalid limits', () => {
  assert.deepEqual(validateLocalLines([{ id: 'a', start: 1, end: 3, text: 'one' }, { id: 'b', start: 2, end: 4, text: 'two' }], 5), [])
  assert.deepEqual(validateLocalLines([{ id: 'a', start: 1, end: 2, text: '' }], 5), [])
  assert.equal(validateLocalLines([{ id: 'a', start: 2, end: 2, text: '' }], 5).length, 1)
})
test('getActiveLineIndex continues after an earlier line has ended', () => {
  const lines = [{ start: 0, end: 2, text: 'first' }, { start: 2, end: 4, text: 'second' }]
  assert.equal(getActiveLineIndex(lines, 1.9), 0)
  assert.equal(getActiveLineIndex(lines, 2), 1)
  assert.equal(getActiveLineIndex(lines, 4.2), -1)
})
