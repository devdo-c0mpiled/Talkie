// Common acoustic estimate for all providers. Times are monotonic milliseconds.
// Does not infer response time from transcript arrival or network packet arrival.
export class TurnLatency {
  constructor(onUpdate, {silenceMs=280, minimumSpeechMs=140, timeoutMs=15000}={}) {
    this.onUpdate=onUpdate;this.silenceMs=silenceMs;this.minimumSpeechMs=minimumSpeechMs;this.timeoutMs=timeoutMs;
    this.sequence=0;this.turn=null;this.lastTick=null;this.previousOutput=false;this.lastPublish=-Infinity;
  }
  publish(now, phase='idle', result) {
    if(!result&&phase===this.phase&&now-this.lastPublish<100)return;
    this.phase=phase;this.lastPublish=now;
    this.onUpdate({phase,waitingMs:phase==='waiting'&&this.turn?Math.max(0,now-this.turn.lastSpeechAt):0,...(result?{result}:{})});
  }
  finish(now,status,outputAt) {
    const turn=this.turn;this.turn=null;
    if(!turn)return;
    this.publish(now,status==='completed'?'answered':status,{id:turn.id,status,speechStartMs:turn.start,speechEndMs:turn.lastSpeechAt,...(outputAt!==undefined?{outputStartMs:outputAt,latencyMs:Math.max(0,outputAt-turn.lastSpeechAt)}:{}),method:'local-audio-estimate'});
  }
  reset(now,status='cancelled') {
    if(this.turn?.valid)this.finish(now,status);
    this.turn=null;this.lastTick=null;this.previousOutput=false;this.publish(now,'idle');
  }
  sample(now,input,output,{muted=false,running=true,visible=true}={}) {
    if(!running||!visible){
      if(this.turn?.valid)this.finish(now,!running?'playback-blocked':'sampling-gap');
      this.turn=null;this.lastTick=null;this.previousOutput=false;
      this.publish(now,!running?'playback-blocked':'sampling-gap');return;
    }
    const gap=this.lastTick===null?0:now-this.lastTick;this.lastTick=now;
    if(!this.turn&&['playback-blocked','sampling-gap'].includes(this.phase))this.publish(now,'idle');
    if(gap>300){if(this.turn?.valid)this.finish(now,'sampling-gap');this.turn=null;}
    const loud=!muted&&input>=.045,playing=output>=.025,outputStarted=playing&&!this.previousOutput;
    if(loud){
      if(!this.turn)this.turn={id:++this.sequence,start:now,lastSpeechAt:now,voicedMs:0,valid:false,overlap:playing||this.previousOutput};
      this.turn.voicedMs+=Math.min(gap,50);this.turn.lastSpeechAt=now;
      this.turn.valid=this.turn.voicedMs>=this.minimumSpeechMs;
      if(playing)this.turn.overlap=true;
      this.publish(now,this.turn.valid?'speaking':'idle');
    } else if(this.turn){
      const silence=now-this.turn.lastSpeechAt;
      if(this.turn.valid&&outputStarted){
        this.finish(now,this.turn.overlap?'overlap':'completed',this.turn.overlap?undefined:now);
      } else if(silence>=this.silenceMs){
        if(!this.turn.valid){this.turn=null;this.publish(now,'idle');}
        else if(this.turn.overlap)this.finish(now,'overlap');
        else if(silence>=this.timeoutMs)this.finish(now,'timeout');
        else this.publish(now,'waiting');
      }
    }
    this.previousOutput=playing;
  }
}

export function latencySummary(samples=[]) {
  const values=samples.filter(x=>Number.isFinite(x)&&x>=0).slice().sort((a,b)=>a-b);
  if(!values.length)return {count:0,latest:null,mean:null,p95:null};
  return {count:values.length,latest:samples.filter(x=>Number.isFinite(x)&&x>=0).at(-1),mean:values.reduce((a,b)=>a+b,0)/values.length,p95:values[Math.ceil(values.length*.95)-1]};
}
