/** Real wall-clock runtime audio smoke; no state/clock/audio source injection. */
const fs=require('node:fs/promises');
const path=require('node:path');
const sourceRoot=path.resolve(process.env.RTS_AUDIO_SOURCE_ROOT??'.');
const {chromium}=require(path.join(sourceRoot,'node_modules/@playwright/test'));
const {OrthographicCamera,Vector3}=require(path.join(sourceRoot,'node_modules/three'));
const {installAudioCapture,saveAudioCapture}=require('./rts-audio-capture.ts');
function initialScreen(x,z,height=1){
  const camera=new OrthographicCamera(-38.4,38.4,24,-24,.1,250);
  camera.position.set(38,52,83);camera.lookAt(14,0,48);camera.updateProjectionMatrix();camera.updateMatrixWorld();
  const p=new Vector3(x,height,z).project(camera);return {x:(p.x+1)*800,y:(1-p.y)*500};
}
const seconds=Number(process.env.RTS_SMOKE_SECONDS??15);
const output=path.resolve(process.env.RTS_SMOKE_OUT??'art-factory/rts/runs/audio-capture-pcm/2026-10-09-v2/diagnostic');
(async()=>{
  await fs.mkdir(output,{recursive:true});
  const browser=await chromium.launch({channel:'chromium',headless:true,args:['--enable-gpu','--force_high_performance_gpu']});
  const page=await browser.newPage({viewport:{width:1600,height:1000}});
  const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
  try{
    await page.goto(`${process.env.RTS_BASE_URL??'http://127.0.0.1:4321'}/games/rts`);await page.waitForLoadState('networkidle');
    await installAudioCapture(page,{sourceRoot,spoolFolder:path.join(output,'spool')});
    await page.locator('input[value="river"]').check();await page.locator('#rts-start').click();
    await page.locator('#rts-battle').waitFor({state:'visible'});
    const started=Date.now();let observations=[];
    while(Date.now()-started<seconds*1000){
      // Real UI commands generate order and existing workers/AI naturally generate runtime cues.
      const worker=initialScreen(17,53.5),mine=initialScreen(24.5,48.5);
      await page.mouse.click(worker.x,worker.y);await page.keyboard.press('Control+1');
      await page.mouse.click(mine.x,mine.y,{button:'right'});
      await page.waitForTimeout(900);
      observations.push({elapsed:(Date.now()-started)/1000,time:await page.locator('#rts-time').textContent(),visibility:await page.evaluate(()=>document.visibilityState)});
    }
    await page.screenshot({path:path.join(output,'smoke.png')});
    await fs.writeFile(path.join(output,'observations.json'),JSON.stringify({seconds,browserVersion:browser.version(),pageErrors,observations},null,2));
    await saveAudioCapture(page,output,{purpose:'bounded real-audio smoke',map:'river',seconds,gameplayStateInjection:false});
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
