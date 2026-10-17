/** Per-object browser/Blender endpoint parity for the original articulated arm. */
import {chromium,expect} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {canonicalToGltf,mapVertices,comparePose} from './arm_pose_parity.mjs';

const asset='art-factory/rts/runs/original-guard-arm-articulation/2026-10-05';
const review='art-factory/rts/runs/original-guard-arm-articulation-review/2026-10-05';
const output=`${review}/qa/browser`;
const url=`http://127.0.0.1:4322/${review}/review.html`;
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const glbHash=hash(await readFile(`${asset}/candidate/original-guard-arm-articulation.glb`));
const source=JSON.parse(await readFile(`${asset}/candidate/original-guard-arm-articulation.json`,'utf8'));
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--enable-gpu','--force_high_performance_gpu']});
try{
  const page=await browser.newPage({viewport:{width:1360,height:980}}),errors:string[]=[];
  const responses:Promise<string>[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.url().endsWith('/original-guard-arm-articulation.glb'))responses.push(response.body().then(hash));});
  await page.goto(url);await page.waitForFunction(()=>Boolean((window as any).armReview?.ready));
  const neutral:Record<string,number[][]>=await page.evaluate(()=>{const audit=(window as any).armReview;audit.setTime(0);return audit.positions();});
  const identities=await page.evaluate(()=>(window as any).armReview.identities);
  const names=Object.keys(source.components).sort();expect(Object.keys(neutral).sort()).toEqual(names);
  const mapping:Record<string,number[]>={};
  for(const name of names)mapping[name]=mapVertices(neutral[name],canonicalToGltf(source.components[name].vertices));
  const poses=[];
  for(const [name,time] of [['neutral',0],['bend90',1],['twist45',2],['combined',3]] as const){
    await page.locator(`[data-time="${time}"]`).click();
    const actual:Record<string,number[][]>=await page.evaluate(()=>(window as any).armReview.positions());
    const posePath=`${asset}/qa/poses/${name}.json`,bytes=await readFile(posePath),pose=JSON.parse(bytes.toString('utf8'));
    const objects:Record<string,ReturnType<typeof comparePose>>={};
    for(const part of names)objects[part]=comparePose(actual[part],canonicalToGltf(pose.objects[part].positions),mapping[part]);
    await page.screenshot({path:`${output}/${name}.png`});
    poses.push({name,time,blenderPoseSha256:hash(bytes),objects});
  }
  // Actually operate the diagnostic controls, including hiding armor to inspect sleeve.
  for(const name of names.filter(name=>name!=='FlexibleElbowSleeve'))await page.locator(`[data-part="${name}"]`).uncheck();
  await page.locator('#wire').check();await page.screenshot({path:`${output}/sleeve-combined-wire.png`});
  for(const name of names)await page.locator(`[data-part="${name}"]`).check();
  await page.locator('#wire').uncheck();await page.locator('[data-time="0"]').click();await page.locator('#play').click();
  await page.waitForFunction(rest=>{
    const actual=(window as any).armReview.positions();
    return Object.keys(actual).some(name=>actual[name].some((p:number[],i:number)=>Math.hypot(...p.map((x,k)=>x-rest[name][i][k]))>.005));
  },neutral);
  await page.locator('#play').click();
  const received=await Promise.all(responses);expect(received).toEqual([glbHash]);expect(errors).toEqual([]);
  const pass=poses.every(pose=>Object.values(pose.objects).every(record=>record.maxDeviationM<1e-5));
  const report={status:pass?'per_object_browser_pose_parity_pass':'per_object_browser_pose_parity_failed',runtime_publish_allowed:false,url,glbSha256:glbHash,responseSha256:received,objects:names,identities,poses,errors,nonClaim:'Export parity and operable preview only; geometry and original armor quality still require independent acceptance.'};
  await writeFile(`${output}/report.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
  expect(pass,'Each object must match Blender evaluated vertices').toBe(true);
}finally{await browser.close();}
