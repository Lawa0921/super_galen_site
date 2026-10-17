/** Bundles the existing load fixture against current source and serves the built
 * page on a temporary loopback port. Run after `npm run build`:
 * npx tsx tests/manual/rts-production-performance.ts --dedicated-gpu --portrait
 * The 80-unit / 20-building workload remains in rts-performance-fixture.ts.
 */
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {bundlePerfFixture} from './rts-perf-bundle';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const source=(await readFile('tests/manual/rts-performance-fixture.ts','utf8')).replace(/\r\n/g,'\n');
const code=source.replace(/    const mainPath=.*\n    const \{mountRts\}=.*\n/,
  "import {mountRts} from '../../src/scripts/games/rts/main';\nimport {addUnit,addBuilding} from '../../src/scripts/games/rts/state';\nimport {createGame} from '../../src/scripts/games/rts/simulation';\nimport {updateVisibility,getTeamView} from '../../src/scripts/games/rts/visibility';\nimport {issueCommand} from '../../src/scripts/games/rts/commands';\nimport {ModelInstance} from '../../src/scripts/games/rts/models';\nimport {Battlefield} from '../../src/scripts/games/rts/scene';\nimport {SimulationClock} from '../../src/scripts/games/rts/clock';\nimport {Hud} from '../../src/scripts/games/rts/hud';\n(window as any).__rtsTimingHooks={ModelInstance,Battlefield,SimulationClock,Hud};\n");
if(code===source)throw new Error('Fixture import replacement failed');
const fixture=await bundlePerfFixture(code,path.resolve('tests/manual'));
const root=path.resolve('.vercel/output/static');await stat(path.join(root,'games/rts/index.html'));
const types:Record<string,string>={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url??'/','http://localhost');
 if(url.pathname==='/rts-perf-fixture.js'){res.writeHead(200,{'Content-Type':'text/javascript'}).end(fixture);return;}
 const resolved=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!resolved.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 const meta=await stat(resolved),file=meta.isDirectory()?path.join(resolved,'index.html'):resolved;
 res.writeHead(200,{'Content-Type':types[path.extname(file)]??'application/octet-stream'}).end(await readFile(file));
}catch{res.writeHead(404).end();}});
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('No server');
process.env.RTS_PERF_URL=`http://127.0.0.1:${address.port}`;process.env.RTS_PERF_FIXTURE='/rts-perf-fixture.js';
try{
 if(process.env.RTS_PERF_COMPARE_SERIES==='1'){
   const baseOutput=process.env.RTS_PERF_OUT??'tmp/rts/packaging-performance-aba';
   console.log('COMPARISON_FIXTURE',JSON.stringify({sha256:createHash('sha256').update(fixture).digest('hex'),url:process.env.RTS_PERF_URL}));
   for(const [label,mode] of [['a-source','source'],['b-published','published'],['c-source','source']]){
     await new Promise<void>((resolve,reject)=>{
       const child=spawn(process.execPath,['node_modules/tsx/dist/cli.mjs','tests/manual/rts-performance-release.ts','--dedicated-gpu','--portrait'],{
         cwd:process.cwd(),windowsHide:true,stdio:'inherit',env:{...process.env,RTS_PERF_ART_COMPARISON:mode,RTS_PERF_OUT:path.join(baseOutput,label)},
       });child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('Comparison '+label+' exited '+code)));
     });
   }
 }
 else if(process.env.RTS_PERF_RELEASE==='1')await import('./rts-performance-release');
 else await import('./rts-performance');
}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
