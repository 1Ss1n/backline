import { Router } from 'express'
import multer from 'multer'
import { WebSocketServer, WebSocket } from 'ws'
import { AttemptLimiter } from '../services/phoneMicStore.js'

export function createChallengeServer({ store, config, getSessionUser }) {
  const router = Router(), limiter = new AttemptLimiter()
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024, fields: 5, fieldSize: 100000 } })
  const wss = new WebSocketServer({ noServer: true, maxPayload: 65536, perMessageDeflate: false })
  const send = (ws, value) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(value)) }
  const userFor = req => getSessionUser((req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith('backline_session='))?.slice(17))
  const allowedOrigin = req => {
    if (config.origins.has(req.headers.origin)) return true
    if (config.production || typeof req.headers.origin !== 'string') return false
    try {
      const origin = new URL(req.headers.origin)
      return origin.protocol === 'https:' && origin.hostname.endsWith('.trycloudflare.com')
    } catch { return false }
  }
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store')
    if (req.method !== 'GET' && !allowedOrigin(req)) return res.status(403).json({ error: 'Origine non autorisée.' })
    next()
  })
  const route = fn => (req, res, next) => { try { fn(req, res) } catch (error) { next(error) } }
  router.get('/', route((req, res) => res.json(store.list(req.user.id))))
  router.post('/', route((req, res) => res.status(201).json(store.create(req.user.id, req.body))))
  router.get('/:id', route((req, res) => res.json(store.view(store.access(req.params.id, req.user.id), req.user.id))))
  router.get('/:id/session', route((req, res) => res.json(store.session(req.params.id, req.user.id))))
  for (const action of ['accept', 'decline', 'cancel']) router.post(`/:id/${action}`, route((req, res) => res.json(store.respond(req.params.id, req.user.id, action))))
  router.post('/:id/start', route((req, res) => {
    if (!limiter.take(`start:${req.user.id}`, 20, 600000)) return res.status(429).json({ error: 'Trop de tentatives.' })
    res.json(store.start(req.params.id, req.user.id))
  }))
  router.post('/:id/ready', route((req, res) => {
    if (!limiter.take(`ready:${req.user.id}`, 10, 60000)) return res.status(429).json({ error: 'Patientez avant de confirmer à nouveau.' })
    res.json(store.ready(req.params.id, req.user.id))
  }))
  router.post('/:id/performances', (req, res, next) => {
    try { store.access(req.params.id, req.user.id); if (!limiter.take(`upload:${req.user.id}`, 15, 600000)) return res.sendStatus(429); next() } catch (error) { next(error) }
  }, upload.single('recording'), route((req, res) => res.status(201).json(store.submit(req.params.id, req.user.id, JSON.parse(req.body.metadata || '{}'), req.file))))
  router.get('/:id/performances/:performanceId/audio', route((req, res) => res.sendFile(store.audio(req.params.id, req.user.id, req.params.performanceId))))
  router.get('/:id/stems/:kind', route((req, res) => { res.type('audio/wav'); res.sendFile(store.stem(req.params.id, req.user.id, req.params.kind)) }))
  router.use((error, req, res, next) => { if (res.headersSent) return next(error); res.status(error.status || (error instanceof SyntaxError ? 400 : 500)).json({ error: error.status ? error.message : 'Impossible de traiter le défi.' }) })

  const notify = () => { for (const ws of wss.clients) if (userFor(ws.req)?.id === ws.userId) send(ws, { type: 'challenges-changed' }) }
  store.listeners.add(notify)
  const peers = ws => [...wss.clients].filter(peer => peer !== ws && peer.room === ws.room && peer.userId !== ws.userId)
  const leave = ws => { if (ws.room) for (const peer of peers(ws)) send(peer, { type: 'peer-left' }); ws.room = null }
  wss.on('connection', (ws, req) => {
    ws.req = req; ws.userId = userFor(req).id; ws.alive = true
    ws.on('pong', () => { ws.alive = true })
    ws.on('error', () => {})
    ws.on('close', () => leave(ws))
    ws.on('message', (raw, binary) => {
      try {
        const currentUser = userFor(req)
        if (binary || !currentUser?.verified || currentUser.id !== ws.userId || !limiter.take(`signal:${ws.userId}`, 300, 10000)) throw new Error()
        const message = JSON.parse(raw)
        if (message.type === 'leave') { leave(ws); return }
        const id = message.type === 'join' ? message.id : ws.room
        const item = store.access(id, ws.userId)
        store.social(item.challengerUserId, item.challengedUserId)
        if (!['ACCEPTED', 'IN_PROGRESS', 'WAITING_FOR_OPPONENT', 'COMPLETED'].includes(item.status)) throw new Error()
        if (message.type === 'join') {
          leave(ws)
          for (const previous of wss.clients) if (previous !== ws && previous.room === id && previous.userId === ws.userId) { leave(previous); send(previous, { type: 'replaced' }) }
          ws.room = id
          send(ws, { type: 'joined', initiator: ws.userId === item.challengerUserId, rtc: { iceServers: config.iceServers(id), iceTransportPolicy: config.relayOnly ? 'relay' : 'all' } })
          for (const peer of peers(ws)) { send(peer, { type: 'peer-ready' }); send(ws, { type: 'peer-ready' }) }
          return
        }
        if (['offer', 'answer'].includes(message.type)) {
          if (typeof message.sdp !== 'string' || message.sdp.length > 60000 || !message.sdp.startsWith('v=0') || /m=audio/.test(message.sdp)) throw new Error()
          for (const peer of peers(ws)) send(peer, { type: message.type, sdp: message.sdp })
        } else if (message.type === 'ice' && typeof message.candidate?.candidate === 'string' && message.candidate.candidate.length < 4096) {
          for (const peer of peers(ws)) send(peer, { type: 'ice', candidate: message.candidate })
        } else throw new Error()
      } catch { send(ws, { type: 'error', message: 'Connexion non autorisée ou interrompue.' }); leave(ws); ws.close(1008) }
    })
  })
  const timer = setInterval(() => {
    for (const ws of wss.clients) {
      try {
        const user = userFor(ws.req)
        if (!ws.alive || !user?.verified || user.id !== ws.userId) throw new Error()
        if (ws.room) {
          const item = store.access(ws.room, ws.userId)
          store.social(item.challengerUserId, item.challengedUserId)
          if (!['ACCEPTED', 'IN_PROGRESS', 'WAITING_FOR_OPPONENT', 'COMPLETED'].includes(item.status)) throw new Error()
        }
        ws.alive = false; ws.ping()
      } catch { send(ws, { type: 'error', message: 'La session vidéo n’est plus autorisée.' }); ws.terminate() }
    }
  }, 15000)
  timer.unref()
  return { router, attach(server) { server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/api/challenges/socket') return
    if (!allowedOrigin(req) || !userFor(req)?.verified || wss.clients.size >= 500 || !limiter.take(`upgrade:${req.socket.remoteAddress}`, 60, 60000)) { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return }
    wss.handleUpgrade(req, socket, head, client => wss.emit('connection', client, req))
  }) }, close() { clearInterval(timer); store.listeners.delete(notify); for (const ws of wss.clients) ws.terminate(); wss.close() } }
}
