import { useCallback, useEffect, useState } from 'react'

export async function challengeRequest(path = '', body) {
  const response = await fetch(`/api/challenges${path}`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Défi indisponible.')
  return data
}
export const challengeSocketUrl = () => `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/challenges/socket`
export function useChallenges() {
  const [items, setItems] = useState([]), [error, setError] = useState('')
  const refresh = useCallback(async () => { try { const data = await challengeRequest(); if (!Array.isArray(data)) throw new Error('Réponse invalide du service de défis.'); setItems(data); setError('') } catch (error) { setError(error.message) } }, [])
  useEffect(() => {
    let socket, timer, closed = false
    const connect = () => {
      if (closed) return
      socket = new WebSocket(challengeSocketUrl())
      socket.onopen = refresh
      socket.onmessage = event => { if (JSON.parse(event.data).type === 'challenges-changed') refresh() }
      socket.onclose = () => { if (!closed) timer = setTimeout(connect, 5000) }
    }
    refresh(); connect()
    const poll = setInterval(refresh, 30000)
    return () => { closed = true; clearTimeout(timer); clearInterval(poll); socket?.close() }
  }, [refresh])
  return { items, error, refresh }
}
