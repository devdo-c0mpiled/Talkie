import {createMotionRenderer} from './motion-renderer.js';
const STATES={idle:0,listening:1,speaking:2,greeting:3};
const LABELS={idle:'대기',listening:'듣는 중',speaking:'말하는 중',greeting:'인사'};
const smooth=t=>t*t*(3-2*t);
export class TalkieMascot extends HTMLElement {
  static observedAttributes=['state','paused'];
  constructor(){
    super();this.attachShadow({mode:'open'});
    this.shadowRoot.innerHTML=`<style>
      :host{display:block;width:100%;aspect-ratio:1;position:relative;touch-action:pan-y}
      canvas{width:100%;height:100%;display:block;outline:none;cursor:pointer}
      canvas:focus-visible{outline:3px solid #69a891;border-radius:40%}
    </style><canvas role="button" tabindex="0" aria-label="토끼에게 인사하기"></canvas>`;
    this.canvas=this.shadowRoot.querySelector('canvas');this.ctx=this.canvas.getContext('2d');this.canvas.width=this.canvas.height=800;
    this.pose=document.createElement('canvas');this.pose.width=this.pose.height=800;this.poseCtx=this.pose.getContext('2d');
    this.previousPose=document.createElement('canvas');this.previousPose.width=this.previousPose.height=800;
    this.level=0;this.speed=1;this.clock=0;this.poseClock=0;this.bodyClock=0;this.smoothedLevel=0;this.transition=1;
    this.reduced=matchMedia('(prefers-reduced-motion: reduce)');
    this.image=new Image();this.image.src=new URL('./sprites.png',import.meta.url).href;
    this.image.onload=async()=>{this.ready=true;try{this.renderer=await createMotionRenderer(this.image);this.dataset.interpolation='optical-flow';}catch{this.dataset.interpolation='crossfade';}};
    this.image.onerror=()=>this.dispatchEvent(new CustomEvent('asset-error',{bubbles:true,composed:true}));
    this.onGlobal=e=>{if(e.detail?.state in STATES){clearTimeout(this.restore);this.state=e.detail.state;}if(Number.isFinite(e.detail?.level))this.level=Math.max(0,Math.min(1,e.detail.level));};
    this.onTap=()=>{const previous=this.state;this.state='greeting';clearTimeout(this.restore);this.restore=setTimeout(()=>{if(this.state==='greeting')this.state=previous;},1400);};
    this.canvas.addEventListener('click',this.onTap);this.canvas.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();this.onTap();}});
    this.tick=t=>{this.draw(t);this.raf=requestAnimationFrame(this.tick);};
  }
  connectedCallback(){window.addEventListener('talkie:voice-state',this.onGlobal);this.lastTime=undefined;cancelAnimationFrame(this.raf);this.raf=requestAnimationFrame(this.tick);}
  disconnectedCallback(){cancelAnimationFrame(this.raf);clearTimeout(this.restore);window.removeEventListener('talkie:voice-state',this.onGlobal);}
  get state(){return this.getAttribute('state') in STATES?this.getAttribute('state'):'idle';}
  set state(v){if(v in STATES&&v!==this.state)this.setAttribute('state',v);}
  attributeChangedCallback(name,old,value){
    if(old===value)return;
    if(name==='state'){
      const c=this.previousPose.getContext('2d');c.clearRect(0,0,800,800);c.drawImage(this.pose,0,0);
      this.transition=this.ready&&!this.hasAttribute('paused')&&!this.reduced.matches?0:1;this.clock=0;this.poseClock=0;
      this.dispatchEvent(new CustomEvent('state-change',{detail:{state:this.state,label:LABELS[this.state]},bubbles:true,composed:true}));
    }
    this.lastTime=undefined;
  }
  sample(state){
    if(state==='idle'){
      const p=this.clock%4.6;
      if(p<4.15)return [0,0];
      if(p<4.25)return [0,smooth((p-4.15)/.1)];
      if(p<4.32)return [1,smooth((p-4.25)/.07)];
      if(p<4.38)return [1,1];
      if(p<4.46)return [1,1-smooth((p-4.38)/.08)];
      return [0,1-smooth((p-4.46)/.14)];
    }
    if(state==='listening'||state==='greeting')return [0,(1-Math.cos(this.poseClock*Math.PI))*.5];
    const phase=this.poseClock%4;return [Math.floor(phase),smooth(phase%1)];
  }
  draw(now){
    const dt=this.lastTime===undefined?0:Math.min(.05,(now-this.lastTime)/1000);this.lastTime=now;
    if(!this.ready)return;
    const paused=this.hasAttribute('paused'),reduced=this.reduced.matches,state=this.state,row=STATES[state];
    if(!paused&&!reduced){
      const step=dt*this.speed;this.clock+=step;this.bodyClock+=step;
      this.smoothedLevel+=(this.level-this.smoothedLevel)*(1-Math.exp(-dt*12));
      this.poseClock+=step*(state==='speaking'?4+this.smoothedLevel*3:state==='greeting'?3.6:1.7);
      this.transition=Math.min(1,this.transition+dt/(state==='listening'?.09:.16));
    }
    if(reduced)this.transition=1;
    const [frame,fraction]=reduced?[0,0]:this.sample(state),pc=this.poseCtx;pc.clearRect(0,0,800,800);
    let interpolated;
    if(this.renderer){try{interpolated=this.renderer.draw(row,frame,fraction);}catch{this.renderer=null;this.dataset.interpolation='crossfade';}}
    if(interpolated)pc.drawImage(interpolated,0,0,800,800);
    else{
      const sw=this.image.naturalWidth/4,sh=this.image.naturalHeight/4;
      pc.save();pc.globalCompositeOperation='lighter';pc.globalAlpha=1-fraction;pc.drawImage(this.image,frame*sw,row*sh,sw,sh,0,0,800,800);
      pc.globalAlpha=fraction;pc.drawImage(this.image,((frame+1)%4)*sw,row*sh,sw,sh,0,0,800,800);pc.restore();
    }
    if(this.transition<1){
      const mix=smooth(this.transition);pc.save();pc.globalCompositeOperation='destination-in';pc.fillStyle=`rgba(0,0,0,${mix})`;pc.fillRect(0,0,800,800);
      pc.globalCompositeOperation='lighter';pc.globalAlpha=1-mix;pc.drawImage(this.previousPose,0,0);pc.restore();
    }
    const t=this.bodyClock,bob=reduced?0:Math.sin(t*2.4)*2.4,squash=reduced?0:Math.sin(t*2.4)*.004,ctx=this.ctx;ctx.clearRect(0,0,800,800);
    ctx.save();ctx.globalAlpha=.13;ctx.fillStyle='#684a2c';ctx.beginPath();ctx.ellipse(400,720,125-bob,15,0,0,Math.PI*2);ctx.fill();ctx.restore();
    ctx.save();ctx.translate(400,400+bob);ctx.scale(1-squash,1+squash);ctx.drawImage(this.pose,-390,-390,780,780);ctx.restore();
    this.dataset.frame=String(frame);this.dataset.row=String(row);this.dataset.fraction=fraction.toFixed(4);
  }
}
if(!customElements.get('talkie-mascot'))customElements.define('talkie-mascot',TalkieMascot);
