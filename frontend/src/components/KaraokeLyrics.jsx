import { useMemo } from 'react'
import { getActiveLineIndex } from '../utils/lrc'
import TextFillAnimation from './TextFillAnimation'

/**
 * Affiche la ligne courante + la suivante. Le mot "chanté" est éclairé
 * en estimant sa position dans la ligne au prorata du temps écoulé
 * jusqu'à la ligne suivante (approximation simple sans timestamps
 * mot-par-mot — suffisant en LRC standard ligne par ligne).
 */
export default function KaraokeLyrics({ lines, currentTime }) {
  const timeline = useMemo(() => Array.isArray(lines) ? [...lines].sort((left, right) => (left.start ?? left.time ?? 0) - (right.start ?? right.time ?? 0)) : [], [lines])
  if (timeline.length === 0) {
    return <div className="lyrics-line">En attente des paroles…</div>
  }

  const activeIdx = getActiveLineIndex(timeline, currentTime)
  const current = activeIdx >= 0 ? timeline[activeIdx] : null
  const next = activeIdx >= 0
    ? timeline[activeIdx + 1]
    : timeline.find((line) => (line.start ?? line.time ?? 0) > currentTime)

  const lineStart = current?.start ?? current?.time ?? 0
  const lineEnd = current?.end ?? next?.start ?? next?.time ?? lineStart + 4
  const progress = Math.min(1, Math.max(0, (currentTime - lineStart) / (lineEnd - lineStart || 1)))

  const words = (current?.text || '').split(' ').filter(Boolean)
  const litCount = Math.round(progress * words.length)

  return (
    <>
      <div className="lyrics-line current">
        {words.map((w, i) => (
          <TextFillAnimation key={i} className="word" filled={i < litCount}>{w}</TextFillAnimation>
        ))}
      </div>
      {next && <div className="lyrics-line next">{next.text}</div>}
    </>
  )
}
