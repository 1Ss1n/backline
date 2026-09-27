import { useRef, useState } from 'react'
import { LogOut, Camera, Heart, Trash2, ArrowLeft, SlidersHorizontal, Music2, Send, LockKeyhole, LoaderCircle, PenLine, ShieldCheck } from 'lucide-react'
import SharedPerformancePlayer from './SharedPerformancePlayer'
import UserAvatar from './UserAvatar.jsx'
import './ProfilePage.css'

const date = value => new Date(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
export default function ProfilePage({ profile, editing, setEditing, profileForm, setProfileForm, profileMessage, onUpdateProfile, onCreatePost, onDeletePost, onLikePost, onAvatar, onLogout }) {
  const [draft, setDraft] = useState(''), [busy, setBusy] = useState(null), [notice, setNotice] = useState('')
  const [selectedPerformance, setSelectedPerformance] = useState(null), [preview, setPreview] = useState(null), [file, setFile] = useState(null)
  const fileInput = useRef(null), fileVersion = useRef(0), actionLocked = useRef(false)
  const perform = async (key, action) => {
    if (actionLocked.current) return
    actionLocked.current = true; setBusy(key); setNotice('')
    try { await action() } catch (error) { setNotice(error.message || 'Une erreur est survenue. Réessayez.') }
    finally { actionLocked.current = false; setBusy(null) }
  }
  const choosePhoto = event => {
    const next = event.target.files?.[0], version = ++fileVersion.current
    event.target.value = ''; setNotice('')
    if (!next) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(next.type) || next.size > 2 * 1024 * 1024) { setNotice('Choisissez une photo JPG, PNG ou WebP de 2 Mo maximum.'); return }
    const reader = new FileReader()
    reader.onload = () => { if (version === fileVersion.current) { setFile(next); setPreview(reader.result) } }
    reader.onerror = () => setNotice('Impossible de lire cette photo.')
    reader.readAsDataURL(next)
  }
  const submitPost = event => { event.preventDefault(); if (draft.trim()) perform('post', async () => { if (await onCreatePost(draft)) setDraft('') }) }
  const field = (key, value) => setProfileForm({ ...profileForm, [key]: value })
  return <section className="profile-page profile-redesign">
    <header className="profile-page-hero">
      <div className="profile-cover" aria-hidden="true"><i /><i /><i /><span>BACKLINE / VOTRE VOIX, VOTRE ESPACE</span></div>
      <div className="profile-identity"><UserAvatar user={profile} className="profile-page-avatar" /><div className="profile-identity-text"><p className="section-kicker">{profile.isSelf ? 'VOTRE ESPACE' : 'LA COMMUNAUTÉ BACKLINE'}</p><h2>{profile.displayName}</h2><p>@{profile.username || 'utilisateur'}</p></div>
        {profile.isSelf && <div className="profile-page-actions"><button className="profile-edit-button" onClick={() => { setEditing(!editing); setNotice('') }}>{editing ? <ArrowLeft size={16} /> : <SlidersHorizontal size={16} />}{editing ? 'Voir mon profil' : 'Modifier le profil'}</button><button className="profile-logout-button" onClick={onLogout}><LogOut size={16} />Se déconnecter</button></div>}
      </div>
      <div className="profile-meta"><span><Music2 size={14} />{profile.canViewSocial ? `${profile.sharedPerformances?.length || 0} performance${profile.sharedPerformances?.length === 1 ? '' : 's'} partagée${profile.sharedPerformances?.length === 1 ? '' : 's'}` : 'Profil privé'}</span><span><LockKeyhole size={13} />Publications entre amis</span></div>
    </header>
    {(notice || profileMessage) && <p className="profile-feedback" role="status">{notice || profileMessage}</p>}
    {editing && profile.isSelf ? <div className="profile-settings">
      <div className="profile-settings-intro"><p className="section-kicker">À VOTRE IMAGE</p><h3>Les détails qui font vous.</h3><p>Personnalisez votre présence et gardez le contrôle de votre compte.</p></div>
      <section className="profile-photo-editor"><div><h3>Photo de profil</h3><p>Un visage, une identité. Visible sur votre profil et dans la communauté.</p></div><div className="profile-photo-controls"><UserAvatar user={{ ...profile, avatarUrl: preview || profile.avatarUrl }} className="profile-photo-preview" /><div><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} hidden aria-label="Choisir une photo de profil" /><button type="button" onClick={() => fileInput.current.click()} disabled={!!busy}><Camera size={16} />Choisir une photo</button><small>JPG, PNG ou WebP · 2 Mo max. · Recadrage carré</small></div></div>{file && <div className="profile-photo-save"><button className="profile-primary" disabled={!!busy} onClick={() => perform('avatar', async () => { await onAvatar(file); setFile(null); setPreview(null); setNotice('Votre photo de profil a été mise à jour.') })}>{busy === 'avatar' && <LoaderCircle size={15} className="profile-spinner" />}Enregistrer la photo</button><button disabled={!!busy} onClick={() => { fileVersion.current++; setFile(null); setPreview(null) }}>Annuler</button></div>}</section>
      <form className="profile-page-form" onSubmit={event => { event.preventDefault(); perform('settings', () => onUpdateProfile(event)) }}>
        <fieldset><legend>Vos informations</legend><div className="profile-fields"><label>Nom affiché<input value={profileForm.displayName} onChange={event => field('displayName', event.target.value)} minLength={2} maxLength={80} required autoComplete="nickname" /></label><label>Adresse e-mail<input type="email" value={profileForm.email} onChange={event => field('email', event.target.value)} required autoComplete="email" /></label></div><p className="profile-field-help"><ShieldCheck size={15} />Tout changement d’adresse e-mail nécessite une confirmation.</p></fieldset>
        <fieldset><legend>Sécurité</legend><p>Laissez ces champs vides pour conserver votre mot de passe.</p><div className="profile-fields"><label>Mot de passe actuel<input type="password" value={profileForm.currentPassword} onChange={event => field('currentPassword', event.target.value)} autoComplete="current-password" required={Boolean(profileForm.newPassword)} /></label><label>Nouveau mot de passe<input type="password" value={profileForm.newPassword} onChange={event => field('newPassword', event.target.value)} minLength={10} autoComplete="new-password" placeholder="10 caractères minimum" /></label></div></fieldset>
        <div className="profile-settings-footer"><span>Vos informations restent sous votre contrôle.</span><button className="profile-primary" disabled={!!busy}>{busy === 'settings' ? 'Enregistrement…' : 'Enregistrer les modifications'}</button></div>
      </form>
    </div> : <div className="profile-page-columns">
      <section className="profile-performances"><div className="profile-section-title"><Music2 size={18} /><h3>Sur scène</h3><span>Performances partagées</span></div>
        {!profile.canViewSocial ? <div className="profile-page-empty"><LockKeyhole size={24} /><p>Les performances sont réservées aux amis.</p></div> : profile.sharedPerformances?.length ? <div className="profile-performance-list">{profile.sharedPerformances.map(performance => <div key={performance.id} className="shared-performance-card"><button onClick={() => setSelectedPerformance(selectedPerformance?.id === performance.id ? null : performance)}><span>{performance.track.coverUrl ? <img src={performance.track.coverUrl} alt="" /> : <Music2 size={22} />}</span><div><b>{performance.track.title}</b><small>{performance.track.artist || 'Artiste inconnu'}</small><em>Publié le {date(performance.sharedAt)}</em></div><i>{selectedPerformance?.id === performance.id ? 'Fermer' : 'Écouter'}</i></button>{selectedPerformance?.id === performance.id && <SharedPerformancePlayer performance={performance} />}</div>)}</div> : <div className="profile-page-empty"><Music2 size={26} /><h4>Votre prochaine scène vous attend.</h4><p>{profile.isSelf ? 'Partagez un enregistrement depuis « Mes performances ». Il apparaîtra ici.' : 'Aucune performance partagée pour le moment.'}</p></div>}
      </section>
      <section className="profile-posts"><div className="profile-section-title"><PenLine size={18} /><h3>En coulisses</h3><span>Publications</span></div>
        {profile.isSelf && <form className="post-composer" onSubmit={submitPost}><div><UserAvatar user={profile} /><textarea aria-label="Votre publication" value={draft} onChange={event => setDraft(event.target.value)} maxLength={500} placeholder="Une découverte, une victoire, une envie de chanter…" /></div><footer><span><LockKeyhole size={12} />Vos amis · {draft.length}/500</span><button className="profile-primary" disabled={!!busy || !draft.trim()}><Send size={14} />{busy === 'post' ? 'Publication…' : 'Publier'}</button></footer></form>}
        {profile.canViewSocial ? <div className="post-list">{profile.posts?.length ? profile.posts.map(post => <article key={post.id} className="profile-post"><header><UserAvatar user={profile} /><div><b>{profile.displayName}</b><time dateTime={post.createdAt}>{date(post.createdAt)}</time></div>{profile.isSelf && <button className="profile-post-delete" aria-label="Supprimer la publication" title="Supprimer la publication" disabled={!!busy} onClick={() => { if (window.confirm('Supprimer cette publication ?')) perform(post.id, () => onDeletePost(post.id)) }}><Trash2 size={15} /></button>}</header><p>{post.content}</p><footer><button className={`profile-like ${post.likedByMe ? 'is-liked' : ''}`} aria-pressed={!!post.likedByMe} aria-label={post.likedByMe ? 'Retirer le like' : 'Aimer la publication'} disabled={!!busy} onClick={() => perform(post.id, () => onLikePost(post.id, !post.likedByMe))}><Heart size={17} fill={post.likedByMe ? 'currentColor' : 'none'} /><span>{post.likeCount || 0}</span><span>J’aime</span></button><span>Entre amis</span></footer></article>) : <div className="profile-page-empty"><PenLine size={24} /><h4>Tout commence par quelques mots.</h4><p>Pas encore de publication.</p></div>}</div> : <div className="profile-page-empty"><LockKeyhole size={24} /><p>Seuls les amis peuvent voir les posts et performances partagées.</p></div>}
      </section>
    </div>}
  </section>
}
