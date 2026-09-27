import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { buildLyricTimeline, getLyricFrame, getWordProgress } from '../utils/lyricPresentation.js'
import WordByWord from './rewamp/WordByWord.jsx'

// Audio timeupdate is usually ~4 Hz. Only the lyric DOM is painted at display
// refresh rate: the player, audio mixer and pitch scoring do not rerender per frame.
export default function KaraokeLyrics({ lines, currentTime, duration, audioRef, lyricsOffset = 0 }) {
  const timeline = useMemo(() => buildLyricTimeline(lines, duration), [lines, duration])
  const fallback = getLyricFrame(timeline, currentTime)
  const [clockFrame, setClockFrame] = useState(() => ({ timeline, frame: fallback }))
  const wordRefs = useRef([])
  const refreshRef = useRef(null)
  const frame = audioRef && clockFrame.timeline === timeline ? clockFrame.frame : fallback
  const renderedLineRef = useRef(frame.current)
  renderedLineRef.current = frame.current

  useLayoutEffect(() => {
    const audio = audioRef?.current
    if (!audio) return
    let animationId = 0
    let lastFrame = null
    const update = () => {
      const time = Math.max(0, audio.currentTime - lyricsOffset)
      const next = getLyricFrame(timeline, time)
      if (!lastFrame || lastFrame.current !== next.current || lastFrame.previous !== next.previous || lastFrame.next !== next.next) {
        lastFrame = next
        setClockFrame({ timeline, frame: next })
      }
      if (renderedLineRef.current !== next.current) return
      next.current?.words.forEach((word, index) => {
        const node = wordRefs.current[index]
        if (!node) return
        const progress = getWordProgress(word, time)
        // Completed/future words are written just once, not on every frame.
        const value = progress.toFixed(4)
        if (node.dataset.progress === value) return
        node.dataset.progress = value
        node.style.setProperty('--word-progress', `${progress * 100}%`)
        node.style.setProperty('--word-opacity', String(.72 + .28 * progress))
        node.style.setProperty('--word-shift', `${(1 - progress) * 5}px`)
      })
    }
    const tick = () => {
      update()
      if (!audio.paused && !audio.ended && !document.hidden) animationId = requestAnimationFrame(tick)
    }
    const wake = () => {
      cancelAnimationFrame(animationId)
      update()
      if (!audio.paused && !audio.ended && !document.hidden) animationId = requestAnimationFrame(tick)
    }
    refreshRef.current = () => {
      // React may have reapplied a parent's lower-rate currentTime style.
      wordRefs.current.forEach(node => { if (node) delete node.dataset.progress })
      update()
    }
    const events = ['play', 'pause', 'seeking', 'seeked', 'ended', 'loadedmetadata', 'ratechange']
    events.forEach(event => audio.addEventListener(event, wake))
    audio.addEventListener('timeupdate', update)
    document.addEventListener('visibilitychange', wake)
    wake()
    return () => {
      cancelAnimationFrame(animationId)
      events.forEach(event => audio.removeEventListener(event, wake))
      audio.removeEventListener('timeupdate', update)
      document.removeEventListener('visibilitychange', wake)
      refreshRef.current = null
    }
  }, [timeline, audioRef, lyricsOffset])

  useLayoutEffect(() => { refreshRef.current?.() })

  if (!timeline.length) return <div className="lyrics-line lyrics-empty">En attente des paroles…</div>
  return <div className="lyrics-stack">
    <div className="lyrics-line previous">{frame.previous?.text || '\u00a0'}</div>
    <WordByWord line={frame.current} currentTime={currentTime} wordRefs={wordRefs} />
    <div className="lyrics-line next">{frame.next?.text || '\u00a0'}</div>
  </div>
}
