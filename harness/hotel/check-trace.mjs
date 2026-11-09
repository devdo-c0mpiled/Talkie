import {readFile} from 'node:fs/promises';
import {evaluateTrace} from './evaluate.mjs';
try {
 if(!process.argv[2])throw Error('Usage: node harness/hotel/check-trace.mjs <trace.json>');
 const input=JSON.parse(await readFile(process.argv[2],'utf8'));
 const {state,...report}=evaluateTrace(input.events,input.expectation);
 console.log(JSON.stringify({...report,bookingStatus:state?.status},null,2));
 process.exitCode=report.passed?0:1;
} catch(error){console.error(error.message);process.exitCode=1;}
