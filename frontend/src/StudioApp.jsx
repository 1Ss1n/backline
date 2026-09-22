import { useCallback, useEffect, useState } from 'react'
import Uploader from './components/Uploader.jsx'
import Player from './components/Player.jsx'
import PerformancePlayer from './components/PerformancePlayer.jsx'
import ProfilePage from './components/ProfilePage.jsx'
import LyricsStudio from './components/LyricsStudio.jsx'
import { parseLRC } from './utils/lrc.js'
import './App.css'
import './StudioApp.css'
import './BacklineTheme.css'
import './SidebarHover.css'

const STEPS = [
  { key: 'separate', label: 'Séparation audio', detail: 'Voix et instrumentale' },
  { key: 'recognize', label: 'Identification', detail: 'Titre et artiste' },
  { key: 'lyrics', label: 'Paroles synchronisées', detail: 'Calage automatique' },
]
const PERFECT_PITCH_STEP = { key: 'pitch', label: 'Analyse Perfect Pitch', detail: 'Notes mélodiques de référence' }

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function fetchWithRetry(url, options, attempts = 3) {
  let lastError
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, options)
      if (response.ok) return response
      // A bad request (notably an expired login) will not recover on retry.
      if (response.status < 500) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || `Le serveur a rÃ©pondu ${response.status}.`)
      }
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
    bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 22h4" /></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

