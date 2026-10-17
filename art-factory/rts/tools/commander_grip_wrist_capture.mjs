import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const run='art-factory/rts/runs/commander-grip/2026-10-14-v1';
const browser=await chromium.launch({channel:'chromium',headless:true,args:['--mute-audio','--enable-gpu','--force_high_performance_gpu']});
try{
const rows=[];
for(const lod of [0,1])for(const fraction of [.5,1]){
  const page=await browser.newPage({viewport:{width:1400,height:960}});await page.goto('http://127.0.0.1:4336/');await page.waitForFunction(()=>!!window.gripReview?.focusWrist);
  // Focus and screenshot in the same task to prevent the orbit render loop
  // from moving the comparison while the camera is being centered.
  const framing=await page.evaluate(o=>{const r=window.gripReview.focusWrist(o.lod,o.fraction);document.querySelector('.labels').innerHTML='<span>目前候選：右手與前臂接合</span>';return r;},{lod,fraction});
  const file=`${run}/qa/browser/death-wrist-focus-lod${lod}-${fraction*100}.png`;await page.screenshot({path:file});rows.push({lod,fraction,file,...framing});await page.close();
}
await writeFile(run+'/qa/wrist-focus.json',JSON.stringify(rows,null,2));console.log(JSON.stringify({shots:rows.length}));
}finally{await browser.close();}
