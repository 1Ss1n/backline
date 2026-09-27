import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { SCORING_CONFIG, sessionScore, scoreRank } from '../../frontend/src/utils/perfectPitchScoring.js'
import { normalizeNotes, PITCH_CONFIG } from '../../frontend/src/utils/pitchMath.js'

export const SCORING_VERSION = 'perfect-pitch-v1'
const scoringFingerprint = crypto.createHash('sha256').update(JSON.stringify({ SCORING_CONFIG, PITCH_CONFIG, version: SCORING_VERSION })).digest('hex')
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }) }
const active = new Set(['ACCEPTED', 'IN_PROGRESS', 'WAITING_FOR_OPPONENT'])
const transitions = { PENDING: ['ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED'], ACCEPTED: ['IN_PROGRESS', 'CANCELLED'], IN_PROGRESS: ['WAITING_FOR_OPPONENT', 'CANCELLED'], WAITING_FOR_OPPONENT: ['COMPLETED', 'CANCELLED'] }
const transition = (item, status) => { if (!transitions[item.status]?.includes(status)) fail('Transition impossible.', 409); item.status = status }
const uuid = value => typeof value === 'string' && /^[\w-]{1,100}$/.test(value)

// One Node process, one atomic JSON replacement per mutation. Audio is published
// before metadata: a crash can leave an orphan, never a partially completed duel.
export class ChallengeStore {
  constructor({ directory, stemsDirectory, getSession, getUser, areFriends, now = Date.now, expiryMs = 7 * 86400000, limit = 20 }) {
    Object.assign(this, { directory, stemsDirectory, getSession, getUser, areFriends, now, expiryMs, limit })
    fs.mkdirSync(directory, { recursive: true })
    this.file = path.join(directory, 'challenges.json')
    this.listeners = new Set()
  }
  read() { return fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : [] }
  write(items) {
    const tmp = `${this.file}.${crypto.randomUUID()}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(items), { mode: 0o600 })
    fs.renameSync(tmp, this.file)
    for (const notify of this.listeners) { try { notify() } catch {} }
  }
  social(a, b) { if (a === b || !this.getUser(a)?.verified || !this.getUser(b)?.verified || !this.areFriends(a, b)) fail('Ce défi est réservé à vos amis.', 403) }
  all() {
    const items = this.read(); let changed = false
    for (const item of items) if (item.status === 'PENDING' && item.expiresAt <= this.now()) { transition(item, 'EXPIRED'); changed = true }
    if (changed) this.write(items)
    return items
  }
  access(id, userId, items = this.all()) {
    const item = items.find(item => item.id === id)
    if (!item || ![item.challengerUserId, item.challengedUserId].includes(userId)) fail('Défi introuvable.', 404)
    return item
  }
  view(item, userId) {
    const publicName = id => { const user = this.getUser(id); return { id, displayName: user?.displayName || 'Compte indisponible', username: user?.username || '' } }
    const performances = Object.fromEntries(Object.entries(item.performances).map(([id, performance]) => {
      const { filename, ...visible } = performance
      return [id, id === userId || item.status === 'COMPLETED' ? { ...visible, url: `/api/challenges/${item.id}/performances/${performance.id}/audio`, track: { instruUrl: `/api/challenges/${item.id}/stems/instru` } } : { submitted: true }]
    }))
    return { id: item.id, challengerUserId: item.challengerUserId, challengedUserId: item.challengedUserId,
      challenger: publicName(item.challengerUserId), challenged: publicName(item.challengedUserId),
      track: { id: item.trackId, title: item.snapshot.title, artist: item.snapshot.artist, coverUrl: item.snapshot.coverUrl },
      status: item.status, createdAt: item.createdAt, expiresAt: item.expiresAt, completedAt: item.completedAt,
      parentChallengeId: item.parentChallengeId, seriesId: item.seriesId, scoringVersion: item.scoringVersion,
      readyUserIds: Object.entries(item.readyAt || {}).filter(([id, time]) => !item.performances[id] && this.now() - time < 120000).map(([id]) => id), performances }
  }
  list(userId) { return this.all().filter(item => [item.challengerUserId, item.challengedUserId].includes(userId)).map(item => this.view(item, userId)).reverse() }
  create(userId, { opponentId, trackId, parentChallengeId, rematch = false }) {
    const items = this.all()
    this.social(userId, opponentId)
    const parent = parentChallengeId ? this.access(parentChallengeId, userId, items) : null
    if (parent && (parent.status !== 'COMPLETED' || ![parent.challengerUserId, parent.challengedUserId].includes(opponentId))) fail('Round parent invalide.', 409)
    if (rematch && !parent) fail('La revanche nécessite un round terminé.')
    if (!rematch && !uuid(trackId)) fail('Morceau invalide.')
    const session = rematch ? parent.snapshot : this.getSession(trackId)
    if (!session || !rematch && session.ownerId !== userId) fail('Morceau introuvable.', 404)
    const selectedId = rematch ? parent.trackId : trackId
    const duplicate = items.find(item => item.challengerUserId === userId && item.challengedUserId === opponentId && item.trackId === selectedId && item.status === 'PENDING' && item.parentChallengeId === (parent?.id || null))
    if (duplicate) return this.view(duplicate, userId)
    if (items.filter(item => item.challengerUserId === userId && item.createdAt > this.now() - 3600000).length >= this.limit) fail('Trop de défis. Réessayez dans une heure.', 429)
    const rawNotes = session.perfectPitch?.rawNotes || []
    if (!Array.isArray(rawNotes) || rawNotes.length > 20000 || rawNotes.some(note => !note || ![note.start, note.end, note.midi].every(Number.isFinite) || note.start < 0 || note.end <= note.start || note.midi < 0 || note.midi > 127)) fail('Référence Perfect Pitch invalide.')
    const notes = normalizeNotes(rawNotes).filter(note => note.end - note.start >= SCORING_CONFIG.minScorableNoteDuration)
    if (!notes.length) fail('Préparez Perfect Pitch sur ce morceau avant de lancer un défi.')
    const id = crypto.randomUUID(), snapshotId = rematch ? parent.snapshotId : crypto.randomUUID()
    const snapshot = structuredClone({ title: session.title, artist: session.artist, coverUrl: session.coverUrl,
      lyricsLines: session.lyricsLines || [], lyricsSource: session.lyricsSource, perfectPitch: session.perfectPitch })
    if (!rematch) {
      const dir = path.join(this.directory, snapshotId); fs.mkdirSync(dir)
      try {
        for (const [kind, key] of [['vocal', 'vocalUrl'], ['instru', 'instruUrl']]) {
          const url = session.stems?.[key]
          if (typeof url !== 'string' || !/^\/stems\/[^/\\]+$/.test(url)) fail('Pistes indisponibles.')
          // Hard links retain the original bytes even after library cleanup.
          const source = path.join(this.stemsDirectory, path.basename(url)), target = path.join(dir, kind)
          try { fs.linkSync(source, target) }
          catch (error) {
            if (!['EXDEV', 'EPERM', 'ENOTSUP', 'EINVAL'].includes(error.code)) throw error
            fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL)
          }
        }
      } catch (error) { for (const kind of ['vocal', 'instru']) fs.rmSync(path.join(dir, kind), { force: true }); fs.rmdirSync(dir); throw error }
    }
    const item = { id, challengerUserId: userId, challengedUserId: opponentId, trackId: selectedId, snapshotId, snapshot,
      referenceHash: crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),
      scoringVersion: rematch ? parent.scoringVersion : SCORING_VERSION, scoringFingerprint: rematch ? parent.scoringFingerprint : scoringFingerprint,
      status: 'PENDING', createdAt: this.now(), expiresAt: this.now() + this.expiryMs,
      parentChallengeId: parent?.id || null, seriesId: parent?.seriesId || id, performances: {}, attempts: {} }
    items.push(item); this.write(items); return this.view(item, userId)
  }
  respond(id, userId, action) {
    const items = this.all(), item = this.access(id, userId, items)
    if (action !== 'cancel') { this.social(item.challengerUserId, item.challengedUserId); if (userId !== item.challengedUserId) fail('Action non autorisée.', 403) }
    if (action === 'cancel' && item.status === 'PENDING' && userId !== item.challengerUserId) fail('Action non autorisée.', 403)
    const status = { accept: 'ACCEPTED', decline: 'DECLINED', cancel: 'CANCELLED' }[action]
    transition(item, status); this.write(items); return this.view(item, userId)
  }
  start(id, userId) {
    const items = this.all(), item = this.access(id, userId, items)
    this.social(item.challengerUserId, item.challengedUserId)
    if (!active.has(item.status) || item.performances[userId]) fail('Ce round ne peut pas être joué.', 409)
    if (item.scoringVersion !== SCORING_VERSION || item.scoringFingerprint !== scoringFingerprint) fail('Version de scoring non prise en charge. Créez un nouveau défi.', 409)
    if (item.status === 'ACCEPTED') transition(item, 'IN_PROGRESS')
    const attempt = { id: crypto.randomUUID(), startedAt: this.now() }
    item.attempts[userId] = attempt; this.write(items); return attempt
  }
  ready(id, userId) {
    const items = this.all(), item = this.access(id, userId, items)
    this.social(item.challengerUserId, item.challengedUserId)
    if (!active.has(item.status) || item.performances[userId]) fail('Ce round ne peut pas être joué.', 409)
    item.readyAt = { ...item.readyAt, [userId]: this.now() }; this.write(items)
    return this.view(item, userId)
  }
  session(id, userId) {
    const item = this.access(id, userId)
    if (!active.has(item.status)) fail('Acceptez le défi avant de jouer.', 409)
    return { ...item.snapshot, id: item.id, stems: { vocalUrl: `/api/challenges/${id}/stems/vocal`, instruUrl: `/api/challenges/${id}/stems/instru` } }
  }
  submit(id, userId, metadata, file) {
    const items = this.all(), item = this.access(id, userId, items)
    if (item.performances[userId]) return this.view(item, userId).performances[userId]
    this.social(item.challengerUserId, item.challengedUserId)
    if (!active.has(item.status)) fail('Round fermé.', 409)
    const attempt = item.attempts[userId]
    if (!attempt || attempt.id !== metadata.attemptId || metadata.scoringVersion !== item.scoringVersion || item.scoringFingerprint !== scoringFingerprint) fail('Prise invalide.', 409)
    if (!file?.buffer?.length || !['audio/webm', 'audio/mp4', 'audio/ogg'].some(type => file.mimetype.startsWith(type))) fail('Audio manquant ou invalide.')
    const notes = normalizeNotes(item.snapshot.perfectPitch.rawNotes).filter(note => note.end - note.start >= SCORING_CONFIG.minScorableNoteDuration)
    const minimum = Math.max(...notes.map(note => note.end))
    if (!Number.isFinite(metadata.duration) || metadata.duration < minimum - 1 || this.now() - attempt.startedAt < (minimum - 2) * 1000) fail('La performance doit être complète.')
    let evaluatedNotes = 0, earnedPoints = 0
    const score = {}
    for (const rating of Object.keys(SCORING_CONFIG.points)) {
      const count = metadata.score?.[rating]
      if (!Number.isSafeInteger(count) || count < 0 || count > notes.length) fail('Statistiques invalides.')
      score[rating] = count; evaluatedNotes += count; earnedPoints += count * SCORING_CONFIG.points[rating]
    }
    if (evaluatedNotes > notes.length || !Number.isSafeInteger(metadata.score.maxCombo) || metadata.score.maxCombo < 0 || metadata.score.maxCombo > score.perfect + score.great + score.good) fail('Score invalide.')
    // Unobserved notes cannot improve a score by disappearing from its denominator.
    score.miss += notes.length - evaluatedNotes; score.evaluatedNotes = notes.length; score.earnedPoints = earnedPoints; score.maxCombo = metadata.score.maxCombo
    const value = sessionScore(score), performanceId = crypto.randomUUID()
    const filename = `${performanceId}.${file.mimetype.includes('mp4') ? 'm4a' : file.mimetype.includes('ogg') ? 'ogg' : 'webm'}`
    fs.writeFileSync(path.join(this.directory, filename), file.buffer, { mode: 0o600 })
    item.performances[userId] = { id: performanceId, ownerId: userId, filename, score, scoreValue: value, rank: scoreRank(value), duration: metadata.duration, scoringVersion: item.scoringVersion, createdAt: this.now() }
    transition(item, Object.keys(item.performances).length === 2 ? 'COMPLETED' : 'WAITING_FOR_OPPONENT')
    if (item.status === 'COMPLETED') item.completedAt = this.now()
    this.write(items); return this.view(item, userId).performances[userId]
  }
  audio(id, userId, performanceId) {
    const item = this.access(id, userId)
    const entry = Object.values(item.performances).find(p => p.id === performanceId)
    if (!entry || entry.ownerId !== userId && item.status !== 'COMPLETED') fail('Performance introuvable.', 404)
    return path.join(this.directory, entry.filename)
  }
  stem(id, userId, kind) {
    const item = this.access(id, userId)
    if (!['vocal', 'instru'].includes(kind) || ['PENDING', 'DECLINED', 'EXPIRED'].includes(item.status)) fail('Piste inaccessible.', 404)
    return path.join(this.directory, item.snapshotId, kind)
  }
}
