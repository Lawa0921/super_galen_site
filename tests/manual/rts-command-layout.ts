/** Natural opening HUD: locked technology text must fit without scrolling. */
import {chromium,firefox,webkit,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {initialScreen} from '../e2e/rts-candidate-fixture';

const out=process.env.RTS_LAYOUT_OUT??'tmp/rts/natural-command-layout';
await mkdir(out,{recursive:true});const results=[];
for(const [name,engine] of Object.entries({chromium,firefox,webkit}).filter(([name])=>!process.env.RTS_BROWSER||process.env.RTS_BROWSER===name)){
  const browser=await engine.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(`${process.env.RTS_BASE_URL??'http://127.0.0.1:4344'}/games/rts`);
    await page.locator('#rts-start').click();await expect(page.locator('#rts-battle')).toBeVisible({timeout:60000});
    const p=initialScreen(17,53.5,1);await page.mouse.click(p.x,p.y);
    await expect(page.locator('#rts-commands button')).toHaveCount(13);
    for(const [width,height] of [[1600,1000],[1280,800],[1151,700],[1150,700],[1024,600],[900,600]]){
      await page.setViewportSize({width,height});await page.waitForTimeout(200);
      await page.locator('.rts-command-panel').evaluate(e=>{e.scrollTop=0;});
      const layout=await page.evaluate(()=>{
        const panel=document.querySelector('.rts-command-panel')! as HTMLElement,r=panel.getBoundingClientRect();
        const clip={top:r.top+panel.clientTop,bottom:r.top+panel.clientTop+panel.clientHeight,left:r.left+panel.clientLeft,right:r.left+panel.clientLeft+panel.clientWidth};
        const rows=Array.from(panel.querySelectorAll('button, .rts-command-label, button small')).map(e=>{const b=e.getBoundingClientRect();return {label:e.textContent,tag:e.tagName,visible:b.top>=clip.top-.5&&b.bottom<=clip.bottom+.5&&b.left>=clip.left-.5&&b.right<=clip.right+.5};});
        return {rows,scrollHeight:panel.scrollHeight,clientHeight:panel.clientHeight,panelTop:r.top,topbarBottom:document.querySelector('.rts-topbar')!.getBoundingClientRect().bottom};
      });
      results.push({name,width,height,layout});await writeFile(`${out}/report.json`,JSON.stringify({results,errors},null,2));
      await page.screenshot({path:`${out}/${name}-${width}.png`});
      for(const row of layout.rows)expect(row.visible,`${name} ${width} ${row.tag}: ${row.label}`).toBe(true);
      expect(layout.scrollHeight).toBeLessThanOrEqual(layout.clientHeight+1);
      expect(layout.panelTop).toBeGreaterThan(layout.topbarBottom+8);
      await page.locator('button[data-label="民居"]').click();await expect(page.locator('#rts-mode')).toBeVisible();
      const mode=await page.evaluate(()=>{const m=document.querySelector('#rts-mode')!.getBoundingClientRect(),p=document.querySelector('.rts-command-panel')!.getBoundingClientRect();return {gap:p.top-m.bottom,top:m.top,topbar:document.querySelector('.rts-topbar')!.getBoundingClientRect().bottom};});
      expect(mode.gap).toBeGreaterThanOrEqual(8);expect(mode.top).toBeGreaterThan(mode.topbar);
      await page.screenshot({path:`${out}/${name}-${width}-build.png`});await page.keyboard.press('Escape');
    }
    expect(errors).toEqual([]);
  }finally{await browser.close();}
}
await writeFile(`${out}/report.json`,JSON.stringify({status:'passed',fixture:'natural initial resources and locked technology',results},null,2));
console.log(JSON.stringify({status:'passed',views:results.length}));
