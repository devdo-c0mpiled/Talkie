import assert from 'node:assert/strict'
import { build } from 'esbuild'
const built = await build({ entryPoints: ['src/lib/live-media.server.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
const { startLiveMediaBridge } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString('base64')}`)
class Socket {
  readyState = 1
  listeners = new Map()
  sent = []
  addEventListener(type, fn) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]) }
  emit(type, data) { for (const fn of this.listeners.get(type) ?? []) fn({ data }) }
  send(data) { this.sent.push(JSON.parse(data)) }
  close() { this.readyState = 3 }
  accept() {}
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
const media = payload => JSON.stringify({ event: 'media', media: { payload } })
const phone = new Socket(), live = new Socket(), audio = [], ended = []
startLiveMediaBridge({ phone, apiKey: 'test', instructions: '', bufferedEvents: [media('AQ==')], fetcher: async () => ({ webSocket: live }),
  onAudio: (track, payload) => { audio.push({ track, payload }); if (payload === 'Ag==') throw Error('listen failed') },
  onAudioEnd: () => ended.push(true),
})
await tick()
phone.emit('message', media('Ag=='))
live.emit('message', JSON.stringify({ type: 'session.started' }))
live.emit('message', JSON.stringify({ type: 'session.output_audio.delta', delta: 'Aw==' }))
assert.deepEqual(audio, [{ track: 'phone', payload: 'AQ==' }, { track: 'phone', payload: 'Ag==' }, { track: 'agent', payload: 'Aw==' }])
assert.deepEqual(live.sent.filter(x => x.type === 'session.input_audio.append').map(x => x.audio), ['AQ==', 'Ag=='])
assert.deepEqual(phone.sent, [{ event: 'media', media: { payload: 'Aw==' } }])
phone.emit('message', JSON.stringify({ event: 'stop' }))
assert.deepEqual(ended, [true])
live.emit('message', JSON.stringify({ type: 'session.closed', reason: 'close_requested' }))
await tick()
console.log('Telephone listen bridge checks passed')
