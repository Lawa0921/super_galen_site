import {createServer,request} from 'node:http';
import {readFile} from 'node:fs/promises';
const html='art-factory/rts/runs/commander-shield/2026-10-14-v1/review.html';
createServer(async(req,res)=>{if(req.url==='/'||req.url==='/index.html'){res.writeHead(200,{'content-type':'text/html;charset=utf-8'});res.end(await readFile(html));return;}const upstream=request({hostname:'127.0.0.1',port:4321,path:req.url,method:'GET'},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});upstream.on('error',()=>{res.writeHead(502);res.end();});upstream.end();}).listen(4335,'127.0.0.1',()=>console.log('Shield model review: http://127.0.0.1:4335/'));
