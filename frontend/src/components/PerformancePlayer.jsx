import { useEffect, useRef, useState } from 'react'
import VolumeKnob from './VolumeKnob.jsx'
import KaraokeLyrics from './KaraokeLyrics.jsx'
import AudioSpectrum from './AudioSpectrum.jsx'

const getAudioUrl = (path) => /^https?:\/\//i.test(path || '') ? path : `${import.meta.env.VITE_API_URL || ''}${path || ''}`
const formatTime = (time) => Number.isFinite(time) ? `${Math.floor(time / 60)}:${Math.floor(time % 60).toString().padStart(2, '0')}` : '0:00'

export default function PerformancePlayer({ trackInfo, stems, lyricsLines, performance }) {
  const instruRef = useRef(null)
  const voiceRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [instruVol, setInstruVol] = useState(0.9)
  const [voiceVol, setVoiceVol] = useState(0.9)

  useEffect(() => { if (instruRef.current) instruRef.current.volume = instruVol }, [instruVol])
  useEffect(() => { if (voiceRef.current) voiceRef.current.volume = voiceVol }, [voiceVol])

  const togglePlay = async () => {
    const instru = instruRef.current; const voice = voiceRef.current
    if (!instru || !voice) return
    if (isPlaying) { instru.pause(); voice.pause(); setIsPlaying(false); return }
    try {
      voice.currentTime = instru.currentTime
      await Promise.all([instru.play(), voice.play()])
      setIsPlaying(true)
    } catch { setIsPlaying(false) }
  }
  const syncTime = () => {
    const instru = instruRef.current; const voice = voiceRef.current
    setCurrentTime(instru?.currentTime ?? 0)
    if (instru && voice && Math.abs(instru.currentTime - voice.currentTime) > 0.08) voice.currentTime = instru.currentTime
  }
  const seekTo = (value) => {
    const time = Number(value)
    if (instruRef.current) instruRef.current.currentTime = time
    if (voiceRef.current) voiceRef.current.currentTime = time
    setCurrentTime(time)
  }

  return <div className="player-workspace performance-workspace"><div className="player-core">
    <div className="stage"><AudioSpectrum audioRef={instruRef} /><div className="track-seek"><span>{formatTime(currentTime)}</span><input type="range" min="0" max={duration || 0} step="0.1" value={Math.min(currentTime, duration || currentTime)} style={{ '--seek-progress': `${duration ? Math.min(100, currentTime / duration * 100) : 0}%` }} onChange={(event) => seekTo(event.target.value)} /><span>{formatTime(duration)}</span></div><div className="track-meta"><strong>{trackInfo?.title}</strong> — votre performance</div><KaraokeLyrics lines={lyricsLines} currentTime={currentTime} /></div>
    <audio ref={instruRef} src={getAudioUrl(stems?.instruUrl)} onTimeUpdate={syncTime} onLoadedMetadata={() => setDuration(instruRef.current?.duration ?? 0)} onEnded={() => { voiceRef.current?.pause(); setIsPlaying(false) }} />
    <audio ref={voiceRef} src={getAudioUrl(performance?.url)} />
    <div className="console"><div className="transport"><button onClick={togglePlay}>{isPlaying ? 'Ⅱ' : '▶'}</button><span className="timecode">{formatTime(currentTime)}</span></div><VolumeKnob label="Votre voix" variant="vocal" value={voiceVol} onChange={setVoiceVol} /><VolumeKnob label="Instru" variant="instru" value={instruVol} onChange={setInstruVol} /></div>
  </div></div>
}
