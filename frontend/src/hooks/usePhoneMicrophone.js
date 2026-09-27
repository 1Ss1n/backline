import { useCallback, useEffect, useRef, useState } from 'react'
import { PhoneMicConnection } from '../utils/phoneMicConnection.js'

const initial = { status: 'idle', muted: false, remoteStream: null, trackMuted: false, error: '', stats: null }
export function usePhoneMicrophone() {
  const client = useRef(null), pairing = useRef(null), generation = useRef(0)
  const [pair, setPair] = useState(null)
  const [state, setState] = useState(initial)
  const disconnect = useCallback(() => {
    generation.current++
    client.current?.close(); client.current = null
    if (pairing.current) fetch(`/api/phone-mic/pairings/${pairing.current.id}`, { method: 'DELETE', credentials: 'include', keepalive: true }).catch(() => {})
    pairing.current = null; setPair(null); setState(initial)
  }, [])
  const create = useCallback(async () => {
    disconnect()
    const id = generation.current
    setState({ ...initial, status: 'creating' })
    try {
      if (!window.isSecureContext) throw new Error('HTTPS est requis. Ouvrez Backline via le tunnel HTTPS.')
      if (!window.RTCPeerConnection) throw new Error('WebRTC n’est pas disponible dans ce navigateur.')
      const response = await fetch('/api/phone-mic/pairings', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Impossible de créer le QR.')
      if (id !== generation.current) {
        fetch(`/api/phone-mic/pairings/${data.id}`, { method: 'DELETE', credentials: 'include', keepalive: true }).catch(() => {}); return
      }
      pairing.current = data; setPair(data)
      client.current = new PhoneMicConnection({ role: 'host', credentials: { id: data.id, token: data.hostToken }, onUpdate: value => { if (id === generation.current) setState(value) } })
    } catch (error) { if (id === generation.current) setState({ ...initial, status: 'error', error: error.message }) }
  }, [disconnect])
  useEffect(() => {
    window.addEventListener('pagehide', disconnect)
    return () => { window.removeEventListener('pagehide', disconnect); disconnect() }
  }, [disconnect])
  return { ...state, pair, create, disconnect, approve: () => client.current?.approve(), refuse: () => client.current?.refuse(), reconnect: () => client.current?.reconnect(), resumeAudio: () => client.current?.resumeAudio(), setRecording: value => client.current?.setRecording(value) }
}
