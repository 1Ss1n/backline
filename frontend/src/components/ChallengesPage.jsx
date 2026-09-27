import { useEffect, useState } from 'react'
import { Swords, ArrowLeft, Trophy } from 'lucide-react'
import FolderTabCard from './rewamp/FolderTabCard.jsx'
import Player from './Player.jsx'
import SharedPerformancePlayer from './SharedPerformancePlayer.jsx'
import ChallengeCamera from './ChallengeCamera.jsx'
import { ArrowFillButton } from './block/arrow-fill-button.jsx'
import { challengeRequest } from '../hooks/useChallenges.js'
import './ChallengesPage.css'
import './ChallengeArena.css'

const labels = { PENDING: 'Invitation en attente', ACCEPTED: 'À jouer', IN_PROGRESS: 'Round en cours', WAITING_FOR_OPPONENT: 'En attente de l’adversaire', COMPLETED: 'Terminé', DECLINED: 'Refusé', CANCELLED: 'Annulé', EXPIRED: 'Expiré' }
export default function ChallengesPage({ user, feed, sessions, selection, setSelection, onImport }) {
  const [song, setSong] = useState(null), [session, setSession] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [listening, setListening] = useState(null)
  const challenge = feed.items.find(item => item.id === selection?.id)
  useEffect(() => { setSession(null); setSong(null); setListening(null); setError('') }, [selection?.id, selection?.opponentId, selection?.parentChallengeId])
  const act = async operation => { if (busy) return; setBusy(true); setError(''); try { await operation(); await feed.refresh() } catch (error) { setError(error.message) } finally { setBusy(false) } }
  const create = (trackId, rematch = false) => act(async () => {
    const created = await challengeRequest('', { opponentId: selection.opponentId, parentChallengeId: selection.parentChallengeId, trackId, rematch })
    setSelection({ id: created.id })
  })
  const respond = action => act(async () => { await challengeRequest(`/${challenge.id}/${action}`, {}); if (action === 'cancel') setSession(null) })
  const opponent = challenge && (challenge.challengerUserId === user.id ? challenge.challenged : challenge.challenger)
  const done = challenge?.status === 'COMPLETED', own = challenge?.performances[user.id]
  const playable = challenge && ['ACCEPTED', 'IN_PROGRESS', 'WAITING_FOR_OPPONENT'].includes(challenge.status) && !own
  const series = challenge ? feed.items.filter(item => item.seriesId === challenge.seriesId).sort((a, b) => a.createdAt - b.createdAt) : []
  const winner = item => { const a = item.performances[item.challengerUserId]?.scoreValue, b = item.performances[item.challengedUserId]?.scoreValue; return item.status !== 'COMPLETED' || a === b ? null : a > b ? item.challengerUserId : item.challengedUserId }
  return <section className="challenges-page">
    <header className="challenge-heading"><div><p className="section-kicker"><Swords size={16} />Entre amis · privé</p><h1>Le Défi</h1><p>Un même morceau. Deux voix. À votre rythme.</p></div>{selection && <button onClick={() => setSelection(null)}><ArrowLeft size={16} />Mes défis</button>}</header>
    {(error || feed.error) && <p role="alert">{error || feed.error}</p>}
    {selection?.opponentId ? <>
      <h2>{selection.parentChallengeId ? 'À vous de choisir le morceau' : `Défier ${selection.name || 'votre ami'}`}</h2>
      <p>Choisissez dans votre bibliothèque un morceau préparé avec Perfect Pitch.</p>
      {!sessions.length && <div className="challenge-card"><p>Vous n’avez encore aucun morceau.</p><button onClick={onImport}>Ajouter un morceau</button></div>}
      <div className="folder-grid">{sessions.map(item => <div key={item.id} className={song?.id === item.id ? 'challenge-selected' : ''}><FolderTabCard session={item} onOpen={() => setSong(item)} />{!item.perfectPitch?.rawNotes?.length && <small>Analyse Perfect Pitch requise</small>}</div>)}</div>
      {song && <div className="challenge-confirm"><span>{song.title} — {song.artist}</span><button disabled={busy || !song.perfectPitch?.rawNotes?.length} onClick={() => create(song.id)}>Envoyer le défi</button><button onClick={() => setSong(null)}>Annuler</button></div>}
    </> : challenge ? <>
      <section className={`challenge-card challenge-room ${done ? 'challenge-reveal' : ''}`}>
        <div className="challenge-duel"><div><span className="challenge-avatar">{challenge.challenger.displayName.charAt(0)}</span><b>{challenge.challenger.displayName}</b><small>{challenge.performances[challenge.challengerUserId] ? 'A chanté ✓' : challenge.readyUserIds?.includes(challenge.challengerUserId) ? 'Prêt ✓' : 'À chanter'}</small></div><strong>VS</strong><div><span className="challenge-avatar">{challenge.challenged.displayName.charAt(0)}</span><b>{challenge.challenged.displayName}</b><small>{challenge.performances[challenge.challengedUserId] ? 'A chanté ✓' : challenge.readyUserIds?.includes(challenge.challengedUserId) ? 'Prêt ✓' : 'À chanter'}</small></div></div>
        <div className="challenge-track"><p className="section-kicker">LE MORCEAU DU ROUND</p><h2>{challenge.track.title}</h2><p>{challenge.track.artist}</p></div><span className="challenge-status">{labels[challenge.status]}</span>
        {challenge.status === 'PENDING' && <div className="challenge-actions">{challenge.challengedUserId === user.id ? <><button disabled={busy} onClick={() => respond('accept')}>Accepter</button><button disabled={busy} onClick={() => respond('decline')}>Refuser</button></> : <button disabled={busy} onClick={() => respond('cancel')}>Annuler le défi</button>}<small>Expire le {new Date(challenge.expiresAt).toLocaleDateString('fr-FR')}</small></div>}
        {playable && !session && <div className="challenge-actions"><ArrowFillButton as="button" bgColor="var(--accent)" textColor="var(--accent-ink)" fillBgColor="var(--accent-ink)" fillTextColor="var(--accent)" hoverFillBgColor="var(--text)" hoverFillTextColor="var(--bg)" disabled={busy} onClick={() => act(async () => setSession(await challengeRequest(`/${challenge.id}/session`)))}>Préparer ma performance</ArrowFillButton><button disabled={busy} onClick={() => { if (window.confirm('Abandonner ce défi ? Son historique sera conservé.')) respond('cancel') }}>Abandonner</button></div>}
        {own && !done && <p>Votre performance est terminée. En attente de {opponent.displayName}…</p>}
        {playable && !session && <div className="challenge-actions"><button disabled={busy || challenge.readyUserIds?.includes(user.id)} onClick={() => act(() => challengeRequest(`/${challenge.id}/ready`, {}))}>Je suis prêt</button><small>Facultatif en direct · signal valable 2 min · aucun départ automatique</small></div>}
        {done && <h3><Trophy size={20} />{winner(challenge) ? `${winner(challenge) === user.id ? 'Vous remportez' : `${opponent.displayName} remporte`} ce round` : 'Égalité'}</h3>}
      </section>
      {['ACCEPTED', 'IN_PROGRESS', 'WAITING_FOR_OPPONENT', 'COMPLETED'].includes(challenge.status) && <div className="challenge-workspace">
        <ChallengeCamera key={challenge.id} challengeId={challenge.id} ownName={user.displayName} opponentName={opponent.displayName} />
        {playable && session ? <div className="studio-player"><Player key={challenge.id} sessionId={challenge.id} challenge={challenge} trackInfo={session} stems={session.stems} lyricsLines={session.lyricsLines} lyricsSource={session.lyricsSource} perfectPitch={session.perfectPitch} onPerformanceSaved={() => { setSession(null); feed.refresh() }} /></div> : <div className="challenge-stage-preview"><span className="challenge-stage-symbol"><Swords size={30} strokeWidth={1.5} /></span><p className="section-kicker">{done ? 'ROUND TERMINÉ' : 'VOTRE SCÈNE'}</p><h2>{done ? 'Deux voix. Un beau défi.' : own ? 'À votre ami de jouer.' : 'La scène est à vous.'}</h2><p>{done ? 'Retrouvez vos scores et réécoutez vos performances ci-dessous.' : own ? 'Votre prise est sauvegardée. Les résultats seront révélés après les deux performances.' : 'Préparez votre performance pour afficher les paroles et la mélodie. Activez votre caméra si vous souhaitez vous voir.'}</p><div className="challenge-stage-steps"><span>01 · Préparer</span><span>02 · Enregistrer</span><span>03 · Chanter</span></div></div>}
      </div>}
      <div className="challenge-results">{[challenge.challenger, challenge.challenged].map(participant => {
        const performance = challenge.performances[participant.id]
        if (!performance || performance.submitted) return null
        return <article className="challenge-card" key={participant.id}><h3>{participant.displayName}</h3><strong className="challenge-score">{performance.scoreValue.toLocaleString('fr-FR')}</strong><p>Rang {performance.rank} · Combo ×{performance.score.maxCombo}</p><div className="challenge-stats">{['perfect', 'great', 'good', 'ok', 'miss'].map(rating => <span key={rating}>{rating} <b>{performance.score[rating]}</b></span>)}</div><button onClick={() => setListening(listening === participant.id ? null : participant.id)}>{listening === participant.id ? 'Fermer le lecteur' : 'Écouter la performance'}</button>{listening === participant.id && <SharedPerformancePlayer performance={performance} />}</article>
      })}</div>
      {done && <section className="challenge-card"><h2>Et maintenant ?</h2><div className="challenge-actions"><button disabled={busy} onClick={() => act(async () => { const item = await challengeRequest('', { opponentId: opponent.id, parentChallengeId: challenge.id, rematch: true }); setSelection({ id: item.id }) })}>Revanche sur ce morceau</button><button onClick={() => setSelection({ opponentId: opponent.id, parentChallengeId: challenge.id, name: opponent.displayName })}>Choisir mon morceau et défier {opponent.displayName}</button></div></section>}
      {series.length > 1 && <details className="challenge-card"><summary>Historique de la série · {series.filter(item => winner(item) === user.id).length} — {series.filter(item => winner(item) === opponent.id).length} rounds gagnés</summary>{series.map((item, index) => <button className="challenge-round" key={item.id} onClick={() => setSelection({ id: item.id })}>Round {index + 1} · {item.track.title} · {labels[item.status]}{item.status === 'COMPLETED' && ` · ${item.performances[user.id].scoreValue} — ${item.performances[opponent.id].scoreValue}`}</button>)}</details>}
    </> : <>
      {!feed.items.length && <div className="challenge-card"><h2>Votre prochain duo commence ici.</h2><p>Dans « Mes amis », choisissez un ami puis cliquez sur « Défier ».</p></div>}
      {['À jouer', 'En attente', 'Terminés'].map(group => {
        const items = feed.items.filter(item => {
          if (['COMPLETED', 'DECLINED', 'CANCELLED', 'EXPIRED'].includes(item.status)) return group === 'Terminés'
          const canPlay = item.status !== 'PENDING' && !item.performances[user.id] || item.status === 'PENDING' && item.challengedUserId === user.id
          return group === (canPlay ? 'À jouer' : 'En attente')
        })
        return items.length > 0 && <section key={group}><h2>{group}</h2><div className="challenge-list">{items.map(item => <button className="challenge-card" key={item.id} onClick={() => setSelection({ id: item.id })}><strong>{item.track.title}</strong><span>{item.track.artist}</span><p>{item.challenger.displayName} <b>VS</b> {item.challenged.displayName}</p><small>{labels[item.status]}{item.parentChallengeId ? ' · Nouveau round' : ''}</small></button>)}</div></section>
      })}
    </>}
  </section>
}
