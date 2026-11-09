import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'

const bundle = await build({ entryPoints: ['src/lib/managed-calls.server.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
const { createManagedCall, handleManagedCalls } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const uiBundle = await build({ entryPoints: ['src/routes/managed-calls.tsx'], bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{ name: 'ui-isolation', setup(build) {
  build.onResolve({ filter: /^(@tanstack\/react-router|react(?:\/jsx-runtime)?|\.\.\/lib\/auth\.functions|\.\.\/lib\/auth-client)$/ }, args => ({ path: args.path, namespace: 'stub' }))
  build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const jsx = (type, props) => ({ type, props }); export const jsxs = jsx; export const createFileRoute = () => x => x; export const redirect = () => {}; export const useEffect = f => globalThis.uiTest.effect = f; export const useRef = value => globalThis.uiTest.ref ??= { current: value }; export const useState = initial => { const i = globalThis.uiTest.index++; if (!(i in globalThis.uiTest.state)) globalThis.uiTest.state[i] = initial; return [globalThis.uiTest.state[i], value => globalThis.uiTest.state[i] = value] }; export const getCurrentUser = () => {}; export const authClient = { useSession: () => ({ data: { user: { id: "alice" } } }) }', loader: 'js' }))
} }] })
const { managedAttemptKey, Route } = await import(`data:text/javascript;base64,${Buffer.from(uiBundle.outputFiles[0].text).toString('base64')}`)
assert.notEqual(managedAttemptKey('alice'), managedAttemptKey('bob'), 'each authenticated account retains its own uncertain attempt')
const originalFetch = globalThis.fetch
for (const status of [400, 401, 403, 409, 503]) {
  const storage = new Map()
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }
  globalThis.uiTest = { state: [], index: 0 }
  let posts = 0
  globalThis.fetch = async (url, options) => {
    if (options?.method === 'POST') { posts++; return new Response(null, { status }) }
    if (url.includes('?pending=')) return Response.json({ attemptId: null })
    if (url.includes('?attempt=')) return new Response(null, { status: 404 })
    return Response.json({ calls: [] })
  }
  const component = Route.component().type
  const render = () => { uiTest.index = 0; return component({ userId: 'alice' }) }
  render()
  uiTest.effect()
  await new Promise(resolve => setTimeout(resolve, 0))
  const form = render().props.children.find(child => child?.type === 'form')
  await form.props.onSubmit({ preventDefault() {} })
  const id = storage.get(managedAttemptKey('alice'))
  assert.ok(id, `${status} must preserve the submitted attempt when lookup returns 404`)
  assert.equal(render().props.children.find(child => child?.type === 'form').props.children[2].props.disabled, true, `${status} must keep the form locked`)
  assert.equal(posts, 1, 'the UI must not repeat an ambiguous POST')
  globalThis.uiTest = { state: [], index: 0 }
  let checked
  globalThis.fetch = async url => {
    if (url.includes('?pending=')) return Response.json({ attemptId: '22222222-2222-4222-8222-222222222222' })
    if (url.includes('?attempt=')) { checked = new URL(url, 'https://example.test').searchParams.get('attempt'); return new Response(null, { status: 404 }) }
    return Response.json({ calls: [] })
  }
  render()
  uiTest.effect()
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(checked, id, 'reload must check the saved attempt even when another attempt is pending')
  assert.equal(storage.get(managedAttemptKey('alice')), id, 'reload must preserve the uncertain attempt')
  assert.equal(render().props.children.find(child => child?.type === 'form').props.children[2].props.disabled, true)
}
globalThis.fetch = originalFetch
const worker = new Miniflare({ workers: [{ config: { name: 'managed-create-check', compatibilityDate: '2026-11-08', env: { DB: { type: 'd1', id: 'synthetic-create' } }, manifest: { mainModule: 'worker.mjs', modules: { 'worker.mjs': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' } } } } }] })
try {
  const db = await worker.getD1Database('DB')
  for (const file of ['migrations/0001_auth.sql', 'migrations/0012_managed_calls.sql']) for (const statement of (await readFile(file, 'utf8')).split(';').map(s => s.trim()).filter(Boolean)) await db.prepare(statement).run()
  for (const id of ['alice', 'bob']) await db.prepare('INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES (?, ?, ?, 1, 1)').bind(id, id, `${id}@example.test`).run()
  let requests = 0
  const deps = { db, userId: 'alice', accountId: 'synthetic', apiKey: 'synthetic', from: '07012345678', agentId: 'synthetic-agent', origin: 'https://example.test', fetcher: async (_url, options) => {
    requests++
    assert.deepEqual(JSON.parse(options.body), { To: '01012345678', From: '07012345678', AgentId: 'synthetic-agent' })
    assert.equal(options.redirect, 'manual')
    return Response.json({ callId: 'call-a' }, { status: 201 })
  } }
  const a = '11111111-1111-4111-8111-111111111111'
  const b = '22222222-2222-4222-8222-222222222222'
  const c = '33333333-3333-4333-8333-333333333333'
  const d = '44444444-4444-4444-8444-444444444444'
  const e = '55555555-5555-4555-8555-555555555555'
  const invalid = '66666666-6666-4666-8666-666666666666'
  const unconfigured = '77777777-7777-4777-8777-777777777777'
  const req = (attemptId, origin = deps.origin, to = '01012345678', userId = 'alice') => new Request('https://example.test/api/managed-calls', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ attemptId, to, userId }) })
  assert.equal((await createManagedCall(req(a), { ...deps, userId: null })).status, 401)
  assert.equal((await createManagedCall(req(a, 'https://attacker.test'), deps)).status, 403)
  assert.equal((await createManagedCall(req(invalid, deps.origin, '112'), deps)).status, 422)
  assert.equal((await (await handleManagedCalls(new Request(`https://example.test/api/managed-calls?attempt=${invalid}`), deps)).json()).state, 'rejected')
  assert.equal((await createManagedCall(req(invalid), deps)).status, 409, 'a delayed valid request cannot dial after a rejected attempt is reserved')
  assert.equal((await createManagedCall(req(unconfigured), { ...deps, apiKey: undefined })).status, 422)
  assert.equal((await (await handleManagedCalls(new Request(`https://example.test/api/managed-calls?attempt=${unconfigured}`), deps)).json()).state, 'rejected')
  assert.equal((await createManagedCall(req(unconfigured), deps)).status, 409, 'later configuration cannot revive a rejected attempt')
  assert.equal((await createManagedCall(req(a), { ...deps, userId: 'bob' })).status, 400, 'session change cannot attribute a call to a different account')
  assert.equal(requests, 0)
  let release
  let started
  const entered = new Promise(resolve => { started = resolve })
  const gate = new Promise(resolve => { release = resolve })
  const waiting = { ...deps, fetcher: async (...args) => { started(); await gate; return deps.fetcher(...args) } }
  const firstPromise = createManagedCall(req(a), waiting)
  await entered
  assert.equal((await createManagedCall(req(a, deps.origin, '112'), deps)).status, 409, 'invalid duplicate cannot reject a request already in progress')
  assert.equal((await (await handleManagedCalls(new Request(`https://example.test/api/managed-calls?attempt=${a}`), deps)).json()).state, 'pending')
  const duplicate = await createManagedCall(req(e), deps)
  assert.equal(duplicate.status, 409)
  assert.equal((await duplicate.json()).attemptId, a, 'different tab finds the existing pending attempt')
  release()
  assert.equal((await firstPromise).status, 201)
  assert.equal((await createManagedCall(req(a), deps)).status, 409)
  assert.equal(requests, 1)
  const listing = await handleManagedCalls(new Request('https://example.test/api/managed-calls'), deps)
  assert.equal((await listing.json()).calls[0].callId, 'call-a')
  assert.equal((await handleManagedCalls(new Request(`https://example.test/api/managed-calls?attempt=${a}`), { ...deps, userId: 'bob' })).status, 404)
  const unknown = { ...deps, fetcher: async () => { requests++; throw new Error('connection lost') } }
  assert.equal((await createManagedCall(req(b), unknown)).status, 502)
  assert.equal((await createManagedCall(req(b), unknown)).status, 409)
  assert.equal(requests, 2)
  assert.equal((await (await handleManagedCalls(new Request(`https://example.test/api/managed-calls?attempt=${b}`), deps)).json()).state, 'pending')
  assert.equal((await (await handleManagedCalls(new Request('https://example.test/api/managed-calls?pending=1'), deps)).json()).attemptId, b)
  assert.equal((await (await handleManagedCalls(new Request('https://example.test/api/managed-calls?pending=1'), { ...deps, userId: 'bob' })).json()).attemptId, null)
  await db.prepare("UPDATE managed_call_attempts SET status = 'rejected' WHERE attempt_id = ?").bind(b).run() // synthetic fixture reset
  assert.equal((await createManagedCall(req(c), { ...deps, fetcher: async () => new Response(null, { status: 429 }) })).status, 422)
  assert.equal((await (await handleManagedCalls(new Request(`https://example.test/api/managed-calls?attempt=${c}`), deps)).json()).state, 'rejected')
  const failingDb = { prepare(sql) { if (sql.startsWith('INSERT OR IGNORE INTO managed_calls ')) throw new Error('synthetic database failure'); return db.prepare(sql) } }
  const lostRecord = { ...deps, db: failingDb, fetcher: async () => { requests++; return Response.json({ callId: 'call-d' }, { status: 201 }) } }
  assert.equal((await createManagedCall(req(d), lostRecord)).status, 502)
  assert.equal((await createManagedCall(req(d), deps)).status, 409, 'failed recording must not retry the call')
  assert.equal(requests, 3)
  console.log('Managed call creation, authorization, concurrency, and uncertain results passed')
} finally { await worker.dispose() }
