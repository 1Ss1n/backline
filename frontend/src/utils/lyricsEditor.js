export const formatLyricsTime = (seconds = 0) => {
  const value = Math.max(0, Number(seconds) || 0)
  const minutes = Math.floor(value / 60)
  const wholeSeconds = Math.floor(value % 60)
  const milliseconds = Math.round((value - Math.floor(value)) * 1000)
  return `${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`
}

export const cloneLyrics = (lines) => lines.map((line) => ({ ...line }))
export const lineId = () => `line-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export function splitLine(line, cursor) {
  const at = Math.max(1, Math.min(Number(cursor) || 0, line.text.length - 1))
  const middle = Number(((line.start + line.end) / 2).toFixed(3))
  return [{ ...line, text: line.text.slice(0, at).trim(), end: middle }, { id: lineId(), start: middle, end: line.end, text: line.text.slice(at).trim() }]
}

export function validateLocalLines(lines, duration) {
  const issues = []
  lines.forEach((line, index) => {
    if (!Number.isFinite(line.start) || !Number.isFinite(line.end) || line.start < 0 || line.end <= line.start) issues.push(`Ligne ${index + 1} : début et fin incohérents.`)
    if (duration && line.end > duration + 0.01) issues.push(`Ligne ${index + 1} : fin au-delà de l’audio.`)
  })
  return issues
}
