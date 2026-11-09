import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'

const bundle = await build({ entryPoints: ['src/lib/managed-calls.server.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
const { recordManagedCall, handleManagedCalls } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const worker = new Miniflare({ workers: [{ config: { name: 'managed-call-check', compatibilityDate: '2026-11-08', env: { DB: { type: 'd1', id: 'synthetic-managed' } }, manifest: { mainModule: 'worker.mjs', modules: { 'worker.mjs': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' } } } } }] })
try {
  const db = await worker.getD1Database('DB')
  for (const file of ['migrations/0001_auth.sql', 'migrations/0012_managed_calls.sql']) {
    for (const statement of (await readFile(file, 'utf8')).split(';').map(s => s.trim()).filter(Boolean)) await db.prepare(statement).run()
  }
  for (const id of ['alice', 'bob']) await db.prepare('INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES (?, ?, ?, 1, 1)').bind(id, id, `${id}@example.test`).run()
  assert.equal(await recordManagedCall(db, 'alice', 'call-a'), true)
  assert.equal(await recordManagedCall(db, 'alice', 'call-a'), true, 'same owner retry is idempotent')
  assert.equal(await recordManagedCall(db, 'bob', 'call-a'), false, 'another account cannot claim the call')
  assert.equal(await recordManagedCall(db, 'missing', 'call-b'), false, 'unknown user cannot claim a call')
  let providerRequests = 0
  const fetcher = async (url, options) => {
    providerRequests++
    assert.equal(new Headers(options.headers).get('authorization'), 'Bearer synthetic-key')
    if (url.includes('/recordings/')) return new Response('synthetic audio', { headers: { 'content-type': 'audio/wav' } })
    return Response.json({ callId: 'call-a', status: 'completed', duration: 5, recordingUrl: 'sensitive-provider-url' })
  }
  const request = (userId, query = '') => handleManagedCalls(new Request(`https://example.test/api/managed-calls${query}`), { db, userId, accountId: 'synthetic', apiKey: 'synthetic-key', fetcher })
  assert.equal((await request(null)).status, 401)
  assert.deepEqual((await (await request('bob')).json()).calls, [])
  assert.equal((await request('bob', '?call=call-a')).status, 404)
  assert.equal(providerRequests, 0, 'other customers cannot cause a provider lookup')
  assert.equal((await (await request('alice')).json()).calls[0].callId, 'call-a')
  const detail = await (await request('alice', '?call=call-a')).json()
  assert.deepEqual({ status: detail.status, duration: detail.duration, recordingAvailable: detail.recordingAvailable }, { status: 'completed', duration: 5, recordingAvailable: true })
  assert.equal('recordingUrl' in detail, false, 'signed provider URL must not reach the browser')
  const recording = await request('alice', '?call=call-a&recording=1')
  assert.equal(recording.status, 200)
  assert.equal(await recording.text(), 'synthetic audio')
  const redirect = await handleManagedCalls(new Request('https://example.test/api/managed-calls?call=call-a&recording=1'), { db, userId: 'alice', accountId: 'synthetic', apiKey: 'synthetic-key', fetcher: async () => new Response(null, { status: 302, headers: { location: 'https://signed.example.test/audio' } }) })
  assert.equal(redirect.status, 502, 'unverified recording redirects are rejected')
  const absent = await handleManagedCalls(new Request('https://example.test/api/managed-calls?call=call-a&recording=1'), { db, userId: 'alice', accountId: 'synthetic', apiKey: 'synthetic-key', fetcher: async () => new Response(null, { status: 404 }) })
  assert.equal(absent.status, 404, 'missing recordings are not fabricated')
  console.log('Managed call account isolation, status, and recording access passed')
} finally { await worker.dispose() }
