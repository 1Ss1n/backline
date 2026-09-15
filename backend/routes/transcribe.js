import { Router } from 'express'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import FormData from 'form-data'
import fetch from 'node-fetch'
import { getSession } from '../services/sessionStore.js'

const router = Router()
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const stemServiceUrl = process.env.STEM_SERVICE_URL || 'http://localhost:8000'

// The vocal stem is read server-side: it never has to travel back through React.
router.post('/:id', async (req, res) => {
  const session = getSession(req.params.id)
  if (!session || session.ownerId !== req.user.id || !session.stems?.vocalUrl) return res.status(404).json({ error: 'Session ou stem vocal introuvable.' })
  try {
    const filename = path.basename(session.stems.vocalUrl)
    const buffer = await fs.readFile(path.join(__dirname, '..', 'storage', 'stems', filename))
    const form = new FormData()
    form.append('file', buffer, { filename, contentType: 'audio/wav' })
    const response = await fetch(`${stemServiceUrl}/transcribe-vocals`, { method: 'POST', body: form, headers: form.getHeaders() })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) return res.status(502).json({ plainLyrics: '', segments: [], source: 'none' })
    res.json({ plainLyrics: payload.plainLyrics || '', segments: Array.isArray(payload.segments) ? payload.segments : [], source: payload.source === 'whisper' ? 'whisper' : 'none' })
  } catch (error) {
    console.error('[whisper] transcription impossible:', error.message)
    res.json({ plainLyrics: '', segments: [], source: 'none' })
  }
})

export default router
