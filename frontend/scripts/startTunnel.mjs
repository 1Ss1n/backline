import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const candidates = [
  process.env.CLOUDFLARED_PATH,
  join(process.env['ProgramFiles(x86)'] || '', 'cloudflared', 'cloudflared.exe'),
  join(process.env.ProgramFiles || '', 'cloudflared', 'cloudflared.exe'),
  'cloudflared',
].filter(Boolean)

const executable = candidates.find((candidate) => candidate === 'cloudflared' || existsSync(candidate))

if (!executable) {
  console.error('cloudflared est introuvable. Installez-le puis relancez npm run tunnel.')
  process.exit(1)
}

console.log('Création du tunnel Cloudflare vers http://localhost:5173…')
const tunnel = spawn(executable, ['tunnel', '--url', 'http://localhost:5173'], { stdio: 'inherit', shell: false })
tunnel.on('error', (error) => { console.error(`Impossible de lancer cloudflared : ${error.message}`); process.exit(1) })
tunnel.on('exit', (code) => process.exit(code ?? 0))
process.on('SIGINT', () => tunnel.kill('SIGINT'))
