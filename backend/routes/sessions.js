import { Router } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { clearSessions, getSession, listSessions, updateSession } from '../services/sessionStore.js'
import { findArtwork } from '../services/artwork.js'

const router = Router()
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const stemsDir = path.join(__dirname, '..', 'storage', 'stems')
const performancesDir = path.join(__dirname, '..', 'storage', 'performances')

router.get('/', async (req, res) => {
  try {
    const sessions = listSessions(req.user.id)
    const hydrated = await Promise.all(sessions.map(async (session) => {
      if (session.coverUrl) return session
      const coverUrl = await findArtwork(session.title, session.artist)
      return coverUrl ? updateSession(session.id, { coverUrl }) : session
    }))
    res.json(hydrated)
  } catch (error) {
    console.error('[sessions] lecture impossible:', error)
    res.status(500).json({ error: 'Impossible de lire les morceaux.' })
  }
})

router.get('/:id', (req, res) => {
  const session = getSession(req.params.id)
  if (!session || session.ownerId !== req.user.id) return res.status(404).json({ error: 'Session introuvable.' })
  res.json(session)
})

router.patch('/:id', async (req, res) => {
  try {
    const { title, artist, lyricsLines, coverUrl, perfectPitch, lyricsSource, lyricsSegments } = req.body || {}
    const existing = getSession(req.params.id)
    if (!existing || existing.ownerId !== req.user.id) return res.status(404).json({ error: 'Session introuvable.' })
    const changes = {}
    if (typeof title === 'string') changes.title = title
    if (typeof artist === 'string') changes.artist = artist
    if (Array.isArray(lyricsLines)) changes.lyricsLines = lyricsLines
    if (typeof coverUrl === 'string') changes.coverUrl = coverUrl
    if (lyricsSource === 'lrclib' || lyricsSource === 'whisper' || lyricsSource === 'none') changes.lyricsSource = lyricsSource
    if (Array.isArray(lyricsSegments)) changes.lyricsSegments = lyricsSegments
    if (perfectPitch && typeof perfectPitch === 'object' && Array.isArray(perfectPitch.rawNotes)) changes.perfectPitch = { rawNotes: perfectPitch.rawNotes, analyzedAt: perfectPitch.analyzedAt || new Date().toISOString() }
    if (typeof title === 'string' || typeof artist === 'string') {
      const current = existing
      if (current && !coverUrl) changes.coverUrl = await findArtwork(title || current.title, artist || current.artist)
    }
    const session = updateSession(req.params.id, changes)
    if (!session) return res.status(404).json({ error: 'Session introuvable.' })
    res.json(session)
  } catch (error) {
    console.error('[sessions] sauvegarde impossible:', error)
    res.status(500).json({ error: 'Impossible de sauvegarder la session.' })
  }
})

router.delete('/', (_req, res) => {
  try {
    const sessions = listSessions(_req.user.id)
    for (const session of sessions) {
      for (const stemUrl of Object.values(session.stems || {})) {
        const file = path.join(stemsDir, path.basename(stemUrl))
        if (fs.existsSync(file)) fs.unlinkSync(file)
      }
      for (const performance of session.performances || []) {
        const file = path.join(performancesDir, path.basename(performance.url))
        if (fs.existsSync(file)) fs.unlinkSync(file)
      }
    }
    clearSessions(_req.user.id)
    res.status(204).end()
  } catch (error) {
    console.error('[sessions] nettoyage impossible:', error)
    res.status(500).json({ error: 'Impossible de nettoyer les morceaux.' })
  }
})

export default router
