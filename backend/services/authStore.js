import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const authDir = path.join(__dirname, '..', 'storage', 'auth')
const usersPath = path.join(authDir, 'users.json')
const sessionsPath = path.join(authDir, 'sessions.json')
fs.mkdirSync(authDir, { recursive: true })

const scrypt = promisify(crypto.scrypt)
const read = (file, fallback) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2), { mode: 0o600 })
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex')

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const derived = await scrypt(password, salt, 64)
  return `${salt}:${derived.toString('hex')}`
}

export async function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':')
  const derived = await scrypt(password, salt, 64)
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), derived)
}

export function findUserByEmail(email) {
  return read(usersPath, []).find((user) => user.email === email.toLowerCase()) || null
}

export function findUserByLogin(identifier) {
  const value = identifier.toLowerCase()
  return read(usersPath, []).find((user) => user.email === value || user.username === value) || null
}

export function searchUsers(query, excludedId) {
  const value = query.toLowerCase()
  return read(usersPath, []).filter((user) => user.id !== excludedId && user.username?.includes(value)).slice(0, 8)
}

export function findUserById(id) {
  return read(usersPath, []).find((user) => user.id === id) || null
}

export function createUser({ email, displayName, username, passwordHash }) {
  const users = read(usersPath, [])
  const user = { id: crypto.randomUUID(), username: username.toLowerCase(), email: email.toLowerCase(), displayName, passwordHash, verified: false, verification: null, pendingEmail: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  users.push(user); write(usersPath, users)
  return user
}

export async function ensureAdmin({ username, password }) {
  if (findUserByLogin(username)) return
  const users = read(usersPath, [])
  users.push({ id: crypto.randomUUID(), username: username.toLowerCase(), email: `${username.toLowerCase()}@backline.local`, displayName: 'Admin', passwordHash: await hashPassword(password), verified: true, isAdmin: true, verification: null, pendingEmail: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
  write(usersPath, users)
}

// Accounts created before usernames were introduced must still resolve to the
// same identity after logging out. Give them a stable, unique username once.
export function backfillUsernames() {
  const users = read(usersPath, [])
  const used = new Set(users.map((user) => user.username).filter(Boolean))
  let changed = false
  for (const user of users) {
    if (user.username) continue
    const seed = (user.displayName || user.email.split('@')[0] || 'utilisateur')
      .toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20) || 'utilisateur'
    let username = seed.length >= 3 ? seed : `${seed}user`
    let suffix = 2
    while (used.has(username)) username = `${seed.slice(0, 20 - String(suffix).length)}${suffix++}`
    user.username = username
    used.add(username)
    changed = true
  }
  if (changed) write(usersPath, users)
}

export function updateUser(id, changes) {
  const users = read(usersPath, [])
  const index = users.findIndex((user) => user.id === id)
  if (index === -1) return null
  users[index] = { ...users[index], ...changes, id, updatedAt: new Date().toISOString() }
  write(usersPath, users)
  return users[index]
}

export function issueVerification(userId, purpose = 'verify') {
  const token = crypto.randomBytes(32).toString('base64url')
  updateUser(userId, { verification: { purpose, tokenHash: hashToken(token), expiresAt: Date.now() + 1000 * 60 * 60 * 24 } })
  return token
}

export function consumeVerification(token) {
  const users = read(usersPath, [])
  const index = users.findIndex((user) => user.verification?.tokenHash === hashToken(token) && user.verification.expiresAt > Date.now())
  if (index === -1) return null
  const user = users[index]
  if (user.verification.purpose === 'email-change' && user.pendingEmail) user.email = user.pendingEmail
  user.pendingEmail = null; user.verified = true; user.verification = null; user.updatedAt = new Date().toISOString()
  write(usersPath, users)
  return user
}

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url')
  const sessions = read(sessionsPath, []).filter((session) => session.expiresAt > Date.now())
  sessions.push({ tokenHash: hashToken(token), userId, expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7 })
  write(sessionsPath, sessions)
  return token
}

export function getSessionUser(token) {
  if (!token) return null
  const sessions = read(sessionsPath, [])
  const session = sessions.find((item) => item.tokenHash === hashToken(token) && item.expiresAt > Date.now())
  return session ? findUserById(session.userId) : null
}

export function deleteSession(token) {
  if (!token) return
  write(sessionsPath, read(sessionsPath, []).filter((session) => session.tokenHash !== hashToken(token)))
}

export function publicUser(user) {
  if (!user) return null
  return { id: user.id, username: user.username || null, email: user.email, displayName: user.displayName, avatarUrl: user.avatarUrl || null, verified: user.verified, isAdmin: Boolean(user.isAdmin), createdAt: user.createdAt }
}
