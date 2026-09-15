import { useCallback, useEffect, useRef, useState } from 'react'
import { frequencyToMidi } from '../utils/pitchMath.js'

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

export function useMicrophonePitch(onPitch) {
  const [status, setStatus] = useState('inactive'); const contextRef = useRef(null); const streamRef = useRef(null); const frameRef = useRef(null); const lastUiRef = useRef(0); const pitchesRef = useRef([]); const callbackRef = useRef(onPitch)
  useEffect(() => { callbackRef.current = onPitch }, [onPitch])
  const stop = useCallback(() => { cancelAnimationFrame(frameRef.current); streamRef.current?.getTracks().forEach((track) => track.stop()); contextRef.current?.close(); streamRef.current = null; contextRef.current = null; setStatus('inactive') }, [])
  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return setStatus('unavailable')
    try {
      setStatus('requesting'); const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      const Context = window.AudioContext || window.webkitAudioContext; const context = new Context(); await context.resume(); const analyser = context.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0; context.createMediaStreamSource(stream).connect(analyser)
      const buffer = new Float32Array(analyser.fftSize); streamRef.current = stream; contextRef.current = context; setStatus('active')
      const tick = (now) => { analyser.getFloatTimeDomainData(buffer); const raw = yin(buffer, context.sampleRate); const rawMidi = raw.frequency ? frequencyToMidi(raw.frequency) : null; if (rawMidi != null) pitchesRef.current = [...pitchesRef.current.slice(-4), rawMidi]; const sorted = [...pitchesRef.current].sort((a, b) => a - b); const smoothedMidi = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null; if (now - lastUiRef.current > 65) { callbackRef.current?.({ ...raw, rawMidi, smoothedMidi }); lastUiRef.current = now } frameRef.current = requestAnimationFrame(tick) }
      frameRef.current = requestAnimationFrame(tick)
    } catch (error) { setStatus(error.name === 'NotAllowedError' ? 'denied' : 'unavailable') }
  }, [])
  useEffect(() => stop, [stop]); return { status, start, stop }
}
