export type Provider = 'live' | 'realtime' | 'elevenlabs' | 'gemini';
export type Settings = { provider: Provider; scenario: string; language: string; voice: string; instructions: string; inputDeviceId?: string };
export type Phase = 'idle' | 'connecting' | 'connected' | 'closing';
export type LatencyResult = {id:number; status:string; speechStartMs:number; speechEndMs:number; outputStartMs?:number; latencyMs?:number; method:'local-audio-estimate'};
export type LatencyUpdate = {phase:string; waitingMs:number; result?:LatencyResult};
export type Transcript = { id: string; role: 'user' | 'assistant'; text: string; at: number; startMs?: number; endMs?: number };
export type ProviderConfig = { name: string; configured: boolean; model: string; backend?: string; voice?: string };
export type Config = { providers: Record<Provider, ProviderConfig>; scenarios: { id: string; title: string; role: string }[]; languages: string[]; maxDurationSeconds: number };
export type Run = {
  id: string; startedAt: string; settings: Settings; config: ProviderConfig;
  sessionId?: string; prompt?: string; connectedMs?: number; durationSeconds: number;
  transcript: Transcript[]; intervals: number[]; events: { type: string; at: number }[];
  usage?: unknown; finalization?: string; error?: string;
  latencyResults?: LatencyResult[];
  recoveries?: {at:number;message:string}[];
  scores: Record<string, number>; notes: string;
};
