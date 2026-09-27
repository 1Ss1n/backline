import { test, expect } from '@playwright/test'

// Isolated UI fixtures. Every API/audio request is intercepted; no real account,
// session, recording or microphone is used or modified by this suite.
const user = { id: 'ui-user', username: 'studio', displayName: 'Studio', verified: true, email: 'studio@example.test' }
const lines = [
  { id: 'one', start: 0, end: 3, text: 'Sous les lumières' },
  { id: 'two', start: 3, end: 6, text: 'La scène nous attend' },
  { id: 'blank', start: 6, end: 8, text: '' },
  { id: 'last', start: 8, end: 12, text: 'Une dernière chanson' },
]
const cover = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#638374"/><stop offset="1" stop-color="#282939"/></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/><circle cx="200" cy="170" r="125" fill="none" stroke="#d9e8bf" stroke-width="2"/><circle cx="200" cy="170" r="95" fill="none" stroke="#d9e8bf" stroke-width="2"/><path d="M0 330L400 70" stroke="#d9e8bf" stroke-width="50"/></svg>')
const baseSession = { id: 'ui-song', title: 'Sous les lumières', artist: 'Session de test', coverUrl: cover, createdAt: '2026-09-25T12:00:00Z', stems: { vocalUrl: '/stems/test-vocal.wav', instruUrl: '/stems/test-instru.wav' }, lyricsSource: 'user-edited', lyricsLines: lines, performances: [{ id: 'ui-performance', createdAt: '2026-09-25T12:00:00Z', url: '/performances/test.wav' }] }
function wav() {
  const rate = 8000, count = rate * 12, data = Buffer.alloc(44 + count * 2)
  data.write('RIFF'); data.writeUInt32LE(36 + count * 2, 4); data.write('WAVEfmt ', 8)
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22)
  data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34)
  data.write('data', 36); data.writeUInt32LE(count * 2, 40)
  for (let i = 0; i < count; i++) {
    const envelope = .1 + .9 * Math.sin(i / count * Math.PI * 7) ** 2
    data.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 220 / rate) * 500 * envelope), 44 + i * 2)
  }
  return data
}
async function setup(page, { theme = 'dark', authenticated = true, pitchNotes, sharedPerformances = [] } = {}) {
  await page.routeWebSocket('**/api/challenges/socket', () => {})
  await page.addInitScript((value) => { if (!localStorage.getItem('backline-theme')) localStorage.setItem('backline-theme', value) }, theme)
  const sessions = [
    structuredClone(baseSession),
    { ...structuredClone(baseSession), id: 'ui-pitch', title: 'Une autre scène', coverUrl: null, perfectPitch: { rawNotes: pitchNotes || [{ start: 0, end: 3, midi: 57 }, { start: 3, end: 6, midi: 60 }] }, performances: [] },
    { ...structuredClone(baseSession), id: 'ui-long', title: 'Un titre volontairement très long pour vérifier que la collection reste lisible', coverUrl: '/missing-cover.jpg', performances: [] },
  ]
  await page.route('**/missing-cover.jpg', route => route.fulfill({ status: 404 }))
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    let body = {}
    if (path === '/api/auth/me') return route.fulfill({ status: authenticated ? 200 : 401, json: authenticated ? { user } : {} })
    if (path === '/api/sessions') body = sessions
    else if (path === '/api/challenges') body = []
    else if (path === '/api/friends') body = { friends: [{ id: 'friend', username: 'ami', displayName: 'Camille' }] }
    else if (path === '/api/friends/requests') body = { requests: [{ id: 'request', sender: { username: 'camille', displayName: 'Camille' } }] }
    else if (path.startsWith('/api/users/')) body = { profile: { ...user, isSelf: true, canViewSocial: true, posts: [], sharedPerformances } }
    else if (/\/lyrics\/edit$/.test(path)) {
      const session = sessions.find(item => path.includes(item.id))
      if (route.request().method() === 'PUT') { session.lyricsLines = route.request().postDataJSON().lines; body = { session } }
      else body = { ...session, active: { source: 'user-edited', lines: session.lyricsLines } }
    } else if (path.startsWith('/api/sessions/')) body = sessions.find(item => item.id === path.split('/')[3]) || {}
    return route.fulfill({ json: body })
  })
  const audio = wav()
  await page.route(/\/(stems|performances)\/.*\.wav$/, route => {
    const range = route.request().headers().range
    const start = range ? Number(range.match(/bytes=(\d+)/)?.[1] || 0) : 0
    const headers = { 'Accept-Ranges': 'bytes', 'Content-Length': String(audio.length - start) }
    if (range) headers['Content-Range'] = `bytes ${start}-${audio.length - 1}/${audio.length}`
    return route.fulfill({ status: range ? 206 : 200, headers, contentType: 'audio/wav', body: audio.subarray(start) })
  })
  await page.goto('/')
}
async function nav(page, label) {
  if (page.viewportSize().width <= 600) await page.getByRole('button', { name: 'Ouvrir le menu', exact: true }).click()
  else await page.locator('.studio-sidebar').hover()
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click()
  await page.mouse.move(page.viewportSize().width - 5, 10)
  if (page.viewportSize().width > 600) await expect.poll(() => page.locator('.studio-sidebar').evaluate(el => Math.round(el.getBoundingClientRect().width))).toBe(80)
}
async function screenshot(page, testInfo, name) {
  await page.screenshot({ path: testInfo.outputPath(name + '.png'), fullPage: true })
}
async function noOverflow(page) {
  const overflow = await page.evaluate(() => {
    const targets = [...document.querySelectorAll('.studio-main,.studio-content,.folder-card,.player-core,.console,.lyrics-studio,.profile-page,.auth-page')]
    return targets.filter(el => el.scrollWidth > el.clientWidth + 2).map(el => ({ class: el.className, width: el.clientWidth, scroll: el.scrollWidth }))
  })
  expect(overflow).toEqual([])
}
async function seek(page, value) {
  const slider = page.locator('.track-seek input')
  await expect(slider).toBeEnabled()
  await slider.press('Home')
  for (let i = 0; i < Math.round(value * 10); i++) await slider.press('ArrowRight')
}
for (const width of [1440, 390]) for (const theme of ['dark', 'light']) test(`profile redesign photo likes ${width} ${theme}`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 960 })
  await setup(page, { theme })
  let post = { id: 'post-1', content: 'Une belle session ce soir. Qui relève le défi ?', createdAt: '2026-09-27T12:00:00Z', likeCount: 2, likedByMe: false }, avatarUrl = null
  await page.route('**/api/users/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/like')) { const { liked } = route.request().postDataJSON(); post = { ...post, likedByMe: liked, likeCount: liked ? 3 : 2 }; return route.fulfill({ json: { post } }) }
    if (url.pathname.endsWith('/avatar')) { avatarUrl = cover; return route.fulfill({ json: { avatarUrl, user: { ...user, avatarUrl } } }) }
    return route.fulfill({ json: { profile: { ...user, avatarUrl, isSelf: true, canViewSocial: true, posts: [post], sharedPerformances: [] } } })
  })
  await page.route('**/api/auth/profile', route => route.fulfill({ json: { user: { ...user, avatarUrl, displayName: route.request().postDataJSON().displayName }, message: 'Profil mis à jour.' } }))
  if (width <= 600) await page.getByRole('button', { name: 'Ouvrir le menu', exact: true }).click(); else await page.locator('.studio-sidebar').hover()
  await page.getByRole('button', { name: 'Mon profil', exact: true }).click()
  await page.mouse.move(width - 5, 10)
  await expect(page.locator('.profile-post')).toContainText(post.content)
  await page.getByRole('button', { name: 'Aimer la publication', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Retirer le like', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.profile-like')).toContainText('3')
  await noOverflow(page)
  await page.locator('.studio-main').evaluate(el => el.scrollTop = 0)
  await screenshot(page, testInfo, 'profile')
  await page.getByRole('button', { name: 'Retirer le like', exact: true }).click()
  await expect(page.locator('.profile-like')).toContainText('2')
  await page.getByRole('button', { name: 'Modifier le profil', exact: true }).click()
  const input = page.getByLabel('Choisir une photo de profil', { exact: true })
  await input.setInputFiles({ name: 'invalid.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') })
  await expect(page.locator('.profile-feedback')).toContainText('2 Mo maximum')
  await input.setInputFiles({ name: 'portrait.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') })
  await page.getByRole('button', { name: 'Enregistrer la photo', exact: true }).click()
  await expect(page.locator('.profile-page-avatar img')).toHaveAttribute('src', cover)
  await expect(page.locator('.user-chip img')).toHaveAttribute('src', cover)
  await noOverflow(page)
  await page.locator('.studio-main').evaluate(el => el.scrollTop = 0)
  await screenshot(page, testInfo, 'settings')
  await page.getByLabel('Nom affiché', { exact: true }).fill('Studio nouveau')
  await page.getByRole('button', { name: 'Enregistrer les modifications' }).click()
  await expect(page.locator('.profile-feedback')).toContainText('Profil mis à jour')
  await expect(page.locator('.profile-page-hero h2')).toHaveText('Studio nouveau')
})

