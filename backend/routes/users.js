import { Router } from 'express'
import { findUserByLogin } from '../services/authStore.js'
import { areFriends } from '../services/friendStore.js'
import { createPost, deletePost, listPosts } from '../services/postStore.js'
import { findPerformance, listSessions, updateSession } from '../services/sessionStore.js'

const router = Router()

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
  return { id: user.id, username: user.username || null, displayName: user.displayName, createdAt: user.createdAt, isSelf, canViewSocial, posts: canViewSocial ? listPosts(user.id) : [], sharedPerformances }
}

router.get('/me', (req, res) => res.json({ profile: profilePayload(req.user, req.user.id) }))

router.post('/me/posts', (req, res) => {
  const content = (req.body?.content || '').trim()
  if (!content || content.length > 500) return res.status(400).json({ error: 'Un post doit contenir entre 1 et 500 caractÃ¨res.' })
  res.status(201).json({ post: createPost(req.user.id, content) })
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
