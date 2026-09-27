import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ChallengeStore, SCORING_VERSION } from './challengeStore.js'
import express from 'express'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { WebSocket } from 'ws'
import { createChallengeServer } from '../routes/challenges.js'
import { phoneMicConfig } from './phoneMicConfig.js'

function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'backline-challenge-test-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const stemsDirectory = path.join(root, 'stems'); fs.mkdirSync(stemsDirectory)
  fs.writeFileSync(path.join(stemsDirectory, 'test.wav'), 'fixture-audio')
  const sessions = Object.fromEntries(['a', 'b', 'c'].map(ownerId => [ownerId, { ownerId, id: ownerId, title: `Song ${ownerId}`, artist: 'Test', stems: { vocalUrl: '/stems/test.wav', instruUrl: '/stems/test.wav' }, lyricsLines: [{ start: 0, text: 'original' }], perfectPitch: { rawNotes: [{ start: 0, end: 3, midi: 60 }, { start: 4, end: 6, midi: 64 }] } }]))
  let time = 1000000, friends = true
  const store = new ChallengeStore({ directory: path.join(root, 'challenges'), stemsDirectory, getSession: id => sessions[id], getUser: id => ['a','b','c'].includes(id) ? { id, verified: true, displayName: id } : null, areFriends: (a, b) => friends && [a, b].every(id => ['a','b'].includes(id)), now: () => time, ...options })
  const create = () => store.create('a', { opponentId: 'b', trackId: 'a' })
  const submit = (id, userId, score = { perfect: 1, great: 1, good: 0, ok: 0, miss: 0, maxCombo: 2 }) => {
    const attempt = store.start(id, userId); time += 7000
    return store.submit(id, userId, { attemptId: attempt.id, duration: 7, scoringVersion: SCORING_VERSION, score }, { mimetype: 'audio/webm', buffer: Buffer.from('audio') })
  }
  return { store, create, submit, sessions, advance: n => { time += n }, unfriend: () => { friends = false }, stemsDirectory }
}
test('creation enforces friendship, self, ownership and duplicate idempotence', t => {
  const { store, create } = fixture(t)
  assert.throws(() => store.create('a', { opponentId: 'a', trackId: 'a' }), /amis/)
  assert.throws(() => store.create('a', { opponentId: 'c', trackId: 'a' }), /amis/)
  assert.throws(() => store.create('a', { opponentId: 'b', trackId: 'b' }), /introuvable/)
  assert.throws(() => store.create('a', { opponentId: 'b', trackId: '../a' }), /invalide/)
  const item = create(); assert.equal(create().id, item.id)
  assert.equal(store.list('c').length, 0); assert.throws(() => store.access(item.id, 'c'), /introuvable/)
  assert.throws(() => store.respond(item.id, 'a', 'accept'), /autorisée/)
  assert.equal(store.respond(item.id, 'b', 'accept').status, 'ACCEPTED')
  assert.deepEqual(store.ready(item.id, 'b').readyUserIds, ['b'])
  assert.throws(() => store.ready(item.id, 'c'), /introuvable/)
})
test('snapshot survives edited lyrics/reference and library audio deletion', t => {
  const { store, create, sessions, stemsDirectory } = fixture(t)
  const item = create(); store.respond(item.id, 'b', 'accept')
  sessions.a.lyricsLines[0].text = 'changed'; sessions.a.perfectPitch.rawNotes = []
  fs.unlinkSync(path.join(stemsDirectory, 'test.wav'))
  assert.equal(store.session(item.id, 'b').lyricsLines[0].text, 'original')
  assert.equal(store.session(item.id, 'b').perfectPitch.rawNotes.length, 2)
  assert.equal(fs.readFileSync(store.stem(item.id, 'b', 'vocal'), 'utf8'), 'fixture-audio')
  assert.throws(() => store.stem(item.id, 'c', 'vocal'), /introuvable/)
})
test('decline, cancel, expiry and illegal transitions', t => {
  const { store, create, advance } = fixture(t, { expiryMs: 100 })
  let item = create(); assert.equal(store.respond(item.id, 'b', 'decline').status, 'DECLINED')
  assert.throws(() => store.respond(item.id, 'b', 'accept'), /Transition/)
  item = create(); assert.throws(() => store.respond(item.id, 'b', 'cancel'), /autorisée/)
  assert.equal(store.respond(item.id, 'a', 'cancel').status, 'CANCELLED')
  item = create(); advance(101); assert.equal(store.access(item.id, 'a').status, 'EXPIRED')
  assert.throws(() => store.respond(item.id, 'b', 'accept'), /Transition/)
})
test('independent performances, hidden opponent, private audio, atomic completion and retry', t => {
  const { store, create, submit } = fixture(t)
  const item = create(); store.respond(item.id, 'b', 'accept')
  const a = submit(item.id, 'a')
  assert.equal(a.scoreValue, 92500)
  assert.deepEqual(store.view(store.access(item.id, 'b'), 'b').performances.a, { submitted: true })
  assert.throws(() => store.audio(item.id, 'b', a.id), /introuvable/)
  assert.ok(fs.existsSync(store.audio(item.id, 'a', a.id)))
  const b = submit(item.id, 'b', { perfect: 0, great: 0, good: 0, ok: 0, miss: 0, maxCombo: 0 })
  assert.equal(b.score.miss, 2); assert.equal(b.scoreValue, 0)
  assert.equal(store.access(item.id, 'a').status, 'COMPLETED')
  assert.equal(store.submit(item.id, 'a', {}, null).id, a.id)
  assert.ok(fs.existsSync(store.audio(item.id, 'b', a.id)))
  assert.throws(() => store.audio(item.id, 'c', a.id), /introuvable/)
  assert.equal(store.read().find(row => row.id === item.id).performances.b.id, b.id)
})
test('invalid scores, incomplete runs, stale attempts and versions are rejected', t => {
  const { store, create, advance } = fixture(t)
  const item = create(); store.respond(item.id, 'b', 'accept')
  const old = store.start(item.id, 'a'), attempt = store.start(item.id, 'a')
  const metadata = { attemptId: attempt.id, duration: 7, scoringVersion: SCORING_VERSION, score: { perfect: 2, great: 0, good: 0, ok: 0, miss: 0, maxCombo: 2 } }
  const file = { mimetype: 'audio/webm', buffer: Buffer.from('audio') }
  assert.throws(() => store.submit(item.id, 'a', metadata, file), /complète/)
  advance(7000)
  assert.throws(() => store.submit(item.id, 'a', { ...metadata, attemptId: old.id }, file), /invalide/)
  assert.throws(() => store.submit(item.id, 'a', { ...metadata, scoringVersion: 'fake' }, file), /invalide/)
  assert.throws(() => store.submit(item.id, 'a', { ...metadata, score: { ...metadata.score, perfect: 2000 } }, file), /invalides/)
  assert.throws(() => store.submit(item.id, 'a', { ...metadata, duration: 1 }, file), /complète/)
})
test('rematch and counter-challenge preserve previous round and series, fresh performances', t => {
  const { store, create, submit, unfriend } = fixture(t)
  const first = create(); store.respond(first.id, 'b', 'accept'); submit(first.id, 'a'); submit(first.id, 'b')
  const rematch = store.create('b', { opponentId: 'a', parentChallengeId: first.id, rematch: true })
  assert.notEqual(rematch.id, first.id); assert.equal(rematch.track.id, 'a'); assert.deepEqual(rematch.performances, {})
  assert.equal(store.access(rematch.id, 'a').snapshotId, store.access(first.id, 'a').snapshotId)
  const second = store.create('b', { opponentId: 'a', parentChallengeId: first.id, trackId: 'b' })
  assert.equal(second.challengerUserId, 'b'); assert.equal(second.challengedUserId, 'a'); assert.equal(second.status, 'PENDING')
  assert.equal(second.parentChallengeId, first.id); assert.equal(second.seriesId, first.seriesId); assert.equal(second.track.id, 'b')
  assert.equal(store.create('b', { opponentId: 'a', parentChallengeId: first.id, trackId: 'b' }).id, second.id)
  assert.equal(store.access(first.id, 'a').status, 'COMPLETED')
  assert.throws(() => store.create('b', { opponentId: 'a', parentChallengeId: first.id, trackId: 'c' }), /introuvable/)
  assert.throws(() => store.create('c', { opponentId: 'a', parentChallengeId: first.id, trackId: 'c' }), /amis/)
  store.respond(second.id, 'a', 'accept'); submit(second.id, 'a'); submit(second.id, 'b')
  const third = store.create('a', { opponentId: 'b', parentChallengeId: second.id, trackId: 'a' })
  assert.equal(third.seriesId, first.seriesId); assert.deepEqual(third.performances, {})
  unfriend(); assert.throws(() => store.create('b', { opponentId: 'a', parentChallengeId: first.id, trackId: 'b' }), /amis/)
})
test('creation limit also covers rematches and counter-challenges', t => {
  const { store, create, submit } = fixture(t, { limit: 1 })
  const first = create(); store.respond(first.id, 'b', 'accept'); submit(first.id, 'a'); submit(first.id, 'b')
  assert.throws(() => store.create('a', { opponentId: 'b', parentChallengeId: first.id, rematch: true }), error => error.status === 429)
  assert.throws(() => store.create('a', { opponentId: 'b', parentChallengeId: first.id, trackId: 'a' }), error => error.status === 429)
})

