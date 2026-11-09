import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { build } from 'esbuild'

const built = await build({
  entryPoints: ['src/lib/sfu-live-object.server.ts'], bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'delegation-stub', setup(build) {
    build.onResolve({ filter: /^\.\/live-delegation\.server$/ }, () => ({ path: 'delegation', namespace: 'test' }))
    build.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export function createLiveDelegation() { return { handle() {}, close() {} } }', loader: 'js' }))
  } }],
})
const { SfuLiveSession } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString('base64')}`)
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })

class Socket extends EventTarget {
  readyState = 1
  accept() {}
  send() {}
  close() { this.readyState = 3 }
}

function harness({ deferredAt = 0, failSecond = false } = {}) {
  const storage = new Map()
  const requests = []
  let release
  let started
  const allocationStarted = new Promise(resolve => { started = resolve })
  const blocked = new Promise(resolve => { release = resolve })
  const state = {
    id: { toString: () => 'durable-id' },
    storage: {
      async get(key) { return structuredClone(storage.get(key)) },
      async put(key, value) { storage.set(key, structuredClone(value)) },
      async delete(key) { storage.delete(key) },
      async setAlarm(value) { storage.set('alarm', value) },
      async deleteAlarm() { storage.delete('alarm') },
    },
    blockConcurrencyWhile(fn) { this.ready = fn() },
  }
  let creates = 0
  globalThis.fetch = async (url, init) => {
    if (url === 'https://api.openai.com/v1/live/sessions') return { webSocket: new Socket() }
    const body = JSON.parse(init.body)
    requests.push({ url, body })
    if (url.endsWith('/adapters/websocket/close')) return Response.json({ tracks: body.tracks })
    assert.ok(url.endsWith('/adapters/websocket/new'))
    const spec = body.tracks[0]
    const index = ++creates
    if (index === deferredAt) { started(); await blocked }
    if (failSecond && index === 2) return Response.json({ tracks: [{ trackName: spec.trackName, errorCode: 'failed' }] }, { status: 503 })
    return Response.json({ tracks: [{ trackName: spec.trackName, endpoint: spec.endpoint, adapterId: `adapter-${index}`, ...(spec.location === 'local' ? { sessionId: 'output-session' } : {}) }] })
  }
  const object = new SfuLiveSession(state, { REALTIME_SFU_APP_ID: 'app', REALTIME_SFU_APP_SECRET: 'synthetic', SFU_LIVE_PUBLIC_ORIGIN: 'https://example.com', OPENAI_API_KEY: 'synthetic' })
  const start = () => object.fetch(new Request('https://object/start', { method: 'POST', body: JSON.stringify({ sessionId: 'source', trackName: 'mic', instructions: 'synthetic' }) }))
  const stop = () => object.fetch(new Request('https://object/stop', { method: 'POST' }))
  const closed = () => requests.filter(request => request.url.endsWith('/close')).map(request => request.body.tracks[0].adapterId)
  return { object, state, storage, requests, allocationStarted, release, start, stop, closed }
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0))

{
  const test = harness()
  await test.state.ready
  const response = await test.start()
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.equal(result.sessionId, 'output-session')
  assert.deepEqual(test.requests.filter(r => r.url.endsWith('/new')).map(r => r.body.tracks[0].location), ['local', 'remote'])
  const denied = await test.object.fetch(new Request(`https://object/media/input/${'0'.repeat(64)}`, { headers: { Upgrade: 'websocket' } }))
  assert.equal(denied.status, 404)
  assert.equal((await test.stop()).status, 200)
  await tick()
  assert.deepEqual(test.closed().sort(), ['adapter-1', 'adapter-2'])
  assert.equal(test.storage.has('session'), false)
}
{
  const test = harness({ deferredAt: 1 })
  await test.state.ready
  const starting = test.start()
  await test.allocationStarted
  assert.equal((await test.stop()).status, 200)
  test.release()
  assert.equal((await starting).status, 502)
  await tick()
  assert.deepEqual(test.closed(), ['adapter-1'])
  assert.equal(test.requests.filter(r => r.url.endsWith('/new')).length, 1)
  assert.equal(test.storage.has('session'), false)
}
{
  const test = harness({ deferredAt: 2 })
  await test.state.ready
  const starting = test.start()
  await test.allocationStarted
  assert.equal((await test.stop()).status, 200)
  test.release()
  assert.equal((await starting).status, 502)
  await tick()
  assert.deepEqual(test.closed().sort(), ['adapter-1', 'adapter-2'])
  assert.equal(test.storage.has('session'), false)
}
{
  const test = harness({ failSecond: true })
  await test.state.ready
  assert.equal((await test.start()).status, 502)
  await tick()
  assert.deepEqual(test.closed(), ['adapter-1'])
  assert.equal(test.storage.has('session'), false)
}
console.log('SFU Live object lifecycle checks passed')
