import assert from 'node:assert/strict'
import { readFile, access } from 'node:fs/promises'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'

assert.equal(await access('src/lib/chat-history.server.ts').then(() => true, () => false), true, 'chat history handler must exist')
const bundle = await build({ entryPoints: ['src/lib/chat-history.server.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
const { handleChatHistory } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
// Use the real route dispatcher and synthetic session boundary; never load production auth or secrets.
const routeBundle = await build({ entryPoints: ['src/routes/api.incoming.ts'], bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{
  name: 'synthetic-route-boundaries', setup(build) {
    build.onResolve({ filter: /^@tanstack\/react-router$/ }, () => ({ path: 'router', namespace: 'synthetic' }))
    build.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'env', namespace: 'synthetic' }))
    build.onResolve({ filter: /auth\.server$/ }, () => ({ path: 'auth', namespace: 'synthetic' }))
    build.onLoad({ filter: /.*/, namespace: 'synthetic' }, ({ path }) => ({ contents: path === 'router'
      ? 'export const createFileRoute = () => options => options'
      : path === 'env' ? 'export const env = globalThis.__chatHistoryTestEnv'
      : 'export const getAuth = () => ({ api: { getSession: async ({ headers }) => { const id = headers.get("x-synthetic-user"); return id ? { user: { id } } : null } } })', loader: 'js' }))
  },
}] })
const worker = new Miniflare({ workers: [{ config: { name: 'chat-history-check', compatibilityDate: '2026-11-08', env: { DB: { type: 'd1', id: 'synthetic-chat-history' } }, manifest: { mainModule: 'worker.mjs', modules: { 'worker.mjs': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' } } } } }] })
try {
  const db = await worker.getD1Database('DB')
  for (const file of ['migrations/0001_auth.sql', 'migrations/0004_live_call_transcripts.sql', 'migrations/0006_customers.sql', 'migrations/0009_chat_history.sql']) {
    for (const statement of (await readFile(file, 'utf8')).split(';').map(s => s.trim()).filter(Boolean)) await db.prepare(statement).run()
  }
  for (const [id, number] of [['alice', 2], ['bob', 3]]) {
    await db.prepare('INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES (?, ?, ?, 1, 1)').bind(id, id, `${id}@example.test`).run()
    await db.prepare('INSERT INTO customers (customer_no, user_id) VALUES (?, ?)').bind(number, id).run()
  }
  for (const [id, owner] of [['a1', '0002'], ['a2', '0002'], ['b1', '0003']]) {
    await db.prepare('INSERT INTO inbound_conversations (id, customer_id, created_at) VALUES (?, ?, 1)').bind(id, owner).run()
  }
  globalThis.__chatHistoryTestEnv = { DB: db }
  const { Route } = await import(`data:text/javascript;base64,${Buffer.from(routeBundle.outputFiles[0].text).toString('base64')}`)
  const routeRequest = (userId, conversation, message) => {
    const headers = new Headers(userId ? { 'x-synthetic-user': userId } : {})
    if (message) headers.set('content-type', 'application/json')
    const request = new Request(`https://example.test/api/incoming?history=${conversation}`, { method: message ? 'POST' : 'GET', headers, ...(message ? { body: JSON.stringify(message) } : {}) })
    return Route.server.handlers[request.method]({ request })
  }
  assert.equal((await routeRequest(null, 'a1')).status, 401, 'route rejects anonymous session')
  assert.equal((await routeRequest('bob', 'a1')).status, 404, 'route enforces session customer ownership')
  assert.equal((await routeRequest('alice', 'a1')).status, 200, 'route permits the owning session')
  const routeMessage = { id: 'route-message', role: 'user', text: 'hello' }
  assert.equal((await routeRequest(null, 'a1', routeMessage)).status, 401, 'route rejects anonymous writes')
  assert.equal((await routeRequest('bob', 'a1', routeMessage)).status, 404, 'route rejects another customer writing')
  assert.equal((await routeRequest('alice', 'a2', routeMessage)).status, 200, 'route permits the owner to write')
  const request = (userId, conversation, message) => handleChatHistory(new Request(`https://example.test/api/incoming?history=${conversation}`, message === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(message) }), { db, userId })
  const message = { id: 'm1', role: 'user', text: '안녕하세요' }
  assert.equal((await request('alice', 'a1', message)).status, 200)
  assert.equal((await request('alice', 'a1', message)).status, 200, 'retry is idempotent')
  const loaded = await (await request('alice', 'a1')).json()
  assert.deepEqual(loaded.messages, [message], 'saved message is restored')
  const reply = { id: 'm2', role: 'assistant', text: '도와드릴게요' }
  assert.equal((await request('alice', 'a1', reply)).status, 200)
  assert.deepEqual((await (await request('alice', 'a1')).json()).messages, [message, reply], 'messages retain order')
  assert.equal((await request('alice', 'a2', { ...message, id: 'm3' })).status, 200)
  assert.equal((await (await request('alice', 'a1')).json()).messages.length, 2)
  assert.deepEqual((await (await request('alice', 'a2')).json()).messages, [routeMessage, { ...message, id: 'm3' }], 'conversations are isolated')
  assert.equal((await request('bob', 'a1')).status, 404)
  assert.equal((await request('bob', 'a1', message)).status, 404)
  assert.equal((await request(null, 'a1')).status, 401)
  assert.equal((await request('alice', 'a1', { ...message, role: 'system' })).status, 400)
  assert.equal((await request('alice', 'a1', { ...message, text: '' })).status, 400)
  assert.equal((await request('alice', 'a1', { ...message, text: 'different' })).status, 409)
  const retry = { id: 'retry', role: 'assistant', text: 'saved once' }
  assert.deepEqual((await Promise.all([request('alice', 'a1', retry), request('alice', 'a1', retry)])).map(response => response.status), [200, 200])
  assert.equal((await (await request('alice', 'a1')).json()).messages.filter(item => item.id === 'retry').length, 1)
  const foreignOrigin = new Request('https://example.test/api/incoming?history=a1', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://other.test' }, body: JSON.stringify(message) })
  assert.equal((await handleChatHistory(foreignOrigin, { db, userId: 'alice' })).status, 403)
  const escapedText = { id: 'escaped', role: 'user', text: '\u0001'.repeat(10000) }
  assert.equal((await request('alice', 'a1', escapedText)).status, 200, 'valid escaped text fits within body limit')
  console.log('Chat history persistence, ownership, isolation, retries and validation passed')
} finally { delete globalThis.__chatHistoryTestEnv; await worker.dispose() }
