import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'

const bundle = await build({
  entryPoints: ['scripts/check-clawops-integration-worker.mjs'], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', external: ['node:*'],
  plugins: [{ name: 'synthetic-bindings', setup(build) {
    build.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'env', namespace: 'mock-env' }))
    build.onLoad({ filter: /.*/, namespace: 'mock-env' }, () => ({ contents: 'export const env = globalThis.__testEnv = {}', loader: 'js' }))
    build.onResolve({ filter: /^@tanstack\/react-start\/server-only$/ }, () => ({ path: 'server-only', namespace: 'mock-env' }))
  } }],
})
const worker = new Miniflare({ workers: [{ config: { name: 'clawops-integration', compatibilityDate: '2026-11-08', compatibilityFlags: ['nodejs_compat'], env: { DB: { type: 'd1', id: 'synthetic-integration-db' } }, manifest: { mainModule: 'worker.mjs', modules: { 'worker.mjs': { type: 'esm', contents: bundle.outputFiles[0].text } } } } }] })
const origin = 'https://example.test'
const url = `${origin}/api/clawops/voice`
const fields = { CallId: 'CA_TEST', AccountId: 'AC_TEST', From: '01012340000', To: '07012340000', CallStatus: 'in-progress', Direction: 'inbound' }
function signedRequest(params, signing = 'synthetic-signing-key') {
  const content = url + Object.keys(params).sort().map(key => key + params[key]).join('')
  return [url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-signature': createHmac('sha256', signing).update(content).digest('base64') }, body: new URLSearchParams(params).toString() }]
}
function streamStart(callId, token) {
  return JSON.stringify({ event: 'start', start: { callId, accountId: 'AC_TEST', streamId: 'MS_TEST', customParameters: { callId, token }, mediaFormat: { encoding: 'audio/x-mulaw', sampleRate: 8000, channels: 1 } } })
}
function nextMessage(socket) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('WebSocket did not receive expected media in 5 seconds')), 5000)
    socket.addEventListener('message', event => { clearTimeout(timer); resolve(JSON.parse(event.data)) }, { once: true })
    socket.addEventListener('close', () => { clearTimeout(timer); reject(Error('WebSocket closed before media')) }, { once: true })
  })
}
try {
  const db = await worker.getD1Database('DB')
  await db.prepare(await readFile('migrations/0003_clawops_stream_tokens.sql', 'utf8')).run()
  assert.equal((await worker.dispatchFetch(...signedRequest(fields, 'forged'))).status, 401)
  const response = await worker.dispatchFetch(...signedRequest(fields))
  assert.equal(response.status, 200)
  const xml = await response.text()
  const token = xml.match(/<Parameter name="token" value="([0-9a-f]{64})"\/>/)?.[1]
  assert.ok(token)
  assert.equal((await worker.dispatchFetch(...signedRequest(fields))).status, 401)
  const upgraded = await worker.dispatchFetch(`${origin}/api/clawops/stream`, { headers: { Upgrade: 'websocket' } })
  assert.equal(upgraded.status, 101)
  const socket = upgraded.webSocket
  assert.ok(socket)
  socket.accept()
  const received = nextMessage(socket)
  socket.send(streamStart(fields.CallId, token))
  socket.send(JSON.stringify({ event: 'media', media: { payload: 'AQID' } }))
  assert.deepEqual(await received, { event: 'media', media: { payload: 'AQID' } })
  const events = await (await worker.dispatchFetch(`${origin}/test/events`)).json()
  assert.equal(events.filter(event => event.type === 'session.start').length, 1)
  assert.ok(events.some(event => event.type === 'session.input_audio.append' && event.audio === 'AQID'))
  const retry = await worker.dispatchFetch(`${origin}/api/clawops/stream`, { headers: { Upgrade: 'websocket' } })
  const replay = retry.webSocket
  assert.ok(replay)
  replay.accept()
  const closed = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Replayed stream token was not rejected')), 5000)
    replay.addEventListener('close', event => { clearTimeout(timer); resolve(event.code) }, { once: true })
  })
  replay.send(streamStart(fields.CallId, token))
  assert.equal(await closed, 1008)
  socket.close(1000)
  console.log('ClawOps webhook and bidirectional media integration passed with a local D1 and mocked OpenAI')
} finally {
  await worker.dispose()
}
