import test from 'node:test'
import assert from 'node:assert/strict'
import { getPitchViewport, getVisiblePitchNotes, getVisiblePitchPoints, pitchNoteRect, pitchVerticalPosition } from './pitchViewport.js'
import { nearestOctaveMidi } from './pitchMath.js'

test('wide octave jumps and both extreme notes remain inside the grid', () => {
  for (const pitches of [[48, 72], [36, 96], [0, 127], [60.5, 84.7]]) {
    const range = getPitchViewport(pitches.map(midi => ({ midi })), [])
    for (const midi of pitches) {
      assert.ok(range.low < midi && midi < range.high)
      assert.ok(pitchVerticalPosition(midi, range) > 8)
      assert.ok(pitchVerticalPosition(midi, range) < 92)
    }
  }
})
test('the display remains zoomed for a narrow melody and ignores invalid pitches', () => {
  assert.deepEqual(getPitchViewport([], []), { low: 54, high: 66 })
  const range = getPitchViewport([{ midi: 80 }, { midi: 81 }, { midi: NaN }], [{ midi: Infinity }])
  assert.equal(range.high - range.low, 12)
  assert.deepEqual(range, getPitchViewport([{ midi: 80 }, { midi: 81 }], [{ midi: 81.1 }]))
})
test('only notes intersecting the time window are rendered, including long sustained notes', () => {
  const sustained = { start: 0, end: 30, midi: 60 }
  const recent = { start: 9, end: 10, midi: 84 }
  assert.deepEqual(getVisiblePitchNotes([sustained, recent, { start: 20, end: 21, midi: 90 }, { start: 8, end: 9, midi: NaN }], 10), [sustained, recent])
  assert.deepEqual(pitchNoteRect(sustained, 10), { left: 0, width: 100 })
  assert.deepEqual(pitchNoteRect({ start: 13, end: 20 }, 10), { left: 87.5, width: 12.5 })
})
test('live voice at another octave still overlays the target; cents deviations remain visible', () => {
  const midi = nearestOctaveMidi(48.3, 84)
  const range = getPitchViewport([{ midi: 84 }], [{ midi }])
  assert.ok(Math.abs(pitchVerticalPosition(midi, range) - pitchVerticalPosition(84, range)) < 3)
  assert.equal(pitchVerticalPosition(nearestOctaveMidi(48, 84), range), pitchVerticalPosition(84, range))
})
test('out-of-window history does not affect the viewport after navigation or seek', () => {
  const points = [{ time: 0, midi: 120 }, { time: 10, midi: 62 }, { time: 12, midi: NaN }]
  assert.deepEqual(getVisiblePitchPoints(points, 10), [{ time: 10, midi: 62 }])
  assert.deepEqual(getVisiblePitchPoints(points, 25), [])
})
