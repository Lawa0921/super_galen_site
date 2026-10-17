/** Read-only browser review of the generated original grip source and six views. */
import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const run='art-factory/rts/runs/original-guard-right-grip-shape/2026-10-05';
const url=`http://127.0.0.1:4322/${run}/review.html`,output=`${run}/qa/browser`;
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:1360,height:980}}),errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url);
  const pictures=page.locator('img');await expect(pictures).toHaveCount(7);
  const images=[];
  for(const picture of await pictures.all()){
    await expect(picture).toBeVisible();
    await expect.poll(()=>picture.evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
    const source=await picture.getAttribute('src');
    const response=await page.request.get(new URL(source!,url).toString());expect(response.ok()).toBe(true);
    const sha=(data:Buffer)=>createHash('sha256').update(data).digest('hex');
    const hash=sha(await response.body());expect(hash).toBe(sha(await readFile(`${run}/${source}`)));
    images.push({source,sha256:hash});
  }
  await page.screenshot({path:`${output}/desktop.png`,fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`${output}/mobile.png`,fullPage:true});
  expect(errors).toEqual([]);
  const report={status:'review_page_pass',runtime_publish_allowed:false,url,images,errors,nonClaim:'Presentation and exact image delivery only; model quality remains qa_failed.'};
  await writeFile(`${output}/report.json`,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,images:images.length,errors}));
}finally{await browser.close();}
