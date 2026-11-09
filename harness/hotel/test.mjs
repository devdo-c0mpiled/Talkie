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
