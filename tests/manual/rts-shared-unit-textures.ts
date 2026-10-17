import {chromium,firefox,webkit,expect} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {build} from 'esbuild';

const root=process.cwd(),run=path.resolve('art-factory/rts/runs/unit-shared-textures/2026-10-09-v1');
const output=path.resolve(process.argv[2]??'tmp/rts/shared-unit-textures-browser');await mkdir(output,{recursive:true});
const base=process.env.RTS_BASE_URL??'http://127.0.0.1:4344';
const selected=process.env.RTS_BROWSER??'chromium,firefox,webkit';
const diagnostic=process.env.RTS_PIXEL_DIAGNOSTIC==='1';
const report:any={status:'running',mode:diagnostic?'default-and-controlled-diagnostic':'strict-default-pixel-gate',scope:'Exact pixels for lossless packaging; existing art/rights are not approved',results:[]};
const bundle=(await build({entryPoints:['art-factory/rts/tools/unit_shared_textures_scene.ts'],bundle:true,format:'esm',platform:'browser',target:'es2022',write:false})).outputFiles[0].contents;
report.fixtureBundleSha256=createHash('sha256').update(bundle).digest('hex');
const parity=JSON.parse(await readFile(path.join(run,'qa/byte-parity.json'),'utf8'));
const ids=parity.models.map((row:any)=>row.id).filter((id:string)=>!id.endsWith('-lod1')&&(!process.env.RTS_UNIT||id===process.env.RTS_UNIT));
const frozen=new Map<string,Buffer>();
for(const row of parity.models)for(const variant of ['source','candidate']){
  const file=path.join(run,variant==='source'?'raw/models':'candidate/models',row.id+'.glb');
  const bytes=await readFile(file);expect(createHash('sha256').update(bytes).digest('hex')).toBe(row[variant==='source'?'source_sha256':'candidate_sha256']);
  frozen.set(`/rts-shared/${variant}/models/${row.id}.glb`,bytes);
}
for(const [uri,entry] of Object.entries<any>(parity.images)){
  const bytes=await readFile(path.join(run,'candidate/materials/unit-shared',path.basename(uri)));
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256);
  frozen.set('/rts-shared/candidate/materials/unit-shared/'+path.basename(uri),bytes);
}
try{
  for(const [name,engine] of Object.entries({chromium,firefox,webkit})){
    if(!selected.split(',').includes(name))continue;
    const browser=await engine.launch({headless:true});
    try{
      for(const id of ids){
        const page=await browser.newPage({viewport:{width:1024,height:768}}),errors:string[]=[];
        page.on('pageerror',error=>errors.push(error.message));
        page.on('requestfailed',request=>errors.push(request.url()+': '+request.failure()?.errorText));
        await page.route('**/rts-shared-audit?*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><script type="module" src="/rts-shared-audit.js"></script></body></html>'}));
        await page.route('**/rts-shared-audit.js',route=>route.fulfill({contentType:'text/javascript',body:Buffer.from(bundle)}));
        await page.route('**/rts-shared/**',async route=>{
          const url=new URL(route.request().url()),bytes=frozen.get(url.pathname);
          if(bytes){await route.fulfill({body:bytes,contentType:url.pathname.endsWith('.glb')?'model/gltf-binary':url.pathname.endsWith('.jpg')?'image/jpeg':'image/png'});return;}
          const material=url.pathname.match(/^\/rts-shared\/(source|candidate)\/(materials\/detail-v1\/[A-Za-z0-9._-]+\.(jpg|png)|terrain\/dirt-road\.png)$/);
          if(material){await route.fulfill({body:await readFile(path.join(root,'public/assets/games/rts',material[2])),contentType:url.pathname.endsWith('.jpg')?'image/jpeg':'image/png'});return;}
          errors.push('Unmapped QA resource: '+url.pathname);await route.fulfill({status:404,body:'Unmapped asset'});
        });
        await page.goto(`${base}/rts-shared-audit?unit=${id}`);
        await page.waitForFunction(()=>!!(window as any).sharedTextureAudit?.ready,undefined,{timeout:60000});
        const unit:any={browser:name,id,views:[],sourceInfo:await page.evaluate(()=>(window as any).sharedTextureAudit.sourceInfo)};
        report.results.push(unit);
        for(const [clip,dt,portrait] of [['idle',.15,false],['walk',.45,false],['attack',.37,false],['hurt',.2,false],['death',.75,false],['idle',.15,true],['idle',.45,true]] as const){
          const state=await page.evaluate(([c,t,p,d])=>(window as any).sharedTextureAudit.compare(c,t,p,d),[clip,dt,portrait,diagnostic]);
          const key=`${name}-${id}-${clip}-${dt}-${portrait?'portrait':'world'}`;
          if(clip==='idle'||state.changedChannels){
            for(const side of ['source','candidate'])await writeFile(path.join(output,key+'-'+side+'.png'),Buffer.from(state[side+'Image'].split(',')[1],'base64'));
          }
          delete state.sourceImage;delete state.candidateImage;unit.views.push(state);
          if(state.changedChannels)state.repeatProbe=await page.evaluate(()=>(window as any).sharedTextureAudit.probe());
          await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
          expect(state.errors,`${key} resources`).toEqual([]);expect(state.contextLost).toBe(false);
          expect(state.drawCalls).toBeGreaterThan(0);
          if(diagnostic)expect(state.controlled.changedChannels,`${key} controlled-order pixel parity`).toBe(0);
          else expect(state.changedChannels,`${key} default pixel parity`).toBe(0);
        }
        expect(errors).toEqual([]);unit.errors=errors;await page.close();
        console.log(JSON.stringify({browser:name,id,views:unit.views.length,defaultDifferingViews:unit.views.filter((view:any)=>view.changedChannels).length,status:diagnostic?'controlled-order-pass':'exact-default-pixel-pass'}));
      }
    }finally{await browser.close();}
  }
  report.defaultDifferingViews=report.results.flatMap((unit:any)=>unit.views.filter((view:any)=>view.changedChannels).map((view:any)=>({browser:unit.browser,id:unit.id,clip:view.clip,dt:view.dt,portrait:view.portrait,changedChannels:view.changedChannels})));
  report.status=report.defaultDifferingViews.length?'controlled-order-passed-default-differences-recorded':'exact-default-pixel-passed';
}catch(error){report.status='failed';report.error=String(error);throw error;}
finally{await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');}
