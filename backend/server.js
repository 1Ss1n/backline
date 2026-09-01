import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import separateRouter from './routes/separate.js'
import recognizeRouter from './routes/recognize.js'
import lyricsRouter from './routes/lyrics.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 4000

const app = express()
app.use(cors())

// Sert les stems séparés (fichiers wav/mp3 générés) de façon statique
app.use('/stems', express.static(path.join(__dirname, 'storage', 'stems')))

app.use('/api/separate', separateRouter)
app.use('/api/recognize', recognizeRouter)
app.use('/api/lyrics', lyricsRouter)

app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.listen(PORT, () => {
  console.log(`Backend karaoké lancé sur http://localhost:${PORT}`)
})
