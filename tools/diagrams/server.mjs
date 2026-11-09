import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {renderGraph} from './build.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const files=new Map([
  ['/', ['web/index.html','text/html']],['/app.mjs',['web/app.mjs','text/javascript']],
  ['/style.css',['web/style.css','text/css']],['/graph.mjs',['graph.mjs','text/javascript']],
  ['/example.json',['examples/talkie-proposed.json','application/json']],
]);
export function createBuilderServer() {
  let busy=false;
  return http.createServer(async(req,res)=>{
    const send=(status,body,type='application/json')=>{res.writeHead(status,{'Content-Type':`${type}; charset=utf-8`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(body);};
    // Exact host and same-origin POST prevent remote sites from driving a local renderer.
    const host=`127.0.0.1:${req.socket.localPort}`;
    if(req.headers.host!==host) return send(403,JSON.stringify({error:'허용되지 않은 호스트입니다.'}));
    try {
      if(req.method==='POST'&&req.url==='/render') {
        if(req.headers.origin!==`http://${host}` || !req.headers['content-type']?.startsWith('application/json')) return send(403,JSON.stringify({error:'빌더 화면에서 요청하세요.'}));
        if(busy) return send(429,JSON.stringify({error:'렌더링 중입니다. 잠시 후 다시 시도하세요.'}));
        busy=true;
        try {
          let size=0;const chunks=[];
          for await(const chunk of req) {size+=chunk.length;if(size>128*1024){send(413,JSON.stringify({error:'입력은 128KB 이하로 제한됩니다.'}));return;}chunks.push(chunk);}
          const result=await renderGraph(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          send(200,JSON.stringify(result));
        } finally {busy=false;}
      } else if(req.method==='GET'&&files.has(req.url)) {
        const [file,type]=files.get(req.url);send(200,await readFile(path.join(root,file)),type);
      } else send(404,JSON.stringify({error:'경로를 찾을 수 없습니다.'}));
    } catch(e) {send(400,JSON.stringify({error:e.message}));}
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  const port=Number(process.env.DIAGRAM_PORT??4323);
  const server=createBuilderServer();
  server.on('error',e=>{console.error(e.message);process.exitCode=1;});
  server.listen(port,'127.0.0.1',()=>console.log(`Archify 빌더: http://127.0.0.1:${server.address().port}`));
}
