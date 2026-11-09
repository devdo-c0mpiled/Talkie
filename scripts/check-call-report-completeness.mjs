import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'

const bundle = await build({
  stdin: { contents: `
    import { getCallReport } from './src/lib/clawops.server'
    globalThis.fetch = async () => Response.json({ status: 'completed' })
    export default { async fetch(request, env) {
      const { failCount } = await request.json()
      globalThis.__testEnv.DB = failCount ? {
        prepare(sql) {
          if (sql.startsWith('SELECT count(*)')) throw new Error('synthetic D1 count failure')
          return env.DB.prepare(sql)
        },
      } : env.DB
      return Response.json(await getCallReport('CA_report'))
    } }
  `, resolveDir: process.cwd(), loader: 'js' },
  bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', external: ['node:*'],
  plugins: [{ name: 'synthetic-bindings', setup(build) {
    build.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'env', namespace: 'mock-env' }))
    build.onLoad({ filter: /.*/, namespace: 'mock-env' }, () => ({ contents: "export const env = globalThis.__testEnv = { CLAWOPS_ACCOUNT_ID: 'synthetic', CLAWOPS_API_KEY: 'synthetic' }", loader: 'js' }))
    build.onResolve({ filter: /^@tanstack\/react-start\/server-only$/ }, () => ({ path: 'server-only', namespace: 'mock-env' }))
  } }],
})
const worker = new Miniflare({ workers: [{ config: {
  name: 'call-report-test', compatibilityDate: '2026-11-08', compatibilityFlags: ['nodejs_compat'],
  env: { DB: { type: 'd1', id: 'synthetic-report-db' } },
  manifest: { mainModule: 'worker.mjs', modules: { 'worker.mjs': { type: 'esm', contents: bundle.outputFiles[0].text } } },
} }] })
try {
  const db = await worker.getD1Database('DB')
  for (const sql of (await readFile('migrations/0004_live_call_transcripts.sql', 'utf8')).split(';').filter(x => x.trim())) await db.prepare(sql).run()
  await db.prepare("INSERT INTO live_calls (intent, action_id, destination, instruction, call_id, bridge_started_at, bridge_finished_at) VALUES ('intent', 'action', '0212345678', 'synthetic', 'CA_report', 1, 2)").run()
  await db.prepare("INSERT INTO live_call_transcripts VALUES ('CA_report', 'event-1', 'business', 'confirmed', 0, 1)").run()
  const report = async (failCount = false) => {
    const response = await worker.dispatchFetch('https://example.test/', { method: 'POST', body: JSON.stringify({ failCount }) })
    assert.equal(response.status, 200)
    return response.json()
  }
  const complete = await report()
  assert.equal(complete.transcriptIncomplete, undefined)
  assert.equal(complete.lines.length, 1, 'a complete transcript produces lines')
  assert.equal(complete.lines[0].text, 'confirmed')
  const assertIncomplete = async (label, failCount = false) => {
    const result = await report(failCount)
    assert.equal(result.state, 'done', label)
    assert.equal(result.transcriptIncomplete, true, label)
    assert.deepEqual(result.lines, [], label)
  }
  await db.prepare('UPDATE live_calls SET bridge_finished_at = NULL, provider_completed_at = ? WHERE call_id = ?').bind(Date.now() - 31_000, 'CA_report').run()
  await assertIncomplete('unfinished bridge')
  await db.prepare('UPDATE live_calls SET bridge_finished_at = 2 WHERE call_id = ?').bind('CA_report').run()
  await db.prepare('UPDATE live_call_transcripts SET text = ? WHERE call_id = ?').bind('x'.repeat(6001), 'CA_report').run()
  await assertIncomplete('transcript over the character limit')
  await db.prepare("UPDATE live_call_transcripts SET text = 'confirmed' WHERE call_id = 'CA_report'").run()
  await assertIncomplete('count query failure', true)
  await db.prepare(`WITH RECURSIVE n(x) AS (SELECT 2 UNION ALL SELECT x + 1 FROM n WHERE x < 2000)
    INSERT INTO live_call_transcripts SELECT 'CA_report', 'event-' || x, 'business', '.', x, x + 1 FROM n`).run()
  const capped = await report()
  assert.ok(capped.transcript.length < 6000, 'fragment cap is checked independently of the character limit')
  assert.equal(capped.transcriptIncomplete, true)
  assert.deepEqual(capped.lines, [], 'transcript at the fragment cap')
  console.log('Call report completeness checks passed with synthetic D1 and provider')
} finally { await worker.dispose() }
