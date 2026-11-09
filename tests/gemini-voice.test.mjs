import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { encodePcm16 } from '../src/gemini-audio.mjs';

// 브라우저 연결부만 대체하고 실제 GeminiVoice의 연결·이벤트·종료 흐름을 검사한다.
const source = readFileSync(new URL('../src/gemini-voice.ts', import.meta.url), 'utf8')
  .replace("'./gemini-audio.mjs'", JSON.stringify(new URL('../src/gemini-audio.mjs', import.meta.url).href));
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { GeminiVoice } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const node = () => ({ connect(other) { return other; }, disconnect() { this.disconnected = true; } });

test('Gemini 음성 전송·끼어들기·연결 취소 시 자원을 정리한다', async t => {
  const originalSocket = globalThis.WebSocket;
  const originalWorklet = globalThis.AudioWorkletNode;
  t.after(() => { globalThis.WebSocket = originalSocket; globalThis.AudioWorkletNode = originalWorklet; });
  const sockets = [], captures = [], outputs = [], events = [];
  globalThis.WebSocket = class {
    static OPEN = 1;
    readyState = 1; bufferedAmount = 0; sent = [];
    constructor() { sockets.push(this); }
    send(data) { this.sent.push(JSON.parse(data)); }
    close() { this.readyState = 3; }
  };
  globalThis.AudioWorkletNode = class {
    port = { close() { this.closed = true; } };
    constructor() { Object.assign(this, node()); captures.push(this); }
  };
  const context = {
    currentTime: 10, sampleRate: 48000,
    audioWorklet: { addModule: async () => {} }, destination: {},
    createMediaStreamSource: node,
    createGain: () => ({ ...node(), gain: { value: 1 } }),
    createBuffer: (_, count, rate) => ({ duration: count / rate, copyToChannel() {} }),
    createBufferSource: () => { const n = { ...node(), start(time) { this.startAt = time; }, stop() { this.stopped = true; } }; outputs.push(n); return n; },
  };
  const hooks = { event: e => events.push(e), transcript() {}, usage() {}, error: e => assert.fail(e) };
  const voice = new GeminiVoice(context, node(), hooks, performance.now());
  const connecting = voice.connect('auth_tokens/test', 'gemini-3.8-live', {}, '인사해 주세요.');
  await new Promise(setImmediate);
  const socket = sockets[0]; socket.onopen();
  socket.onmessage({ data: new TextEncoder().encode(JSON.stringify({ setupComplete: {} })).buffer });
  await connecting;
  assert.equal(socket.sent[0].setup.model, 'models/gemini-3.8-live');
  captures[0].port.onmessage({ data: new Float32Array([0.5]) });
  assert.equal(socket.sent.at(-1).realtimeInput.audio.mimeType, 'audio/pcm;rate=48000');
  voice.mute(true);
  assert.equal(socket.sent.at(-1).realtimeInput.audioStreamEnd, true);
  const before = socket.sent.length;
  captures[0].port.onmessage({ data: new Float32Array([0.5]) });
  assert.equal(socket.sent.length, before);
  const audio = { inlineData: { mimeType: 'audio/pcm;rate=24000', data: encodePcm16(new Float32Array(2400)) } };
  socket.onmessage({ data: JSON.stringify({ serverContent: { modelTurn: { parts: [audio, audio] } } }) });
  assert.equal(outputs[0].startAt, 10);
  assert.equal(outputs[1].startAt, 10.1);
  socket.onmessage({ data: JSON.stringify({ serverContent: { interrupted: true } }) });
  assert.ok(outputs.every(o => o.stopped && o.disconnected));
  assert.ok(events.includes('gemini.interrupted'));
  voice.close(); voice.close();
  assert.equal(socket.readyState, 3);
  assert.equal(captures[0].port.closed, true);
  assert.equal(captures[0].port.onmessage, null);
  const pending = new GeminiVoice(context, node(), hooks, performance.now());
  const promise = pending.connect('auth_tokens/test', 'gemini-3.8-live', {}, '인사');
  await new Promise(setImmediate);
  pending.close();
  await assert.rejects(promise, /종료/);
  assert.equal(sockets[1].readyState, 3);
});
