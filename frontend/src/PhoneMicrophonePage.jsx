import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Smartphone } from 'lucide-react'
import useTheme from './hooks/useTheme'
import { localMicrophoneStream, microphoneError } from './utils/microphoneSource'
import { PhoneMicConnection } from './utils/phoneMicConnection'
import { MicLevel, phoneStatus } from './components/PhoneMicPairing'
import './components/PhoneMicrophone.css'

export default function PhoneMicrophonePage() {
  useTheme()
  const [token] = useState(() => new URLSearchParams(location.hash.slice(1)).get('token') || '')
  const [code, setCode] = useState(''), [state, setState] = useState({ status: 'idle', muted: false })
  const [level, setLevel] = useState(0), [error, setError] = useState('')
  const client = useRef(null), context = useRef(null), frame = useRef(null), stream = useRef(null), generation = useRef(0)
  const cleanup = () => {
    generation.current++; client.current?.close(); client.current = null
    cancelAnimationFrame(frame.current); stream.current?.getTracks().forEach(track => track.stop()); stream.current = null
    context.current?.close().catch(() => {}); context.current = null; setLevel(0)
  }
  useEffect(() => {
    // Fragment never reaches HTTP access logs; remove it from the visible address too.
    history.replaceState(null, '', '/mic')
    const hide = () => { if (document.hidden) { client.current?.mute(true); setLevel(0) } }
    const end = () => cleanup()
    document.addEventListener('visibilitychange', hide); window.addEventListener('pagehide', end)
    return () => { document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', end); cleanup() }
  }, [])
  const activate = async () => {
    cleanup(); setError(''); setState({ status: 'requesting', muted: false })
    const id = generation.current
    try {
      if (!isSecureContext) throw new Error('HTTPS est requis. Ouvrez le lien sécurisé affiché sur votre PC.')
      if (!window.RTCPeerConnection) throw new Error('Ce navigateur ne prend pas en charge WebRTC.')
      const Context = window.AudioContext || window.webkitAudioContext
      context.current = new Context({ latencyHint: 'interactive' }); await context.current.resume()
      const media = await localMicrophoneStream()
      if (id !== generation.current) { media.getTracks().forEach(track => track.stop()); return }
      stream.current = media
      // Permission is requested by this button, not when the QR page loads.
      const analyser = context.current.createAnalyser(); analyser.fftSize = 256
      context.current.createMediaStreamSource(media).connect(analyser)
      const samples = new Float32Array(256); let previous = 0
      const tick = now => {
        if (id !== generation.current) return
        if (now - previous > 80) { analyser.getFloatTimeDomainData(samples); setLevel(media.getAudioTracks()[0].enabled ? Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length) : 0); previous = now }
        frame.current = requestAnimationFrame(tick)
      }
      frame.current = requestAnimationFrame(tick)
      client.current = new PhoneMicConnection({ role: 'phone', credentials: token ? { token } : { code: code.replace(/\s/g, '') }, stream: media, onUpdate: value => {
        if (id !== generation.current) return
        setState(value)
        if (['ended', 'expired', 'error'].includes(value.status)) {
          cancelAnimationFrame(frame.current); media.getTracks().forEach(track => track.stop()); context.current?.close().catch(() => {}); context.current = null; setLevel(0)
        }
      } })
    } catch (cause) { if (id === generation.current) { cleanup(); setState({ status: 'idle', muted: false }); setError(microphoneError(cause)) } }
  }
  const active = ['connecting', 'pending', 'connected', 'reconnecting', 'disconnected'].includes(state.status)
  return <main className="phone-mic-page phone-mic-ui">
    <header><Smartphone size={23} /><b>BACKLINE</b><span>MICRO SANS FIL</span></header>
    <section><p className="phone-mic-kicker">VOTRE VOIX, EN DIRECT</p><h1>Votre téléphone<br />devient votre micro.</h1>
      <p>Votre micro sert au karaoké et à Perfect Pitch. Votre voix est sauvegardée dans « Mes performances » uniquement si vous lancez « Enregistrer » sur le PC.</p>
      {state.recording && <p className="phone-recording-notice" role="status">● Enregistrement en cours sur le PC</p>}
      {!token && !active && <label>Code affiché sur l’ordinateur<input className="phone-code-input" aria-label="Code de connexion" inputMode="numeric" autoComplete="off" maxLength="7" placeholder="482 731" value={code} onChange={event => setCode(event.target.value.replace(/[^0-9 ]/g, ''))} /></label>}
      {!active && <button className="primary" onClick={activate} disabled={state.status === 'requesting' || !token && !/^\d{6}$/.test(code.replace(/\s/g, ''))}><Mic size={18} />{state.status === 'requesting' ? 'Autorisation…' : 'Activer le microphone'}</button>}
      {active && <><p className="phone-mic-state" role="status">{phoneStatus(state)}</p>{state.status === 'pending' && <p>Autorisez la connexion sur votre ordinateur.</p>}<MicLevel value={state.muted ? 0 : level} />
        <button className={state.muted ? 'primary' : ''} onClick={() => { context.current?.resume(); client.current?.mute(!state.muted) }}>{state.muted ? <Mic size={18} /> : <MicOff size={18} />}{state.muted ? 'Réactiver le micro' : 'Couper le micro'}</button>
        {state.status === 'disconnected' && <button onClick={() => client.current?.reconnect()}>Reconnecter</button>}
        <button onClick={() => { cleanup(); setState({ status: 'ended', error: 'Session terminée.' }) }}>Déconnecter</button></>}
      {(error || state.error) && <p className="phone-mic-warning" role="alert">{error || state.error}</p>}
      <footer>Gardez cette page ouverte et votre téléphone actif pendant la session. Le micro est coupé si vous quittez cette page ou passez en arrière-plan.<br />Utilisez un casque sur le PC pour éviter de capter la musique.</footer>
    </section>
  </main>
}
