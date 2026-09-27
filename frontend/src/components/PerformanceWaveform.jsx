import { useEffect, useMemo, useState } from 'react'

// Cache only the small envelopes, never the decoded audio buffers.
const envelopes = new Map()
const BAR_COUNT = 80

export default function PerformanceWaveform({ source, time, duration, onSeek }) {
  const [peaks, setPeaks] = useState(null)
  const [status, setStatus] = useState('loading')
  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false
    let context
    setPeaks(null)
    setStatus('loading')
    async function load() {
      if (envelopes.has(source)) {
        setPeaks(envelopes.get(source)); setStatus('ready'); return
      }
      try {
        const response = await fetch(source, { signal: controller.signal, credentials: 'include' })
        if (!response.ok) throw new Error('Audio unavailable')
        const data = await response.arrayBuffer()
        if (cancelled) return
        context = new OfflineAudioContext(1, 1, 8000)
        const audio = await context.decodeAudioData(data)
        if (cancelled) return
        const channel = audio.getChannelData(0)
        const values = Array.from({ length: BAR_COUNT }, (_, index) => {
          const start = Math.floor(index * channel.length / BAR_COUNT)
          const end = Math.floor((index + 1) * channel.length / BAR_COUNT)
          let total = 0, count = 0
          const stride = Math.max(1, Math.floor((end - start) / 256))
          for (let i = start; i < end; i += stride) { total += channel[i] ** 2; count++ }
          return Math.sqrt(total / Math.max(1, count))
        })
        const max = Math.max(.0001, ...values)
        const next = values.map(value => Math.max(.06, Math.sqrt(value / max)))
        if (envelopes.size >= 20) envelopes.delete(envelopes.keys().next().value)
        envelopes.set(source, next)
        setPeaks(next); setStatus('ready')
      } catch {
        if (!cancelled) setStatus('unavailable')
      } finally { context = null }
    }
    load()
    return () => { cancelled = true; controller.abort() }
  }, [source])

  const bars = useMemo(() => (peaks || Array(BAR_COUNT).fill(.06)).map((peak, index) =>
    <rect key={index} x={index * 6 + 1} y={(56 - peak * 50) / 2} width="3" height={peak * 50} rx="1.5" />
  ), [peaks])
  const progress = duration ? Math.min(100, Math.max(0, time / duration * 100)) : 0
  return <div className="performance-waveform" data-status={status} style={{ '--wave-progress': `${progress}%` }}>
    <svg viewBox="0 0 480 56" preserveAspectRatio="none" aria-hidden="true" className="wave-base">{bars}</svg>
    <svg viewBox="0 0 480 56" preserveAspectRatio="none" aria-hidden="true" className="wave-played">{bars}</svg>
    <input aria-label="Position dans la performance" aria-valuetext={`${Math.floor(time)} secondes sur ${Math.floor(duration)}`} type="range" min="0" max={duration || 0} step="0.1" value={Math.min(time, duration || 0)} disabled={!duration} onChange={event => onSeek(event.target.value)} />
    {status === 'loading' && <span className="wave-status">Chargement de l’onde…</span>}
    {status === 'unavailable' && <span className="wave-status">Onde indisponible · lecture disponible</span>}
  </div>
}
