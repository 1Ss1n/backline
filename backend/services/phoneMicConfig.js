import { createHmac } from 'node:crypto'

const list = value => (value || '').split(',').map(item => item.trim()).filter(Boolean)
const seconds = (value, fallback, min, max) => Math.min(max, Math.max(min, Number(value) || fallback)) * 1000
export function phoneMicConfig(env = process.env) {
  const publicUrl = env.PHONE_MIC_PUBLIC_URL || env.FRONTEND_URL || 'http://localhost:5173'
  const origins = new Set([new URL(publicUrl).origin, ...list(env.PHONE_MIC_ALLOWED_ORIGINS)])
  const production = env.NODE_ENV === 'production'
  if (production && [...origins].some(origin => !origin.startsWith('https://'))) throw new Error('Phone microphone requires HTTPS origins in production')
  return {
    origins, publicUrl: new URL(publicUrl).origin, production,
    pairingMs: seconds(env.PHONE_MIC_PAIRING_SECONDS, 300, 30, 600),
    sessionMs: seconds(env.PHONE_MIC_SESSION_SECONDS, 7200, 300, 14400),
    reconnectMs: seconds(env.PHONE_MIC_RECONNECT_SECONDS, 45, 10, 120),
    iceServers(sessionId) {
      const servers = []
      const stun = list(env.WEBRTC_STUN_URLS)
      if (stun.length) servers.push({ urls: stun })
      const turn = list(env.WEBRTC_TURN_URLS)
      if (turn.length && env.WEBRTC_TURN_SECRET) {
        // coturn TURN REST API. Only this short-lived credential reaches clients.
        const username = `${Math.floor(Date.now() / 1000) + 14400}:${sessionId}`
        servers.push({ urls: turn, username, credential: createHmac('sha1', env.WEBRTC_TURN_SECRET).update(username).digest('base64') })
      }
      return servers
    },
    relayOnly: env.WEBRTC_RELAY_ONLY === 'true',
  }
}