test('HTTP and signaling enforce authentication, origin, participant and video-only rooms', async t => {
  const { store, create } = fixture(t)
  const item = create(); store.respond(item.id, 'b', 'accept')
  const config = phoneMicConfig({ FRONTEND_URL: 'http://localhost:5173' })
  const service = createChallengeServer({ store, config, getSessionUser: token => ['a','b','c'].includes(token) ? { id: token, verified: true } : null })
  const app = express(); app.use(express.json()); app.use((req,res,next) => { const id = req.headers.cookie?.match(/backline_session=([abc])/)[1]; if (!id) return res.sendStatus(401); req.user = { id }; next() }); app.use('/api/challenges', service.router)
  const server = createServer(app); service.attach(server); server.listen(0, '127.0.0.1'); await once(server, 'listening')
  t.after(() => { service.close(); server.closeAllConnections(); server.close() })
  const base = `http://127.0.0.1:${server.address().port}`
  assert.equal((await fetch(`${base}/api/challenges`)).status, 401)
  assert.equal((await fetch(`${base}/api/challenges/${item.id}`, { headers: { Cookie: 'backline_session=c' } })).status, 404)
  assert.equal((await fetch(`${base}/api/challenges/${item.id}/start`, { method: 'POST', headers: { Cookie: 'backline_session=a', Origin: 'https://evil.test' } })).status, 403)
  assert.notEqual((await fetch(`${base}/api/challenges/${item.id}/ready`, { method: 'POST', headers: { Cookie: 'backline_session=a', Origin: 'https://fresh-tunnel.trycloudflare.com' } })).status, 403)
  assert.equal((await fetch(`${base}/api/challenges/${item.id}/stems/vocal`, { headers: { Cookie: 'backline_session=b' } })).status, 200)
  const socket = async id => {
    const ws = new WebSocket(`${base.replace('http:', 'ws:')}/api/challenges/socket`, { headers: { Cookie: `backline_session=${id}`, Origin: 'http://localhost:5173' } })
    await once(ws, 'open'); return ws
  }
  const c = await socket('c'), forbidden = once(c, 'message'); c.send(JSON.stringify({ type: 'join', id: item.id })); assert.equal(JSON.parse((await forbidden)[0]).type, 'error')
  const a = await socket('a'), joined = once(a, 'message'); a.send(JSON.stringify({ type: 'join', id: item.id })); assert.equal(JSON.parse((await joined)[0]).type, 'joined')
  const rejectedAudio = once(a, 'message'); a.send(JSON.stringify({ type: 'offer', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n' })); assert.equal(JSON.parse((await rejectedAudio)[0]).type, 'error')
})
