import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AudioLines, Mic, MicOff, Smartphone } from 'lucide-react'
import { microphoneAvailable } from '../utils/microphoneSource.js'
import PhoneMicPairing, { MicLevel, phoneStatus } from './PhoneMicPairing.jsx'
import { classifyPitch, findTargetNote, midiToNoteName, normalizeNotes } from '../utils/pitchMath.js'
import { getPitchViewport, getVisiblePitchNotes, getVisiblePitchPoints, pitchNoteRect, pitchVerticalPosition, PITCH_WINDOW_SECONDS } from '../utils/pitchViewport.js'
import { useMicrophonePitch } from '../hooks/useMicrophonePitch.js'
import { usePerfectPitchScoring } from '../hooks/usePerfectPitchScoring.js'
import { scoreRank } from '../utils/perfectPitchScoring.js'
import './PerfectPitchPanel.css'

function UnifiedPitchGrid({ notes, points, currentTime, range, target }) {
  const x = time => ((time - currentTime) / PITCH_WINDOW_SECONDS + .5) * 100
  const y = midi => pitchVerticalPosition(midi, range)
  const trails = []
  points.forEach((point, index) => {
    const previous = points[index - 1]
    // Do not join across silences or backwards seeks.
    if (!previous || point.time - previous.time > .3 || point.time < previous.time) trails.push([])
    trails.at(-1).push(`${x(point.time)},${y(point.midi)}`)
  })
  return <section className="perfect-pitch-grid unified-pitch-grid pitch-adaptive-grid">
    <header className="pitch-grid-legend">
      <span><i className="pitch-legend reference" />Mélodie</span>
      <span><i className="pitch-legend live" />Votre voix</span>
      <small>Vue adaptative</small>
    </header>
    <div className="pitch-grid-range"><span>{midiToNoteName(range.high)} <span>↔</span> {midiToNoteName(range.low)}</span><span>Maintenant</span></div>
    <div className="perfect-pitch-roll perfect-pitch-roll-zoomed">
      <div className="perfect-pitch-window" role="img" aria-label={`Mélodie et voix superposées, de ${midiToNoteName(range.low)} à ${midiToNoteName(range.high)}`} style={{ '--pitch-rows': Math.min(16, range.high - range.low), '--pitch-note-height': `${Math.max(6, Math.min(12, 180 / (range.high - range.low)))}px` }}>
        <div className="pitch-history-shade" />
        {notes.map(note => {
          const rect = pitchNoteRect(note, currentTime)
          return <i className={`perfect-pitch-note ${note === target ? 'is-current' : note.end < currentTime ? 'is-past' : ''}`} key={`${note.start}-${note.end}-${note.midi}`} data-midi={note.midi} title={midiToNoteName(note.midi)} style={{ left: `${rect.left}%`, top: `${y(note.midi)}%`, width: `${rect.width}%` }}>
            {rect.width >= 12 && <span>{midiToNoteName(note.midi)}</span>}
          </i>
        })}
        <svg className="pitch-voice-trail" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {trails.filter(trail => trail.length > 1).map((trail, index) => <polyline key={index} points={trail.join(' ')} vectorEffect="non-scaling-stroke" />)}
        </svg>
        {points.map((point, index) => <i className={`perfect-pitch-point ${point.grade?.toLowerCase() || ''}`} key={index} style={{ left: `${x(point.time)}%`, top: `${y(point.midi)}%` }} />)}
        <i className="perfect-pitch-now" />
      </div>
    </div>
    <div className="pitch-time-axis" aria-hidden="true"><span>−4 s</span><span>0</span><span>+4 s</span></div>
  </section>
}

