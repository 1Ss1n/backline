import { Router } from 'express'
import { findUserById, findUserByLogin, publicUser, searchUsers } from '../services/authStore.js'
import { acceptedFriends, createRequest, receivedRequests, respondToRequest } from '../services/friendStore.js'

const router = Router()

router.get('/search', (req, res) => {
  const query = (req.query.q || '').trim()
  if (query.length < 2) return res.json({ users: [] })
  res.json({ users: searchUsers(query, req.user.id).map(publicUser) })
})

router.post('/requests', (req, res) => {
  const username = (req.body?.username || '').trim().toLowerCase()
  const recipient = findUserByLogin(username)
  if (!recipient || recipient.id === req.user.id) return res.status(404).json({ error: 'Utilisateur introuvable.' })
  const { request, created } = createRequest(req.user.id, recipient.id)
  if (!created) return res.status(409).json({ error: 'Une relation existe déjà avec cet utilisateur.' })
  res.status(201).json({ request })
})

router.get('/requests', (req, res) => {
  const requests = receivedRequests(req.user.id).map((request) => ({ ...request, sender: publicUser(findUserById(request.senderId)) }))
  res.json({ requests })
})

router.get('/', (req, res) => {
  const friends = acceptedFriends(req.user.id).map((record) => {
    const friendId = record.senderId === req.user.id ? record.receiverId : record.senderId
    return publicUser(findUserById(friendId))
  }).filter(Boolean)
  res.json({ friends })
})

router.post('/requests/:id', (req, res) => {
  const status = req.body?.status === 'accepted' ? 'accepted' : req.body?.status === 'declined' ? 'declined' : null
  if (!status) return res.status(400).json({ error: 'Réponse invalide.' })
  const request = respondToRequest(req.params.id, req.user.id, status)
  if (!request) return res.status(404).json({ error: 'Demande introuvable.' })
  res.json({ request })
})

export default router
