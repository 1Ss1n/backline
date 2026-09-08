import { useEffect, useRef } from 'react'

const audioGraphs = new WeakMap()

export default function AudioSpectrum({ audioRef }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const audio = audioRef.current
    const canvas = canvasRef.current
    if (!audio || !canvas) return undefined

    let graph = audioGraphs.get(audio)
    if (!graph) {
      const context = new AudioContext()
      const analyser = context.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.82
      const source = context.createMediaElementSource(audio)
      source.connect(analyser)
      analyser.connect(context.destination)
      graph = { context, analyser }
      audioGraphs.set(audio, graph)
    }
    const { context, analyser } = graph

    const frequencies = new Uint8Array(analyser.frequencyBinCount)
    const drawingContext = canvas.getContext('2d')
    let animationFrame
    const resize = () => {
      const bounds = canvas.getBoundingClientRect()
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.round(bounds.width * ratio)
      canvas.height = Math.round(bounds.height * ratio)
      drawingContext.setTransform(ratio, 0, 0, ratio, 0, 0)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    const resumeContext = () => context.resume().catch(() => {})
    audio.addEventListener('play', resumeContext)

    const draw = () => {
      const { width, height } = canvas.getBoundingClientRect()
      drawingContext.clearRect(0, 0, width, height)
      analyser.getByteFrequencyData(frequencies)
      const styles = getComputedStyle(canvas)
      const accent = styles.getPropertyValue('--accent').trim() || styles.getPropertyValue('--amber').trim() || '#d9f765'
      const barCount = 54
      const gap = 4
      const barWidth = Math.max(2, (width - gap * (barCount - 1)) / barCount)
      const centre = height * 0.53
      for (let index = 0; index < barCount; index += 1) {
        const intensity = frequencies[Math.floor((index / barCount) * frequencies.length * 0.78)] / 255
        const barHeight = Math.max(3, intensity * height * 0.31)
        const x = index * (barWidth + gap)
        drawingContext.fillStyle = accent
        drawingContext.globalAlpha = 0.07 + intensity * 0.16
        drawingContext.beginPath()
        drawingContext.roundRect(x, centre - barHeight, barWidth, barHeight, barWidth)
        drawingContext.roundRect(x, centre + 2, barWidth, barHeight, barWidth)
        drawingContext.fill()
      }
      drawingContext.globalAlpha = 1
      animationFrame = requestAnimationFrame(draw)
    }
    resize(); draw()
    return () => {
      cancelAnimationFrame(animationFrame); observer.disconnect(); audio.removeEventListener('play', resumeContext)
      // Le graphe est conservé pour éviter de recréer une MediaElementSource
      // lors du second montage de React StrictMode.
    }
  }, [audioRef])

  return <canvas ref={canvasRef} className="audio-spectrum" aria-hidden="true" />
}
