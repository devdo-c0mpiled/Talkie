import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'

const bundle = await build({
  entryPoints: ['scripts/check-clawops-integration-worker.mjs'], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', external: ['node:*'],
  plugins: [{ name: 'synthetic-bindings', setup(build) {
    build.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'env', namespace: 'mock-env' }))
    build.onLoad({ filter: /.*/, namespace: 'mock-env' }, () => ({ contents: 'export const env = globalThis.__testEnv = {}', loader: 'js' }))
    build.onResolve({ filter: /^@tanstack\/react-start\/server-only$/ }, () => ({ path: 'server-only', namespace: 'mock-env' }))
  } }],
})
const worker = new Miniflare({ workers: [{ config: { name: 'clawops-integration', compatibilityDate: '2026-11-08', compatibilityFlags: ['nodejs_compat'], env: { DB: { type: 'd1', id: 'synthetic-integration-db' } }, manifest: { mainModule: 'worker.mjs', modules: { 'worker.mjs': { type: 'esm', contents: bundle.outputFiles[0].text } } } } }] })
const origin = 'https://example.test'
const url = `${origin}/api/clawops/voice`
const fields = { CallId: 'CA_TEST', AccountId: 'AC_TEST', From: '01012340000', To: '07012340000', CallStatus: 'in-progress', Direction: 'inbound' }
function signedRequest(params, signing = 'synthetic-signing-key', targetUrl = url) {
  const content = targetUrl + Object.keys(params).sort().map(key => key + params[key]).join('')
  return [targetUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-signature': createHmac('sha256', signing).update(content).digest('base64') }, body: new URLSearchParams(params).toString() }]
}
function streamStart(callId, token, extra = {}) {
  return JSON.stringify({ event: 'start', start: { callId, accountId: 'AC_TEST', streamId: 'MS_TEST', customParameters: { callId, token, ...extra }, mediaFormat: { encoding: 'audio/x-mulaw', sampleRate: 8000, channels: 1 } } })
}
function nextMessage(socket) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('WebSocket did not receive expected media in 5 seconds')), 5000)
    socket.addEventListener('message', event => { clearTimeout(timer); resolve(JSON.parse(event.data)) }, { once: true })
    socket.addEventListener('close', () => { clearTimeout(timer); reject(Error('WebSocket closed before media')) }, { once: true })
  })
}
try {
  const db = await worker.getD1Database('DB')
  for (const statement of (await readFile('migrations/0001_auth.sql', 'utf8')).split(';').map(value => value.trim()).filter(Boolean)) await db.prepare(statement).run()
  await db.prepare(await readFile('migrations/0003_clawops_stream_tokens.sql', 'utf8')).run()
  const migration = await readFile('migrations/0004_live_call_transcripts.sql', 'utf8')
  for (const statement of migration.split(';').map(value => value.trim()).filter(Boolean)) await db.prepare(statement).run()
  for (const statement of (await readFile('migrations/0005_clawops_stream_context.sql', 'utf8')).split(';').map(value => value.trim()).filter(Boolean)) await db.prepare(statement).run()
  for (const statement of (await readFile('migrations/0006_customers.sql', 'utf8')).split(';').map(value => value.trim()).filter(Boolean)) await db.prepare(statement).run()
  await db.prepare(await readFile('migrations/0007_personal_phones.sql', 'utf8')).run()
  await db.prepare(await readFile('migrations/0008_clawops_gather.sql', 'utf8')).run()
  await db.prepare(await readFile('migrations/0009_chat_history.sql', 'utf8')).run()
  await db.prepare(await readFile('migrations/0010_agent_settings.sql', 'utf8')).run()
  await db.prepare('INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES (?, ?, ?, 1, 1)').bind('synthetic-user', 'test', 'test@example.invalid').run()
  await db.prepare('UPDATE customers SET user_id = ?, phone_number = ? WHERE customer_no = 1').bind('synthetic-user', '07012340000').run()
  await db.prepare('INSERT INTO customer_personal_phones (customer_no, phone_number) VALUES (1, ?)').bind('+821012340000').run()
  await db.prepare('INSERT INTO agent_settings (customer_no, language, voice, response_rules) VALUES (1, ?, ?, ?)').bind('ko-KR', 'nuri', 'Offer the first customer a callback.').run()
  const unknownTo = { ...fields, CallId: 'CA_UNKNOWN_CUSTOMER', To: '07099999999' }
  assert.equal((await worker.dispatchFetch(...signedRequest(unknownTo))).status, 401, 'unassigned inbound numbers cannot create conversations')
  const [inboundUrl, inboundOptions] = signedRequest(fields)
  delete inboundOptions.headers['x-signature']
  const response = await worker.dispatchFetch(inboundUrl, inboundOptions)
  assert.equal(response.status, 200)
  const xml = await response.text()
  const token = xml.match(/<Parameter name="token" value="([0-9a-f]{64})"\/>/)?.[1]
  assert.ok(token)
  assert.equal((await worker.dispatchFetch(...signedRequest(fields))).status, 401)
  const upgraded = await worker.dispatchFetch(`${origin}/api/clawops/stream`, { headers: { Upgrade: 'websocket' } })
  assert.equal(upgraded.status, 101)
  const socket = upgraded.webSocket
  assert.ok(socket)
  socket.accept()
  const received = nextMessage(socket)
  socket.send(streamStart(fields.CallId, token))
  socket.send(JSON.stringify({ event: 'media', media: { payload: 'AQID' } }))
  assert.deepEqual(await received, { event: 'media', media: { payload: 'AQID' } })
  const events = await (await worker.dispatchFetch(`${origin}/test/events`)).json()
  assert.equal(events.filter(event => event.type === 'session.start').length, 1)
  const matchedSession = events.find(event => event.type === 'session.start').session
  assert.match(matchedSession.instructions, /ko-KR/, 'matched caller uses the customer language')
  assert.match(matchedSession.instructions, /Offer the first customer a callback\./, 'matched caller uses the customer response rules')
  assert.match(matchedSession.instructions, /Never claim to have completed an action/, 'customer rules preserve the default safety instruction')
  assert.match(matchedSession.instructions, /통화 종료하겠습니다\. 감사합니다\./, 'inbound calls include the closing announcement')
  assert.equal(matchedSession.audio.output.voice, 'nuri', 'matched caller uses the customer voice')
  assert.ok(events.some(event => event.type === 'session.input_audio.append' && event.audio === 'AQID'))
  const inboundConversation = await db.prepare('SELECT c.customer_id, c.caller_number FROM inbound_conversations c JOIN inbound_conversation_calls cc ON cc.conversation_id = c.id WHERE cc.call_id = ?').bind(fields.CallId).first()
  assert.deepEqual(inboundConversation, { customer_id: '0001', caller_number: '+821012340000' })
  const repeatedCaller = { ...fields, CallId: 'CA_SAME_CALLER', From: '+821012340000' }
  const repeatResponse = await worker.dispatchFetch(...signedRequest(repeatedCaller))
  assert.equal(repeatResponse.status, 200)
  const repeatToken = (await repeatResponse.text()).match(/<Parameter name="token" value="([0-9a-f]{64})"\/>/)?.[1]
  assert.ok(repeatToken)
  const conversations = await db.prepare('SELECT count(*) AS count FROM inbound_conversations').first()
  assert.equal(conversations.count, 1, 'the same customer and caller reuse their conversation')
  const hiddenCaller = { ...fields, CallId: 'CA_PRIVATE_CALLER', From: '' }
  const hiddenResponse = await worker.dispatchFetch(...signedRequest(hiddenCaller))
  assert.match(await hiddenResponse.text(), /<Gather/, 'calls without a visible number require customer selection')
  const retry = await worker.dispatchFetch(`${origin}/api/clawops/stream`, { headers: { Upgrade: 'websocket' } })
  const replay = retry.webSocket
  assert.ok(replay)
  replay.accept()
  const closed = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Replayed stream token was not rejected')), 5000)
    replay.addEventListener('close', event => { clearTimeout(timer); resolve(event.code) }, { once: true })
  })
  replay.send(streamStart(fields.CallId, token))
  assert.equal(await closed, 1008)
  socket.close(1000)
  let inboundFragments = []
  for (let i = 0; i < 30; i++) {
    inboundFragments = (await db.prepare('SELECT role, text FROM live_call_transcripts WHERE call_id = ? ORDER BY rowid').bind(fields.CallId).all()).results
    if (inboundFragments.length === 2) break
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  assert.deepEqual(inboundFragments.map(({ role, text }) => ({ role, text })), [{ role: 'business', text: 'hello ' }, { role: 'agent', text: ' last' }], 'incoming speech and AI output are saved to the customer call')
  for (let i = 0; i < 30; i++) {
    const row = await db.prepare('SELECT bridge_finished_at FROM live_calls WHERE call_id = ?').bind(fields.CallId).first()
    if (row?.bridge_finished_at) break
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  const repeatedUpgrade = await worker.dispatchFetch(`${origin}/api/clawops/stream`, { headers: { Upgrade: 'websocket' } })
  const repeatedSocket = repeatedUpgrade.webSocket
  repeatedSocket.accept()
  const repeatedMedia = nextMessage(repeatedSocket)
  repeatedSocket.send(streamStart(repeatedCaller.CallId, repeatToken))
  repeatedSocket.send(JSON.stringify({ event: 'media', media: { payload: 'AQID' } }))
  await repeatedMedia
  const repeatEvents = await (await worker.dispatchFetch(`${origin}/test/events`)).json()
  const resumed = repeatEvents.filter(event => event.type === 'session.start').at(-1)
  assert.deepEqual(resumed.session.input, [
    { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hello ' }] },
    { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: ' last' }] },
  ], 'a repeat caller resumes prior conversation as messages')
  repeatedSocket.close(1000)
  await db.prepare('INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES (?, ?, ?, 1, 1)').bind('synthetic-user-2', 'test 2', 'test2@example.invalid').run()
  await db.prepare('INSERT INTO customers (customer_no, user_id) VALUES (2, ?)').bind('synthetic-user-2').run()
  await db.prepare('INSERT INTO agent_settings (customer_no, language, voice, response_rules) VALUES (2, ?, ?, ?)').bind('en-US', 'willow', 'Offer the second customer a quote.').run()
  const selectedCall = { ...fields, CallId: 'CA_SELECTED', From: '01099990000' }
  const prompt = await (await worker.dispatchFetch(...signedRequest(selectedCall))).text()
  const action = prompt.match(/action="([^"]+)"/)?.[1]?.replaceAll('&amp;', '&')
  assert.ok(action, 'unrecognized caller receives a customer-number prompt')
  const callback = { From: selectedCall.From, To: selectedCall.To, Direction: 'inbound', CallId: selectedCall.CallId, Digits: '0002' }
  const selectedXml = await (await worker.dispatchFetch(...signedRequest(callback, 'synthetic-signing-key', action))).text()
  const selectedToken = selectedXml.match(/<Parameter name="token" value="([0-9a-f]{64})"\/>/)?.[1]
  assert.ok(selectedToken, 'customer-number selection creates a stream token')
  const selectedUpgrade = await worker.dispatchFetch(`${origin}/api/clawops/stream`, { headers: { Upgrade: 'websocket' } })
  const selectedSocket = selectedUpgrade.webSocket
  selectedSocket.accept()
  const selectedMedia = nextMessage(selectedSocket)
  selectedSocket.send(streamStart(selectedCall.CallId, selectedToken))
  selectedSocket.send(JSON.stringify({ event: 'media', media: { payload: 'AQID' } }))
  await selectedMedia
  const selectedEvents = await (await worker.dispatchFetch(`${origin}/test/events`)).json()
  const selectedSession = selectedEvents.filter(event => event.type === 'session.start').at(-1).session
  assert.match(selectedSession.instructions, /en-US/, 'customer-number selection uses the selected customer language')
  assert.match(selectedSession.instructions, /Offer the second customer a quote\./, 'customer-number selection uses the selected customer response rules')
  assert.doesNotMatch(selectedSession.instructions, /Offer the first customer a callback\./, 'another customer’s rules do not leak')
  assert.equal(selectedSession.audio.output.voice, 'willow', 'customer-number selection uses the selected customer voice')
  selectedSocket.close(1000)
  await db.prepare('DELETE FROM agent_settings WHERE customer_no = 2').run()
  const defaultCall = { ...fields, CallId: 'CA_DEFAULT', From: '01088880000' }
  const defaultPrompt = await (await worker.dispatchFetch(...signedRequest(defaultCall))).text()
  const defaultAction = defaultPrompt.match(/action="([^"]+)"/)?.[1]?.replaceAll('&amp;', '&')
  assert.ok(defaultAction)
  const defaultCallback = { From: defaultCall.From, To: defaultCall.To, Direction: 'inbound', CallId: defaultCall.CallId, Digits: '0002' }
  const defaultXml = await (await worker.dispatchFetch(...signedRequest(defaultCallback, 'synthetic-signing-key', defaultAction))).text()
  const defaultToken = defaultXml.match(/<Parameter name="token" value="([0-9a-f]{64})"\/>/)?.[1]
  assert.ok(defaultToken)
  const defaultUpgrade = await worker.dispatchFetch(`${origin}/api/clawops/stream`, { headers: { Upgrade: 'websocket' } })
  const defaultSocket = defaultUpgrade.webSocket
  defaultSocket.accept()
  const defaultMedia = nextMessage(defaultSocket)
  defaultSocket.send(streamStart(defaultCall.CallId, defaultToken))
  defaultSocket.send(JSON.stringify({ event: 'media', media: { payload: 'AQID' } }))
  await defaultMedia
  const defaultEvents = await (await worker.dispatchFetch(`${origin}/test/events`)).json()
  const defaultSession = defaultEvents.filter(event => event.type === 'session.start').at(-1).session
  assert.equal(defaultSession.audio.output.voice, 'marin', 'an unset customer voice uses the default')
  assert.match(defaultSession.instructions, /speak in the caller’s language/, 'an unset customer language uses the default instruction')
  assert.doesNotMatch(defaultSession.instructions, /Offer the second customer a quote\./, 'removed rules do not persist across calls')
  defaultSocket.close(1000)
  const missingCall = { ...fields, CallId: 'CA_MISSING_MAPPING' }
  const missingXml = await (await worker.dispatchFetch(...signedRequest(missingCall))).text()
  const missingToken = missingXml.match(/<Parameter name="token" value="([0-9a-f]{64})"\/>/)?.[1]
  assert.ok(missingToken)
  await db.prepare('DELETE FROM inbound_conversation_calls WHERE call_id = ?').bind(missingCall.CallId).run()
  const beforeMissing = (await (await worker.dispatchFetch(`${origin}/test/events`)).json()).filter(event => event.type === 'session.start').length
  const missingUpgrade = await worker.dispatchFetch(`${origin}/api/clawops/stream`, { headers: { Upgrade: 'websocket' } })
  const missingSocket = missingUpgrade.webSocket
  missingSocket.accept()
  const missingClosed = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Stream with missing customer mapping did not close')), 5000)
    missingSocket.addEventListener('close', event => { clearTimeout(timer); resolve(event.code) }, { once: true })
  })
  missingSocket.send(streamStart(missingCall.CallId, missingToken))
  assert.equal(await missingClosed, 1008, 'missing customer mapping closes the stream')
  const afterMissing = (await (await worker.dispatchFetch(`${origin}/test/events`)).json()).filter(event => event.type === 'session.start').length
  assert.equal(afterMissing, beforeMissing, 'missing customer mapping does not start a Live session')
  const intent = 'a'.repeat(64)
  await db.prepare('INSERT INTO live_calls (intent, action_id, destination, instruction) VALUES (?, ?, ?, ?)').bind(intent, 'b'.repeat(64), '01012340000', 'Synthetic task').run()
  const outboundFields = { ...fields, CallId: 'CA_OUTBOUND', Direction: 'outbound', From: '07012340000', To: '+821012340000' }
  const badTo = { ...outboundFields, CallId: 'CA_WRONG_TO', To: '01099999999' }
  assert.equal((await worker.dispatchFetch(...signedRequest(badTo, 'synthetic-signing-key', `${url}?intent=${intent}`))).status, 401, 'a signed webhook cannot bind a different destination')
  const badIntent = { ...outboundFields, CallId: 'CA_WRONG_INTENT' }
  assert.equal((await worker.dispatchFetch(...signedRequest(badIntent, 'synthetic-signing-key', `${url}?intent=${'f'.repeat(64)}`))).status, 401, 'a signed webhook cannot bind an unknown intent')
  const outbound = await worker.dispatchFetch(...signedRequest(outboundFields, 'synthetic-signing-key', `${url}?intent=${intent}`))
  assert.equal(outbound.status, 200, 'an intent can be bound before the create-call response arrives')
  const outboundXml = await outbound.text()
  const outboundToken = outboundXml.match(/<Parameter name="token" value="([0-9a-f]{64})"\/>/)?.[1]
  assert.ok(outboundToken)
  const tamperedUpgrade = await worker.dispatchFetch(`${origin}/api/clawops/stream`, { headers: { Upgrade: 'websocket' } })
  const tamperedSocket = tamperedUpgrade.webSocket
  tamperedSocket.accept()
  const tamperedClosed = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Stripped context was not rejected')), 5000)
    tamperedSocket.addEventListener('close', event => { clearTimeout(timer); resolve(event.code) }, { once: true })
  })
  tamperedSocket.send(streamStart(outboundFields.CallId, outboundToken))
  assert.equal(await tamperedClosed, 1008, 'outbound context cannot be stripped from the stream start')
  const upgradedOutbound = await worker.dispatchFetch(`${origin}/api/clawops/stream`, { headers: { Upgrade: 'websocket' } })
  const outboundSocket = upgradedOutbound.webSocket
  outboundSocket.accept()
  const outboundMedia = nextMessage(outboundSocket)
  outboundSocket.send(streamStart(outboundFields.CallId, outboundToken, { intent, to: '01012340000' }))
  outboundSocket.send(JSON.stringify({ event: 'media', media: { payload: 'AQID' } }))
  assert.deepEqual(await outboundMedia, { event: 'media', media: { payload: 'AQID' } })
  const outboundEvents = await (await worker.dispatchFetch(`${origin}/test/events`)).json()
  const outboundInstructions = outboundEvents.filter(event => event.type === 'session.start').at(-1).session.instructions
  assert.match(outboundInstructions, /^Synthetic task/)
  assert.match(outboundInstructions, /통화 종료하겠습니다\. 감사합니다\./, 'outbound calls include the closing announcement')
  outboundSocket.send(JSON.stringify({ event: 'stop' }))
  let fragments = []
  for (let i = 0; i < 30; i++) {
    fragments = (await db.prepare('SELECT role, text FROM live_call_transcripts WHERE call_id = ? ORDER BY rowid').bind(outboundFields.CallId).all()).results
    if (fragments.length === 2) break
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  assert.deepEqual(fragments.map(({ role, text }) => ({ role, text })), [{ role: 'business', text: 'hello ' }, { role: 'agent', text: ' last' }])
  let finished = false
  for (let i = 0; i < 30; i++) {
    const row = await db.prepare('SELECT bridge_finished_at FROM live_calls WHERE call_id = ?').bind(outboundFields.CallId).first()
    if (row?.bridge_finished_at) { finished = true; break }
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  assert.equal(finished, true, 'the bridge is marked finished only after the final transcript is persisted')
  const unsignedIntent = 'c'.repeat(64)
  await db.prepare('INSERT INTO live_calls (intent, action_id, destination, instruction) VALUES (?, ?, ?, ?)').bind(unsignedIntent, 'd'.repeat(64), '01012340000', 'Unsigned synthetic task').run()
  const [unsignedUrl, unsignedOptions] = signedRequest({ ...outboundFields, CallId: 'CA_UNSIGNED' }, 'synthetic-signing-key', `${url}?intent=${unsignedIntent}`)
  delete unsignedOptions.headers['x-signature']
  unsignedOptions.headers['x-test-unsigned'] = '1'
  assert.equal((await worker.dispatchFetch(unsignedUrl, unsignedOptions)).status, 200, 'reserved outbound webhook works without a signing key')
  console.log('ClawOps webhook and bidirectional media integration passed with a local D1 and mocked OpenAI')
} finally {
  await worker.dispose()
}
