import FormData from 'form-data'
import fetch from 'node-fetch'

/**
 * Identifie un morceau via l'API publique AudD (https://audd.io).
 * Nécessite AUDD_API_TOKEN dans les variables d'environnement.
 */
export async function identifyTrack(fileBuffer, originalName) {
  const token = process.env.AUDD_API_TOKEN
  if (!token) throw new Error('AUDD_API_TOKEN manquant dans .env')

  const form = new FormData()
  form.append('api_token', token)
  form.append('file', fileBuffer, originalName)
  // 'apple_music' et 'spotify' donnent des métadonnées enrichies en option
  form.append('return', 'apple_music,spotify')

  const response = await fetch('https://api.audd.io/', { method: 'POST', body: form })
  if (!response.ok) throw new Error(`AudD a répondu ${response.status}`)

  const data = await response.json()
  if (data.status !== 'success' || !data.result) return null

  return {
    title: data.result.title,
    artist: data.result.artist,
    album: data.result.album,
  }
}
