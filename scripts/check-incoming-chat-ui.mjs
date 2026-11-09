import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'

const require = createRequire(import.meta.url)
const bundle = await build({
  entryPoints: ['src/components/chat/TokieChat.tsx'], bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'synthetic-boundaries', setup(build) {
    build.onResolve({ filter: /^react$/ }, () => ({ path: 'hooks', namespace: 'synthetic' }))
    build.onResolve({ filter: /^real-react$/ }, () => ({ path: require.resolve('react') }))
    build.onResolve({ filter: /^@tanstack\/ai-react$/ }, () => ({ path: 'chat', namespace: 'synthetic' }))
    build.onResolve({ filter: /auth-client$/ }, () => ({ path: 'auth', namespace: 'synthetic' }))
    build.onResolve({ filter: /\.webp$/ }, () => ({ path: 'image', namespace: 'synthetic' }))
    build.onLoad({ filter: /.*/, namespace: 'synthetic' }, ({ path }) => ({ loader: 'js', contents: path === 'hooks' ? `
      export * from 'real-react';
      export const useState = initial => [globalThis.__states.length ? globalThis.__states.shift() : (typeof initial === 'function' ? initial() : initial), () => {}];
      export const useEffect = () => {}; export const useRef = value => ({ current: value }); export const useId = () => 'synthetic-input';
    ` : path === 'chat' ? `
      export const fetchServerSentEvents = () => ({});
      export const useChat = options => ({ messages: [...options.initialMessages, ...globalThis.__messages], sendMessage() {}, isLoading: false, error: null, interrupts: [], setMessages() {} });
    ` : path === 'auth' ? 'export const authClient = { useSession: () => globalThis.__session };' : 'export default "synthetic.webp";' }))
  } }],
})
const { TokieChat } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const conversation = { id: 'call-a', callerNumber: '07012345678', createdAt: 1, calls: [{ callId: 'a', createdAt: 1, state: 'complete', lines: [{ id: 'line-a', role: 'business', text: '합성 통화 내용', final: true }] }] }
globalThis.__session = { isPending: false, data: { user: { id: 'customer-a' } } }
globalThis.__states = [[conversation], 'call-a', [conversation], false, false, false, 0]
globalThis.__messages = [
  { id: 'result-reply', role: 'assistant', parts: [
    { type: 'tool-call', name: 'get_call_result', output: { state: 'done', outcome: 'completed', result: { id: 'TK-TEST-1234', status: 'pending', business: 'Example Clinic', headline: 'Pending', when: '' } } },
    { type: 'text', content: 'The clinic will confirm your booking.' },
  ] },
  { id: 'next-message', role: 'user', parts: [{ type: 'text', content: 'Thank you, Tokie.' }] },
]
globalThis.window = { location: { host: 'example.test' } }
const html = renderToStaticMarkup(React.createElement(TokieChat))
assert.match(html, /Incoming conversations/)
assert.match(html, /07012345678/)
assert.match(html, /합성 통화 내용/)
assert.match(html, /Incoming call transcript/)
assert.doesNotMatch(html, /untrusted statements/)
assert.match(html, /Message Tokie/)
assert.match(html, /href="\/sfu-live"[^>]*>Open voice conversation<\/a>/)
assert.match(html, /Experimental in-app voice/)
assert.match(html, /Separate from phone calls and RealtimeKit meetings/)
assert.match(html, /Live provider connections have not been verified/)
assert.match(html, /href="\/b\/TK-TEST-1234"[^>]*target="_blank"/)
assert.match(html, /Your booking at Example Clinic/)
assert.ok(html.indexOf('The clinic will confirm your booking.') < html.indexOf('href="/b/TK-TEST-1234"'), 'result card follows the assistant reply')
assert.ok(html.indexOf('href="/b/TK-TEST-1234"') < html.indexOf('Thank you, Tokie.'), 'result card precedes the next user message')
const firstKey = TokieChat().key
globalThis.__session = { isPending: false, data: { user: { id: 'customer-b' } } }
assert.notEqual(TokieChat().key, firstKey, 'account switch remounts private conversation state')
globalThis.__session = { isPending: false, data: null }
assert.notEqual(TokieChat().key, firstKey, 'sign out remounts private conversation state')
console.log('Incoming chat selection, transcript and account isolation checks passed')

