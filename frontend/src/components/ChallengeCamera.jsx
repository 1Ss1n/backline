import { useEffect, useRef, useState } from 'react'
import { Video, VideoOff } from 'lucide-react'
import { challengeSocketUrl } from '../hooks/useChallenges.js'

const cameraError = error => {
  if (!window.isSecureContext) return 'La caméra nécessite HTTPS (ou localhost). Ouvrez Backline avec votre URL Cloudflare HTTPS.'
  if (!navigator.mediaDevices?.getUserMedia) return 'La caméra n’est pas disponible dans ce navigateur.'
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') return 'Permission caméra refusée. Autorisez-la dans les réglages du site, puis réessayez.'
  if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') return 'Aucune caméra n’a été détectée sur cet appareil.'
  if (error?.name === 'NotReadableError' || error?.name === 'TrackStartError') return 'La caméra est déjà utilisée par une autre application ou indisponible.'
  return 'Impossible d’ouvrir la caméra. Vérifiez les permissions et réessayez.'
}

// Video-only: no second microphone, no recording, no remote audio monitoring.
export default function ChallengeCamera({ challengeId, ownName = 'Vous', opponentName = 'Votre ami' }) {
  const local = useRef(null), remote = useRef(null), cleanup = useRef(() => {}), generation = useRef(0)
  const [enabled, setEnabled] = useState(false), [status, setStatus] = useState('Caméra désactivée'), [hidden, setHidden] = useState(false)
  const [remoteVisible, setRemoteVisible] = useState(false)
  const stop = () => { generation.current++; cleanup.current(); cleanup.current = () => {}; setEnabled(false); setStatus('Caméra désactivée') }
  useEffect(() => () => { generation.current++; cleanup.current() }, [challengeId])
  const start = async () => {
    stop(); const id = generation.current; setStatus('Autorisation caméra…')
    let stream, socket, peer
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('unsupported'), { name: 'SecurityError' })
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { width: { ideal: 320 }, height: { ideal: 180 }, frameRate: { ideal: 15, max: 20 } } })
      } catch (error) {
        // Some mobile/virtual cameras reject optional resolution or frame-rate
        // constraints even though a camera is available.
        if (error?.name !== 'OverconstrainedError' && error?.name !== 'ConstraintNotSatisfiedError') throw error
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true })
      }
      if (generation.current !== id) { stream.getTracks().forEach(track => track.stop()); return }
      setEnabled(true); setHidden(false)
      let initiator = false, queue = [], chain = Promise.resolve()
      const send = message => { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)) }
      socket = new WebSocket(challengeSocketUrl())
      cleanup.current = () => { stream.getTracks().forEach(track => track.stop()); peer?.close(); socket.close(); if (local.current) local.current.srcObject = null; if (remote.current) remote.current.srcObject = null }
      const makePeer = rtc => {
        peer?.close(); setRemoteVisible(false); queue = []; peer = new RTCPeerConnection(rtc)
        stream.getVideoTracks().forEach(track => peer.addTrack(track, stream))
        peer.onicecandidate = event => { if (event.candidate) send({ type: 'ice', candidate: event.candidate.toJSON() }) }
        peer.ontrack = event => { if (remote.current) remote.current.srcObject = event.streams[0]; setRemoteVisible(true) }
        peer.onconnectionstatechange = () => { setStatus(peer.connectionState === 'connected' ? 'Caméras connectées · vidéo non enregistrée' : ['failed', 'disconnected'].includes(peer.connectionState) ? 'Connexion vidéo perdue. Reconnectez la caméra.' : 'Connexion vidéo…') }
      }
      let rtc
      socket.onopen = () => { if (local.current) local.current.srcObject = stream; send({ type: 'join', id: challengeId }); setStatus('En attente de la caméra de votre ami…') }
      socket.onerror = () => { if (generation.current === id) setStatus('Le service vidéo est inaccessible. Redémarrez le backend puis réessayez.') }
      socket.onmessage = event => { chain = chain.then(async () => {
        const msg = JSON.parse(event.data)
        if (msg.type === 'joined') { rtc = msg.rtc; initiator = msg.initiator; makePeer(rtc) }
        if (msg.type === 'peer-ready' && initiator) { makePeer(rtc); await peer.setLocalDescription(await peer.createOffer()); send({ type: 'offer', sdp: peer.localDescription.sdp }) }
        if (msg.type === 'offer') { await peer.setRemoteDescription({ type: 'offer', sdp: msg.sdp }); for (const candidate of queue.splice(0)) await peer.addIceCandidate(candidate); await peer.setLocalDescription(await peer.createAnswer()); send({ type: 'answer', sdp: peer.localDescription.sdp }) }
        if (msg.type === 'answer') { await peer.setRemoteDescription({ type: 'answer', sdp: msg.sdp }); for (const candidate of queue.splice(0)) await peer.addIceCandidate(candidate) }
        if (msg.type === 'ice') { if (peer?.remoteDescription) await peer.addIceCandidate(msg.candidate); else queue.push(msg.candidate) }
        if (msg.type === 'peer-left') { makePeer(rtc); if (remote.current) remote.current.srcObject = null; setStatus('Votre ami a quitté la vidéo. Le défi continue.') }
        if (['error', 'replaced'].includes(msg.type)) { stop(); setStatus('Connexion vidéo interrompue. Reconnectez la caméra.') }
      }).catch(() => setStatus('Connexion vidéo perdue. Reconnectez la caméra.')) }
      socket.onclose = () => { if (generation.current === id) { peer?.close(); stream.getTracks().forEach(track => track.stop()); setEnabled(false); setStatus(previous => previous.startsWith('Le service vidéo') ? previous : 'Connexion vidéo perdue. Le karaoké continue.') } }
    } catch (error) { stream?.getTracks().forEach(track => track.stop()); setStatus(`${cameraError(error)} Le défi reste jouable.`) }
  }
  return <aside className="challenge-camera">
    <header className="challenge-camera-heading"><Video size={15} /><span>En coulisses</span><small>VIDÉO PRIVÉE</small></header>
    <div className="challenge-videos">
      {[{ ref: local, name: ownName, label: 'Votre caméra', visible: enabled, self: true }, { ref: remote, name: opponentName, label: 'Caméra de votre ami', visible: enabled && remoteVisible }].map(tile => <div className={`challenge-video-tile ${tile.self ? 'is-self' : ''}`} key={tile.label}>
        <video ref={tile.ref} autoPlay playsInline muted aria-label={tile.label} style={{ opacity: tile.visible && !hidden ? 1 : 0 }} />
        {(!tile.visible || hidden) && <div className="challenge-video-placeholder"><span>{tile.name?.charAt(0).toUpperCase()}</span><VideoOff size={16} /><small>{hidden ? 'Vidéo masquée' : tile.self ? 'Votre caméra est désactivée' : 'En attente de la caméra'}</small></div>}
        <div className="challenge-video-label"><b>{tile.name}</b><span>{tile.self ? 'Vous' : 'Votre ami'}</span></div>
      </div>)}
    </div>
    <div className="challenge-camera-controls"><button onClick={enabled ? stop : start}>{enabled ? <VideoOff size={16} /> : <Video size={16} />}{enabled ? 'Désactiver la caméra' : 'Activer la caméra'}</button>{enabled && <><button onClick={() => setHidden(!hidden)}>{hidden ? 'Afficher la vidéo' : 'Masquer la vidéo'}</button><button onClick={start}>Reconnecter</button></>}</div>
    <small role="status">{status}</small>
    <p className="challenge-video-privacy">La vidéo n’est jamais enregistrée.<br />Seule votre performance audio compte.</p>
  </aside>
}
