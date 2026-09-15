import test from 'node:test'
import assert from 'node:assert/strict'
import { centsDifference, classifyPitch, findTargetNote, frequencyToMidi, midiToFrequency, midiToNoteName, nearestOctaveMidi, normalizeNotes } from './pitchMath.js'

test('frequency/midi conversions', () => { assert.equal(frequencyToMidi(440), 69); assert.equal(midiToFrequency(69), 440); assert.equal(midiToNoteName(69), 'A4'); assert.equal(frequencyToMidi(880), 81); assert.equal(midiToNoteName(81), 'A5') })
test('cents and octave tolerance', () => { assert.ok(Math.abs(centsDifference(frequencyToMidi(445), 69) - 19.56) < .2); assert.equal(nearestOctaveMidi(57, 69), 69); assert.equal(classifyPitch(57, 69, true).grade, 'PERFECT') })
test('normalization merges close fragments but keeps real silences', () => { const notes = [{ start: 0, end: .12, midi: 69 }, { start: .16, end: .3, midi: 69 }, { start: .7, end: .9, midi: 69 }, { start: 1, end: 1.02, midi: 71 }]; const normalized = normalizeNotes(notes); assert.equal(normalized.length, 2); assert.equal(normalized[0].end, .3); assert.ok(Math.abs(findTargetNote(normalized, .2).midi - 69) < 1e-6); assert.equal(findTargetNote(normalized, .5), null) })
