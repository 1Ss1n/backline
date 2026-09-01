import { Router } from 'express'
import { fetchLyrics } from '../services/lrclib.js'

const router = Router()

router.get('/', async (req, res) => {
  const { title, artist } = req.query
  if (!title) return res.status(400).json({ error: 'Paramètre "title" requis.' })

  try {
    const result = await fetchLyrics({ title, artist })
    if (!result) return res.status(404).json({ error: 'Aucune parole trouvée.' })
    res.json(result)
  } catch (err) {
    console.error('[lyrics] échec:', err)
    res.status(502).json({ error: 'La récupération des paroles a échoué.' })
  }
})

export default router
