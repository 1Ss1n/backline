import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import QRCode from 'qrcode'
import { Smartphone, X } from 'lucide-react'
import './PhoneMicrophone.css'

export function MicLevel({ value = 0 }) {
  return <div className="phone-mic-level" role="meter" aria-label="Niveau du microphone" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(Math.min(1, value * 5) * 100)}>
    {Array.from({ length: 12 }, (_, index) => <i key={index} className={value * 60 > index ? 'lit' : ''} style={{ '--mic-bar-height': `${9 + index * 2}px` }} />)}
  </div>
}
export const phoneStatus = state => state.muted && state.status === 'connected' ? 'Téléphone — micro coupé' : ({
  idle: 'Micro téléphone désactivé', creating: 'Préparation du QR…', waiting: 'En attente du téléphone',
  pending: 'Un téléphone souhaite se connecter', connecting: 'Connexion audio…', connected: 'Téléphone connecté',
  reconnecting: 'Tentative de reconnexion…', disconnected: 'Téléphone déconnecté', expired: 'QR expiré',
  ended: 'Session terminée', error: 'Connexion indisponible',
}[state.status] || 'Connexion…')

export default function PhoneMicPairing({ phone, onClose, onLocal, onApprove, latency, setLatency, level, analysisStatus, onResumeAudio, locked = false, purpose = 'pitch' }) {
  const dialog = useRef(null)
  const [qr, setQr] = useState('')
  const [debug, setDebug] = useState(false)
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close() }, [])
  useEffect(() => {
    let active = true; setQr('')
    if (phone.pair?.url) QRCode.toDataURL(phone.pair.url, { width: 240, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } }).then(value => { if (active) setQr(value) }).catch(() => {})
    return () => { active = false }
  }, [phone.pair?.url])
  const waiting = ['waiting', 'creating'].includes(phone.status)
  return createPortal(<dialog className="phone-mic-dialog phone-mic-ui" ref={dialog} onCancel={onClose} aria-labelledby="phone-mic-title">
    <header><Smartphone size={21} /><button className="phone-mic-close" onClick={onClose} aria-label="Fermer la connexion téléphone"><X size={18} /></button></header>
    <p className="phone-mic-kicker">{purpose === 'recording' ? 'ENREGISTREMENT' : 'PERFECT PITCH'} · MICROPHONE</p>
    <h2 id="phone-mic-title">Votre téléphone,<br />votre micro.</h2>
    {waiting && <>
      <p>Scannez avec votre téléphone, puis activez son microphone.</p>
      {qr && <img className="phone-mic-qr" src={qr} width="240" height="240" alt="QR code de connexion du microphone" />}
      {phone.pair && <><div className="phone-mic-code">{phone.pair.code.slice(0, 3)} {phone.pair.code.slice(3)}</div><small>Ou ouvrez {new URL(phone.pair.url).origin}/mic et entrez ce code.<br />Valable jusqu’à {new Date(phone.pair.expiresAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.</small></>}
      {phone.pair && new URL(phone.pair.url).hostname.match(/^(localhost|127\.0\.0\.1)$/) && <p className="phone-mic-warning">Ce QR pointe vers localhost. Pour un vrai téléphone, ouvrez Backline sur le PC via son URL HTTPS publique avant de créer le QR.</p>}
    </>}
    <p className="phone-mic-state" role="status">{phoneStatus(phone)}</p>
    {phone.status === 'pending' && <><p>Autorisez uniquement le téléphone que vous venez de connecter.</p><div className="phone-mic-actions"><button className="primary" onClick={onApprove}>Autoriser</button><button onClick={phone.refuse}>Refuser</button></div></>}
    {phone.status === 'connected' && <>
      <MicLevel value={phone.muted ? 0 : level} />
      {!phone.muted && <small>{analysisStatus === 'active' && !phone.audioBlocked ? 'Analyse active sur le PC. Parlez ou chantez : le niveau doit réagir.' : 'La connexion est établie, mais l’analyse audio attend une activation sur le PC.'}</small>}
      {!phone.muted && (phone.audioBlocked || analysisStatus !== 'active') && <button className="primary" onClick={onResumeAudio}>Activer l’analyse audio</button>}
    </>}
    {phone.error && <p className="phone-mic-warning" role="alert">{phone.error}</p>}
    {setLatency && ['connected', 'reconnecting', 'disconnected'].includes(phone.status) && <>
      <label className="phone-mic-latency">Compensation téléphone (ms)<input type="number" min="0" max="1000" step="10" value={latency} onChange={event => setLatency(Math.max(0, Math.min(1000, Number(event.target.value) || 0)))} /></label>
      <small>Réglage manuel, pas une mesure automatique. Commencez à 0 ; ajustez seulement si la voix arrive en retard.</small>
      {phone.status !== 'connected' && <button onClick={phone.reconnect}>Reconnecter</button>}
    </>}
    {['idle', 'expired', 'ended', 'error', 'disconnected'].includes(phone.status) && <button disabled={locked} className="primary" onClick={phone.create}>Générer un nouveau QR</button>}
    <div className="phone-mic-actions"><button disabled={locked} onClick={onLocal}>Revenir au micro de cet appareil</button></div>
    <small>Le téléphone peut servir à Perfect Pitch et à vos prises. Votre voix est sauvegardée uniquement si vous lancez « Enregistrer » sur le PC, jamais diffusée dans ses haut-parleurs.</small>
    {import.meta.env.DEV && <><button className="phone-mic-debug" onClick={() => setDebug(!debug)}>Diagnostic WebRTC {debug ? '−' : '+'}</button>{debug && <pre>{JSON.stringify(phone.stats || { status: 'Métriques pas encore disponibles' }, null, 2)}</pre>}</>}
  </dialog>, document.body)
}
