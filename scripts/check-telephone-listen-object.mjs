import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'
const bundle = await build({ stdin: { contents: `export { TelephoneListen } from './src/lib/telephone-listen-object.server.ts'; export default { fetch(req, env) { const url = new URL(req.url); return env.LISTEN.get(env.LISTEN.idFromName(url.searchParams.get('call'))).fetch(req) } }`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'neutral' })
const worker = new Miniflare({ workers: [{ config: { name: 'listen-test', compatibilityDate: '2026-11-08', env: { LISTEN: { type: 'durable-object', worker: 'listen-test', exportName: 'TelephoneListen' } }, exports: { TelephoneListen: { type: 'durable-object', storage: 'sqlite' } }, manifest: { mainModule: 'worker.mjs', modules: { 'worker.mjs': { type: 'esm', contents: bundle.outputFiles[0].text } } } } }] })
const open = (path, call = 'one') => worker.dispatchFetch(`https://test/${path}?call=${call}`, { headers: { Upgrade: 'websocket' } })
function receiver(socket) {
  const queue = [], waiters = []
  socket.addEventListener('message', event => { const data = JSON.parse(event.data); const resolve = waiters.shift(); if (resolve) resolve(data); else queue.push(data) })
  socket.accept()
  return () => queue.length ? Promise.resolve(queue.shift()) : new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('message timeout')), 3000); waiters.push(value => { clearTimeout(timer); resolve(value) }) })
}
try {
  assert.equal((await open('listen')).status, 409)
  const pubResponse = await open('publish'); assert.equal(pubResponse.status, 101)
  const pub = pubResponse.webSocket, pubNext = receiver(pub)
  assert.equal((await open('publish')).status, 409)
  assert.equal((await open('listen', 'other')).status, 409)
  const listenResponse = await open('listen'); assert.equal(listenResponse.status, 101)
  const listener = listenResponse.webSocket, next = receiver(listener)
  assert.deepEqual(await next(), { type: 'ready' })
  await worker.unsafeEvictDurableObject('listen-test', 'TelephoneListen', { name: 'one', webSockets: 'hibernate' })
  pub.send(JSON.stringify({ track: 'phone', payload: 'AQ==' }))
  assert.deepEqual(await next(), { track: 'phone', payload: 'AQ==' })
  assert.deepEqual(await pubNext(), { type: 'ack' })
  listener.send(JSON.stringify({ type: 'ack' }))
  pub.send(JSON.stringify({ track: 'agent', payload: 'Ag==' }))
  assert.deepEqual(await next(), { track: 'agent', payload: 'Ag==' })
  assert.deepEqual(await pubNext(), { type: 'ack' })
  for (let i = 0; i < 32; i++) pub.send(JSON.stringify({ track: 'phone', payload: 'Aw==' }))
  for (let i = 0; i < 32; i++) assert.deepEqual(await pubNext(), { type: 'ack' })
  for (let i = 0; i < 31; i++) assert.deepEqual(await next(), { track: 'phone', payload: 'Aw==' })
  listener.send(JSON.stringify({ type: 'ack' }))
  pub.send(JSON.stringify({ track: 'phone', payload: 'BA==' }))
  assert.deepEqual(await pubNext(), { type: 'ack' })
  assert.deepEqual(await next(), { track: 'phone', payload: 'BA==' }, 'congested frame was dropped and delivery resumed')
  pub.close(1000, 'Call ended')
  assert.deepEqual(await next(), { type: 'end' })
  assert.equal((await open('listen')).status, 409)
  console.log('Telephone listen Durable Object checks passed')
} finally { await worker.dispose() }
