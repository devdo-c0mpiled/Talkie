import assert from 'node:assert/strict'
import { build } from 'esbuild'

const built = await build({ entryPoints: ['src/lib/live-media.server.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
const { startLiveMediaBridge } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString('base64')}`)

class Socket {
  readyState = 1
  listeners = new Map()
  sent = []
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }
  emit(type, data) { for (const fn of this.listeners.get(type) ?? []) fn({ data }) }
  send(data) { this.sent.push(JSON.parse(data)) }
  close() { this.readyState = 3 }
  accept() {}
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
const media = payload => JSON.stringify({ event: 'media', media: { payload } })
const phone = new Socket()
const live = new Socket()
const ended = []
const received = []
let request
startLiveMediaBridge({
  phone, apiKey: 'fake-key', instructions: 'Help the caller', bufferedEvents: [media('AQ==')],
  fetcher: async (url, init) => { request = { url, init }; return { webSocket: live } },
  onEvent: (event, send) => { received.push(event.type); if (event.type === 'session.started') assert.equal(send({ type: 'test' }), true) },
  onEnd: reason => ended.push(reason),
})
phone.emit('message', media('Ag=='))
await tick()
assert.equal(request.url, 'https://api.openai.com/v1/live/sessions')
assert.equal(request.init.headers.Authorization, 'Bearer fake-key')
assert.equal(request.init.redirect, 'manual')
assert.equal(live.sent[0].type, 'session.start')
assert.deepEqual(live.sent[0].session.audio.format, { type: 'audio/pcmu', rate: 8000 })
assert.equal(live.sent.length, 1)
live.emit('message', JSON.stringify({ type: 'session.started' }))
assert.deepEqual(live.sent.slice(1), [
  { type: 'session.input_audio.append', audio: 'AQ==' },
  { type: 'session.input_audio.append', audio: 'Ag==' },
  { type: 'test' },
])
phone.emit('message', media('Aw=='))
assert.deepEqual(live.sent.at(-1), { type: 'session.input_audio.append', audio: 'Aw==' })
live.emit('message', JSON.stringify({ type: 'session.output_audio.delta', delta: 'BA==' }))
assert.deepEqual(phone.sent, [{ event: 'media', media: { payload: 'BA==' } }])
assert.deepEqual(received, ['session.started', 'session.output_audio.delta'])
phone.emit('message', JSON.stringify({ event: 'stop' }))
assert.deepEqual(ended, ['phone_closed'])
assert.equal(phone.readyState, 3)
assert.equal(live.readyState, 1)
assert.deepEqual(live.sent.at(-1), { type: 'session.close' })
live.emit('message', JSON.stringify({ type: 'session.closed' }))
assert.equal(live.readyState, 3)

const badPhone = new Socket()
const badLive = new Socket()
const failures = []
startLiveMediaBridge({ phone: badPhone, apiKey: 'fake-key', instructions: '', fetcher: async () => ({ webSocket: badLive }), onEnd: reason => failures.push(reason) })
badPhone.emit('message', media('bad base64!'))
await tick()
assert.deepEqual(failures, ['invalid_media'])
assert.equal(badLive.readyState, 3)

const overflowPhone = new Socket()
const overflow = []
startLiveMediaBridge({ phone: overflowPhone, apiKey: 'fake-key', instructions: '', fetcher: () => new Promise(() => {}), onEnd: reason => overflow.push(reason) })
for (let i = 0; i < 100; i++) overflowPhone.emit('message', media('AAAA'.repeat(1000)))
assert.deepEqual(overflow, ['overflow'])
assert.equal(overflowPhone.readyState, 3)
const timeoutPhone = new Socket()
const timeoutLive = new Socket()
const originalSetTimeout = globalThis.setTimeout
const originalClearTimeout = globalThis.clearTimeout
const timers = []
try {
  globalThis.setTimeout = (fn, delay) => { const timer = { fn, delay, cleared: false }; timers.push(timer); return timer }
  globalThis.clearTimeout = timer => { timer.cleared = true }
  startLiveMediaBridge({ phone: timeoutPhone, apiKey: 'fake-key', instructions: '', fetcher: async () => ({ webSocket: timeoutLive }) })
  await Promise.resolve()
  timeoutLive.emit('message', JSON.stringify({ type: 'session.started' }))
  timeoutPhone.emit('message', JSON.stringify({ event: 'stop' }))
  assert.equal(timeoutLive.readyState, 1)
  const closeTimer = timers.at(-1)
  assert.equal(closeTimer.delay, 15_000)
  assert.equal(closeTimer.cleared, false)
  closeTimer.fn()
  assert.equal(timeoutLive.readyState, 3)
} finally {
  globalThis.setTimeout = originalSetTimeout
  globalThis.clearTimeout = originalClearTimeout
}
console.log('GPT-Live media bridge checks passed')
