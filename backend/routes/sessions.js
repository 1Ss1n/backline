import { Router } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { clearSessions, getSession, listSessions, updateSession } from '../services/sessionStore.js'
import { findArtwork } from '../services/artwork.js'

const router = Router()
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const stemsDir = path.join(__dirname, '..', 'storage', 'stems')

router.get('/', async (_req, res) => {
  try {
    const sessions = listSessions()
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
  if (!session) return res.status(404).json({ error: 'Session introuvable.' })
  res.json(session)
})

router.patch('/:id', async (req, res) => {
  try {
    const { title, artist, lyricsLines, coverUrl } = req.body || {}
    const changes = {}
    if (typeof title === 'string') changes.title = title
    if (typeof artist === 'string') changes.artist = artist
    if (Array.isArray(lyricsLines)) changes.lyricsLines = lyricsLines
    if (typeof coverUrl === 'string') changes.coverUrl = coverUrl
    if (typeof title === 'string' || typeof artist === 'string') {
      const current = getSession(req.params.id)
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
    if (fs.existsSync(stemsDir)) {
      for (const name of fs.readdirSync(stemsDir)) {
        const file = path.join(stemsDir, name)
        if (fs.statSync(file).isFile()) fs.unlinkSync(file)
      }
    }
    clearSessions()
    res.status(204).end()
  } catch (error) {
    console.error('[sessions] nettoyage impossible:', error)
    res.status(500).json({ error: 'Impossible de nettoyer les morceaux.' })
  }
})

export default router
