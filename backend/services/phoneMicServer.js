import { Router } from 'express'
import { WebSocketServer, WebSocket } from 'ws'
import { AttemptLimiter, PhoneMicStore } from './phoneMicStore.js'

const send = (socket, message) => { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)) }
const sessionCookie = req => (req.headers.cookie || '').split(';').map(item => item.trim()).find(item => item.startsWith('backline_session='))?.slice(17)
const other = role => role === 'host' ? 'phone' : 'host'

// Audio never enters this server. Only bounded, validated signaling messages.
export function createPhoneMicServer({ config, getSessionUser }) {
  const limiter = new AttemptLimiter()
  const store = new PhoneMicStore(config, { onEnd(item, reason) {
    for (const role of ['host', 'phone']) { send(item[role], { type: 'ended', reason }); item[role]?.close(1000) }
  } })
  const router = Router()
  const wss = new WebSocketServer({ noServer: true, maxPayload: 65536, perMessageDeflate: false })
  const allowed = req => config.origins.has(req.headers.origin)
  const userFor = req => getSessionUser(sessionCookie(req))
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next() })
  router.post('/pairings', (req, res) => {
    if (!allowed(req)) return res.status(403).json({ error: 'Origine non autorisée pour le micro téléphone. Vérifiez PHONE_MIC_PUBLIC_URL.' })
    const user = userFor(req)
    if (!user?.verified) return res.status(401).json({ error: 'Authentification requise.' })
    if (!limiter.take(`create:${user.id}`, 10, 600000)) return res.status(429).json({ error: 'Trop de QR créés. Réessayez dans quelques minutes.' })
    try {
      const pairing = store.create(user.id, req.headers.origin)
      res.status(201).json({ ...pairing, url: `${req.headers.origin}/mic#token=${pairing.token}` })
    } catch { res.status(503).json({ error: 'Service micro temporairement indisponible.' }) }
  })
  router.delete('/pairings/:id', (req, res) => {
    if (!allowed(req)) return res.sendStatus(403)
    const user = userFor(req)
    if (!user?.verified) return res.sendStatus(401)
    const item = store.sessions.get(req.params.id)
    if (item?.ownerId === user.id && item.origin === req.headers.origin) store.end(item.id)
    res.sendStatus(204)
  })
  function rtc(item) { return { iceServers: config.iceServers(item.id), iceTransportPolicy: config.relayOnly ? 'relay' : 'all' } }
  function notifyState(item) {
    if (item.state === 'pending') { send(item.host, { type: 'request' }); send(item.phone, { type: 'pending' }) }
    if (item.state === 'approved' && item.host && item.phone) {
      send(item.phone, { type: 'approved', rtc: rtc(item) })
      send(item.phone, { type: 'recording', value: !!item.recording })
      send(item.host, { type: 'approved', rtc: rtc(item), muted: item.muted })
    }
  }
  wss.on('connection', (socket, req) => {
    const ip = req.socket.remoteAddress || 'unknown'
    let item, role, alive = true, count = 0, windowStart = Date.now()
    const authTimer = setTimeout(() => socket.close(1008), 10000)
    socket.on('pong', () => { alive = true })
    socket.on('error', () => {})
    socket.on('message', (raw, binary) => {
      try {
        if (binary) throw new Error('invalid')
        if (Date.now() - windowStart > 10000) { windowStart = Date.now(); count = 0 }
        if (++count > 250) throw new Error('rate_limited')
        const msg = JSON.parse(raw.toString())
        if (!msg || typeof msg !== 'object' || Array.isArray(msg)) throw new Error('invalid')
        if (!item) {
          if (!limiter.take(`join:${ip}`, 30, 60000)) throw new Error('rate_limited')
          if (msg.type === 'host') {
            const user = userFor(req)
            if (!user?.verified) throw new Error('unauthorized')
            item = store.host(msg.id, msg.token, user.id, req.headers.origin); role = 'host'
          } else if (msg.type === 'join') {
            if (msg.code && !limiter.take(`code:${ip}`, 5, 60000)) throw new Error('rate_limited')
            const joined = store.join(msg, req.headers.origin)
            item = joined.item; role = 'phone'
            store.attach(item, role, socket)
            send(socket, { type: 'joined', id: item.id, resumeToken: joined.resumeToken })
          } else if (msg.type === 'resume') { item = store.resume(msg.id, msg.token, req.headers.origin); role = 'phone' }
          else throw new Error('invalid')
          if (msg.type !== 'join') store.attach(item, role, socket)
          clearTimeout(authTimer)
          send(socket, { type: 'ready', state: item.state, expiresAt: item.expiresAt })
          notifyState(item)
          return
        }
        store.get(item.id)
        if (item[role] !== socket) throw new Error('invalid')
        if (role === 'host' && !userFor(req)?.verified) { store.end(item.id, 'ended'); return }
        if (msg.type === 'end') { store.end(item.id); return }
        if (msg.type === 'approve' && role === 'host') { store.approve(item); notifyState(item); return }
        if (msg.type === 'refuse' && role === 'host') { store.end(item.id, 'refused'); return }
        if (msg.type === 'muted' && role === 'phone' && typeof msg.value === 'boolean') {
          item.muted = msg.value; send(item.host, { type: 'muted', value: msg.value }); return
        }
        if (item.state !== 'approved') throw new Error('invalid_state')
        if (msg.type === 'recording' && role === 'host' && typeof msg.value === 'boolean') {
          item.recording = msg.value; send(item.phone, { type: 'recording', value: msg.value }); return
        }
        if (msg.type === 'restart') { send(item.host, { type: 'restart' }); return }
        if (msg.type === 'offer' && role === 'host' || msg.type === 'answer' && role === 'phone') {
          if (typeof msg.sdp !== 'string' || msg.sdp.length > 60000 || !msg.sdp.startsWith('v=0') || /m=video/.test(msg.sdp)) throw new Error('invalid')
          send(item[other(role)], { type: msg.type, sdp: msg.sdp }); return
        }
        if (msg.type === 'ice') {
          const candidate = msg.candidate
          if (!candidate || typeof candidate.candidate !== 'string' || candidate.candidate.length > 4096 ||
            candidate.sdpMid != null && typeof candidate.sdpMid !== 'string' ||
            candidate.sdpMLineIndex != null && !Number.isInteger(candidate.sdpMLineIndex)) throw new Error('invalid')
          send(item[other(role)], { type: 'ice', candidate: { candidate: candidate.candidate, sdpMid: candidate.sdpMid, sdpMLineIndex: candidate.sdpMLineIndex, usernameFragment: typeof candidate.usernameFragment === 'string' ? candidate.usernameFragment.slice(0, 256) : undefined } }); return
        }
        throw new Error('invalid')
      } catch (error) {
        const codes = ['expired', 'used', 'rate_limited', 'unauthorized', 'invalid_state']
        send(socket, { type: 'error', code: codes.includes(error.code || error.message) ? error.code || error.message : 'invalid' })
        socket.close(1008)
      }
    })
    socket.on('close', () => {
      clearTimeout(authTimer)
      if (item?.[role] === socket) { store.detach(item, role, socket); send(item[other(role)], { type: 'peer-offline' }) }
    })
    socket.checkAlive = () => {
      if (role === 'host' && !userFor(req)?.verified) { store.end(item.id); return }
      if (!alive) { socket.terminate(); return }
      alive = false; socket.ping()
    }
  })
  const heartbeat = setInterval(() => { store.sweep(); for (const socket of wss.clients) socket.checkAlive?.() }, 10000)
  heartbeat.unref()
  function attach(server) {
    server.on('upgrade', (req, socket, head) => {
      if (req.url === '/api/challenges/socket') return
      if (req.url !== '/api/phone-mic/socket' || !allowed(req) || wss.clients.size >= 500 ||
        !limiter.take(`upgrade:${req.socket.remoteAddress}`, 60, 60000)) {
        socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return
      }
      wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req))
    })
  }
  function close() { clearInterval(heartbeat); store.close(); for (const ws of wss.clients) ws.terminate(); wss.close() }
  return { router, attach, close, store }
}
