const finite = (value) => Number.isFinite(Number(value))

export function toEditableLines(session) {
  const segments = Array.isArray(session.lyricsSegments) && session.lyricsSegments.length ? session.lyricsSegments : (session.lyricsLines || []).map((line, index, lines) => ({ start: line.time, end: lines[index + 1]?.time ?? Number(line.time || 0) + 4, text: line.text }))
  return segments.map((line, index) => ({
    id: typeof line.id === 'string' && line.id ? line.id : `line-${index}-${Math.round(Number(line.start ?? line.time ?? 0) * 1000)}`,
    start: Number(line.start ?? line.time ?? 0),
    end: Number(line.end ?? segments[index + 1]?.start ?? Number(line.start ?? line.time ?? 0) + 4),
    text: String(line.text || ''),
  }))
}

export function validateLyricsLines(lines) {
  if (!Array.isArray(lines) || lines.length > 800) return 'Les paroles doivent contenir entre 0 et 800 lignes.'
  const ids = new Set()
  for (const line of lines) {
    if (!line || typeof line.id !== 'string' || !line.id || ids.has(line.id)) return 'Chaque ligne doit avoir un identifiant unique.'
    ids.add(line.id)
    if (!finite(line.start) || !finite(line.end) || Number(line.start) < 0 || Number(line.end) <= Number(line.start)) return 'Chaque ligne doit avoir un début et une fin valides.'
    if (typeof line.text !== 'string') return 'Le texte de chaque ligne doit être valide.'
  }
  return null
}

export function asKaraokeLines(lines) {
  return lines.map(({ id, start, end, text }) => ({ id, time: Number(start), start: Number(start), end: Number(end), text }))
}

export function asSegments(lines) {
  return lines.map(({ id, start, end, text }) => ({ id, start: Number(start), end: Number(end), text }))
}
