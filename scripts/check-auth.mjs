import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const base = process.env.TALKIE_TEST_URL || 'http://127.0.0.1:3000'
const url = new URL(base)
assert.ok(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'run this check only against a local server')
const clientIp = `2001:db8:${randomUUID().slice(0, 4)}:${randomUUID().slice(0, 4)}::1`
const email = `test-${randomUUID()}@example.com`
const adminEmail = process.env.TALKIE_TEST_ADMIN_EMAIL
assert.match(adminEmail || '', /^admin-[a-f0-9-]+@example\.test$/, 'set TALKIE_TEST_ADMIN_EMAIL to the synthetic allowlisted address')
const password = `Test-${randomUUID()}`
const request = (path, body, cookie) => fetch(`${base}/api/auth/${path}`, {
  method: body ? 'POST' : 'GET',
  headers: { 'cf-connecting-ip': clientIp, ...(body ? { 'content-type': 'application/json', origin: base } : {}), ...(cookie ? { cookie } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
})

let response = await fetch(`${base}/admin`, { redirect: 'manual' })
assert.equal(response.status, 307, 'anonymous users must be redirected from admin')
assert.ok(response.headers.get('location')?.startsWith('/login'), 'anonymous users must be redirected to login')
response = await fetch(`${base}/account`, { redirect: 'manual' })
assert.equal(response.status, 307, 'anonymous users must be redirected from account')
assert.ok(response.headers.get('location')?.startsWith('/login'), 'anonymous users must be redirected to login from account')
response = await request('get-session')
assert.equal(response.status, 200, 'anonymous session endpoint should be available')
assert.equal(await response.json(), null, 'anonymous request must not have a session')
response = await request('sign-up/email', { name: 'Test', email, password: 'short' })
assert.equal(response.ok, false, 'short password must be rejected')
response = await request('sign-up/email', { name: 'Test', email, password })
assert.equal(response.ok, true, 'sign-up must succeed')
assert.ok(response.headers.getSetCookie().some((value) => /httponly/i.test(value)), 'session cookie must be HttpOnly')
const cookie = response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ')
assert.ok(cookie, 'sign-up must create a session cookie')
response = await request('get-session', undefined, cookie)
assert.equal((await response.json()).user.email, email, 'session must belong to the signed-up user')
response = await fetch(`${base}/account`, { headers: { cookie }, redirect: 'manual' })
assert.equal(response.status, 200, 'signed-up users must be able to open their account')
assert.ok((await response.text()).includes(email), 'account must display the signed-up user')
response = await fetch(`${base}/admin`, { headers: { cookie }, redirect: 'manual' })
assert.ok((await response.text()).includes('관리자 권한이 없습니다'), 'unlisted users must not see the admin page')

response = await request('sign-up/email', { name: 'Admin Test', email: adminEmail, password })
assert.equal(response.ok, true, 'synthetic admin sign-up must succeed')
const adminCookie = response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ')
response = await fetch(`${base}/admin`, { headers: { cookie: adminCookie }, redirect: 'manual' })
assert.ok((await response.text()).includes('관리자 권한이 없습니다'), 'allowlisted users with unverified email must be denied')

// Only the two synthetic local users are modified; production verification must come from an identity provider.
execFileSync('npx', ['wrangler', 'd1', 'execute', 'talkie-db', '--local', '--command', `UPDATE "user" SET "emailVerified" = 1 WHERE email IN ('${email}', '${adminEmail}')`], { stdio: 'pipe' })
response = await fetch(`${base}/admin`, { headers: { cookie }, redirect: 'manual' })
assert.ok((await response.text()).includes('관리자 권한이 없습니다'), 'verified but unlisted users must be denied')
response = await fetch(`${base}/admin`, { headers: { cookie: adminCookie }, redirect: 'manual' })
assert.ok((await response.text()).includes('관리자 권한이 없습니다'), 'verified allowlisted users must be denied until session authentication is verified')
response = await request('sign-out', {}, cookie)
assert.equal(response.ok, true, 'sign-out must succeed')
response = await request('get-session', undefined, cookie)
assert.equal(await response.json(), null, 'signed-out session must no longer work')
response = await fetch(`${base}/account`, { headers: { cookie }, redirect: 'manual' })
assert.equal(response.status, 307, 'signed-out users must be redirected from account')
response = await request('sign-in/email', { email, password: 'wrong-password' })
assert.equal(response.ok, false, 'wrong password must be rejected')
response = await request('sign-in/email', { email, password })
assert.equal(response.ok, true, 'correct password must sign in')

const rateLimitIp = `2001:db8:${randomUUID().slice(0, 4)}:${randomUUID().slice(0, 4)}::1`
for (let i = 0; i < 5; i++) {
  response = await fetch(`${base}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: base, 'cf-connecting-ip': rateLimitIp },
    body: JSON.stringify({ email, password: 'wrong-password' }),
  })
  assert.notEqual(response.status, 429, 'sign-in limit must allow the first five attempts')
}
response = await fetch(`${base}/api/auth/sign-in/email`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: base, 'cf-connecting-ip': rateLimitIp },
  body: JSON.stringify({ email, password: 'wrong-password' }),
})
assert.equal(response.status, 429, 'sign-in attempts must be rate limited across requests')
response = await fetch(`${base}/api/auth/sign-in/email`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: base, 'cf-connecting-ip': clientIp },
  body: JSON.stringify({ email, password: 'wrong-password' }),
})
assert.notEqual(response.status, 429, 'another client must not share the rate limit')
console.log('Authentication checks passed')
