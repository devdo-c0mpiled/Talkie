import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {normalizeGraph,toArchify,graphLayout} from '../graph.mjs';
import {renderGraph} from '../build.mjs';
import {createBuilderServer} from '../server.mjs';
const sample=JSON.parse(await readFile(new URL('../examples/talkie-proposed.json',import.meta.url)));
test('두 레포의 flow_graph 봉투와 상태를 보존한다',()=>{
 const result=normalizeGraph({type:'flow_graph',title:sample.title,data:{nodes:sample.nodes,edges:sample.edges}});
 assert.deepEqual(result,sample);const candidate=toArchify(result);
 assert.equal(candidate.components[1].tag,'running');assert.equal(candidate.connections.length,sample.edges.length);
});
test('중복 ID, 존재하지 않는 연결, 잘못된 상태를 거절한다',()=>{
 for(const mutate of [g=>g.nodes.push(g.nodes[0]),g=>g.edges[0].target='missing',g=>g.nodes[0].status='unknown',g=>g.edges[0].target=g.edges[0].source]){
  const value=structuredClone(sample);mutate(value);assert.throws(()=>normalizeGraph(value));
 }
});
test('분기, 합류, 순환을 누락하거나 겹치지 않고 배치한다',()=>{
 const graph=normalizeGraph({title:'순환',nodes:['a','b','c','d'].map(id=>({id})),edges:[{source:'a',target:'b'},{source:'a',target:'c'},{source:'b',target:'d'},{source:'c',target:'d'},{source:'d',target:'b'}]});
 const layout=graphLayout(graph);assert.equal(new Set(layout.map(n=>`${n.x},${n.y}`)).size,4);assert.equal(toArchify(graph).connections.length,5);
});
test('실제 렌더러로 독립 HTML 생성 및 텍스트 이스케이프',async()=>{
 const graph=structuredClone(sample);graph.nodes[0].label='<img src=x onerror=alert(1)>';
 const {html}=await renderGraph(graph);assert.match(html,/<!doctype html>/i);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img src=x onerror=alert\(1\)>/);
 assert.match(html,/archify-diagram-title/);
});
test('수집한 Archify 원본 파일의 SHA-256이 일치한다',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../vendor/archify-source.json',import.meta.url)));
 for(const [name,hash] of Object.entries(manifest.files)) assert.equal(createHash('sha256').update(await readFile(new URL(`../vendor/archify/${name}`,import.meta.url))).digest('hex'),hash,name);
});
test('빌더는 로컬 동일 출처에서만 렌더링하며 파일 경로를 노출하지 않는다',async()=>{
 const server=createBuilderServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 try{
  assert.equal((await fetch(base+'/')).status,200);
  assert.equal((await fetch(base+'/package.json')).status,404);
  assert.equal((await fetch(base+'/render',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://example.com'},body:JSON.stringify(sample)})).status,403);
  const result=await fetch(base+'/render',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify(sample)});assert.equal(result.status,200);assert.match((await result.json()).html,/archify-diagram-title/);
  assert.equal((await fetch(base+'/render',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:'{'})).status,400);
 }finally{await new Promise(r=>server.close(r));}
});
