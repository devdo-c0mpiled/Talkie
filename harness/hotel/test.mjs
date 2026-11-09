import test from 'node:test';import assert from 'node:assert/strict';
import {makeScript,offers} from './scenario.mjs';import {advance,initialState} from './engine.mjs';
for(const variant of ['basic','change'])for(const language of ['en','ko'])for(const result of ['pending_confirmation','confirmed'])test(`${variant} / ${language} / ${result}`,()=>{
 const s=makeScript({variant,language,result}).reduce(advance,initialState());
 assert.equal(s.customerLanguage,language);assert.equal(s.status,result);assert.deepEqual(s.quote,offers[variant]);
 assert.ok(s.events.filter(e=>e.leg==='hotel').every(e=>e.language==='ko'));assert.ok(s.events.every(e=>e.delivery==='simulated'));
});
function expectBlocked(event,patch,options={}){let s=initialState(options);let reached=false;for(const base of makeScript({variant:options.variant||'basic'})){const line=base.event===event?{...base,...patch}:base;try{s=advance(s,line)}catch(e){reached=true;break}}assert.ok(reached,'Expected rejection');return s;}
test('hotel refusal stops enquiry',()=>assert.equal(expectBlocked('permission',{allowed:false}).submitted,false));
test('booking refusal stops submit',()=>assert.equal(expectBlocked('booking_consent',{allowed:false}).submitted,false));
test('contact refusal stops submit',()=>assert.equal(expectBlocked('contact_consent',{allowed:false}).submitted,false));
test('missing contact stops submit',()=>assert.equal(expectBlocked('intent',{}, {contactRef:null}).submitted,false));
test('customer language cannot silently change',()=>expectBlocked('readback',{language:'ja'}));
test('hotel always speaks Korean',()=>expectBlocked('quote',{language:'en'}));
test('AI cannot impersonate hotel confirmation',()=>expectBlocked('hotel_result',{speaker:'ai'}));
test('pending cannot be summarized as confirmed',()=>expectBlocked('summary',{status:'confirmed'}));
test('confirmation needs hotel evidence',()=>expectBlocked('hotel_result',{status:'confirmed',confirmationRef:null}));
test('price changes cannot be silently read back',()=>expectBlocked('readback',{terms:{...offers.basic,total:400000}}));
test('old dates cannot survive correction',()=>expectBlocked('quote',{terms:offers.basic},{variant:'change'}));
test('alternative requires customer choice',()=>expectBlocked('choose_alternative',{accepted:false},{variant:'change'}));
test('new quote invalidates earlier consent',()=>{
 let s=initialState();for(const l of makeScript()){s=advance(s,l);if(l.event==='booking_consent')break;}
 s=advance(s,{id:s.stage+1,event:'quote',speaker:'hotel',leg:'hotel',language:'ko',terms:{...offers.basic,total:400000}});
 assert.equal(s.bookingConsent,false);assert.equal(s.readback,null);
});
test('duplicate and disconnected submissions fail',()=>{
 let s=initialState();for(const l of makeScript()){if(l.event==='submit'){assert.throws(()=>advance({...s,hotelConnected:false},l));s=advance(s,l);assert.throws(()=>advance(s,l));assert.throws(()=>advance(s,{...l,id:s.stage+1}));break;}s=advance(s,l);}
});

import {evaluateTrace} from './evaluate.mjs';
test('equivalent JSON key order survives transport',()=>{
 const trace=makeScript().map(l=>l.terms?{...l,terms:Object.fromEntries(Object.entries(l.terms).reverse())}:l);
 assert.equal(evaluateTrace(trace).passed,true);
});
for(const patch of [{nights:3},{adults:0},{rooms:1.5},{lateCancelFee:-1},{currency:'USD'},{freeCancelUntil:'invalid'},{checkIn:'2026-02-30'}])test(`malformed terms rejected: ${JSON.stringify(patch)}`,()=>{
 const script=makeScript();let state=initialState();
 for(const line of script){if(line.event==='quote'){assert.throws(()=>advance(state,{...line,terms:{...line.terms,...patch}}));break;}state=advance(state,line);}
});
test('input events cannot mutate stored quote or transcript',()=>{
 const script=makeScript();let state=initialState();
 for(const line of script){state=advance(state,line);if(line.event==='quote'){line.terms.total=1;assert.equal(state.quote.total,320000);assert.equal(state.events.at(-1).terms.total,320000);break;}}
 assert.equal(offers.basic.total,320000);
});
test('finished session rejects fresh intent',()=>{
 const script=makeScript();const state=script.reduce(advance,initialState());
 assert.throws(()=>advance(state,{...script[0],id:state.stage+1}),/종료/);
});
for(const variant of ['basic','change'])for(const language of ['en','ko'])for(const result of ['pending_confirmation','confirmed'])test(`trace evaluator accepts ${variant}/${language}/${result}`,()=>{
 assert.equal(evaluateTrace(makeScript({variant,language,result}),{variant,language,result}).passed,true);
});
test('evaluator rejects missing consent even with renumbered IDs',()=>{
 const trace=makeScript().filter(l=>l.event!=='booking_consent').map((l,i)=>({...l,id:i+1}));
 const report=evaluateTrace(trace);assert.equal(report.passed,false);assert.ok(report.errors.some(e=>e.code==='contract'));assert.equal(report.state.submitted,false);
});
test('evaluator rejects coherent but wrong price throughout trace',()=>{
 const trace=makeScript().map(l=>l.terms?{...l,terms:{...l.terms,total:999999}}:l);
 const report=evaluateTrace(trace);assert.equal(report.passed,false);assert.ok(report.errors.some(e=>e.code==='terms'&&e.field==='total'));
});
test('evaluator rejects empty, truncated and reordered traces',()=>{
 assert.equal(evaluateTrace([]).passed,false);assert.equal(evaluateTrace(null).passed,false);
 assert.equal(evaluateTrace(makeScript().slice(0,-1)).passed,false);
 const trace=makeScript();[trace[1],trace[2]]=[trace[2],trace[1]];assert.equal(evaluateTrace(trace).passed,false);
});
