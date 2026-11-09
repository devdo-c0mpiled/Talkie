import test from 'node:test';
import assert from 'node:assert/strict';
import { handleApi } from '../server/api.mjs';
import { buildPrompt } from '../server/config.mjs';
import { encodePcm16, decodePcm16, pcmSampleRate } from '../src/gemini-audio.mjs';

const settings = { provider: 'gemini', scenario: 'free', language: 'ko', voice: 'marin', instructions: '' };
const request = () => new Request('http://localhost:4317/api/session', {
  method: 'POST', headers: { origin: 'http://localhost:4317', 'Content-Type': 'application/json' },
  body: JSON.stringify(settings),
});

test('Gemini 토큰에 모델·프롬프트·음성을 고정하고 영구 키를 반환하지 않는다', async () => {
  let payload;
  const response = await handleApi(request(), { GEMINI_API_KEY: 'private-test-key' }, async (url, init) => {
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/auth_tokens');
    assert.equal(init.headers['x-goog-api-key'], 'private-test-key');
    payload = JSON.parse(init.body);
    return Response.json({ name: 'auth_tokens/one-use' });
  });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.uses, 1);
  assert.equal(payload.liveConnectConstraints, undefined);
  assert.equal(payload.bidiGenerateContentSetup.model, 'models/gemini-3.8-live');
  assert.equal(payload.bidiGenerateContentSetup.systemInstruction.parts[0].text, buildPrompt(settings));
  assert.deepEqual(payload.bidiGenerateContentSetup.generationConfig.responseModalities, ['AUDIO']);
  assert.deepEqual(payload.bidiGenerateContentSetup.inputAudioTranscription, {});
  assert.deepEqual(payload.bidiGenerateContentSetup.outputAudioTranscription, {});
  assert.ok(Date.parse(payload.newSessionExpireTime) < Date.parse(payload.expireTime));
  assert.equal(result.token, 'auth_tokens/one-use');
  assert.ok(!JSON.stringify(result).includes('private-test-key'));
});

test('Gemini 키 누락·상위 API 실패를 성공으로 처리하지 않는다', async () => {
  const never = () => { throw Error('호출하면 안 됨'); };
  assert.equal((await handleApi(request(), {}, never)).status, 503);
  const response = await handleApi(request(), { GEMINI_API_KEY: 'private-test-key' }, async () =>
    Response.json({ error: { message: 'private-test-key denied' } }, { status: 403 }));
  assert.equal(response.status, 502);
  assert.ok(!(await response.text()).includes('private-test-key'));
});

test('PCM16은 little-endian이며 입력을 클리핑하고 부호를 보존한다', () => {
  const bytes = Uint8Array.from(atob(encodePcm16(new Float32Array([-2, -1, 0, 1, 2]))), c => c.charCodeAt(0));
  assert.deepEqual([...bytes], [0, 128, 0, 128, 0, 0, 255, 127, 255, 127]);
  const samples = decodePcm16(encodePcm16(new Float32Array([-0.5, 0, 0.5])));
  assert.ok(Math.abs(samples[0] + 0.5) < 0.0001);
  assert.ok(Math.abs(samples[2] - 0.5) < 0.0001);
  assert.throws(() => decodePcm16(btoa('x')));
  assert.equal(pcmSampleRate('audio/pcm;rate=24000'), 24000);
  assert.equal(pcmSampleRate('audio/pcm'), 24000);
  assert.throws(() => pcmSampleRate('audio/mp3'));
  assert.throws(() => pcmSampleRate('audio/pcm;rate=0'));
});
