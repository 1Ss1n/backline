import { getActiveLineIndex } from '../utils/lrc'
import TextFillAnimation from './TextFillAnimation'

/**
 * Affiche la ligne courante + la suivante. Le mot "chanté" est éclairé
 * en estimant sa position dans la ligne au prorata du temps écoulé
 * jusqu'à la ligne suivante (approximation simple sans timestamps
 * mot-par-mot — suffisant en LRC standard ligne par ligne).
 */
export default function KaraokeLyrics({ lines, currentTime }) {
  if (!lines || lines.length === 0) {
    return <div className="lyrics-line">En attente des paroles…</div>
  }

  const activeIdx = getActiveLineIndex(lines, currentTime)
  const current = lines[activeIdx]
  const next = lines[activeIdx + 1]

  const lineStart = current?.time ?? 0
  const lineEnd = next?.time ?? lineStart + 4
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
