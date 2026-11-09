import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'

const bundle = await build({ entryPoints: ['src/lib/customers.server.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
const customers = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
assert.equal(typeof customers.getCustomerByPersonalPhone, 'function', 'registered personal numbers must resolve their customer')
const worker = new Miniflare({ workers: [{ config: { name: 'personal-phone-check', compatibilityDate: '2026-11-08', env: { DB: { type: 'd1', id: 'synthetic-db' } }, manifest: { mainModule: 'worker.mjs', modules: { 'worker.mjs': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' } } } } }] })
try {
  const db = await worker.getD1Database('DB')
  for (const file of ['migrations/0001_auth.sql', 'migrations/0006_customers.sql', 'migrations/0007_personal_phones.sql']) {
    for (const statement of (await readFile(file, 'utf8')).split(';').map((s) => s.trim()).filter(Boolean)) await db.prepare(statement).run()
  }
  for (const id of ['one', 'two']) {
    await db.prepare('INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES (?, ?, ?, 1, 1)').bind(id, id, `${id}@example.test`).run()
    assert.equal((await customers.getOrCreateCustomer({ db, userId: id, designatedEmail: 'reserved@example.test' })).kind, 'ready')
  }
  const bind = (userId, phoneNumber) => customers.bindPersonalPhone({ db, userId, phoneNumber })
  const [first, second] = await Promise.all([bind('one', '010-1234-5678'), bind('two', '+82 10 1234 5678')])
  assert.deepEqual([first.kind, second.kind].sort(), ['conflict', 'ready'], 'only one customer may claim the same normalized number')
  const owner = first.kind === 'ready' ? 'one' : 'two'
  const other = owner === 'one' ? 'two' : 'one'
  assert.equal((await bind(owner, '+82 10-1234-5678')).kind, 'ready', 'same claim is idempotent')
  assert.equal((await bind(owner, '+1 202-555-0123')).kind, 'conflict', 'existing number is never silently replaced')
  assert.equal((await bind(other, 'not-a-number')).kind, 'invalid_config')
  assert.equal((await bind(other, '+1 202-555-0123')).kind, 'ready', 'international numbers are accepted')
  assert.equal((await customers.getCustomerByPersonalPhone({ db, phoneNumber: '01012345678' })).customer.userId, owner)
  assert.equal((await customers.getCustomerByPersonalPhone({ db, phoneNumber: '+12025550123' })).customer.userId, other)
  assert.equal((await customers.getCustomerByPersonalPhone({ db, phoneNumber: '+12025550124' })).kind, 'not_found')
  const ownerCustomer = await customers.getOrCreateCustomer({ db, userId: owner, designatedEmail: 'reserved@example.test' })
  assert.equal((await customers.getCustomerByNumber({ db, customerNumber: ownerCustomer.customer.id })).customer.userId, owner)
  assert.equal((await customers.getCustomerByNumber({ db, customerNumber: '1 OR 1=1' })).kind, 'invalid_config')
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM customers WHERE phone_number IS NOT NULL').first()).n, 0, 'legacy shared-line values remain untouched')
  console.log('Personal phone uniqueness, normalization and customer lookup checks passed')
} finally { await worker.dispose() }
