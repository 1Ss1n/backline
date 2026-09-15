import { centsDifference, nearestOctaveMidi } from './pitchMath.js'

export const SCORING_CONFIG = {
  perfect: 25,
  great: 50,
  good: 80,
  ok: 120,
  points: { perfect: 100, great: 85, good: 65, ok: 40, miss: 0 },
  noteAttackGraceMs: 80,
  noteReleaseGraceMs: 60,
  minVoiceCoverage: .35,
  minScorableNoteDuration: .13,
  sampleIntervalSeconds: .065,
}

export const EMPTY_SCORE = { perfect: 0, great: 0, good: 0, ok: 0, miss: 0, currentCombo: 0, maxCombo: 0, evaluatedNotes: 0, earnedPoints: 0 }

export function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export function getScoringWindow(referenceNote, config = SCORING_CONFIG) {
  const duration = referenceNote.end - referenceNote.start
  const attack = Math.min(config.noteAttackGraceMs / 1000, duration * .22)
  const release = Math.min(config.noteReleaseGraceMs / 1000, duration * .18)
  return { start: referenceNote.start + attack, end: Math.max(referenceNote.start + attack, referenceNote.end - release) }
}

export function evaluateNotePerformance({ referenceNote, pitchSamples = [], octaveTolerance = true, config = SCORING_CONFIG }) {
  if (!referenceNote || referenceNote.end - referenceNote.start < config.minScorableNoteDuration) return null
  const window = getScoringWindow(referenceNote, config)
  const scorableDuration = Math.max(.03, window.end - window.start)
  const samples = pitchSamples.filter((sample) => sample.midi != null && sample.time >= window.start && sample.time <= window.end)
  const voiceCoverage = Math.min(1, samples.length * config.sampleIntervalSeconds / scorableDuration)
  const errors = samples.map((sample) => Math.abs(centsDifference(nearestOctaveMidi(sample.midi, referenceNote.midi, octaveTolerance), referenceNote.midi)))
  const medianErrorCents = median(errors)
  let rating = 'miss'
  if (voiceCoverage >= config.minVoiceCoverage && medianErrorCents != null) {
    if (medianErrorCents <= config.perfect) rating = 'perfect'
    else if (medianErrorCents <= config.great) rating = 'great'
    else if (medianErrorCents <= config.good) rating = 'good'
    else if (medianErrorCents <= config.ok) rating = 'ok'
  }
  return { rating, points: config.points[rating], medianErrorCents, voiceCoverage, samples: samples.length }
}

export function applyNoteResult(score, result) {
  const rating = result.rating
  const advancesCombo = rating === 'perfect' || rating === 'great' || rating === 'good'
  const currentCombo = rating === 'miss' ? 0 : advancesCombo ? score.currentCombo + 1 : score.currentCombo
  return { ...score, [rating]: score[rating] + 1, earnedPoints: score.earnedPoints + result.points, evaluatedNotes: score.evaluatedNotes + 1, currentCombo, maxCombo: Math.max(score.maxCombo, currentCombo) }
}

export function sessionScore(score) { return score.evaluatedNotes ? Math.round(score.earnedPoints / (score.evaluatedNotes * 100) * 100000) : 0 }
export function scoreRank(score) { return score >= 95000 ? 'S' : score >= 88000 ? 'A' : score >= 78000 ? 'B' : score >= 65000 ? 'C' : score >= 50000 ? 'D' : 'Keep singing' }
