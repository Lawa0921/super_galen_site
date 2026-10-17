/** Real HTTP download audit of the production build on an explicitly gzip-enabled local host.
 * This does not claim that an untested deployment/CDN enables the same compression.
 */
import {createServer} from 'node:http';
import {mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {chromium,expect} from '@playwright/test';
import {initialScreen} from '../e2e/rts-candidate-fixture';

const root=path.resolve('.vercel/output/static');
const candidateFolder=process.env.RTS_MODEL_CANDIDATES?path.resolve(process.env.RTS_MODEL_CANDIDATES):undefined;
const candidateAssetRoot=process.env.RTS_ASSET_CANDIDATES?path.resolve(process.env.RTS_ASSET_CANDIDATES):undefined;
const substitutions:Array<{url:string;sha256:string}>=[];
const folder=process.argv[2]??'tmp/rts',map=process.argv.includes('--pass')?'pass':'river';
await mkdir(folder,{recursive:true});
await stat(path.join(root,'games/rts/index.html'));
const transfers:Array<{url:string;decoded:number;encoded:number;encoding:string;sha256:string}>=[];
const types:Record<string,string>={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.ico':'image/x-icon'};
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url??'/', 'http://localhost'),resolved=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(!resolved.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    const candidatePath=candidateAssetRoot&&url.pathname.match(/^\/assets\/games\/rts\/(models\/[a-z0-9-]+\.glb|materials\/unit-shared\/[a-f0-9]{64}\.(?:png|jpg))$/);
    let selected=resolved,assetOverride=false;
    if(candidatePath){
      const candidate=path.join(candidateAssetRoot!,candidatePath[1]);
      try{await stat(candidate);selected=candidate;assetOverride=true;}
      catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    }
    const meta=await stat(selected),file=meta.isDirectory()?path.join(selected,'index.html'):selected;
    let raw=await readFile(file);
    if(assetOverride)substitutions.push({url:url.pathname,sha256:createHash('sha256').update(raw).digest('hex')});
    if(!assetOverride&&candidateFolder&&/^\/assets\/games\/rts\/models\/[^/]+\.glb$/.test(url.pathname)){
      try{raw=await readFile(path.join(candidateFolder,path.basename(file)));substitutions.push({url:url.pathname,sha256:createHash('sha256').update(raw).digest('hex')});}
      catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    }
    const compress=/gzip/.test(req.headers['accept-encoding']??'')&&!/\.(png|webp|woff2|jpg|mp3)$/.test(file),body=compress?gzipSync(raw,{level:6}):raw;
    res.writeHead(200,{'Content-Type':types[path.extname(file)]??'application/octet-stream','Content-Length':body.length,'Cache-Control':'no-store',...(compress?{'Content-Encoding':'gzip','Vary':'Accept-Encoding'}:{})});
    transfers.push({url:url.pathname,decoded:raw.length,encoded:body.length,encoding:compress?'gzip':'identity',sha256:createHash('sha256').update(raw).digest('hex')});res.end(body);
  }catch{res.writeHead(404).end('Not found');}
});
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
const address=server.address();if(!address||typeof address==='string')throw new Error('Missing local address');
const browser=await chromium.launch({channel:'chromium',headless:true,args:['--mute-audio','--enable-gpu','--force_high_performance_gpu']});
try{
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}/games/rts`);await page.getByRole('radio',{name:map==='river'?/雙河谷地/:/灰脊隘口/}).check();await page.locator('#rts-start').click();await page.locator('#rts-battle').waitFor({state:'visible',timeout:60000});
  await expect(page.locator('#rts-gold')).toHaveText('500');
  // RTS_DOWNLOAD_ONLY=1 measures bytes only and skips the worker portrait / command-panel UI probe (its fixed screen
  // coordinates predate the current camera); the result records the skip.
  const downloadOnly=process.env.RTS_DOWNLOAD_ONLY==='1';let portraitAnimated:boolean|'skipped'='skipped',commandPanelLayout:any='skipped';
  if(downloadOnly){await page.waitForLoadState('networkidle');await page.waitForTimeout(1500);}
  else{
    const worker=initialScreen(17,53.5,1);
    await expect.poll(async()=>{await page.mouse.click(worker.x,worker.y);return page.locator('#rts-portrait-view').getAttribute('data-kind');}).toBe('worker');
    const portrait=page.locator('#rts-portrait-view');const before=await portrait.screenshot({path:`${folder}/production-portrait-idle-a.png`});await page.waitForTimeout(700);
    portraitAnimated=!before.equals(await portrait.screenshot({path:`${folder}/production-portrait-idle-b.png`}));expect(portraitAnimated).toBe(true);
    commandPanelLayout=await page.locator('.rts-command-panel').evaluate(panel=>{
      const element=panel as HTMLElement,r=element.getBoundingClientRect(),bottom=r.top+element.clientTop+element.clientHeight;
      return {buttons:panel.querySelectorAll('button').length,scrollHeight:element.scrollHeight,clientHeight:element.clientHeight,
        clippedButtons:Array.from(panel.querySelectorAll('button')).filter(b=>b.getBoundingClientRect().bottom>bottom+.5).map(b=>b.textContent)};
    });
    // WC3-style build submenu: the worker card no longer shows all 13 commands at once.
    expect(commandPanelLayout.buttons).toBeGreaterThan(0);expect(commandPanelLayout.clippedButtons).toEqual([]);
    expect(commandPanelLayout.scrollHeight).toBeLessThanOrEqual(commandPanelLayout.clientHeight+1);
  }
  // Freeze the natural load before the separate HTTP byte verification below.
  // DevTools can discard large response bodies; verification requests use the
  // same immutable server bytes but are not counted as gameplay downloads.
  const firstLoadTransfers=[...transfers],assets=firstLoadTransfers.filter(t=>t.url.startsWith('/assets/games/rts/'));
  const verifyAssets=assets.filter(item=>item.url.startsWith('/assets/games/rts/models/')||item.url.startsWith('/assets/games/rts/materials/unit-shared/'));
  const verificationHttpHashes=[];
  for(const asset of verifyAssets){
    const response=await page.request.get(`http://127.0.0.1:${address.port}${asset.url}`);
    expect(response.ok(),`HTTP byte verification ${asset.url}`).toBe(true);
    const digest=createHash('sha256').update(await response.body()).digest('hex');
    expect(digest,`HTTP decoded SHA ${asset.url}`).toBe(asset.sha256);
    verificationHttpHashes.push({url:asset.url,sha256:digest});await response.dispose();
  }
  expect(verificationHttpHashes.length).toBe(verifyAssets.length);
  const result={host:'Local production static build; gzip level 6 for compressible HTTP responses',deployedCdnVerified:false,candidateModelOverrides:substitutions,
    firstMap:map,portraitKind:downloadOnly?'skipped (RTS_DOWNLOAD_ONLY)':'worker',portraitAnimated,commandPanelLayout,assets,verificationHttpHashes,
    httpVerificationMethod:'Separate decoded HTTP GETs matched to every naturally loaded model/shared-image SHA; verification traffic excluded from first-load budget',
    assetEncodedBytes:assets.reduce((sum,a)=>sum+a.encoded,0),assetDecodedBytes:assets.reduce((sum,a)=>sum+a.decoded,0),allLocalEncodedBytes:firstLoadTransfers.reduce((sum,a)=>sum+a.encoded,0),errors};
  await page.screenshot({path:`${folder}/production-build-battle.png`});await writeFile(`${folder}/download-budget.json`,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({...result,assets:assets.length}));expect(errors).toEqual([]);expect(result.assetEncodedBytes).toBeLessThanOrEqual(35_000_000);
  expect(verificationHttpHashes.length,'Decoded HTTP model/image evidence').toBeGreaterThan(30);
  if(candidateAssetRoot){
    expect(substitutions.filter(item=>item.url.endsWith('.glb'))).toHaveLength(16);
    const shared=assets.filter(item=>item.url.includes('/materials/unit-shared/'));
    expect(shared).toHaveLength(20);expect(new Set(shared.map(item=>item.url)).size).toBe(20);
  }
  for(const name of ['rock.glb','lush-grass.webp','forest-floor.webp','river-shingle.webp','highland-scree.webp','valley-undergrowth.webp',...(map==='river'?['river-water.webp']:['pine.glb'])])
    expect(assets.some(a=>a.url.endsWith('/'+name)),`first-map landscape asset ${name}`).toBe(true);
  const selected=map==='river'?['river-gatehouse','river-shrine']:['highland-watchtower','quarry-ruins'];
  const landmarks=assets.filter(a=>selected.some(id=>a.url.endsWith(`/${id}.glb`)||a.url.endsWith(`/${id}-lod1.glb`)));
  expect(landmarks).toHaveLength(4);expect(landmarks.every(a=>a.encoding==='gzip')).toBe(true);
  expect(landmarks.reduce((sum,a)=>sum+a.encoded,0)).toBeLessThanOrEqual(2_000_000);
  expect(assets.some(a=>a.url.endsWith('/kingdom-ruins.webp'))).toBe(false);
}finally{await browser.close();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
