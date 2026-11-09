import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {toArchify} from './graph.mjs';
const run=promisify(execFile);
const root=path.dirname(fileURLToPath(import.meta.url));
export async function renderGraph(input) {
  const candidate=toArchify(input);
  const dir=await mkdtemp(path.join(tmpdir(),'talkie-diagram-'));
  try {
    await writeFile(path.join(dir,'input.json'),JSON.stringify(candidate));
    await run(process.execPath,[path.join(root,'vendor/archify/renderers/architecture/render-architecture.mjs'),path.join(dir,'input.json'),path.join(dir,'diagram.html')],{cwd:dir,timeout:30000,maxBuffer:1024*1024});
    return {candidate,html:await readFile(path.join(dir,'diagram.html'),'utf8')};
  } catch(e) {throw new Error(e.stderr || e.message);}
  finally {await rm(dir,{recursive:true,force:true});}
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [, ,input, output='output/diagrams/diagram.html']=process.argv;
    if(!input) throw new Error('사용법: npm run diagram:build -- 입력.json [출력.html]');
    const result=await renderGraph(JSON.parse(await readFile(input,'utf8')));
    await mkdir(path.dirname(path.resolve(output)),{recursive:true});
    await writeFile(output,result.html);
    await writeFile(`${output}.json`,JSON.stringify(result.candidate,null,2)+'\n');
    console.log(path.resolve(output));
  } catch(e) {console.error(e.message);process.exitCode=1;}
}
