import { test, expect } from '@playwright/test'

async function syntheticMic(context) {
  await context.routeWebSocket('**/api/challenges/socket', () => {})
  await context.addInitScript(() => {
    window.__micRequests = 0; window.__peers = []; window.__sockets = []; window.__audioContexts = []; window.__silentSinks = []; window.__recorders = []; window.__recordedChunks = []
    const Recorder = window.MediaRecorder
    window.MediaRecorder = class extends Recorder {
      constructor(...args) { super(...args); window.__recorders.push(this); this.addEventListener('dataavailable', event => { if (event.data.size) window.__recordedChunks.push(event.data) }) }
    }
    const AudioElement = window.Audio
    window.Audio = function (...args) { const element = new AudioElement(...args); window.__silentSinks.push(element); return element }
    const Audio = window.AudioContext
    window.AudioContext = class extends Audio { constructor(...args) { super(...args); window.__audioContexts.push(this) } }
    const Peer = window.RTCPeerConnection
    window.RTCPeerConnection = class extends Peer { constructor(...args) { super(...args); window.__peers.push(this) } }
    const Socket = window.WebSocket
    window.__signalMessages = []
    window.WebSocket = class extends Socket {
      constructor(...args) {
        super(...args)
        this.isPhoneMic = String(args[0]).includes('/api/phone-mic/socket')
        if (this.isPhoneMic) {
          window.__sockets.push(this)
          this.addEventListener('message', event => { const msg = JSON.parse(event.data); window.__signalMessages.push({ direction: 'in', type: msg.type, code: msg.code, state: msg.state }) })
        }
      }
      send(data) { if (this.isPhoneMic) { const msg = JSON.parse(data); window.__signalMessages.push({ direction: 'out', type: msg.type }) } return super.send(data) }
    }
    navigator.mediaDevices.getUserMedia = async () => {
      window.__micRequests++
      const context = new AudioContext(), oscillator = context.createOscillator(), gain = context.createGain(), destination = context.createMediaStreamDestination()
      oscillator.frequency.value = 440; gain.gain.value = .2
      oscillator.connect(gain); gain.connect(destination); oscillator.start(); await context.resume()
      return destination.stream
    }
  })
}
async function hostSetup(browser, classic = false) {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4186', viewport: { width: 1440, height: 1000 } })
  await syntheticMic(context)
  await context.addCookies([{ name: 'backline_session', value: 'phone-mic-test-only', url: 'http://127.0.0.1:4186' }])
  const page = await context.newPage()
  if (classic) await page.route('**/api/sessions*', async route => {
    const response = await route.fetch(), data = await response.json()
    const strip = session => { delete session.perfectPitch; return session }
    await route.fulfill({ response, json: Array.isArray(data) ? data.map(strip) : strip(data) })
  })
  if (classic) await page.route('**/api/sessions/*', async route => {
    const response = await route.fetch(), data = await response.json(); delete data.perfectPitch
    await route.fulfill({ response, json: data })
  })
  await page.goto('/')
  await page.locator('.studio-sidebar').hover()
  await page.getByRole('navigation').getByRole('button', { name: 'Mes morceaux', exact: true }).click()
  await page.getByRole('button', { name: 'Ouvrir la session : Test micro sans fil' }).click()
  if (classic) await page.getByRole('combobox', { name: 'Microphone pour l’enregistrement' }).selectOption('phone')
  else await page.getByRole('button', { name: 'Utiliser mon téléphone', exact: true }).click()
  await expect(page.locator('.phone-mic-qr')).toBeVisible()
  const code = (await page.locator('.phone-mic-code').textContent()).replace(/\s/g, '')
  return { context, page, code }
}
test('real WebRTC audio, existing pitch detector, mute, reconnect, seek, fallback and cleanup', async ({ browser }, testInfo) => {
  const host = await hostSetup(browser)
  const phoneContext = await browser.newContext({ baseURL: 'http://127.0.0.1:4186', viewport: { width: 390, height: 844 } })
  await syntheticMic(phoneContext)
  const phone = await phoneContext.newPage()
  try {
    await phone.goto('/mic')
    expect(await phone.evaluate(() => window.__micRequests)).toBe(0)
    await phone.getByRole('textbox', { name: 'Code de connexion' }).fill(host.code)
    await phone.getByRole('button', { name: 'Activer le microphone', exact: true }).click()
    await expect(host.page.getByRole('button', { name: 'Autoriser', exact: true })).toBeVisible()
    expect(await phone.evaluate(() => window.__peers.length)).toBe(0) // No transmission before PC approval.
    await host.page.getByRole('button', { name: 'Autoriser', exact: true }).click()
    await expect(phone.getByRole('status')).toHaveText('Téléphone connecté', { timeout: 15000 })
    await expect(host.page.locator('.phone-mic-dialog').getByRole('status')).toHaveText('Téléphone connecté')
    await host.page.getByRole('button', { name: 'Diagnostic WebRTC' }).click()
    await expect(host.page.locator('.phone-mic-dialog pre')).toContainText('audio/opus', { timeout: 10000 })
    const stats = JSON.parse(await host.page.locator('.phone-mic-dialog pre').textContent())
    expect(stats.bytesReceived).toBeGreaterThan(0)
    console.log('Measured loopback WebRTC stats (not phone hardware latency):', JSON.stringify(stats))
    await expect.poll(() => host.page.locator('.phone-mic-dialog [role="meter"]').getAttribute('aria-valuenow')).not.toBe('0')
    expect(await host.page.evaluate(() => window.__silentSinks.length > 0 && window.__silentSinks.every(audio => audio.muted && audio.volume === 0 && !audio.paused))).toBe(true)
    await testInfo.attach('webrtc-stats', { body: JSON.stringify(stats, null, 2), contentType: 'application/json' })
    await phone.screenshot({ path: testInfo.outputPath('phone-connected.png') })
    await host.page.getByRole('button', { name: 'Fermer la connexion téléphone' }).click()
    // Legacy footer div styles must not turn the signal meter into a column.
    for (const width of [1440, 390]) {
      await host.page.setViewportSize({ width, height: 1000 })
      const meter = host.page.locator('.pitch-phone-indicator .phone-mic-level')
      await expect(meter).toBeVisible()
      expect(await meter.evaluate(element => {
        const bounds = element.getBoundingClientRect()
        const panel = element.closest('.perfect-pitch-panel').getBoundingClientRect()
        const bars = [...element.children].map(bar => bar.getBoundingClientRect())
        return bounds.height <= 24 && bounds.bottom <= panel.bottom && bars.every((bar, index) =>
          bar.top >= bounds.top && bar.bottom <= bounds.bottom && bar.right <= bounds.right + 1 &&
          (index === 0 || bar.left > bars[index - 1].right))
      })).toBe(true)
    }
    await host.page.setViewportSize({ width: 1440, height: 1000 })
    await host.page.getByRole('button', { name: 'Lire le morceau', exact: true }).click()
    await expect.poll(() => host.page.locator('.perfect-pitch-point').count()).toBeGreaterThan(0)
    // The existing detector/scoring is deliberately unchanged; verify it consumes
    // the remote samples and evaluates a note, without assuming a particular grade.
    await expect(host.page.locator('.perfect-pitch-result')).toContainText(/PERFECT|GREAT|GOOD|OK|MISS/)
    await phone.getByRole('button', { name: 'Couper le micro', exact: true }).click()
    await expect(host.page.locator('.perfect-pitch-footer')).toContainText('Scoring en pause')
    await phone.getByRole('button', { name: 'Réactiver le micro' }).click()
    await expect(host.page.locator('.perfect-pitch-footer')).not.toContainText('Scoring en pause')
    await host.page.getByRole('button', { name: 'Mettre en pause', exact: true }).click()
    await host.page.getByRole('slider', { name: 'Position dans le morceau' }).press('Home')
    await phone.evaluate(() => window.__sockets.at(-1).close())
    await expect.poll(() => phone.evaluate(() => window.__sockets.length)).toBeGreaterThan(1)
    await expect(phone.getByRole('status')).toHaveText('Téléphone connecté', { timeout: 15000 })
    await expect(host.page.locator('.perfect-pitch-footer')).toContainText('Téléphone connecté')
    expect(await phone.evaluate(() => window.__micRequests)).toBe(1)
    const privateResult = await phone.evaluate(async () => (await fetch('/api/sessions')).status)
    expect(privateResult).toBe(401)
    await host.page.getByRole('button', { name: 'Cet appareil', exact: true }).click()
    await expect(phone.getByRole('alert')).toContainText('Session terminée')
    await expect.poll(() => phone.evaluate(() => window.__peers.every(peer => peer.connectionState === 'closed'))).toBe(true)
    expect(await host.page.evaluate(() => window.__silentSinks.every(audio => audio.paused && audio.srcObject === null))).toBe(true)
    await host.page.getByRole('button', { name: 'Activer le micro', exact: true }).click()
    await expect(host.page.getByRole('button', { name: 'Désactiver', exact: true })).toBeVisible()
    expect(await host.page.evaluate(() => window.__micRequests)).toBe(1)
  } catch (error) {
    for (const [name, page] of [['host', host.page], ['phone', phone]]) {
      const diagnostics = await page.evaluate(async () => {
        const results = []
        for (const peer of window.__peers) {
          const stats = [...(await peer.getStats()).values()]
          results.push({ state: peer.connectionState, ice: peer.iceConnectionState, gathering: peer.iceGatheringState,
            signaling: peer.signalingState, local: peer.localDescription?.type, remote: peer.remoteDescription?.type,
            candidates: stats.filter(item => item.type.includes('candidate')).map(item => ({ type: item.type, state: item.state, candidateType: item.candidateType, requestsSent: item.requestsSent, responsesReceived: item.responsesReceived })) })
        }
        return { signals: window.__signalMessages, peers: results, contexts: window.__audioContexts.map(context => context.state), footer: document.querySelector('.perfect-pitch-footer')?.textContent,
          audio: window.__peers.flatMap(peer => peer.getReceivers().map(receiver => ({ muted: receiver.track.muted, state: receiver.track.readyState, enabled: receiver.track.enabled }))) }
      })
      console.log(name, JSON.stringify(diagnostics))
    }
    throw error
  } finally { await phoneContext.close(); await host.context.close() }
})

