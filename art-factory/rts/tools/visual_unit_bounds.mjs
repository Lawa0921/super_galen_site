/** Frozen, silent full-animation bounds sampling for the refined guard/knight. */
import {chromium} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
import {auditBoundsGlb} from './original_guard_bounds_qa.mjs';
const [run,out]=process.argv.slice(2);assert(run&&out,'source run and output JSON are required');
const sha=b=>createHash('sha256').update(b).digest('hex');
const assets=await Promise.all(['guard','guard-lod1','knight','knight-lod1'].map(async id=>{const file=run+'/candidate/'+id+'.glb',bytes=await readFile(file);return {id,file,url:'/assets/games/rts/models/'+id+'.glb',bytes,sha256:sha(bytes)};}));
const require=createRequire(import.meta.url),threeRoot=path.resolve(path.dirname(require.resolve('three')),'..');
const browser=await chromium.launch({channel:'chromium',headless:true,args:['--mute-audio']}),rows=[];
try{
 const page=await browser.newPage();await page.route('**/rts-bounds-deps/**',async route=>{const file=path.resolve(threeRoot,decodeURIComponent(new URL(route.request().url()).pathname.slice('/rts-bounds-deps/'.length)));assert(file.startsWith(threeRoot+path.sep));await route.fulfill({contentType:'text/javascript',body:await readFile(file)});});
 await page.route('**/rts-bounds-audit',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><script type="importmap">'+JSON.stringify({imports:{three:'/rts-bounds-deps/build/three.module.js','three/addons/':'/rts-bounds-deps/examples/jsm/'}})+'</script>'}));
 await page.route('**/assets/games/rts/models/*.glb',async route=>{const asset=assets.find(a=>a.url===new URL(route.request().url()).pathname);if(asset)await route.fulfill({contentType:'model/gltf-binary',body:asset.bytes});else await route.continue();});
 await page.goto('http://127.0.0.1:4321/rts-bounds-audit');
 for(const {bytes,...asset} of assets){
  const result=await page.evaluate(auditBoundsGlb,{url:'http://127.0.0.1:4321'+asset.url,sampleHz:60});
  assert.equal(result.loadedByteLength,bytes.length);assert.equal(sha(await readFile(asset.file)),asset.sha256);
  rows.push({...asset,...result});console.log(JSON.stringify({id:asset.id,status:result.status,nodes:result.sourceNodes.length,sampledVertices:result.sampledVertexCount,errors:result.errors}));
 }
}finally{await browser.close();await mkdir(path.dirname(out),{recursive:true});await writeFile(out,JSON.stringify({assets:rows,runtime_publish_allowed:false,sampling_scope:'Bind pose, all exported keys/endpoints and 60Hz samples; not a continuous-time proof'},null,2)+'\n');}
assert.equal(rows.length,4);assert(rows.every(r=>r.status==='pass'),'Missing or insufficient all-animation bounds');
