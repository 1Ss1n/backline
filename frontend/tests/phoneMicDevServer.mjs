// Isolated test-only server. Not imported by the application; never reads account/storage files.
import express from '../../backend/node_modules/express/index.js'
import { createServer } from 'node:http'
import { createServer as createVite } from 'vite'
import { phoneMicConfig } from '../../backend/services/phoneMicConfig.js'
import { createPhoneMicServer } from '../../backend/services/phoneMicServer.js'

const origin = 'http://127.0.0.1:4186'
const user = { id: 'phone-mic-test', verified: true, username: 'micro', displayName: 'Micro Test' }
const cookieUser = req => req.headers.cookie?.includes('backline_session=phone-mic-test-only') ? user : null
const app = express(); app.use(express.json())
const mic = createPhoneMicServer({ config: phoneMicConfig({ FRONTEND_URL: origin }), getSessionUser: token => token === 'phone-mic-test-only' ? user : null })
app.use('/api/phone-mic', mic.router)
app.get('/api/auth/me', (req, res) => res.json({ user: cookieUser(req) }))
const session = { id: 'phone-mic-test', title: 'Test micro sans fil', artist: 'Test isolé', createdAt: new Date().toISOString(), stems: { vocalUrl: '/stems/mic.wav', instruUrl: '/stems/mic.wav' }, lyricsLines: [{ start: 0, end: 60, text: 'Test du microphone téléphone' }], perfectPitch: { rawNotes: Array.from({ length: 30 }, (_, i) => ({ start: i * 2, end: i * 2 + 1.9, midi: 69 })) } }
app.get('/api/sessions', (req, res) => cookieUser(req) ? res.json([session]) : res.sendStatus(401))
app.get('/api/sessions/:id', (req, res) => cookieUser(req) ? res.json(session) : res.sendStatus(401))
app.get('/api/friends', (_req, res) => res.json({ friends: [] }))
app.get('/api/friends/requests', (_req, res) => res.json({ requests: [] }))
app.get('/api/challenges', (_req, res) => res.json([]))
const rate = 8000, samples = rate * 60, audio = Buffer.alloc(44 + samples * 2)
audio.write('RIFF'); audio.writeUInt32LE(36 + samples * 2, 4); audio.write('WAVEfmt ', 8); audio.writeUInt32LE(16, 16)
audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22); audio.writeUInt32LE(rate, 24); audio.writeUInt32LE(rate * 2, 28)
audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34); audio.write('data', 36); audio.writeUInt32LE(samples * 2, 40)
app.get('/stems/mic.wav', (req, res) => {
  if (!cookieUser(req)) return res.sendStatus(401)
  const start = Number(req.headers.range?.match(/bytes=(\d+)/)?.[1] || 0)
  res.set({ 'Content-Type': 'audio/wav', 'Accept-Ranges': 'bytes', 'Content-Length': audio.length - start })
  if (req.headers.range) res.status(206).set('Content-Range', `bytes ${start}-${audio.length - 1}/${audio.length}`)
  res.end(audio.subarray(start))
})
const server = createServer(app); mic.attach(server); server.listen(4187, '127.0.0.1')
process.env.PHONE_MIC_DEV_BACKEND = 'http://127.0.0.1:4187'
const vite = await createVite({ server: { host: '127.0.0.1', port: 4186, strictPort: true, proxy: { '/api': 'http://127.0.0.1:4187', '/stems': 'http://127.0.0.1:4187' } } })
await vite.listen()
const close = async () => { mic.close(); server.close(); await vite.close(); process.exit(0) }
process.on('SIGTERM', close); process.on('SIGINT', close)
