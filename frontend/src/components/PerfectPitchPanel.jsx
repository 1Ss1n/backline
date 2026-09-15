import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Mic, MicOff } from 'lucide-react'
import { classifyPitch, findTargetNote, midiToNoteName, normalizeNotes } from '../utils/pitchMath.js'
import { useMicrophonePitch } from '../hooks/useMicrophonePitch.js'

const WINDOW_SECONDS = 12

function PitchGrid({ title, notes, points, currentTime, range, live = false }) {
  const rows = Array.from({ length: range.high - range.low + 1 }, (_, index) => range.high - index)
  const x = (seconds) => (seconds / WINDOW_SECONDS + .5) * 100
  const y = (midi) => (range.high - midi) / (range.high - range.low + 1) * 100
  return <section className="perfect-pitch-grid">
    <header><span>{title}</span><small>NOW</small></header>
    <div className="perfect-pitch-roll">
      <div className="perfect-pitch-labels">{rows.map((midi) => <span key={midi} style={{ top: `${y(midi)}%` }}>{midiToNoteName(midi)}</span>)}</div>
      <div className="perfect-pitch-window">
        {notes.map((note, index) => <i className="perfect-pitch-note" key={`${note.start}-${index}`} style={{ left: `${x(note.start - currentTime)}%`, top: `${y(note.midi)}%`, width: `${Math.max(.4, (note.end - note.start) / WINDOW_SECONDS * 100)}%` }} />)}
        {points.map((point, index) => <i className={`perfect-pitch-point ${point.grade?.toLowerCase() || ''}`} key={index} style={{ left: `${x(point.time - currentTime)}%`, top: `${y(point.midi)}%` }} />)}
        <i className="perfect-pitch-now" />
      </div>
    </div>
    {live && <span className="perfect-pitch-live-hint">Ta hauteur en temps réel</span>}
  </section>
}

export default function PerfectPitchPanel({ rawNotes, currentTime, isPlaying, ended }) {
  const normalizedNotes = useMemo(() => normalizeNotes(rawNotes || []), [rawNotes])
  const [points, setPoints] = useState([])
  const [live, setLive] = useState({})
  const currentRef = useRef({ currentTime, notes: normalizedNotes })
  currentRef.current = { currentTime, notes: normalizedNotes }
  const onPitch = useCallback((measurement) => {
    const { currentTime: now, notes } = currentRef.current
    const target = findTargetNote(notes, now)
    const score = measurement.smoothedMidi != null && target ? classifyPitch(measurement.smoothedMidi, target.midi) : null
    setLive({ ...measurement, target, score })
    if (isPlaying && measurement.smoothedMidi != null) setPoints((items) => [...items.slice(-260), { time: now, midi: measurement.smoothedMidi, grade: score?.grade }])
  }, [isPlaying])
  const microphone = useMicrophonePitch(onPitch)
  useEffect(() => { if (ended) microphone.stop() }, [ended, microphone.stop])
  const allMidi = [...normalizedNotes.map((note) => note.midi), ...points.map((point) => point.midi)]
  const range = useMemo(() => allMidi.length ? { low: Math.floor(Math.min(...allMidi)) - 2, high: Math.ceil(Math.max(...allMidi)) + 2 } : { low: 48, high: 72 }, [normalizedNotes, points])
  const status = microphone.status === 'active' ? (live.smoothedMidi == null ? 'Aucune voix détectée' : 'Microphone actif') : microphone.status === 'denied' ? 'Permission refusée' : microphone.status === 'requesting' ? 'Autorisation…' : 'Microphone désactivé'
  const grade = live.score?.grade || (live.target ? '—' : 'En attente')

  return <aside className="perfect-pitch-panel">
    <div className="perfect-pitch-heading"><div><p>Perfect Pitch</p><h3>Justesse en direct</h3></div><span className={`perfect-pitch-grade ${grade.toLowerCase()}`}>{grade}</span></div>
    <PitchGrid title="Piano roll — Référence" notes={normalizedNotes} points={[]} currentTime={currentTime} range={range} />
    <PitchGrid title="Piano roll — Ta voix" notes={[]} points={points} currentTime={currentTime} range={range} live />
    <div className="perfect-pitch-footer"><div><b>{status}</b>{live.target && <small>Cible {live.target.note}</small>}</div><button type="button" onClick={microphone.status === 'active' ? microphone.stop : microphone.start} disabled={microphone.status === 'requesting'}>{microphone.status === 'active' ? <MicOff size={15} /> : <Mic size={15} />}{microphone.status === 'active' ? 'Désactiver' : microphone.status === 'denied' ? 'Réessayer' : 'Activer le micro'}</button></div>
  </aside>
}
