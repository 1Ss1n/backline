const errors = {
  invalid: 'QR ou code invalide, expiré ou déjà utilisé. Demandez un nouveau QR sur le PC.',
  expired: 'Cette connexion a expiré. Générez un nouveau QR.',
  used: 'Un appareil utilise déjà cette connexion.',
  rate_limited: 'Trop de tentatives. Attendez une minute avant de réessayer.',
  unauthorized: 'Reconnectez-vous à votre compte Backline sur le PC.',
  invalid_state: 'Connexion interrompue. Générez un nouveau QR.',
}

export async function readRtcStats(peer) {
  const report = await peer.getStats()
  const data = { connectionState: peer.connectionState, iceState: peer.iceConnectionState }
  report.forEach(item => {
    if (item.type === 'inbound-rtp' && (item.kind === 'audio' || item.mediaType === 'audio')) {
      data.packetsReceived = item.packetsReceived; data.packetsLost = item.packetsLost
      if (Number.isFinite(item.jitter)) data.jitterMs = item.jitter * 1000
      if (item.jitterBufferEmittedCount > 0) data.meanJitterBufferMs = item.jitterBufferDelay / item.jitterBufferEmittedCount * 1000
      data.codec = report.get(item.codecId)?.mimeType
      data.bytesReceived = item.bytesReceived
      data.audioLevel = item.audioLevel; data.totalAudioEnergy = item.totalAudioEnergy
    }
    if (item.type === 'transport' && item.selectedCandidatePairId) {
      const pair = report.get(item.selectedCandidatePairId)
      if (Number.isFinite(pair?.currentRoundTripTime)) data.rttMs = pair.currentRoundTripTime * 1000
      data.localCandidate = report.get(pair?.localCandidateId)?.candidateType
      data.remoteCandidate = report.get(pair?.remoteCandidateId)?.candidateType
    }
  })
  return data
}

