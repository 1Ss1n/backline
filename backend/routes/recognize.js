import { Router } from 'express'
import multer from 'multer'
import { identifyTrack } from '../services/acoustid.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
})

const router = Router()

router.post('/', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      error: 'Aucun fichier reçu.',
    })
  }

  try {
    const result = await identifyTrack(
      req.file.buffer,
      req.file.originalname
    )

    if (!result) {
      return res.status(404).json({
        error: 'Morceau non reconnu.',
      })
    }

    res.json(result)
  } catch (err) {
    console.error('[recognize] échec:', err)

    res.status(502).json({
      error: "L'identification du morceau a échoué.",
    })
  }
})

export default router