import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildLyricTimeline, getLyricFrame, getWordProgress } from './lyricPresentation.js'
import { readTheme, THEME_KEY } from '../hooks/useTheme.js'

test('LRCLIB line-only timings interpolate only in presentation and never mutate source', () => {
  const source = [{ time: 4, text: 'Next line' }, { time: 0, text: 'One two' }]
  const snapshot = JSON.stringify(source)
  const timeline = buildLyricTimeline(source, 8)
  assert.equal(JSON.stringify(source), snapshot)
  assert.equal(timeline[0].timing, 'visual-estimation')
  assert.deepEqual(timeline[0].words, [{ text: 'One', start: 0, end: 2 }, { text: 'two', start: 2, end: 4 }])
  assert.equal(getWordProgress(timeline[0].words[0], 1), .5)
  assert.equal(timeline[1].end, 8)
})
test('real Whisper word timestamps take priority when matching the line', () => {
  const line = { start: 0, end: 5, text: 'Hello world', words: [{ word: ' Hello', start: .4, end: 1 }, { word: ' world', start: 3, end: 4 }] }
  const [result] = buildLyricTimeline([line])
  assert.equal(result.timing, 'words')
  assert.equal(result.words[1].start, 3)
  assert.equal(getWordProgress(result.words[1], 2), 0)
  assert.equal(getWordProgress(result.words[1], 3.5), .5)
  assert.equal(getWordProgress(result.words[1], 10), 1)
})
test('edited text with stale or malformed word metadata falls back safely', () => {
  const [result] = buildLyricTimeline([{ start: 0, end: 4, text: 'Edited words', words: [{ word: 'Old', start: 1, end: 2 }] }])
  assert.equal(result.timing, 'visual-estimation')
  assert.equal(result.words[0].text, 'Edited')
})
test('seek forward, backward, restart, pause and explicit silent lines are deterministic', () => {
  const timeline = buildLyricTimeline([{ start: 2, end: 4, text: 'First line' }, { start: 4, end: 6, text: '' }, { start: 8, end: 10, text: 'Last line' }])
  assert.equal(getLyricFrame(timeline, 0).current, null)
  assert.equal(getLyricFrame(timeline, 8.5).current.text, 'Last line')
  assert.equal(getLyricFrame(timeline, 3).current.text, 'First line')
  assert.deepEqual(getLyricFrame(timeline, 3), getLyricFrame(timeline, 3))
  assert.equal(getLyricFrame(timeline, 4).current.text, '')
  assert.equal(getLyricFrame(timeline, 7).current, null)
  assert.equal(getLyricFrame(timeline, 10).current, null)
  assert.equal(getLyricFrame(timeline, 0).next.text, 'First line')
  assert.equal(getLyricFrame(buildLyricTimeline([{ time: 0, text: 'Other song' }]), 0).current.text, 'Other song')
})
test('no arbitrary last-line duration; overlapping lines do not resurrect old lines', () => {
  const [last] = buildLyricTimeline([{ time: 0, text: 'No duration' }])
  assert.equal(last.timing, 'line')
  assert.equal(getWordProgress(last.words[0], 0), 1)
  const timeline = buildLyricTimeline([{ start: 0, end: 20, text: 'Old' }, { start: 2, end: 4, text: 'New' }])
  assert.equal(getLyricFrame(timeline, 5).current, null)
})
test('theme uses the existing preference and tolerates unavailable storage', () => {
  assert.equal(THEME_KEY, 'backline-theme')
  assert.equal(readTheme({ getItem: () => 'light' }), 'light')
  assert.equal(readTheme({ getItem: () => 'invalid' }), 'dark')
  assert.equal(readTheme({ getItem: () => { throw Error('Blocked') } }), 'dark')
})