for (const ending of ['song-end', 'phone-disconnect']) {
  test(`phone recording in classic karaoke: cancel, capture and ${ending}`, async ({ browser }) => {
    const host = await hostSetup(browser, true)
    const phoneContext = await browser.newContext({ baseURL: 'http://127.0.0.1:4186', viewport: { width: 390, height: 844 } })
    await syntheticMic(phoneContext)
    const phone = await phoneContext.newPage()
    let uploads = 0, payload
    await host.page.route('**/api/performances', async route => {
      uploads++; payload = route.request().postDataBuffer()
      await route.fulfill({ json: { id: 'phone-recorded', url: '/performances/test.webm', createdAt: new Date().toISOString() } })
    })
    try {
      await expect(host.page.locator('.perfect-pitch-panel')).toHaveCount(0)
      await phone.goto('/mic'); await phone.getByRole('textbox', { name: 'Code de connexion' }).fill(host.code)
      await phone.getByRole('button', { name: 'Activer le microphone', exact: true }).click()
      await host.page.getByRole('button', { name: 'Autoriser', exact: true }).click()
      await expect(phone.locator('.phone-mic-state')).toHaveText('Téléphone connecté', { timeout: 15000 })
      await expect.poll(() => host.page.locator('.phone-mic-dialog [role="meter"]').getAttribute('aria-valuenow')).not.toBe('0')
      await host.page.getByRole('button', { name: 'Fermer la connexion téléphone' }).click()
      await host.page.getByRole('button', { name: '● Enregistrer', exact: true }).click()
      await host.page.getByRole('button', { name: 'Annuler', exact: true }).click()
      expect(uploads).toBe(0)
      expect(await host.page.evaluate(() => window.__peers[0].getReceivers()[0].track.readyState)).toBe('live')
      await host.page.getByRole('button', { name: '● Enregistrer', exact: true }).click()
      expect(await host.page.evaluate(() => window.__micRequests)).toBe(0)
      await expect(host.page.getByRole('combobox', { name: 'Microphone pour l’enregistrement' })).toBeDisabled()
      await host.page.getByRole('button', { name: 'Lire le morceau', exact: true }).click()
      await expect(host.page.locator('.record-button')).toHaveText('● Enregistrement')
      await expect(phone.locator('.phone-recording-notice')).toBeVisible()
      await expect(host.page.locator('.track-seek input')).toBeDisabled()
      await expect(host.page.locator('.transport button')).toBeDisabled()
      // Allow a real nonempty audio capture, then simulate the song ending to
      // avoid waiting a full minute. No recorder or WebRTC APIs are mocked.
      await host.page.waitForTimeout(1200)
      if (ending === 'song-end') await host.page.locator('.player-core>audio').first().evaluate(audio => { audio.currentTime = audio.duration - .15 })
      else await phone.getByRole('button', { name: 'Déconnecter', exact: true }).click()
      await expect(host.page.getByRole('button', { name: 'Écouter ma prise', exact: true })).toBeVisible({ timeout: 10000 })
      expect(uploads).toBe(1); expect(payload.length).toBeGreaterThan(1000)
      expect(payload.toString('utf8')).toContain('phone-mic-test')
      const signal = await host.page.evaluate(async () => {
        const blob = new Blob(window.__recordedChunks)
        const context = new OfflineAudioContext(1, 1, 8000)
        const decoded = await context.decodeAudioData(await blob.arrayBuffer())
        const samples = decoded.getChannelData(0)
        return { duration: decoded.duration, rms: Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length) }
      })
      expect(signal.duration).toBeGreaterThan(.5); expect(signal.rms).toBeGreaterThan(.01)
      if (ending === 'phone-disconnect') await expect(host.page.locator('.record-error')).toContainText('prise partielle')
    } finally { await phoneContext.close(); await host.context.close() }
  })
}

test('phone permission denial, invalid code and responsive page do not require an account', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4186', viewport: { width: 844, height: 390 } })
  const page = await context.newPage()
  try {
    await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('denied', 'NotAllowedError') } })
    await page.goto('/mic'); await page.getByRole('textbox', { name: 'Code de connexion' }).fill('999999')
    await page.getByRole('button', { name: 'Activer le microphone', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('refusé')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  } finally { await context.close() }
})
