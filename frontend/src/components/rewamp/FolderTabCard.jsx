import { useState } from 'react'
import { ArrowUpRight, AudioLines, Mic2, Play } from 'lucide-react'

// RewampUI silhouette; no gallery, tilt listeners or looping blobs.
export default function FolderTabCard({ session, performance, onOpen }) {
  const [failedCover, setFailedCover] = useState(null)
  const isPerformance = Boolean(performance)
  const dateValue = isPerformance ? performance.createdAt : session.createdAt
  const date = dateValue ? new Date(dateValue) : null
  const dateLabel = date && Number.isFinite(date.getTime()) ? date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : null
  const title = session.title || 'Morceau sans titre'
  return <button type="button" className={`folder-card ${isPerformance ? 'folder-card--performance' : ''}`} onClick={onOpen} aria-label={`${isPerformance ? 'Écouter la performance' : 'Ouvrir la session'} : ${title}`}>
    <span className="folder-art" aria-hidden="true">
      {session.coverUrl && failedCover !== session.coverUrl ? <img src={session.coverUrl} loading="lazy" alt="" onError={() => setFailedCover(session.coverUrl)} /> : <span className="folder-record"><span /><AudioLines size={32} /></span>}
    </span>
    <span className="folder-action" aria-hidden="true"><ArrowUpRight size={19} /></span>
    <span className="folder-sheet">
      <svg className="folder-silhouette" viewBox="0 0 380 240" preserveAspectRatio="none" aria-hidden="true"><path d="M0 28 A28 28 0 0 1 28 0 L180 0 A22 22 0 0 1 202 22 A22 22 0 0 0 224 44 L352 44 A28 28 0 0 1 380 72 L380 212 A28 28 0 0 1 352 240 L28 240 A28 28 0 0 1 0 212 Z" /></svg>
      <span className="folder-kind">{isPerformance ? <Mic2 size={13} /> : <AudioLines size={13} />}{isPerformance ? 'Performance' : 'Karaoké'}</span>
      <span className="folder-info"><strong>{title}</strong><span>{session.artist || 'Artiste inconnu'}</span></span>
      <span className="folder-footer">{dateLabel ? <time dateTime={date.toISOString()}>{dateLabel}</time> : <span>{isPerformance ? 'Votre enregistrement' : 'Prêt à chanter'}</span>}<span><Play size={12} fill="currentColor" />{isPerformance ? 'Écouter' : 'Chanter'}</span></span>
    </span>
  </button>
}
