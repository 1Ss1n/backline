import { test, expect } from '@playwright/test'
async function account(browser, id, width = 1440) {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4196', viewport: { width, height: 960 } })
  await context.addCookies([{ name: 'backline_session', value: id, url: 'http://127.0.0.1:4196' }])
  const page = await context.newPage()
  await page.addInitScript(() => {
    window.__cameraRequests = 0
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = constraints => { if (constraints.video) window.__cameraRequests++; return original(constraints) }
  })
  await page.goto('/'); return { context, page }
}
async function nav(page, name) {
  if (page.viewportSize().width <= 600) await page.getByRole('button', { name: 'Ouvrir le menu', exact: true }).click()
  else await page.locator('.studio-sidebar').hover()
  await page.getByRole('navigation').getByRole('button', { name, exact: true }).click()
  await page.mouse.move(page.viewportSize().width - 10, 10)
}
async function sing(page) {
  await page.getByRole('button', { name: 'Préparer ma performance' }).click()
  await page.getByRole('button', { name: '● Enregistrer', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Annuler', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Lire le morceau', exact: true }).click()
  await expect(page.locator('.challenge-recording-notice')).toContainText('3…')
  await expect(page.locator('.challenge-results article')).toHaveCount(1, { timeout: 20000 })
}
test('real two-account async duel, hidden result, recording, rematch and counter-challenge', async ({ browser }) => {
  const a = await account(browser, 'a'), b = await account(browser, 'b', 390)
  try {
    await nav(a.page, 'Mes amis'); await a.page.getByRole('button', { name: 'Défier', exact: true }).click()
    await a.page.getByRole('button', { name: 'Ouvrir la session : Morceau A' }).click()
    await a.page.getByRole('button', { name: 'Envoyer le défi' }).click()
    await expect(a.page.locator('.challenge-room')).toContainText('Invitation en attente')
    await b.page.getByRole('button', { name: 'Ouvrir le menu', exact: true }).click()
    await b.page.getByRole('button', { name: "Demandes d'amis", exact: true }).click()
    await expect(b.page.locator('.notifications-popover')).toContainText('vous défie sur Morceau A')
    await b.page.locator('.notifications-popover').getByRole('button', { name: 'Accepter', exact: true }).click()
    await expect(a.page.getByRole('button', { name: 'Préparer ma performance' })).toBeVisible()
    await b.page.getByRole('button', { name: 'Je suis prêt', exact: true }).click()
    await expect(a.page.locator('.challenge-duel')).toContainText('Prêt ✓')
    await sing(a.page)
    await expect(b.page.locator('.challenge-results article')).toHaveCount(0)
    const before = await b.page.evaluate(async () => (await fetch('/api/challenges')).json())
    expect(before[0].performances.a).toEqual({ submitted: true })
    await b.page.getByRole('button', { name: 'Préparer ma performance' }).click()
    await b.page.getByRole('button', { name: '● Enregistrer', exact: true }).click()
    await expect(b.page.getByRole('button', { name: 'Annuler', exact: true })).toBeVisible()
    await b.page.getByRole('button', { name: 'Lire le morceau', exact: true }).click()
    await expect(b.page.locator('.challenge-results article')).toHaveCount(2, { timeout: 20000 })
    await expect(a.page.locator('.challenge-results article')).toHaveCount(2)
    await a.page.getByRole('button', { name: 'Écouter la performance' }).first().click()
    await a.page.getByRole('button', { name: 'Lire la performance', exact: true }).click()
    await expect(a.page.getByRole('button', { name: 'Mettre en pause', exact: true })).toBeVisible()
    expect(await a.page.evaluate(() => window.__cameraRequests)).toBe(0)
    expect(await b.page.evaluate(() => window.__cameraRequests)).toBe(0)
    await b.page.getByRole('button', { name: 'Choisir mon morceau et défier Joueur A' }).click()
    await expect(b.page.getByRole('button', { name: 'Ouvrir la session : Morceau B' })).toBeVisible()
    await expect(b.page.getByRole('button', { name: 'Ouvrir la session : Morceau A' })).toHaveCount(0)
    await b.page.getByRole('button', { name: 'Ouvrir la session : Morceau B' }).click(); await b.page.getByRole('button', { name: 'Envoyer le défi' }).click()
    await expect(b.page.locator('.challenge-room')).toContainText('Morceau B')
    await a.page.getByRole('button', { name: 'Revanche sur ce morceau' }).click()
    await expect(a.page.locator('.challenge-room')).toContainText('Invitation en attente')
    const rounds = await a.page.evaluate(async () => (await fetch('/api/challenges')).json())
    expect(rounds).toHaveLength(3); expect(new Set(rounds.map(item => item.seriesId)).size).toBe(1)
    expect(rounds.filter(item => item.status === 'PENDING').every(item => !Object.keys(item.performances).length)).toBe(true)
  } finally { await a.context.close(); await b.context.close() }
})
test('camera video-only connection, cleanup and reconnect do not start a performance', async ({ browser }) => {
  const a = await account(browser, 'a'), b = await account(browser, 'b')
  try {
    const item = await a.page.evaluate(async () => (await fetch('/api/challenges', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ opponentId: 'b', trackId: 'a-song' }) })).json())
    await b.page.evaluate(async id => fetch(`/api/challenges/${id}/accept`, { method: 'POST' }), item.id)
    for (const peer of [a,b]) { await nav(peer.page, 'Mes défis'); await peer.page.locator('.challenge-list button').filter({ hasText: 'Morceau A' }).filter({ hasText: 'À jouer' }).first().click(); await peer.page.getByRole('button', { name: 'Activer la caméra', exact: true }).click() }
    await expect(a.page.locator('.challenge-camera')).toContainText('Caméras connectées', { timeout: 15000 })
    await expect(b.page.locator('.challenge-camera')).toContainText('Caméras connectées')
    await expect.poll(() => a.page.locator('video').last().evaluate(video => video.videoWidth)).toBeGreaterThan(0)
    await a.page.getByRole('button', { name: 'Désactiver la caméra' }).click()
    await expect(b.page.locator('.challenge-camera')).toContainText('a quitté la vidéo')
    await a.page.getByRole('button', { name: 'Activer la caméra', exact: true }).click()
    await expect(a.page.locator('.challenge-camera')).toContainText('Caméras connectées', { timeout: 15000 })
    await expect(a.page.getByRole('button', { name: 'Préparer ma performance' })).toBeVisible()
  } finally { await a.context.close(); await b.context.close() }
})
test('challenge accepts Phone Micro and camera permission denial does not block singing', async ({ browser }) => {
  const host = await account(browser, 'b'), friend = await account(browser, 'a')
  const phoneContext = await browser.newContext({ baseURL: 'http://127.0.0.1:4196' }), phone = await phoneContext.newPage()
  try {
    const item = await host.page.evaluate(async () => (await fetch('/api/challenges', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ opponentId: 'a', trackId: 'b-song' }) })).json())
    await friend.page.evaluate(async id => fetch(`/api/challenges/${id}/accept`, { method: 'POST' }), item.id)
    await nav(host.page, 'Mes défis'); await host.page.locator('.challenge-list button').filter({ hasText: 'Morceau B' }).filter({ hasText: 'À jouer' }).first().click()
    await host.page.evaluate(() => { const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); navigator.mediaDevices.getUserMedia = constraints => constraints.video ? Promise.reject(new DOMException('Denied', 'NotAllowedError')) : original(constraints) })
    await host.page.getByRole('button', { name: 'Activer la caméra', exact: true }).click()
    await expect(host.page.locator('.challenge-camera')).toContainText('Permission caméra refusée')
    await host.page.getByRole('button', { name: 'Préparer ma performance' }).click()
    await host.page.getByRole('combobox', { name: 'Microphone pour l’enregistrement' }).selectOption('phone')
    await expect(host.page.locator('.phone-mic-code')).toBeVisible()
    const code = (await host.page.locator('.phone-mic-code').textContent()).replace(/\s/g, '')
    await phone.goto('/mic'); await phone.getByRole('textbox', { name: 'Code de connexion' }).fill(code)
    await phone.getByRole('button', { name: 'Activer le microphone', exact: true }).click()
    await host.page.getByRole('button', { name: 'Autoriser', exact: true }).click()
    await expect(phone.locator('.phone-mic-state')).toHaveText('Téléphone connecté', { timeout: 15000 })
    await host.page.getByRole('button', { name: 'Fermer la connexion téléphone' }).click()
    await host.page.getByRole('button', { name: '● Enregistrer', exact: true }).click()
    await expect(host.page.getByRole('button', { name: 'Annuler', exact: true })).toBeVisible()
    await host.page.getByRole('button', { name: 'Lire le morceau', exact: true }).click()
    await expect(phone.locator('.phone-recording-notice')).toBeVisible({ timeout: 10000 })
    await expect(host.page.locator('.challenge-results article')).toHaveCount(1, { timeout: 20000 })
  } finally { await host.context.close(); await friend.context.close(); await phoneContext.close() }
})
for (const width of [1440,1024,768,390]) for (const theme of ['dark','light']) test(`challenge layout ${width} ${theme}`, async ({ browser }, testInfo) => {
  const { context, page } = await account(browser, 'a', width)
  try {
    await page.evaluate(theme => localStorage.setItem('backline-theme', theme), theme); await page.reload(); await nav(page, 'Mes amis')
    await expect(page.locator('.friend-card')).toBeVisible()
    await page.getByRole('heading', { name: 'Mes amis', exact: true }).click()
    if (width > 600) await expect.poll(() => page.locator('.studio-sidebar').evaluate(el => el.getBoundingClientRect().width)).toBeLessThan(100)
    await page.screenshot({ path: testInfo.outputPath('friends.png'), fullPage: true })
    await nav(page, 'Mes défis')
    const item = await page.evaluate(async () => (await fetch('/api/challenges', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ opponentId: 'b', trackId: 'a-song' }) })).json())
    const other = await account(browser, 'b')
    try { await other.page.evaluate(async id => fetch(`/api/challenges/${id}/accept`, { method: 'POST' }), item.id) } finally { await other.context.close() }
    await page.reload(); await nav(page, 'Mes défis')
    await page.locator('.challenge-list button').filter({ hasText: 'À jouer' }).first().click()
    await page.getByRole('button', { name: 'Préparer ma performance' }).click()
    await expect(page.locator('.karaoke-lyrics-panel')).toBeVisible()
    const cameras = await page.locator('.challenge-video-tile').evaluateAll(tiles => tiles.map(tile => { const { x,y,width,height } = tile.getBoundingClientRect(); return { x,y,width,height } }))
    expect(cameras[1].y).toBeGreaterThanOrEqual(cameras[0].y + cameras[0].height)
    expect(cameras[1].x).toBe(cameras[0].x)
    if (width >= 1024) {
      const lyrics = await page.locator('.karaoke-lyrics-panel').boundingBox()
      expect(lyrics.x).toBeGreaterThan(cameras[0].x + cameras[0].width)
      expect(lyrics.width).toBeGreaterThan(width === 1440 ? 650 : 400)
    }
    expect(await page.locator('.studio-main').evaluate(el => el.scrollWidth <= el.clientWidth + 2)).toBe(true)
    await page.locator('.studio-main').evaluate(el => el.scrollTop = 0)
    await page.screenshot({ path: testInfo.outputPath('challenge.png'), fullPage: true })
  } finally { await context.close() }
})
