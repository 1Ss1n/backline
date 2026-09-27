import { useCallback, useEffect, useRef, useState } from 'react'
import { frequencyToMidi } from '../utils/pitchMath.js'
import { localMicrophoneStream } from '../utils/microphoneSource.js'

const MIN_RMS = 0.012
const MIN_FREQUENCY = 80
const MAX_FREQUENCY = 1000

function yin(buffer, sampleRate) {
  const rms = Math.sqrt(buffer.reduce((sum, sample) => sum + sample * sample, 0) / buffer.length)
  if (rms < MIN_RMS) return { frequency: null, rms, confidence: 0 }
  const minTau = Math.floor(sampleRate / MAX_FREQUENCY); const maxTau = Math.floor(sampleRate / MIN_FREQUENCY)
  const difference = new Float32Array(maxTau + 1); let running = 0; let tauEstimate = -1
  for (let tau = 1; tau <= maxTau; tau += 1) { let sum = 0; for (let index = 0; index < buffer.length - tau; index += 1) { const delta = buffer[index] - buffer[index + tau]; sum += delta * delta } difference[tau] = sum }
  for (let tau = 1; tau <= maxTau; tau += 1) { running += difference[tau]; const cmnd = difference[tau] * tau / (running || 1); difference[tau] = cmnd; if (tau >= minTau && cmnd < .15) { tauEstimate = tau; break } }
  if (tauEstimate < 0) return { frequency: null, rms, confidence: 0 }
  const before = difference[tauEstimate - 1] || difference[tauEstimate]; const current = difference[tauEstimate]; const after = difference[tauEstimate + 1] || current
  const refinedTau = tauEstimate + (before - after) / (2 * (2 * current - before - after) || 1)
  return { frequency: sampleRate / refinedTau, rms, confidence: 1 - current }
}

export function useMicrophonePitch(onPitch, { source = 'local', stream: remoteStream = null, available = false } = {}) {
  const [status, setStatus] = useState('inactive')
  const contextRef = useRef(null), streamRef = useRef(null), frameRef = useRef(null)
  const nodeRef = useRef(null), ownsStream = useRef(false), generation = useRef(0)
  const pitchesRef = useRef([]), callbackRef = useRef(onPitch)
  useEffect(() => { callbackRef.current = onPitch }, [onPitch])
  const stop = useCallback(() => {
    generation.current++
    cancelAnimationFrame(frameRef.current)
    nodeRef.current?.disconnect(); nodeRef.current = null
    if (ownsStream.current) streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null; ownsStream.current = false
    contextRef.current?.close().catch(() => {}); contextRef.current = null
    pitchesRef.current = []; setStatus('inactive')
  }, [])
  const prepare = useCallback(async () => {
    const Context = window.AudioContext || window.webkitAudioContext
    if (!Context) throw new Error('Web Audio indisponible')
    if (!contextRef.current || contextRef.current.state === 'closed') contextRef.current = new Context({ latencyHint: 'interactive' })
    await contextRef.current.resume()
    return contextRef.current
  }, [])
  const start = useCallback(async () => {
    const id = ++generation.current
    let stream, context
    try {
      setStatus('requesting')
      context = await prepare()
      stream = source === 'phone' ? remoteStream : await localMicrophoneStream()
      if (!stream?.getAudioTracks().some(track => track.readyState === 'live')) throw new Error('No microphone')
      if (generation.current !== id) { if (source === 'local') stream.getTracks().forEach(track => track.stop()); return }
      cancelAnimationFrame(frameRef.current); nodeRef.current?.disconnect()
      if (ownsStream.current) streamRef.current?.getTracks().forEach(track => track.stop())
      const analyser = context.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0
      nodeRef.current = context.createMediaStreamSource(stream); nodeRef.current.connect(analyser)
      // Deliberately NOT connected to context.destination: no microphone monitoring.
      streamRef.current = stream; ownsStream.current = source === 'local'; pitchesRef.current = []
      const buffer = new Float32Array(analyser.fftSize)
      let lastUi = 0
      setStatus('active')
      const tick = now => {
        if (generation.current !== id) return
        if (!stream.getAudioTracks().some(track => track.readyState === 'live' && !track.muted && track.enabled)) { setStatus('unavailable'); frameRef.current = requestAnimationFrame(tick); return }
        setStatus('active')
        analyser.getFloatTimeDomainData(buffer)
        const raw = yin(buffer, context.sampleRate)
        const rawMidi = raw.frequency ? frequencyToMidi(raw.frequency) : null
        if (rawMidi != null) pitchesRef.current = [...pitchesRef.current.slice(-4), rawMidi]
        const sorted = [...pitchesRef.current].sort((a, b) => a - b)
        const smoothedMidi = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null
        if (now - lastUi > 65) { callbackRef.current?.({ ...raw, rawMidi, smoothedMidi }); lastUi = now }
        frameRef.current = requestAnimationFrame(tick)
      }
      frameRef.current = requestAnimationFrame(tick)
    } catch (error) {
      if (source === 'local') stream?.getTracks().forEach(track => track.stop())
      if (generation.current === id) { stop(); setStatus(error.name === 'NotAllowedError' ? 'denied' : 'unavailable') }
    }
  }, [source, remoteStream, prepare, stop])
  useEffect(() => {
    if (source !== 'phone') return undefined
    if (available && remoteStream) start()
    else stop()
  }, [source, available, remoteStream, start, stop])
  useEffect(() => stop, [stop])
  return { status, start, stop, prepare }
}
