import { Router } from 'express'
import multer from 'multer'
import FormData from 'form-data'
import fetch from 'node-fetch'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireUser } from './auth.js'
import { getSession } from '../services/sessionStore.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 }, fileFilter: (_req, file, done) => done(null, file.mimetype.startsWith('audio/') || /\.(mp3|wav)$/i.test(file.originalname)) })
const stemServiceUrl = process.env.STEM_SERVICE_URL || 'http://localhost:8000'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function analyzeBuffer(buffer, filename, mimeType = 'audio/wav') {
  const form = new FormData()
  form.append('file', buffer, { filename, contentType: mimeType })
  const response = await fetch(`${stemServiceUrl}/analyze-vocals`, { method: 'POST', body: form, headers: form.getHeaders() })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload.detail || 'Le service Perfect Pitch est indisponible.')
    error.status = response.status === 400 ? 400 : 502
    throw error
  }
  return payload
}

// Isolated /pitch-test prototype: retained for small source files.
router.post('/analyze', upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Un fichier MP3 ou WAV est requis.' })
  try {
    res.json(await analyzeBuffer(req.file.buffer, req.file.originalname, req.file.mimetype))
  } catch (error) {
    console.error('[pitch-test] analyse impossible:', error.message)
    res.status(error.status || 502).json({ error: error.message || 'Impossible de joindre le service Python.' })
  }
})

// Main karaoke flow: the server reads the current user's vocal stem directly.
// This avoids uploading a large Spleeter WAV from the browser and its 25 MB limit.
router.post('/analyze-session/:id', requireUser, async (req, res) => {
  const session = getSession(req.params.id)
  if (!session || session.ownerId !== req.user.id || !session.stems?.vocalUrl) return res.status(404).json({ error: 'Session ou stem vocal introuvable.' })
  try {
    const filename = path.basename(session.stems.vocalUrl)
    const buffer = await fs.readFile(path.join(__dirname, '..', 'storage', 'stems', filename))
    res.json(await analyzeBuffer(buffer, filename))
  } catch (error) {
    console.error('[pitch-test] analyse de session impossible:', error.message)
    res.status(error.status || 502).json({ error: error.message || 'Perfect Pitch indisponible pour ce morceau.' })
  }
})

export default router
