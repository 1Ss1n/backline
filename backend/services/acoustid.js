import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fetch from 'node-fetch'

const execFileAsync = promisify(execFile)

const ACOUSTID_API_KEY = process.env.ACOUSTID_API_KEY
const FPCALC_PATH =
  process.env.FPCALC_PATH ||
  '/Users/yassine/Downloads/chromaprint-fpcalc-1.6.1-macos-x86_64/fpcalc'

/**
 * Crée un fingerprint Chromaprint à partir d'un fichier audio.
 */
async function createFingerprint(filePath) {
  console.log('[chromaprint] génération du fingerprint...')

  const { stdout } = await execFileAsync(FPCALC_PATH, [
    filePath,
  ])

  const durationMatch = stdout.match(/DURATION=(\d+(?:\.\d+)?)/)
  const fingerprintMatch = stdout.match(/FINGERPRINT=(.+)/)

  if (!durationMatch || !fingerprintMatch) {
    throw new Error(
      'Impossible de récupérer le fingerprint Chromaprint.'
    )
  }

  const duration = Number(durationMatch[1])
  const fingerprint = fingerprintMatch[1].trim()

  console.log('[chromaprint] durée:', duration)
  console.log(
    '[chromaprint] fingerprint:',
    fingerprint.slice(0, 50) + '...'
  )

  return {
    duration,
    fingerprint,
  }
}

/**
 * Interroge AcoustID avec le fingerprint.
 */
async function lookupAcoustID(duration, fingerprint) {
  if (!ACOUSTID_API_KEY) {
    throw new Error(
      'ACOUSTID_API_KEY est manquante dans backend/.env'
    )
  }

  // Important :
  // on construit l'URL manuellement pour conserver les "+"
  // dans le paramètre meta exactement comme attendu par AcoustID.
  const url =
    'https://api.acoustid.org/v2/lookup' +
    `?client=${encodeURIComponent(ACOUSTID_API_KEY)}` +
    `&duration=${encodeURIComponent(duration)}` +
    `&fingerprint=${encodeURIComponent(fingerprint)}` +
    '&meta=recordings+releasegroups+compress'

  console.log('[acoustid] appel API...')

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  })

  const data = await response.json()

  console.log('[acoustid] HTTP:', response.status)
  console.log(
    '[acoustid] statut:',
    data.status
  )

  if (!response.ok || data.status !== 'ok') {
    console.error(
      '[acoustid] erreur:',
      data.error || data
    )

    throw new Error(
      data.error?.message ||
        `AcoustID a répondu ${response.status}`
    )
  }

  if (!data.results || data.results.length === 0) {
    console.log('[acoustid] aucun résultat')
    return null
  }

  // Le résultat avec le meilleur score.
  const best = [...data.results].sort(
    (a, b) => (b.score || 0) - (a.score || 0)
  )[0]

  console.log(
    '[acoustid] meilleur score:',
    best.score
  )

  console.log(
    '[acoustid] nombre de recordings:',
    best.recordings?.length || 0
  )

  if (!best.recordings || best.recordings.length === 0) {
    console.log(
      '[acoustid] aucun recording exploitable'
    )

    return null
  }

  /**
   * Plusieurs recordings peuvent être associés
   * au même fingerprint.
   *
   * On choisit celui dont la durée est la plus proche
   * de notre fichier.
   */
  const recording = [...best.recordings]
    .filter((recording) => recording.id)
    .sort((a, b) => {
      const durationA = Math.abs(
        (a.duration || duration) - duration
      )

      const durationB = Math.abs(
        (b.duration || duration) - duration
      )

      return durationA - durationB
    })[0]

  if (!recording) {
    console.log(
      '[acoustid] aucun recording sélectionné'
    )

    return null
  }

  const title = recording.title || null

  const artist =
    recording.artists?.[0]?.name || null

  const album =
    recording.releasegroups?.[0]?.title || null

  if (!title || !artist) {
    console.log(
      '[acoustid] metadata insuffisante:',
      {
        title,
        artist,
        album,
      }
    )

    return null
  }

  const result = {
    title,
    artist,
    album,
    score: best.score ?? null,
    acoustid: best.id ?? null,
    musicbrainzRecordingId:
      recording.id ?? null,
  }

  console.log(
    '[acoustid] morceau reconnu:',
    result
  )

  return result
}

/**
 * Identifie un fichier audio.
 *
 * Étapes :
 * 1. écrit temporairement le fichier
 * 2. génère le fingerprint avec Chromaprint
 * 3. interroge AcoustID
 * 4. retourne les informations du morceau
 */
export async function identifyTrack(
  audioBuffer,
  originalName = 'audio.mp3'
) {
  const extension =
    path.extname(originalName) || '.mp3'

  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'karaoke-acoustid-')
  )

  const tempFile = path.join(
    tempDir,
    `audio${extension}`
  )

  try {
    console.log(
      '[recognize] fichier temporaire:',
      tempFile
    )

    fs.writeFileSync(tempFile, audioBuffer)

    // 1. Chromaprint
    const {
      duration,
      fingerprint,
    } = await createFingerprint(tempFile)

    // 2. AcoustID
    const result = await lookupAcoustID(
      duration,
      fingerprint
    )

    return result
  } finally {
    // Nettoyage du fichier temporaire.
    try {
      fs.rmSync(tempDir, {
        recursive: true,
        force: true,
      })
    } catch (error) {
      console.error(
        '[recognize] impossible de nettoyer le fichier temporaire:',
        error
      )
    }
  }
}