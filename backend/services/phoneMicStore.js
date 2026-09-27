import { createHash, randomBytes, randomInt } from 'node:crypto'

const secret = () => randomBytes(32).toString('base64url')
const hash = value => createHash('sha256').update(String(value || '')).digest('hex')
export class PairingError extends Error {
  constructor(code) { super(code); this.code = code }
}

export class AttemptLimiter {
  constructor({ now = Date.now, capacity = 10000 } = {}) { this.entries = new Map(); this.now = now; this.capacity = capacity }
  take(key, max, period) {
    const now = this.now()
    let item = this.entries.get(key)
    if (!item || item.until <= now) {
      for (const [id, value] of this.entries) if (value.until <= now) this.entries.delete(id)
      if (this.entries.size >= this.capacity) return false
      item = { count: 0, until: now + period }; this.entries.set(key, item)
    }
    return ++item.count <= max
  }
}

export class PhoneMicStore {
  constructor(config, { now = Date.now, onEnd = () => {} } = {}) {
    this.config = config; this.now = now; this.onEnd = onEnd; this.sessions = new Map()
  }
  create(ownerId, origin) {
    this.sweep()
    for (const item of this.sessions.values()) if (item.ownerId === ownerId) this.end(item.id, 'replaced')
    if (this.sessions.size >= 500) throw new PairingError('busy')
    const id = secret(), token = secret(), hostToken = secret()
    let code
    do { code = String(randomInt(100000, 1000000)) } while ([...this.sessions.values()].some(item => item.code === code))
    const expiresAt = this.now() + this.config.pairingMs
    this.sessions.set(id, { id, ownerId, origin, tokenHash: hash(token), hostHash: hash(hostToken), code, expiresAt,
      state: 'waiting', host: null, phone: null, hostLostAt: this.now(), phoneLostAt: null, muted: false })
    return { id, token, hostToken, code, expiresAt }
  }
  get(id) {
    const item = this.sessions.get(id)
    if (!item) throw new PairingError('invalid')
    if (item.expiresAt <= this.now()) { this.end(id, 'expired'); throw new PairingError('expired') }
    return item
  }
  host(id, token, ownerId, origin) {
    const item = this.get(id)
    if (item.ownerId !== ownerId || item.origin !== origin || item.hostHash !== hash(token)) throw new PairingError('invalid')
    return item
  }
  join({ token, code }, origin) {
    this.sweep()
    const item = [...this.sessions.values()].find(session => session.origin === origin && session.state === 'waiting' &&
      (typeof token === 'string' && token.length >= 40 ? session.tokenHash === hash(token) : /^\d{6}$/.test(code || '') && session.code === code))
    if (!item || !item.host) throw new PairingError('invalid')
    const resumeToken = secret()
    item.state = 'pending'; item.tokenHash = null; item.code = null; item.phoneHash = hash(resumeToken)
    return { item, resumeToken }
  }
  resume(id, token, origin) {
    const item = this.get(id)
    if (!item.phoneHash || item.origin !== origin || item.phoneHash !== hash(token) || item.state === 'waiting') throw new PairingError('invalid')
    return item
  }
  attach(item, role, socket) {
    const lost = item[`${role}LostAt`]
    if (item[role]) throw new PairingError('used')
    if (lost != null && this.now() - lost > this.config.reconnectMs) { this.end(item.id, 'disconnected'); throw new PairingError('expired') }
    item[role] = socket; item[`${role}LostAt`] = null
  }
  detach(item, role, socket) {
    if (this.sessions.has(item.id) && item[role] === socket) { item[role] = null; item[`${role}LostAt`] = this.now() }
  }
  approve(item) {
    if (item.state !== 'pending' || !item.phone) throw new PairingError('invalid_state')
    item.state = 'approved'; item.expiresAt = this.now() + this.config.sessionMs
  }
  end(id, reason = 'ended') {
    const item = this.sessions.get(id)
    if (item) { this.sessions.delete(id); this.onEnd(item, reason) }
  }
  sweep() {
    for (const item of this.sessions.values()) {
      if (item.expiresAt <= this.now()) this.end(item.id, 'expired')
      else if (['host', 'phone'].some(role => item[`${role}LostAt`] != null && this.now() - item[`${role}LostAt`] > this.config.reconnectMs)) this.end(item.id, 'disconnected')
    }
  }
  close() { for (const id of this.sessions.keys()) this.end(id, 'ended') }
}
