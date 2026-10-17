/** Capture the real HUD canvas before/after an equivalent raster optimization. */
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=process.argv[2];assert(out);await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chromium',headless:true,args:['--mute-audio']}),errors=[];
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/__minimap-parity',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><body></body>'}));await page.goto('http://127.0.0.1:4321/__minimap-parity');
 const captures=await page.evaluate(async()=>{
  const {Hud}=await import('/src/scripts/games/rts/hud.ts');const rows=[];
  for(const id of ['river','pass'])for(const mode of ['mixed','unexplored','visible','explored']){
   const canvas=document.createElement('canvas');canvas.width=canvas.height=192;const ctx=canvas.getContext('2d');
   const explored=new Uint8Array(9216),visible=new Uint8Array(9216),blocked=new Uint8Array(9216);
   for(let i=0;i<9216;i++){explored[i]=mode==='unexplored'?0:mode==='mixed'?+(i%7>1):1;visible[i]=mode==='visible'?1:mode==='mixed'?+(explored[i]&&i%3===0):0;blocked[i]=+(i%5===0);}
   const view={explored,visible,resources:[{kind:'gold',x:0,z:0,remaining:10},{kind:'wood',x:95,z:95,remaining:10},{kind:'wood',x:4,z:4,remaining:0}],knownBuildings:[{x:20.25,z:40.75}],entities:[{alive:true,category:'building',team:0,x:48,z:48},{alive:true,category:'unit',team:1,x:49.25,z:48.75},{alive:true,category:'unit',team:-1,x:12,z:62},{alive:false,category:'unit',team:0,x:18,z:18}]};
   let fills=0,puts=0;const fill=ctx.fillRect.bind(ctx),put=ctx.putImageData.bind(ctx);ctx.fillRect=(...args)=>{fills++;return fill(...args);};ctx.putImageData=(...args)=>{puts++;return put(...args);};
   const hud=Object.assign(Object.create(Hud.prototype),{ctx});hud.drawMinimap(view,{map:{id,blocked},center:mode==='visible'?{x:1,z:95}:{x:48.25,z:47.75}});
   const rgba=ctx.getImageData(0,0,192,192).data,hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',rgba))).map(x=>x.toString(16).padStart(2,'0')).join('');
   rows.push({id,mode,hash,fills,puts,png:canvas.toDataURL('image/png').split(',')[1]});
  }return rows;
 });
 for(const r of captures){await writeFile(`${out}/${r.id}-${r.mode}.png`,Buffer.from(r.png,'base64'));delete r.png;}
 assert.deepEqual(errors,[]);await writeFile(out+'/capture.json',JSON.stringify({rows:captures,errors},null,2)+'\n');console.log(JSON.stringify(captures));
}finally{await browser.close();}
