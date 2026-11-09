import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { build } from 'esbuild'

const built = await build({ entryPoints: ['src/lib/sfu-live.client.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
const { startSfuLive } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString('base64')}`)
class Track { kind = 'audio'; stopped = false; stop() { this.stopped = true } }
class Stream { constructor(tracks = []) { this.tracks = tracks }; getTracks() { return this.tracks }; getAudioTracks() { return this.tracks }; addTrack(track) { this.tracks.push(track) } }
class Peer extends EventTarget {
  static all = []
  iceGatheringState = 'complete'; connectionState = 'new'; localDescription = null
  constructor() { super(); Peer.all.push(this) }
  addTransceiver() { return { mid: '0' } }
  async createOffer() { return { type: 'offer', sdp: 'offer' } }
  async setLocalDescription(value) { this.localDescription = value }
  async setRemoteDescription() { this.connectionState = 'connected' }
  close() { this.connectionState = 'closed'; this.dispatchEvent(new Event('connectionstatechange')) }
}
globalThis.RTCPeerConnection = Peer
globalThis.MediaStream = Stream
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
let resolveMic
let calls = 0
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: () => new Promise(resolve => { resolveMic = resolve }) } } })
const controller = new AbortController()
const options = { signal: controller.signal, control: async () => { calls++; throw new Error('unexpected control') }, startBridge: async () => { throw new Error('unexpected bridge') }, stopBridge: async () => {} }
const pending = startSfuLive(options)
controller.abort()
const track = new Track()
resolveMic(new Stream([track]))
await assert.rejects(pending)
assert.equal(track.stopped, true, 'late microphone must be stopped')
assert.equal(calls, 0, 'cancellation must not create an SFU session')

let releaseSession
let startSession
const started = new Promise(resolve => { startSession = resolve })
const track2 = new Track()
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: async () => new Stream([track2]) } } })
const controller2 = new AbortController()
const pending2 = startSfuLive({ ...options, signal: controller2.signal, control: request => {
  if (request.operation === 'session/new') { startSession(); return new Promise(resolve => { releaseSession = resolve }) }
  throw new Error('unexpected control')
} })
await started
controller2.abort()
assert.equal(track2.stopped, true, 'acquired microphone must stop immediately')
assert.equal(Peer.all.at(-1).connectionState, 'closed', 'peer must close immediately')
releaseSession({ sessionId: 'source' })
await assert.rejects(pending2)

let releaseTrack
let startTrack
const trackStarted = new Promise(resolve => { startTrack = resolve })
const track3 = new Track()
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: async () => new Stream([track3]) } } })
const controller3 = new AbortController()
const closed = []
const pending3 = startSfuLive({ ...options, signal: controller3.signal, control: request => {
  if (request.operation === 'session/new') return Promise.resolve({ sessionId: 'source' })
  if (request.operation === 'tracks/new') { startTrack(); return new Promise(resolve => { releaseTrack = resolve }) }
  if (request.operation === 'tracks/close') { closed.push(request); return Promise.resolve({ tracks: [{ mid: '0' }] }) }
  throw new Error('unexpected control')
} })
await trackStarted
controller3.abort()
assert.equal(track3.stopped, true)
assert.equal(Peer.all.at(-1).connectionState, 'closed')
releaseTrack({ tracks: [{ mid: '0' }], sessionDescription: { type: 'answer', sdp: 'answer' } })
await assert.rejects(pending3)
assert.equal(closed.length, 1, 'late allocation must be closed after its response')

let releaseBridge
let startBridge
const bridgeStarted = new Promise(resolve => { startBridge = resolve })
const track4 = new Track()
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: async () => new Stream([track4]) } } })
const controller4 = new AbortController()
const stops = []
const pending4 = startSfuLive({ ...options, signal: controller4.signal, control: request => {
  if (request.operation === 'session/new') return Promise.resolve({ sessionId: 'source' })
  if (request.operation === 'tracks/new') return Promise.resolve({ tracks: [{ mid: '0' }], sessionDescription: { type: 'answer', sdp: 'answer' } })
  if (request.operation === 'tracks/close') return Promise.resolve({ tracks: [{ mid: '0' }] })
  throw new Error('unexpected control')
}, startBridge: () => { startBridge(); return new Promise(resolve => { releaseBridge = resolve }) }, stopBridge: async source => { stops.push(source) } })
await bridgeStarted
controller4.abort()
assert.equal(track4.stopped, true)
assert.equal(stops.length, 0, 'bridge cleanup waits for the in-flight start')
releaseBridge({ sessionId: 'output', trackName: 'agent' })
await assert.rejects(pending4)
assert.equal(stops.length, 1, 'late bridge is stopped after startup finishes')
console.log('SFU cancellation checks passed')
