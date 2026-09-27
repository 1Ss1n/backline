import { getWordProgress } from '../../utils/lyricPresentation.js'

// RewampUI's opacity + vertical reveal, scrubbed by audio time.
// No autonomous stagger: pause, rewind and seek are deterministic.
export default function WordByWord({ line, currentTime, wordRefs }) {
  return <div className="lyrics-line current" data-word-timing={line?.timing || 'silence'} aria-label={line?.text || 'Interlude musical'}>
    {line?.text ? line.words.map((word, index) => {
      const progress = getWordProgress(word, currentTime)
      return <span className="lyric-word" ref={(node) => { if (wordRefs) wordRefs.current[index] = node }} key={`${line.start}:${index}:${word.text}`} aria-hidden="true" style={{ '--word-progress': `${progress * 100}%`, '--word-opacity': .72 + .28 * progress, '--word-shift': `${(1 - progress) * 5}px` }}>{word.text}</span>
    }) : <span className="lyrics-interlude" aria-hidden="true">♪</span>}
  </div>
}
