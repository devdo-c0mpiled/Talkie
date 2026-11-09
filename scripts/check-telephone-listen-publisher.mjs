import assert from 'node:assert/strict'
import { build } from 'esbuild'
const built = await build({ entryPoints: ['src/lib/telephone-listen-object.server.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
const { createTelephoneListenPublisher } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString('base64')}`)
class Socket {
  readyState = 1
  listeners = new Map()
  sent = []
  accept() {}
  addEventListener(type, fn) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]) }
  emit(type, data) { for (const fn of this.listeners.get(type) ?? []) fn({ data }) }
  send(data) { this.sent.push(JSON.parse(data)) }
  close() { this.readyState = 3 }
}
let resolve
const delayed = new Promise(r => { resolve = r })
const socket = new Socket()
const namespace = { idFromName: name => name, get: () => ({ fetch: () => delayed }) }
const tap = createTelephoneListenPublisher(namespace, 'call')
tap.audio('phone', 'AQ==')
resolve({ webSocket: socket })
await new Promise(r => setTimeout(r, 0))
const payload = Buffer.alloc(20_000, 42).toString('base64')
tap.audio('agent', payload)
assert.ok(Buffer.concat(socket.sent.map(item => Buffer.from(item.payload, 'base64'))).equals(Buffer.from(payload, 'base64')), 'all chunks must preserve audio')
assert.ok(socket.sent.every(item => item.track === 'agent' && item.payload.length <= 10664))
for (let i = 0; i < 100; i++) tap.audio('phone', 'AQ==')
assert.equal(socket.sent.length, 32, 'in-flight frames must be bounded')
socket.emit('message', JSON.stringify({ type: 'ack' }))
tap.audio('phone', 'Ag==')
assert.equal(socket.sent.length, 33)
tap.end(); assert.equal(socket.readyState, 3)
let release
const lateSocket = new Socket()
const late = createTelephoneListenPublisher({ idFromName: x => x, get: () => ({ fetch: () => new Promise(r => { release = r }) }) }, 'call')
late.end(); release({ webSocket: lateSocket })
await new Promise(r => setTimeout(r, 0))
assert.equal(lateSocket.readyState, 3, 'late publisher must close after call ends')
console.log('Telephone listen publisher checks passed')
