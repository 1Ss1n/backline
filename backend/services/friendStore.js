import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '..', 'storage', 'auth', 'friendships.json')
const read = () => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : []
const write = (records) => fs.writeFileSync(file, JSON.stringify(records, null, 2), { mode: 0o600 })

export function createRequest(senderId, receiverId) {
  const records = read()
  const existing = records.find((record) => (record.senderId === senderId && record.receiverId === receiverId) || (record.senderId === receiverId && record.receiverId === senderId))
  if (existing) return { request: existing, created: false }
  const request = { id: crypto.randomUUID(), senderId, receiverId, status: 'pending', createdAt: new Date().toISOString() }
  records.push(request); write(records)
  return { request, created: true }
}

export function receivedRequests(userId) { return read().filter((record) => record.receiverId === userId && record.status === 'pending') }
export function acceptedFriends(userId) { return read().filter((record) => record.status === 'accepted' && (record.senderId === userId || record.receiverId === userId)) }
export function areFriends(firstUserId, secondUserId) { return acceptedFriends(firstUserId).some((record) => record.senderId === secondUserId || record.receiverId === secondUserId) }
export function respondToRequest(id, receiverId, status) {
  const records = read(); const index = records.findIndex((record) => record.id === id && record.receiverId === receiverId && record.status === 'pending')
  if (index === -1) return null
  records[index] = { ...records[index], status, respondedAt: new Date().toISOString() }; write(records)
  return records[index]
}
