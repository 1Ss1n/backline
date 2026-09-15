import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { consumeVerification, createSession, createUser, deleteSession, findUserByEmail, findUserByLogin, getSessionUser, hashPassword, issueVerification, publicUser, updateUser, verifyPassword } from '../services/authStore.js'
import { sendProfileNotice, sendVerificationEmail } from '../services/mailer.js'

const router = Router()
const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Trop de tentatives. Réessayez dans quelques minutes.' } })
const cookieName = 'backline_session'
const parseCookies = (request) => Object.fromEntries((request.headers.cookie || '').split(';').filter(Boolean).map((part) => part.trim().split('=')))
const sessionCookie = (response, token) => response.cookie(cookieName, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 24 * 7, path: '/' })

export const requireUser = (request, response, next) => {
  const user = getSessionUser(parseCookies(request)[cookieName])
  if (!user?.verified) return response.status(401).json({ error: 'Authentification requise.' })
  request.user = user; next()
}

router.post('/register', authLimit, async (request, response) => {
  const { email = '', password = '', displayName = '', username = '' } = request.body || {}
  const normalizedEmail = email.trim().toLowerCase()
  const normalizedUsername = (username.trim() || displayName.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')).toLowerCase()
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail) || password.length < 10 || displayName.trim().length < 2 || !/^[a-z0-9_]{3,24}$/.test(normalizedUsername)) return response.status(400).json({ error: 'Renseignez un pseudo (3 à 24 caractères), un e-mail valide et un mot de passe de 10 caractères minimum.' })
  if (findUserByEmail(normalizedEmail) || findUserByLogin(normalizedUsername)) return response.status(409).json({ error: 'Cette adresse e-mail ou ce pseudo est déjà utilisé.' })
  const user = createUser({ email: normalizedEmail, username: normalizedUsername, displayName: displayName.trim().slice(0, 80), passwordHash: await hashPassword(password) })
  const token = issueVerification(user.id)
  await sendVerificationEmail(user, token)
  response.status(201).json({ message: 'Compte créé. Vérifiez votre boîte e-mail pour activer Backline.' })
})

router.post('/login', authLimit, async (request, response) => {
  const { identifier = '', email = '', password = '' } = request.body || {}
  const user = findUserByLogin((identifier || email).trim())
  if (!user || !(await verifyPassword(password, user.passwordHash))) return response.status(401).json({ error: 'E-mail ou mot de passe incorrect.' })
  if (!user.verified) return response.status(403).json({ error: 'Confirmez votre adresse e-mail avant de vous connecter.' })
  sessionCookie(response, createSession(user.id)).json({ user: publicUser(user) })
})

router.post('/resend-verification', authLimit, async (request, response) => {
  const email = (request.body?.email || '').trim().toLowerCase()
  const user = findUserByEmail(email)
  if (user && !user.verified) {
    const token = issueVerification(user.id)
    await sendVerificationEmail(user, token)
  }
  response.json({ message: 'Si un compte non vérifié correspond à cette adresse, un nouvel e-mail a été envoyé.' })
})

router.get('/me', (request, response) => response.json({ user: publicUser(getSessionUser(parseCookies(request)[cookieName])) }))
router.post('/logout', (request, response) => { deleteSession(parseCookies(request)[cookieName]); response.clearCookie(cookieName, { path: '/' }).status(204).end() })
router.get('/verify', async (request, response) => {
  const user = consumeVerification(request.query.token || '')
  if (!user) return response.status(400).json({ error: 'Lien invalide ou expiré.' })
  sessionCookie(response, createSession(user.id)).json({ user: publicUser(user) })
})

router.patch('/profile', requireUser, authLimit, async (request, response) => {
  const { displayName, email, currentPassword, newPassword } = request.body || {}
  let user = request.user
  if (typeof displayName === 'string' && displayName.trim().length >= 2) user = updateUser(user.id, { displayName: displayName.trim().slice(0, 80) })
  if (typeof newPassword === 'string' && newPassword) {
    if (newPassword.length < 10 || !(await verifyPassword(currentPassword || '', user.passwordHash))) return response.status(400).json({ error: 'Mot de passe actuel incorrect ou nouveau mot de passe trop court.' })
    user = updateUser(user.id, { passwordHash: await hashPassword(newPassword) })
  }
  if (typeof email === 'string' && email.trim().toLowerCase() !== user.email) {
    const nextEmail = email.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(nextEmail) || findUserByEmail(nextEmail)) return response.status(400).json({ error: 'Cette adresse e-mail est invalide ou déjà utilisée.' })
    user = updateUser(user.id, { pendingEmail: nextEmail, verified: false })
    const token = issueVerification(user.id, 'email-change')
    await sendVerificationEmail(user, token)
    return response.json({ user: publicUser(user), message: 'Confirmez votre nouvelle adresse e-mail.' })
  }
  await sendProfileNotice(user)
  response.json({ user: publicUser(user) })
})

export default router
