import { decodePcm16, encodePcm16, pcmSampleRate } from './gemini-audio.mjs';
import type { Transcript } from './types';

type Hooks = {
  event: (type: string) => void;
  transcript: (row: Transcript, append: boolean) => void;
  usage: (value: unknown) => void;
  error: (message: string) => void;
};

// 영구 API 키 대신 서버가 발급한 1회용 토큰으로만 연결한다.
export class GeminiVoice {
  private socket?: WebSocket;
  private capture?: AudioWorkletNode;
  private source?: MediaStreamAudioSourceNode;
  private silent?: GainNode;
  private sources = new Set<AudioBufferSourceNode>();
  private nextPlayback = 0;
  private closed = false;
  private muted = false;
  private rejectConnect?: (error: Error) => void;
  private rows: Partial<Record<'user' | 'assistant', string>> = {};

  constructor(
    private context: AudioContext,
    private output: AnalyserNode,
    private hooks: Hooks,
    private started: number,
  ) {}

  async connect(token: string, model: string, stream: MediaStream, greeting: string) {
    if (!token?.startsWith('auth_tokens/') || !model) throw new Error('Gemini 연결 정보가 올바르지 않습니다.');
    await this.context.audioWorklet.addModule('/voice-capture.js');
    if (this.closed) return;
    this.source = this.context.createMediaStreamSource(stream);
    this.capture = new AudioWorkletNode(this.context, 'voice-capture');
    this.capture.onprocessorerror = () => this.fail('마이크 음성 처리 중 오류가 발생했습니다.');
    this.silent = this.context.createGain();
    this.silent.gain.value = 0;
    this.source.connect(this.capture);
    this.capture.connect(this.silent).connect(this.context.destination);

    const socket = this.socket = new WebSocket(
      'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=' + encodeURIComponent(token),
    );
    socket.binaryType = 'arraybuffer';
    let ready = false;
    await new Promise<void>((resolve, reject) => {
      this.rejectConnect = reject;
      socket.onopen = () => {
        if (this.closed) { socket.close(); return; }
        // 음성·전사·시스템 지침은 토큰 발급 시 서버에서 고정한다.
        socket.send(JSON.stringify({ setup: { model: model.startsWith('models/') ? model : 'models/' + model } }));
      };
      socket.onmessage = ({ data }) => {
        if (this.closed) return;
        try {
          const message = JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data));
          if (message.error) { this.fail('Gemini 응답 오류가 발생했습니다.'); return; }
          if (message.setupComplete) {
            ready = true;
            this.rejectConnect = undefined;
            this.hooks.event('gemini.setup_complete');
            resolve();
          }
          this.handleMessage(message);
        } catch { this.fail('Gemini 음성 응답을 처리하지 못했습니다.'); }
      };
      socket.onerror = () => this.fail('Gemini 음성 연결에 실패했습니다.');
      socket.onclose = event => {
        if (this.closed) return;
        this.hooks.event(`gemini.closed.${event.code}`);
        this.fail('Gemini 연결이 종료되었습니다. 다시 시작해 주세요.');
      };
      this.capture!.port.onmessage = ({ data }: MessageEvent<Float32Array>) => {
        if (this.closed || this.muted || !ready || socket.readyState !== WebSocket.OPEN) return;
        if (socket.bufferedAmount > 1024 * 1024) { this.fail('음성 전송이 지연되어 Gemini 연결을 종료했습니다.'); return; }
        try {
          socket.send(JSON.stringify({ realtimeInput: { audio: {
            data: encodePcm16(data), mimeType: `audio/pcm;rate=${this.context.sampleRate}`,
          } } }));
        } catch { this.fail('Gemini에 마이크 음성을 전송하지 못했습니다.'); }
      };
    });
    if (!this.closed) socket.send(JSON.stringify({ clientContent: {
      turns: [{ role: 'user', parts: [{ text: greeting }] }], turnComplete: true,
    } }));
  }

  private handleMessage(message: any) {
    if (message.usageMetadata) this.hooks.usage(message.usageMetadata);
    if (message.goAway) this.hooks.event('gemini.session_expiring');
    const content = message.serverContent;
    if (!content) return;
    if (content.interrupted) {
      this.stopPlayback();
      delete this.rows.assistant;
      this.hooks.event('gemini.interrupted');
    }
    for (const [role, transcription] of [
      ['user', content.inputTranscription], ['assistant', content.outputTranscription],
    ] as const) {
      if (!transcription?.text) continue;
      const append = !!this.rows[role];
      const id = this.rows[role] ||= crypto.randomUUID();
      this.hooks.transcript({ id, role, text: transcription.text, at: performance.now() - this.started }, append);
      this.hooks.event(`gemini.${role}.transcript`);
      if (transcription.finished) delete this.rows[role];
    }
    if (!content.interrupted) for (const part of content.modelTurn?.parts || []) {
      if (part.inlineData?.data) this.play(part.inlineData.data, part.inlineData.mimeType);
    }
    if (content.turnComplete) {
      this.rows = {};
      this.hooks.event('gemini.turn_complete');
    }
  }

  private play(data: string, mimeType: string) {
    const samples = decodePcm16(data);
    if (!samples.length || this.closed) return;
    const buffer = this.context.createBuffer(1, samples.length, pcmSampleRate(mimeType));
    buffer.copyToChannel(samples, 0);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.output);
    const start = Math.max(this.context.currentTime, this.nextPlayback);
    this.nextPlayback = start + buffer.duration;
    this.sources.add(source);
    source.onended = () => { source.disconnect(); this.sources.delete(source); };
    source.start(start);
    this.hooks.event('gemini.audio_received');
  }

  private stopPlayback() {
    for (const source of this.sources) {
      source.onended = null;
      try { source.stop(); } catch { /* 이미 재생이 끝난 소스 */ }
      source.disconnect();
    }
    this.sources.clear();
    this.nextPlayback = this.context.currentTime;
  }

  mute(value: boolean) {
    this.muted = value;
    if (value && this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
    }
  }

  private fail(message: string) {
    if (this.closed) return;
    this.close();
    this.hooks.error(message);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.rejectConnect?.(new Error('Gemini 연결이 종료되었습니다.'));
    this.rejectConnect = undefined;
    if (this.capture) { this.capture.port.onmessage = null; this.capture.onprocessorerror = null; this.capture.port.close(); this.capture.disconnect(); }
    this.source?.disconnect();
    this.silent?.disconnect();
    this.stopPlayback();
    this.socket?.close();
  }
}
