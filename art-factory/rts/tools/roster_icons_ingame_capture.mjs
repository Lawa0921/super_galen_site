// In-game command-card captures for the roster icon review (rosterPreview on), at 1024x768 and 1600x1000.
// Usage (worktree root, astro dev already serving this worktree): node art-factory/rts/tools/roster_icons_ingame_capture.mjs [port]
// Mounts the dev page with a fixture createGame({rosterPreview:true}) like the focused hero e2e fixture; only
// buildings are added (preview units/heroes without a runtime model cannot be placed in the 3D world).
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const port=Number(process.argv[2]??4393),OUT='tmp/rts/visual-roster-icons';await mkdir(OUT,{recursive:true});
const SITES={barracks:{x:40,z:126,name:'兵營'},chapel:{x:40,z:162,name:'禮拜堂'},altar:{x:8,z:126,name:'誓約祭壇'},stable:{x:8,z:164,name:'馬廄'}};
const browser=await chromium.launch({args:['--enable-gpu','--force_high_performance_gpu','--mute-audio']});
const report={port,shots:[],errors:[]};
try{
  for(const [width,height] of [[1024,768],[1600,1000]]){
    const page=await browser.newPage({viewport:{width,height}});page.on('pageerror',e=>report.errors.push(`${width}: ${e.message}`));
    await page.goto(`http://127.0.0.1:${port}/games/rts`);
    await page.evaluate(async sites=>{
      const {mountRts}=await import('/src/scripts/games/rts/main.ts'),{addBuilding}=await import('/src/scripts/games/rts/state.ts'),{createGame}=await import('/src/scripts/games/rts/simulation.ts'),{updateVisibility}=await import('/src/scripts/games/rts/visibility.ts');
      const old=document.getElementById('rts'),root=old.cloneNode(true);old.replaceWith(root);
      mountRts(root,(map,seed)=>{
        const s=createGame(map,seed,'normal',{rosterPreview:true});s.aiEnabled=[false,false];s.teams[0].gold=s.teams[0].wood=9000;
        const hall=s.entities.find(e=>e.team===0&&e.kind==='townhall');hall.tier=3;
        for(const [kind,p] of Object.entries(sites))addBuilding(s,0,kind,{x:p.x,z:p.z},true);
        for(const [i,kind] of ['lumbermill','forge'].entries())addBuilding(s,0,kind,{x:24+i*8,z:118},true);
        updateVisibility(s);return s;
      });
    },SITES);
    await page.getByRole('button',{name:'開始戰役'}).click();await page.locator('#rts-battle').waitFor({state:'visible',timeout:120000});
    await page.waitForFunction(()=>!!window.__rtsDebug,null,{timeout:120000});await page.evaluate(()=>window.__rtsDebug.setPaused(true));
    for(const [kind,p] of Object.entries(SITES)){
      await page.evaluate(([x,z])=>window.__rtsDebug.focus(x,z),[p.x,p.z]);await page.waitForTimeout(400);
      const box=await page.locator('#rts-canvas').boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
      await page.locator('#rts-selection h2').filter({hasText:p.name}).waitFor({timeout:10000});
      await page.waitForFunction(()=>[...document.querySelectorAll('#rts-commands img')].every(i=>i.complete&&i.naturalWidth>0));await page.waitForTimeout(300);
      const file=`${OUT}/${kind}-${width}.png`;await page.screenshot({path:file});
      const panel=`${OUT}/${kind}-${width}-panel.png`;await page.locator('.rts-command-panel').screenshot({path:panel});
      const buttons=await page.$$eval('#rts-commands button',bs=>bs.map(b=>({label:b.dataset.label,icon:b.querySelector('img')?.getAttribute('src')??null,width:b.querySelector('img')?.getBoundingClientRect().width??null})));
      report.shots.push({kind,width,height,file,panel,buttons});
    }
    await page.close();
  }
}finally{await browser.close();}
await writeFile(`${OUT}/capture-report.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.shots.map(s=>[s.kind,s.width,s.buttons.map(b=>`${b.label}:${b.icon?b.icon.split('/').pop():'-'}`).join(' ')]))+' errors='+report.errors.length);
if(report.errors.length){console.error(report.errors.join('\n'));process.exit(1);}
