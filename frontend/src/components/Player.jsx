import { useEffect, useRef, useState } from 'react'
import { FilePenLine, Pause, Play, Smartphone } from 'lucide-react'
import VolumeKnob from './VolumeKnob.jsx'
import KaraokeLyrics from './KaraokeLyrics.jsx'
import AudioSpectrum from './AudioSpectrum.jsx'
import PerfectPitchPanel from './PerfectPitchPanel.jsx'
import PhoneMicPairing from './PhoneMicPairing.jsx'
import { usePhoneMicrophone } from '../hooks/usePhoneMicrophone.js'
import { usePerformanceRecording } from '../hooks/usePerformanceRecording.js'
import { useMicrophoneLevel } from '../hooks/useMicrophoneLevel.js'

function formatTime(time) {
  if (!Number.isFinite(time)) return '0:00'
  return `${Math.floor(time / 60)}:${Math.floor(time % 60).toString().padStart(2, '0')}`
}

function getAudioUrl(path) {
  if (!path) return undefined
  return /^https?:\/\//i.test(path) ? path : `${import.meta.env.VITE_API_URL || ''}${path}`
}

export default function Player({ trackInfo, stems, lyricsLines, lyricsSource, sessionId, perfectPitch, onPerformanceSaved, onListenToPerformance, onEditLyrics, challenge }) {
  const challengeBridge = useRef(null), challengeAttempt = useRef(null), finalScore = useRef(null), mounted = useRef(true)
  const [countdown, setCountdown] = useState(null)
  const playStarting = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const vocalRef = useRef(null)
  const instruRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [vocalVol, setVocalVol] = useState(0.9)
  const [instruVol, setInstruVol] = useState(0.9)
  const [lyricsDelay, setLyricsDelay] = useState(0)
  const [trackEnded, setTrackEnded] = useState(false)
  const [pitchSeekVersion, setPitchSeekVersion] = useState(0)
  const [pitchRunId, setPitchRunId] = useState(0)
  const phone = usePhoneMicrophone()
  const [micSource, setMicSource] = useState('local')
  const [recordPairingOpen, setRecordPairingOpen] = useState(false)
  const recording = usePerformanceRecording({ sessionId, source: micSource, phone, onSaved: onPerformanceSaved,
    ...(challenge ? { endpoint: `/api/challenges/${challenge.id}/performances`, getMetadata: () => {
      if (!finalScore.current) throw new Error('Prise interrompue : recommencez le morceau pour soumettre un défi complet.')
      return { attemptId: challengeAttempt.current, scoringVersion: challenge.scoringVersion, duration: vocalRef.current?.duration, score: finalScore.current }
    } } : {}) })
  const { armed: recordArmed, recording: isRecording, saving: isSaving, error: recordError, saved: savedPerformance, stop: stopRecording } = recording
  const sourceLocked = recordArmed || isRecording || isSaving || recording.preparing || countdown !== null
  const meter = useMicrophoneLevel(phone.remoteStream, recordPairingOpen && phone.status === 'connected' && !phone.muted && !phone.trackMuted)
  const changeSource = source => {
    if (sourceLocked) return
    setMicSource(source)
    if (source === 'local') { phone.disconnect(); setRecordPairingOpen(false) }
    else if (['idle', 'ended', 'error', 'expired'].includes(phone.status)) phone.create()
  }
  useEffect(() => { if (trackEnded) phone.disconnect() }, [trackEnded, phone.disconnect])

  useEffect(() => { if (vocalRef.current) vocalRef.current.volume = vocalVol }, [vocalVol])
  useEffect(() => { if (instruRef.current) instruRef.current.volume = instruVol }, [instruVol])
  const armRecording = async () => {
    if (await recording.arm()) {
      finalScore.current = null
      vocalRef.current?.pause(); instruRef.current?.pause()
      if (vocalRef.current) vocalRef.current.currentTime = 0
      if (instruRef.current) instruRef.current.currentTime = 0
      setCurrentTime(0); setIsPlaying(false); setTrackEnded(false)
      setPitchSeekVersion(version => version + 1)
    }
  }

  const togglePlay = async () => {
    const vocal = vocalRef.current
    const instru = instruRef.current
    if (!vocal || !instru || isRecording || countdown !== null || playStarting.current) return
    if (isPlaying) {
      vocal.pause(); instru.pause(); setIsPlaying(false)
      return
    }
    playStarting.current = true
    try {
      if (challenge) {
        if (!recordArmed) { recording.setError('Armez l’enregistrement pour participer au défi.'); return }
        setCountdown('Préparation')
        await challengeBridge.current?.prepare()
        const response = await fetch(`/api/challenges/${challenge.id}/start`, { method: 'POST' })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error)
        challengeAttempt.current = data.id
        for (const count of [3, 2, 1]) { if (!mounted.current) return; setCountdown(count); await new Promise(resolve => setTimeout(resolve, 1000)) }
        if (!mounted.current) return
        setCountdown(null)
      }
      instru.currentTime = vocal.currentTime
      if (recordArmed) recording.start()
      setTrackEnded(false); await Promise.all([vocal.play(), instru.play()])
      setIsPlaying(true)
    } catch (error) {
      setCountdown(null)
      recording.cancel(); recording.setError(error.message || 'Lecture impossible.')
      vocal.pause(); instru.pause(); setIsPlaying(false)
      console.error('Impossible de lire les pistes audio :', error)
    } finally { playStarting.current = false }
  }

  const handleTimeUpdate = () => {
    const vocal = vocalRef.current
    const instru = instruRef.current
    setCurrentTime(vocal?.currentTime ?? 0)
    if (vocal && instru && Math.abs(instru.currentTime - vocal.currentTime) > 0.08) instru.currentTime = vocal.currentTime
  }

  const seekTo = (value) => {
    const time = Number(value)
    if (!Number.isFinite(time)) return
    if (vocalRef.current) vocalRef.current.currentTime = time
    if (instruRef.current) instruRef.current.currentTime = time
    setCurrentTime(time)
    setPitchSeekVersion((version) => version + 1)
  }

  const replayPerfectPitch = () => {
    const vocal = vocalRef.current; const instru = instruRef.current
    vocal?.pause(); instru?.pause()
    if (vocal) vocal.currentTime = 0
    if (instru) instru.currentTime = 0
    setCurrentTime(0); setTrackEnded(false); setIsPlaying(false); setPitchRunId((id) => id + 1); setPitchSeekVersion((version) => version + 1)
  }

  return <div className="player-workspace">
    {challenge && <p className="challenge-recording-notice" role="status">Votre performance audio sera enregistrée pour ce défi et accessible uniquement aux deux participants. {countdown !== null && <strong> {countdown}…</strong>}</p>}
    <div className="player-core">
      <div className={`stage ${perfectPitch?.rawNotes?.length ? 'stage-with-perfect-pitch' : ''}`}>
        <AudioSpectrum audioRef={instruRef} />
        <div className="track-seek"><span>{formatTime(currentTime)}</span><input aria-label="Position dans le morceau" type="range" min="0" max={duration || 0} step="0.1" value={Math.min(currentTime, duration || currentTime)} style={{ '--seek-progress': `${duration ? Math.min(100, (currentTime / duration) * 100) : 0}%` }} onChange={(event) => seekTo(event.target.value)} disabled={!duration || isRecording || Boolean(challenge)} /><span>{formatTime(duration)}</span></div>
        <div className="track-meta">{trackInfo?.title ? <><strong>{trackInfo.title}</strong> — {trackInfo.artist}{lyricsSource === 'whisper' && <small className="generated-lyrics-note">Paroles générées automatiquement</small>}{lyricsLines?.length > 0 && sessionId && onEditLyrics && <button type="button" className="edit-lyrics-button" onClick={onEditLyrics}><FilePenLine size={13} />Modifier les paroles</button>}</> : 'Identification en cours…'}</div>
        <div className="karaoke-stage-content"><div className="karaoke-lyrics-panel"><KaraokeLyrics audioRef={vocalRef} lyricsOffset={lyricsDelay} lines={lyricsLines} duration={duration} currentTime={Math.max(0, currentTime - lyricsDelay)} /></div>{perfectPitch?.rawNotes?.length && <PerfectPitchPanel rawNotes={perfectPitch.rawNotes} currentTime={currentTime} isPlaying={isPlaying} ended={trackEnded} seekVersion={pitchSeekVersion} runId={pitchRunId} onReplay={replayPerfectPitch} phone={phone} micSource={micSource} onSourceChange={changeSource} sourceLocked={sourceLocked} challengeBridge={challenge ? challengeBridge : undefined} />}</div>
      </div>
      <audio ref={vocalRef} src={getAudioUrl(stems?.vocalUrl)} onTimeUpdate={handleTimeUpdate} onLoadedMetadata={() => setDuration(vocalRef.current?.duration ?? 0)} onEnded={() => { if (challenge) finalScore.current = challengeBridge.current?.finish(); setIsPlaying(false); setTrackEnded(true); stopRecording() }} />
      <audio ref={instruRef} src={getAudioUrl(stems?.instruUrl)} />
      <div className="console">
        <div className="transport"><button onClick={togglePlay} disabled={isRecording || recording.preparing || isSaving || countdown !== null} aria-label={isPlaying ? 'Mettre en pause' : 'Lire le morceau'}>{isRecording ? '●' : isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}</button><span className="timecode">{isRecording ? 'REC' : formatTime(currentTime)}</span></div>
        <div className="record-unit"><button type="button" className={`record-button ${recordArmed ? 'armed' : ''} ${isRecording ? 'recording' : ''}`} onClick={armRecording} disabled={isRecording || isSaving || recording.preparing || countdown !== null}>{isRecording ? '● Enregistrement' : recordArmed ? 'Annuler' : '● Enregistrer'}</button><span>{recordArmed && !isRecording ? 'Appuyez sur lecture' : isSaving ? 'Sauvegarde…' : micSource === 'phone' ? 'Micro téléphone' : 'Microphone'}</span><select className="record-source" aria-label="Microphone pour l’enregistrement" value={micSource} disabled={sourceLocked} onChange={event => { changeSource(event.target.value); if (event.target.value === 'phone') setRecordPairingOpen(true) }}><option value="local">Cet appareil</option><option value="phone">Téléphone</option></select>{micSource === 'phone' && <button className="record-phone-settings" type="button" aria-label="Connexion téléphone" title="Connexion téléphone" onClick={() => setRecordPairingOpen(true)}><Smartphone size={14} /></button>}</div>
        <VolumeKnob label="Voix" variant="vocal" value={vocalVol} onChange={setVocalVol} />
        <VolumeKnob label="Instru" variant="instru" value={instruVol} onChange={setInstruVol} />
        <div className="lyrics-sync"><span className="knob-label">Paroles</span><div className="sync-controls"><button type="button" onClick={() => setLyricsDelay((value) => Number((value - 0.5).toFixed(1)))}>−</button><button type="button" className="sync-value" onClick={() => setLyricsDelay(0)}>{lyricsDelay > 0 ? '+' : ''}{lyricsDelay.toFixed(1)} s</button><button type="button" onClick={() => setLyricsDelay((value) => Number((value + 0.5).toFixed(1)))}>+</button></div><span className="sync-hint">− tôt · + tard</span></div>
      </div>
      {recordPairingOpen && <PhoneMicPairing phone={phone} purpose="recording" locked={sourceLocked} onClose={() => setRecordPairingOpen(false)} onLocal={() => changeSource('local')} onApprove={() => { meter.prepare().catch(() => {}); phone.approve() }} level={meter.level} analysisStatus={meter.status} onResumeAudio={() => { phone.resumeAudio(); meter.prepare().catch(() => {}) }} />}
      {recordError && <div className="record-error">{recordError}</div>}
      {savedPerformance && <div className="record-saved"><span>{challenge ? 'Performance soumise au défi.' : 'Performance sauvegardée dans Mes performances.'}</span><button type="button" onClick={() => onListenToPerformance?.(savedPerformance)}>Écouter ma prise</button></div>}
    </div>
  </div>
}
