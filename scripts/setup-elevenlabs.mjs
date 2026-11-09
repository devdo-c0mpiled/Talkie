import { appendFileSync, readFileSync, chmodSync } from 'node:fs';
import { buildPrompt, greetingText } from '../server/config.mjs';
const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error('ELEVENLABS_API_KEY가 필요합니다.');

const headers = { 'xi-api-key': key, 'Content-Type': 'application/json' };
if (process.env.ELEVENLABS_AGENT_ID) {
  if (!process.argv.includes('--enable-voice-selection')) { console.log('PoC 에이전트가 이미 설정되어 있습니다.'); process.exit(0); }
  const r = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(process.env.ELEVENLABS_AGENT_ID)}`, {
    method:'PATCH',headers,body:JSON.stringify({platform_settings:{overrides:{conversation_config_override:{tts:{voice_id:true}}}}}),
  });
  if(!r.ok)throw new Error(`목소리 변경 설정 실패: HTTP ${r.status}`);
  const data=await r.json();
  if(!data.version_id)throw new Error('에이전트 버전 확인 실패');
  appendFileSync('.dev.vars',`\nELEVENLABS_VERSION_ID=${data.version_id}\n`);chmodSync('.dev.vars',0o600);
  console.log('목소리 선택을 허용하고 에이전트 버전을 저장했습니다.');process.exit(0);
}

let voice = 'cjVigY5qzO86Huf0OWal';
let llm = 'gpt-4.1-mini';
if (process.env.ELEVENLABS_SOURCE_AGENT_ID) {
  const r = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(process.env.ELEVENLABS_SOURCE_AGENT_ID)}`, { headers });
  if (!r.ok) throw new Error(`기존 설정 조회 실패: HTTP ${r.status}`);
  const source = await r.json();
  voice = source.conversation_config.tts.voice_id;
  llm = source.conversation_config.agent.prompt.llm;
}
const r = await fetch('https://api.elevenlabs.io/v1/convai/agents/create', { method: 'POST', headers, body: JSON.stringify({
  name: 'Talkie · Voice comparison PoC', tags: ['talkie', 'poc'],
  conversation_config: {
    agent: { first_message: '{{greeting}}', language: 'ko', dynamic_variables: {dynamic_variable_placeholders: {greeting:greetingText('ko'),test_prompt:buildPrompt({scenario:'booking',language:'ko',instructions:''})}}, prompt: {
      prompt: '{{test_prompt}}',
      llm, temperature: 0, ignore_default_personality: true,
    } },
    tts: { voice_id: voice, model_id: 'eleven_flash_v2_5' },
    conversation: { max_duration_seconds: 600, client_events: ['audio', 'interruption', 'user_transcript', 'agent_response', 'agent_response_correction'] },
  },
  platform_settings: {
    auth: { enable_auth: true },
    privacy: { record_voice: false, retention_days: 7 },
    overrides: { conversation_config_override: {
      agent: { prompt: { prompt: true }, language: true, first_message: true }, tts: {voice_id:true},
    } },
  },
}) });
const body = await r.json();
if (!r.ok) throw new Error(`PoC 에이전트 생성 실패: HTTP ${r.status} ${JSON.stringify(body)}`);
// Save the explicit version so the browser uses the verified override settings.
const configured = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${body.agent_id}`, {
  method: 'PATCH', headers,
  body: JSON.stringify({ platform_settings: { overrides: { conversation_config_override: {
    agent: { prompt: { prompt: true }, language: true, first_message: true }, tts: {voice_id:true},
  } } } }),
});
if (!configured.ok) throw new Error(`에이전트 설정 실패: HTTP ${configured.status}`);
const version = await configured.json();
appendFileSync('.dev.vars', `\nELEVENLABS_AGENT_ID=${body.agent_id}\nELEVENLABS_VERSION_ID=${version.version_id}\nELEVENLABS_LLM=${llm}\nELEVENLABS_VOICE_ID=${voice}\n`);
chmodSync('.dev.vars', 0o600);
console.log('Talkie 전용 에이전트를 생성했습니다. 기존 에이전트는 변경하지 않았습니다.');
