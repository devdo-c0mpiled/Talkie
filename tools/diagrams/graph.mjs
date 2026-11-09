export const statuses = ['pending', 'running', 'done', 'failed'];
const types = ['frontend', 'backend', 'database', 'cloud', 'security', 'messagebus', 'external'];
function text(value, name, max = 160) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${name}: 1~${max}자 문자열이 필요합니다.`);
  return value;
}
export function normalizeGraph(input) {
  const data = input?.type === 'flow_graph' ? input.data : input;
  if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) throw new Error('nodes와 edges 배열이 필요합니다.');
  if (!data.nodes.length || data.nodes.length > 40 || data.edges.length > 100) throw new Error('노드는 1~40개, 연결은 100개 이하로 입력하세요.');
  const ids = new Set();
  const nodes = data.nodes.map(n => {
    const id = text(n.id, '노드 ID', 64);
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(id) || ids.has(id)) throw new Error(`중복되거나 잘못된 노드 ID: ${id}`);
    ids.add(id);
    const status = n.status ?? 'pending';
    if (!statuses.includes(status)) throw new Error(`알 수 없는 상태: ${status}`);
    return {id, label:text(n.label ?? id, '노드 이름', 64), kind: text(n.kind ?? 'backend', '종류', 64), status};
  });
  const edges = data.edges.map(e => {
    if (!ids.has(e.source) || !ids.has(e.target)) throw new Error('연결이 존재하지 않는 노드를 가리킵니다.');
    if (e.source === e.target) throw new Error('자기 자신으로의 연결은 별도 노드로 풀어 작성하세요.');
    return {source:e.source, target:e.target, ...(e.label ? {label:text(e.label, '연결 이름', 64)} : {})};
  });
  return {title:text(input.title ?? '다이어그램', '제목'), nodes, edges};
}

// Kahn layers for DAGs; unresolved cyclic nodes receive separate columns.
export function graphLayout(graph) {
  const levels = new Map(graph.nodes.map(n => [n.id, 0]));
  const incoming = new Map(graph.nodes.map(n => [n.id, 0]));
  for (const e of graph.edges) incoming.set(e.target, incoming.get(e.target) + 1);
  const queue = graph.nodes.filter(n => incoming.get(n.id) === 0).map(n => n.id);
  const visited = new Set();
  for (let i=0; i<queue.length; i++) {
    const id=queue[i]; visited.add(id);
    for (const e of graph.edges.filter(e=>e.source===id)) {
      levels.set(e.target, Math.max(levels.get(e.target),levels.get(id)+1));
      incoming.set(e.target,incoming.get(e.target)-1);
      if (incoming.get(e.target)===0) queue.push(e.target);
    }
  }
  let tail=Math.max(...levels.values());
  for(const n of graph.nodes) if(!visited.has(n.id)) levels.set(n.id,++tail);
  const rows=new Map();
  return graph.nodes.map(n=>{
    const col=levels.get(n.id),row=rows.get(col)??0;rows.set(col,row+1);
    return {...n,x:60+col*340,y:80+row*170,width:240,height:90};
  });
}
export function toArchify(input) {
  const graph=normalizeGraph(input);
  return {
    schema_version:1,diagram_type:'architecture',
    meta:{title:graph.title,output:'diagram.html',locale:'ko',quality_profile:'standard',animation:'trace'},
    components:graphLayout(graph).map(n=>({id:n.id,type:types.includes(n.kind)?n.kind:'backend',label:n.label,sublabel:n.kind,tag:n.status,pos:[n.x,n.y],size:[n.width,n.height]})),
    connections:graph.edges.map((e,i)=>({id:`edge-${i}`,from:e.source,to:e.target,...(e.label?{label:e.label}:{}),variant:graph.nodes.find(n=>n.id===e.target).status==='failed'?'security':'emphasis'})),
  };
}
