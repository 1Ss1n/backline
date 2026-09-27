export async function localMicrophoneStream(devices = navigator.mediaDevices) {
  if (!devices?.getUserMedia) throw new Error('Microphone indisponible. Utilisez HTTPS et un navigateur récent.')
  const supported = devices.getSupportedConstraints?.() || {}
  const audio = {}
  for (const name of ['echoCancellation', 'noiseSuppression', 'autoGainControl']) if (supported[name]) audio[name] = { ideal: false }
  if (supported.channelCount) audio.channelCount = { ideal: 1 }
  if (supported.latency) audio.latency = { ideal: 0 }
  try { return await devices.getUserMedia({ audio, video: false }) }
  catch (error) {
    if (error.name !== 'OverconstrainedError') throw error
    return devices.getUserMedia({ audio: true, video: false })
  }
}

export function microphoneError(error) {
  if (error?.name === 'NotAllowedError') return 'Accès au microphone refusé. Autorisez-le dans les réglages du navigateur.'
  if (error?.name === 'NotFoundError') return 'Aucun microphone disponible sur cet appareil.'
  if (error?.name === 'NotReadableError') return 'Le microphone est occupé par une autre application.'
  return error?.message || 'Le microphone est indisponible.'
}

export function microphoneAvailable(source, localStatus, phoneState, muted, trackMuted = false) {
  return source === 'phone' ? phoneState === 'connected' && !muted && !trackMuted && localStatus === 'active' : localStatus === 'active'
}
