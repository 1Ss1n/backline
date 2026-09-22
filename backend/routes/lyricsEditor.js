import { Router } from 'express'
import { getSession, updateSession } from '../services/sessionStore.js'
import { asKaraokeLines, asSegments, toEditableLines, validateLyricsLines } from '../services/lyricsEditor.js'

const router = Router()
const ownedSession = (id, userId) => {
  const session = getSession(id)
  return session?.ownerId === userId ? session : null
}

router.get('/:id/lyrics/edit', (req, res) => {
  const session = ownedSession(req.params.id, req.user.id)
  if (!session) return res.status(404).json({ error: 'Session introuvable.' })
  const original = session.lyricsOriginal || { lines: toEditableLines(session), source: session.lyricsSource || 'none' }
  const edited = session.lyricsEdit || null
  res.json({ sessionId: session.id, title: session.title, artist: session.artist, stems: session.stems, original, edited, active: edited || original })
})

router.put('/:id/lyrics/edit', (req, res) => {
  const session = ownedSession(req.params.id, req.user.id)
  if (!session) return res.status(404).json({ error: 'Session introuvable.' })
  const lines = req.body?.lines
  const validationError = validateLyricsLines(lines)
  if (validationError) return res.status(400).json({ error: validationError })
  const original = session.lyricsOriginal || { lines: toEditableLines(session), source: session.lyricsSource || 'none' }
  const edit = { lines: asSegments(lines), originalSource: original.source, updatedAt: new Date().toISOString() }
  const updated = updateSession(session.id, { lyricsOriginal: original, lyricsEdit: edit, lyricsSegments: edit.lines, lyricsLines: asKaraokeLines(edit.lines), lyricsSource: 'user-edited' })
  res.json({ session: updated, active: edit })
})

router.delete('/:id/lyrics/edit', (req, res) => {
  const session = ownedSession(req.params.id, req.user.id)
  if (!session) return res.status(404).json({ error: 'Session introuvable.' })
  const original = session.lyricsOriginal
  if (!original) return res.status(404).json({ error: 'Aucune version originale à restaurer.' })
  const lines = toEditableLines({ lyricsSegments: original.lines, lyricsLines: [] })
  const updated = updateSession(session.id, { lyricsEdit: null, lyricsSegments: asSegments(lines), lyricsLines: asKaraokeLines(lines), lyricsSource: original.source || 'none' })
  res.json({ session: updated, active: { lines, source: original.source || 'none' } })
})

export default router
