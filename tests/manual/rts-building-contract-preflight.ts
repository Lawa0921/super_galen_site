/** Exact GLTFLoader scene/metadata preflight. Skips image decoding only, not
 * geometry or node parsing. Does not replace browser/material/visual QA. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {readConstructionMetadata} from '../../src/scripts/games/rts/construction-presentation';
import {readBuildingLifecycleMetadata} from '../../src/scripts/games/rts/building-lifecycle-presentation';

const [path,output]=process.argv.slice(2);if(!path||!output)throw new Error('Usage: tsx rts-building-contract-preflight.ts candidate.glb report.json');
const bytes=await readFile(path),loader=new GLTFLoader();
loader.register(()=>({name:'QA_image_decode_only',loadTexture:async()=>new THREE.Texture()}));
const report:any={candidate:path,sha256:createHash('sha256').update(bytes).digest('hex'),scope:'real GLTFLoader scene and exact runtime construction/lifecycle parsers; image decode omitted; no art/material/browser claim'};
try{
  const model=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer,'');
  report.sceneMetadataKeys=Object.keys(model.scene.userData);report.meshCount=0;
  model.scene.traverse(o=>{if(o instanceof THREE.Mesh)report.meshCount++;});
  const construction=readConstructionMetadata(model.scene),lifecycle=readBuildingLifecycleMetadata(model.scene);
  if(!construction||!lifecycle)throw new Error('Required building construction/lifecycle metadata missing');
  report.status='passed';report.construction=construction;report.lifecycle={clusters:lifecycle.clusters.length,replacements:lifecycle.replacementSets.length,anchors:lifecycle.anchors};
}catch(error){report.status='failed';report.error=String(error);report.stack=error instanceof Error?error.stack:undefined;process.exitCode=1;}
await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
