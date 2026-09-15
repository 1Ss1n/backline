import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Mic, MicOff } from 'lucide-react'
import { classifyPitch, findTargetNote, midiToNoteName, normalizeNotes } from '../utils/pitchMath.js'
import { useMicrophonePitch } from '../hooks/useMicrophonePitch.js'
import { usePerfectPitchScoring } from '../hooks/usePerfectPitchScoring.js'
import { scoreRank } from '../utils/perfectPitchScoring.js'

const WINDOW_SECONDS = 8

function getZoomedRange(notes, points, currentTime) {
  const start = currentTime - WINDOW_SECONDS / 2; const end = currentTime + WINDOW_SECONDS / 2
  const values = [...notes.filter((note) => note.end >= start && note.start <= end).map((note) => note.midi), ...points.filter((point) => point.time >= start && point.time <= end).map((point) => point.midi)]
  if (!values.length) return { low: 54, high: 66 }
  const low = Math.min(...values); const high = Math.max(...values); const span = Math.max(10, Math.min(14, Math.ceil(high - low) + 4)); const center = (low + high) / 2
  return { low: Math.floor(center - span / 2), high: Math.ceil(center + span / 2) }
}

function UnifiedPitchGrid({ notes, points, currentTime, range }) {
  const x = (seconds) => (seconds / WINDOW_SECONDS + .5) * 100; const y = (midi) => (range.high - midi) / (range.high - range.low) * 100
  return <section className="perfect-pitch-grid unified-pitch-grid"><header><span>MIDI de la chanson <i className="pitch-legend reference" /> · ta voix <i className="pitch-legend live" /></span><small>NOW</small></header><div className="perfect-pitch-roll perfect-pitch-roll-zoomed"><div className="perfect-pitch-window" style={{ '--pitch-rows': range.high - range.low }}>{notes.map((note, index) => <i className="perfect-pitch-note" key={`${note.start}-${index}`} style={{ left: `${x(note.start - currentTime)}%`, top: `${y(note.midi)}%`, width: `${Math.max(.6, (note.end - note.start) / WINDOW_SECONDS * 100)}%` }} />)}{points.map((point, index) => <i className={`perfect-pitch-point ${point.grade?.toLowerCase() || ''}`} key={`${point.time}-${index}`} style={{ left: `${x(point.time - currentTime)}%`, top: `${y(point.midi)}%` }} />)}<i className="perfect-pitch-now" /></div></div></section>
}

export default function PerfectPitchPanel({ rawNotes, currentTime, isPlaying, ended, seekVersion, runId, onReplay }) {
  const normalizedNotes = useMemo(() => normalizeNotes(rawNotes || []), [rawNotes]); const [points, setPoints] = useState([]); const [live, setLive] = useState({})
  const currentRef = useRef({ currentTime, notes: normalizedNotes }); const scoringRef = useRef(null); currentRef.current = { currentTime, notes: normalizedNotes }
  const onPitch = useCallback((measurement) => { const { currentTime: now, notes } = currentRef.current; const target = findTargetNote(notes, now); const liveScore = measurement.smoothedMidi != null && target ? classifyPitch(measurement.smoothedMidi, target.midi, true) : null; setLive({ ...measurement, target, score: liveScore }); scoringRef.current?.addSample({ midi: measurement.smoothedMidi }); if (isPlaying && liveScore?.adjustedMidi != null) setPoints((items) => [...items.slice(-260), { time: now, midi: liveScore.adjustedMidi, grade: liveScore.grade }]) }, [isPlaying])
  const microphone = useMicrophonePitch(onPitch)
  const scoring = usePerfectPitchScoring({ notes: normalizedNotes, currentTime, isPlaying, microphoneActive: microphone.status === 'active', ended, seekVersion, runId })
  scoringRef.current = scoring
  useEffect(() => { if (ended) microphone.stop() }, [ended, microphone.stop])
  const range = useMemo(() => getZoomedRange(normalizedNotes, points, currentTime), [normalizedNotes, points, currentTime]); const status = microphone.status === 'active' ? (live.smoothedMidi == null ? 'Aucune voix détectée' : 'Microphone actif') : microphone.status === 'denied' ? 'Permission refusée' : microphone.status === 'requesting' ? 'Autorisation…' : 'Microphone désactivé'; const grade = live.score?.grade || (live.target ? '—' : 'En attente')
  return <aside className="perfect-pitch-panel"><div className="perfect-pitch-heading"><div><p>Perfect Pitch</p><h3>Justesse en direct</h3></div><span className={`perfect-pitch-grade ${grade.toLowerCase()}`}>{grade}</span></div><div className="perfect-pitch-score"><div><small>Score</small><b>{scoring.scoreValue.toLocaleString('fr-FR')}</b></div><div><small>Combo</small><b>x{scoring.score.currentCombo}</b></div></div><UnifiedPitchGrid notes={normalizedNotes} points={points} currentTime={currentTime} range={range} />{scoring.lastResult && <div className={`perfect-pitch-result ${scoring.lastResult.rating}`}>{scoring.lastResult.rating.toUpperCase()}{scoring.lastResult.points ? ` +${scoring.lastResult.points}` : ''}</div>}<div className="perfect-pitch-footer"><div><b>{status}</b>{microphone.status !== 'active' && isPlaying ? <small>Scoring en pause — microphone indisponible</small> : live.target && <small>Cible {midiToNoteName(live.target.midi)} · octaves ignorées</small>}</div><button type="button" onClick={microphone.status === 'active' ? microphone.stop : microphone.start} disabled={microphone.status === 'requesting'}>{microphone.status === 'active' ? <MicOff size={15} /> : <Mic size={15} />}{microphone.status === 'active' ? 'Désactiver' : microphone.status === 'denied' ? 'Réessayer' : 'Activer le micro'}</button></div>{ended && <section className="perfect-pitch-summary"><p>Performance</p><strong>{scoring.scoreValue.toLocaleString('fr-FR')}</strong><small>/ 100 000 · Rang {scoreRank(scoring.scoreValue)}</small><div><span>Perfect <b>{scoring.score.perfect}</b></span><span>Great <b>{scoring.score.great}</b></span><span>Good <b>{scoring.score.good}</b></span><span>OK <b>{scoring.score.ok}</b></span><span>Miss <b>{scoring.score.miss}</b></span><span>Meilleur combo <b>x{scoring.score.maxCombo}</b></span></div><button type="button" onClick={onReplay}>Rejouer</button></section>}</aside>
}
