import fetch from 'node-fetch'

/**
 * LRCLIB (https://lrclib.net) est une base de paroles ouverte et gratuite,
 * sans clé API, qui fournit à la fois du texte brut et du LRC synchronisé
 * ligne par ligne quand disponible.
 */
export async function fetchLyrics({ title, artist }) {
  const params = new URLSearchParams({
    track_name: title,
    ...(artist ? { artist_name: artist } : {}),
  })

  const response = await fetch(`https://lrclib.net/api/search?${params}`, {
    headers: { 'User-Agent': 'Backline Karaoke App v0.1' },
  })
  if (!response.ok) throw new Error(`LRCLIB a répondu ${response.status}`)

  const results = await response.json()
  if (!Array.isArray(results) || results.length === 0) return null

  // Priorité au premier résultat qui a des paroles synchronisées
  const best = results.find((r) => r.syncedLyrics) || results[0]

  return {
    syncedLyrics: best.syncedLyrics || null,
    plainLyrics: best.plainLyrics || null,
    source: 'lrclib',
  }
}
