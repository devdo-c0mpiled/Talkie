import { createFileRoute } from '@tanstack/react-router'
import { createElement, useEffect, useRef, useState } from 'react'
import { VoiceSession } from '../voice'
import { createMascotBridge } from '../mascot-bridge'
import type { Config, Phase, Provider, Run, Settings, LatencyUpdate } from '../types'
import { latencySummary } from '../turn-latency.mjs'
import '../poc.css'
import { VOICES, DEFAULT_VOICES } from '../../server/voices.mjs'

export const Route = createFileRoute('/poc')({ ssr: false, component: Poc, head: () => ({meta:[{title:'Talkie · Voice PoC'}]}) })
const providers: Provider[] = ['live', 'realtime', 'elevenlabs', 'gemini']
const names = {live:'GPT Live',realtime:'GPT Realtime',elevenlabs:'ElevenLabs',gemini:'Gemini Live'}
const languages = {ko:'한국어',en:'English',ja:'日本語',zh:'中文'}
const clock = (seconds:number) => `${Math.floor(seconds/60).toString().padStart(2,'0')}:${Math.floor(seconds%60).toString().padStart(2,'0')}`
const latencyText = (ms:number|null|undefined) => ms==null?'—':`${(ms/1000).toFixed(2)}초`
const latencyLabels:Record<string,string>={idle:'발화 대기',speaking:'발화 감지 중',waiting:'응답 대기',answered:'측정 완료',timeout:'15초 내 응답 없음',overlap:'동시 발화 · 측정 제외','playback-blocked':'오디오 재생 중단 · 측정 제외','sampling-gap':'측정 중단 · 측정 제외',cancelled:'측정 취소'}
function Poc() {
 const [config,setConfig]=useState<Config>();
 const [voices,setVoices]=useState<Record<Provider,{id:string;name:string}[]>>(VOICES);
 const [selectedVoices,setSelectedVoices]=useState<Record<Provider,string>>(DEFAULT_VOICES);
 const [settings,setSettings]=useState<Settings>({provider:'live',scenario:'booking',language:'ko',voice:'marin',instructions:''});
 const [phase,setPhase]=useState<Phase>('idle');
 const [error,setError]=useState('');
 const [latency,setLatency]=useState<LatencyUpdate>({phase:'idle',waitingMs:0});
 const [health,setHealth]=useState('');
 const [current,setCurrent]=useState<Run>();
 const [history,setHistory]=useState<Run[]>([]);
 const [muted,setMuted]=useState(false);
 const [devices,setDevices]=useState<MediaDeviceInfo[]>([]);
 const [heard,setHeard]=useState(false);
 const inputDetected=useRef(false);
 function applyDevices(list:MediaDeviceInfo[]) {
  if(session.current)return;
  const inputs=list.filter(d=>d.kind==='audioinput');
  setDevices(inputs);
  const builtin=inputs.find(d=>d.deviceId!=='default'&&/macbook/i.test(d.label));
  if(builtin)setSettings(previous=>({...previous,inputDeviceId:builtin.deviceId}));
 }
 async function refreshDevices() {
  try {
   let list=await navigator.mediaDevices.enumerateDevices();
   if(!list.some(d=>d.kind==='audioinput'&&d.label)) {
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});stream.getTracks().forEach(t=>t.stop());
    list=await navigator.mediaDevices.enumerateDevices();
   }
   applyDevices(list);
  }catch{setError('마이크 접근을 허용해 주세요.');}
 }
 const [levels,setLevels]=useState([0,0]);
 const [elapsed,setElapsed]=useState(0);
 const session=useRef<VoiceSession|null>(null);
 const run=useRef<Run|undefined>(undefined);
 const started=useRef(0);
 const bridge=useRef<ReturnType<typeof createMascotBridge>|null>(null);
 const busy=useRef(false);
 const transcriptEnd=useRef<HTMLDivElement>(null);
 const publish=()=>setCurrent(run.current?{...run.current,transcript:[...run.current.transcript]}:undefined);
 useEffect(()=>{
  void navigator.mediaDevices?.enumerateDevices().then(applyDevices).catch(()=>{});
  fetch('/api/voices').then(r=>r.json() as Promise<{voices:Record<Provider,{id:string;name:string}[]>;error?:string}>).then(data=>{setVoices(data.voices);if(data.error)setError(data.error)}).catch(()=>setError('목소리 목록을 불러오지 못했습니다.'));
  fetch('/api/config').then(async r=>{const data=await r.json() as Config & {error?:string};if(!r.ok)throw Error(data.error);setConfig(data)}).catch(e=>setError(e.message));
  try {setHistory(JSON.parse(localStorage.getItem('talkie-poc-runs')||'[]'))}catch{}
  const script=document.createElement('script');script.type='module';script.src='/mascot/talkie-mascot.js';document.head.appendChild(script);
  const unload=()=>session.current?.unload();window.addEventListener('pagehide',unload);
  return ()=>{window.removeEventListener('pagehide',unload);session.current?.unload();script.remove()};
 },[]);
 useEffect(()=>{transcriptEnd.current?.scrollIntoView({block:'nearest',behavior:'smooth'})},[current?.transcript]);
 useEffect(()=>{if(phase!=='connected')return;const timer=setInterval(()=>{const seconds=(Date.now()-started.current)/1000;setElapsed(seconds);if(seconds>=600)void stop()},250);return ()=>clearInterval(timer)},[phase]);
 function save(next:Run[]) {setHistory(next);try{localStorage.setItem('talkie-poc-runs',JSON.stringify(next))}catch{setError('기록 저장 공간이 부족합니다. JSON으로 내보내 주세요.')}}
 async function stop() {
  if(!session.current||busy.current)return;
  busy.current=true;setPhase('closing');
  const active=session.current;
  if(run.current)run.current.durationSeconds=started.current?(Date.now()-started.current)/1000:0;
  const finalization=await active.close();
  bridge.current?.ended();session.current=null;
  if(run.current){run.current.finalization=finalization;publish();setHistory(previous=>{const next=[run.current!,...previous].slice(0,30);try{localStorage.setItem('talkie-poc-runs',JSON.stringify(next))}catch{}return next})}
  setPhase('idle');busy.current=false;setMuted(false);
 }
 async function start(provider:Provider) {
  if(session.current||busy.current||!config)return;
  setSettings(previous=>({...previous,provider}));setError('');setElapsed(0);setHeard(false);inputDetected.current=false;started.current=0;setPhase('connecting');
  setLatency({phase:'idle',waitingMs:0});setHealth('');
  const chosen={...settings,provider,voice:selectedVoices[provider]};
  run.current={id:crypto.randomUUID(),startedAt:new Date().toISOString(),settings:chosen,config:config.providers[provider],durationSeconds:0,transcript:[],intervals:[],latencyResults:[],recoveries:[],events:[],scores:{},notes:''};publish();
  bridge.current=createMascotBridge();
  const active=new VoiceSession(chosen,{
   connected:(ms,id)=>{started.current=Date.now();setPhase('connected');bridge.current?.connected();if(run.current){run.current.connectedMs=ms;if(id)run.current.sessionId=id;publish()}},
   transcript:(row,append)=>{if(!run.current)return;const rows=run.current.transcript;const index=rows.findIndex(r=>r.id===row.id);if(index<0)rows.push(row);else rows[index]={...row,text:append?rows[index].text+row.text:row.text};publish()},
   event:type=>{run.current?.events.push({type,at:performance.now()});if(type.startsWith('playback.')||type.startsWith('uplink.')||type==='input_audio_buffer.speech_started'||type==='session.started'||type==='session.created')publish()},
   levels:(input,output)=>{if(input>.025&&!inputDetected.current){inputDetected.current=true;setHeard(true)}setLevels([input,output]);bridge.current?.levels(input,output)},
   usage:value=>{if(run.current)run.current.usage=value},
   metadata:value=>{if(run.current){Object.assign(run.current,value);publish()}},
   error:message=>{setError(message);if(run.current)run.current.error=message},
   ended:()=>void stop(),
   latency:update=>{setLatency(update);if(update.result&&run.current){(run.current.latencyResults??=[]).push(update.result);if(update.result.status==='completed'&&update.result.latencyMs!==undefined)run.current.intervals.push(update.result.latencyMs);publish()}},
   health:message=>{setHealth(message);if(run.current){(run.current.recoveries??=[]).push({at:performance.now(),message});publish()}},
  });session.current=active;
  try{await active.connect()}catch(e){setError(e instanceof Error?e.message:'연결 실패');if(run.current)run.current.error=e instanceof Error?e.message:'연결 실패';await stop()}
 }
 function rate(key:string,value:number) {if(!current)return;const next={...current,scores:{...current.scores,[key]:value}};setCurrent(next);run.current=next;save(history.map(r=>r.id===next.id?next:r))}
 function exportRuns() {const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),runs:history},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='talkie-voice-tests.json';a.click();URL.revokeObjectURL(url)}
 const active=phase!=='idle';
 const stats=latencySummary(current?.intervals||[]);
 return <section className="poc">
  <div className="poc-heading"><h1>Voice PoC</h1><span className="poc-badge">모의 예약 · 10분 제한</span></div>
  <div className="poc-providers">{providers.map((provider,index)=><div className={`poc-provider ${settings.provider===provider?'selected':''}`} key={provider}>
   <div className="poc-card-top"><span className="poc-number">0{index+1}</span><span className={config?.providers[provider].configured?'poc-ready':''}>{config?config.providers[provider].configured?'키 설정됨':'설정 필요':'불러오는 중'}</span></div>
   <h2>{names[provider]}</h2><div className="poc-model">{config?.providers[provider].model||'—'}</div>
   <label className="poc-voice">목소리<select aria-label={`${names[provider]} 목소리`} value={selectedVoices[provider]} disabled={active} onChange={e=>setSelectedVoices(previous=>({...previous,[provider]:e.target.value}))}>{voices[provider].map(voice=><option key={voice.id} value={voice.id}>{voice.name}</option>)}</select></label>
   <button className="poc-start" disabled={active||!config?.providers[provider].configured} onClick={()=>void start(provider)}>{active&&settings.provider===provider?(phase==='connecting'?'연결 중…':phase==='closing'?'종료 중…':'대화 중'):'대화 시작'} <span aria-hidden="true">↗</span></button>
  </div>)}</div>
  <div className="poc-settings"><label>언어<select value={settings.language} disabled={active} onChange={e=>setSettings({...settings,language:e.target.value})}>{Object.entries(languages).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
   <label>시나리오<select value={settings.scenario} disabled={active} onChange={e=>setSettings({...settings,scenario:e.target.value})}>{(config?.scenarios||[{id:'booking',title:'성형외과 예약'}]).map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
  </div>
  <div className="poc-device"><label>마이크<select disabled={active} value={settings.inputDeviceId||''} onChange={e=>setSettings({...settings,inputDeviceId:e.target.value})}><option value="">시스템 기본 마이크</option>{devices.map(d=><option key={d.deviceId} value={d.deviceId}>{d.label||'마이크'}</option>)}</select></label><button disabled={active} onClick={()=>void refreshDevices()}>마이크 목록 확인</button>{phase==='connected'&&<span role="status">{muted?'마이크 꺼짐':heard?'음성 입력 감지됨':elapsed>8?'마이크 입력 없음':'마이크 입력 대기'}</span>}</div>
  {error&&<div className="poc-error" role="alert">{error}</div>}
  <div className="poc-workspace"><div className="poc-call">
   <div className="poc-call-top"><span><i className={phase==='connected'?'connected':''}/>{phase==='idle'?'대기':phase==='connecting'?'연결 중':phase==='closing'?'종료 중':'연결됨'}</span><time>{clock(elapsed)}</time></div>
   <div className="poc-mascot">{createElement('talkie-mascot',{'aria-label':'Talkie 토끼'})}</div>
   <div className="poc-levels">{['마이크','스피커'].map((label,index)=><label key={label}>{label}<meter min="0" max="1" value={levels[index]} aria-label={`${label} 음량`}/></label>)}</div>
   <div className="poc-latency" aria-label="응답 지연 측정">
    <span>발화 끝 → 출력 시작 · 추정</span>
    <div className="poc-latency-values"><div><span>최근 응답</span><strong>{latencyText(stats.latest)}</strong></div><div><span>평균</span><strong>{latencyText(stats.mean)}</strong></div><div><span>P95</span><strong>{latencyText(stats.p95)}</strong></div><div><span>측정</span><strong>{stats.count}회</strong></div></div>
    <output role="status">{active?(latencyLabels[latency.phase]||latency.phase):'통화 대기'}{active&&latency.phase==='waiting'?` · ${latencyText(latency.waitingMs)}`:''}</output>
    {health&&<div role="status">{health}</div>}
    {!!current?.latencyResults?.length&&<details><summary>발화별 측정</summary><ol>{current.latencyResults.slice(-8).map(r=><li key={r.id}>{r.id}회 · {r.status==='completed'?latencyText(r.latencyMs):latencyLabels[r.status]||r.status}</li>)}</ol></details>}
   </div>
   <div className="poc-controls"><button disabled={phase!=='connected'} aria-pressed={muted} onClick={()=>{session.current?.mute(!muted);setMuted(!muted)}}>{muted?'마이크 켜기':'마이크 끄기'}</button><button disabled={phase!=='connected'} onClick={()=>session.current?.play().catch(()=>setError('스피커 재생을 시작하지 못했습니다.'))}>스피커 재생</button><button className="poc-end" disabled={!active||phase==='closing'} onClick={()=>void stop()}>종료</button></div>
  </div><div className="poc-transcript"><div className="poc-transcript-top"><h2>대화 기록</h2><span>{current?.connectedMs?`연결 ${(current.connectedMs/1000).toFixed(1)}초`:'—'}</span></div>
   <div className="poc-messages" aria-live="polite">{!current?.transcript.length?<p className="poc-empty">대화 기록 없음</p>:current.transcript.map(row=><div className={`poc-message ${row.role}`} key={row.id}><span>{row.role==='user'?'나':names[current.settings.provider]}</span><TranscriptText text={row.text} animate={active} /></div>)}<div ref={transcriptEnd}/></div>
  </div></div>
  <details className="poc-details"><summary>대화 설정</summary><label>추가 지시사항<textarea value={settings.instructions} maxLength={6000} disabled={active} onChange={e=>setSettings({...settings,instructions:e.target.value})}/></label><div className="poc-model-info">{providers.map(p=><div key={p}><strong>{names[p]}</strong><span>{config?.providers[p].model}{config?.providers[p].backend?` / ${config.providers[p].backend}`:''}</span></div>)}</div></details>
  {current&&<details className="poc-details"><summary>연결 진단</summary><pre style={{overflowX:'auto',fontSize:11}}>{current.events.slice(-15).map(e=>e.type).join('\n')}</pre>{current.error&&<p>{current.error}</p>}</details>}
  <div className="poc-results"><div className="poc-results-heading"><h2>테스트 결과 <span>{history.length}</span></h2><div><button onClick={exportRuns} disabled={!history.length}>JSON 내보내기</button><button disabled={active||!history.length} onClick={()=>{save([]);setCurrent(undefined);run.current=undefined}}>기록 삭제</button></div></div>
   <div className="poc-latency-table"><table><caption>서비스별 응답 지연 · 저장된 테스트</caption><thead><tr><th>서비스</th><th>측정</th><th>평균</th><th>P95</th><th>응답 없음</th></tr></thead><tbody>{providers.map(provider=>{const runs=history.filter(r=>r.settings.provider===provider&&r.settings.scenario===settings.scenario&&r.settings.language===settings.language);const summary=latencySummary(runs.flatMap(r=>r.intervals||[]));return <tr key={provider}><th>{names[provider]}</th><td>{summary.count}회</td><td>{latencyText(summary.mean)}</td><td>{latencyText(summary.p95)}</td><td>{runs.flatMap(r=>r.latencyResults||[]).filter(r=>r.status==='timeout').length}회</td></tr>})}</tbody></table><span>선택한 시나리오·언어 기준</span></div>
   {current&&phase==='idle'&&<div className="poc-rating">{['자연스러움','외국어 이해','끼어들기','예약 응대'].map(label=><label key={label}>{label}<select value={current.scores[label]||0} onChange={e=>rate(label,Number(e.target.value))}><option value="0">미평가</option>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n}점</option>)}</select></label>)}</div>}
   <div className="poc-history">{history.length?history.map(r=><button disabled={active} key={r.id} className={r.id===current?.id?'selected':''} onClick={()=>{setCurrent(r);run.current=r;setElapsed(r.durationSeconds)}}><strong>{names[r.settings.provider]}</strong><span>{languages[r.settings.language as keyof typeof languages]}</span><span>{clock(r.durationSeconds)}</span><span>{r.error?'오류':r.finalization==='closed'?'종료':'종료 확인 필요'}</span><time>{new Date(r.startedAt).toLocaleTimeString('ko-KR')}</time></button>):<p className="poc-empty">저장된 테스트 없음</p>}</div>
  </div>
 </section>
}

function TranscriptText({text,animate}:{text:string;animate:boolean}) {
 const [shown,setShown]=useState(animate?'':text);
 const value=useRef(shown);
 useEffect(()=>{
  if(!animate||matchMedia('(prefers-reduced-motion: reduce)').matches){value.current=text;setShown(text);return;}
  if(!text.startsWith(value.current)){value.current=text;setShown(text);return;}
  const chunk=Math.max(1,Math.ceil((text.length-value.current.length)/8));
  const timer=setInterval(()=>{value.current=text.slice(0,value.current.length+chunk);setShown(value.current);if(value.current===text)clearInterval(timer)},20);
  return ()=>clearInterval(timer);
 },[text,animate]);
 return <p>{shown||'…'}</p>;
}
