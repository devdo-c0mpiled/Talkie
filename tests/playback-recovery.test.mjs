import test from 'node:test';
import assert from 'node:assert/strict';
import {PlaybackRecovery} from '../src/playback-recovery.mjs';
test('recovers existing audio context without starting another conversation',async()=>{
 const log=[];const r=new PlaybackRecovery((...a)=>log.push(a));const ctx={state:'suspended',async resume(){this.state='running';}};
 await r.check(ctx,0);assert.deepEqual(log,[['attempt',1],['recovered',1]]);await r.check(ctx,6000);assert.equal(log.length,2);
});
test('blocked playback has bounded retries and stops after teardown',async()=>{
 let calls=0;const r=new PlaybackRecovery(()=>{});const ctx={state:'suspended',async resume(){calls++;throw Error('gesture required');}};
 await r.check(ctx,0);await r.check(ctx,1000);await r.check(ctx,6000);await r.check(ctx,12000);assert.equal(calls,2);r.stop();await r.check(ctx,20000);assert.equal(calls,2);
});
