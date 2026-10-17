import {createServer,request} from 'node:http';
import {readFile} from 'node:fs/promises';
const html='art-factory/rts/runs/all-models/2026-10-14-v1/review.html';
createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/'||url.pathname==='/index.html'){res.writeHead(200,{'content-type':'text/html;charset=utf-8'});res.end(await readFile(html));return;}
  if(url.searchParams.has('candidate')&&url.pathname.endsWith('.glb')){
    const name=url.pathname.split('/').at(-1);
    try{const data=await readFile('art-factory/rts/runs/all-models/2026-10-14-v1/candidate/'+name);res.writeHead(200,{'content-type':'model/gltf-binary'});res.end(data);return;}catch{}
  }
  const upstream=request({hostname:'127.0.0.1',port:4321,path:req.url,method:'GET'},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});
  upstream.on('error',()=>{res.writeHead(502);res.end();});upstream.end();
}).listen(4338,'127.0.0.1',()=>console.log('All models inspection: http://127.0.0.1:4338/'));
