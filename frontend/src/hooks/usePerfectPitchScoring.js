import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EMPTY_SCORE, SCORING_CONFIG, applyNoteResult, evaluateNotePerformance, sessionScore } from '../utils/perfectPitchScoring.js'

const noteId = (note, index) => `${index}:${note.start.toFixed(3)}:${note.end.toFixed(3)}:${note.midi.toFixed(2)}`

export function usePerfectPitchScoring({ notes, currentTime, isPlaying, microphoneActive, ended, seekVersion, runId }) {
  const [score, setScore] = useState(EMPTY_SCORE)
  const [lastResult, setLastResult] = useState(null)
  const evaluatedRef = useRef(new Set())
  const activeRef = useRef(null)
  const samplesRef = useRef([])
  const lastTimeRef = useRef(currentTime)
  const skipRef = useRef(false)
  const reset = useCallback(() => { evaluatedRef.current = new Set(); activeRef.current = null; samplesRef.current = []; skipRef.current = true; setScore(EMPTY_SCORE); setLastResult(null) }, [])

  useEffect(() => reset(), [runId, reset])
  useEffect(() => { skipRef.current = true; activeRef.current = null; samplesRef.current = [] }, [seekVersion])

  const evaluateActive = useCallback(() => {
    const active = activeRef.current
    if (!active || evaluatedRef.current.has(active.id) || skipRef.current || !microphoneActive) return
    const result = evaluateNotePerformance({ referenceNote: active.note, pitchSamples: samplesRef.current, octaveTolerance: true })
    evaluatedRef.current.add(active.id)
    if (!result) return
    setScore((value) => applyNoteResult(value, result))
    setLastResult(result)
  }, [microphoneActive])

  useEffect(() => {
    if (ended) return
    const elapsed = currentTime - lastTimeRef.current
    const jumped = elapsed > .75 || elapsed < -.05
    lastTimeRef.current = currentTime
    const index = notes.findIndex((note) => note.start <= currentTime && currentTime <= note.end)
    const next = index >= 0 ? { note: notes[index], id: noteId(notes[index], index) } : null
    if (!isPlaying || !microphoneActive) { activeRef.current = next; samplesRef.current = []; return }
    if (jumped || skipRef.current) { activeRef.current = next; samplesRef.current = []; skipRef.current = false; return }
    if (activeRef.current?.id !== next?.id) { evaluateActive(); activeRef.current = next; samplesRef.current = [] }
  }, [currentTime, ended, evaluateActive, isPlaying, microphoneActive, notes])

  useEffect(() => { if (ended) evaluateActive() }, [ended, evaluateActive])

  const addSample = useCallback((sample) => {
    if (!isPlaying || !microphoneActive || sample.midi == null || !activeRef.current) return
    samplesRef.current.push({ time: currentTime, midi: sample.midi })
  }, [currentTime, isPlaying, microphoneActive])

  return useMemo(() => ({ score, scoreValue: sessionScore(score), lastResult, totalScorableNotes: notes.filter((note) => note.end - note.start >= SCORING_CONFIG.minScorableNoteDuration).length, addSample, reset }), [addSample, lastResult, notes, reset, score])
}
