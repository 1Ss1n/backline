import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const postsPath = path.join(__dirname, '..', 'storage', 'auth', 'posts.json')
const read = () => fs.existsSync(postsPath) ? JSON.parse(fs.readFileSync(postsPath, 'utf8')) : []
const write = (posts) => fs.writeFileSync(postsPath, JSON.stringify(posts, null, 2), { mode: 0o600 })

export function listPosts(ownerId) {
  return read().filter((post) => post.ownerId === ownerId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

export function createPost(ownerId, content) {
  const post = { id: crypto.randomUUID(), ownerId, content, createdAt: new Date().toISOString() }
  const posts = read(); posts.push(post); write(posts)
  return post
}

export function deletePost(ownerId, postId) {
  const posts = read(); const index = posts.findIndex((post) => post.id === postId && post.ownerId === ownerId)
  if (index < 0) return false
  posts.splice(index, 1); write(posts)
  return true
}
