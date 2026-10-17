/** Actual browser GLTFLoader / AnimationMixer against the frozen Blender data. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {chromium} from '@playwright/test';

const run = path.resolve(process.argv[2] ?? 'art-factory/rts/runs/guard-right-hand-cage/2026-10-08-v16-wrist-export');
const mode = process.argv[3] ?? 'direct';
if (!['direct', 'sampled', 'continuous', 'slerp'].includes(mode)) throw Error('Expected direct, sampled, continuous or slerp export');
const read = name => fs.readFileSync(path.join(run, name));
const sha = data => createHash('sha256').update(data).digest('hex');
const reference = JSON.parse(read('qa/blender-reference.json'));
const exports = JSON.parse(read(`qa/export-${mode}.json`));
if (reference.source_sha256 !== exports.source_sha256 || sha(read('qa/blender-skin-matrices.f32')) !== reference.binary_sha256) throw Error('Unmatched Blender reference');
if (!reference.bone_rest_bounds || reference.samples !== reference.clips.reduce((n,c) => n+c.count,0)) throw Error('Incomplete reference');
if(sha(read('qa/blender-static-skin.json'))!==reference.static_skin_sha256)throw Error('Static skin reference hash changed');
if(sha(read('qa/blender-pose-extrema.json'))!==reference.pose_extrema_sha256)throw Error('Off-grid pose reference hash changed');
const req = createRequire(import.meta.url);
const threeRoot = path.resolve(path.dirname(req.resolve('three')), '..');
const browser = await chromium.launch({headless: true});
let result;
try {
  const page = await browser.newPage();
  const origin = 'http://127.0.0.1:4324';
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/wrist-parity') return route.fulfill({contentType: 'text/html', body:
      '<!doctype html><script type="importmap">' + JSON.stringify({imports: {three: '/deps/build/three.module.js', 'three/addons/': '/deps/examples/jsm/'}}) +
      '</script><script type="module">import * as THREE from "three";import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";import {verifySkinGeometry} from "/skin-correspondence.mjs";globalThis.verifySkinGeometry=verifySkinGeometry;globalThis.THREE=THREE;globalThis.GLTFLoader=GLTFLoader;</script>'});
    if (url.pathname.startsWith('/deps/')) {
      const file = path.resolve(threeRoot, url.pathname.slice(6));
      if (!file.startsWith(threeRoot + path.sep)) return route.abort();
      return route.fulfill({contentType: 'text/javascript', body: fs.readFileSync(file)});
    }
    if (url.pathname === '/reference.f32') return route.fulfill({contentType: 'application/octet-stream', body: read('qa/blender-skin-matrices.f32')});
    if (url.pathname === '/extrema.json') return route.fulfill({contentType: 'application/json', body: read('qa/blender-pose-extrema.json')});
    if (url.pathname === '/static-skin.json') return route.fulfill({contentType: 'application/json', body: read('qa/blender-static-skin.json')});
    if (url.pathname === '/skin-correspondence.mjs') return route.fulfill({contentType: 'text/javascript', body: fs.readFileSync(new URL('./skin_geometry_correspondence.mjs',import.meta.url))});
    const asset = exports.exports.find(e => url.pathname === '/'+e.file);
    if (asset) return route.fulfill({contentType: 'model/gltf-binary', body: read('candidate/'+asset.file)});
    return route.abort();
  });
  await page.goto(origin+'/wrist-parity');
  await page.waitForFunction(() => !!globalThis.GLTFLoader);
  for (const asset of exports.exports) if (sha(read('candidate/'+asset.file)) !== asset.sha256) throw Error('Export hash changed');
  result = await page.evaluate(async ({reference, assets}) => {
    const dense = new Float32Array(await (await fetch('/reference.f32')).arrayBuffer());
    const extrema = await (await fetch('/extrema.json')).json();
    const staticSource = await (await fetch('/static-skin.json')).json();
    if (dense.length !== reference.samples*reference.bones.length*16) throw Error('Truncated reference');
    const C = new THREE.Matrix4().set(1,0,0,0, 0,0,1,0, 0,-1,0,0, 0,0,0,1), Ci = C.clone().invert();
    const boxes = reference.bones.map(name => {
      const b = reference.bone_rest_bounds[name];
      if (!b) return [];
      const ps=[];
      for (const x of [b.min[0],b.max[0]]) for (const y of [b.min[1],b.max[1]]) for (const z of [b.min[2],b.max[2]]) ps.push(new THREE.Vector3(x,z,-y));
      return ps;
    });
    const reports=[];
    for (const asset of assets) {
      const data = await (await fetch('/'+asset.file)).arrayBuffer();
      const gltf = await new GLTFLoader().parseAsync(data, '');
      const root=gltf.scene, mixer=new THREE.AnimationMixer(root), found=new Map(), meshes=[];
      root.traverse(o => {
        if (!o.isSkinnedMesh) return;
        meshes.push(o);
        o.skeleton.bones.forEach((bone,i) => {if (!found.has(bone.name)) found.set(bone.name, {bone,inverse:o.skeleton.boneInverses[i]});});
      });
      if (reference.bones.some(name => !found.has(name))) throw Error('Missing source bones');
      const bindings=reference.bones.map(name => found.get(name));
      const identity=new THREE.Matrix4(),owners={},staticReports=[];
      let maxInverseBindError=0;
      for(const mesh of meshes){
        for(const matrix of [mesh.matrixWorld,mesh.bindMatrix,mesh.bindMatrixInverse])if(matrix.elements.some((v,i)=>Math.abs(v-identity.elements[i])>1e-8))throw Error('Nonidentity exported mesh bind/world transform');
        if(mesh.skeleton.bones.length!==reference.bones.length||new Set(mesh.skeleton.bones.map(b=>b.name)).size!==reference.bones.length)throw Error('Skin bone coverage/uniqueness mismatch');
        for(let i=0;i<mesh.skeleton.bones.length;i++){
          const name=mesh.skeleton.bones[i].name,rest=reference.bone_rest_matrices[name];
          if(!rest)throw Error('Unexpected skin bone '+name);
          // Joint-local axes remain Blender axes: world = C * H, IBM = H^-1 * C^-1.
          const want=new THREE.Matrix4().set(...rest.flat()).invert().multiply(Ci),got=mesh.skeleton.boneInverses[i];
          maxInverseBindError=Math.max(maxInverseBindError,...want.elements.map((v,j)=>Math.abs(v-got.elements[j])));
          if(got.elements.some((v,j)=>v!==found.get(name).inverse.elements[j]))throw Error('Different inverse binds between meshes');
        }
        let owner=mesh;while(owner&&!staticSource[owner.name])owner=owner.parent;if(!owner)throw Error('Unknown exported skin owner');
        if(!owner.name.endsWith('LOD'+asset.lod))throw Error('Wrong LOD exported');
        const group=owners[owner.name]??{vertices:[],triangles:[]},offset=group.vertices.length;
        const {position,skinIndex,skinWeight}=mesh.geometry.attributes;
        const sourceIdentity=mesh.geometry.attributes._rts_source_vertex;
        if(reference.source_vertex_identity_required&&(!sourceIdentity||sourceIdentity.count!==position.count))throw Error('Source vertex identity missing');
        if(!position||!skinIndex||!skinWeight||position.count!==skinIndex.count||position.count!==skinWeight.count)throw Error('Incomplete exported skin attributes');
        for(let i=0;i<position.count;i++){
          const weights=[];for(let j=0;j<4;j++){const w=skinWeight.getComponent(i,j);if(w>0){const bi=skinIndex.getComponent(i,j);if(!Number.isInteger(bi)||!mesh.skeleton.bones[bi])throw Error('Invalid joint index');weights.push([mesh.skeleton.bones[bi].name,w]);}}
          group.vertices.push({position:[position.getX(i),position.getY(i),position.getZ(i)],weights,...sourceIdentity?{sourceIndex:sourceIdentity.getX(i)}:{}});
        }
        const index=mesh.geometry.index,count=index?.count??position.count;if(count%3)throw Error('Non-triangle primitive');
        for(let i=0;i<count;i+=3)group.triangles.push([0,1,2].map(j=>offset+(index?index.getX(i+j):i+j)));
        owners[owner.name]=group;
      }
      if(maxInverseBindError>2e-6)throw Error('Source/export inverse bind mismatch '+maxInverseBindError);
      const expectedOwners=Object.keys(staticSource).filter(n=>n.endsWith('LOD'+asset.lod));
      if(expectedOwners.length!==Object.keys(owners).length||expectedOwners.some(n=>!owners[n]))throw Error('Incomplete exported owner coverage');
      for(const name of expectedOwners){try{staticReports.push({name,...verifySkinGeometry(staticSource[name],owners[name])});}catch(error){throw Error(name+': '+error.message);}}
      const staticPositionError=Math.max(...staticReports.map(r=>r.maxPositionErrorM)),staticWeightError=Math.max(...staticReports.map(r=>r.maxWeightL1Error)),restRadius=Math.max(...staticReports.map(r=>r.maxRestRadius));
      const wanted=new THREE.Matrix4(), actual=new THREE.Matrix4(), delta=new THREE.Matrix4();
      const clips=[]; let maxPointBoundM=0, maxMatrixError=0, worst,maxOperatorBound=0,maxTranslation=0;
      for (const ref of reference.clips) {
        const clip=gltf.animations.find(c => c.name===ref.name);
        if (!clip || Math.abs(clip.duration-ref.duration_seconds)>1e-6) throw Error('Clip missing or retimed: '+ref.name);
        mixer.stopAllAction();
        const action=mixer.clipAction(clip).reset(); action.setLoop(THREE.LoopOnce,1); action.clampWhenFinished=true; action.play();
        let clipMax=0, clipMatrixMax=0, clipWorst;
        for (let sample=0; sample<ref.count; sample++) {
          const frame=sample/reference.step_per_frame;
          mixer.setTime(frame/reference.fps); root.updateMatrixWorld(true);
          for (let bi=0; bi<bindings.length; bi++) {
            const base=((ref.offset+sample)*bindings.length+bi)*16;
            wanted.set(...dense.subarray(base,base+16)).premultiply(C).multiply(Ci);
            const binding=bindings[bi]; actual.multiplyMatrices(binding.bone.matrixWorld,binding.inverse);
            const a=actual.elements;maxOperatorBound=Math.max(maxOperatorBound,Math.hypot(...[0,1,2,4,5,6,8,9,10].map(i=>a[i])));maxTranslation=Math.max(maxTranslation,Math.hypot(a[12],a[13],a[14]));
            for (let c=0;c<16;c++) delta.elements[c]=actual.elements[c]-wanted.elements[c];
            const component=Math.max(...delta.elements.map(Math.abs));
            clipMatrixMax=Math.max(clipMatrixMax,component);
            const e=delta.elements;
            for (const p of boxes[bi]) {
              const error=Math.hypot(e[0]*p.x+e[4]*p.y+e[8]*p.z+e[12], e[1]*p.x+e[5]*p.y+e[9]*p.z+e[13], e[2]*p.x+e[6]*p.y+e[10]*p.z+e[14]);
              if (error>clipMax) {clipMax=error;clipWorst={frame,bone:reference.bones[bi],expectedSkin:wanted.toArray(),actualSkin:actual.toArray()};}
              if (error>maxPointBoundM) {maxPointBoundM=error;worst={clip:ref.name,frame,bone:reference.bones[bi],restBoxCorner:p.toArray()};}
            }
          }
        }
        maxMatrixError=Math.max(maxMatrixError,clipMatrixMax);
        clips.push({name:ref.name,samples:ref.count,duration:clip.duration,maxPointBoundM:clipMax,maxMatrixComponentError:clipMatrixMax,worst:clipWorst,
          tracks:clip.tracks.map(t=>({name:t.name,keys:t.times.length,interpolation:t.getInterpolation()}))});
      }
      let maxExtremaErrorM=0, extremaComparisons=0, worstExtrema;
      for (const ref of extrema) {
        mixer.stopAllAction();
        const action=mixer.clipAction(gltf.animations.find(c=>c.name===ref.clip)).reset();
        action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();mixer.setTime(ref.frame/reference.fps);root.updateMatrixWorld(true);
        const actualBoxes={};
        for (const mesh of meshes) {
          let owner=mesh; while (owner&&!ref.objects[owner.name]) owner=owner.parent;
          if (!owner) throw Error('Unmapped exported mesh '+mesh.name);
          mesh.skeleton.update();const box=actualBoxes[owner.name]??new THREE.Box3(), v=new THREE.Vector3();
          for(let i=0;i<mesh.geometry.attributes.position.count;i++){mesh.getVertexPosition(i,v);v.applyMatrix4(mesh.matrixWorld);box.expandByPoint(v);}
          actualBoxes[owner.name]=box;
        }
        for (const [name,b] of Object.entries(ref.objects)) {
          if(!name.endsWith('LOD'+asset.lod))continue;
          const got=actualBoxes[name];if(!got)throw Error('Missing mesh '+name);
          const min=[b.min[0],b.min[2],-b.max[1]],max=[b.max[0],b.max[2],-b.min[1]];
          const error=Math.max(...min.map((x,i)=>Math.abs(x-got.min.getComponent(i))),...max.map((x,i)=>Math.abs(x-got.max.getComponent(i))));
          extremaComparisons++;
          if(error>maxExtremaErrorM){maxExtremaErrorM=error;worstExtrema={clip:ref.clip,frame:ref.frame,mesh:name};}
        }
      }
      const staticErrorAllowanceM=staticPositionError*maxOperatorBound*(1+staticWeightError)+staticWeightError*(restRadius*maxOperatorBound+maxTranslation);
      reports.push({lod:asset.lod,sha256:asset.sha256,maxPointBoundM,staticErrorAllowanceM,combinedPointBoundM:maxPointBoundM+staticErrorAllowanceM,maxMatrixError,worst,clips,maxExtremaErrorM,worstExtrema,extremaComparisons,
        staticSkin:{maxInverseBindError,meshes:staticReports},pass:maxPointBoundM+staticErrorAllowanceM<=.00005&&maxExtremaErrorM<=.00005});
    }
    return reports;
  }, {reference, assets:exports.exports});
  if (errors.length) throw Error(errors.join('\n'));
} finally {await browser.close();}
const report={status:result.every(r=>r.pass)?'pass':'fail',runtime_publish_allowed:false,mode,
  source_sha256:reference.source_sha256,point_error_limit_m:.00005,source_reference_sha256:sha(read('qa/blender-reference.json')),
  method:'Actual Chromium Three GLTFLoader and AnimationMixer. Dense all-bone skin matrices and conservative per-influence rest-box error bound; actual getVertexPosition extrema at additional arbitrary off-grid times. Geometry-only export.',
  limitations:['No final materials or hand-shape approval','No collision approval','Dense samples are not a proof at every real-valued time'],lods:result};
fs.writeFileSync(path.join(run,`qa/three-parity-${mode}.json`),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,mode,lods:result.map(({clips,staticSkin,...row})=>row)},null,2));
process.exitCode=report.status==='pass'?0:1;
