import { useCallback, useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import VolumeKnob from './VolumeKnob.jsx'
import KaraokeLyrics from './KaraokeLyrics.jsx'
import AudioSpectrum from './AudioSpectrum.jsx'
import PerfectPitchPanel from './PerfectPitchPanel.jsx'

function formatTime(time) {
  if (!Number.isFinite(time)) return '0:00'
  return `${Math.floor(time / 60)}:${Math.floor(time % 60).toString().padStart(2, '0')}`
}

function getAudioUrl(path) {
  if (!path) return undefined
  return /^https?:\/\//i.test(path) ? path : `${import.meta.env.VITE_API_URL || ''}${path}`
}

export default function Player({ trackInfo, stems, lyricsLines, lyricsSource, sessionId, perfectPitch, onPerformanceSaved, onListenToPerformance }) {
  const vocalRef = useRef(null)
  const instruRef = useRef(null)
  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const [isPlaying, setIsPlaying] = useState(false)
  const [recordArmed, setRecordArmed] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [vocalVol, setVocalVol] = useState(0.9)
  const [instruVol, setInstruVol] = useState(0.9)
  const [lyricsDelay, setLyricsDelay] = useState(0)
  const [recordError, setRecordError] = useState('')
  const [savedPerformance, setSavedPerformance] = useState(null)
  const [trackEnded, setTrackEnded] = useState(false)
  const [pitchSeekVersion, setPitchSeekVersion] = useState(0)
  const [pitchRunId, setPitchRunId] = useState(0)

  useEffect(() => { if (vocalRef.current) vocalRef.current.volume = vocalVol }, [vocalVol])
  useEffect(() => { if (instruRef.current) instruRef.current.volume = instruVol }, [instruVol])
  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), [])
  const savePerformance = useCallback(async (blob) => {
    if (!sessionId || !blob.size) return
    setIsSaving(true)
    try {
      const form = new FormData()
      form.append('sessionId', sessionId)
      form.append('recording', blob, 'performance.webm')
      const response = await fetch('/api/performances', { method: 'POST', body: form })
      if (!response.ok) throw new Error('La sauvegarde a échoué.')
      const performance = await response.json()
      setSavedPerformance(performance)
      onPerformanceSaved?.(performance)
    } catch (error) { setRecordError(error.message || "Impossible de sauvegarder l'enregistrement.") }
    finally { setIsSaving(false) }
  }, [onPerformanceSaved, sessionId])

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    setIsRecording(false)
    setRecordArmed(false)
  }, [])

  const armRecording = async () => {
    if (recordArmed) {
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      recorderRef.current = null
      setRecordArmed(false)
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setRecordError("L'enregistrement micro n'est pas pris en charge par ce navigateur.")
      return
    }
    try {
      setRecordError(''); setSavedPerformance(null)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop())
        streamRef.current = null
        recorderRef.current = null
        await savePerformance(new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }))
      }
      streamRef.current = stream
      recorderRef.current = recorder
      setRecordArmed(true)
    } catch { setRecordError("L'accès au microphone a été refusé.") }
  }

  const togglePlay = useCallback(async () => {
    const vocal = vocalRef.current
    const instru = instruRef.current
    if (!vocal || !instru || isRecording) return
    if (isPlaying) {
      vocal.pause(); instru.pause(); setIsPlaying(false)
      return
    }
    try {
      instru.currentTime = vocal.currentTime
      if (recordArmed && recorderRef.current?.state === 'inactive') {
        recorderRef.current.start()
        setIsRecording(true)
      }
      setTrackEnded(false); await Promise.all([vocal.play(), instru.play()])
      setIsPlaying(true)
    } catch (error) {
      stopRecording()
      setIsPlaying(false)
      console.error('Impossible de lire les pistes audio :', error)
    }
  }, [isPlaying, isRecording, recordArmed, stopRecording])

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
    <div className="player-core">
      <div className={`stage ${perfectPitch?.rawNotes?.length ? 'stage-with-perfect-pitch' : ''}`}>
        <AudioSpectrum audioRef={instruRef} />
        <div className="track-seek"><span>{formatTime(currentTime)}</span><input type="range" min="0" max={duration || 0} step="0.1" value={Math.min(currentTime, duration || currentTime)} style={{ '--seek-progress': `${duration ? Math.min(100, (currentTime / duration) * 100) : 0}%` }} onChange={(event) => seekTo(event.target.value)} disabled={!duration || isRecording} /><span>{formatTime(duration)}</span></div>
        <div className="track-meta">{trackInfo?.title ? <><strong>{trackInfo.title}</strong> — {trackInfo.artist}{lyricsSource === 'whisper' && <small className="generated-lyrics-note">Paroles générées automatiquement</small>}</> : 'Identification en cours…'}</div>
        <div className="karaoke-stage-content"><div className="karaoke-lyrics-panel"><KaraokeLyrics lines={lyricsLines} currentTime={Math.max(0, currentTime - lyricsDelay)} /></div>{perfectPitch?.rawNotes?.length && <PerfectPitchPanel rawNotes={perfectPitch.rawNotes} currentTime={currentTime} isPlaying={isPlaying} ended={trackEnded} seekVersion={pitchSeekVersion} runId={pitchRunId} onReplay={replayPerfectPitch} />}</div>
      </div>
      <audio ref={vocalRef} src={getAudioUrl(stems?.vocalUrl)} onTimeUpdate={handleTimeUpdate} onLoadedMetadata={() => setDuration(vocalRef.current?.duration ?? 0)} onEnded={() => { setIsPlaying(false); setTrackEnded(true); stopRecording() }} />
      <audio ref={instruRef} src={getAudioUrl(stems?.instruUrl)} />
      <div className="console">
        <div className="transport"><button onClick={togglePlay} disabled={isRecording} aria-label={isPlaying ? 'Mettre en pause' : 'Lire le morceau'}>{isRecording ? '●' : isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}</button><span className="timecode">{isRecording ? 'REC' : formatTime(currentTime)}</span></div>
        <div className="record-unit"><button type="button" className={`record-button ${recordArmed ? 'armed' : ''} ${isRecording ? 'recording' : ''}`} onClick={armRecording} disabled={isRecording || isSaving}>{isRecording ? '● Enregistrement' : recordArmed ? 'Annuler' : '● Enregistrer'}</button><span>{recordArmed && !isRecording ? 'Appuyez sur lecture' : isSaving ? 'Sauvegarde…' : 'Microphone'}</span></div>
        <VolumeKnob label="Voix" variant="vocal" value={vocalVol} onChange={setVocalVol} />
        <VolumeKnob label="Instru" variant="instru" value={instruVol} onChange={setInstruVol} />
        <div className="lyrics-sync"><span className="knob-label">Paroles</span><div className="sync-controls"><button type="button" onClick={() => setLyricsDelay((value) => Number((value - 0.5).toFixed(1)))}>−</button><button type="button" className="sync-value" onClick={() => setLyricsDelay(0)}>{lyricsDelay > 0 ? '+' : ''}{lyricsDelay.toFixed(1)} s</button><button type="button" onClick={() => setLyricsDelay((value) => Number((value + 0.5).toFixed(1)))}>+</button></div><span className="sync-hint">− tôt · + tard</span></div>
      </div>
      {recordError && <div className="record-error">{recordError}</div>}
      {savedPerformance && <div className="record-saved"><span>Performance sauvegardÃ©e dans Mes performances.</span><button type="button" onClick={() => onListenToPerformance?.(savedPerformance)}>Ã‰couter ma prise</button></div>}
    </div>
  </div>
}
