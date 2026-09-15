import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const sessionsDir = path.join(__dirname, '..', 'storage', 'sessions')
fs.mkdirSync(sessionsDir, { recursive: true })

const sessionPath = (id) => path.join(sessionsDir, `${id}.json`)

export function createSession({ id, stems, originalName, ownerId }) {
  if (!ownerId) throw new Error('Une session doit Ãªtre associÃ©e Ã  un utilisateur.')
  const session = {
    id,
    ownerId,
    stems,
    originalName,
    title: path.parse(originalName).name,
    artist: 'Artiste inconnu',
    coverUrl: null,
    lyricsLines: [],
    lyricsSegments: [],
    lyricsSource: 'none',
    performances: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  fs.writeFileSync(sessionPath(id), JSON.stringify(session, null, 2))
  return session
}

export function listSessions(ownerId) {
  return fs.readdirSync(sessionsDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(fs.readFileSync(path.join(sessionsDir, name), 'utf8')))
    .filter((session) => session.ownerId === ownerId)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
}

export function getSession(id) {
  const file = sessionPath(id)
  if (!fs.existsSync(file)) return null
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

export function findPerformance(ownerId, performanceId) {
  for (const session of listSessions(ownerId)) {
    const performance = (session.performances || []).find((item) => item.id === performanceId)
    if (performance) return { session, performance }
  }
  return null
}

export function findSessionByAssetUrl(assetUrl) {
  return fs.readdirSync(sessionsDir).filter((name) => name.endsWith('.json')).map((name) => JSON.parse(fs.readFileSync(path.join(sessionsDir, name), 'utf8')))
    .find((session) => Object.values(session.stems || {}).includes(assetUrl) || (session.performances || []).some((performance) => performance.url === assetUrl)) || null
}

export function updateSession(id, changes) {
  const session = getSession(id)
  if (!session) return null
  const updated = { ...session, ...changes, id: session.id, updatedAt: new Date().toISOString() }
  fs.writeFileSync(sessionPath(id), JSON.stringify(updated, null, 2))
  return updated
}

export function clearSessions(ownerId) {
  for (const name of fs.readdirSync(sessionsDir)) {
    if (!name.endsWith('.json')) continue
    const file = path.join(sessionsDir, name)
    if (JSON.parse(fs.readFileSync(file, 'utf8')).ownerId === ownerId) fs.unlinkSync(file)
  }
}
