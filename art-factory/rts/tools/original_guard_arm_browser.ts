/** Actual exported GLB pose comparison in Chromium; local QA, not runtime acceptance. */
import {chromium,expect} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const run='art-factory/rts/runs/original-guard-arm-cage/2026-10-05';
const url=`http://127.0.0.1:4322/${run}/review.html`;
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const glbHash=hash(await readFile(`${run}/candidate/source-fit-arm.glb`));
const browser=await chromium.launch({headless:true,args:['--enable-gpu','--force_high_performance_gpu']});
try{
  const page=await browser.newPage({viewport:{width:1280,height:980}}),errors:string[]=[];
  const responses:Promise<string>[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.url().endsWith('/source-fit-arm.glb'))responses.push(response.body().then(hash));});
  await page.goto(url);await page.waitForFunction(()=>Boolean((window as any).armReview?.ready));
  const neutral:number[][]=await page.evaluate(()=>{const audit=(window as any).armReview;audit.setTime(0);return audit.positions();});
  const source=JSON.parse(await readFile(`${run}/candidate/source-fit-arm.json`,'utf8'));
  const rest:number[][]=source.vertices.map(([x,y,z]:number[])=>[x,z,-y]);
  const distance=(a:number[],b:number[])=>Math.hypot(...a.map((x,i)=>x-b[i]));
  const mapping=neutral.map(p=>{let best=Infinity,index=-1;rest.forEach((q,i)=>{const d=distance(p,q);if(d<best){best=d;index=i;}});expect(best).toBeLessThan(1e-6);return index;});
  const poses=[];await mkdir(`${run}/qa/browser`,{recursive:true});
  for(const [name,time] of [['neutral',0],['bend90',1],['twist45',2],['bend90-twist45',3]] as const){
    await page.locator(`[data-time="${time}"]`).click();
    const positions:number[][]=await page.evaluate(()=>(window as any).armReview.positions());
    const blender=JSON.parse(await readFile(`${run}/qa/poses/SupportedElbow-${name}.json`,'utf8'));
    const expected=blender.positions.map(([x,y,z]:number[])=>[x,z,-y]);
    const deviations=positions.map((p,i)=>distance(p,expected[mapping[i]]));
    const maxDeviation=Math.max(...deviations);
    await writeFile(`${run}/qa/browser/${name}-positions.json`,JSON.stringify({positions,mapping,maxDeviation,largestErrorIndex:deviations.indexOf(maxDeviation)},null,2)+'\n');
    await page.screenshot({path:`${run}/qa/browser/${name}.png`});
    poses.push({name,time,vertices:positions.length,maxBlenderDeviationM:maxDeviation,maxMovementFromNeutralM:Math.max(...positions.map((p,i)=>distance(p,neutral[i])))});
  }
  await page.locator('[data-time="0"]').click();await page.locator('#play').click();
  await page.waitForFunction((rest)=>{
    const a=(window as any).armReview;
    return a.positions().some((p:number[],i:number)=>Math.hypot(...p.map((x,k)=>x-rest[i][k]))>.005);
  },neutral);
  await page.locator('#play').click();await page.locator('#wire').check();
  await page.screenshot({path:`${run}/qa/browser/playing-wire.png`});
  const received=await Promise.all(responses);expect(received).toEqual([glbHash]);expect(errors).toEqual([]);
  const pass=poses.every(p=>p.maxBlenderDeviationM<1e-5);
  const result={status:pass?'browser_pose_parity_pass':'browser_pose_parity_failed',runtime_publish_allowed:false,url,glbSha256:glbHash,responseSha256:received,poses,errors,nonClaim:'Pose parity and controls only. Does not accept source fit, armor articulation or absence of mesh intersections.'};
  await writeFile(`${run}/qa/browser/report.json`,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
  expect(pass,'Exported poses must match the measured Blender artifact').toBe(true);
}finally{await browser.close();}
