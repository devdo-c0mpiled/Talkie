import { Conversation } from '@elevenlabs/client';
import { GeminiVoice } from './gemini-voice';
import { greetingInstruction } from '../server/config.mjs';
import type { Settings, Transcript, LatencyUpdate } from './types';
import { TurnLatency } from './turn-latency.mjs';
import { PlaybackRecovery } from './playback-recovery.mjs';

type Hooks = {
  connected: (milliseconds: number, id?: string) => void;
  transcript: (row: Transcript, append: boolean) => void;
  event: (type: string) => void;
  levels: (input: number, output: number) => void;
  usage: (value: unknown) => void;
  metadata: (value: { sessionId?: string; prompt?: string }) => void;
  error: (message: string) => void;
  ended: () => void;
  latency?: (update: LatencyUpdate) => void;
  health?: (message: string) => void;
};
export class VoiceSession {
  private peer?: RTCPeerConnection;
  private channel?: RTCDataChannel;
  private stream?: MediaStream;
  private audio = new Audio();
  private context?: AudioContext;
  private gain?: GainNode;
  private playbackMeter?: AnalyserNode;
  private latency?: TurnLatency;
  private recovery?: PlaybackRecovery;
  private recoveryTimer?: ReturnType<typeof setInterval>;
  private muted = false;
  private audioObserver?: MutationObserver;
  private routedAudio = new WeakSet<HTMLMediaElement>();
  private routeOutput(stream: MediaStream) {
    this.output = this.analyser(stream);
    this.output.connect(this.gain!);
    this.hooks.event('playback.stream_attached');
  }
  private observeElevenAudio() {
    const attach = (element: HTMLMediaElement) => {
      if (this.routedAudio.has(element) || !(element.srcObject instanceof MediaStream)) return;
      this.routedAudio.add(element);
      element.muted = true;
      this.routeOutput(element.srcObject);
    };
    this.audioObserver = new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node instanceof HTMLAudioElement) {
          attach(node);
          node.addEventListener('loadedmetadata', () => attach(node), {once:true});
        }
      }
    });
    this.audioObserver.observe(document.body, {childList:true, subtree:true});
  }
  private input?: AnalyserNode;
  private output?: AnalyserNode;
  private eleven?: Awaited<ReturnType<typeof Conversation.startSession>>;
  private gemini?: GeminiVoice;
  private frame?: number;
  private id?: string;
  private closeToken?: string;
  private closed = false;
  private closing = false;
  private started = performance.now();
  private ready = false;
  private diagnosticsTimer?: ReturnType<typeof setInterval>;
  private inputPeak = 0;
  private outputPeak = 0;
  private transcriptCharacters = 0;
  private modelSpeechEvents = 0;
  private diagnosticSequence = 0;
  private diagnosticEvent(event: Record<string, unknown>) {
    if (this.settings.provider === 'gemini') return;
    void fetch('/api/diagnostics', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:this.settings.provider,sessionId:this.id||'',sequence:++this.diagnosticSequence,elapsedMs:Math.round(performance.now()-this.started),language:this.settings.language,...event})}).catch(()=>{});
  }
  private async reportDiagnostics() {
    if(this.closed || this.closing)return;
    const sample: Record<string, string | number | boolean> = {provider:this.settings.provider,sessionId:this.id||'',inputPeak:this.inputPeak,outputPeak:this.outputPeak,transcriptCharacters:this.transcriptCharacters,modelSpeechEvents:this.modelSpeechEvents,audioContext:this.context?.state||'unavailable'};
    this.inputPeak=0;this.outputPeak=0;
    if(this.peer) {
      try {
        const stats=await this.peer.getStats();
        stats.forEach(stat=>{
          if(stat.type==='outbound-rtp'&&stat.kind==='audio'){sample.bytesSent=stat.bytesSent||0;sample.packetsSent=stat.packetsSent||0;}
          if(stat.type==='remote-inbound-rtp'&&stat.kind==='audio'){sample.remoteReport=true;sample.packetsLost=stat.packetsLost||0;}
          if(stat.type==='inbound-rtp'&&stat.kind==='audio'){sample.bytesReceived=stat.bytesReceived||0;}
        });
      }catch{}
      sample.connection=this.peer.connectionState;
      this.hooks.event(`uplink.bytes=${sample.bytesSent||0}; packets=${sample.packetsSent||0}; remote=${!!sample.remoteReport}; transcript=${this.transcriptCharacters}`);
    }
    void fetch('/api/diagnostics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(sample)}).catch(()=>{});
  }
  private timeout?: ReturnType<typeof setTimeout>;
  private closePromise?: Promise<string>;
  private liveClosed?: () => void;
  private liveFinalized = false;
  private liveRows: Partial<Record<'user' | 'assistant', { id: string; end: number }>> = {};
  constructor(private settings: Settings, private hooks: Hooks) { this.audio.autoplay = true; }

  async connect() {
    this.started = performance.now();
    // Run before the first await, while the start-button gesture is active.
    this.context = new AudioContext();
    const resumed = this.context.resume();
    this.gain = this.context.createGain();
    this.playbackMeter = this.context.createAnalyser();
    this.playbackMeter.fftSize = 1024;
    this.gain.connect(this.playbackMeter);
    this.playbackMeter.connect(this.context.destination);
    this.latency = new TurnLatency((update: LatencyUpdate) => this.hooks.latency?.(update));
    this.recovery = new PlaybackRecovery((status: string, attempt: number) => {
      this.hooks.event(`playback.recovery.${status}.${attempt}`);
      this.hooks.health?.(status==='recovered'?'오디오 재생 복구됨':status==='attempt'?`오디오 재생 복구 중 (${attempt}/2)`:'자동 재생 복구 실패 · 스피커 재생을 눌러 주세요.');
    });
    const silence = this.context.createBufferSource();
    silence.buffer = this.context.createBuffer(1, 1, this.context.sampleRate);
    silence.connect(this.gain); silence.start();
    this.context.onstatechange = () => this.hooks.event(`playback.${this.context?.state}`);
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('마이크를 사용하려면 localhost 또는 HTTPS에서 열어 주세요.');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { ...(this.settings.inputDeviceId ? {deviceId: {exact: this.settings.inputDeviceId}} : {}), echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    if (this.closed || this.closing) { stream.getTracks().forEach(t => t.stop()); return; }
    this.stream = stream;
    const track = stream.getAudioTracks()[0];
    const capture = track.getSettings();
    this.hooks.event(`microphone.selected=${track.label}; sampleRate=${capture.sampleRate}; channels=${capture.channelCount}`);
    this.diagnosticEvent({eventType:'microphone.selected',micLabel:track.label,sampleRate:capture.sampleRate,channelCount:capture.channelCount,echoCancellation:capture.echoCancellation,noiseSuppression:capture.noiseSuppression,autoGainControl:capture.autoGainControl});
    await resumed;
    this.input = this.analyser(stream);
    stream.getAudioTracks()[0].onended = () => { if (!this.closing && !this.closed) this.fail('마이크 연결이 종료되었습니다. 마이크를 선택하고 다시 시작해 주세요.'); };
    this.meter();
    this.timeout = setTimeout(() => this.fail('연결 시간이 초과되었습니다. 서비스 권한과 네트워크를 확인해 주세요.'), 55000);
    if (this.settings.provider === 'gemini') {
      const data = await this.createSession();
      if (this.closing || this.closed) return;
      this.output = this.context.createAnalyser();
      this.output.fftSize = 512;
      this.output.connect(this.gain);
      this.gemini = new GeminiVoice(this.context, this.output, {
        event: this.hooks.event, transcript: this.hooks.transcript, usage: this.hooks.usage,
        error: message => this.fail(message),
      }, this.started);
      await this.gemini.connect(data.token, data.model!, stream, greetingInstruction(this.settings));
      this.markReady();
      return;
    }
    if (this.settings.provider === 'elevenlabs') {
      const data = await this.createSession();
      if (this.closing || this.closed) return;
      this.observeElevenAudio();
      const conversation = await Conversation.startSession({
        inputDeviceId: this.settings.inputDeviceId, connectionType: 'webrtc', conversationToken: data.token, overrides: data.overrides, dynamicVariables: data.dynamicVariables,
        onConnect: () => { if (!this.closing && !this.closed) this.markReady(); },
        onMessage: message => {
          if (this.closed) return;
          const role = message.source === 'user' ? 'user' : 'assistant';
          if(role==='user'){this.transcriptCharacters+=message.message.length;this.modelSpeechEvents++;}
          this.hooks.transcript({ id: message.event_id !== undefined ? `${role}-${message.event_id}` : crypto.randomUUID(), role, text: message.message, at: performance.now() - this.started }, false);
        },
        onError: message => { if (!this.closing) this.fail(message || 'ElevenLabs 대화 오류'); },
        onDisconnect: () => { if (!this.closing && !this.closed) this.hooks.ended(); },
        onModeChange: ({ mode }) => this.hooks.event(`elevenlabs.${mode}`),
        onAgentResponseCorrection: message => {
          this.hooks.transcript({ id: `assistant-${message.event_id}`, role: 'assistant', text: message.corrected_agent_response, at: performance.now() - this.started }, false);
        },
      });
      if (this.closed || this.closing) { await conversation.endSession(); return; }
      this.eleven = conversation;
      this.id = conversation.getId();
      this.hooks.metadata({ sessionId: this.id });
      this.markReady();
      return;
    }
    const peer = this.peer = new RTCPeerConnection();
    peer.ontrack = event => {
      const remote = new MediaStream([event.track]);
      this.audio.srcObject = remote;
      this.audio.muted = true;
      this.routeOutput(remote);
      void this.audio.play().catch(() => { /* Web Audio owns audible playback. */ });
    };
    peer.onconnectionstatechange = () => {
      if (this.closed || this.closing) return;
      if (peer.connectionState === 'failed') this.fail('음성 연결이 끊어졌습니다. 다시 연결해 주세요.');
    };
    for (const track of stream.getAudioTracks()) peer.addTrack(track, stream);
    this.channel = peer.createDataChannel('oai-events');
    this.channel.onmessage = ({ data }) => {
      try { this.handleEvent(JSON.parse(data)); } catch { this.hooks.event('invalid_event'); }
    };
    this.channel.onclose = () => { if (!this.closing && !this.closed) this.hooks.ended(); };
    this.channel.onerror = () => { if (!this.closing && !this.closed) this.fail('대화 이벤트 연결 오류가 발생했습니다.'); };
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    if (peer.iceGatheringState !== 'complete') await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { peer.removeEventListener('icegatheringstatechange', onState); reject(new Error('음성 연결 준비 시간이 초과되었습니다.')); }, 10000);
      const onState = () => { if (peer.iceGatheringState === 'complete') { clearTimeout(timer); peer.removeEventListener('icegatheringstatechange', onState); resolve(); } };
      peer.addEventListener('icegatheringstatechange', onState); onState();
    });
    if (this.closed || this.closing) return;
    const result = await this.createSession(peer.localDescription?.sdp);
    this.id = result.id;
    this.hooks.metadata({ sessionId: this.id });
    if (this.closed || this.closing) { await this.serverClose(); return; }
    await peer.setRemoteDescription({ type: 'answer', sdp: result.sdp });
  }
  private async createSession(sdp?: string) {
    const response = await fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...this.settings, sdp }), signal: AbortSignal.timeout(50000) });
    const result = await response.json() as { error?: string; prompt: string; closeToken?: string; id?: string; model?: string; sdp: string; token: string; dynamicVariables: Record<string,string>; overrides: { tts?: {voiceId:string}; agent: { prompt: {prompt: string}; language: 'ko' | 'en' | 'ja' | 'zh'; firstMessage: string } } };
    if (!response.ok) throw new Error(result.error || '서비스 연결에 실패했습니다.');
    this.closeToken = result.closeToken;
    this.hooks.metadata({ prompt: result.prompt });
    return result;
  }
  private analyser(stream: MediaStream) {
    const analyser = this.context!.createAnalyser(); analyser.fftSize = 512;
    this.context!.createMediaStreamSource(stream).connect(analyser);
    return analyser;
  }
  private meter = () => {
    if (this.closed) return;
    const level = (node?: AnalyserNode) => {
      if (!node) return 0;
      const data = new Float32Array(node.fftSize); node.getFloatTimeDomainData(data);
      return Math.min(1, Math.sqrt(data.reduce((s, n) => s + n * n, 0) / data.length) * 5);
    };
    const inputLevel=level(this.input), outputLevel=level(this.output);
    this.inputPeak=Math.max(this.inputPeak,inputLevel);this.outputPeak=Math.max(this.outputPeak,outputLevel);
    if(this.ready&&!this.closing)this.latency?.sample(performance.now()-this.started,inputLevel,level(this.playbackMeter),{muted:this.muted,running:this.context?.state==='running',visible:document.visibilityState==='visible'});
    this.hooks.levels(inputLevel,outputLevel);
    this.frame = requestAnimationFrame(this.meter);
  };
  private markReady() {
    if (this.ready || this.closed || this.closing) return;
    this.ready = true; clearTimeout(this.timeout);
    this.recoveryTimer=setInterval(()=>{if(!this.closing&&!this.closed)void this.recovery?.check(this.context,performance.now(),document.visibilityState==='visible');},1000);
    if(this.settings.provider!=='gemini')this.diagnosticsTimer=setInterval(()=>void this.reportDiagnostics(),3000);
    this.hooks.connected(performance.now() - this.started, this.id);
    if (this.channel?.readyState === 'open') {
      const greeting = greetingInstruction(this.settings);
      this.channel.send(JSON.stringify(this.settings.provider === 'live'
        ? {type:'session.commentary.append', event_id:crypto.randomUUID(), delegation_id:null, content:greeting}
        : {type:'response.create', response:{instructions:greeting}}));
    }
  }
  private handleEvent(event: any) {
    if (this.closed) return;
    this.hooks.event(event.type);
    if (['session.input_transcript.delta','session.output_transcript.delta','conversation.item.input_audio_transcription.completed','response.output_audio_transcript.done'].includes(event.type)) {
      this.diagnosticEvent({eventType:event.type,text:event.delta??event.transcript??'',startMs:event.start_ms,endMs:event.end_ms});
    }
    if (event.type === 'error' || event.type === 'response.done') {
      this.diagnosticEvent({eventType:event.type,responseStatus:event.response?.status,errorCode:event.error?.code||event.response?.status_details?.error?.code||''});
    }
    if(event.type==='input_audio_buffer.speech_started')this.modelSpeechEvents++;
    if(event.type==='session.input_transcript.delta'||event.type==='conversation.item.input_audio_transcription.delta')this.transcriptCharacters+=(event.delta||'').length;
    if(event.type==='conversation.item.input_audio_transcription.completed')this.transcriptCharacters=Math.max(this.transcriptCharacters,(event.transcript||'').length);
    if (event.type === 'error') { this.fail(event.error?.message || event.message || '음성 서비스 오류'); return; }
    if (event.type === 'session.started' || event.type === 'session.created') {
      this.markReady();
    }
    if (event.type === 'session.closed') {
      this.liveFinalized = true; this.hooks.usage(event.usage); this.liveClosed?.();
      if (!this.closing) this.hooks.ended();
    }
    if (event.type === 'response.done') {
      if (event.response?.usage) this.hooks.usage(event.response.usage);
      if (event.response?.status === 'failed') this.fail(event.response.status_details?.error?.message || '응답 생성에 실패했습니다.');
    }
    if (event.type === 'response.event' && event.event?.type === 'response.completed') this.hooks.usage(event.event.response?.usage);
    if (event.type === 'input_audio_buffer.speech_started') {
      this.hooks.transcript({id:event.item_id,role:'user',text:'',at:performance.now()-this.started},false);
    }
    if (event.type === 'conversation.item.input_audio_transcription.delta') {
      this.hooks.transcript({id:event.item_id,role:'user',text:event.delta,at:performance.now()-this.started},true);
    }
    if (event.type === 'conversation.item.input_audio_transcription.completed') {
      this.hooks.transcript({ id: event.item_id, role: 'user', text: event.transcript, at: performance.now() - this.started }, false);
    }
    if (event.type === 'conversation.item.input_audio_transcription.failed') this.hooks.error('사용자 음성 전사에 실패했습니다.');
    if (event.type === 'response.output_audio_transcript.delta') {
      this.hooks.transcript({ id: event.item_id || event.response_id, role: 'assistant', text: event.delta, at: performance.now() - this.started }, true);
    }
    if (event.type === 'response.output_audio_transcript.done') {
      this.hooks.transcript({ id: event.item_id || event.response_id, role: 'assistant', text: event.transcript, at: performance.now() - this.started }, false);
    }
    if (event.type === 'session.input_transcript.delta' || event.type === 'session.output_transcript.delta') {
      const role = event.type === 'session.input_transcript.delta' ? 'user' : 'assistant';
      const previous = this.liveRows[role];
      const fresh = !previous || event.start_ms - previous.end > 1600;
      const id = fresh ? crypto.randomUUID() : previous.id;
      this.liveRows[role] = { id, end: event.end_ms };
      this.hooks.transcript({ id, role, text: event.delta, at: performance.now() - this.started, startMs: event.start_ms, endMs: event.end_ms }, !fresh);
    }
  }
  private fail(message: string) { if (!this.closed && !this.closing) { this.hooks.error(message); this.hooks.ended(); } }
  mute(value: boolean) { this.muted=value;this.latency?.reset(performance.now()-this.started);this.stream?.getAudioTracks().forEach(t => { t.enabled = !value; }); this.eleven?.setMicMuted(value); this.gemini?.mute(value); }
  volume(value: number) { if(this.gain)this.gain.gain.value=value; }
  async play() { await this.context?.resume(); }
  private async serverClose() {
    if (!this.closeToken || this.settings.provider === 'elevenlabs') return;
    const r = await fetch('/api/session/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ closeToken: this.closeToken }), keepalive: true, signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw new Error('세션 종료 확인 실패');
  }
  close(): Promise<string> {
    if (this.closePromise) return this.closePromise;
    this.closing = true;
    this.closePromise = this.finish();
    return this.closePromise;
  }
  private async finish() {
    clearTimeout(this.timeout);
    clearInterval(this.diagnosticsTimer);clearInterval(this.recoveryTimer);this.recovery?.stop();
    this.latency?.reset(performance.now()-this.started);
    this.gemini?.close();
    let status = 'closed';
    try {
      if (this.settings.provider === 'live' && !this.liveFinalized && this.channel?.readyState === 'open') {
        await new Promise<void>(resolve => {
          const timer = setTimeout(resolve, 5000);
          this.liveClosed = () => { clearTimeout(timer); resolve(); };
          this.channel!.send(JSON.stringify({ type: 'session.close' }));
        });
        if (!this.liveFinalized) status = 'usage_unconfirmed';
      }
      await this.eleven?.endSession();
      await this.serverClose();
    } catch { status = 'close_unconfirmed'; }
    finally {
      this.closed = true;
      this.audioObserver?.disconnect();
      if (this.frame) cancelAnimationFrame(this.frame);
      this.stream?.getTracks().forEach(t => t.stop());
      this.channel?.close(); this.peer?.close();
      this.audio.pause(); this.audio.srcObject = null;
      await this.context?.close().catch(() => {});
      this.hooks.levels(0, 0);
    }
    return status;
  }
  unload() {
    clearTimeout(this.timeout);clearInterval(this.recoveryTimer);this.recovery?.stop();
    if(this.frame)cancelAnimationFrame(this.frame);
    clearInterval(this.diagnosticsTimer);
    this.gemini?.close();
    if (this.id && this.settings.provider !== 'elevenlabs') navigator.sendBeacon('/api/session/close', new Blob([JSON.stringify({ closeToken: this.closeToken })], { type: 'application/json' }));
    this.audioObserver?.disconnect();
    this.stream?.getTracks().forEach(t => t.stop()); this.peer?.close();
    void this.context?.close().catch(() => {});
    void this.eleven?.endSession();
  }
}
