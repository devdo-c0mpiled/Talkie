import './talkie-mascot.js';
const rabbit=document.querySelector('talkie-mascot'),notice=document.querySelector('#notice');
let timers=[],stream,context,raf,starting=false,requestId=0;
const clearSequence=()=>{timers.forEach(clearTimeout);timers=[];document.querySelector('#sequence').setAttribute('aria-pressed','false');};
rabbit.addEventListener('state-change',e=>{document.querySelector('#state').textContent=e.detail.label;document.querySelectorAll('[data-state]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.state===e.detail.state)));});
rabbit.addEventListener('asset-error',()=>{notice.textContent='캐릭터 이미지를 불러오지 못했습니다.';});
document.querySelectorAll('[data-state]').forEach(b=>b.onclick=()=>{clearSequence();stopMic();rabbit.state=b.dataset.state;});
document.querySelector('#sequence').onclick=()=>{clearSequence();stopMic();rabbit.removeAttribute('paused');document.querySelector('#pause').textContent='일시정지';document.querySelector('#pause').setAttribute('aria-pressed','false');document.querySelector('#sequence').setAttribute('aria-pressed','true');[['idle',0],['listening',1500],['speaking',4000],['listening',7000],['speaking',9000],['greeting',11500],['idle',13500]].forEach(([state,delay])=>timers.push(setTimeout(()=>{rabbit.state=state;if(delay===13500)clearSequence();},delay)));};
document.querySelector('#pause').onclick=e=>{const paused=rabbit.toggleAttribute('paused');e.target.textContent=paused?'재생':'일시정지';e.target.setAttribute('aria-pressed',String(paused));};
document.querySelector('#speed').oninput=e=>{rabbit.speed=Number(e.target.value);};
function stopMic(){requestId++;starting=false;cancelAnimationFrame(raf);stream?.getTracks().forEach(t=>t.stop());stream=null;context?.close();context=null;rabbit.level=0;document.querySelector('#meter').value=0;document.querySelector('#mic').textContent='마이크 반응 시작';document.querySelector('#mic').setAttribute('aria-pressed','false');notice.textContent='';}
document.querySelector('#mic').onclick=async()=>{
 if(stream||starting){stopMic();rabbit.state='idle';return;}
 clearSequence();starting=true;const id=++requestId;document.querySelector('#mic').textContent='마이크 연결 취소';
 try{
   const acquired=await navigator.mediaDevices.getUserMedia({audio:true});
   if(id!==requestId){acquired.getTracks().forEach(t=>t.stop());return;}
   stream=acquired;starting=false;context=new AudioContext();await context.resume();
   const source=context.createMediaStreamSource(stream),analyser=context.createAnalyser();analyser.fftSize=512;source.connect(analyser);
   const data=new Uint8Array(analyser.fftSize);let lastLoud=0;
   document.querySelector('#mic').textContent='마이크 반응 중지';document.querySelector('#mic').setAttribute('aria-pressed','true');notice.textContent='마이크 음량만 사용합니다. 녹음·전송하지 않습니다.';
   const read=()=>{analyser.getByteTimeDomainData(data);const level=Math.min(1,Math.sqrt(data.reduce((sum,x)=>sum+((x-128)/128)**2,0)/data.length)*6);rabbit.level=level;document.querySelector('#meter').value=level;if(level>.08)lastLoud=performance.now();rabbit.state=performance.now()-lastLoud<350?'listening':'idle';raf=requestAnimationFrame(read);};read();
 }catch(e){if(id!==requestId)return;stopMic();notice.textContent=e.name==='NotAllowedError'?'마이크 권한을 허용해 주세요.':'마이크를 연결하지 못했습니다.';}
};
window.addEventListener('pagehide',()=>{clearSequence();stopMic();});
