import {advance, initialState} from './engine.mjs';
import {makeScript, offers} from './scenario.mjs';

// Contract evaluation only. The caller must map observed agent/tool events;
// never fill missing observations from the expected script.
export function evaluateTrace(events, {variant='basic', language='en', result='pending_confirmation', contactRef='mock-verified-contact'}={}) {
 const expected=makeScript({variant,language,result});
 const errors=[];
 let state=initialState({contactRef});
 if(!Array.isArray(events))return {passed:false,errors:[{code:'invalid_trace'}],modelTested:false,telephonyTested:false};
 for(const [index,event] of events.entries()){
  if(event?.event!==expected[index]?.event)errors.push({code:'trajectory',index,expected:expected[index]?.event,actual:event?.event});
  try{state=advance(state,event)}catch(error){errors.push({code:'contract',index,message:error.message});break;}
 }
 if(events.length!==expected.length||!state.completed)errors.push({code:'incomplete'});
 if(state.customerLanguage!==language||state.status!==result)errors.push({code:'outcome'});
 for(const [key,value] of Object.entries(offers[variant]))if(state.quote?.[key]!==value)errors.push({code:'terms',field:key});
 return {passed:errors.length===0,errors,state,modelTested:false,telephonyTested:false};
}