for (const width of [1440, 1024, 768, 390]) {
  for (const theme of ['dark', 'light']) {
    test(`responsive ${width}px / ${theme}: studio, cards, karaoke, pitch, editor, profile`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 960 })
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await setup(page, { theme })
      const palette = await page.locator('.studio-app').evaluate(el => {
        const styles = getComputedStyle(el)
        return { accent: styles.getPropertyValue('--accent').trim(), ink: styles.getPropertyValue('--accent-ink').trim(), readable: styles.getPropertyValue('--accent-text').trim() }
      })
      expect(palette).toEqual({ accent: '#990539', ink: '#ffffff', readable: theme === 'dark' ? '#ff8db5' : '#990539' })
      await expect(page.locator('.studio-content h2').first()).toContainText('Ta musique.')
      await expect(page.locator('.process-panel')).toBeVisible()
      await noOverflow(page); await screenshot(page, testInfo, '01-studio')
      await page.getByRole('radio', { name: /Perfect Pitch/ }).click()
      await expect(page.locator('.process-list')).toContainText('Analyse Perfect Pitch')
      await nav(page, 'Mes morceaux')
      await expect(page.locator('.folder-card')).toHaveCount(3)
      await noOverflow(page); await screenshot(page, testInfo, '02-collection')
      await page.getByRole('button', { name: 'Ouvrir la session : Sous les lumières', exact: true }).click()
      await expect(page.locator('.track-seek input')).toBeEnabled()
      await expect(page.locator('.lyrics-line.current')).toHaveAttribute('aria-label', 'Sous les lumières')
      await noOverflow(page); await screenshot(page, testInfo, '03-karaoke')
      await seek(page, 4)
      await expect(page.locator('.lyrics-line.current')).toHaveAttribute('aria-label', 'La scène nous attend')
      await seek(page, 1)
      await expect(page.locator('.lyrics-line.current')).toHaveAttribute('aria-label', 'Sous les lumières')
      await page.getByRole('button', { name: 'Modifier les paroles', exact: true }).click()
      await expect(page.locator('.lyrics-studio textarea')).toBeVisible()
      await noOverflow(page); await screenshot(page, testInfo, '04-editor')
      await nav(page, 'Mes performances')
      await expect(page.locator('.folder-card')).toHaveCount(1)
      await page.getByRole('button', { name: 'Écouter la performance : Sous les lumières' }).click()
      await expect(page.getByRole('button', { name: 'Lire la performance' })).toBeVisible()
      await noOverflow(page)
      await nav(page, 'Mes morceaux')
      await page.getByRole('button', { name: 'Ouvrir la session : Une autre scène' }).click()
      await expect(page.locator('.perfect-pitch-panel')).toBeVisible()
      await noOverflow(page); await screenshot(page, testInfo, '05-pitch')
      if (width <= 600) await page.getByRole('button', { name: 'Ouvrir le menu', exact: true }).click()
      else await page.locator('.studio-sidebar').hover()
      await page.getByRole('button', { name: 'Mon profil' }).click()
      await expect(page.locator('.profile-page')).toBeVisible()
      await noOverflow(page); await screenshot(page, testInfo, '06-profile')
      expect(errors).toEqual([])
    })
  }
}
test('theme persists through reload; mobile menu supports keyboard; auth uses same theme', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page)
  await page.getByRole('button', { name: 'Ouvrir le menu', exact: true }).click()
  await page.getByRole('button', { name: 'Activer le mode clair' }).click()
  await expect(page.locator('.studio-app')).toHaveAttribute('data-theme', 'light')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Ouvrir le menu', exact: true })).toBeFocused()
  await page.reload()
  await expect(page.locator('.studio-app')).toHaveAttribute('data-theme', 'light')
  await page.route('**/api/auth/me', route => route.fulfill({ status: 401, json: {} }))
  await page.reload()
  await expect(page.locator('.auth-page')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('button', { name: 'Activer le mode sombre' }).click()
  await expect(page.locator('.auth-page')).toHaveAttribute('data-theme', 'dark')
  await noOverflow(page)
})
test('real audio: play, pause, seek, volumes, end and replay keep two stems aligned', async ({ page }) => {
  await setup(page)
  await nav(page, 'Mes morceaux')
  const card = page.getByRole('button', { name: 'Ouvrir la session : Sous les lumières', exact: true })
  await card.focus(); await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Lire le morceau', exact: true }).click()
  await expect.poll(() => page.locator('audio').evaluateAll(items => items.every(audio => !audio.paused))).toBe(true)
  await page.getByRole('button', { name: 'Mettre en pause', exact: true }).click()
  await expect.poll(() => page.locator('audio').evaluateAll(items => items.every(audio => audio.paused))).toBe(true)
  await seek(page, 4)
  const before = await page.locator('.lyrics-line.current').innerHTML()
  await page.waitForTimeout(400)
  expect(await page.locator('.lyrics-line.current').innerHTML()).toBe(before)
  expect(await page.locator('audio').evaluateAll(items => Math.abs(items[0].currentTime - items[1].currentTime))).toBeLessThan(.1)
  await page.getByRole('slider', { name: 'Voix', exact: true }).press('Home')
  expect(await page.locator('audio').first().evaluate(el => el.volume)).toBe(0)
  await page.getByRole('slider', { name: 'Instru', exact: true }).press('End')
  expect(await page.locator('audio').nth(1).evaluate(el => el.volume)).toBe(1)
  await seek(page, 6.5)
  await expect(page.locator('.lyrics-line.current')).toHaveAttribute('aria-label', 'Interlude musical')
  await seek(page, 11.8)
  await page.getByRole('button', { name: 'Lire le morceau', exact: true }).click()
  await expect.poll(() => page.locator('audio').first().evaluate(el => el.ended)).toBe(true)
  await page.getByRole('button', { name: 'Lire le morceau', exact: true }).click()
  await expect.poll(() => page.locator('audio').first().evaluate(el => !el.paused && el.currentTime < 3)).toBe(true)
})
test('reduced motion disables Aurora; edited blank line saves and returns to karaoke', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await setup(page)
  expect(await page.locator('.soft-aurora canvas').evaluate(el => getComputedStyle(el).animationName)).toBe('none')
  await nav(page, 'Mes morceaux')
  await page.getByRole('button', { name: 'Ouvrir la session : Sous les lumières', exact: true }).click()
  await page.getByRole('button', { name: 'Modifier les paroles', exact: true }).click()
  const text = page.locator('.lyrics-inspector textarea')
  await text.fill(''); await text.blur()
  await page.getByRole('button', { name: 'Sauvegarder', exact: true }).click()
  await expect(page.locator('.lyrics-footer')).toContainText('Sauvegardé.')
  await page.getByRole('button', { name: 'Retour au karaoké' }).click()
  await expect(page.locator('.lyrics-line.current')).toHaveAttribute('aria-label', 'Interlude musical')
  await seek(page, 4)
  await expect(page.locator('.lyrics-line.current')).toHaveAttribute('aria-label', 'La scène nous attend')
})
test('auth responsive in both themes', async ({ page }, testInfo) => {
  await setup(page, { authenticated: false })
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 960 })
    for (const theme of ['dark', 'light']) {
      if (await page.locator('.auth-page').getAttribute('data-theme') !== theme) await page.locator('.landscape-orb').click()
      await noOverflow(page); await screenshot(page, testInfo, `auth-${width}-${theme}`)
    }
  }
})
for (const [width, theme] of [[1440, 'dark'], [390, 'light']]) test(`community Spotlight ${width} ${theme}`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 900 })
  await setup(page, { theme })
  await page.route('**/api/friends/search?*', route => route.fulfill({ json: { users: [{ id: 'new-user', username: 'alex', displayName: 'Alex' }] } }))
  let requests = 0
  await page.route('**/api/friends/requests', route => {
    if (route.request().method() === 'POST') { requests++; return route.fulfill({ json: { success: true } }) }
    return route.fulfill({ json: { requests: [] } })
  })
  if (width <= 600) await page.getByRole('button', { name: 'Ouvrir le menu', exact: true }).click()
  else await page.locator('.studio-sidebar').hover()
  const trigger = page.getByRole('button', { name: 'Rechercher', exact: true })
  // The community trigger shares the navigation's size and shape.
  await expect.poll(async () => {
    const a = await trigger.boundingBox(), b = await page.getByRole('navigation').getByRole('button', { name: 'Studio', exact: true }).boundingBox()
    return Math.abs(a.width - b.width) + Math.abs(a.height - b.height)
  }).toBeLessThan(2)
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Rechercher dans la communauté' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('textbox')).toBeFocused()
  await dialog.getByRole('textbox').fill('alex')
  await expect(dialog.getByRole('button', { name: 'Voir le profil de Alex' })).toBeVisible()
  await screenshot(page, testInfo, 'spotlight-results')
  await dialog.getByRole('button', { name: 'Ajouter alex', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Demande envoyée à alex' })).toBeDisabled()
  expect(requests).toBe(1)
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  if (width <= 600) await page.getByRole('button', { name: 'Ouvrir le menu', exact: true }).click()
  else await page.locator('.studio-sidebar').hover()
  await trigger.click()
  await dialog.getByRole('textbox').fill('alex')
  await dialog.getByRole('button', { name: 'Voir le profil de Alex' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.locator('.profile-page')).toBeVisible()
})

test('sidebar resizes main content on desktop and remains an overlay on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await setup(page)
  const mainLeft = () => page.locator('.studio-main').evaluate(el => Math.round(el.getBoundingClientRect().left))
  const mainWidth = () => page.locator('.studio-main').evaluate(el => Math.round(el.getBoundingClientRect().width))
  await expect.poll(mainLeft).toBe(80)
  const transitions = await page.locator('.studio-sidebar').evaluate(el => {
    const sidebar = getComputedStyle(el), app = getComputedStyle(el.parentElement)
    return { duration: sidebar.transitionDuration, delay: sidebar.transitionDelay, blur: sidebar.backdropFilter, appDuration: app.transitionDuration, easing: sidebar.transitionTimingFunction, appEasing: app.transitionTimingFunction }
  })
  expect(transitions.duration).toBe('0.16s')
  expect(transitions.delay).toBe('0s')
  expect(transitions.blur).toBe('none')
  expect(transitions.appDuration).toBe(transitions.duration)
  expect(transitions.appEasing).toBe(transitions.easing)
  await page.locator('.studio-sidebar').hover()
  await expect.poll(mainLeft).toBe(272)
  await expect.poll(mainWidth).toBe(1168)
  await noOverflow(page)
  await page.mouse.move(1400, 20)
  await expect.poll(mainLeft).toBe(80)
  await expect.poll(mainWidth).toBe(1360)
  await page.keyboard.press('Tab')
  await page.getByRole('navigation').getByRole('button', { name: 'Studio', exact: true }).focus()
  await expect.poll(mainLeft).toBe(272)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Ouvrir le menu', exact: true }).click()
  await expect(page.locator('.studio-sidebar')).toBeVisible()
  await expect.poll(mainLeft).toBe(0)
  await expect.poll(mainWidth).toBe(390)
  await noOverflow(page)
})

