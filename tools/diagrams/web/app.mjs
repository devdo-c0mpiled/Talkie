import {normalizeGraph,graphLayout,statuses} from '/graph.mjs';
const $=s=>document.querySelector(s);
let graph, rendered, timer, live={}, tick=0;
const labels={pending:'대기',running:'실행 중',done:'완료',failed:'실패'};
const kinds=['frontend','backend','database','cloud','security','messagebus','external'];
function notice(text,error=false){$('#notice').textContent=text;$('#notice').className=error?'error':'';}
function stop(){clearInterval(timer);timer=null;$('#play').textContent='모션 재생';}
function invalidate(){rendered=null;$('#download').disabled=$('#candidate').disabled=true;$('#viewer').removeAttribute('srcdoc');}
function changed(){stop();live={};invalidate();$('#json').value=JSON.stringify(graph,null,2);draw();}
function field(label,value,onchange,options){
  const wrap=document.createElement('label');wrap.textContent=label;
  const el=document.createElement(options?'select':'input');
  if(options) for(const [value,title] of options){const o=document.createElement('option');o.value=value;o.textContent=title;el.append(o);}
  el.value=value;el.addEventListener('change',()=>{onchange(el.value);changed();});wrap.append(el);return wrap;
}
function button(label,handler){const b=document.createElement('button');b.textContent=label;b.onclick=handler;return b;}
function edit(){
  $('#title').value=graph.title;$('#nodes').replaceChildren();$('#edges').replaceChildren();
  graph.nodes.forEach((n,i)=>{
    const row=document.createElement('div');row.className='node';
    row.append(field('ID',n.id,v=>{const old=n.id;n.id=v;for(const e of graph.edges){if(e.source===old)e.source=v;if(e.target===old)e.target=v;}edit();}),field('이름',n.label,v=>n.label=v),field('종류',n.kind,v=>n.kind=v,[...new Set([...kinds,n.kind])].map(k=>[k,k])),field('상태',n.status,v=>n.status=v,statuses.map(k=>[k,labels[k]])),button('노드 삭제',()=>{graph.nodes.splice(i,1);graph.edges=graph.edges.filter(e=>e.source!==n.id&&e.target!==n.id);changed();edit();}));$('#nodes').append(row);
  });
  graph.edges.forEach((e,i)=>{
    const row=document.createElement('div');row.className='edge';const options=graph.nodes.map(n=>[n.id,n.label]);
    row.append(field('출발',e.source,v=>e.source=v,options),field('도착',e.target,v=>e.target=v,options),field('연결 이름',e.label??'',v=>e.label=v),button('연결 삭제',()=>{graph.edges.splice(i,1);changed();edit();}));$('#edges').append(row);
  });
  $('#json').value=JSON.stringify(graph,null,2);
}
function svg(tag,attrs={},text){const el=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,v);if(text!==undefined)el.textContent=text;return el;}
function draw(){
  try{
    const valid=normalizeGraph(graph),nodes=graphLayout(valid),map=new Map(nodes.map(n=>[n.id,n]));
    const width=Math.max(...nodes.map(n=>n.x+n.width))+50,height=Math.max(...nodes.map(n=>n.y+n.height))+50;
    const s=svg('svg',{width,height,viewBox:`0 0 ${width} ${height}`,role:'group','aria-label':graph.title});
    const status=n=>live[n.id]??n.status;
    for(const e of valid.edges){const a=map.get(e.source),b=map.get(e.target),x=a.x+a.width,y=a.y+45,xx=b.x,yy=b.y+45,m=(x+xx)/2;
      const d=xx>x?`M${x},${y} C${m},${y} ${m},${yy} ${xx},${yy}`:`M${x},${y} C${x+50},${height} ${xx-50},${height} ${xx},${yy}`;
      s.append(svg('path',{d,class:`edge-line ${status(b)}`}));if(e.label)s.append(svg('text',{x:m,y:xx>x?(y+yy)/2-8:height-12,'text-anchor':'middle',class:'small'},e.label));
    }
    const q=$('#search').value.toLowerCase();
    for(const n of nodes){const g=svg('g',{class:`node-group ${status(n)}`,tabindex:0,role:'button','aria-label':`${n.label} · ${labels[status(n)]}`,opacity:!q||`${n.id} ${n.label} ${n.kind}`.toLowerCase().includes(q)?1:.2});
      g.append(svg('rect',{x:n.x,y:n.y,width:n.width,height:n.height,rx:10,class:'node-box'}),svg('text',{x:n.x+14,y:n.y+25,class:'small'},`${n.kind} · ${labels[status(n)]}`),svg('text',{x:n.x+14,y:n.y+53},n.label.length>22?n.label.slice(0,22)+'…':n.label),svg('title',{},n.label));
      const select=()=>{$('#selection').textContent=`${n.id} · ${n.label} · ${labels[status(n)]}`;};g.onclick=select;g.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();select();}};s.append(g);
    }
    $('#canvas').replaceChildren(s);notice('');
  }catch(e){$('#canvas').replaceChildren();notice(e.message,true);}
}
function load(value){const next=normalizeGraph(value);stop();live={};graph=next;invalidate();edit();draw();}
function save(name,content,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('#title').onchange=e=>{graph.title=e.target.value;changed();};
$('#search').oninput=draw;
$('#example').onclick=async()=>{try{load(await(await fetch('/example.json')).json());}catch(e){notice(e.message,true);}};
$('#import').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>128*1024)throw new Error('입력은 128KB 이하로 제한됩니다.');load(JSON.parse(await file.text()));}catch(e){notice(e.message,true);}finally{e.target.value='';}};
$('#apply').onclick=()=>{try{load(JSON.parse($('#json').value));}catch(e){notice(e.message,true);}};
$('#add-node').onclick=()=>{let i=1;while(graph.nodes.some(n=>n.id===`node-${i}`))i++;graph.nodes.push({id:`node-${i}`,label:`노드 ${i}`,kind:'backend',status:'pending'});changed();edit();};
$('#add-edge').onclick=()=>{if(graph.nodes.length<2){notice('노드가 2개 이상 필요합니다.',true);return;}graph.edges.push({source:graph.nodes[0].id,target:graph.nodes[1].id});changed();edit();};
$('#play').onclick=()=>{if(timer){stop();return;}try{normalizeGraph(graph);}catch(e){notice(e.message,true);return;}tick=0;const step=()=>{live=Object.fromEntries(graph.nodes.map((n,i)=>[n.id,i<tick?'done':i===tick?'running':'pending']));draw();notice('모션 시뮬레이션 · 실제 실행 상태가 아닙니다.');tick=(tick+1)%(graph.nodes.length+1);};step();timer=setInterval(step,1000);$('#play').textContent='모션 정지';};
$('#reset').onclick=()=>{stop();live={};draw();};
$('#save').onclick=()=>{try{save('graph.json',JSON.stringify(normalizeGraph(graph),null,2),'application/json');}catch(e){notice(e.message,true);}};
$('#render').onclick=async()=>{
  stop();invalidate();const snapshot=JSON.stringify(graph);$('#render').disabled=true;notice('렌더링 중');
  try{const r=await fetch('/render',{method:'POST',headers:{'Content-Type':'application/json'},body:snapshot});const result=await r.json();if(!r.ok)throw new Error(result.error);if(JSON.stringify(graph)!==snapshot){notice('편집 내용이 바뀌었습니다. 다시 렌더링하세요.');return;}rendered=result;$('#viewer').srcdoc=result.html;$('#download').disabled=$('#candidate').disabled=false;notice('렌더링 완료');}catch(e){notice(e.message,true);}finally{$('#render').disabled=false;}
};
$('#download').onclick=()=>{if(rendered)save('diagram.html',rendered.html,'text/html');};
$('#candidate').onclick=()=>{if(rendered)save('diagram.archify.json',JSON.stringify(rendered.candidate,null,2),'application/json');};
window.addEventListener('pagehide',stop);
await $('#example').onclick();