export default function PerfectPitchPanel({ rawNotes, currentTime, isPlaying, ended, seekVersion, runId, onReplay, phone, micSource, onSourceChange, sourceLocked, challengeBridge }) {
  const normalizedNotes = useMemo(() => normalizeNotes(rawNotes || []), [rawNotes])
  const [points, setPoints] = useState([])
  const [live, setLive] = useState({})
  const [pairingOpen, setPairingOpen] = useState(false)
  const [phoneLatency, setPhoneLatency] = useState(0)
  const effectiveTime = Math.max(0, currentTime - (micSource === 'phone' ? phoneLatency / 1000 : 0))
  const currentRef = useRef({ currentTime, notes: normalizedNotes })
  const scoringRef = useRef(null)
  currentRef.current = { currentTime: effectiveTime, notes: normalizedNotes }
  const onPitch = useCallback((measurement) => {
    const { currentTime: now, notes } = currentRef.current
    const target = findTargetNote(notes, now)
    const liveScore = measurement.smoothedMidi != null && target ? classifyPitch(measurement.smoothedMidi, target.midi, true) : null
    setLive({ ...measurement, target, score: liveScore })
    scoringRef.current?.addSample({ midi: measurement.smoothedMidi })
    if (isPlaying && liveScore?.adjustedMidi != null) setPoints(items => [...items.slice(-260), { time: now, midi: liveScore.adjustedMidi, grade: liveScore.grade }])
  }, [isPlaying])
  const phoneAvailable = phone.status === 'connected' && !phone.muted && !phone.trackMuted && !ended
  const microphone = useMicrophonePitch(onPitch, { source: micSource, stream: phone.remoteStream, available: phoneAvailable })
  const micActive = microphoneAvailable(micSource, microphone.status, phone.status, phone.muted, phone.trackMuted)
  const scoring = usePerfectPitchScoring({ notes: normalizedNotes, currentTime: effectiveTime, isPlaying, microphoneActive: micActive, ended, seekVersion, runId })
  scoringRef.current = scoring
  if (challengeBridge) challengeBridge.current = { prepare: async () => { scoring.reset(); if (micSource === 'local') await microphone.start(); else await microphone.prepare() }, finish: scoring.finish }
  useEffect(() => { if (ended) microphone.stop() }, [ended, microphone.stop])
  useEffect(() => { if (ended) setPairingOpen(false) }, [ended])
  useEffect(() => { microphone.stop(); setLive({}) }, [micSource, microphone.stop])
  const useLocal = () => { if (sourceLocked) return; onSourceChange('local'); setPairingOpen(false) }
  const usePhone = () => { if (sourceLocked) return; onSourceChange('phone'); setPairingOpen(true) }
  // Display history belongs to this passage/run, not a previous playback.
  useEffect(() => { setPoints([]); setLive({}) }, [seekVersion, runId, normalizedNotes])

  const visibleNotes = useMemo(() => getVisiblePitchNotes(normalizedNotes, currentTime), [normalizedNotes, currentTime])
  const visiblePoints = useMemo(() => getVisiblePitchPoints(points, currentTime), [points, currentTime])
  const range = useMemo(() => getPitchViewport(visibleNotes, visiblePoints), [visibleNotes, visiblePoints])
  const target = findTargetNote(normalizedNotes, currentTime)
  const hasLive = micActive && live.target === target && live.score
  const status = micSource === 'phone' ? phoneStatus(phone) : microphone.status === 'active' ? (live.smoothedMidi == null ? 'Aucune voix détectée' : 'Microphone actif')
    : microphone.status === 'denied' ? 'Permission refusée' : microphone.status === 'requesting' ? 'Autorisation…' : 'Microphone désactivé'
  const grade = hasLive ? live.score.grade : 'En attente'

  return <aside className="perfect-pitch-panel pitch-panel-adaptive">
    <div className="perfect-pitch-heading"><div><p><AudioLines size={13} />Perfect Pitch</p><h3>Trouvez la note.</h3></div><span className={`perfect-pitch-grade ${hasLive ? grade.toLowerCase() : 'waiting'}`}>{grade}</span></div>
    <div className="perfect-pitch-score"><div><small>Score</small><b>{scoring.scoreValue.toLocaleString('fr-FR')}</b></div><div><small>Combo</small><b>×{scoring.score.currentCombo}</b></div></div>
    <UnifiedPitchGrid notes={visibleNotes} points={visiblePoints} currentTime={currentTime} range={range} target={target} />
    <div className="pitch-target-readout">
      <div><span>À chanter</span><strong>{target ? midiToNoteName(target.midi) : '—'}</strong></div>
      <p>Chantez à votre octave.<br /><span>La voix se superpose à la mélodie.</span></p>
    </div>
    {scoring.lastResult && <div className={`perfect-pitch-result ${scoring.lastResult.rating}`}>{scoring.lastResult.rating.toUpperCase()}{scoring.lastResult.points ? ` +${scoring.lastResult.points}` : ''}</div>}
    <div className="pitch-mic-source" role="group" aria-label="Source du microphone">
      <button disabled={sourceLocked} className={micSource === 'local' ? 'selected' : ''} aria-pressed={micSource === 'local'} onClick={useLocal}><Mic size={13} />Cet appareil</button>
      <button disabled={sourceLocked} className={micSource === 'phone' ? 'selected' : ''} aria-pressed={micSource === 'phone'} onClick={usePhone}><Smartphone size={13} />Utiliser mon téléphone</button>
    </div>
    <div className="perfect-pitch-footer">
      <div><b><i className={micActive ? 'is-active' : ''} />{status}</b>{!micActive && isPlaying && <small>Scoring en pause — microphone indisponible</small>}{micSource === 'phone' && micActive && <div className="pitch-phone-indicator"><MicLevel value={live.rms} /></div>}</div>
      {micSource === 'phone' ? <button onClick={() => { microphone.prepare().catch(() => {}); setPairingOpen(true) }}>Connexion</button> : <button type="button" onClick={microphone.status === 'active' ? microphone.stop : microphone.start} disabled={microphone.status === 'requesting'}>{microphone.status === 'active' ? <MicOff size={15} /> : <Mic size={15} />}{microphone.status === 'active' ? 'Désactiver' : microphone.status === 'denied' ? 'Réessayer' : 'Activer le micro'}</button>}
    </div>
    {pairingOpen && <PhoneMicPairing phone={phone} locked={sourceLocked} onClose={() => setPairingOpen(false)} onLocal={useLocal} onApprove={() => { microphone.prepare().catch(() => {}); phone.approve() }} latency={phoneLatency} setLatency={setPhoneLatency} level={live.rms} analysisStatus={microphone.status} onResumeAudio={() => { phone.resumeAudio(); microphone.start() }} />}
    {ended && <section className="perfect-pitch-summary"><p>Performance</p><strong>{scoring.scoreValue.toLocaleString('fr-FR')}</strong><small>/ 100 000 · Rang {scoreRank(scoring.scoreValue)}</small><div><span>Perfect <b>{scoring.score.perfect}</b></span><span>Great <b>{scoring.score.great}</b></span><span>Good <b>{scoring.score.good}</b></span><span>OK <b>{scoring.score.ok}</b></span><span>Miss <b>{scoring.score.miss}</b></span><span>Meilleur combo <b>×{scoring.score.maxCombo}</b></span></div><button type="button" onClick={onReplay}>Rejouer</button></section>}
  </aside>
}
