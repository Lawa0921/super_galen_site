/** Actual Chromium timing and portrait regression, deliberately staged combat. */
import {chromium,expect} from '@playwright/test';
import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const output='art-factory/rts/runs/attack-cue-runtime/2026-10-05/qa/browser';
await mkdir(output,{recursive:true});
const compiled=await build({entryPoints:['tests/manual/rts-attack-cues-fixture.ts'],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const bundle=compiled.outputFiles![0],registry=JSON.parse(await readFile('public/assets/games/rts/model-registry.json','utf8'));
const urls=[registry.assets.guard.url,registry.assets.guard.lod1];
const assets=await Promise.all(urls.map(async(url:string)=>({url,sha256:hash(await readFile('public'+url))})));
const browser=await chromium.launch({headless:true,args:['--enable-gpu','--force_high_performance_gpu']});
try{
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors:string[]=[];
  const responses:Promise<{url:string;sha256:string}>[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{const url=new URL(response.url()).pathname;if(urls.includes(url))responses.push(response.body().then(bytes=>({url,sha256:hash(bytes)})));});
  await page.goto('http://127.0.0.1:4322/games/rts/');await page.waitForLoadState('networkidle');
  await page.addScriptTag({type:'module',content:bundle.text});
  await page.waitForFunction(()=>Boolean((window as any).attackCueAudit));
  await page.locator('#rts-start').click();await expect(page.locator('#rts-battle')).toBeVisible({timeout:60000});
  await page.waitForFunction(()=>{const a=(window as any).attackCueAudit;return a.field?.models.has(a.attacker.id);});
  const point=await page.evaluate(()=>{const a=(window as any).attackCueAudit;a.field.focus({x:25,z:42});return a.field.screen(a.attacker,.9);});
  await page.mouse.click(point.x,point.y);await expect(page.locator('#rts-selection h2')).toHaveText('王國衛兵');
  const samples:any[]=[];
  for(let i=0;i<28;i++)samples.push(await page.evaluate(()=>(window as any).attackCueAudit.advance()));
  const starts=samples.filter((s,i)=>s.cue&&s.cue.sequence!==samples[i-1]?.cue?.sequence);
  expect(starts.length).toBeGreaterThanOrEqual(2);
  for(const start of starts){expect(start.clips).toHaveLength(2);for(const clip of start.clips)expect(clip.time).toBeCloseTo(0,6);}
  for(const sample of samples)expect(sample.clips[0].time).toBeCloseTo(sample.clips[1].time,6);
  expect(samples[5].clips[0].time).toBeGreaterThan(samples[1].clips[0].time);
  for(const clip of samples[5].clips)expect(clip.weight).toBeGreaterThan(.99);
  for(const index of [0,1])expect(samples[5].clips[index].pose).not.toBe(samples[10].clips[index].pose);
  // The portrait continues its independent Idle even while the world plays Attack.
  const portrait=await page.evaluate(()=>(window as any).attackCueAudit.sample().portrait);
  expect(portrait[0].name.toLowerCase()).toBe('idle');
  const paused=await page.evaluate(()=>(window as any).attackCueAudit.sample());
  await page.waitForTimeout(250);
  const still=await page.evaluate(()=>(window as any).attackCueAudit.sample());
  expect(still.clips).toEqual(paused.clips);expect(still.time).toBe(paused.time);
  await page.screenshot({path:`${output}/combat.png`});
  const recreated=await page.evaluate(()=>(window as any).attackCueAudit.recreateVisual());
  const elapsed=recreated.time-recreated.cue.startedAt;
  for(const clip of recreated.clips)expect(clip.time).toBeCloseTo(elapsed,6);
  const moved=await page.evaluate(()=>(window as any).attackCueAudit.move());
  expect(moved.result.ok).toBe(true);expect(moved.sample.cue).toBeNull();expect(moved.sample.animation).toBe('idle');
  await page.evaluate(()=>(window as any).attackCueAudit.advance());await page.screenshot({path:`${output}/move-cancels-cue.png`});
  const delivered=await Promise.all(responses);
  for(const asset of assets)expect(delivered.some(item=>item.url===asset.url&&item.sha256===asset.sha256)).toBe(true);
  expect(errors).toEqual([]);
  const report={status:'attack_sequence_browser_pass',url:'http://127.0.0.1:4322/games/rts/',bundleSha256:hash(bundle.contents),assets,delivered,starts,samples,recreated,moved,errors,
    scope:'Staged real simulation, published meshes and actual renderer. Verifies clip restart, both LOD phases, late visibility, pause, cancellation and independent portrait. Does not approve model quality or damage/contact alignment.'};
  await writeFile(`${output}/report.json`,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,samples:samples.length,attackStarts:starts.length,errors}));
}finally{await browser.close();}
