import assert from 'node:assert/strict'

const base = process.env.TALKIE_TEST_URL || 'http://127.0.0.1:3000'
const local = new URL(base)
assert.ok(local.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(local.hostname), 'run this check only against a local server')

const page = await fetch(`${base}/login`)
assert.equal(page.status, 200, 'login page must be available')
assert.ok((await page.text()).includes('Google로 계속하기'), 'Google button must be visible when configured')

const response = await fetch(`${base}/api/auth/sign-in/social`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: base, 'cf-connecting-ip': '2001:db8::1' },
  body: JSON.stringify({ provider: 'google', callbackURL: '/account', disableRedirect: true }),
})
assert.equal(response.status, 200, 'Google sign-in must start')
const result = await response.json()
const destination = new URL(result.url)
assert.equal(destination.origin, 'https://accounts.google.com', 'sign-in must target Google')
assert.ok(destination.searchParams.get('client_id') === 'synthetic-client-id', 'run this check only with the synthetic Google client ID')
assert.equal(destination.searchParams.get('redirect_uri'), `${base}/api/auth/callback/google`, 'Google must return to the local callback')
console.log('Synthetic Google sign-in checks passed')
