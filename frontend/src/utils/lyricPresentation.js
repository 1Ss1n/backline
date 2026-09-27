const clamp = (value) => Math.min(1, Math.max(0, value))
const tokens = (text) => String(text || '').trim().split(/\s+/).filter(Boolean)

// Presentation only: never mutate or persist interpolated word boundaries.
export function buildLyricTimeline(lines, duration) {
  const sorted = (Array.isArray(lines) ? lines : []).filter((line) => Number.isFinite(line.start ?? line.time))
    .slice().sort((a, b) => (a.start ?? a.time) - (b.start ?? b.time))
  return sorted.map((line, index) => {
    const start = line.start ?? line.time
    const nextStart = sorted[index + 1]?.start ?? sorted[index + 1]?.time
    const candidates = [line.end, nextStart, duration].filter((time) => Number.isFinite(time) && time > start)
    const end = candidates.length ? Math.min(...candidates) : Infinity
    const textWords = tokens(line.text)
    const realWords = Array.isArray(line.words) && line.words.length > 0 &&
      tokens(line.words.map((word) => word.word ?? word.text ?? '').join(' ')).join(' ') === textWords.join(' ') &&
      line.words.every((word, i) => Number.isFinite(word.start) && Number.isFinite(word.end) && word.end > word.start && word.start >= start && word.end <= end && (!i || word.start >= line.words[i - 1].start))
    const words = realWords ? line.words.map((word) => ({ text: String(word.word ?? word.text).trim(), start: word.start, end: word.end }))
      : textWords.map((text, i) => ({ text, start: Number.isFinite(end) ? start + (end - start) * i / textWords.length : start, end: Number.isFinite(end) ? start + (end - start) * (i + 1) / textWords.length : start }))
    return { text: String(line.text || '').trim(), start, end, words, timing: realWords ? 'words' : Number.isFinite(end) ? 'visual-estimation' : 'line' }
  })
}

export function getLyricFrame(timeline, time) {
  let low = 0, high = timeline.length
  while (low < high) {
    const mid = (low + high) >>> 1
    if (timeline[mid].start <= time) low = mid + 1
    else high = mid
  }
  const index = low - 1
  const candidate = timeline[index]
  const current = candidate && time < candidate.end ? candidate : null
  return { current, previous: timeline[current ? index - 1 : index] || null, next: timeline[index + 1] || null }
}

export function getWordProgress(word, time) {
  if (time < word.start) return 0
  return word.end > word.start ? clamp((time - word.start) / (word.end - word.start)) : 1
}
