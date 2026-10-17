/** Bundles the existing load fixture against current source and serves the built
 * page on a temporary loopback port. Run after `npm run build`:
 * node node_modules/tsx/dist/cli.mjs art-factory/rts/tools/all_models_production_performance.ts --dedicated-gpu --portrait
 * The 80-unit / 20-building workload remains in rts-performance-fixture.ts.
 */
import {createServer} from 'node:http';
import {readFile,stat,writeFile,mkdir,readdir} from 'node:fs/promises';
import path from 'node:path';
import {bundlePerfFixture} from '../../../tests/manual/rts-perf-bundle';
import {createHash} from 'node:crypto';
const source=(await readFile('tests/manual/rts-performance-fixture.ts','utf8')).replace(/\r\n/g,'\n');
const experiment=process.argv.includes('--shadow-proxy-experiment')?"import {installShadowProxyExperiment} from '../../art-factory/rts/tools/shadow_proxy_experiment';\n(window as any).__installShadowProxyExperiment=installShadowProxyExperiment;\n":'';
const code=source.replace(/    const mainPath=.*\n    const \{mountRts\}=.*\n/,
  experiment+"import {mountRts} from '../../src/scripts/games/rts/main';\nimport {addUnit,addBuilding} from '../../src/scripts/games/rts/state';\nimport {createGame} from '../../src/scripts/games/rts/simulation';\nimport {updateVisibility,getTeamView} from '../../src/scripts/games/rts/visibility';\nimport {issueCommand} from '../../src/scripts/games/rts/commands';\nimport {ModelInstance} from '../../src/scripts/games/rts/models';\nimport {Battlefield} from '../../src/scripts/games/rts/scene';\nimport {SimulationClock} from '../../src/scripts/games/rts/clock';\nimport {Hud} from '../../src/scripts/games/rts/hud';\n(window as any).__rtsTimingHooks={ModelInstance,Battlefield,SimulationClock,Hud};\n");
if(code===source)throw new Error('Fixture import replacement failed');
const fixture=await bundlePerfFixture(code,path.resolve('tests/manual'));
const root=path.resolve('.vercel/output/static');await stat(path.join(root,'games/rts/index.html'));
const out=process.env.RTS_PERF_OUT??'art-factory/rts/runs/all-models/2026-10-14-v1/qa/performance-production';
await mkdir(out,{recursive:true});await writeFile(path.join(out,'fixture-bundle.js'),fixture);
const binding=async(file:string)=>({path:file.replaceAll('\\','/'),sha256:createHash('sha256').update(await readFile(file)).digest('hex')});
const productionHarness={mode:'production-bundled-fixture',description:'Current-source production-mode esbuild fixture hosted on the fresh Astro built page; not the Astro game chunk.',
  fixtureBundle:await binding(path.join(out,'fixture-bundle.js')),sourceFixture:await binding('tests/manual/rts-performance-fixture.ts'),
  builtIndex:await binding('.vercel/output/static/games/rts/index.html'),wrapper:await binding('art-factory/rts/tools/all_models_production_performance.ts'),
  runner:await binding('art-factory/rts/tools/all_models_performance.ts'),bundleHelper:await binding('tests/manual/rts-perf-bundle.ts'),
  pageSource:await binding('src/pages/games/rts.astro'),styleSource:await binding('src/styles/_rts.scss'),
  runtimeSources:await Promise.all((await readdir('src/scripts/games/rts')).filter(f=>f.endsWith('.ts')&&!f.endsWith('.test.ts')).sort().map(f=>binding('src/scripts/games/rts/'+f)))};
process.env.RTS_PRODUCTION_HARNESS=JSON.stringify(productionHarness);
await writeFile(path.join(out,'production-harness.json'),JSON.stringify(productionHarness,null,2)+'\n');
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
 console.log('ALL_MODELS_PRODUCTION_FIXTURE',JSON.stringify({sha256:createHash('sha256').update(fixture).digest('hex'),sourceFixtureSha256:createHash('sha256').update(source).digest('hex'),url:process.env.RTS_PERF_URL}));
 await import('./all_models_performance');
}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
