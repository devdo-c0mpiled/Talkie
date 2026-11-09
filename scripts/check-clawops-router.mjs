import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { Miniflare } from 'miniflare'

// Run after `CI=true npm run build`. This loads only compiled JS, never .dev.vars.
const root = path.resolve('dist/server')
const assets = await readdir(path.join(root, 'assets'))
const names = ['index.js', ...assets.filter(name => name.endsWith('.js')).map(name => `assets/${name}`)]
const modules = Object.fromEntries(await Promise.all(names.map(async name => [name, {
  type: 'esm', contents: await readFile(path.join(root, name), 'utf8'),
}])))
const env = Object.fromEntries(Object.entries({
  CLAWOPS_WEBHOOK_URL: 'https://example.invalid/api/clawops/voice',
  CLAWOPS_SIGNING_KEY: 'synthetic-signing-key',
  CLAWOPS_ACCOUNT_ID: 'synthetic-account',
  CLAWOPS_PHONE_NUMBER: '07000000000',
  OPENAI_API_KEY: 'synthetic-openai-key',
}).map(([name, value]) => [name, { type: 'text', value }]))
const worker = new Miniflare({ workers: [{ config: {
  name: 'synthetic-built-router',
  compatibilityDate: '2026-11-08',
  compatibilityFlags: ['nodejs_compat'],
  manifest: { mainModule: 'index.js', modules },
  env,
} }] })
try {
  assert.equal((await worker.dispatchFetch('https://example.invalid/api/clawops/stream')).status, 400)
  assert.equal((await worker.dispatchFetch('https://other.invalid/api/clawops/stream', { headers: { Upgrade: 'websocket' } })).status, 400)
  const response = await worker.dispatchFetch('https://example.invalid/api/clawops/stream', {
    headers: { Upgrade: 'websocket' },
  })
  assert.equal(response.status, 101, 'the built router must preserve the WebSocket upgrade')
  assert.ok(response.webSocket, 'the built router must return the upgraded WebSocket')
  const socket = response.webSocket
  socket.accept()
  const closed = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('invalid stream was not closed')), 3000)
    socket.addEventListener('close', event => { clearTimeout(timer); resolve(event) })
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('WebSocket error')) })
  })
  socket.send(JSON.stringify({ event: 'invalid' }))
  assert.equal((await closed).code, 1008)
  console.log('Built TanStack Start router preserves the ClawOps WebSocket upgrade')
} finally {
  await worker.dispose()
}
