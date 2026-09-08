import { useCallback, useEffect, useState } from 'react'
import Uploader from './components/Uploader.jsx'
import Player from './components/Player.jsx'
import { parseLRC } from './utils/lrc.js'
import './App.css'
import './StudioApp.css'

const STEPS = [
  { key: 'separate', label: 'Séparation audio', detail: 'Voix et instrumentale' },
  { key: 'recognize', label: 'Identification', detail: 'Titre et artiste' },
  { key: 'lyrics', label: 'Paroles synchronisées', detail: 'Calage automatique' },
]

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function fetchWithRetry(url, options, attempts = 3) {
  let lastError
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, options)
      if (response.ok || response.status < 500) return response
      lastError = new Error(`Le serveur a répondu ${response.status}.`)
    } catch (error) { lastError = error }
    if (attempt < attempts - 1) await wait(700 * (attempt + 1))
  }
  throw lastError
}

function Icon({ name, size = 20 }) {
  const paths = {
    logo: <><path d="M4 12h3l2-6 3 12 2-6h6" /><circle cx="4" cy="12" r="1" /><circle cx="20" cy="12" r="1" /></>,
    library: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 9h8M8 13h8M8 17h5" /></>,
    history: <><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 8v4l3 2" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.08 2.08-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56v.12h-2.94v-.12A1.7 1.7 0 0 0 10.78 18.6a1.7 1.7 0 0 0-1.88.34l-.06.06-2.08-2.08.06-.06A1.7 1.7 0 0 0 7.16 15a1.7 1.7 0 0 0-1.56-1.03h-.12v-2.94h.12A1.7 1.7 0 0 0 7.16 10a1.7 1.7 0 0 0-.34-1.88l-.06-.06L8.84 6l.06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1.03-1.56v-.12h2.94v.12A1.7 1.7 0 0 0 15.78 6.4a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.08 2.08-.06.06A1.7 1.7 0 0 0 19.4 10a1.7 1.7 0 0 0 1.56 1.03h.12v2.94h-.12A1.7 1.7 0 0 0 19.4 15Z" /></>,
    sun: <><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
    moon: <path d="M20 15.2A8.5 8.5 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z" />,
    plus: <path d="M12 5v14M5 12h14" />,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

export default function StudioApp() {
  const [theme, setTheme] = useState(() => localStorage.getItem('backline-theme') || 'dark')
  const [stepStatus, setStepStatus] = useState({})
  const [error, setError] = useState(null)
  const [stems, setStems] = useState(null)
  const [trackInfo, setTrackInfo] = useState(null)
  const [lyricsLines, setLyricsLines] = useState(null)
  const [ready, setReady] = useState(false)
  const [sessions, setSessions] = useState([])
  const [activeSessionId, setActiveSessionId] = useState(null)
  const [activeView, setActiveView] = useState('studio')

  useEffect(() => { localStorage.setItem('backline-theme', theme) }, [theme])
  const loadSessions = useCallback(async () => {
    try {
      const response = await fetch('/api/sessions')
      if (response.ok) setSessions(await response.json())
    } catch { /* Available again on the next refresh. */ }
  }, [])
  useEffect(() => { loadSessions() }, [loadSessions])
  const setStep = (key, status) => setStepStatus((current) => ({ ...current, [key]: status }))

  const runPipeline = useCallback(async (file) => {
    setError(null); setReady(false); setStepStatus({})
    try {
      setStep('separate', 'active')
      const form = new FormData(); form.append('audio', file)
      const separation = await fetch('/api/separate', { method: 'POST', body: form })
      if (!separation.ok) throw new Error('La séparation des pistes a échoué.')
      const separated = await separation.json()
      const sessionStems = { vocalUrl: separated.vocalUrl, instruUrl: separated.instruUrl }
      setStems(sessionStems); setActiveSessionId(separated.id); setStep('separate', 'done')

      setStep('recognize', 'active')
      const recognitionForm = new FormData(); recognitionForm.append('audio', file)
      const recognition = await fetch('/api/recognize', { method: 'POST', body: recognitionForm })
      const identified = await recognition.json()
      if (!recognition.ok || !identified.title) throw new Error("Impossible d’identifier le morceau. Renseigne le titre manuellement.")
      setTrackInfo({ title: identified.title, artist: identified.artist }); setStep('recognize', 'done')

      setStep('lyrics', 'active')
      const params = new URLSearchParams({ title: identified.title, artist: identified.artist })
      const lyrics = await fetch(`/api/lyrics?${params}`).then((response) => response.json())
      let preparedLyrics = []
      if (lyrics.syncedLyrics) preparedLyrics = parseLRC(lyrics.syncedLyrics)
      else if (lyrics.plainLyrics) preparedLyrics = lyrics.plainLyrics.split('\n').filter(Boolean).map((text, index) => ({ time: index * 3, text }))
      setLyricsLines(preparedLyrics)
      if (separated.id) {
        try {
          await fetchWithRetry(`/api/sessions/${separated.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: identified.title, artist: identified.artist, lyricsLines: preparedLyrics }),
          })
          await loadSessions()
        } catch (saveError) {
          console.warn('Session créée, mais métadonnées non sauvegardées :', saveError)
        }
      }
      setStep('lyrics', 'done'); setReady(true)
    } catch (caughtError) { setError(caughtError.message || 'Une erreur est survenue.') }
  }, [loadSessions])

  const startOver = () => { setReady(false); setStepStatus({}); setError(null); setStems(null); setTrackInfo(null); setLyricsLines(null); setActiveSessionId(null); setActiveView('studio') }
  const openSession = async (id) => {
    try {
      const response = await fetch(`/api/sessions/${id}`)
      if (!response.ok) throw new Error('Session introuvable.')
      const session = await response.json()
      setStems(session.stems); setTrackInfo({ title: session.title, artist: session.artist })
      setLyricsLines(session.lyricsLines || []); setActiveSessionId(session.id); setError(null); setReady(true); setActiveView('studio')
    } catch (caughtError) { setError(caughtError.message) }
  }
  const clearLibrary = async () => {
    if (!window.confirm('Supprimer définitivement tous les morceaux et leurs pistes générées ?')) return
    try {
      const response = await fetch('/api/sessions', { method: 'DELETE' })
      if (!response.ok) throw new Error('Le nettoyage a échoué.')
      setSessions([])
      startOver()
    } catch (caughtError) { setError(caughtError.message) }
  }

  return (
    <div className="studio-app" data-theme={theme}>
      <aside className="studio-sidebar">
        <div className="studio-brand"><span className="brand-mark"><Icon name="logo" /></span><span>backline</span></div>
        <nav className="studio-nav" aria-label="Navigation principale">
          <button className={`nav-item ${activeView === 'studio' ? 'active' : ''}`} onClick={startOver}><Icon name="logo" />Studio</button>
          <button className={`nav-item ${activeView === 'library' ? 'active' : ''}`} onClick={() => setActiveView('library')}><Icon name="library" />Mes morceaux</button>
        </nav>
        <div className="sidebar-bottom">
          <div className="user-chip"><span>Y</span><div><b>Votre studio</b><small>Plan gratuit</small></div></div>
        </div>
      </aside>

      <main className="studio-main">
        <header className="studio-topbar">
          <div><p className="section-kicker">{activeView === 'library' ? 'Bibliothèque' : 'Espace de création'}</p><h1>{activeView === 'library' ? 'Mes morceaux' : ready ? 'Session karaoke' : 'Nouveau morceau'}</h1></div>
          <div className="topbar-actions">
            <button className="theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Changer de thème">
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} /> <span>{theme === 'dark' ? 'Clair' : 'Sombre'}</span>
            </button>
            {(ready || activeView === 'library') && <button className="new-track" onClick={startOver}><Icon name="plus" size={17} />Nouveau</button>}
          </div>
        </header>

        {activeView === 'library' ? <section className="library-page">
          <div className="library-page-heading"><div><p className="section-kicker">Votre collection</p><h2>Choisissez une session.</h2><p>Retrouvez vos morceaux prêts à chanter et à mixer.</p></div>{sessions.length > 0 && <button className="clear-library" onClick={clearLibrary}>Nettoyer mes morceaux</button>}</div>
          {sessions.length ? <div className="library-grid">{sessions.map((session) => <button key={session.id} className="library-card" onClick={() => openSession(session.id)}><span className="library-card-cover"><Icon name="library" size={28} />{session.coverUrl && <img src={session.coverUrl} alt="" />}</span><span className="library-card-info"><b>{session.title}</b><small>{session.artist || 'Artiste inconnu'}</small><em>Ouvrir la session <span>→</span></em></span></button>)}</div> : <div className="library-empty"><span className="session-art"><Icon name="library" size={20} /></span><h2>Votre bibliothèque est vide.</h2><p>Importez un morceau pour créer votre première session karaoke.</p><button className="new-track" onClick={startOver}><Icon name="plus" size={17} />Importer un morceau</button></div>}
        </section> : ready ? <div className="studio-player"><Player trackInfo={trackInfo} stems={stems} lyricsLines={lyricsLines} /></div> : (
          <div className="studio-content">
            <section className="upload-panel"><div className="panel-heading"><div><p className="section-kicker">01 · Importer</p><h2>Transformez votre morceau<br />en session karaoke.</h2></div><span className="format-pill">MP3 · 20 Mo max</span></div><Uploader onFileSelected={runPipeline} /></section>
            <aside className="process-panel"><p className="section-kicker">Traitement IA</p><h2>Votre session</h2><p className="process-intro">Chaque piste est préparée pour vous laisser chanter, mixer et suivre les paroles.</p>
              <div className="process-list">{STEPS.map((step, index) => <div className={`process-step ${stepStatus[step.key] || ''}`} key={step.key}><span className="step-number">{stepStatus[step.key] === 'done' ? '✓' : String(index + 1).padStart(2, '0')}</span><div><b>{step.label}</b><small>{stepStatus[step.key] === 'active' ? 'En cours…' : stepStatus[step.key] === 'done' ? 'Terminé' : step.detail}</small></div>{stepStatus[step.key] === 'active' && <span className="spinner" />}</div>)}</div>
              <div className="privacy-note">Vos fichiers sont traités uniquement pour créer votre session.</div>
            </aside>
            {error && <div className="studio-error">{error}</div>}
          </div>
        )}
      </main>
    </div>
  )
}
