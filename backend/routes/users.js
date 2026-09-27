import { Router } from 'express'
import { findUserByLogin, findUserById, updateUser, publicUser } from '../services/authStore.js'
import multer from 'multer'
import rateLimit from 'express-rate-limit'
import { avatarPath, normalizeAvatar, saveAvatar } from '../services/avatar.js'
import { areFriends } from '../services/friendStore.js'
import { createPost, deletePost, listPosts, findPost, publicPost, setPostLike, canReadPost } from '../services/postStore.js'
import { findPerformance, listSessions, updateSession } from '../services/sessionStore.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0 } }).single('avatar')
const avatarLimit = rateLimit({ windowMs: 60000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Trop de modifications. Réessayez dans une minute.' } })

router.post('/me/avatar', avatarLimit, (req, res) => upload(req, res, async error => {
  if (error || !req.file) return res.status(400).json({ error: 'Choisissez une image JPG, PNG ou WebP de 2 Mo maximum.' })
  let buffer
  try { buffer = await normalizeAvatar(req.file.buffer) }
  catch (error) { return res.status(400).json({ error: error.message }) }
  try {
    const avatarUrl = await saveAvatar(req.user.id, buffer)
    const user = updateUser(req.user.id, { avatarUrl })
    res.json({ user: publicUser(user), avatarUrl })
  } catch { res.status(500).json({ error: 'La photo n’a pas pu être enregistrée. Réessayez.' }) }
}))
router.get('/:id/avatar', (req, res) => {
  const user = findUserById(req.params.id)
  if (!user?.avatarUrl) return res.sendStatus(404)
  res.set('Cache-Control', 'private, no-cache').type('jpeg').sendFile(avatarPath(user.id), error => { if (error && !res.headersSent) res.sendStatus(404) })
})

const profilePayload = (user, viewerId) => {
  const isSelf = user.id === viewerId
  const canViewSocial = isSelf || areFriends(viewerId, user.id)
  const sharedPerformances = []
  if (canViewSocial) {
    // Kept in the session so a performance cannot be shared independently of its owner.
    for (const session of listSessions(user.id)) for (const performance of session.performances || []) {
      if (performance.sharedAt) sharedPerformances.push({ ...performance, track: { title: session.title, artist: session.artist, coverUrl: session.coverUrl, instruUrl: session.stems?.instruUrl } })
    }
  }
  return { id: user.id, username: user.username || null, displayName: user.displayName, avatarUrl: user.avatarUrl || null, createdAt: user.createdAt, isSelf, canViewSocial, posts: canViewSocial ? listPosts(user.id).map(post => publicPost(post, viewerId)) : [], sharedPerformances }
}

router.get('/me', (req, res) => res.json({ profile: profilePayload(req.user, req.user.id) }))

router.post('/me/posts', (req, res) => {
  const content = typeof req.body?.content === 'string' ? req.body.content.trim() : ''
  if (!content || content.length > 500) return res.status(400).json({ error: 'Un post doit contenir entre 1 et 500 caractÃ¨res.' })
  res.status(201).json({ post: publicPost(createPost(req.user.id, content), req.user.id) })
})

router.put('/posts/:id/like', (req, res) => {
  const post = findPost(req.params.id)
  if (!canReadPost(post, req.user.id, areFriends)) return res.status(404).json({ error: 'Publication introuvable.' })
  if (typeof req.body?.liked !== 'boolean') return res.status(400).json({ error: 'Choix de like invalide.' })
  res.json({ post: setPostLike(post.id, req.user.id, req.body.liked) })
})

router.delete('/me/posts/:id', (req, res) => res.status(deletePost(req.user.id, req.params.id) ? 204 : 404).end())

router.post('/me/performances/:id/share', (req, res) => {
  const found = findPerformance(req.user.id, req.params.id)
  if (!found) return res.status(404).json({ error: 'Performance introuvable.' })
  const performances = found.session.performances.map((performance) => performance.id === found.performance.id ? { ...performance, sharedAt: new Date().toISOString() } : performance)
  const session = updateSession(found.session.id, { performances })
  res.json({ performance: session.performances.find((performance) => performance.id === req.params.id) })
})

router.delete('/me/performances/:id/share', (req, res) => {
  const found = findPerformance(req.user.id, req.params.id)
  if (!found) return res.status(404).json({ error: 'Performance introuvable.' })
  const performances = found.session.performances.map((performance) => performance.id === found.performance.id ? Object.fromEntries(Object.entries(performance).filter(([key]) => key !== 'sharedAt')) : performance)
  updateSession(found.session.id, { performances })
  res.status(204).end()
})

router.get('/:username', (req, res) => {
  const user = findUserByLogin(req.params.username.trim().toLowerCase())
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' })
  res.json({ profile: profilePayload(user, req.user.id) })
})

export default router
