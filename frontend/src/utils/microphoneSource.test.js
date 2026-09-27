import test from 'node:test'
import assert from 'node:assert/strict'
import { localMicrophoneStream, microphoneAvailable } from './microphoneSource.js'
test('only supported singing constraints are requested', async () => {
  let constraints
  const result = await localMicrophoneStream({ getSupportedConstraints: () => ({ echoCancellation: true, channelCount: true }), getUserMedia: async value => { constraints = value; return 'stream' } })
  assert.equal(result, 'stream')
  assert.deepEqual(constraints, { audio: { echoCancellation: { ideal: false }, channelCount: { ideal: 1 } }, video: false })
})
test('constraint fallback does not repeat a refused permission prompt', async () => {
  let calls = 0
  const devices = { getUserMedia: async options => { if (++calls === 1) throw Object.assign(new Error(), { name: 'OverconstrainedError' }); assert.equal(options.audio, true); return 'fallback' } }
  assert.equal(await localMicrophoneStream(devices), 'fallback'); assert.equal(calls, 2)
  calls = 0
  await assert.rejects(localMicrophoneStream({ getUserMedia: async () => { calls++; throw Object.assign(new Error(), { name: 'NotAllowedError' }) } }))
  assert.equal(calls, 1)
})
test('mute, lost track and reconnect suspend availability; local fallback is independent', () => {
  assert.equal(microphoneAvailable('phone', 'active', 'connected', false), true)
  assert.equal(microphoneAvailable('phone', 'active', 'connected', true), false)
  assert.equal(microphoneAvailable('phone', 'active', 'connected', false, true), false)
  assert.equal(microphoneAvailable('phone', 'active', 'reconnecting', false), false)
  assert.equal(microphoneAvailable('local', 'active', 'disconnected', true), true)
  assert.equal(microphoneAvailable('local', 'inactive', 'connected', false), false)
})
