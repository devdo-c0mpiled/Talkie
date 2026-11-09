import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'

const bundle = await build({ entryPoints: ['src/lib/clawops-routes.server.ts'], bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{ name: 'synthetic-env', setup(build) {
  build.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'env', namespace: 'synthetic' }))
  build.onLoad({ filter: /.*/, namespace: 'synthetic' }, () => ({ contents: 'export const env = globalThis.__talkieTestEnv', loader: 'js' }))
} }] })
const worker = new Miniflare({ workers: [{ config: { name: 'inbound-routing-check', compatibilityDate: '2026-11-08', env: { DB: { type: 'd1', id: 'synthetic-routing-db' } }, manifest: { mainModule: 'worker.mjs', modules: { 'worker.mjs': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' } } } } }] })
try {
  const db = await worker.getD1Database('DB')
  for (const name of ['0001_auth.sql', '0003_clawops_stream_tokens.sql', '0004_live_call_transcripts.sql', '0005_clawops_stream_context.sql', '0006_customers.sql', '0007_personal_phones.sql', '0008_clawops_gather.sql']) {
    for (const sql of (await readFile(`migrations/${name}`, 'utf8')).split(';').map(s => s.trim()).filter(Boolean)) await db.prepare(sql).run()
  }
  await db.prepare('INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, 1, 1)').bind('user_a', 'A', 'a@example.invalid').run()
  await db.prepare('INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, 1, 1)').bind('user_b', 'B', 'b@example.invalid').run()
  await db.prepare('UPDATE customers SET user_id = ? WHERE customer_no = 1').bind('user_a').run()
  await db.prepare('INSERT INTO customers (customer_no, user_id) VALUES (2, ?)').bind('user_b').run()
  await db.prepare('INSERT INTO customer_personal_phones (customer_no, phone_number) VALUES (2, ?)').bind('+821012340000').run()
  globalThis.__talkieTestEnv = { DB: db, CLAWOPS_WEBHOOK_URL: 'https://example.invalid/api/clawops/voice', CLAWOPS_SIGNING_KEY: 'synthetic-key', CLAWOPS_ACCOUNT_ID: 'AC_TEST', CLAWOPS_PHONE_NUMBER: '07012340000', OPENAI_API_KEY: 'synthetic' }
  const { handleClawOpsVoice } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
  const url = globalThis.__talkieTestEnv.CLAWOPS_WEBHOOK_URL
  const fields = { AccountId: 'AC_TEST', From: '01012340000', To: '07012340000', Direction: 'inbound', CallId: 'CA_MATCH' }
  function request(values, target = url) {
    const signed = target + Object.keys(values).sort().map(key => key + values[key]).join('')
    const signature = createHmac('sha256', 'synthetic-key').update(signed).digest('base64')
    return new Request(target, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Signature': signature }, body: new URLSearchParams(values) })
  }
  const matched = await handleClawOpsVoice(request(fields))
  assert.match(await matched.text(), /<Connect><Stream/, 'registered caller connects directly')
  assert.equal((await db.prepare('SELECT customer_id FROM inbound_conversations').first()).customer_id, '0002')
  const unknown = { ...fields, From: '01099990000', CallId: 'CA_UNKNOWN' }
  const prompt = await (await handleClawOpsVoice(request(unknown))).text()
  assert.match(prompt, /<Gather[^>]*finishOnKey="#"/, 'unknown caller is prompted for customer number')
  const action = prompt.match(/action="([^"]+)"/)[1].replaceAll('&amp;', '&')
  const callback = { From: unknown.From, To: unknown.To, Direction: 'inbound', CallId: unknown.CallId, Digits: '0001' }
  assert.match(await (await handleClawOpsVoice(request(callback, action))).text(), /<Connect><Stream/, 'valid selection connects')
  assert.equal((await db.prepare('SELECT customer_id FROM inbound_conversations WHERE customer_id = ?').bind('0001').first()).customer_id, '0001')
  assert.equal((await handleClawOpsVoice(request(callback, action))).status, 401, 'selection cannot replay')
  const matchedAgain = await handleClawOpsVoice(request({ ...fields, CallId: 'CA_MATCH_2' }))
  assert.match(await matchedAgain.text(), /<Connect><Stream/)
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM inbound_conversations WHERE customer_id = ?').bind('0002').first()).n, 1, 'same customer and caller reuse a conversation')
  for (const [index, digits] of ['', '1', '0000', '00001', '9999', '1'.repeat(17)].entries()) {
    const first = { ...unknown, CallId: `CA_BAD_${index}` }
    const firstBody = await (await handleClawOpsVoice(request(first))).text()
    const nextUrl = firstBody.match(/action="([^"]+)"/)[1].replaceAll('&amp;', '&')
    const result = await (await handleClawOpsVoice(request({ From: first.From, To: first.To, Direction: 'inbound', CallId: first.CallId, Digits: digits }, nextUrl))).text()
    assert.match(result, /<Hangup\/>/, `invalid number ${index} hangs up`)
  }
  const restricted = { ...fields, CallId: 'CA_RESTRICTED', CallerIdRestricted: 'true' }
  const restrictedBody = await (await handleClawOpsVoice(request(restricted))).text()
  assert.match(restrictedBody, /<Gather/, 'restricted caller must not match their registered number')
  const restrictedUrl = restrictedBody.match(/action="([^"]+)"/)[1].replaceAll('&amp;', '&')
  const restrictedCallback = { From: restricted.From, To: restricted.To, Direction: 'inbound', CallId: restricted.CallId, CallerIdRestricted: 'true', Digits: '0002' }
  assert.match(await (await handleClawOpsVoice(request(restrictedCallback, restrictedUrl))).text(), /<Connect><Stream/)
  assert.equal((await db.prepare('SELECT caller_number FROM inbound_conversations c JOIN inbound_conversation_calls cc ON cc.conversation_id = c.id WHERE cc.call_id = ?').bind(restricted.CallId).first()).caller_number, null)
  console.log('Inbound registered caller and customer-number routing passed')
} finally { await worker.dispose() }
