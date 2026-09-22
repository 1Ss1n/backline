import test from 'node:test'
import assert from 'node:assert/strict'
import { asKaraokeLines, toEditableLines, validateLyricsLines } from './lyricsEditor.js'

test('legacy lyrics receive stable editable ids and inferred ends', () => {
  const lines = toEditableLines({ lyricsLines: [{ time: 1, text: 'one' }, { time: 3, text: 'two' }] })
  assert.deepEqual(lines.map(({ id, start, end }) => [id, start, end]), [['line-0-1000', 1, 3], ['line-1-3000', 3, 7]])
})
test('lyrics validation blocks invalid persisted data but permits overlaps', () => {
  assert.equal(validateLyricsLines([{ id: 'a', start: 1, end: 4, text: 'one' }, { id: 'b', start: 3, end: 5, text: 'two' }]), null)
  assert.equal(validateLyricsLines([{ id: 'empty', start: 1, end: 2, text: '' }]), null)
  assert.match(validateLyricsLines([{ id: 'a', start: 2, end: 2, text: 'one' }]), /valides/)
})
test('karaoke projection preserves edited start and end values', () => {
  assert.deepEqual(asKaraokeLines([{ id: 'a', start: 12.4, end: 16.7, text: 'line' }]), [{ id: 'a', time: 12.4, start: 12.4, end: 16.7, text: 'line' }])
})
