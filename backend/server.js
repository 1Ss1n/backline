import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import separateRouter from './routes/separate.js'
import recognizeRouter from './routes/recognize.js'
import lyricsRouter from './routes/lyrics.js'
import sessionsRouter from './routes/sessions.js'
import performancesRouter from './routes/performances.js'
import authRouter, { requireUser } from './routes/auth.js'
import friendsRouter from './routes/friends.js'
import usersRouter from './routes/users.js'
import pitchTestRouter from './routes/pitchTest.js'
import transcribeRouter from './routes/transcribe.js'
import separationLabRouter from './routes/separationLab.js'
import lyricsEditorRouter from './routes/lyricsEditor.js'
import { findSessionByAssetUrl } from './services/sessionStore.js'
import { backfillUsernames, ensureAdmin, getSessionUser } from './services/authStore.js'
import { phoneMicConfig } from './services/phoneMicConfig.js'
import { createPhoneMicServer } from './services/phoneMicServer.js'
import { areFriends } from './services/friendStore.js'
import { ChallengeStore } from './services/challengeStore.js'
import { createChallengeServer } from './routes/challenges.js'
import { getSession } from './services/sessionStore.js'
import { findUserById } from './services/authStore.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 4000

const app = express()
app.use(helmet({ crossOriginResourcePolicy: false }))
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }))
app.use(express.json({ limit: '1mb' }))
const phoneMic = createPhoneMicServer({ config: phoneMicConfig(), getSessionUser })
app.use('/api/phone-mic', phoneMic.router)
const challengeRtcConfig = phoneMicConfig()
// The social API also works on the normal frontend when Phone Micro uses a tunnel.
challengeRtcConfig.origins.add(new URL(process.env.FRONTEND_URL || 'http://localhost:5173').origin)
const challenges = createChallengeServer({ config: challengeRtcConfig, getSessionUser, store: new ChallengeStore({
  directory: path.join(__dirname, 'storage', 'challenges'), stemsDirectory: path.join(__dirname, 'storage', 'stems'),
  getSession, getUser: findUserById, areFriends,
  expiryMs: Math.max(1, Number(process.env.CHALLENGE_EXPIRY_DAYS) || 7) * 86400000,
}) })
app.use('/api/challenges', requireUser, challenges.router)
app.use('/api/auth', authRouter)
// Experimental and intentionally isolated from the main karaoke pipeline.
app.use('/api/pitch-test', pitchTestRouter)
app.use('/api/transcribe', requireUser, transcribeRouter)
app.use('/api/friends', requireUser, friendsRouter)
app.use('/api/users', requireUser, usersRouter)
app.use('/api/separation-lab', requireUser, separationLabRouter)
app.use('/api/sessions', requireUser, lyricsEditorRouter)


// Sert les stems séparés (fichiers wav/mp3 générés) de façon statique
app.get('/stems/:file', requireUser, (req, res) => {
  if (path.basename(req.params.file) !== req.params.file) return res.sendStatus(400)
  const assetUrl = `/stems/${req.params.file}`
  const session = findSessionByAssetUrl(assetUrl)
  const canPlaySharedInstru = session && areFriends(req.user.id, session.ownerId) && session.stems?.instruUrl === assetUrl && (session.performances || []).some((performance) => performance.sharedAt)
  if (!session || (session.ownerId !== req.user.id && !canPlaySharedInstru)) return res.sendStatus(404)
  res.sendFile(path.join(__dirname, 'storage', 'stems', req.params.file))
})
app.get('/performances/:file', requireUser, (req, res) => {
  if (path.basename(req.params.file) !== req.params.file) return res.sendStatus(400)
  const assetUrl = `/performances/${req.params.file}`
  const session = findSessionByAssetUrl(assetUrl)
  const performance = session?.performances?.find((item) => item.url === assetUrl)
  if (!session || (session.ownerId !== req.user.id && !(performance?.sharedAt && areFriends(req.user.id, session.ownerId)))) return res.sendStatus(404)
  res.sendFile(path.join(__dirname, 'storage', 'performances', req.params.file))
})

app.use('/api/separate', requireUser, separateRouter)
app.use('/api/recognize', requireUser, recognizeRouter)
app.use('/api/lyrics', requireUser, lyricsRouter)
app.use('/api/sessions', requireUser, sessionsRouter)
app.use('/api/performances', requireUser, performancesRouter)

app.get('/api/health', (_req, res) => res.json({ ok: true }))

await ensureAdmin({ username: process.env.ADMIN_USERNAME || 'admin', password: process.env.ADMIN_PASSWORD || '07052003' })
backfillUsernames()

const server = app.listen(PORT, () => {
  console.log(`Backend karaoké lancé sur http://localhost:${PORT}`)
})
phoneMic.attach(server)
challenges.attach(server)
