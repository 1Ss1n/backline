import { useEffect, useRef, useState } from 'react'
import { Mic2, Music2, Pause, Play } from 'lucide-react'
import PerformanceWaveform from './PerformanceWaveform'
import './SharedPerformancePlayer.css'

const audioUrl = path => /^https?:\/\//i.test(path || '') ? path : `${import.meta.env.VITE_API_URL || ''}${path || ''}`
const formatTime = time => Number.isFinite(time) ? `${Math.floor(time / 60)}:${Math.floor(time % 60).toString().padStart(2, '0')}` : '0:00'

export default function SharedPerformancePlayer({ performance }) {
  const instruRef = useRef(null)
  const voiceRef = useRef(null)
  const requestRef = useRef(0)
  const [playing, setPlaying] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [instruVolume, setInstruVolume] = useState(.9)
  const [voiceVolume, setVoiceVolume] = useState(.9)
  useEffect(() => { if (instruRef.current) instruRef.current.volume = instruVolume }, [instruVolume])
  useEffect(() => { if (voiceRef.current) voiceRef.current.volume = voiceVolume }, [voiceVolume])
  useEffect(() => {
    const instru = instruRef.current, voice = voiceRef.current
    return () => { requestRef.current++; instru?.pause(); voice?.pause() }
  }, [])
  const stop = () => {
    requestRef.current++
    instruRef.current?.pause(); voiceRef.current?.pause()
    setPlaying(false); setStarting(false)
  }
  const seek = value => {
    const next = Math.max(0, Math.min(duration, Number(value)))
    if (!Number.isFinite(next)) return
    if (instruRef.current) instruRef.current.currentTime = next
    if (voiceRef.current) voiceRef.current.currentTime = next
    setTime(next)
  }
  const toggle = async () => {
    const instru = instruRef.current, voice = voiceRef.current
    if (!instru || !voice || starting) return
    if (playing) { stop(); return }
    if (instru.ended || instru.currentTime >= duration) seek(0)
    voice.currentTime = instru.currentTime
    const request = ++requestRef.current
    setStarting(true); setError('')
    try {
      await Promise.all([instru.play(), voice.play()])
      if (request !== requestRef.current) { instru.pause(); voice.pause(); return }
      setPlaying(true)
    } catch {
      instru.pause(); voice.pause()
      if (request === requestRef.current) { setPlaying(false); setError('Lecture impossible. Réessayez dans un instant.') }
    } finally { if (request === requestRef.current) setStarting(false) }
  }
  const sync = () => {
    const instru = instruRef.current, voice = voiceRef.current
    setTime(instru?.currentTime || 0)
    if (instru && voice && Math.abs(instru.currentTime - voice.currentTime) > .08) voice.currentTime = instru.currentTime
  }
  return <div className="shared-performance-player shared-wave-player">
    <audio ref={instruRef} preload="metadata" src={audioUrl(performance.track.instruUrl)} onTimeUpdate={sync} onLoadedMetadata={() => { const value = instruRef.current?.duration; setDuration(Number.isFinite(value) ? value : 0) }} onEnded={stop} />
    <audio ref={voiceRef} preload="metadata" src={audioUrl(performance.url)} />
    <div className="shared-wave-transport">
      <button type="button" className="shared-play" onClick={toggle} disabled={starting} aria-label={playing ? 'Mettre en pause' : 'Lire la performance'}>{playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</button>
      <PerformanceWaveform source={audioUrl(performance.url)} time={time} duration={duration} onSeek={seek} />
      <div className="shared-wave-time"><span>{formatTime(time)}</span><small>{formatTime(duration)}</small></div>
    </div>
    <div className="shared-wave-volumes">
      <label title="Volume de la voix"><Mic2 size={14} /><input aria-label="Volume de la voix" type="range" min="0" max="1" step=".05" value={voiceVolume} onChange={event => setVoiceVolume(Number(event.target.value))} style={{ '--progress': `${voiceVolume * 100}%` }} /></label>
      <label title="Volume de l’instrumentale"><Music2 size={14} /><input aria-label="Volume de l’instrumentale" type="range" min="0" max="1" step=".05" value={instruVolume} onChange={event => setInstruVolume(Number(event.target.value))} style={{ '--progress': `${instruVolume * 100}%` }} /></label>
    </div>
    {error && <p className="shared-wave-error" role="alert">{error}</p>}
  </div>
}
