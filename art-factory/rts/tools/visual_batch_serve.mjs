/** Local, candidate-only whole-game/model preview. No runtime publication. */
import {createServer,request} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const run=process.env.RTS_ASSEMBLY_RUN;if(!run)throw new Error('Set the exact reviewed candidate run');
const pack=JSON.parse(await readFile(run+'/qa/lossless-packing.json','utf8'));
const files=new Map([...pack.models,...pack.materials].map(row=>[row.url,resolve(run,row.file)]));
const html='art-factory/rts/runs/all-models/2026-10-14-v1/review.html';
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1'),file=files.get(url.pathname);
  if(file){res.writeHead(200,{'content-type':url.pathname.endsWith('.glb')?'model/gltf-binary':url.pathname.endsWith('.webp')?'image/webp':url.pathname.endsWith('.png')?'image/png':'image/jpeg','cache-control':'no-store'});res.end(await readFile(file));return;}
  if(url.pathname==='/'||url.pathname==='/index.html'){res.writeHead(200,{'content-type':'text/html;charset=utf-8'});res.end(await readFile(html));return;}
  const upstream=request({hostname:'127.0.0.1',port:4321,path:req.url,method:'GET'},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});upstream.on('error',()=>{res.writeHead(502);res.end();});upstream.end();
 }catch(error){res.writeHead(500);res.end(String(error));}
});
const port=Number(process.env.RTS_REVIEW_PORT??4339);server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({preview:`http://127.0.0.1:${port}/games/rts`,modelReview:`http://127.0.0.1:${port}/`,run,runtimePublished:false})));
