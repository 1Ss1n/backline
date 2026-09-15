export const PITCH_CONFIG = {
  MIN_NOTE_DURATION: 0.07,
  MAX_MERGE_GAP: 0.08,
  MAX_MERGE_SEMITONE_DISTANCE: 0.45,
  MIN_REAL_SILENCE: 0.18,
  PERFECT_CENTS: 20,
  GREAT_CENTS: 40,
  GOOD_CENTS: 60,
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export const frequencyToMidi = (frequency) => frequency > 0 ? 69 + 12 * Math.log2(frequency / 440) : null
export const midiToFrequency = (midi) => 440 * 2 ** ((midi - 69) / 12)
export const midiToNoteName = (midi) => `${NAMES[((Math.round(midi) % 12) + 12) % 12]}${Math.floor(Math.round(midi) / 12) - 1}`
export const centsDifference = (userMidi, targetMidi) => (userMidi - targetMidi) * 100

export function normalizeNotes(rawNotes, config = PITCH_CONFIG) {
  const filtered = rawNotes.filter((note) => note.end - note.start >= config.MIN_NOTE_DURATION).sort((a, b) => a.start - b.start)
  return filtered.reduce((segments, raw) => {
    const note = { ...raw, sources: [raw], midi: Number(raw.midi) }
    const previous = segments.at(-1)
    const gap = previous ? note.start - previous.end : Infinity
    const closePitch = previous && Math.abs(previous.midi - note.midi) <= config.MAX_MERGE_SEMITONE_DISTANCE
    const mergeable = closePitch && gap >= 0 && gap <= config.MAX_MERGE_GAP && gap < config.MIN_REAL_SILENCE
    if (!mergeable) return [...segments, note]
    const previousDuration = previous.end - previous.start
    const noteDuration = note.end - note.start
    const midi = (previous.midi * previousDuration + note.midi * noteDuration) / (previousDuration + noteDuration)
    previous.end = note.end; previous.midi = midi; previous.note = midiToNoteName(midi); previous.frequency = midiToFrequency(midi); previous.sources.push(raw)
    return segments
  }, [])
}

export const findTargetNote = (notes, time) => notes.find((note) => note.start <= time && time <= note.end) || null
export function nearestOctaveMidi(userMidi, targetMidi, octaveTolerance = true) {
  if (!octaveTolerance) return userMidi
  return userMidi + 12 * Math.round((targetMidi - userMidi) / 12)
}
export function classifyPitch(userMidi, targetMidi, octaveTolerance = true, config = PITCH_CONFIG) {
  if (userMidi == null || targetMidi == null) return null
  const adjustedMidi = nearestOctaveMidi(userMidi, targetMidi, octaveTolerance)
  const cents = centsDifference(adjustedMidi, targetMidi); const abs = Math.abs(cents)
  const grade = abs <= config.PERFECT_CENTS ? 'PERFECT' : abs <= config.GREAT_CENTS ? 'GREAT' : abs <= config.GOOD_CENTS ? 'GOOD' : 'MISS'
  return { grade, cents, adjustedMidi }
}
