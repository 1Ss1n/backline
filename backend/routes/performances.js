import { Router } from 'express'
import multer from 'multer'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getSession, updateSession } from '../services/sessionStore.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const performancesDir = path.join(__dirname, '..', 'storage', 'performances')
fs.mkdirSync(performancesDir, { recursive: true })

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } })
const router = Router()

router.post('/', upload.single('recording'), (req, res) => {
  try {
    const { sessionId } = req.body
    if (!req.file || !sessionId) return res.status(400).json({ error: 'Enregistrement ou session manquant.' })
    const session = getSession(sessionId)
    if (!session || session.ownerId !== req.user.id) return res.status(404).json({ error: 'Session introuvable.' })

    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
    const extension = req.file.mimetype.includes('mp4') ? 'm4a' : 'webm'
    const filename = `${sessionId}-${id}.${extension}`
    fs.writeFileSync(path.join(performancesDir, filename), req.file.buffer)
    // Store the owner on the recording as well as on its session. This gives
    // the file a durable ownership record even if session data is inspected
    // or migrated later.
    const performance = { id, ownerId: req.user.id, url: `/performances/${filename}`, createdAt: new Date().toISOString() }
    updateSession(sessionId, { performances: [...(session.performances || []), performance] })
    res.status(201).json(performance)
  } catch (error) {
    console.error('[performances] sauvegarde impossible:', error)
    res.status(500).json({ error: "Impossible d'enregistrer la performance." })
  }
})

export default router
