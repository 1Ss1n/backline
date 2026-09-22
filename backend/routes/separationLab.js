import { Router } from 'express'
import multer from 'multer'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import FormData from 'form-data'
import fetch from 'node-fetch'

const execFileAsync = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..', 'storage', 'separation-lab')
const uploadDir = path.join(root, 'uploads')
const STEM_SERVICE_URL = process.env.STEM_SERVICE_URL || 'http://localhost:8000'
const allowed = new Set(['.mp3', '.wav', '.m4a'])
const jobs = new Map()

fs.mkdirSync(uploadDir, { recursive: true })

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const isAllowed = allowed.has(path.extname(file.originalname).toLowerCase())
    callback(isAllowed ? null : new Error('Formats acceptés : MP3, WAV ou M4A.'), isAllowed)
  },
})

const preset = { id: 'spleeter', label: 'Spleeter', engine: 'Spleeter', model: '2 stems', execution: 'local', device: 'Docker' }
const assetUrl = (jobId, filename) => `/api/separation-lab/assets/${jobId}/spleeter/${filename}`

function resultDirectory(jobId) {
  const directory = path.join(root, jobId, 'spleeter')
  fs.mkdirSync(directory, { recursive: true })
  return directory
}

async function durationSeconds(filePath) {
  try {
    const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', filePath], { windowsHide: true })
    const value = Number.parseFloat(stdout)
    return Number.isFinite(value) ? Number(value.toFixed(2)) : null
  } catch { return null }
}

async function readJson(response) {
  try { return await response.json() } catch { return {} }
}

async function runSpleeter(job, jobId) {
  const form = new FormData()
  form.append('file', fs.createReadStream(job.path), job.name)
  const started = performance.now()
  const response = await fetch(`${STEM_SERVICE_URL}/separate`, { method: 'POST', body: form, timeout: 45 * 60 * 1000 })
  const payload = await readJson(response)
  if (!response.ok) throw new Error(payload.detail || payload.error || 'Spleeter est indisponible.')
  if (!payload.vocal_base64 || !payload.instru_base64) throw new Error('Spleeter n’a pas renvoyé les deux stems attendus.')
  const directory = resultDirectory(jobId)
  const extension = path.extname(job.name).toLowerCase()
  const originalName = `original${extension}`
  fs.copyFileSync(job.path, path.join(directory, originalName))
  fs.writeFileSync(path.join(directory, 'vocals.wav'), Buffer.from(payload.vocal_base64, 'base64'))
  fs.writeFileSync(path.join(directory, 'accompaniment.wav'), Buffer.from(payload.instru_base64, 'base64'))
  const processingTimeSeconds = Number(((performance.now() - started) / 1000).toFixed(2))
  return {
    ...preset,
    audioDurationSeconds: job.durationSeconds,
    processingTimeSeconds,
    realTimeFactor: job.durationSeconds ? Number((processingTimeSeconds / job.durationSeconds).toFixed(3)) : null,
    speedRatio: job.durationSeconds ? Number((job.durationSeconds / processingTimeSeconds).toFixed(3)) : null,
    originalUrl: assetUrl(jobId, originalName),
    vocalsUrl: assetUrl(jobId, 'vocals.wav'),
    accompanimentUrl: assetUrl(jobId, 'accompaniment.wav'),
  }
}

const router = Router()

router.get('/presets', (_req, res) => res.json({ presets: [preset] }))

router.post('/upload', upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choisissez un fichier audio.' })
  const id = `lab-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
  jobs.set(id, { ownerId: req.user.id, path: req.file.path, name: req.file.originalname, durationSeconds: await durationSeconds(req.file.path) })
  return res.json({ jobId: id, fileName: req.file.originalname, durationSeconds: jobs.get(id).durationSeconds, presets: [preset] })
})

router.post('/:jobId/run', async (req, res) => {
  const job = jobs.get(req.params.jobId)
  if (!job || job.ownerId !== req.user.id) return res.sendStatus(404)
  if (req.body?.preset && req.body.preset !== 'spleeter') return res.status(400).json({ error: 'Spleeter est le seul moteur disponible.' })
  try { return res.json(await runSpleeter(job, req.params.jobId)) }
  catch (error) {
    console.error('[separation-lab] Spleeter failed:', error.message)
    return res.status(502).json({ error: error.message })
  }
})

router.get('/assets/:jobId/:presetName/:file', (req, res) => {
  const job = jobs.get(req.params.jobId)
  const { jobId, presetName, file } = req.params
  if (!job || job.ownerId !== req.user.id || presetName !== 'spleeter' || path.basename(file) !== file) return res.sendStatus(404)
  const target = path.join(root, jobId, 'spleeter', file)
  if (!fs.existsSync(target)) return res.sendStatus(404)
  return res.sendFile(target)
})

export default router
