import assert from 'node:assert/strict'
import { build } from 'esbuild'

const built = await build({ entryPoints: ['src/lib/sfu-live-bridge.server.ts', 'src/lib/sfu-audio.server.ts'], bundle: true, write: false, platform: 'node', format: 'esm', outdir: 'unused' })
const module = name => import(`data:text/javascript;base64,${Buffer.from(built.outputFiles.find(file => file.path.endsWith(name)).contents).toString('base64')}`)
const { startSfuLiveBridge } = await module('sfu-live-bridge.server.js')
const { encodeSfuPackets, decodeSfuPacket } = await module('sfu-audio.server.js')
class Socket {
  readyState = 1
  listeners = new Map()
  sent = []
  addEventListener(type, listener) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]) }
  emit(type, data) { for (const listener of this.listeners.get(type) ?? []) listener({ data }) }
  send(data) { this.sent.push(data) }
  accept() {}
  close() { this.readyState = 3 }
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
const events = []
const ended = []
const live = new Socket()
const input = new Socket()
const output = new Socket()
const bridge = startSfuLiveBridge({
  apiKey: 'synthetic', instructions: 'Help', fetcher: async () => ({ webSocket: live }),
  onEvent: event => events.push(event.type), onEnd: (reason, result) => ended.push({ reason, ...result }),
})
bridge.attachInput(input)
const pcm = new Uint8Array(3840)
new DataView(pcm.buffer).setInt16(40, 1200, true)
input.emit('message', encodeSfuPackets(pcm)[0].buffer)
await tick()
const start = JSON.parse(live.sent[0])
assert.deepEqual(start.session.audio.format, { type: 'audio/pcm', rate: 24000 })
assert.equal(live.sent.length, 1, 'input waits for session.started')
live.emit('message', JSON.stringify({ type: 'session.started' }))
assert.equal(JSON.parse(live.sent[1]).type, 'session.input_audio.append')
live.emit('message', JSON.stringify({ type: 'session.output_audio.delta', delta: Buffer.alloc(960).toString('base64') }))
bridge.attachOutput(output)
assert.equal(decodeSfuPacket(output.sent[0]).length, 3840)
input.emit('close')
const reconnected = new Socket()
bridge.attachInput(reconnected)
reconnected.emit('message', encodeSfuPackets(pcm)[0].buffer)
assert.equal(JSON.parse(live.sent.at(-1)).type, 'session.input_audio.append')
live.emit('message', JSON.stringify({ type: 'error', error: { message: 'synthetic nonfatal error' } }))
assert.equal(live.readyState, 1, 'Live error events do not imply session closure')
bridge.stop()
assert.equal(JSON.parse(live.sent.at(-1)).type, 'session.close')
live.emit('message', JSON.stringify({ type: 'session.closed', reason: 'close_requested' }))
await tick()
assert.deepEqual(ended, [{ reason: 'stopped', sessionClosed: true }])
assert.ok(events.includes('session.started'))
assert.equal(output.readyState, 3)
const failed = []
const badLive = new Socket()
const badInput = new Socket()
const badBridge = startSfuLiveBridge({ apiKey: 'synthetic', instructions: '', fetcher: async () => ({ webSocket: badLive }), onEnd: reason => failed.push(reason) })
badBridge.attachInput(badInput)
badInput.emit('message', new Uint8Array([42, 5, 1]).buffer)
await tick()
assert.deepEqual(failed, ['invalid_media'])
assert.equal(badLive.readyState, 3)
console.log('SFU Live bridge synthetic checks passed')
