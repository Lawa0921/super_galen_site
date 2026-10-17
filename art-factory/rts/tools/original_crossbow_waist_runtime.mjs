import {chromium,expect} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const run=path.resolve(process.argv[2]),out=path.join(run,'qa','runtime');await mkdir(out,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const expected=Object.fromEntries(await Promise.all([0,1].map(async lod=>[lod?'crossbow-lod1.glb':'crossbow.glb',hash(await readFile(path.join(run,'candidate',`original-crossbow-grip-lod${lod}.glb`)))])));
const browser=await chromium.launch({channel:'chromium',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1500,height:1000}}),jobs=[],received={},errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',response=>{const name=new URL(response.url()).pathname.split('/').at(-1);if(expected[name])jobs.push((async()=>{received[name]={url:response.url(),status:response.status(),sha256:hash(await response.body())};})());});
 await page.goto((process.env.RTS_BASE_URL??'http://127.0.0.1:4324')+'/games/rts/');
 await page.locator('#rts-start').click();await expect(page.locator('#rts-battle')).toBeVisible({timeout:60000});
 await page.waitForTimeout(300);await Promise.all(jobs);
 for(const [name,sha]of Object.entries(expected)){expect(received[name]?.status).toBe(200);expect(received[name]?.sha256).toBe(sha)}
 await page.screenshot({path:path.join(out,'game.png')});expect(errors).toEqual([]);
 await writeFile(path.join(out,'report.json'),JSON.stringify({pass:true,received,errors},null,2));
 console.log(JSON.stringify({pass:true,received,errors}));
}finally{await browser.close();}
