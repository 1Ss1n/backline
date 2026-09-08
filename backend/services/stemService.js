import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import FormData from 'form-data'
import fetch from 'node-fetch'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const stemsDir = path.join(__dirname, '..', 'storage', 'stems')
fs.mkdirSync(stemsDir, { recursive: true })

const STEM_SERVICE_URL = process.env.STEM_SERVICE_URL || 'http://localhost:8000'

/**
 * Envoie le MP3 au micro-service Python (FastAPI) qui fait tourner
 * Mel-Band RoFormer sur GPU, récupère les deux stems (voix / instru)
 * et les expose via /stems/*.
 */
export async function separateStems(filePath, originalName) {
  const form = new FormData()
  form.append('file', fs.createReadStream(filePath), originalName)

  const response = await fetch(`${STEM_SERVICE_URL}/separate`, {
    method: 'POST',
    body: form,
  })

  if (!response.ok) {
    throw new Error(`Stem service a répondu ${response.status}`)
  }

  // Le service Python renvoie directement les deux buffers audio encodés en base64
  const { vocal_base64, instru_base64, format } = await response.json()

  const jobId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
  const vocalName = `${jobId}-vocal.${format}`
  const instruName = `${jobId}-instru.${format}`

  fs.writeFileSync(path.join(stemsDir, vocalName), Buffer.from(vocal_base64, 'base64'))
  fs.writeFileSync(path.join(stemsDir, instruName), Buffer.from(instru_base64, 'base64'))

  return {
    id: jobId,
    vocalUrl: `/stems/${vocalName}`,
    instruUrl: `/stems/${instruName}`,
  }
}
