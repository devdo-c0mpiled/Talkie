import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'

const bundle = await build({
  entryPoints: ['scripts/check-ai-worker.mjs'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  external: ['node:*'],
  plugins: [{
    name: 'synthetic-cloudflare-env',
    setup(build) {
      build.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'test-env', namespace: 'test-env' }))
      build.onLoad({ filter: /.*/, namespace: 'test-env' }, () => ({
        contents: 'globalThis.__talkieTestEnv = {}; export const env = globalThis.__talkieTestEnv;',
        loader: 'js',
      }))
    },
  }],
})

const worker = new Miniflare({
  workers: [{ config: {
    name: 'synthetic-ai-check',
    compatibilityDate: '2026-11-08',
    compatibilityFlags: ['nodejs_compat'],
    manifest: {
      mainModule: 'worker.mjs',
      modules: { 'worker.mjs': { type: 'esm', contents: bundle.outputFiles[0].text } },
    },
  } }],
})
try {
  const response = await worker.dispatchFetch('http://localhost/')
  assert.equal(response.status, 200, await response.text())
  console.log('AI adapter checks passed in a local Worker with mocked providers')
} finally {
  await worker.dispose()
}
