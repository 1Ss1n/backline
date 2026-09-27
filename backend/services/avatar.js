import sharp from 'sharp'
import crypto from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const directory = fileURLToPath(new URL('../storage/avatars/', import.meta.url))
export const avatarPath = id => path.join(directory, `${crypto.createHash('sha256').update(id).digest('hex')}.jpg`)
export async function normalizeAvatar(buffer) {
  if (!buffer?.length || buffer.length > 2 * 1024 * 1024) throw new Error('Choisissez une image de 2 Mo maximum.')
  try {
    const image = sharp(buffer, { limitInputPixels: 20000000, failOn: 'warning' })
    const metadata = await image.metadata()
    if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) > 1) throw new Error('format')
    // Decode/re-encode rather than trusting MIME/extension. Metadata is stripped.
    return await image.rotate().resize(512, 512, { fit: 'cover' }).flatten({ background: '#ffffff' }).jpeg({ quality: 85 }).toBuffer()
  } catch { throw new Error('Image invalide. Utilisez une photo JPG, PNG ou WebP non animée (20 mégapixels maximum).') }
}
export async function saveAvatar(id, buffer) {
  await fs.mkdir(directory, { recursive: true })
  const target = avatarPath(id), temporary = `${target}.${crypto.randomUUID()}.tmp`
  try { await fs.writeFile(temporary, buffer, { mode: 0o600 }); await fs.rename(temporary, target) }
  finally { await fs.rm(temporary, { force: true }) }
  return `/api/users/${encodeURIComponent(id)}/avatar?v=${crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16)}`
}
