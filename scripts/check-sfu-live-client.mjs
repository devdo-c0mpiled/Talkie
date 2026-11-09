import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { build } from 'esbuild'

const built = await build({ entryPoints: ['src/lib/sfu-live.client.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
const { startSfuLive } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString('base64')}`)

class Track {
  kind = 'audio'
  stopped = false
  stop() { this.stopped = true }
}
class Stream {
  constructor(tracks = []) { this.tracks = tracks }
  getTracks() { return this.tracks }
  getAudioTracks() { return this.tracks.filter(track => track.kind === 'audio') }
  addTrack(track) { this.tracks.push(track) }
}
class Peer extends EventTarget {
  static all = []
  iceGatheringState = 'complete'
  connectionState = 'new'
  localDescription = null
  constructor() { super(); Peer.all.push(this) }
  addTransceiver() { return { mid: '0' } }
  async createOffer() { return { type: 'offer', sdp: 'local offer' } }
  async createAnswer() { return { type: 'answer', sdp: 'local answer' } }
  async setLocalDescription(value) { this.localDescription = value; if (value.type === 'answer') this.connectionState = 'connected' }
  async setRemoteDescription(value) {
    if (value.type === 'answer') this.connectionState = 'connected'
    else {
      const event = new Event('track')
      event.track = new Track()
      event.transceiver = { mid: '1' }
      this.dispatchEvent(event)
    }
  }
  close() { this.connectionState = 'closed'; this.dispatchEvent(new Event('connectionstatechange')) }
}
globalThis.RTCPeerConnection = Peer
globalThis.MediaStream = Stream
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
let microphone
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { async getUserMedia() { microphone = new Track(); return new Stream([microphone]) } } } })

const requests = []
const stops = []
let session = 0
let failSubscription = false
let failClose = false
const options = {
  async control(request) {
    requests.push(request)
    if (request.operation === 'session/new') return { sessionId: `session-${++session}` }
    if (request.operation === 'renegotiate') return {}
    if (request.operation === 'tracks/close') return { tracks: [{ mid: request.body.tracks[0].mid, ...(failClose ? { errorCode: 'close_failed' } : {}) }] }
    if (request.body.tracks[0].location === 'local') return { tracks: [{ mid: '0' }], sessionDescription: { type: 'answer', sdp: 'sfu answer' } }
    return { tracks: [{ mid: '1', ...(failSubscription ? { errorCode: 'not_found_track_error' } : {}) }], sessionDescription: { type: 'offer', sdp: 'sfu offer' }, requiresImmediateRenegotiation: true }
  },
  async startBridge(source) { assert.equal(source.sessionId, 'session-1'); return { sessionId: 'bridge-session', trackName: 'assistant' } },
  async stopBridge(source) { stops.push(source) },
}
const result = await startSfuLive(options)
assert.deepEqual(requests.map(request => request.operation), ['session/new', 'tracks/new', 'session/new', 'tracks/new', 'renegotiate'])
assert.equal(requests[1].body.tracks[0].location, 'local')
assert.deepEqual(requests[3].body.tracks, [{ location: 'remote', sessionId: 'bridge-session', trackName: 'assistant' }])
assert.deepEqual(requests[4].body.sessionDescription, { type: 'answer', sdp: 'local answer' })
assert.equal(result.output.getAudioTracks().length, 1)
await result.stop()
await result.stop()
assert.deepEqual(requests.filter(request => request.operation === 'tracks/close').map(request => [request.sessionId, request.body]), [
  ['session-1', { tracks: [{ mid: '0' }], force: true }],
  ['session-2', { tracks: [{ mid: '1' }], force: true }],
])
assert.equal(stops.length, 1)
assert.equal(microphone.stopped, true)
assert.equal(result.output.getAudioTracks()[0].stopped, true)
assert.ok(Peer.all.every(peer => peer.connectionState === 'closed'))

session = 0
failSubscription = true
await assert.rejects(startSfuLive(options), /not_found_track_error/)
assert.equal(stops.length, 2)
assert.equal(microphone.stopped, true)
assert.ok(Peer.all.every(peer => peer.connectionState === 'closed'))

session = 0
failSubscription = false
let releaseBridge
let announceBridge
const bridgeStarted = new Promise(resolve => { announceBridge = resolve })
const delayed = startSfuLive({ ...options, startBridge() {
  announceBridge()
  return new Promise(resolve => { releaseBridge = resolve })
} })
await bridgeStarted
const publisher = Peer.all.at(-1)
publisher.connectionState = 'failed'
publisher.dispatchEvent(new Event('connectionstatechange'))
releaseBridge({ sessionId: 'bridge-session', trackName: 'assistant' })
await assert.rejects(delayed, /connection closed/)
assert.equal(stops.length, 3)
assert.ok(Peer.all.every(peer => peer.connectionState === 'closed'))

session = 0
failClose = true
const failingStop = await startSfuLive(options)
await assert.rejects(failingStop.stop(), /SFU cleanup failed/)
assert.equal(stops.length, 4)
failClose = false

session = 0
let releaseTrack
let announceTrack
const trackStarted = new Promise(resolve => { announceTrack = resolve })
const closeCount = requests.filter(request => request.operation === 'tracks/close').length
const pendingStart = startSfuLive({ ...options, control(request) {
  if (request.operation === 'tracks/new' && request.body.tracks[0].location === 'local') {
    announceTrack()
    return new Promise(resolve => { releaseTrack = resolve })
  }
  return options.control(request)
} })
await trackStarted
const connecting = Peer.all.at(-1)
connecting.connectionState = 'failed'
connecting.dispatchEvent(new Event('connectionstatechange'))
releaseTrack({ tracks: [{ mid: '0' }], sessionDescription: { type: 'answer', sdp: 'sfu answer' } })
await assert.rejects(pendingStart, /connection closed/)
assert.equal(requests.filter(request => request.operation === 'tracks/close').length, closeCount + 1)
console.log('SFU Live client checks passed')
