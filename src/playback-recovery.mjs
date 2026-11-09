// Retry the existing playback context only. Never recreate a call or replay a request.
export class PlaybackRecovery {
  constructor(report,maxAttempts=2){this.report=report;this.maxAttempts=maxAttempts;this.attempts=0;this.pending=false;this.stopped=false;this.lastAttempt=-Infinity;}
  async check(context,now,visible=true){
    if(this.stopped||this.pending||!visible||!context||!['suspended','interrupted'].includes(context.state)||this.attempts>=this.maxAttempts||now-this.lastAttempt<5000)return;
    this.pending=true;this.attempts++;this.lastAttempt=now;this.report('attempt',this.attempts);
    let timeout;
    try{
      await Promise.race([context.resume(),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('resume timeout')),1500);})]);
      if(!this.stopped)this.report(context.state==='running'?'recovered':'blocked',this.attempts);
    }catch{if(!this.stopped)this.report('blocked',this.attempts);}
    finally{clearTimeout(timeout);this.pending=false;}
  }
  stop(){this.stopped=true;}
}