// One signaling socket per participant; it NEVER sends PCM, blobs or recordings.
export class PhoneMicConnection {
  constructor({ role, credentials, stream = null, onUpdate = () => {} }) {
    this.role = role; this.credentials = credentials; this.stream = stream; this.onUpdate = onUpdate
    this.closed = false; this.pendingIce = []; this.serial = Promise.resolve(); this.retries = 0
    this.state = { status: 'connecting', muted: false, remoteStream: null, trackMuted: false, stats: null, error: '' }
    this.connect()
  }
  update(values) { if (!this.closed) { Object.assign(this.state, values); this.onUpdate({ ...this.state }) } }
  send(value) { if (this.socket?.readyState === WebSocket.OPEN) { this.socket.send(JSON.stringify(value)); return true } return false }
  connect() {
    if (this.closed || this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) return
    clearTimeout(this.reconnectTimer)
    this.signalingReady = false
    const url = new URL('/api/phone-mic/socket', location.origin); url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(url)
    this.socket = socket
    socket.onopen = () => {
      const { id, token, code } = this.credentials
      this.send({ type: this.role === 'host' ? 'host' : id ? 'resume' : 'join', id, token, code })
    }
    socket.onmessage = event => {
      if (socket !== this.socket) return
      this.serial = this.serial.then(() => this.message(JSON.parse(event.data))).catch(() => {
        this.update({ error: 'La connexion audio a échoué. Essayez de reconnecter.', status: 'disconnected' })
      })
    }
    socket.onerror = () => {} // close handles transient network errors.
    socket.onclose = () => {
      if (this.closed || socket !== this.socket) return
      this.signalingReady = false
      this.update({ status: 'reconnecting' })
      if (!this.lostAt) this.lostAt = Date.now()
      if (Date.now() - this.lostAt > 40000) { this.finish('error', 'Connexion perdue. Générez un nouveau QR sur le PC.'); return }
      this.reconnectTimer = setTimeout(() => this.connect(), Math.min(5000, 500 * 2 ** this.retries++))
    }
  }
  async message(msg) {
    if (this.closed) return
    if (msg.type === 'joined') this.credentials = { id: msg.id, token: msg.resumeToken }
    if (msg.type === 'ready') {
      this.signalingReady = true
      this.retries = 0; this.lostAt = null
      this.update({ status: msg.state === 'waiting' ? 'waiting' : msg.state === 'pending' ? 'pending' : 'connecting', expiresAt: msg.expiresAt })
    }
    if (msg.type === 'request' || msg.type === 'pending') this.update({ status: 'pending' })
    if (msg.type === 'approved') {
      this.update({ status: 'connecting', error: '', muted: this.role === 'host' ? !!msg.muted : this.state.muted })
      if (!this.peer) this.makePeer(msg.rtc)
      if (this.role === 'host') await this.offer(!!this.peer.remoteDescription)
      else this.send({ type: 'muted', value: this.state.muted })
    }
    if (msg.type === 'offer' && this.role === 'phone' && this.peer) {
      await this.peer.setRemoteDescription({ type: 'offer', sdp: msg.sdp })
      await this.flushIce()
      await this.peer.setLocalDescription(await this.peer.createAnswer())
      this.send({ type: 'answer', sdp: this.peer.localDescription.sdp })
      if (this.peer.connectionState === 'connected') this.update({ status: 'connected' })
    }
    if (msg.type === 'answer' && this.role === 'host' && this.peer) {
      await this.peer.setRemoteDescription({ type: 'answer', sdp: msg.sdp }); await this.flushIce()
      if (this.peer.connectionState === 'connected') this.update({ status: 'connected' })
    }
    if (msg.type === 'ice') {
      if (this.peer?.remoteDescription) await this.peer.addIceCandidate(msg.candidate)
      else this.pendingIce.push(msg.candidate)
    }
    if (msg.type === 'restart' && this.role === 'host') await this.offer(true)
    if (msg.type === 'muted') this.update({ muted: msg.value })
    if (msg.type === 'recording') this.update({ recording: msg.value })
    if (msg.type === 'peer-offline') this.update({ status: 'reconnecting' })
    if (msg.type === 'error') this.finish('error', errors[msg.code] || errors.invalid)
    if (msg.type === 'ended') this.finish(msg.reason === 'expired' ? 'expired' : 'ended', msg.reason === 'refused' ? 'Le PC a refusé cette connexion.' : msg.reason === 'expired' ? 'Le QR ou la session a expiré.' : 'Session terminée.')
  }
  makePeer(config) {
    const peer = new RTCPeerConnection(config)
    this.peer = peer
    if (this.role === 'host') peer.addTransceiver('audio', { direction: 'recvonly' })
    else this.stream?.getAudioTracks().forEach(track => peer.addTrack(track, this.stream))
    // Prefer negotiated Opus when the browser exposes codec preferences; no SDP munging.
    const codecs = globalThis.RTCRtpReceiver?.getCapabilities?.('audio')?.codecs
    if (codecs?.some(codec => /opus/i.test(codec.mimeType))) {
      const ordered = [...codecs.filter(codec => /opus/i.test(codec.mimeType)), ...codecs.filter(codec => !/opus/i.test(codec.mimeType))]
      for (const transceiver of peer.getTransceivers()) { try { transceiver.setCodecPreferences?.(ordered) } catch { /* Browser default remains valid. */ } }
    }
    peer.onicecandidate = ({ candidate }) => { if (candidate) this.send({ type: 'ice', candidate: candidate.toJSON() }) }
    peer.ontrack = event => {
      if (this.role !== 'host' || event.track.kind !== 'audio') return
      const stream = event.streams[0] || new MediaStream([event.track])
      // Start the browser's WebRTC audio playout/decoder without monitoring the
      // microphone. Chromium can otherwise receive RTP while Web Audio reads
      // silence. Both muted and volume=0 are set BEFORE assigning the stream.
      this.remoteSink?.pause()
      this.remoteSink = new Audio()
      this.remoteSink.muted = true
      this.remoteSink.volume = 0
      this.remoteSink.autoplay = true
      this.remoteSink.setAttribute('playsinline', '')
      this.remoteSink.srcObject = stream
      this.resumeAudio()
      this.update({ remoteStream: stream, trackMuted: event.track.muted })
      event.track.onmute = () => this.update({ trackMuted: true })
      event.track.onunmute = () => this.update({ trackMuted: false })
      event.track.onended = () => this.update({ trackMuted: true, status: 'disconnected' })
    }
    const connectionChanged = () => {
      if (this.closed) return
      if (peer.connectionState === 'connected') {
        clearTimeout(this.iceTimer); this.iceTimer = null; clearTimeout(this.connectTimer); this.iceAttempts = 0
        this.update({ status: this.signalingReady ? 'connected' : 'reconnecting', error: '' })
      } else if (['disconnected', 'failed'].includes(peer.connectionState) || peer.iceConnectionState === 'failed') {
        this.update({ status: 'reconnecting' })
        if (!this.iceTimer) this.iceTimer = setTimeout(() => {
          this.iceTimer = null
          if (++this.iceAttempts > 3) { this.update({ status: 'disconnected', error: 'Connexion audio perdue. Reconnectez ou utilisez le micro local.' }); return }
          this.reconnect()
        }, 2000)
      }
    }
    this.iceAttempts = 0
    peer.onconnectionstatechange = connectionChanged; peer.oniceconnectionstatechange = connectionChanged
    this.statsTimer = setInterval(async () => {
      try { const stats = await readRtcStats(peer); this.update({ stats }) } catch { /* Peer may close while collecting. */ }
    }, 2000)
    this.connectTimer = setTimeout(() => {
      if (peer.connectionState !== 'connected') this.update({ status: 'disconnected', error: 'Connexion impossible sur ce réseau. Vérifiez la configuration STUN/TURN ou utilisez le micro local.' })
    }, 25000)
  }
  async offer(restart = false) {
    if (!this.peer || this.peer.signalingState !== 'stable' || this.closed) return
    if (restart) this.peer.restartIce?.()
    await this.peer.setLocalDescription(await this.peer.createOffer({ iceRestart: restart }))
    this.send({ type: 'offer', sdp: this.peer.localDescription.sdp })
  }
  async flushIce() { for (const candidate of this.pendingIce.splice(0)) await this.peer.addIceCandidate(candidate) }
  approve() { this.send({ type: 'approve' }) }
  setRecording(value) { if (this.role === 'host' && this.peer) this.send({ type: 'recording', value }) }
  resumeAudio() {
    this.remoteSink?.play().then(() => this.update({ audioBlocked: false })).catch(() => this.update({ audioBlocked: true }))
  }
  refuse() { this.send({ type: 'refuse' }) }
  reconnect() {
    this.update({ status: 'reconnecting', error: '' })
    if (this.socket?.readyState === WebSocket.OPEN) this.send({ type: 'restart' })
    else if (!this.closed && this.socket?.readyState !== WebSocket.CONNECTING) { clearTimeout(this.reconnectTimer); this.connect() }
  }
  mute(value) {
    this.stream?.getAudioTracks().forEach(track => { track.enabled = !value })
    this.update({ muted: value }); this.send({ type: 'muted', value })
  }
  finish(status, error = '') {
    this.update({ status, error, remoteStream: null }); this.close(false)
  }
  close(notify = true) {
    if (this.closed) return
    if (notify) this.send({ type: 'end' })
    this.closed = true
    clearTimeout(this.reconnectTimer); clearTimeout(this.iceTimer); clearTimeout(this.connectTimer); clearInterval(this.statsTimer)
    this.socket?.close(); this.peer?.close()
    if (this.remoteSink) { this.remoteSink.pause(); this.remoteSink.srcObject = null; this.remoteSink = null }
    this.stream?.getTracks().forEach(track => track.stop())
    this.state.remoteStream?.getTracks().forEach(track => track.stop())
    this.peer = null; this.pendingIce = []
  }
}