test('sidebar globe, wordmark and notifications are usable without layout collisions', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await setup(page)
  await page.locator('.studio-sidebar').hover()
  await expect(page.locator('.brand-name')).toBeVisible()
  expect(await page.locator('.brand-name').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThan(16)
  await page.getByRole('button', { name: "Demandes d'amis" }).click()
  await expect(page.locator('.notifications-popover')).toContainText('@camille')
  const above = await page.locator('.notifications-popover').evaluate(el => {
    const rect = el.getBoundingClientRect()
    return el.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))
  })
  expect(above).toBe(true)
  await screenshot(page, testInfo, 'sidebar-notifications')
  await page.getByRole('button', { name: 'Fermer les notifications' }).click()
  await page.locator('.studio-sidebar').hover()
  await page.getByRole('button', { name: 'Activer le mode clair' }).click()
  await expect(page.locator('.studio-app')).toHaveAttribute('data-theme', 'light')
  await screenshot(page, testInfo, 'sidebar-light')
})
test('Perfect Pitch synthetic microphone: permission, activation, pause, seek, end and replay', async ({ page }) => {
  await setup(page)
  await nav(page, 'Mes morceaux')
  await page.getByRole('button', { name: 'Ouvrir la session : Une autre scène' }).click()
  await page.getByRole('button', { name: 'Activer le micro', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Désactiver', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Lire le morceau', exact: true }).click()
  await expect.poll(() => page.locator('audio').first().evaluate(el => el.currentTime)).toBeGreaterThan(.5)
  await page.getByRole('button', { name: 'Mettre en pause', exact: true }).click()
  await seek(page, 4)
  await expect(page.locator('.lyrics-line.current')).toHaveAttribute('aria-label', 'La scène nous attend')
  await page.getByRole('button', { name: 'Désactiver', exact: true }).click()
  await expect(page.locator('.perfect-pitch-footer')).toContainText('Microphone désactivé')
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied in test', 'NotAllowedError') }
  })
  await page.getByRole('button', { name: 'Activer le micro', exact: true }).click()
  await expect(page.locator('.perfect-pitch-footer')).toContainText('Permission refusée')
  await seek(page, 11.8)
  await page.getByRole('button', { name: 'Lire le morceau', exact: true }).click()
  await expect(page.locator('.perfect-pitch-summary')).toBeVisible()
  await page.getByRole('button', { name: 'Rejouer', exact: true }).click()
  await expect(page.locator('.perfect-pitch-summary')).toHaveCount(0)
  await expect(page.locator('.track-seek input')).toHaveValue('0')
})
test('recording still starts with audio, disallows pause/seek and offers playback at the end', async ({ page }) => {
  await setup(page)
  await page.route('**/api/performances', route => route.fulfill({ json: { id: 'recorded-test', url: '/performances/test.wav', createdAt: new Date().toISOString() } }))
  await nav(page, 'Mes morceaux')
  await page.getByRole('button', { name: 'Ouvrir la session : Sous les lumières', exact: true }).click()
  await page.getByRole('button', { name: '● Enregistrer', exact: true }).click()
  await expect(page.locator('.record-unit')).toContainText('Appuyez sur lecture')
  await page.getByRole('button', { name: 'Lire le morceau', exact: true }).click()
  await expect(page.locator('.record-button')).toHaveText('● Enregistrement')
  await expect(page.locator('.transport button')).toBeDisabled()
  await expect(page.locator('.track-seek input')).toBeDisabled()
  await expect(page.locator('.record-saved button')).toBeVisible({ timeout: 18000 })
  await page.locator('.record-saved button').click()
  await expect(page.getByRole('button', { name: 'Lire la performance' })).toBeVisible()
  await page.getByRole('button', { name: 'Lire la performance' }).click()
  await expect.poll(() => page.locator('audio').evaluateAll(items => items.every(audio => !audio.paused))).toBe(true)
})
test('profile fills main layout and collapsed active navigation is square', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await setup(page)
  const active = await page.locator('.nav-item.active').boundingBox()
  expect(Math.abs(active.width - active.height)).toBeLessThanOrEqual(1)
  expect(active.width).toBe(44)
  await page.getByRole('button', { name: 'Mon profil' }).click()
  await page.mouse.move(1900, 10)
  await expect.poll(() => page.locator('.studio-sidebar').evaluate(el => Math.round(el.getBoundingClientRect().width))).toBe(80)
  await expect(page.locator('.profile-page')).toBeVisible()
  const main = await page.locator('.studio-main').boundingBox()
  const profile = await page.locator('.profile-page').boundingBox()
  expect(profile.width).toBe(main.width)
  expect(profile.height).toBeGreaterThanOrEqual(main.height)
})
test('lyric highlight advances between timeupdate events and freezes exactly on pause', async ({ page }, testInfo) => {
  await setup(page)
  await nav(page, 'Mes morceaux')
  await page.getByRole('button', { name: 'Ouvrir la session : Sous les lumières', exact: true }).click()
  await expect(page.locator('.lyrics-line.current')).toBeVisible()
  await page.evaluate(() => {
    window.lyricPaints = 0
    new MutationObserver(records => { if (records.some(record => record.attributeName === 'data-progress')) window.lyricPaints++ })
      .observe(document.querySelector('.lyrics-line.current'), { subtree: true, attributes: true })
  })
  await page.getByRole('button', { name: 'Lire le morceau', exact: true }).click()
  await page.waitForTimeout(700)
  const paints = await page.evaluate(() => window.lyricPaints)
  await testInfo.attach('lyric-paints', { body: JSON.stringify({ paints, observedMilliseconds: 700 }), contentType: 'application/json' })
  expect(paints).toBeGreaterThan(12)
  await page.getByRole('button', { name: 'Mettre en pause', exact: true }).click()
  const frozen = await page.locator('.lyrics-line.current').innerHTML()
  await page.waitForTimeout(350)
  expect(await page.locator('.lyrics-line.current').innerHTML()).toBe(frozen)
  await seek(page, 4)
  await expect(page.locator('.lyrics-line.current')).toHaveAttribute('aria-label', 'La scène nous attend')
  await seek(page, 1)
  await expect(page.locator('.lyrics-line.current')).toHaveAttribute('aria-label', 'Sous les lumières')
})
for (const width of [1440, 390]) {
  for (const theme of ['dark', 'light']) {
    test(`shared waveform playback ${width}px / ${theme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 960 })
      await setup(page, { theme, sharedPerformances: [{ id: 'shared-one', url: '/performances/test.wav', sharedAt: '2026-09-25T12:00:00Z', track: { title: 'Sous les lumières', artist: 'Session de test', coverUrl: cover, instruUrl: '/stems/test-instru.wav' } }] })
      if (width <= 600) await page.getByRole('button', { name: 'Ouvrir le menu', exact: true }).click()
      else await page.locator('.studio-sidebar').hover()
      await page.getByRole('button', { name: 'Mon profil', exact: true }).click()
      await page.locator('.shared-performance-card>button').click()
      const player = page.locator('.shared-wave-player')
      await expect(player.locator('.performance-waveform')).toHaveAttribute('data-status', 'ready')
      await expect(player.locator('.wave-base rect')).toHaveCount(80)
      expect(await player.locator('.wave-base rect').evaluateAll(bars => new Set(bars.map(bar => Math.round(Number(bar.getAttribute('height'))))).size)).toBeGreaterThan(5)
      const position = player.getByRole('slider', { name: 'Position dans la performance' })
      await expect(position).toBeEnabled()
      await player.getByRole('button', { name: 'Lire la performance' }).click()
      await expect.poll(() => player.locator('audio').evaluateAll(items => items.every(audio => !audio.paused))).toBe(true)
      await player.getByRole('button', { name: 'Mettre en pause' }).click()
      await expect.poll(() => player.locator('audio').evaluateAll(items => items.every(audio => audio.paused))).toBe(true)
      await position.click({ position: { x: (await position.boundingBox()).width / 2, y: 15 } })
      await expect.poll(() => player.locator('audio').first().evaluate(audio => audio.currentTime)).toBeGreaterThan(4)
      expect(await player.locator('audio').evaluateAll(items => Math.abs(items[0].currentTime - items[1].currentTime))).toBeLessThan(.1)
      await position.press('Home')
      await position.press('ArrowRight')
      await expect(position).toHaveValue('0.1')
      await player.getByRole('slider', { name: 'Volume de la voix', exact: true }).press('Home')
      await player.getByRole('slider', { name: 'Volume de l’instrumentale', exact: true }).press('End')
      expect(await player.locator('audio').evaluateAll(items => items.map(audio => audio.volume))).toEqual([1, 0])
      await player.getByRole('button', { name: 'Lire la performance' }).click()
      await position.press('End')
      await expect(player.getByRole('button', { name: 'Lire la performance' })).toBeVisible()
      await player.getByRole('button', { name: 'Lire la performance' }).click()
      await expect.poll(() => player.locator('audio').first().evaluate(audio => audio.currentTime)).toBeLessThan(2)
      await player.getByRole('button', { name: 'Mettre en pause' }).click()
      await noOverflow(page)
      await page.locator('.shared-performance-card').screenshot({ path: testInfo.outputPath('shared-waveform.png') })
      await page.locator('.shared-performance-card>button').click()
      await expect(player).toHaveCount(0)
    })
  }
}

for (const theme of ['dark', 'light']) {
  test(`compact console and Perfect Pitch fit a laptop viewport / ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1366, height: 768 })
    await setup(page, { theme })
    await nav(page, 'Mes morceaux')
    await page.getByRole('button', { name: 'Ouvrir la session : Une autre scène' }).click()
    await expect(page.locator('.perfect-pitch-panel')).toBeVisible()
    await page.locator('.studio-main').evaluate(main => { main.scrollTop = 0 })
    const consoleBox = await page.locator('.console').boundingBox()
    expect(consoleBox.height).toBeLessThan(85)
    expect(consoleBox.y + consoleBox.height).toBeLessThanOrEqual(768)
    await expect(page.getByRole('button', { name: 'Lire le morceau', exact: true })).toBeInViewport()
    await expect(page.locator('.perfect-pitch-panel')).toBeInViewport({ ratio: 1 })
    await noOverflow(page)
    await page.screenshot({ path: testInfo.outputPath('compact-console.png') })
  })
}

