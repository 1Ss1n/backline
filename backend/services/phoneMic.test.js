import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import express from 'express'
import WebSocket from 'ws'
import { phoneMicConfig } from './phoneMicConfig.js'
import { AttemptLimiter, PhoneMicStore } from './phoneMicStore.js'
import { createPhoneMicServer } from './phoneMicServer.js'

const origin = 'http://localhost:5173'
const config = phoneMicConfig({ FRONTEND_URL: origin })
function storeFixture() {
  let now = 1000
  const ended = []
  const store = new PhoneMicStore(config, { now: () => now, onEnd: (item, reason) => ended.push({ id: item.id, reason }) })
  const pair = store.create('alice', origin)
  const item = store.host(pair.id, pair.hostToken, 'alice', origin)
  const host = {}; store.attach(item, 'host', host)
  return { store, pair, item, host, ended, advance: ms => { now += ms } }
}
test('pairing uses distinct 256-bit secrets; no clear tokens retained', () => {
  const { store, pair, item } = storeFixture()
  assert.match(pair.token, /^[\w-]{43}$/); assert.match(pair.code, /^\d{6}$/)
  assert.notEqual(pair.token, pair.hostToken); assert.notEqual(pair.token, pair.id)
  assert.equal(JSON.stringify(item).includes(pair.token), false)
  const other = store.create('bob', origin); assert.notEqual(other.token, pair.token); assert.notEqual(other.code, pair.code)
})
test('expiry and cleanup invalidate all credentials', () => {
  const { store, pair, advance, ended } = storeFixture()
  advance(config.pairingMs + 1); store.sweep()
  assert.throws(() => store.get(pair.id)); assert.equal(store.sessions.size, 0); assert.equal(ended[0].reason, 'expired')
})
test('token is single use even while approval is pending', () => {
  const { store, pair, item } = storeFixture()
  const joined = store.join({ token: pair.token }, origin)
  assert.equal(item.state, 'pending'); assert.throws(() => store.join({ token: pair.token }, origin))
  assert.throws(() => store.join({ code: pair.code }, origin))
  store.attach(item, 'phone', {}); store.approve(item)
  assert.equal(item.state, 'approved'); assert.equal(store.resume(pair.id, joined.resumeToken, origin), item)
})
test('manual code joins only a live waiting session', () => {
  const { store, pair } = storeFixture()
  assert.throws(() => store.join({ code: '111' }, origin))
  assert.equal(store.join({ code: pair.code }, origin).item.state, 'pending')
})
test('invalid token, other account, origin and session cannot impersonate a participant', () => {
  const { store, pair } = storeFixture()
  assert.throws(() => store.join({ token: 'x'.repeat(43) }, origin))
  assert.throws(() => store.host(pair.id, pair.hostToken, 'bob', origin))
  assert.throws(() => store.host(pair.id, pair.token, 'alice', origin))
  assert.throws(() => store.host(pair.id, pair.hostToken, 'alice', 'https://evil.test'))
  assert.throws(() => store.resume(pair.id, pair.token, origin))
})
test('refusal / new QR invalidates previous association', () => {
  const { store, pair, ended } = storeFixture()
  store.join({ token: pair.token }, origin); store.end(pair.id, 'refused')
  assert.equal(ended[0].reason, 'refused'); assert.throws(() => store.get(pair.id))
  const one = store.create('alice', origin); store.create('alice', origin)
  assert.throws(() => store.get(one.id))
})
test('reconnect requires resume secret and only after the old socket is gone', () => {
  const { store, pair, item, advance } = storeFixture()
  const { resumeToken } = store.join({ token: pair.token }, origin)
  const phone = {}; store.attach(item, 'phone', phone); store.approve(item)
  assert.throws(() => store.attach(item, 'phone', {}))
  store.detach(item, 'phone', phone); advance(1000)
  const restored = store.resume(pair.id, resumeToken, origin); store.attach(restored, 'phone', phone)
  assert.equal(restored.state, 'approved')
  store.detach(item, 'phone', phone); advance(config.reconnectMs + 1); store.sweep()
  assert.throws(() => store.resume(pair.id, resumeToken, origin))
})
test('sessions are isolated and close releases all associations', () => {
  const { store, pair } = storeFixture()
  const other = store.create('bob', origin)
  store.end(pair.id); assert.ok(store.get(other.id)); store.close(); assert.equal(store.sessions.size, 0)
})
test('manual attempt limits reset after the time window, never grow unbounded', () => {
  let now = 0; const limiter = new AttemptLimiter({ now: () => now, capacity: 2 })
  for (let i = 0; i < 5; i++) assert.equal(limiter.take('ip', 5, 60000), true)
  assert.equal(limiter.take('ip', 5, 60000), false)
  limiter.take('other', 5, 60000); assert.equal(limiter.take('third', 5, 60000), false)
  now = 60001; assert.equal(limiter.take('ip', 5, 60000), true)
})
test('production requires HTTPS; TURN exposes only expiring derived credentials', () => {
  assert.throws(() => phoneMicConfig({ NODE_ENV: 'production', FRONTEND_URL: origin }))
  const cfg = phoneMicConfig({ FRONTEND_URL: 'https://backline.test', WEBRTC_TURN_URLS: 'turn:relay.test:3478', WEBRTC_TURN_SECRET: 'test-only-secret' })
  const ice = cfg.iceServers('session')
  assert.equal(ice.length, 1); assert.notEqual(ice[0].credential, 'test-only-secret')
  assert.ok(Number(ice[0].username.split(':')[0]) > Date.now() / 1000)
  assert.equal(phoneMicConfig({}).iceServers('session').length, 0)
})

