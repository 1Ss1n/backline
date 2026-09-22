// Parse un fichier .lrc classique : [mm:ss.xx] paroles
// Renvoie un tableau trié [{ time: seconds, text: string }]
export function parseLRC(lrcText) {
  const lines = lrcText.split('\n')
  const timeTag = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g

  const result = []
  for (const rawLine of lines) {
    const tags = [...rawLine.matchAll(timeTag)]
    if (tags.length === 0) continue
    const text = rawLine.replace(timeTag, '').trim()
    for (const tag of tags) {
      const min = parseInt(tag[1], 10)
      const sec = parseInt(tag[2], 10)
      const frac = tag[3] ? parseInt(tag[3].padEnd(3, '0'), 10) / 1000 : 0
      result.push({ time: min * 60 + sec + frac, text })
    }
  }
  return result.sort((a, b) => a.time - b.time)
}

// Trouve l'index de la ligne courante et de la suivante selon le temps de lecture
export function getActiveLineIndex(lines, currentTime) {
  let idx = -1
  for (let i = 0; i < lines.length; i++) {
    const start = lines[i].start ?? lines[i].time
    const end = lines[i].end
    if (start > currentTime) break
    if (end === undefined || currentTime < end) idx = i
  }
  return idx
}
