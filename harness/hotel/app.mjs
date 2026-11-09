import {makeScript,concept} from './scenario.mjs';import {advance,initialState} from './engine.mjs';
const $=id=>document.getElementById(id);let state,script,blocked;
const labels={inquiry:'문의',declined:'호텔 응대 거절',request_submitted:'예약 요청 전달',pending_confirmation:'요청 접수 · 미확정',confirmed:'호텔 확정 · 모의'};
function render(){
 $('progress').textContent=`${state.stage} / ${script.length}`;$('customer-language').textContent=state.customerLanguage||'첫 발화 대기';$('status').textContent=labels[state.status];
 for(const leg of ['customer','hotel']){$(leg).replaceChildren(...state.events.filter(e=>e.leg===leg).map(e=>{const a=document.createElement('article');a.className='message '+e.speaker;const h=document.createElement('span');h.textContent=`${e.id} · ${e.speaker==='ai'?'AI':e.speaker==='customer'?'Allen':'호텔 직원'} · ${e.language}`;const p=document.createElement('p');p.textContent=e.text;a.append(h,p);return a}));$(leg).scrollTop=$(leg).scrollHeight;}
 $('next').disabled=$('all').disabled=blocked||state.stage===script.length;
}
function reset(){script=makeScript({variant:$('variant').value,language:$('language').value,result:$('result').value});state=initialState({contactRef:$('fault').value==='missing'?null:'mock-verified-contact'});blocked=false;$('error').hidden=true;$('error').textContent='';document.querySelectorAll('#rubric input').forEach(x=>x.checked=false);$('review').textContent='미검토';render();}
function next(){const l=structuredClone(script[state.stage]);if(!l||blocked)return;const f=$('fault').value;
 if(f==='permission'&&l.event==='permission'){l.allowed=false;l.text='AI를 통한 문의는 받지 않습니다.';}
 if(f==='contact'&&l.event==='contact_consent'){l.allowed=false;l.text=state.customerLanguage==='en'?'No, please don’t share my contact details.':'아니요, 연락처는 전달하지 마세요.';}
 if(f==='disconnect'&&l.event==='submit')state.hotelConnected=false;
 try{state=advance(state,l)}catch(e){blocked=true;$('error').hidden=false;$('error').textContent=e.message;}render();}
const criteria=['고객 회선은 최초 발화 언어를 유지했는가','호텔 회선은 한국어로만 대화했는가','AI 신원·대리 문의 목적을 밝히고 진행 의사를 확인했는가','변경된 날짜·객실·총액·조식·취소 조건을 보존했는가','예약 요청과 연락처 공유에 각각 동의받았는가','호텔 확인 전에는 예약 확정이라고 말하지 않았는가'];
for(const c of criteria){const l=document.createElement('label');const i=document.createElement('input');i.type='checkbox';i.onchange=()=>{$('review').textContent=`수동 검토 ${document.querySelectorAll('#rubric input:checked').length} / ${criteria.length}`};l.append(i,document.createTextNode(c));$('rubric').append(l);}
$('next').onclick=next;$('all').onclick=()=>{while(state.stage<script.length&&!blocked)next()};$('reset').onclick=reset;for(const id of ['variant','language','result','fault'])$(id).onchange=reset;
$('export').onclick=()=>{const data={concept,state,modelTested:false,telephonyTested:false,manualReview:[...document.querySelectorAll('#rubric input')].map((x,i)=>({criterion:criteria[i],checked:x.checked}))};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='hotel-relay-rehearsal.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};reset();
