import { useEffect, useState } from 'react'
import StudioApp from './StudioApp.jsx'
import './AuthApp.css'

const api = (url, options = {}) => fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options })

function AccountModal({ user, onClose, onUpdated }) {
  const [displayName, setDisplayName] = useState(user.displayName)
  const [email, setEmail] = useState(user.email)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [message, setMessage] = useState('')
  const [editing, setEditing] = useState(false)
  const submit = async (event) => {
    event.preventDefault()
    const response = await api('/api/auth/profile', { method: 'PATCH', body: JSON.stringify({ displayName, email, currentPassword, newPassword }) })
    const data = await response.json()
    if (!response.ok) return setMessage(data.error)
    onUpdated(data.user); setMessage(data.message || 'Informations mises à jour. Un e-mail de confirmation a été envoyé.')
  }
  return <div className="account-backdrop"><section className="profile-modal"><button type="button" className="modal-close" onClick={onClose}>×</button><header className="profile-hero"><div className="profile-avatar">{user.displayName?.charAt(0).toUpperCase()}</div><h2>{user.displayName}</h2><p>@{user.username || 'utilisateur'}</p><button className="profile-edit-button" onClick={() => setEditing(!editing)}>{editing ? 'Voir le profil' : 'Modifier le profil'}</button></header>{editing ? <form className="profile-edit-form" onSubmit={submit}><label>Nom affiché<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required minLength="2" /></label><label>Adresse e-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><div className="password-divider">Changer le mot de passe</div><label>Mot de passe actuel<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label><label>Nouveau mot de passe<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength="10" placeholder="10 caractères minimum" /></label>{message && <p className="auth-message">{message}</p>}<button className="auth-submit">Enregistrer les modifications</button></form> : <div className="profile-columns"><section className="profile-section"><p className="auth-kicker">Performances partagées</p><div className="shared-performance-empty"><span>▶</span><div><b>Vos prises partagées</b><small>Vos performances publiques apparaîtront ici.</small></div></div></section><section className="profile-section"><p className="auth-kicker">Posts</p><div className="post-placeholder"><span>Votre espace musique</span><small>Partagez bientôt vos moments karaoke, playlists et découvertes.</small></div><div className="post-placeholder muted"><span>Communauté Backline</span><small>Les publications de vos amis prendront place ici.</small></div></section></div>}</section></div>
}

export default function AuthApp() {
  const [user, setUser] = useState(null)
  const [checking, setChecking] = useState(true)
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ displayName: '', identifier: '', password: '' })
  const [message, setMessage] = useState('')
  const [unverifiedIdentifier, setUnverifiedIdentifier] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const token = new URLSearchParams(window.location.search).get('verify')
        const response = token ? await api(`/api/auth/verify?token=${encodeURIComponent(token)}`) : await api('/api/auth/me')
        const data = await response.json()
        if (response.ok) { setUser(data.user); if (token) window.history.replaceState({}, '', '/') }
        else setMessage(data.error)
      } catch { setMessage('Connexion au serveur indisponible. Vous pouvez réessayer.') }
      finally { setChecking(false) }
    }
    load()
  }, [])

  const submit = async (event) => {
    event.preventDefault(); setMessage(''); setUnverifiedIdentifier('')
    const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login'
    const payload = mode === 'register' ? { displayName: form.displayName, email: form.identifier, password: form.password } : { identifier: form.identifier, password: form.password }
    const response = await api(endpoint, { method: 'POST', body: JSON.stringify(payload) })
    const data = await response.json()
    if (!response.ok) { if (response.status === 403) setUnverifiedIdentifier(form.identifier); return setMessage(data.error) }
    if (data.user) setUser(data.user)
    else { setMessage(data.message); setMode('login') }
  }
  const resend = async () => {
    const response = await api('/api/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email: unverifiedIdentifier }) })
    const data = await response.json(); setMessage(data.message); setUnverifiedIdentifier('')
  }
  const logout = async () => { await api('/api/auth/logout', { method: 'POST' }); setUser(null) }

  if (checking) return <div className="auth-loading">Chargement de votre studio…</div>
  if (user?.verified) return <StudioApp user={user} onLogout={logout} onUserUpdated={setUser} />
  if (user && !user.verified) return <main className="auth-page"><section className="auth-intro"><div className="auth-brand">back<span>line</span></div><p className="auth-kicker">Vérification requise</p><h1>Un dernier<br />clic.</h1></section><section className="auth-card"><p className="auth-kicker">Compte en attente</p><h2>Vérifiez votre e-mail</h2><p className="auth-message">Un lien de vérification a été envoyé à {user.email}.</p><button className="auth-submit" onClick={logout}>Revenir à la connexion</button></section></main>
  return <main className="auth-page"><section className="auth-intro"><div className="auth-brand">back<span>line</span></div><p className="auth-kicker">Votre studio karaoke</p><h1>Chantez.<br />Gardez vos prises.</h1><p>Préparez vos morceaux, isolez les voix et réécoutez vos performances dans un espace personnel sécurisé.</p></section><section className="auth-card"><p className="auth-kicker">{mode === 'login' ? 'Bon retour' : 'Créer un compte'}</p><h2>{mode === 'login' ? 'Connectez-vous' : 'Rejoignez Backline'}</h2><form onSubmit={submit}>{mode === 'register' && <label>Nom affiché<input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} required minLength="2" /></label>}<label>{mode === 'login' ? 'E-mail ou nom d’utilisateur' : 'Adresse e-mail'}<input type={mode === 'login' ? 'text' : 'email'} value={form.identifier} onChange={(event) => setForm({ ...form, identifier: event.target.value })} required autoComplete={mode === 'login' ? 'username' : 'email'} /></label><label>Mot de passe<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required minLength={mode === 'register' ? 10 : undefined} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>{mode === 'register' && <small className="password-help">10 caractères minimum. Un e-mail de vérification sera envoyé.</small>}{message && <p className="auth-message">{message}</p>}{unverifiedIdentifier && <button type="button" className="resend-verification" onClick={resend}>Renvoyer l’e-mail de vérification</button>}<button className="auth-submit">{mode === 'login' ? 'Se connecter' : 'Créer mon compte'}</button></form><p className="auth-switch">{mode === 'login' ? 'Nouveau sur Backline ?' : 'Vous avez déjà un compte ?'} <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setMessage(''); setUnverifiedIdentifier('') }}>{mode === 'login' ? 'Créer un compte' : 'Se connecter'}</button></p></section></main>
}
