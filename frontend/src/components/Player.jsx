import { useRef, useState, useEffect, useCallback } from 'react'
import VolumeKnob from './VolumeKnob.jsx'
import KaraokeLyrics from './KaraokeLyrics.jsx'

function formatTime(t) {
  if (!Number.isFinite(t)) return '0:00'
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function Player({ trackInfo, stems, lyricsLines }) {
  const vocalRef = useRef(null)
  const instruRef = useRef(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [vocalVol, setVocalVol] = useState(0.9)
  const [instruVol, setInstruVol] = useState(0.9)

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

  return (
    <>
      <div className="stage">
        <div className="track-meta">
          {trackInfo?.title ? (
            <>
              <strong>{trackInfo.title}</strong> — {trackInfo.artist}
            </>
          ) : (
            'Identification en cours…'
          )}
        </div>
        <KaraokeLyrics lines={lyricsLines} currentTime={currentTime} />
      </div>

      <audio
        ref={vocalRef}
        src={stems?.vocalUrl ? `${import.meta.env.VITE_API_URL}${stems.vocalUrl}` : undefined}
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => setIsPlaying(false)}
/>

      <audio
        ref={instruRef}
        src={stems?.instruUrl ? `${import.meta.env.VITE_API_URL}${stems.instruUrl}` : undefined}
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
      </div>
    </>
  )
}
