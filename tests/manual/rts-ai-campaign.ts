// Long, real-browser campaign audit. Requires a preview on port 4321.
// No gameplay state injection. --candidate-art opts into the explicitly isolated art fixture.
import {chromium} from '@playwright/test';
import {candidateArtFixture} from '../e2e/rts-candidate-fixture';
import {mkdir} from 'node:fs/promises';

const campaignOut=process.env.RTS_CAMPAIGN_OUT??'tmp/rts';await mkdir(campaignOut,{recursive:true});
const browser=await chromium.launch(process.argv.includes('--dedicated-gpu')?{channel:'chromium',headless:true,args:['--mute-audio','--enable-gpu','--force_high_performance_gpu']}:{headless:true,args:['--mute-audio']});
try{
  for(const map of ['river','pass']){
    const page=await browser.newPage({viewport:{width:1280,height:800}});
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    if(process.argv.includes('--candidate-art'))await candidateArtFixture(page);
    await page.clock.install({time:new Date('2026-10-04T12:00:00Z')});
    await page.goto(`${process.env.RTS_BASE_URL??'http://127.0.0.1:4321'}/games/rts`);
    await page.locator(`input[value="${map}"]`).check();
    await page.locator('#rts-start').click();await page.locator('#rts-battle').waitFor({state:'visible'});
    await page.clock.pauseAt(new Date('2026-10-04T13:00:00Z'));
    const started=Date.now();
    for(let simulated=0;simulated<1100;simulated+=10){
      for(let frames=0;frames<40;frames++)await page.clock.fastForward(250);
      if(simulated%60===0)console.log(JSON.stringify({map,clock:await page.locator('#rts-time').textContent(),wallSeconds:(Date.now()-started)/1000}));
      if(await page.locator('#rts-menu').isVisible())break;
    }
    const title=await page.locator('#rts-menu-title').textContent();
    await page.screenshot({path:`${campaignOut}/natural-ui-ai-win-${map}.png`});
    if(!(await page.locator('#rts-menu').isVisible())||title!=='王旗暫時落下')throw new Error(`No natural AI victory on ${map}: ${title}`);
    if(errors.length)throw new Error(errors.join('\n'));
    console.log(JSON.stringify({map,result:title,clock:await page.locator('#rts-time').textContent(),copy:await page.locator('#rts-menu-copy').textContent(),wallSeconds:(Date.now()-started)/1000,errors}));
    await page.close();
  }
}finally{await browser.close();}
