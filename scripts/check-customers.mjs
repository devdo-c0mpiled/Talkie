import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'

const bundle = await build({ entryPoints: ['src/lib/customers.server.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
const { getOrCreateCustomer, bindConfiguredCustomerPhone, getCustomerByPhone } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const worker = new Miniflare({ workers: [{ config: { name: 'customer-check', compatibilityDate: '2026-11-08', env: { DB: { type: 'd1', id: 'synthetic-db' } }, manifest: { mainModule: 'worker.mjs', modules: { 'worker.mjs': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' } } } } }] })

try {
  const db = await worker.getD1Database('DB')
  for (const file of ['migrations/0001_auth.sql', 'migrations/0006_customers.sql']) {
    const migration = await readFile(file, 'utf8')
    for (const statement of migration.split(';').map((s) => s.trim()).filter(Boolean)) await db.prepare(statement).run()
  }
  for (const [id, email] of [['designated', 'designated@example.test'], ...Array.from({ length: 5 }, (_, i) => [`user-${i}`, `user-${i}@example.test`])]) {
    await db.prepare('INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES (?, ?, ?, 1, 1)').bind(id, id, email).run()
  }
  const designatedEmail = 'designated@example.test'
  const customer = (userId, email = designatedEmail) => getOrCreateCustomer({ db, userId, designatedEmail: email })
  assert.equal((await getOrCreateCustomer({ db, userId: 'designated', designatedEmail: undefined })).kind, 'not_configured')
  assert.equal((await customer('designated', 'bad')).kind, 'invalid_config')
  assert.equal((await customer('missing')).kind, 'not_found')
  assert.equal((await bindConfiguredCustomerPhone({ db, phoneNumber: '07012345678', designatedEmail })).kind, 'not_found')
  const others = await Promise.all(Array.from({ length: 5 }, (_, i) => customer(`user-${i}`)))
  assert.ok(others.every((result) => result.kind === 'ready' && Number(result.customer.id) >= 2))
  assert.equal(new Set(others.map((result) => result.customer.id)).size, 5)
  const simultaneous = await Promise.all(Array.from({ length: 5 }, () => customer('designated', ' DESIGNATED@example.test ')))
  assert.ok(simultaneous.every((result) => result.kind === 'ready' && result.customer.id === '0001'))
  assert.equal((await customer('designated', 'user-0@example.test')).kind, 'conflict', 'a configuration change cannot steal 0001')
  assert.equal((await customer('user-0', 'user-0@example.test')).kind, 'conflict', 'an existing account is not silently renumbered')
  const options = { db, phoneNumber: '+82 70-1234-5678', designatedEmail }
  await db.prepare('UPDATE customers SET phone_number = ? WHERE user_id = ?').bind('07012345678', 'user-0').run()
  assert.equal((await bindConfiguredCustomerPhone(options)).kind, 'conflict', 'a number owned by another customer is not reassigned')
  await db.prepare('UPDATE customers SET phone_number = NULL WHERE user_id = ?').bind('user-0').run()
  const bound = await bindConfiguredCustomerPhone(options)
  assert.equal(bound.kind, 'ready')
  assert.equal(bound.customer.id, '0001')
  assert.equal(bound.customer.phoneNumber, '07012345678')
  assert.equal((await bindConfiguredCustomerPhone(options)).kind, 'ready', 'binding is idempotent')
  assert.equal((await bindConfiguredCustomerPhone({ ...options, designatedEmail: 'different@example.test' })).kind, 'conflict')
  assert.equal((await bindConfiguredCustomerPhone({ ...options, phoneNumber: '07099999999' })).kind, 'conflict', 'configured number does not replace an existing assignment')
  assert.equal((await bindConfiguredCustomerPhone({ ...options, phoneNumber: 'bad' })).kind, 'invalid_config')
  assert.equal((await getCustomerByPhone({ db, phoneNumber: '07012345678' })).customer.id, '0001')
  assert.equal((await getCustomerByPhone({ db, phoneNumber: '07099999999' })).kind, 'not_found')
  console.log('Customer reservation, concurrent assignment and phone mapping checks passed')
} finally {
  await worker.dispose()
}