function inbox(socket) {
  const messages = [], waiters = []
  socket.on('message', data => {
    const msg = JSON.parse(data.toString()), index = waiters.findIndex(item => item.type === msg.type)
    if (index >= 0) { const item = waiters.splice(index, 1)[0]; clearTimeout(item.timer); item.resolve(msg) } else messages.push(msg)
  })
  return type => {
    const index = messages.findIndex(item => item.type === type)
    if (index >= 0) return Promise.resolve(messages.splice(index, 1)[0])
    return new Promise((resolve, reject) => { const item = { type, resolve, timer: setTimeout(() => reject(new Error(`Missing ${type}`)), 2500) }; waiters.push(item) })
  }
}
test('real signaling: auth/origin, approval, roles, audio-free relay, mute, single use, reconnect and end', async t => {
  const app = express(); app.use(express.json())
  const service = createPhoneMicServer({ config, getSessionUser: token => token === 'host-test' ? { id: 'alice', verified: true } : null })
  app.use('/api/phone-mic', service.router)
  const server = createServer(app); service.attach(server); server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}`
  const clients = []
  t.after(() => { clients.forEach(socket => socket.terminate()); service.close(); server.closeAllConnections(); server.close() })
  const create = (headers = {}) => fetch(`${base}/api/phone-mic/pairings`, { method: 'POST', headers: { Origin: origin, ...headers } })
  assert.equal((await create()).status, 401)
  assert.equal((await create({ Origin: 'https://evil.test', Cookie: 'backline_session=host-test' })).status, 403)
  const pair = await (await create({ Cookie: 'backline_session=host-test' })).json()
  async function socket(message, cookie) {
    const ws = new WebSocket(base.replace('http:', 'ws:') + '/api/phone-mic/socket', { origin, headers: cookie ? { Cookie: cookie } : {} })
    clients.push(ws); const receive = inbox(ws); await once(ws, 'open'); ws.send(JSON.stringify(message)); return { ws, receive }
  }
  const forbidden = await socket({ type: 'host', id: pair.id, token: pair.hostToken })
  assert.equal((await forbidden.receive('error')).code, 'unauthorized')
  const host = await socket({ type: 'host', id: pair.id, token: pair.hostToken }, 'backline_session=host-test')
  await host.receive('ready')
  const phone = await socket({ type: 'join', token: pair.token })
  const joined = await phone.receive('joined'); await host.receive('request'); await phone.receive('pending')
  const second = await socket({ type: 'join', token: pair.token }); assert.equal((await second.receive('error')).code, 'invalid')
  phone.ws.send(JSON.stringify({ type: 'muted', value: true })); assert.equal((await host.receive('muted')).value, true)
  host.ws.send(JSON.stringify({ type: 'approve' })); await host.receive('approved'); await phone.receive('approved')
  assert.equal((await phone.receive('recording')).value, false)
  host.ws.send(JSON.stringify({ type: 'recording', value: true }))
  assert.equal((await phone.receive('recording')).value, true)
  host.ws.send(JSON.stringify({ type: 'offer', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n' }))
  assert.ok((await phone.receive('offer')).sdp.includes('m=audio'))
  phone.ws.close(); await host.receive('peer-offline')
  const resumed = await socket({ type: 'resume', id: joined.id, token: joined.resumeToken })
  await resumed.receive('approved'); await host.receive('approved')
  assert.equal((await resumed.receive('recording')).value, true)
  assert.equal((await create({ Cookie: `backline_session=${joined.resumeToken}` })).status, 401)
  host.ws.send(JSON.stringify({ type: 'end' })); await resumed.receive('ended'); assert.equal(service.store.sessions.size, 0)
})
