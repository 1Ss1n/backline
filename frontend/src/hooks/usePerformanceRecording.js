import { useCallback, useEffect, useRef, useState } from 'react'
import { microphoneError } from '../utils/microphoneSource.js'

export function usePerformanceRecording({ sessionId, source, phone, onSaved, endpoint = '/api/performances', getMetadata }) {
  const takeRef = useRef(null), generation = useRef(0)
  const savedCallback = useRef(onSaved); savedCallback.current = onSaved
  const [armed, setArmed] = useState(false), [recording, setRecording] = useState(false)
  const [preparing, setPreparing] = useState(false), [saving, setSaving] = useState(false)
  const [error, setError] = useState(''), [saved, setSaved] = useState(null)
  const phoneRef = useRef(phone); phoneRef.current = phone
  const cancel = useCallback(() => {
    generation.current++
    const take = takeRef.current; takeRef.current = null
    if (take) {
      take.recorder.onstop = null; take.recorder.ondataavailable = null; take.recorder.onerror = null
      if (take.recorder.state !== 'inactive') take.recorder.stop()
      take.stream.getTracks().forEach(track => track.stop())
    }
    phoneRef.current.setRecording(false)
    setArmed(false); setRecording(false); setPreparing(false); setSaving(false)
  }, [])
  useEffect(() => () => cancel(), [sessionId, cancel])
  const stop = useCallback(() => {
    if (takeRef.current?.recorder.state === 'recording') { setSaving(true); takeRef.current.recorder.stop() }
    phoneRef.current.setRecording(false)
    setRecording(false); setArmed(false)
  }, [])
  const readyPhone = phone.status === 'connected' && !phone.muted && !phone.trackMuted && phone.remoteStream?.getAudioTracks().some(track => track.readyState === 'live')
  useEffect(() => {
    if (source !== 'phone' || readyPhone || !takeRef.current) return
    if (recording) {
      setError('Micro téléphone indisponible : enregistrement interrompu. La prise partielle sera sauvegardée.')
      stop()
    } else if (armed) { cancel(); setError('Reconnectez et réactivez le micro du téléphone avant d’enregistrer.') }
  }, [source, readyPhone, recording, armed, stop, cancel])

  const arm = async () => {
    if (armed) { cancel(); return false }
    if (preparing || recording || saving) return false
    if (!window.MediaRecorder) { setError('Ce navigateur ne prend pas en charge l’enregistrement.'); return false }
    if (source === 'phone' && !readyPhone) { setError('Connectez et activez le micro du téléphone avant d’enregistrer.'); return false }
    const id = ++generation.current
    let stream
    setPreparing(true); setError(''); setSaved(null)
    try {
      // Own only a clone. Stopping a take must not stop the shared pitch/phone stream.
      stream = source === 'phone' ? phone.remoteStream.clone() : await navigator.mediaDevices.getUserMedia({ audio: true })
      if (id !== generation.current) { stream.getTracks().forEach(track => track.stop()); return false }
      if (!stream.getAudioTracks().some(track => track.readyState === 'live')) throw new Error('Microphone indisponible.')
      const recorder = new MediaRecorder(stream), chunks = []
      const take = { stream, recorder, source, id }
      takeRef.current = take
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
      recorder.onerror = () => { cancel(); setError('L’enregistrement a échoué. Veuillez réessayer.') }
      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop())
        if (takeRef.current === take) takeRef.current = null
        if (id !== generation.current) return
        phoneRef.current.setRecording(false); setArmed(false); setRecording(false)
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        if (!blob.size) { setSaving(false); setError('Aucun audio n’a été enregistré.'); return }
        setSaving(true)
        try {
          const form = new FormData()
          form.append('sessionId', sessionId)
          if (getMetadata) form.append('metadata', JSON.stringify(await getMetadata()))
          form.append('recording', blob, blob.type.includes('mp4') ? 'performance.m4a' : 'performance.webm')
          const response = await fetch(endpoint, { method: 'POST', credentials: 'include', body: form })
          if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'La sauvegarde a échoué.')
          const performance = await response.json()
          if (id === generation.current) { setSaved(performance); savedCallback.current?.(performance) }
        } catch (cause) { if (id === generation.current) setError(cause.message) }
        finally { if (id === generation.current) setSaving(false) }
      }
      setArmed(true)
      return true
    } catch (cause) { stream?.getTracks().forEach(track => track.stop()); if (id === generation.current) setError(microphoneError(cause)); return false }
    finally { if (id === generation.current) setPreparing(false) }
  }
  const start = () => {
    const take = takeRef.current
    if (!take || take.recorder.state !== 'inactive' || take.source === 'phone' && !readyPhone) throw new Error('Le micro sélectionné n’est plus disponible.')
    take.recorder.start(); setRecording(true)
    if (take.source === 'phone') phoneRef.current.setRecording(true)
  }
  return { armed, recording, preparing, saving, error, saved, arm, start, stop, cancel, setError }
}
