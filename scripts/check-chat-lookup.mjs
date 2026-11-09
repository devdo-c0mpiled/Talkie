import assert from 'node:assert/strict'
import { build } from 'esbuild'

const mocks = {
  'cloudflare:workers': "export const env = { OPENAI_API_KEY: 'synthetic' }",
  '@tanstack/react-start/server-only': '',
  '@tanstack/ai': `export const chat = options => { globalThis.chatCheck.options = options; return {} }
    export const chatParamsFromRequest = request => request.json()
    export const toServerSentEventsResponse = () => new Response('ok')`,
  './ai.server': 'export const getOpenAiChat = () => ({})',
  './call-result.server': 'export const prepareCallResult = () => { throw Error("unexpected result page") }',
  './chat-tools': `export const CALL_ENDED_MARKER = '[call-ended]'
    export const callBusinessDef = { name: 'call_business', server: run => ({ name: 'call_business', run }) }
    export const getCallResultDef = { name: 'get_call_result', server: run => ({ name: 'get_call_result', run }) }`,
  './clawops.server': `export const callsConfigured = () => globalThis.chatCheck.calls
    export const callLookupConfigured = () => globalThis.chatCheck.lookup
    export const fromCallReference = async ref => ref === 'signed' ? 'synthetic-call' : null
    export const getCallResult = async id => { globalThis.chatCheck.lookedUp = id; return { state: 'done', outcome: 'completed', transcriptIncomplete: true } }
    export const getCallReport = () => { throw Error('unexpected report') }
    export const normalizeKoreanNumber = () => { throw Error('unexpected call') }
    export const placeCall = () => { throw Error('unexpected call') }
    export const toCallReference = () => { throw Error('unexpected call') }`,
}
const bundle = await build({
  entryPoints: ['src/lib/chat.server.ts'], bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'synthetic-chat', setup(build) {
    build.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path, namespace: 'mock' } : undefined)
    build.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: mocks[args.path], loader: 'js' }))
  } }],
})
const { handleChat } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
for (const [calls, lookup] of [[true, true], [false, true], [false, false], [true, false]]) {
  globalThis.chatCheck = { calls, lookup }
  const response = await handleChat(new Request('https://example.test/api/chat', { method: 'POST', body: JSON.stringify({ messages: [] }) }))
  assert.equal(response.status, 200)
  const { tools, systemPrompts } = chatCheck.options
  assert.equal(tools.some(tool => tool.name === 'call_business'), calls)
  assert.equal(tools.some(tool => tool.name === 'get_call_result'), lookup)
  assert.equal(systemPrompts.some(prompt => prompt.includes('[call-ended]')), lookup)
  assert.equal(systemPrompts.some(prompt => prompt.includes('You cannot place calls yet')), !calls)
  if (lookup) {
    const tool = tools.find(item => item.name === 'get_call_result')
    assert.equal((await tool.run({ call: 'invalid' })).state, 'unknown')
    assert.equal(chatCheck.lookedUp, undefined)
    assert.equal((await tool.run({ call: 'signed' })).transcriptIncomplete, true)
    assert.equal(chatCheck.lookedUp, 'synthetic-call')
  }
}
console.log('Chat call creation and existing-call lookup configuration passed')
