import test from 'node:test';
import assert from 'node:assert/strict';
import {TurnLatency,latencySummary} from '../src/turn-latency.mjs';
const setup=()=>{const updates=[];return {updates,tracker:new TurnLatency(x=>updates.push(x))};};
function sampleRange(t,start,end,input=0,output=0,options){for(let n=start;n<=end;n+=20)t.sample(n,input,output,options);}
test('measures speech end to first output; greeting and following chunks are not turns',()=>{
 const {tracker:t,updates}=setup();sampleRange(t,0,500,0,.2);sampleRange(t,520,800);sampleRange(t,820,1800,.15);sampleRange(t,1820,2480);t.sample(2500,0,.2);sampleRange(t,2520,3000,0,.2);
 const results=updates.filter(x=>x.result).map(x=>x.result);assert.equal(results.length,1);assert.equal(results[0].latencyMs,700);assert.equal(results[0].speechEndMs,1800);assert.equal(results[0].status,'completed');
});
test('continued speech resets the wait; output before silence debounce still counts',()=>{
 const {tracker:t,updates}=setup();sampleRange(t,0,800,.2);sampleRange(t,820,1200);sampleRange(t,1220,1800,.2);sampleRange(t,1820,1880);t.sample(1900,0,.2);assert.equal(updates.at(-1).result.latencyMs,100);assert.equal(updates.filter(x=>x.result).length,1);
});
test('short click, muted mic, and long sampling gaps do not become valid latency',()=>{
 const {tracker:t,updates}=setup();sampleRange(t,0,60,.2);sampleRange(t,80,800);t.sample(820,0,.2);sampleRange(t,840,1500,.2,0,{muted:true});assert.equal(updates.filter(x=>x.result).length,0);
 sampleRange(t,1520,2000,.2);t.sample(3000,0,.2);assert.equal(updates.find(x=>x.result)?.result.status,'sampling-gap');
});
test('overlap and no response are explicit exclusions, never zero latency',()=>{
 const {tracker:t,updates}=setup();sampleRange(t,0,800,.2,.2);sampleRange(t,820,1200,0,.2);sampleRange(t,1220,1400);sampleRange(t,1420,2000,.2);sampleRange(t,2020,17200);
 const results=updates.filter(x=>x.result).map(x=>x.result);assert.deepEqual(results.map(x=>x.status),['overlap','timeout']);assert.ok(results.every(x=>x.latencyMs===undefined));
});
test('blocked playback and cancellation exclude incomplete measurements',()=>{
 const {tracker:t,updates}=setup();sampleRange(t,0,800,.2);t.sample(820,0,0,{running:false});sampleRange(t,840,1500,.2);t.reset(1510);
 assert.deepEqual(updates.filter(x=>x.result).map(x=>x.result.status),['playback-blocked','cancelled']);
});
test('summary reports absent data as null and does not mutate history',()=>{
 const a=[1000,300,600,NaN];assert.deepEqual(latencySummary(a),{count:3,latest:600,mean:1900/3,p95:1000});assert.equal(a[0],1000);assert.equal(latencySummary().p95,null);
});
test('playback recovery clears the stale blocked status without adding a sample',()=>{
 const {tracker:t,updates}=setup();t.sample(0,0,0,{running:false});t.sample(20,0,0);
 assert.equal(updates.at(-1).phase,'idle');assert.equal(updates.filter(x=>x.result).length,0);
});
