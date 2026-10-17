/** Actual Three.js regression for transformed instances, shadows, animation bounds and ray hits. */
import {chromium,firefox,webkit,expect} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const [run,browserName='chromium']=process.argv.slice(2);if(!run)throw new Error('Expected candidate run directory');
const refreshBounds=process.argv.includes('--refresh-bounds');
const root=path.resolve(run),qa=path.join(root,'qa',`three-diff-${browserName}${refreshBounds?'-diagnostic-bounds':''}`);await mkdir(qa,{recursive:true});
const browser=await ({chromium,firefox,webkit}[browserName as 'chromium']??chromium).launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:1000,height:650}}),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  if(refreshBounds)await page.addInitScript('window.siegeRefreshBounds=true');
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.route('**/rts-siege-diff',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><script type="module" src="/art-factory/rts/tools/siege_skin_webgl_scene.ts"></script>'}));
  await page.route('**/rts-siege-*-*.glb',async route=>{
    const match=route.request().url().match(/rts-siege-(old|new)-([01])\.glb$/)!;
    const source=match[1]==='old'?path.resolve('art-factory/rts/runs/kingdom-siege/2026-10-04-runtime-v1'):root;
    await route.fulfill({contentType:'model/gltf-binary',body:await readFile(path.join(source,'candidate',`siege-lod${match[2]}.glb`))});
  });
  await page.goto('http://127.0.0.1:4321/rts-siege-diff');await page.waitForFunction(()=>!!(window as any).siegeCompare,{},{timeout:60000});
  const cases=[];
  for(const lod of [0,1])for(const [clip,time,edge,team] of [['Idle',.3,false,0],['Walk',.28,false,0],['Attack',.45,false,1],['Hurt',.5,false,0],['Death',.8,false,1],['Attack',.45,true,0],['Death',.8,true,0]] as const){
    const label=`lod${lod}-${clip}-${edge?'edge':team}`,details:any[]=[];const paths=[],normalPaths=[];
    for(const version of ['old','new']){
      details.push(await page.evaluate(args=>(window as any).siegeCompare.render(...args),[version,lod,clip,time,edge,team]));
      const file=path.join(qa,`${label}-${version}.png`);await page.screenshot({path:file});paths.push(file);
      await page.evaluate(args=>(window as any).siegeCompare.render(...args),[version,lod,clip,time,edge,team,'normal']);
      const normalFile=path.join(qa,`${label}-${version}-normal.png`);await page.screenshot({path:normalFile});normalPaths.push(normalFile);
    }
    await page.evaluate(args=>(window as any).siegeCompare.render(...args),['old',lod,clip,time,edge,team,'background']);
    const backgroundPath=path.join(qa,`${label}-background.png`);await page.screenshot({path:backgroundPath});
    const [old,newer]=details;expect(old.lost||newer.lost).toBe(false);
    const boundDelta=Math.max(...old.bounds.map((v:number,i:number)=>Math.abs(v-newer.bounds[i])));
    const hitMismatches=old.hits.filter((v:number|null,i:number)=>(v===null)!==(newer.hits[i]===null)).length;
    const hitDistanceDelta=Math.max(0,...old.hits.map((v:number|null,i:number)=>v!==null&&newer.hits[i]!==null?Math.abs(v-newer.hits[i]):0));
    const [a,b,background,na,nb]=await Promise.all([...paths,backgroundPath,...normalPaths].map(file=>sharp(file).ensureAlpha().raw().toBuffer()));
    let total=0,different=0,max=0,maskedChannels=0,normalTotal=0,normalDifferent=0,normalMax=0,normalChannels=0;
    const foreground=(buffer:Buffer,p:number)=>Math.max(buffer[p],buffer[p+1],buffer[p+2])>15;
    for(let p=0;p<a.length;p+=4){
      // Compare only the union of model + cast shadow pixels, never the empty floor/background.
      if([0,1,2].some(c=>Math.abs(a[p+c]-background[p+c])>2||Math.abs(b[p+c]-background[p+c])>2)){
        for(let c=0;c<3;c++){const d=Math.abs(a[p+c]-b[p+c]);total+=d;max=Math.max(max,d);if(d>5)different++;maskedChannels++;}
      }
      // Normal pass: common foreground, eroded by one pixel to exclude rasterized silhouettes.
      const pixel=p/4,x=pixel%1000,y=Math.floor(pixel/1000);
      if(x>0&&x<999&&y>0&&y<649&&[-1,0,1].every(dy=>[-1,0,1].every(dx=>foreground(na,p+(dy*1000+dx)*4)&&foreground(nb,p+(dy*1000+dx)*4)))){
        for(let c=0;c<3;c++){const d=Math.abs(na[p+c]-nb[p+c]);normalTotal+=d;normalMax=Math.max(normalMax,d);if(d>5)normalDifferent++;normalChannels++;}
      }
    }
    const result={label,boundDelta,hitMismatches,hitDistanceDelta,oldHitCount:old.hitCount,newHitCount:newer.hitCount,oldDrawCalls:old.renderCalls,newDrawCalls:newer.renderCalls,maskedPixels:maskedChannels/3,meanChannelDelta:total/maskedChannels,fractionOver5:different/maskedChannels,maxChannelDelta:max,normalPixels:normalChannels/3,normalMeanChannelDelta:normalTotal/normalChannels,normalFractionOver5:normalDifferent/normalChannels,normalMaxChannelDelta:normalMax,oldMeshes:old.meshes,newMeshes:newer.meshes,skinned:newer.skinned};cases.push(result);console.log(JSON.stringify(result));
    await writeFile(path.join(qa,'report.json'),JSON.stringify({status:'in-progress',browser:browserName,cases,errors},null,2)+'\n');
    expect(boundDelta).toBeLessThan(.0001);expect(hitMismatches).toBe(0);expect(hitDistanceDelta).toBeLessThan(.001);
    expect(old.hitCount).toBeGreaterThan(0);expect(newer.hitCount).toBeGreaterThan(0);expect([...old.hitEntityIds,...newer.hitEntityIds].every(id=>id===7)).toBe(true);
    // At the frustum edge some original rigid primitives are already culled.
    expect(old.renderCalls-newer.renderCalls).toBeGreaterThanOrEqual(edge?1:21);expect(newer.skinned).toBe(6);expect(newer.meshes-newer.skinned).toBe(2);
    expect(result.maskedPixels).toBeGreaterThan(1000);expect(result.normalPixels).toBeGreaterThan(1000);
    expect(result.normalMeanChannelDelta).toBeLessThan(.3);expect(result.normalFractionOver5).toBeLessThan(.005);
    expect(result.meanChannelDelta).toBeLessThan(.3);expect(result.fractionOver5).toBeLessThan(.005);expect(newer.meshes).toBeLessThanOrEqual(8);
  }
  expect(errors).toEqual([]);await writeFile(path.join(qa,'report.json'),JSON.stringify({status:'pass',browser:browserName,cases,errors},null,2)+'\n');
}finally{await browser.close();}
