/** Validate the packed glTF and compare original/packed browser-decoded pixels. */
import {chromium,firefox,webkit} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
const [source,run]=process.argv.slice(2);assert(source&&run);
const report=JSON.parse(await readFile(run+'/qa/lossless-packing.json','utf8')),textures=new Map(),validation=[];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const validator=createRequire(import.meta.url)(path.resolve('tmp/rts/handoff-20261006/validator/node_modules/gltf-validator'));
const packedFiles=new Map(report.materials.map(m=>[m.url,run+'/'+m.file]));
for(const model of report.models){
 const original=await readFile(source+'/candidate/'+model.url.split('/').at(-1)),size=original.readUInt32LE(12),doc=JSON.parse(original.subarray(20,20+size)),binary=original.subarray(28+size);
 const bytes=await readFile(run+'/'+model.file);assert.equal(sha(bytes),model.sha256);
 const issues=(await validator.validateBytes(new Uint8Array(bytes),{uri:model.url,maxIssues:0,externalResourceFunction:async uri=>new Uint8Array(await readFile(packedFiles.get(new URL(uri,'http://localhost'+model.url).pathname)))})).issues;
 validation.push({url:model.url,sha256:model.sha256,issues});assert.equal(issues.numErrors,0,model.url);
 for(const row of model.images){
  if(textures.has(row.source_sha256))continue;
  const image=doc.images[row.image];let before;
  if(image.bufferView!==undefined){const v=doc.bufferViews[image.bufferView];before=binary.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength);}else before=await readFile('public'+new URL(image.uri,'http://localhost'+model.url).pathname);
  const material=report.materials.find(m=>m.sha256===row.sha256),after=await readFile(run+'/'+material.file);assert.equal(sha(before),row.source_sha256);assert.equal(sha(after),row.sha256);
  textures.set(row.source_sha256,{before,after,url:material.url,expected:row});
 }
}
const results=[];
for(const [name,type,options] of [['chromium',chromium,{channel:'chromium',args:['--mute-audio']}],['firefox',firefox,{firefoxUserPrefs:{'media.volume_scale':'0.0'}}],['webkit',webkit,{}]]){
 const browser=await type.launch({headless:true,...options});
 try{
  const page=await browser.newPage();await page.route('**/__texture/*/*',async route=>{const [kind,hash]=new URL(route.request().url()).pathname.split('/').slice(-2);const row=textures.get(hash);await route.fulfill({body:row[kind],contentType:kind==='after'&&row.url.endsWith('.webp')?'image/webp':'application/octet-stream'});});
  await page.goto('http://127.0.0.1:4338/');
  const rows=await page.evaluate(async hashes=>{
   const decode=async(url,size,background)=>{const im=new Image();im.src=url;await im.decode();const canvas=document.createElement('canvas');canvas.width=size??im.naturalWidth;canvas.height=size??im.naturalHeight;const ctx=canvas.getContext('2d',{willReadFrequently:true,colorSpace:'srgb'});if(background){ctx.fillStyle=background;ctx.fillRect(0,0,canvas.width,canvas.height);}ctx.drawImage(im,0,0,canvas.width,canvas.height);const bytes=ctx.getImageData(0,0,canvas.width,canvas.height).data;let alpha=false;for(let i=3;i<bytes.length;i+=4)if(bytes[i]<255){alpha=true;break;}const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');return {width:canvas.width,height:canvas.height,alpha,sha256:digest};};
   const results=[];for(const hash of hashes){const before=await decode('/__texture/before/'+hash),after=await decode('/__texture/after/'+hash),composites=[];
    if(before.alpha)for(const size of [32,64])for(const background of ['#000000','#ffffff']){const a=await decode('/__texture/before/'+hash,size,background),b=await decode('/__texture/after/'+hash,size,background);composites.push({size,background,before:a,after:b,match:JSON.stringify(a)===JSON.stringify(b)});}
    results.push({sourceSha256:hash,before,after,composites,match:JSON.stringify(before)===JSON.stringify(after)&&composites.every(r=>r.match)});
   }return results;
  },[...textures.keys()]);
  results.push({browser:name,images:rows});assert(rows.every(r=>r.match),name+': browser decoded pixels changed');console.log(JSON.stringify({browser:name,images:rows.length,pixelMatches:rows.filter(r=>r.match).length}));
 }finally{await browser.close();await writeFile(run+'/qa/packed-runtime.json',JSON.stringify({validation,browserPixels:results,artistic_quality_proven:false},null,2)+'\n');}
}
