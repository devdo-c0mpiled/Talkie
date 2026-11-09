import { voiceCatalog } from './voices.mjs';
import { buildPrompt, geminiConfig, greetingText, LANGUAGES, liveConfig, parseSettings, realtimeConfig, SCENARIOS } from './config.mjs';
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export function configuration(env) {
 return { providers: {
 gemini: {name:'Gemini Live',configured:!!env.GEMINI_API_KEY,model:env.GEMINI_LIVE_MODEL||'gemini-3.8-live',voice:'Kore'},
 live: { name: 'GPT Live', configured: !!env.OPENAI_API_KEY, model: env.OPENAI_LIVE_MODEL || 'gpt-live-1', backend: env.OPENAI_LIVE_BACKEND_MODEL || 'gpt-5.6-terra' },
 realtime: { name: 'GPT Realtime', configured: !!env.OPENAI_API_KEY, model: env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2.1' },
 elevenlabs: { name: 'ElevenLabs', configured: !!(env.ELEVENLABS_API_KEY && env.ELEVENLABS_AGENT_ID), model: 'eleven_flash_v2_5', backend: env.ELEVENLABS_LLM || '에이전트 설정', voice: env.ELEVENLABS_VOICE_ID },
 }, scenarios: Object.entries(SCENARIOS).map(([id, {title, role}]) => ({id,title,role})), languages: Object.keys(LANGUAGES), maxDurationSeconds: 600 };
}
const encoder = new TextEncoder();
async function signingKey(secret) { return crypto.subtle.importKey('raw', encoder.encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign','verify']); }
export async function signClose(provider,id,secret) {
 const payload = btoa(JSON.stringify({provider,id,expires:Date.now()+3600000}));
 const signature = await crypto.subtle.sign('HMAC',await signingKey(secret),encoder.encode(payload));
 return payload+'.'+btoa(String.fromCharCode(...new Uint8Array(signature)));
}
export async function verifyClose(token,secret) {
 const [payload,signature] = token.split('.');
 if(!await crypto.subtle.verify('HMAC',await signingKey(secret),Uint8Array.from(atob(signature),c=>c.charCodeAt(0)),encoder.encode(payload))) throw Error('Invalid token');
 const data=JSON.parse(atob(payload));
 if(data.expires<Date.now() || !['live','realtime'].includes(data.provider) || !/^[\w-]+$/.test(data.id)) throw Error('Invalid token');
 return data;
}
export async function handleApi(request, env, upstream = fetch) {
 const url=new URL(request.url);
 // This hackathon console runs locally. Remote access must be configured separately.
 if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)) return json({error:'로컬 테스트 환경에서 열어 주세요.'},403);
 if(request.method!=='GET' && request.headers.get('origin')!==url.origin) return json({error:'허용되지 않은 요청 출처입니다.'},403);
 if(url.pathname==='/api/voices' && request.method==='GET') return json(await voiceCatalog(env,upstream));
 if(url.pathname==='/api/config' && request.method==='GET') return json(configuration(env));
 if(request.method!=='POST') return json({error:'지원하지 않는 요청입니다.'},405);
 let body;
 try { const raw=await request.text(); if(raw.length>100000) return json({error:'요청이 너무 큽니다.'},413); body=JSON.parse(raw); } catch { return json({error:'잘못된 요청입니다.'},400); }
 if(url.pathname==='/api/diagnostics') {
  const allowed=['provider','sessionId','inputPeak','outputPeak','transcriptCharacters','modelSpeechEvents','audioContext','bytesSent','packetsSent','remoteReport','packetsLost','bytesReceived','connection','sequence','elapsedMs','language','eventType','text','startMs','endMs','micLabel','sampleRate','channelCount','echoCancellation','noiseSuppression','autoGainControl','responseStatus','errorCode'];
  const safe=Object.fromEntries(allowed.filter(k=>['string','number','boolean'].includes(typeof body[k])).map(k=>[k,typeof body[k]==='string'?body[k].slice(0,k==='text'?4000:200):body[k]]));
  safe.receivedAt=new Date().toISOString();
  console.info('VOICE_DIAGNOSTICS',JSON.stringify(safe));
  return json({received:true});
 }
 if(url.pathname==='/api/session/close') {
  let data; try {data=await verifyClose(body.closeToken,env.OPENAI_API_KEY);} catch {return json({error:'종료 토큰이 유효하지 않습니다.'},400);}
  try {
   const path=data.provider==='live'?'live/sessions':'realtime/calls';
   const r=await upstream(`https://api.openai.com/v1/${path}/${encodeURIComponent(data.id)}/hangup`,{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`},signal:AbortSignal.timeout(10000)});
   if(!r.ok && ![404,409].includes(r.status)) throw Error();
   return json({closed:true});
  } catch {return json({error:'서버 세션 종료를 확인하지 못했습니다.'},502);}
 }
 if(url.pathname!=='/api/session') return json({error:'존재하지 않는 API입니다.'},404);
 let settings;try {settings=parseSettings(body);} catch(e){return json({error:e.message},400);}
 const eleven=settings.provider==='elevenlabs';
 if(settings.provider==='gemini') {
  if(!env.GEMINI_API_KEY)return json({error:'GEMINI_API_KEY 설정이 필요합니다.'},503);
  try {
   const model=env.GEMINI_LIVE_MODEL||'gemini-3.8-live';const config=geminiConfig(settings);
   const r=await upstream('https://generativelanguage.googleapis.com/v1beta/auth_tokens',{method:'POST',headers:{'x-goog-api-key':env.GEMINI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({uses:1,expireTime:new Date(Date.now()+900000).toISOString(),newSessionExpireTime:new Date(Date.now()+60000).toISOString(),bidiGenerateContentSetup:{model:model.startsWith('models/')?model:'models/'+model,generationConfig:{responseModalities:config.responseModalities,speechConfig:config.speechConfig},systemInstruction:config.systemInstruction,inputAudioTranscription:config.inputAudioTranscription,outputAudioTranscription:config.outputAudioTranscription}}),signal:AbortSignal.timeout(25000)});
   const data=await r.json();if(!r.ok||!data.name)return json({error:`Gemini 연결 토큰 생성 실패 (HTTP ${r.status}): ${(data.error?.message||'응답 오류').split(env.GEMINI_API_KEY).join('[redacted]').slice(0,300)}`},502);
   return json({token:data.name,model,config,prompt:buildPrompt(settings)});
  } catch {return json({error:'Gemini 연결 토큰 요청에 실패했습니다.'},502);}
 }
 if(!configuration(env).providers[settings.provider].configured) return json({error:eleven?'ElevenLabs 키와 에이전트 설정이 필요합니다.':'OPENAI_API_KEY 설정이 필요합니다.'},503);
 if(!eleven && (typeof body.sdp!=='string'||!body.sdp.startsWith('v=0')||body.sdp.length>65536)) return json({error:'유효한 마이크 연결 정보가 필요합니다.'},400);
 try {
  let result;
  if(eleven) result=await upstream(`https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(env.ELEVENLABS_AGENT_ID)}${env.ELEVENLABS_VERSION_ID ? "&version_id="+encodeURIComponent(env.ELEVENLABS_VERSION_ID) : ""}`,{headers:{'xi-api-key':env.ELEVENLABS_API_KEY},signal:AbortSignal.timeout(25000)});
  else if(settings.provider==='live') result=await upstream('https://api.openai.com/v1/live/sessions',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({session:liveConfig(settings,env),transport:{type:'webrtc',sdp:body.sdp}}),signal:AbortSignal.timeout(45000)});
  else {const form=new FormData();form.set('sdp',body.sdp);form.set('session',JSON.stringify(realtimeConfig(settings,env)));result=await upstream('https://api.openai.com/v1/realtime/calls',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`},body:form,signal:AbortSignal.timeout(45000)});}
  if(!result.ok) {
   let detail='';try {const data=await result.json();detail=data.error?.message||data.detail?.message||'';}catch{}
   for(const secret of [env.OPENAI_API_KEY,env.ELEVENLABS_API_KEY]) if(secret) detail=detail.split(secret).join('[redacted]');
   return json({error:`${eleven?'ElevenLabs':'OpenAI'} 연결 실패 (HTTP ${result.status})${detail?': '+detail.slice(0,350):''}`,upstreamStatus:result.status},result.status===429?429:502);
  }
  const prompt=buildPrompt(settings);
  if(eleven) {const data=await result.json();if(!data.token)throw Error();return json({token:data.token,prompt,overrides:{agent:{language:settings.language},...(settings.voice==='default'?{}:{tts:{voiceId:settings.voice}})},dynamicVariables:{test_prompt:prompt,greeting:greetingText(settings.language)}});}
  let id,sdp;
  if(settings.provider==='live'){const data=await result.json();id=data.session?.id;sdp=data.transport?.sdp;}else{id=result.headers.get('location')?.split('/').pop();sdp=await result.text();}
  if(!id||!sdp?.startsWith('v=0'))throw Error();
  return json({id,sdp,prompt,closeToken:await signClose(settings.provider,id,env.OPENAI_API_KEY)});
 } catch(e) {return json({error:e.name==='TimeoutError'?'연결 시간이 초과되었습니다.':'서비스 연결 중 오류가 발생했습니다.'},502);}
}
