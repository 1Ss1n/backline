import { Router } from 'express'
import multer from 'multer'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { separateStems } from '../services/stemService.js'
import { createSession } from '../services/sessionStore.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadDir = path.join(__dirname, '..', 'storage', 'uploads')
fs.mkdirSync(uploadDir, { recursive: true })

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 Mo
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype === 'audio/mpeg' || file.originalname.toLowerCase().endsWith('.mp3')
    cb(ok ? null : new Error('Seuls les fichiers MP3 sont acceptés.'), ok)
  },
})

const router = Router()

router.post('/', upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' })

  try {
    // Délègue l'inférence au micro-service Python qui héberge Mel-Band RoFormer
    const { id, vocalUrl, instruUrl } = await separateStems(req.file.path, req.file.originalname)
    createSession({ id, stems: { vocalUrl, instruUrl }, originalName: req.file.originalname })
    res.json({ id, vocalUrl, instruUrl })
  } catch (err) {
    console.error('[separate] échec:', err)
    res.status(502).json({ error: "La séparation des pistes a échoué côté service audio." })
  } finally {
    // Le fichier original uploadé n'a plus besoin de rester ici une fois transmis
    fs.unlink(req.file.path, () => {})
  }
})

export default router