for (const width of [1440, 390]) {
  for (const theme of ['dark', 'light']) {
    test(`Perfect Pitch multi-octave notes stay visible ${width}px / ${theme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 960 })
      await setup(page, { theme, pitchNotes: [
        { start: 0, end: 3, midi: 36 },
        { start: 3, end: 6, midi: 96 },
        { start: 20, end: 22, midi: 127 },
      ] })
      await nav(page, 'Mes morceaux')
      await page.getByRole('button', { name: 'Ouvrir la session : Une autre scène' }).click()
      await expect(page.locator('.perfect-pitch-note')).toHaveCount(2)
      const assertNotesFit = async () => {
        const clipped = await page.locator('.perfect-pitch-window').evaluate(grid => {
          const bounds = grid.getBoundingClientRect()
          return [...grid.querySelectorAll('.perfect-pitch-note')].filter(note => {
            const rect = note.getBoundingClientRect()
            return rect.top < bounds.top || rect.bottom > bounds.bottom || rect.left < bounds.left - 1 || rect.right > bounds.right + 1
          }).map(note => note.dataset.midi)
        })
        expect(clipped).toEqual([])
      }
      await assertNotesFit()
      await expect(page.locator('.pitch-target-readout strong')).toHaveText('C2')
      await seek(page, 4)
      await expect(page.locator('.pitch-target-readout strong')).toHaveText('C7')
      await expect(page.locator('.perfect-pitch-note.is-current')).toHaveAttribute('data-midi', '96')
      await assertNotesFit()
      await noOverflow(page)
      await page.locator('.pitch-panel-adaptive').screenshot({ path: testInfo.outputPath('pitch-multi-octave.png') })
      await seek(page, 1)
      await expect(page.locator('.pitch-target-readout strong')).toHaveText('C2')
      await assertNotesFit()
    })
  }
}



