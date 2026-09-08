import { useRef, useState, useEffect, useCallback } from 'react'
import VolumeKnob from './VolumeKnob.jsx'
import KaraokeLyrics from './KaraokeLyrics.jsx'
import AudioSpectrum from './AudioSpectrum.jsx'

function formatTime(t) {
  if (!Number.isFinite(t)) return '0:00'
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function getStemUrl(path) {
  if (!path) return undefined
  if (/^https?:\/\//i.test(path)) return path
  return `${import.meta.env.VITE_API_URL || ''}${path}`
}

export default function Player({ trackInfo, stems, lyricsLines }) {
  const vocalRef = useRef(null)
  const instruRef = useRef(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [vocalVol, setVocalVol] = useState(0.9)
  const [instruVol, setInstruVol] = useState(0.9)
  const [lyricsDelay, setLyricsDelay] = useState(0)

  useEffect(() => {
    if (vocalRef.current) vocalRef.current.volume = vocalVol
  }, [vocalVol])

  useEffect(() => {
    if (instruRef.current) instruRef.current.volume = instruVol
  }, [instruVol])

  const togglePlay = useCallback(async () => {
  const v = vocalRef.current
  const i = instruRef.current

  if (!v || !i) return

  if (isPlaying) {
    v.pause()
    i.pause()
    setIsPlaying(false)
    return
  }

  try {
    i.currentTime = v.currentTime

    await Promise.all([
      v.play(),
      i.play(),
    ])

    setIsPlaying(true)
  } catch (error) {
    console.error('Impossible de lire les pistes audio :', error)
    setIsPlaying(false)
  }
}, [isPlaying])

  const handleTimeUpdate = () => {
    setCurrentTime(vocalRef.current?.currentTime ?? 0)
    // Recale l'instru si les deux pistes dérivent de plus de 80ms
    if (instruRef.current && vocalRef.current) {
      const drift = Math.abs(instruRef.current.currentTime - vocalRef.current.currentTime)
      if (drift > 0.08) instruRef.current.currentTime = vocalRef.current.currentTime
    }
  }

  const seekTo = useCallback((nextTime) => {
    const target = Number(nextTime)
    if (!Number.isFinite(target)) return
    if (vocalRef.current) vocalRef.current.currentTime = target
    if (instruRef.current) instruRef.current.currentTime = target
    setCurrentTime(target)
  }, [])

  return (
    <>
      <div className="stage">
        <AudioSpectrum audioRef={instruRef} />
        <div className="track-seek" aria-label="Position dans le morceau">
          <span>{formatTime(currentTime)}</span>
          <input
            type="range"
            min="0"
            max={duration || 0}
            step="0.1"
            value={Math.min(currentTime, duration || currentTime)}
            style={{ '--seek-progress': `${duration ? Math.min(100, (currentTime / duration) * 100) : 0}%` }}
            onChange={(event) => seekTo(event.target.value)}
            disabled={!duration}
            aria-label="Avancer ou reculer dans le morceau"
          />
          <span>{formatTime(duration)}</span>
        </div>
        <div className="track-meta">
          {trackInfo?.title ? (
            <>
              <strong>{trackInfo.title}</strong> — {trackInfo.artist}
            </>
          ) : (
            'Identification en cours…'
          )}
        </div>
        <KaraokeLyrics lines={lyricsLines} currentTime={Math.max(0, currentTime - lyricsDelay)} />
      </div>

      <audio
        ref={vocalRef}
        src={getStemUrl(stems?.vocalUrl)}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => setDuration(vocalRef.current?.duration ?? 0)}
        onEnded={() => setIsPlaying(false)}
/>

      <audio
        ref={instruRef}
        src={getStemUrl(stems?.instruUrl)}
      />

      <div className="console">
        <div className="transport">
          <button onClick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Lecture'}>
            {isPlaying ? '❚❚' : '▶'}
          </button>
          <span className="timecode">{formatTime(currentTime)}</span>
        </div>

        <VolumeKnob label="Voix" variant="vocal" value={vocalVol} onChange={setVocalVol} />
        <VolumeKnob label="Instru" variant="instru" value={instruVol} onChange={setInstruVol} />
        <div className="lyrics-sync" aria-label="Synchronisation des paroles">
          <span className="knob-label">Paroles</span>
          <div className="sync-controls">
            <button type="button" onClick={() => setLyricsDelay((value) => Number((value - 0.5).toFixed(1)))} aria-label="Afficher les paroles plus tôt">−</button>
            <button type="button" className="sync-value" onClick={() => setLyricsDelay(0)} title="Réinitialiser le décalage">
              {lyricsDelay > 0 ? '+' : ''}{lyricsDelay.toFixed(1)} s
            </button>
            <button type="button" onClick={() => setLyricsDelay((value) => Number((value + 0.5).toFixed(1)))} aria-label="Afficher les paroles plus tard">+</button>
          </div>
          <span className="sync-hint">− tôt · + tard</span>
        </div>
      </div>
    </>
  )
}
