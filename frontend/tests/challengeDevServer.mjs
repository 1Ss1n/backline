// Isolated fixtures only: no real credentials, songs or accounts are read.
import express from '../../backend/node_modules/express/index.js'
import { createServer } from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createServer as createVite } from 'vite'
import { ChallengeStore } from '../../backend/services/challengeStore.js'
import { createChallengeServer } from '../../backend/routes/challenges.js'
import { createPhoneMicServer } from '../../backend/services/phoneMicServer.js'
import { phoneMicConfig } from '../../backend/services/phoneMicConfig.js'
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'backline-duel-browser-'))
const users = Object.fromEntries(['a','b','c'].map(id => [id, { id, username: id, displayName: `Joueur ${id.toUpperCase()}`, verified: true }]))
const userFor = req => users[(req.headers.cookie || '').match(/backline_session=([abc])(?:;|$)/)?.[1]]
const rate = 8000, samples = rate * 5, audio = Buffer.alloc(44 + samples * 2)
audio.write('RIFF'); audio.writeUInt32LE(36 + samples * 2, 4); audio.write('WAVEfmt ', 8); audio.writeUInt32LE(16, 16)
audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22); audio.writeUInt32LE(rate, 24); audio.writeUInt32LE(rate * 2, 28)
audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34); audio.write('data', 36); audio.writeUInt32LE(samples * 2, 40)
fs.writeFileSync(path.join(root, 'test.wav'), audio)
const sessions = Object.fromEntries(['a','b','c'].map(id => [id, { id: `${id}-song`, ownerId: id, title: `Morceau ${id.toUpperCase()}`, artist: 'Test', createdAt: new Date().toISOString(), stems: { vocalUrl: '/stems/test.wav', instruUrl: '/stems/test.wav' }, lyricsLines: [{ start: 0, end: 5, text: 'Chantons ensemble' }], perfectPitch: { rawNotes: [{ start: .5, end: 1.5, midi: 60 }, { start: 2, end: 3.5, midi: 64 }] } }]))
const config = phoneMicConfig({ FRONTEND_URL: 'http://127.0.0.1:4196' })
const store = new ChallengeStore({ directory: path.join(root, 'challenges'), stemsDirectory: root, getSession: id => Object.values(sessions).find(s => s.id === id), getUser: id => users[id], areFriends: (a,b) => a !== b && [a,b].every(id => ['a','b'].includes(id)) })
const challenges = createChallengeServer({ store, config, getSessionUser: token => users[token] })
const phone = createPhoneMicServer({ config, getSessionUser: token => users[token] })
const app = express(); app.use(express.json()); app.use('/api/phone-mic', phone.router)
app.get('/api/auth/me', (req,res) => res.json({ user: userFor(req) || null }))
app.use((req,res,next) => { req.user = userFor(req); if (!req.user) return res.sendStatus(401); next() })
app.use('/api/challenges', challenges.router)
app.get('/api/sessions', (req,res) => res.json([sessions[req.user.id]]))
app.get('/api/friends', (req,res) => res.json({ friends: [users[req.user.id === 'a' ? 'b' : 'a']] }))
app.get('/api/friends/requests', (_req,res) => res.json({ requests: [] }))
const server = createServer(app); phone.attach(server); challenges.attach(server); server.listen(4197, '127.0.0.1')
const target = 'http://127.0.0.1:4197'
const vite = await createVite({ server: { host: '127.0.0.1', port: 4196, strictPort: true, proxy: { '/api': target, '/api/challenges/socket': { target, ws: true }, '/api/phone-mic/socket': { target, ws: true }, '/api/phone-mic': target } } })
await vite.listen()
const close = async () => { challenges.close(); phone.close(); server.close(); await vite.close(); fs.rmSync(root, { recursive: true, force: true }); process.exit(0) }
process.on('SIGTERM', close); process.on('SIGINT', close)
