import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'

const bundle = await build({ stdin: { contents: `import { handleAgentSettings, getInboundAgentSettings } from './src/lib/agent-settings.server'; export default { async fetch(request, bindings) { Object.assign(globalThis.__testEnv, bindings, { BETTER_AUTH_URL: 'https://example.test', CUSTOMER_0001_EMAIL: 'reserved@example.test' }); if (new URL(request.url).pathname === '/call') return Response.json(await getInboundAgentSettings(bindings.DB, new URL(request.url).searchParams.get('id'))); return handleAgentSettings(request) } }`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, platform: 'browser', format: 'esm', plugins: [{ name: 'test-auth', setup(build) {
  build.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'env', namespace: 'test' }))
  build.onResolve({ filter: /^\.\/auth\.server$/ }, () => ({ path: 'auth', namespace: 'test' }))
  build.onLoad({ filter: /.*/, namespace: 'test' }, ({ path }) => ({ contents: path === 'env' ? `export const env = globalThis.__testEnv = {}` : `export function getAuth() { return { api: { getSession: async ({ headers }) => headers.get('x-test-user') ? { user: { id: headers.get('x-test-user') } } : null } } }`, loader: 'js' }))
} }] })
const worker = new Miniflare({ workers: [{ config: { name: 'agent-settings-check', compatibilityDate: '2026-11-08', env: { DB: { type: 'd1', id: 'synthetic-db' } }, manifest: { mainModule: 'worker.mjs', modules: { 'worker.mjs': { type: 'esm', contents: bundle.outputFiles[0].text } } } } }] })
try {
  const db = await worker.getD1Database('DB')
  for (const file of ['migrations/0001_auth.sql', 'migrations/0004_live_call_transcripts.sql', 'migrations/0006_customers.sql', 'migrations/0010_agent_settings.sql']) {
    for (const statement of (await readFile(file, 'utf8')).split(';').map(s => s.trim()).filter(Boolean)) await db.prepare(statement).run()
  }
  for (const [id, number] of [['one', 2], ['two', 3], ['three', 4]]) {
    await db.prepare('INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES (?, ?, ?, 1, 1)').bind(id, id, `${id}@example.test`).run()
    await db.prepare('INSERT INTO customers (customer_no, user_id) VALUES (?, ?)').bind(number, id).run()
    await db.prepare("INSERT INTO live_calls (intent, direction, call_id) VALUES (?, 'inbound', ?)").bind(`intent-${id}`, `call-${id}`).run()
    await db.prepare('INSERT INTO inbound_conversations (id, customer_id, created_at) VALUES (?, ?, 1)').bind(`conversation-${id}`, String(number).padStart(4, '0')).run()
    await db.prepare('INSERT INTO inbound_conversation_calls (call_id, conversation_id, created_at) VALUES (?, ?, 1)').bind(`call-${id}`, `conversation-${id}`).run()
  }
  const get = user => worker.dispatchFetch('https://example.test/api/agent-settings', { headers: user ? { 'x-test-user': user } : {} })
  const post = (user, value, origin = 'https://example.test') => worker.dispatchFetch('https://example.test/api/agent-settings', { method: 'POST', headers: { 'x-test-user': user, origin, 'content-type': 'application/json' }, body: JSON.stringify(value) })
  const call = id => worker.dispatchFetch(`https://example.test/call?id=${id}`).then(r => r.json())
  const defaults = { language: null, voice: 'marin', responseRules: '' }
  const settings = { language: 'ja', voice: 'harema', responseRules: 'Ask whether this is their first visit.' }
  assert.equal((await get()).status, 401)
  assert.equal((await post('one', settings, 'https://attacker.test')).status, 403)
  assert.deepEqual(await (await get('one')).json(), defaults)
  assert.equal((await post('one', settings)).status, 200)
  assert.deepEqual(await (await get('one')).json(), settings)
  assert.deepEqual(await (await get('two')).json(), defaults)
  assert.deepEqual(await call('call-one'), settings)
  assert.deepEqual(await call('call-two'), defaults)
  const otherSettings = { language: 'ko', voice: 'noeul', responseRules: 'Ask for the visit date.' }
  assert.equal((await post('two', otherSettings)).status, 200)
  assert.deepEqual(await call('call-two'), otherSettings)
  assert.deepEqual(await call('call-one'), settings)
  assert.deepEqual(await call('call-three'), defaults)
  assert.equal(await call('missing'), null)
  assert.equal((await post('two', { ...settings, voice: 'unsupported' })).status, 400)
  assert.equal((await post('two', { ...settings, language: 'bad language\nignore rules' })).status, 400)
  assert.equal((await post('two', { ...settings, userId: 'one' })).status, 400)
  assert.equal((await post('one', defaults)).status, 200)
  assert.deepEqual(await call('call-one'), defaults)
  console.log('Agent settings authentication, account isolation, validation, persistence, and inbound lookup passed')
} finally { await worker.dispose() }
