import { useState, useCallback } from 'react'
import Uploader from './components/Uploader.jsx'
import Player from './components/Player.jsx'
import { parseLRC } from './utils/lrc.js'

const STEPS = [
  { key: 'separate', label: 'Séparation des pistes (Spleeter)' },
  { key: 'recognize', label: 'Identification du morceau' },
  { key: 'lyrics', label: 'Recherche des paroles synchronisées' },
]

export default function App() {
  const [stepStatus, setStepStatus] = useState({}) // { separate: 'active'|'done', ... }
  const [error, setError] = useState(null)
  const [stems, setStems] = useState(null)
  const [trackInfo, setTrackInfo] = useState(null)
  const [lyricsLines, setLyricsLines] = useState(null)
  const [ready, setReady] = useState(false)

  const setStep = (key, status) => setStepStatus((s) => ({ ...s, [key]: status }))

  const runPipeline = useCallback(async (file) => {
    setError(null)
    setReady(false)
    setStepStatus({})

    try {
      // 1. Séparation des stems
      setStep('separate', 'active')
      const form = new FormData()
      form.append('audio', file)
      const sepRes = await fetch('/api/separate', { method: 'POST', body: form })
      if (!sepRes.ok) throw new Error("La séparation des pistes a échoué.")
      const sepData = await sepRes.json()
      setStems({ vocalUrl: sepData.vocalUrl, instruUrl: sepData.instruUrl })
      setStep('separate', 'done')

      // 2. Reconnaissance du morceau (Shazam-like via AudD)
      setStep('recognize', 'active')
      const recForm = new FormData()
      recForm.append('audio', file)
      const recRes = await fetch('/api/recognize', { method: 'POST', body: recForm })
      const recData = await recRes.json()
      if (!recRes.ok || !recData.title) {
        throw new Error("Impossible d'identifier le morceau. Renseigne le titre manuellement.")
      }
      setTrackInfo({ title: recData.title, artist: recData.artist })
      setStep('recognize', 'done')

      // 3. Paroles synchronisées
      setStep('lyrics', 'active')
      const params = new URLSearchParams({ title: recData.title, artist: recData.artist })
      const lyrRes = await fetch(`/api/lyrics?${params}`)
      const lyrData = await lyrRes.json()
      if (lyrData.syncedLyrics) {
        setLyricsLines(parseLRC(lyrData.syncedLyrics))
      } else if (lyrData.plainLyrics) {
        // Fallback : pas de version synchronisée trouvée
        setLyricsLines(
          lyrData.plainLyrics
            .split('\n')
            .filter(Boolean)
            .map((text, i) => ({ time: i * 3, text }))
        )
      }
      setStep('lyrics', 'done')

      setReady(true)
    } catch (err) {
      setError(err.message || 'Une erreur est survenue.')
    }
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <div className="wordmark">
          back<span>line</span>
        </div>
        <div className="tag">karaoké IA</div>
      </header>

      {!ready && (
        <>
          <Uploader onFileSelected={runPipeline} />

          {Object.keys(stepStatus).length > 0 && (
            <div className="pipeline">
              {STEPS.map((s) => (
                <div key={s.key} className={`pipeline-step ${stepStatus[s.key] || ''}`}>
                  <span className="dot" />
                  {s.label}
                </div>
              ))}
            </div>
          )}

          {error && <div className="error-banner">{error}</div>}
        </>
      )}

      {ready && <Player trackInfo={trackInfo} stems={stems} lyricsLines={lyricsLines} />}
    </div>
  )
}
