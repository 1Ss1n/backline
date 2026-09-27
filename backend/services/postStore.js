import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const postsPath = path.join(__dirname, '..', 'storage', 'auth', 'posts.json')
const read = (file = postsPath) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : []
const write = (posts, file = postsPath) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temporary = `${file}.${crypto.randomUUID()}.tmp`
  try { fs.writeFileSync(temporary, JSON.stringify(posts, null, 2), { mode: 0o600 }); fs.renameSync(temporary, file) }
  finally { fs.rmSync(temporary, { force: true }) }
}

export const publicPost = (post, viewerId) => {
  const { likedBy = [], ...content } = post
  return { ...content, likeCount: new Set(likedBy).size, likedByMe: likedBy.includes(viewerId) }
}
export function findPost(id) { return read().find(post => post.id === id) || null }
export const canReadPost = (post, viewerId, areFriends) => !!post && (post.ownerId === viewerId || areFriends(viewerId, post.ownerId))
export function withPostLike(post, viewerId, liked) {
  const likes = new Set(post.likedBy || [])
  if (liked) likes.add(viewerId); else likes.delete(viewerId)
  return { ...post, likedBy: [...likes] }
}
export function setPostLike(id, viewerId, liked, file = postsPath) {
  const posts = read(file), index = posts.findIndex(post => post.id === id)
  if (index < 0) return null
  posts[index] = withPostLike(posts[index], viewerId, liked)
  write(posts, file)
  return publicPost(posts[index], viewerId)
}

export function listPosts(ownerId, file = postsPath) {
  return read(file).filter((post) => post.ownerId === ownerId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

export function createPost(ownerId, content, file = postsPath) {
  const post = { id: crypto.randomUUID(), ownerId, content, createdAt: new Date().toISOString() }
  const posts = read(file); posts.push(post); write(posts, file)
  return post
}

export function deletePost(ownerId, postId) {
  const posts = read(); const index = posts.findIndex((post) => post.id === postId && post.ownerId === ownerId)
  if (index < 0) return false
  posts.splice(index, 1); write(posts)
  return true
}