export default function StudioApp({ user, onLogout, onUserUpdated }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('backline-theme') || 'dark')
  const [stepStatus, setStepStatus] = useState({})
  const [error, setError] = useState(null)
  const [stems, setStems] = useState(null)
  const [trackInfo, setTrackInfo] = useState(null)
  const [lyricsLines, setLyricsLines] = useState(null)
  const [lyricsSource, setLyricsSource] = useState('none')
  const [ready, setReady] = useState(false)
  const [perfectPitchRequested, setPerfectPitchRequested] = useState(false)
  const [sessions, setSessions] = useState([])
  const [activeSessionId, setActiveSessionId] = useState(null)
  const [performances, setPerformances] = useState([])
  const [activeView, setActiveView] = useState('studio')
  const [selectedPerformance, setSelectedPerformance] = useState(null)
  const [friendQuery, setFriendQuery] = useState('')
  const [friendResults, setFriendResults] = useState([])
  const [friendMessage, setFriendMessage] = useState('')
  const [friendRequests, setFriendRequests] = useState([])
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [friends, setFriends] = useState([])
  const [profileData, setProfileData] = useState(null)
  const [profileEditing, setProfileEditing] = useState(false)
  const [profileForm, setProfileForm] = useState({ displayName: '', email: '', currentPassword: '', newPassword: '' })
  const [profileMessage, setProfileMessage] = useState('')
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const processSteps = perfectPitchRequested ? [STEPS[0], PERFECT_PITCH_STEP, ...STEPS.slice(1)] : STEPS

  useEffect(() => { localStorage.setItem('backline-theme', theme) }, [theme])
  const loadSessions = useCallback(async () => {
    try {
      const response = await fetch('/api/sessions')
      if (response.ok) setSessions(await response.json())
    } catch { /* Available again on the next refresh. */ }
  }, [])
  useEffect(() => { loadSessions() }, [loadSessions])
  const loadFriendRequests = useCallback(async () => {
    const response = await fetch('/api/friends/requests')
    if (response.ok) setFriendRequests((await response.json()).requests)
  }, [])
  useEffect(() => { loadFriendRequests() }, [loadFriendRequests])
  const loadFriends = useCallback(async () => {
    const response = await fetch('/api/friends')
    if (response.ok) setFriends((await response.json()).friends)
  }, [])
  useEffect(() => { loadFriends() }, [loadFriends])
  const openProfile = useCallback(async (username) => {
    const response = await fetch(`/api/users/${encodeURIComponent(username)}`)
    const data = await response.json()
    if (!response.ok) return setError(data.error)
    setProfileData(data.profile); setProfileEditing(false); setProfileMessage(''); setActiveView('profile')
    setProfileForm({ displayName: data.profile.displayName, email: data.profile.isSelf ? user.email : '', currentPassword: '', newPassword: '' })
  }, [user.email])
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
      // The server creates the session at the same time as the stems. Add a
      // temporary card right away so it cannot disappear while metadata loads.
      setSessions((current) => [{
        id: separated.id,
        stems: sessionStems,
        title: file.name.replace(/\.[^.]+$/, ''),
        artist: 'Artiste inconnu',
        coverUrl: null,
        lyricsLines: [],
        performances: [],
        createdAt: new Date().toISOString(),
      }, ...current.filter((session) => session.id !== separated.id)])
      setStems(sessionStems); setActiveSessionId(separated.id); setPerformances([]); setStep('separate', 'done')
      let preparedPerfectPitch = null
      if (perfectPitchRequested) {
        setStep('pitch', 'active')
        try {
          const pitchResponse = await fetch(`/api/pitch-test/analyze-session/${separated.id}`, { method: 'POST' })
          const pitchData = await pitchResponse.json()
          if (!pitchResponse.ok || !Array.isArray(pitchData.rawNotes || pitchData.notes)) throw new Error(pitchData.error || 'Analyse indisponible.')
          preparedPerfectPitch = { rawNotes: pitchData.rawNotes || pitchData.notes, analyzedAt: new Date().toISOString() }
          setStep('pitch', 'done')
        } catch {
          // The session remains a normal karaoke session if the optional analysis fails.
          preparedPerfectPitch = null
          setStep('pitch', 'unavailable')
        }
      }

      setStep('recognize', 'active')
      let identified = { title: 'Titre inconnu', artist: 'Artiste inconnu' }
      let recognized = false
      try {
        const recognitionForm = new FormData(); recognitionForm.append('audio', file)
        const recognition = await fetch('/api/recognize', { method: 'POST', body: recognitionForm })
        const candidate = await recognition.json()
        if (recognition.ok && candidate.title) { identified = candidate; recognized = true }
      } catch { /* Whisper is the local fallback. */ }
      setTrackInfo({ title: identified.title, artist: identified.artist }); setStep('recognize', 'done')

      setStep('lyrics', 'active')
      let preparedLyrics = []
      let preparedSegments = []
      let preparedLyricsSource = 'none'
      if (recognized) {
        try {
          const params = new URLSearchParams({ title: identified.title, artist: identified.artist })
          const lyricsResponse = await fetch(`/api/lyrics?${params}`)
          const lyrics = await lyricsResponse.json()
          if (lyricsResponse.ok && (lyrics.syncedLyrics || lyrics.plainLyrics)) {
            preparedLyrics = lyrics.syncedLyrics ? parseLRC(lyrics.syncedLyrics) : lyrics.plainLyrics.split('\n').filter(Boolean).map((text, index) => ({ time: index * 3, text }))
            preparedSegments = preparedLyrics.map((line, index) => ({ start: line.time, end: preparedLyrics[index + 1]?.time ?? line.time + 4, text: line.text }))
            preparedLyricsSource = 'lrclib'
          }
        } catch { /* Use Whisper below. */ }
      }
      if (preparedLyricsSource !== 'lrclib') {
        const transcription = await fetch(`/api/transcribe/${separated.id}`, { method: 'POST' }).then((response) => response.json()).catch(() => ({ source: 'none', segments: [] }))
        if (transcription.source === 'whisper' && transcription.segments?.length) {
          preparedSegments = transcription.segments
          preparedLyrics = transcription.segments.map((segment) => ({ time: segment.start, text: segment.text }))
          preparedLyricsSource = 'whisper'
        }
      }
      setLyricsLines(preparedLyrics); setLyricsSource(preparedLyricsSource)
      if (separated.id) {
        try {
          const savedSessionResponse = await fetchWithRetry(`/api/sessions/${separated.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: identified.title, artist: identified.artist, lyricsLines: preparedLyrics, lyricsSegments: preparedSegments, lyricsSource: preparedLyricsSource, ...(preparedPerfectPitch ? { perfectPitch: preparedPerfectPitch } : {}) }),
          })
          const savedSession = await savedSessionResponse.json()
          setSessions((current) => [savedSession, ...current.filter((session) => session.id !== separated.id)])
          await loadSessions()
        } catch (saveError) {
          console.warn('Session créée, mais métadonnées non sauvegardées :', saveError)
        }
      }
      setStep('lyrics', 'done'); setReady(true)
    } catch (caughtError) { setError(caughtError.message || 'Une erreur est survenue.') }
  }, [loadSessions, perfectPitchRequested])

  const startOver = () => { setReady(false); setStepStatus({}); setError(null); setStems(null); setTrackInfo(null); setLyricsLines(null); setLyricsSource('none'); setActiveSessionId(null); setPerformances([]); setSelectedPerformance(null); setActiveView('studio') }
  const openSession = async (id) => {
    try {
      const response = await fetch(`/api/sessions/${id}`)
      if (!response.ok) throw new Error('Session introuvable.')
      const session = await response.json()
      setStems(session.stems); setTrackInfo({ title: session.title, artist: session.artist })
      setLyricsLines(session.lyricsLines || []); setLyricsSource(session.lyricsSource || 'none'); setActiveSessionId(session.id); setPerformances(session.performances || []); setError(null); setReady(true); setActiveView('studio')
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
  const openPerformance = (session, performance) => {
    setStems(session.stems)
    setTrackInfo({ title: session.title, artist: session.artist })
    setLyricsLines(session.lyricsLines || [])
    setSelectedPerformance(performance)
    setActiveView('performance')
  }
  const savePerformanceToLibrary = (performance) => {
    setPerformances((current) => [...current, performance])
    setSessions((current) => {
      const sessionIndex = current.findIndex((session) => session.id === activeSessionId)
      if (sessionIndex < 0) return current
      return current.map((session) => session.id === activeSessionId
        ? { ...session, performances: [...(session.performances || []), performance] }
        : session)
    })
    loadSessions()
  }
  const listenToSavedPerformance = (performance) => {
    const session = sessions.find((item) => item.id === activeSessionId)
    if (session) openPerformance(session, performance)
  }
  const applyEditedLyrics = (session) => {
    if (!session) return
    setLyricsLines(session.lyricsLines || [])
    setLyricsSource(session.lyricsSource || 'none')
    setSessions((current) => current.map((item) => item.id === session.id ? session : item))
  }
  const performanceEntries = sessions.flatMap((session) => (session.performances || []).map((performance) => ({ session, performance })))
  const searchFriends = async (event) => {
    event.preventDefault(); setFriendMessage('')
    if (friendQuery.trim().length < 2) return setFriendMessage('Saisissez au moins 2 caractères.')
    const response = await fetch(`/api/friends/search?q=${encodeURIComponent(friendQuery)}`)
    const data = await response.json(); setFriendResults(data.users || [])
  }
  const sendFriendRequest = async (username) => {
    const response = await fetch('/api/friends/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username }) })
    const data = await response.json(); setFriendMessage(response.ok ? 'Demande envoyée.' : data.error)
  }
  const respondToFriendRequest = async (id, status) => {
    await fetch(`/api/friends/requests/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    loadFriendRequests(); loadFriends()
  }
  const updateProfile = async (event) => {
    event.preventDefault(); setProfileMessage('')
    const response = await fetch('/api/auth/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profileForm) })
    const data = await response.json()
    if (!response.ok) return setProfileMessage(data.error)
    onUserUpdated?.(data.user); setProfileData((current) => ({ ...current, displayName: data.user.displayName })); setProfileMessage(data.message || 'Profil mis à jour.')
  }

  const refreshProfile = async () => { if (profileData) await openProfile(profileData.isSelf ? 'me' : profileData.username) }
  const createProfilePost = async (content) => {
    const response = await fetch('/api/users/me/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) })
    if (!response.ok) { setProfileMessage((await response.json()).error); return false }
    await refreshProfile(); return true
  }
  const deleteProfilePost = async (id) => { await fetch(`/api/users/me/posts/${id}`, { method: 'DELETE' }); refreshProfile() }
  const changePerformanceShare = async (id, shared) => {
    const response = await fetch(`/api/users/me/performances/${id}/share`, { method: shared ? 'DELETE' : 'POST' })
    if (!response.ok) return setProfileMessage((await response.json()).error)
    await loadSessions(); await refreshProfile()
  }

  return (
    <div className="studio-app" data-theme={theme}>
      <button className="mobile-sidebar-trigger" onClick={() => setMobileSidebarOpen((open) => !open)} aria-label={mobileSidebarOpen ? 'Fermer le menu' : 'Ouvrir le menu'} aria-expanded={mobileSidebarOpen}><Icon name={mobileSidebarOpen ? 'close' : 'menu'} size={21} /></button>
      {mobileSidebarOpen && <button className="mobile-sidebar-backdrop" onClick={() => setMobileSidebarOpen(false)} aria-label="Fermer le menu" />}
      <aside className={`studio-sidebar collapsed ${mobileSidebarOpen ? 'mobile-open' : ''}`} id="studio-navigation">
        <div className="studio-brand"><span className="brand-mark"><Icon name="logo" /></span><button className="sidebar-theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Activer le mode clair' : 'Activer le mode sombre'} title={theme === 'dark' ? 'Mode clair' : 'Mode sombre'}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} /></button></div>
        <nav className="studio-nav" aria-label="Navigation principale">
          <button className={`nav-item ${activeView === 'studio' ? 'active' : ''}`} onClick={() => { startOver(); setMobileSidebarOpen(false) }}><Icon name="logo" />Studio</button>
          <button className={`nav-item ${activeView === 'library' ? 'active' : ''}`} onClick={() => { setActiveView('library'); setMobileSidebarOpen(false) }}><Icon name="library" />Mes morceaux</button>
          <button className={`nav-item ${activeView === 'performances' || activeView === 'performance' ? 'active' : ''}`} onClick={() => { setActiveView('performances'); setMobileSidebarOpen(false) }}><Icon name="history" />Mes performances</button>
          <button className={`nav-item ${activeView === 'friends' ? 'active' : ''}`} onClick={() => { setActiveView('friends'); setMobileSidebarOpen(false) }}><Icon name="library" />Mes amis</button>
        </nav>
        <section className="friends-sidebar"><p className="section-kicker">Communauté</p><form onSubmit={searchFriends} className="friend-search"><input value={friendQuery} onChange={(event) => setFriendQuery(event.target.value)} placeholder="Rechercher un pseudo" aria-label="Rechercher un ami" /><button>⌕</button></form>{friendResults.length > 0 && <div className="friend-results">{friendResults.map((friend) => <div key={friend.id}><button className="friend-profile-link" onClick={() => openProfile(friend.username)}>@{friend.username}</button><button onClick={() => sendFriendRequest(friend.username)}>Ajouter</button></div>)}</div>}{friendMessage && <p className="friend-message">{friendMessage}</p>}</section>
        <div className="sidebar-bottom">
          <div className="profile-actions"><button className="user-chip" onClick={() => openProfile('me')}><span className="user-avatar">{user?.displayName?.charAt(0).toUpperCase() || 'U'}</span><div className="user-details"><b>{user?.displayName || 'Votre studio'}</b><small>@{user?.username || user?.email}</small></div><span className="profile-arrow" aria-hidden="true">›</span></button><div className="notification-wrap"><button className={`notification-button ${notificationsOpen ? 'open' : ''}`} onClick={() => setNotificationsOpen(!notificationsOpen)} aria-label="Demandes d'amis" aria-expanded={notificationsOpen}><Icon name="bell" size={18} />{friendRequests.length > 0 && <i>{friendRequests.length}</i>}</button>{notificationsOpen && <div className="notifications-popover"><div className="notifications-heading"><b>Demandes d'amis</b><button onClick={() => setNotificationsOpen(false)} aria-label="Fermer les notifications">×</button></div>{friendRequests.length ? friendRequests.map((request) => <div className="notification-request" key={request.id}><span>@{request.sender?.username || request.sender?.displayName || 'Utilisateur'}</span><div><button onClick={() => respondToFriendRequest(request.id, 'accepted')}>Accepter</button><button onClick={() => respondToFriendRequest(request.id, 'declined')}>Refuser</button></div></div>) : <small>Aucune nouvelle demande.</small>}</div>}</div></div>
        </div>
      </aside>

      <main className="studio-main">
        {activeView === 'profile' && profileData ? <ProfilePage profile={profileData} editing={profileEditing} setEditing={setProfileEditing} profileForm={profileForm} setProfileForm={setProfileForm} profileMessage={profileMessage} onUpdateProfile={updateProfile} onCreatePost={createProfilePost} onDeletePost={deleteProfilePost} onLogout={onLogout} /> : <>

        {activeView === 'lyrics-studio' && activeSessionId ? <LyricsStudio sessionId={activeSessionId} onBack={() => setActiveView('studio')} onSaved={applyEditedLyrics} /> : activeView === 'performance' && selectedPerformance ? <div className="studio-player"><PerformancePlayer trackInfo={trackInfo} stems={stems} lyricsLines={lyricsLines} performance={selectedPerformance} /></div> : activeView === 'profile' && profileData ? <section className="profile-page"><header className="profile-page-hero"><div className="profile-page-avatar">{profileData.displayName?.charAt(0).toUpperCase()}</div><h2>{profileData.displayName}</h2><p>@{profileData.username || 'utilisateur'}</p>{profileData.isSelf && <button className="profile-edit-button" onClick={() => setProfileEditing(!profileEditing)}>{profileEditing ? 'Voir mon profil' : 'Modifier le profil'}</button>}</header>{profileEditing && profileData.isSelf ? <form className="profile-page-form" onSubmit={updateProfile}><label>Nom affiché<input value={profileForm.displayName} onChange={(event) => setProfileForm({ ...profileForm, displayName: event.target.value })} required /></label><label>Adresse e-mail<input type="email" value={profileForm.email} onChange={(event) => setProfileForm({ ...profileForm, email: event.target.value })} required /></label><label>Mot de passe actuel<input type="password" value={profileForm.currentPassword} onChange={(event) => setProfileForm({ ...profileForm, currentPassword: event.target.value })} /></label><label>Nouveau mot de passe<input type="password" value={profileForm.newPassword} onChange={(event) => setProfileForm({ ...profileForm, newPassword: event.target.value })} minLength="10" /></label>{profileMessage && <p>{profileMessage}</p>}<button className="new-track">Enregistrer</button></form> : <div className="profile-page-columns"><section><p className="section-kicker">Performances partagées</p><div className="profile-page-empty">Aucune performance partagée pour le moment.</div></section><section><p className="section-kicker">Posts</p><div className="profile-page-empty">Les publications de {profileData.displayName} apparaîtront ici.</div><div className="profile-page-empty muted">La communauté Backline arrive bientôt.</div></section></div>}</section> : activeView === 'friends' ? <section className="library-page"><div className="library-page-heading"><div><p className="section-kicker">Votre communauté</p><h2>Mes amis</h2><p>Retrouvez les personnes avec qui vous partagez Backline.</p></div></div>{friends.length ? <div className="friends-grid">{friends.map((friend) => <button className="friend-card" onClick={() => openProfile(friend.username)} key={friend.id}><span>{friend.displayName?.charAt(0).toUpperCase()}</span><b>{friend.displayName}</b><small>@{friend.username || 'utilisateur'}</small></button>)}</div> : <div className="library-empty"><span className="session-art"><Icon name="library" size={20} /></span><h2>Pas encore d'amis.</h2><p>Utilisez la recherche dans la barre latérale pour envoyer une demande.</p></div>}</section> : activeView === 'performances' ? <section className="library-page performances-page">
          <div className="library-page-heading"><div><p className="section-kicker">Vos enregistrements</p><h2>Réécoutez vos prises.</h2><p>Chaque performance est jouée avec l'instrumentale, sans la voix originale.</p></div></div>
          {performanceEntries.length ? <div className="performance-library-list">{performanceEntries.slice().reverse().map(({ session, performance }, index) => <button className="performance-library-card" key={performance.id} onClick={() => openPerformance(session, performance)}><span className="performance-cover">{session.coverUrl ? <img src={session.coverUrl} alt="" /> : <Icon name="history" size={25} />}</span><span><b>{session.title}</b><small>{session.artist || 'Artiste inconnu'}</small><em>Performance {performanceEntries.length - index} · {new Date(performance.createdAt).toLocaleDateString('fr-FR')}</em></span><i>▶</i></button>)}</div> : <div className="library-empty"><span className="session-art"><Icon name="history" size={20} /></span><h2>Aucune performance.</h2><p>Armez l'enregistrement avant de lancer un morceau.</p><button className="new-track" onClick={startOver}><Icon name="plus" size={17} />Créer une session</button></div>}
          {performanceEntries.length > 0 && <section className="performance-sharing"><p className="section-kicker">Partage sur mon profil</p><p>Choisissez les prises que vos amis pourront écouter depuis votre profil.</p><div>{performanceEntries.map(({ session, performance }) => <article key={`share-${performance.id}`}><span>{session.title} — {session.artist || 'Artiste inconnu'}</span><button onClick={() => changePerformanceShare(performance.id, Boolean(performance.sharedAt))}>{performance.sharedAt ? 'Retirer du profil' : 'Partager sur mon profil'}</button></article>)}</div></section>}
        </section> : activeView === 'library' ? <section className="library-page">
          <div className="library-page-heading"><div><p className="section-kicker">Votre collection</p><h2>Choisissez une session.</h2><p>Retrouvez vos morceaux prêts à chanter et à mixer.</p></div>{sessions.length > 0 && <button className="clear-library" onClick={clearLibrary}>Nettoyer mes morceaux</button>}</div>
          {sessions.length ? <div className="library-grid">{sessions.map((session) => <button key={session.id} className="library-card" onClick={() => openSession(session.id)}><span className="library-card-cover"><Icon name="library" size={28} />{session.coverUrl && <img src={session.coverUrl} alt="" />}</span><span className="library-card-info"><b>{session.title}</b><small>{session.artist || 'Artiste inconnu'}</small><em>Ouvrir la session <span>→</span></em></span></button>)}</div> : <div className="library-empty"><span className="session-art"><Icon name="library" size={20} /></span><h2>Votre bibliothèque est vide.</h2><p>Importez un morceau pour créer votre première session karaoke.</p><button className="new-track" onClick={startOver}><Icon name="plus" size={17} />Importer un morceau</button></div>}
        </section> : ready ? <div className="studio-player"><Player trackInfo={trackInfo} stems={stems} lyricsLines={lyricsLines} lyricsSource={lyricsSource} sessionId={activeSessionId} perfectPitch={sessions.find((session) => session.id === activeSessionId)?.perfectPitch} onPerformanceSaved={savePerformanceToLibrary} onListenToPerformance={listenToSavedPerformance} onEditLyrics={() => setActiveView('lyrics-studio')} /></div> : (
          <div className="studio-content">
            <section className="upload-panel"><div className="panel-heading"><div><p className="section-kicker">01 · Créer une session</p><h2>Ta musique.<br />Ta voix. Ta scène.</h2><p>Importe un morceau : Backline prépare les stems, les paroles et ta session karaoke.</p></div><span className="format-pill">MP3 · 20 Mo max</span></div><div className="singing-mode-picker" role="radiogroup" aria-label="Mode de chant"><button type="button" role="radio" aria-checked={!perfectPitchRequested} className={!perfectPitchRequested ? 'selected' : ''} onClick={() => setPerfectPitchRequested(false)}><span>01</span><b>Karaoké classique</b><small>Les paroles au centre de la scène.</small></button><button type="button" role="radio" aria-checked={perfectPitchRequested} className={perfectPitchRequested ? 'selected' : ''} onClick={() => setPerfectPitchRequested(true)}><span>02</span><b>Perfect Pitch</b><small>Analyse ta justesse en direct.</small></button></div><Uploader onFileSelected={runPipeline} /></section>
            <aside className={`process-panel ${perfectPitchRequested ? 'perfect-pitch-process' : ''}`}><p className="section-kicker">{perfectPitchRequested ? 'Mode Perfect Pitch' : 'Traitement IA'}</p><h2>{perfectPitchRequested ? 'Votre performance commence ici.' : 'Votre session'}</h2><p className="process-intro">{perfectPitchRequested ? 'Après la séparation, Backline relève les notes de référence du morceau. Elles seront superposées à votre voix en direct pour suivre votre justesse.' : 'Chaque piste est préparée pour vous laisser chanter, mixer et suivre les paroles.'}</p>
              <div className="process-list">{processSteps.map((step, index) => <div className={`process-step ${stepStatus[step.key] || ''}`} key={step.key}><span className="step-number">{stepStatus[step.key] === 'done' ? '✓' : String(index + 1).padStart(2, '0')}</span><div><b>{step.label}</b><small>{stepStatus[step.key] === 'active' ? 'En cours…' : stepStatus[step.key] === 'done' ? 'Terminé' : stepStatus[step.key] === 'unavailable' ? 'Analyse indisponible — karaoké classique' : step.detail}</small></div>{stepStatus[step.key] === 'active' && <span className="spinner" />}</div>)}</div>
              <div className="privacy-note">Vos fichiers sont traités uniquement pour créer votre session.</div>
            </aside>
            {error && <div className="studio-error">{error}</div>}
          </div>
        )}</>}
      </main>
    </div>
  )
}
