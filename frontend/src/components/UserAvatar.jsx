import { useState } from 'react'

export default function UserAvatar({ user, className = '' }) {
  const [failedUrl, setFailedUrl] = useState(null)
  return <span className={`user-picture ${className}`}>{user?.avatarUrl && user.avatarUrl !== failedUrl ? <img src={user.avatarUrl} alt="" onError={() => setFailedUrl(user.avatarUrl)} /> : (user?.displayName || user?.username || 'U').charAt(0).toUpperCase()}</span>
}
