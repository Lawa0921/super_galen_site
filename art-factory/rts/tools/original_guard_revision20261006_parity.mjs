/** Actual Three GLTFLoader pose extrema vs Blender, reuse canonical conversion helper. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {chromium} from '@playwright/test';
import {canonicalToGltf} from './arm_pose_parity.mjs';
const run=path.resolve('art-factory/rts/runs/original-guard-assembly/revision-20261006');
const source=JSON.parse(fs.readFileSync(path.join(run,'qa/blender-pose-extrema.json'),'utf8'));
const converted=source.map(row=>({...row,objects:Object.fromEntries(Object.entries(row.objects).map(([name,b])=>{
 const corners=[];for(const x of [b.min[0],b.max[0]])for(const y of [b.min[1],b.max[1]])for(const z of [b.min[2],b.max[2]])corners.push([x,y,z]);
 const ps=canonicalToGltf(corners);return [name,{min:[0,1,2].map(a=>Math.min(...ps.map(p=>p[a]))),max:[0,1,2].map(a=>Math.max(...ps.map(p=>p[a])))}];
}))}));
const req=createRequire(import.meta.url);const threeRoot=path.resolve(path.dirname(req.resolve('three')),'..');
const browser=await chromium.launch({headless:true});let result;
try{
 const page=await browser.newPage();const origin='http://127.0.0.1:4324';
 await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(url.pathname==='/guard-parity')return route.fulfill({contentType:'text/html',body:'<!doctype html><script type="importmap">'+JSON.stringify({imports:{three:'/deps/build/three.module.js','three/addons/':'/deps/examples/jsm/'}})+'</script><script type="module">import * as THREE from "three";import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";globalThis.THREE=THREE;globalThis.GLTFLoader=GLTFLoader;</script>'});if(url.pathname.startsWith('/deps/')){const file=path.resolve(threeRoot,url.pathname.slice(6));if(!file.startsWith(threeRoot+path.sep))return route.abort();return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(file)});}return route.abort();});
 await page.goto(origin+'/guard-parity');await page.waitForFunction(()=>!!globalThis.GLTFLoader);
 result=[];
 for(const lod of [0,1]){
  const bytes=fs.readFileSync(path.join(run,`candidate/original-guard-assembly-lod${lod}.glb`));
  const row=await page.evaluate(async({base64,reference,lod})=>{
   const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));const gltf=await new GLTFLoader().parseAsync(bytes.buffer,'');
   const reports=[];const root=gltf.scene;const mixer=new THREE.AnimationMixer(root);
   for(const ref of reference){
    mixer.stopAllAction();const clip=gltf.animations.find(c=>c.name===ref.clip);const action=mixer.clipAction(clip);action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();mixer.setTime(ref.frame/30);root.updateMatrixWorld(true);
    const actual={},boxes={};root.traverse(o=>{if(!o.isSkinnedMesh)return;let owner=o;while(owner&&!ref.objects[owner.name])owner=owner.parent;if(!owner||!owner.name.endsWith('LOD'+lod))return;o.skeleton.update();const box=boxes[owner.name]??new THREE.Box3();const v=new THREE.Vector3();for(let i=0;i<o.geometry.attributes.position.count;i++){o.getVertexPosition(i,v);v.applyMatrix4(o.matrixWorld);box.expandByPoint(v);}boxes[owner.name]=box;});
    for(const [name,box] of Object.entries(boxes))actual[name]={min:box.min.toArray(),max:box.max.toArray()};
    for(const [name,want] of Object.entries(ref.objects)){if(!name.endsWith('LOD'+lod))continue;if(!actual[name])throw Error('Missing '+name);const error=Math.max(...['min','max'].flatMap(k=>want[k].map((v,i)=>Math.abs(v-actual[name][k][i]))));reports.push({clip:ref.clip,frame:ref.frame,object:name,errorM:error});}
   }
   return {lod,clips:gltf.animations.map(c=>({name:c.name,duration:c.duration})),reports,maxErrorM:Math.max(...reports.map(r=>r.errorM))};
  },{base64:bytes.toString('base64'),reference:converted,lod});
  row.sha256=createHash('sha256').update(bytes).digest('hex');result.push(row);
 }
}finally{await browser.close();}
const report={status:result.every(r=>r.maxErrorM<.0001)?'pass':'fail',runtime_publish_allowed:false,method:'Blender/Three world-space extrema of closed grips, arms, weapons and boots at start/mid/end of every clip. Not exhaustive per-vertex parity.',lods:result};
fs.writeFileSync(path.join(run,'qa/three-pose-parity.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,lods:result.map(r=>({lod:r.lod,maxErrorM:r.maxErrorM,samples:r.reports.length,clips:r.clips}))},null,2));
process.exitCode=report.status==='pass'?0:1;