// Exercise the real React lifecycle in a headless browser: a transient polling
// failure must not unmount the selected chat or discard its typed message.
const { createServer } = await import('node:http')
const { spawn } = await import('node:child_process')
const { mkdtemp, rm } = await import('node:fs/promises')
const { tmpdir } = await import('node:os')
const { join } = await import('node:path')
const browserBundle = await build({
  stdin: { resolveDir: process.cwd(), sourcefile: 'incoming-ui-fixture.tsx', loader: 'tsx', contents: `
    import React from 'react'
    import { createRoot } from 'react-dom/client'
    import { TokieChat } from './src/components/chat/TokieChat'
    const realFetch = window.fetch.bind(window)
    const progress = stage => { void realFetch('/progress?stage=' + stage).catch(() => {}) }
    progress('module')
    const conversation = { id: 'call-a', callerNumber: '07012345678', createdAt: 1, calls: [{ callId: 'a', createdAt: 1, state: 'complete', lines: [{ id: 'line-a', role: 'business', text: '합성 통화 내용', final: true }] }] }
    let mode = 'ok'
    let poll
    const realInterval = window.setInterval.bind(window)
    window.setInterval = (fn, ms, ...args) => ms === 5000 ? (poll = fn, 987654) : realInterval(fn, ms, ...args)
    window.fetch = (url, options) => {
      if (String(url).startsWith('/api/incoming')) {
        if (mode === 'offline') return Promise.reject(new Error('synthetic network failure'))
        if (mode === 'unauthorized') return Promise.resolve(new Response(null, { status: 401 }))
        const body = { customer: { id: '0001' }, conversations: [conversation], ...(String(url).includes('?conversation=') ? { selected: conversation } : {}) }
        return Promise.resolve(Response.json(body))
      }
      return realFetch(url, options)
    }
    const wait = async (condition) => {
      for (let i = 0; i < 100; i++) { if (condition()) return; await new Promise(r => setTimeout(r, 20)) }
      throw new Error('Timed out waiting for UI state')
    }
    const report = result => realFetch('/result', { method: 'POST', body: JSON.stringify(result) })
    try {
      createRoot(document.getElementById('root')).render(<TokieChat />)
      progress('render')
      await wait(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('07012345678')))
      progress('list')
      ;[...document.querySelectorAll('button')].find(b => b.textContent.includes('07012345678')).click()
      await wait(() => !!document.querySelector('[aria-label="Incoming call transcript"]'))
      progress('selection')
      const selected = () => [...document.querySelectorAll('.lp.ch')].find(el => !el.parentElement.hidden && el.querySelector('[aria-label="Incoming call transcript"]'))
      const input = selected().querySelector('input')
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '메시지 보존')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await wait(() => input.value === '메시지 보존')
      mode = 'offline'; poll()
      await wait(() => selected()?.textContent.includes('Couldn’t load incoming conversations'))
      progress('offline')
      if (selected().querySelector('input') !== input || input.value !== '메시지 보존') throw new Error('Transient error discarded selected chat state')
      mode = 'unauthorized'; poll()
      await wait(() => !document.querySelector('[aria-label="Incoming call transcript"]'))
      progress('unauthorized')
      if (document.body.textContent.includes('07012345678') || document.body.textContent.includes('합성 통화 내용')) throw new Error('Unauthorized response retained private data')
      progress('report')
      await report({ ok: true })
    } catch (error) { await report({ ok: false, error: String(error) }) }
  ` },
  bundle: true, write: false, platform: 'browser', format: 'esm',
  plugins: [{ name: 'browser-test-boundaries', setup(build) {
    build.onResolve({ filter: /^@tanstack\/ai-react$/ }, () => ({ path: 'chat', namespace: 'browser-test' }))
    build.onResolve({ filter: /auth-client$/ }, () => ({ path: 'auth', namespace: 'browser-test' }))
    build.onResolve({ filter: /\.webp$/ }, () => ({ path: 'image', namespace: 'browser-test' }))
    build.onLoad({ filter: /.*/, namespace: 'browser-test' }, ({ path }) => ({ loader: 'js', resolveDir: process.cwd(), contents: path === 'chat' ? `
      import { useState } from 'react'
      export const fetchServerSentEvents = () => ({})
      export function useChat(options) {
        const [messages, setMessages] = useState(options.initialMessages)
        return { messages, setMessages, sendMessage() {}, isLoading: false, error: null, interrupts: [] }
      }
    ` : path === 'auth' ? 'export const authClient = { useSession: () => ({ isPending: false, data: { user: { id: "synthetic-user" } } }) }' : 'export default "synthetic.webp"' }))
  } }],
})
const profile = await mkdtemp(join(tmpdir(), 'talkie-incoming-ui-'))
let browser
let resolveResult
const result = new Promise(resolve => { resolveResult = resolve })
let documentRequests = 0
let fixtureRequests = 0
const stages = new Set()
const allowedStages = new Set(['page', 'module', 'render', 'list', 'selection', 'offline', 'unauthorized', 'report'])
const browserErrors = new Set()
function browserDiagnostics() {
  return `document requests=${documentRequests}, fixture requests=${fixtureRequests}, stages=${[...stages].join(',') || 'none'}, Firefox stderr categories=${[...browserErrors].join(',') || 'none'}`
}
const server = createServer((request, response) => {
  if (request.url === '/fixture.js') { fixtureRequests++; response.writeHead(200, { 'Content-Type': 'text/javascript' }); response.end(browserBundle.outputFiles[0].text); return }
  if (request.url?.startsWith('/progress?stage=')) {
    const stage = new URL(request.url, 'http://127.0.0.1').searchParams.get('stage')
    if (allowedStages.has(stage)) stages.add(stage)
    response.writeHead(204); response.end(); return
  }
  if (request.url === '/result' && request.method === 'POST') {
    let body = ''
    request.on('data', chunk => { body += chunk })
    request.on('end', () => { response.end('ok'); resolveResult(JSON.parse(body)) })
    return
  }
  if (request.url === '/') documentRequests++
  response.writeHead(200, { 'Content-Type': 'text/html' })
  response.end(`<div id="root"></div><script>
    void fetch('/progress?stage=page').catch(() => {});
    const reportPageError = (kind, error) => {
      const name = ['Error', 'TypeError', 'ReferenceError', 'SyntaxError', 'RangeError'].includes(error?.name) ? error.name : 'unknown';
      fetch('/result', { method: 'POST', body: JSON.stringify({ ok: false, error: kind + ': ' + name }) });
    };
    window.addEventListener('error', event => {
      if (event.target === window || (event.target instanceof HTMLScriptElement && event.target.src.endsWith('/fixture.js'))) reportPageError('Page or fixture error', event.error);
    }, true);
    window.addEventListener('unhandledrejection', event => reportPageError('Unhandled promise rejection', event.reason));
  </script><script type="module" src="/fixture.js"></script>`)
})
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  browser = spawn('firefox', ['--headless', '--no-remote', '--profile', profile, `http://127.0.0.1:${server.address().port}/`], { stdio: ['ignore', 'ignore', 'pipe'] })
  // Report only fixed categories from stderr; browser output can contain host paths or other private data.
  browser.stderr.on('data', chunk => {
    const output = String(chunk).toLowerCase()
    for (const category of ['sandbox', 'permission', 'display', 'profile', 'xpcom', 'graphics', 'error']) {
      if (output.includes(category)) browserErrors.add(category)
    }
  })
  const browserStopped = new Promise(resolve => {
    browser.once('error', error => resolve({ ok: false, error: `Firefox failed to start (${error.code || 'unknown'}); ${browserDiagnostics()}` }))
    browser.once('exit', (code, signal) => resolve({ ok: false, error: `Firefox exited (code=${code}, signal=${signal}); ${browserDiagnostics()}` }))
  })
  const started = Date.now()
  const checkpoint = setTimeout(() => console.log(`Headless browser at 20 seconds: ${browserDiagnostics()}`), 20000)
  let timer
  const outcome = await Promise.race([result, browserStopped, new Promise(resolve => { timer = setTimeout(() => resolve({ ok: false, error: `Headless browser timed out; ${browserDiagnostics()}` }), 50000) })])
  clearTimeout(checkpoint)
  clearTimeout(timer)
  assert.equal(outcome.ok, true, `${outcome.error}; ${browserDiagnostics()}`)
  console.log(`Headless browser completed in ${Date.now() - started} ms: ${browserDiagnostics()}`)
  console.log('Real React state survives a transient polling failure and clears on 401')
} finally {
  browser?.kill('SIGKILL')
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
  await rm(profile, { recursive: true, force: true })
}
