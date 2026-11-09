import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'

assert.ok(existsSync('src/lib/admin-calls.server.ts'), 'admin call handler must exist')
const bundle = await build({ entryPoints: ['src/lib/admin-calls.server.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
const { handleAdminCalls } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const worker = new Miniflare({ workers: [{ config: { name: 'admin-calls-check', compatibilityDate: '2026-11-08', env: { DB: { type: 'd1', id: 'admin-calls-synthetic-db' } }, manifest: { mainModule: 'worker.mjs', modules: { 'worker.mjs': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' } } } } }] })
try {
  const db = await worker.getD1Database('DB')
  const migration = await readFile('migrations/0004_live_call_transcripts.sql', 'utf8')
  for (const statement of migration.split(';').map((s) => s.trim()).filter(Boolean)) await db.prepare(statement).run()
  await db.prepare("INSERT INTO live_calls (intent, action_id, destination, instruction, call_id, bridge_started_at) VALUES ('a', 'b', '01012345678', 'private task', 'outbound', 10), ('c', 'd', '01099999999', 'private task', NULL, NULL)").run()
  await db.prepare("INSERT INTO live_calls (intent, direction, call_id, bridge_started_at, bridge_finished_at) VALUES ('e', 'inbound', 'inbound', 20, 30), ('f', 'inbound', 'failed', 40, NULL), ('g', 'inbound', 'unstarted', NULL, NULL)").run()
  await db.prepare("UPDATE live_calls SET bridge_failed_at = 50 WHERE call_id = 'failed'").run()
  await db.prepare("INSERT INTO inbound_conversations VALUES ('conversation', 'customer', '01099999999', 100)").run()
  await db.prepare("INSERT INTO inbound_conversations VALUES ('other', 'other_customer', NULL, 101)").run()
  await db.prepare("INSERT INTO inbound_conversation_calls VALUES ('inbound', 'conversation', 123)").run()
  await db.prepare("INSERT INTO inbound_conversation_calls VALUES ('failed', 'other', 124)").run()
  await db.prepare("INSERT INTO live_call_transcripts VALUES ('inbound', 'event', 'business', 'hello', 0, 1)").run()
  const get = (query = '', status = 'allowed') => handleAdminCalls(new Request(`https://example.test/api/admin/calls${query}`), db, async () => ({ status, email: 'admin@example.test', emailVerified: false }))
  for (const [status, expected] of [['anonymous', 401], ['denied', 403]]) {
    const response = await get('?call=inbound', status)
    assert.equal(response.status, expected)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.ok(!(await response.text()).includes('hello'))
  }
  assert.equal((await get('?call=inbound')).status, 200, 'allowlisted admins do not require email verification')
  for (const query of ['?call=', '?call=bad%20id', '?cursor=0', '?cursor=1.5', '?limit=101', '?call=inbound&cursor=1']) assert.equal((await get(query)).status, 400, query)
  assert.equal((await get('?call=missing')).status, 404)
  const first = await get('?limit=2')
  assert.equal(first.status, 200)
  assert.equal(first.headers.get('cache-control'), 'no-store')
  const page = await first.json()
  assert.deepEqual(page.calls.map(({ callId, bridgeState }) => [callId, bridgeState]), [['unstarted', 'not_started'], ['failed', 'failed']])
  assert.equal(page.calls[1].createdAt, 124, 'admin can see calls belonging to a different customer')
  assert.ok(page.nextCursor)
  const second = await (await get(`?limit=2&cursor=${page.nextCursor}`)).json()
  assert.deepEqual(second.calls.map(({ callId, bridgeState }) => [callId, bridgeState]), [['inbound', 'finished'], ['outbound', 'started']])
  assert.equal(second.nextCursor, null)
  assert.equal(second.calls[0].createdAt, 123)
  assert.equal(second.calls[1].createdAt, null)
  assert.ok(!JSON.stringify([page, second]).includes('010'))
  assert.ok(!JSON.stringify([page, second]).includes('private task'))
  const detail = await (await get('?call=inbound')).json()
  assert.equal(detail.callId, 'inbound')
  assert.deepEqual(detail.lines, [{ id: 'event', role: 'business', text: 'hello', final: false }])
  assert.ok(!JSON.stringify(detail).includes('010'))
  console.log('Admin call authorization, pagination, bridge observations, and transcript checks passed')
} finally {
  await worker.dispose()
}
