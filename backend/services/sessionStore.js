import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const sessionsDir = path.join(__dirname, '..', 'storage', 'sessions')
fs.mkdirSync(sessionsDir, { recursive: true })

const sessionPath = (id) => path.join(sessionsDir, `${id}.json`)

export function createSession({ id, stems, originalName }) {
  const session = {
    id,
    stems,
    originalName,
    title: path.parse(originalName).name,
    artist: 'Artiste inconnu',
    coverUrl: null,
    lyricsLines: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  fs.writeFileSync(sessionPath(id), JSON.stringify(session, null, 2))
  return session
}

export function listSessions() {
  return fs.readdirSync(sessionsDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(fs.readFileSync(path.join(sessionsDir, name), 'utf8')))
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
}

export function getSession(id) {
  const file = sessionPath(id)
  if (!fs.existsSync(file)) return null
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

export function updateSession(id, changes) {
  const session = getSession(id)
  if (!session) return null
  const updated = { ...session, ...changes, id: session.id, updatedAt: new Date().toISOString() }
  fs.writeFileSync(sessionPath(id), JSON.stringify(updated, null, 2))
  return updated
}

export function clearSessions() {
  for (const name of fs.readdirSync(sessionsDir)) {
    if (name.endsWith('.json')) fs.unlinkSync(path.join(sessionsDir, name))
  }
}
