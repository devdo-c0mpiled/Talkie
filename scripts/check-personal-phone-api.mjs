import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'

const bundle = await build({ stdin: { contents: `import { handlePersonalPhone } from './src/lib/personal-phone.server'; export default { fetch(request, bindings) { Object.assign(globalThis.__testEnv, bindings, { BETTER_AUTH_URL: 'https://example.test', CUSTOMER_0001_EMAIL: 'reserved@example.test' }); return handlePersonalPhone(request) } }`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, platform: 'browser', format: 'esm', plugins: [{ name: 'test-auth', setup(build) {
  build.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'env', namespace: 'test' }))
  build.onResolve({ filter: /^\.\/auth\.server$/ }, () => ({ path: 'auth', namespace: 'test' }))
  build.onLoad({ filter: /.*/, namespace: 'test' }, ({ path }) => ({ contents: path === 'env' ? `export const env = globalThis.__testEnv = {}` : `export function getAuth() { return { api: { getSession: async ({ headers }) => headers.get('x-test-user') ? { user: { id: headers.get('x-test-user') } } : null } } }`, loader: 'js' }))
} }] })
const worker = new Miniflare({ workers: [{ config: { name: 'phone-api-check', compatibilityDate: '2026-11-08', env: { DB: { type: 'd1', id: 'synthetic-db' } }, manifest: { mainModule: 'worker.mjs', modules: { 'worker.mjs': { type: 'esm', contents: bundle.outputFiles[0].text } } } } }] })
try {
  const db = await worker.getD1Database('DB')
  for (const file of ['migrations/0001_auth.sql', 'migrations/0006_customers.sql', 'migrations/0007_personal_phones.sql']) {
    for (const statement of (await readFile(file, 'utf8')).split(';').map((s) => s.trim()).filter(Boolean)) await db.prepare(statement).run()
  }
  for (const id of ['one', 'two']) await db.prepare('INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES (?, ?, ?, 1, 1)').bind(id, id, `${id}@example.test`).run()
  const get = (user) => worker.dispatchFetch('https://example.test/api/personal-phone', { headers: user ? { 'x-test-user': user } : {} })
  const post = (user, phoneNumber, origin = 'https://example.test') => worker.dispatchFetch('https://example.test/api/personal-phone', { method: 'POST', headers: { 'x-test-user': user, origin, 'content-type': 'application/json' }, body: JSON.stringify({ phoneNumber, userId: 'two' }) })
  assert.equal((await get()).status, 401)
  assert.equal((await post('one', '01012345678', 'https://attacker.test')).status, 403)
  assert.equal((await post('one', '01012345678')).status, 200)
  assert.equal((await (await get('one')).json()).phoneNumber, '+821012345678')
  assert.equal((await (await get('two')).json()).phoneNumber, null, 'request body cannot select another user')
  assert.equal((await post('two', '+82 10 1234 5678')).status, 409)
  assert.equal((await post('two', 'bad')).status, 400)
  console.log('Personal phone API authentication, origin and ownership checks passed')
} finally { await worker.dispose() }
