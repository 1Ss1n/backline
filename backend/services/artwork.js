import fetch from 'node-fetch'

export async function findArtwork(title, artist) {
  const term = [title, artist].filter(Boolean).join(' ')
  if (!term) return null

  try {
    const params = new URLSearchParams({ term, media: 'music', entity: 'song', country: 'FR', limit: '1' })
    const response = await fetch(`https://itunes.apple.com/search?${params}`)
    if (!response.ok) return null
    const { results = [] } = await response.json()
    const artwork = results[0]?.artworkUrl100
    return artwork ? artwork.replace('100x100bb', '600x600bb') : null
  } catch (error) {
    console.warn('[artwork] jaquette introuvable:', error.message)
    return null
  }
}
