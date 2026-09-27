import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { normalizeAvatar, avatarPath } from './avatar.js'
import { createPost, listPosts, publicPost, setPostLike, canReadPost } from './postStore.js'

test('likes persist, are idempotent, remain personal and do not expose identities', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'backline-profile-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const file = path.join(root, 'posts.json'), post = createPost('owner', 'Hello', file)
  assert.equal(publicPost(post, 'friend').likeCount, 0)
  assert.equal(setPostLike(post.id, 'friend', true, file).likeCount, 1)
  assert.equal(setPostLike(post.id, 'friend', true, file).likeCount, 1)
  assert.equal(setPostLike(post.id, 'other', true, file).likeCount, 2)
  const reloaded = publicPost(listPosts('owner', file)[0], 'friend')
  assert.equal(reloaded.likedByMe, true); assert.equal(reloaded.likeCount, 2)
  assert.equal('likedBy' in reloaded, false)
  assert.equal(setPostLike(post.id, 'friend', false, file).likeCount, 1)
  assert.equal(setPostLike(post.id, 'friend', false, file).likedByMe, false)
  assert.equal(setPostLike('missing', 'friend', true, file), null)
})
test('private posts require ownership or friendship', () => {
  const post = { ownerId: 'owner' }, friends = (a,b) => a === 'friend' && b === 'owner'
  assert.equal(canReadPost(post, 'owner', friends), true)
  assert.equal(canReadPost(post, 'friend', friends), true)
  assert.equal(canReadPost(post, 'stranger', friends), false)
  assert.equal(canReadPost(null, 'friend', friends), false)
})
test('avatar decoding resizes to JPEG and strips metadata', async () => {
  const source = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#990539' } }).withMetadata().png().toBuffer()
  const result = await normalizeAvatar(source), metadata = await sharp(result).metadata()
  assert.equal(metadata.width, 512); assert.equal(metadata.height, 512); assert.equal(metadata.format, 'jpeg'); assert.equal(metadata.exif, undefined)
  assert.match(path.basename(avatarPath('../../secret')), /^[a-f0-9]{64}\.jpg$/)
})
test('avatar rejects executable/vector payloads, fake images and oversized files', async () => {
  await assert.rejects(normalizeAvatar(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')))
  await assert.rejects(normalizeAvatar(Buffer.from('not a jpeg')))
  await assert.rejects(normalizeAvatar(Buffer.alloc(2 * 1024 * 1024 + 1)))
})
