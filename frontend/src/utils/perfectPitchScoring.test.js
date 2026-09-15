import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateNotePerformance } from './perfectPitchScoring.js'

const note = { start: 0, end: 1, midi: 69 }
const samples = (midi, count = 14) => Array.from({ length: count }, (_, index) => ({ time: .1 + index * .055, midi }))

test('Perfect Pitch scoring thresholds are encouraging and stable', () => {
  assert.deepEqual(evaluateNotePerformance({ referenceNote: note, pitchSamples: samples(69) }).rating, 'perfect')
  assert.equal(evaluateNotePerformance({ referenceNote: note, pitchSamples: samples(69.35) }).rating, 'great')
  assert.equal(evaluateNotePerformance({ referenceNote: note, pitchSamples: samples(69.7) }).rating, 'good')
  assert.equal(evaluateNotePerformance({ referenceNote: note, pitchSamples: samples(70) }).rating, 'ok')
  assert.equal(evaluateNotePerformance({ referenceNote: note, pitchSamples: samples(70.5) }).rating, 'miss')
})

test('median rejects a one-off microphone outlier', () => {
  const result = evaluateNotePerformance({ referenceNote: note, pitchSamples: [...samples(69.12), { time: .74, midi: 71 }] })
  assert.equal(result.rating, 'perfect')
  assert.ok(result.medianErrorCents < 20)
})

test('low voice coverage becomes a miss without scoring silence frames', () => {
  const result = evaluateNotePerformance({ referenceNote: note, pitchSamples: [{ time: .3, midi: 69 }] })
  assert.equal(result.rating, 'miss')
  assert.ok(result.voiceCoverage < .35)
})

test('octave tolerance is shared with the existing pitch utility', () => {
  assert.equal(evaluateNotePerformance({ referenceNote: note, pitchSamples: samples(57), octaveTolerance: true }).rating, 'perfect')
  assert.equal(evaluateNotePerformance({ referenceNote: note, pitchSamples: samples(57), octaveTolerance: false }).rating, 'miss')
})
