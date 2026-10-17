// Usage (worktree root): node art-factory/rts/tools/unit_train_icon_capture.mjs [runDir] [viewer.ts]
// Defaults reproduce the 2026-10-16-v1 published icons; roster-expansion units pass their own run
// and roster_train_icon_viewer.ts (loads a style-review model that is not in REQUIRED_MODELS).
// Bundles the viewer, serves public/ on a private port, captures raw transparent renders.
import {buildSync} from 'esbuild';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {extname,join,normalize} from 'node:path';
import {chromium} from '@playwright/test';
const RUN=process.argv[2]??'art-factory/rts/runs/unit-train-icons/2026-10-16-v1';
const VIEWER=process.argv[3]??'art-factory/rts/tools/unit_train_icon_viewer.ts';
const shots=JSON.parse(await readFile(RUN+'/framing.json','utf8'));
const bundle=buildSync({entryPoints:[VIEWER],bundle:true,write:false,format:'iife',platform:'browser'}).outputFiles[0].text;
const types={'.json':'application/json','.glb':'model/gltf-binary','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
const server=createServer(async(req,res)=>{const path=new URL(req.url,'http://x').pathname;
  if(path==='/'){res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><body style="margin:0;background:transparent"><script>'+bundle.replace(/<\/script/g,'<\/script')+'</script>');return;}
  const file=normalize(join('public',decodeURIComponent(path)));if(!file.startsWith('public')){res.writeHead(403);res.end();return;}
  try{const data=await readFile(file);res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream'});res.end(data);}catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={generator:'three.js WebGL runtime ModelLibrary in headless Chromium (SwiftShader)',imagegen_used:false,renders:{},errors:[]};
try{const page=await browser.newPage({viewport:{width:1100,height:1100}});page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/`);await page.evaluate(()=>window.__unitIcons.ready);
  for(const [kind,s] of Object.entries(shots)){const url=await page.evaluate(([k,a,b,c])=>window.__unitIcons.render(k,a,b,c),[kind,s.spanScale,s.yOffset,s]);
    const png=Buffer.from(url.split(',')[1],'base64');await writeFile(`${RUN}/raw/renders/${kind}.png`,png);
    report.renders[kind]={...s,sha256:createHash('sha256').update(png).digest('hex'),bytes:png.length};}
}finally{await browser.close();server.close();}
await writeFile(RUN+'/qa/capture-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
if(report.errors.length)process.exit(1);
