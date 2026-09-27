'use client'

// Adapted from ObsidianUI Apple Spotlight (user-provided source).
// React/CSS animation replaces Motion/Tailwind; native dialog handles focus,
// Escape and the top layer. Results use Backline's existing friends API.
import { useEffect, useRef, useState } from 'react'
import { Search, X, UserRound, UserPlus, Check, LoaderCircle, Users } from 'lucide-react'
import './apple-spotlight.css'

export function AppleSpotlight({ handleClose, onProfile, friends = [] }) {
  const dialog = useRef(null), input = useRef(null), inFlight = useRef(false)
  const [query, setQuery] = useState(''), [results, setResults] = useState([])
  const [loading, setLoading] = useState(false), [error, setError] = useState('')
  const [message, setMessage] = useState(''), [pending, setPending] = useState(null), [sent, setSent] = useState([])
  useEffect(() => {
    const node = dialog.current
    node.showModal()
    input.current?.focus()
    return () => node.close()
  }, [])
  useEffect(() => {
    const controller = new AbortController(), value = query.trim()
    setResults([]); setError(''); setMessage(''); setLoading(value.length >= 2)
    if (value.length < 2) return () => controller.abort()
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/friends/search?q=${encodeURIComponent(value)}`, { signal: controller.signal })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'La recherche est indisponible. Réessayez.')
        if (!controller.signal.aborted) setResults(data.users || [])
      } catch (error) { if (!controller.signal.aborted) setError(error.message || 'Connexion impossible.') }
      finally { if (!controller.signal.aborted) setLoading(false) }
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query])
  const addFriend = async username => {
    if (inFlight.current) return
    inFlight.current = true; setPending(username); setMessage('')
    try {
      const response = await fetch('/api/friends/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Impossible d’envoyer la demande.')
      setSent(previous => [...previous, username]); setMessage(`Demande envoyée à @${username}.`)
    } catch (error) { setMessage(error.message || 'Connexion impossible. Réessayez.') }
    finally { inFlight.current = false; setPending(null) }
  }
  return <dialog ref={dialog} className="community-spotlight" aria-label="Rechercher dans la communauté" onCancel={handleClose} onClick={event => { if (event.target === dialog.current) { const bounds = dialog.current.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) handleClose() } }}>
    <div className="spotlight-search"><Search size={23} aria-hidden="true" /><input ref={input} value={query} onChange={event => setQuery(event.target.value)} aria-label="Rechercher un ami" placeholder="Rechercher un pseudo…" autoComplete="off" maxLength={100} /><button className="spotlight-close" onClick={handleClose} aria-label="Fermer la recherche"><X size={18} /></button></div>
    <div className="spotlight-results" aria-busy={loading}>
      {query.trim().length < 2 ? <div className="spotlight-empty"><Users size={28} /><h2>Retrouvez votre communauté</h2><p>Saisissez au moins 2 caractères pour rechercher un utilisateur.</p></div>
        : loading ? <p className="spotlight-status" role="status"><LoaderCircle size={18} className="spotlight-spinner" />Recherche en cours…</p>
        : error ? <p className="spotlight-status" role="alert">{error}</p>
        : !results.length ? <p className="spotlight-status" role="status">Aucun utilisateur trouvé pour « {query.trim()} ».</p>
        : <ul>{results.map(person => {
          const isFriend = friends.some(friend => friend.id === person.id), requested = sent.includes(person.username)
          return <li key={person.id} className="spotlight-person"><button className="spotlight-profile" onClick={() => { handleClose(); onProfile(person.username) }} aria-label={`Voir le profil de ${person.displayName || person.username}`}><span className="spotlight-avatar">{(person.displayName || person.username)?.charAt(0).toUpperCase() || <UserRound size={20} />}</span><span><b>{person.displayName || person.username}</b><small>@{person.username}</small></span></button><button className="spotlight-add" disabled={isFriend || requested || pending !== null} onClick={() => addFriend(person.username)} aria-label={isFriend ? `Déjà ami avec ${person.username}` : requested ? `Demande envoyée à ${person.username}` : `Ajouter ${person.username}`}>
            {isFriend || requested ? <Check size={16} /> : pending === person.username ? <LoaderCircle size={16} className="spotlight-spinner" /> : <UserPlus size={16} />}<span>{isFriend ? 'Ami' : requested ? 'Envoyée' : 'Ajouter'}</span>
          </button></li>
        })}</ul>}
    </div>
    <footer className="spotlight-footer"><span role="status">{message || 'Des voix à découvrir. Des défis à partager.'}</span><span><kbd>Échap</kbd> fermer</span></footer>
  </dialog>
}
