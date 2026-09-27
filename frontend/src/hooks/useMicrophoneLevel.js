import { useCallback, useEffect, useRef, useState } from 'react'

// Lightweight meter only; no second pitch detector and no playback destination.
export function useMicrophoneLevel(stream, enabled) {
  const contextRef = useRef(null), [level, setLevel] = useState(0), [status, setStatus] = useState('inactive')
  const prepare = useCallback(async () => {
    const Context = window.AudioContext || window.webkitAudioContext
    if (!contextRef.current || contextRef.current.state === 'closed') contextRef.current = new Context({ latencyHint: 'interactive' })
    await contextRef.current.resume()
    return contextRef.current
  }, [])
  useEffect(() => {
    let cancelled = false, frame, node
    if (!enabled || !stream) { setLevel(0); setStatus('inactive'); return }
    prepare().then(context => {
      if (cancelled) return
      node = context.createMediaStreamSource(stream)
      const analyser = context.createAnalyser(); analyser.fftSize = 256; node.connect(analyser)
      const samples = new Float32Array(256); let previous = 0
      setStatus('active')
      const tick = now => {
        if (now - previous > 80) { analyser.getFloatTimeDomainData(samples); setLevel(Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length)); previous = now }
        frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    }).catch(() => { if (!cancelled) setStatus('unavailable') })
    return () => { cancelled = true; cancelAnimationFrame(frame); node?.disconnect() }
  }, [enabled, stream, prepare])
  useEffect(() => () => { contextRef.current?.close().catch(() => {}); contextRef.current = null }, [])
  return { level, status, prepare }
}
