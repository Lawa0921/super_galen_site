/**
 * Read-only exported GLB skin-envelope audit.
 * Usage: node <this> --run RUN_DIR [--base-url http://127.0.0.1:4324]
 * Browser routes serve frozen asset bytes and the installed Three sources only.
 * A sampling pass is not a continuous-time or visual approval.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';

/** Self-contained so Playwright can serialize this exact audit into Chromium. */
export async function auditBoundsGlb(input) {
  const THREE=await import('three');
  const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
  const sampleHz=input.sampleHz??60,tolerance=input.toleranceMeters??1e-5;
  const expectedClips=input.expectedClips??['Attack','Death','Hurt','Idle','Walk'];
  const result={status:'fail',threeRevision:THREE.REVISION,sourceNodes:[],clips:[],
    primitiveDrawCount:0,triangleCount:0,vertexCount:0,sampledVertexCount:0,
    maxOutsideDistanceM:0,worstSample:null,errors:[],warnings:[],
    sampling:{sampleHz,toleranceMeters:tolerance,includesBindPose:true,
      includesEveryExportedKeyTime:true,includesClipEndpoints:true,continuousEnvelopeProved:false}};
  const error=(code,message)=>result.errors.push({code,message});
  const require=(condition,message)=>{if(!condition)throw new Error(message);};
  const validBounds=b=>b&&Array.isArray(b.sphere_center_y_up_m)&&b.sphere_center_y_up_m.length===3
    &&b.sphere_center_y_up_m.every(Number.isFinite)&&Number.isFinite(b.sphere_radius_m)&&b.sphere_radius_m>0;
  try {
    require(Number.isFinite(sampleHz)&&sampleHz>=60,'At least 60Hz sampling is required');
    require(Number.isFinite(tolerance)&&tolerance>0,'A positive finite numeric tolerance is required');
    const response=await fetch(input.url);require(response.ok,'GLB fetch failed: '+response.status);
    const bytes=await response.arrayBuffer();result.loadedByteLength=bytes.byteLength;
    const resourcePath=input.url.startsWith('data:')?'':new URL('.',input.url).href;
    const gltf=await new GLTFLoader().parseAsync(bytes,resourcePath);
    const scene=gltf.scene,associations=gltf.parser.associations,nodes=gltf.parser.json.nodes;
    const states=new Map(),primitives=[];
    scene.updateMatrixWorld(true);
    scene.traverse(object=>{
      if(!object.isSkinnedMesh)return;
      const association=associations.get(object);
      require(Number.isInteger(association?.meshes)&&Number.isInteger(association?.primitives),'Skinned primitive lacks a glTF mesh/primitive association');
      let source=object,nodeIndex;
      for(;source;source=source.parent) {
        const index=associations.get(source)?.nodes;
        if(Number.isInteger(index)&&nodes[index]?.mesh===association.meshes){nodeIndex=index;break;}
      }
      require(source&&nodeIndex!==undefined,'No source glTF node association for '+object.name);
      let state=states.get(nodeIndex);
      if(!state) {
        const declared=nodes[nodeIndex].extras?.rtsConservativeBounds,valid=!!validBounds(declared);
        const row={nodeIndex,nodeName:nodes[nodeIndex].name??'',meshIndex:association.meshes,
          primitiveCount:0,vertexCount:0,triangles:0,sampledVertexCount:0,
          declaredBounds:declared??null,declaredBoundsValid:valid,
          maxOutsideDistanceM:0,maximumSignedDistanceM:null,worstSample:null,
          sampledAabbMin:null,sampledAabbMax:null,sampledAabbSphere:null,
          primitiveMetadata:[]};
        state={source,row,box:new THREE.Box3(),center:valid?new THREE.Vector3().fromArray(declared.sphere_center_y_up_m):null,
          radius:valid?declared.sphere_radius_m:null,maxSigned:-Infinity};
        states.set(nodeIndex,state);
        if(!valid)error('bounds_missing_or_invalid','Node '+nodeIndex+' '+row.nodeName+' lacks a valid local rtsConservativeBounds');
      }
      const count=object.geometry.getAttribute('position')?.count;
      require(Number.isInteger(count)&&count>0,'Empty position attribute');
      const triangles=(object.geometry.index?.count??count)/3;
      require(Number.isInteger(triangles),'Non-triangle index count');
      let owner=object;
      while(owner&&owner.userData.rtsConservativeBounds===undefined)owner=owner.parent;
      const observed=owner?.userData.rtsConservativeBounds;
      state.row.primitiveMetadata.push({primitiveIndex:association.primitives,objectName:object.name,
        boundsOwnerName:owner?.name??null,boundsOwnerNodeIndex:owner?associations.get(owner)?.nodes??null:null,
        boundsReachable:!!validBounds(observed)});
      if(!validBounds(observed))error('runtime_bounds_missing','No valid inherited/direct bounds for primitive '+object.name);
      if(validBounds(observed)&&state.center) {
        const same=observed.sphere_radius_m===state.radius&&observed.sphere_center_y_up_m.every((v,i)=>v===state.center.getComponent(i));
        if(!same)result.warnings.push('Primitive '+object.name+' has a separate direct bounds sphere; this source-node union audit does not prove that override.');
      }
      state.row.primitiveCount++;state.row.vertexCount+=count;state.row.triangles+=triangles;
      result.primitiveDrawCount++;result.triangleCount+=triangles;result.vertexCount+=count;
      primitives.push({object,count,primitiveIndex:association.primitives,state,toSource:new THREE.Matrix4()});
    });
    require(primitives.length>0,'No active skinned primitives');
    const rest=[];
    scene.traverse(object=>rest.push({object,position:object.position.clone(),quaternion:object.quaternion.clone(),
      scale:object.scale.clone(),morph:object.morphTargetInfluences?.slice()}));
    const mixer=new THREE.AnimationMixer(scene),vertex=new THREE.Vector3();
    const restore=()=>{
      mixer.stopAllAction();
      for(const r of rest){r.object.position.copy(r.position);r.object.quaternion.copy(r.quaternion);r.object.scale.copy(r.scale);
        if(r.morph)r.object.morphTargetInfluences.splice(0,r.morph.length,...r.morph);}
      scene.updateMatrixWorld(true);
    };
    const sample=(clip,timeSeconds)=>{
      scene.updateMatrixWorld(true);
      const inverse=new Map();
      for(const [index,state] of states) {
        require(Math.abs(state.source.matrixWorld.determinant())>1e-15,'Singular source-node transform: '+index);
        inverse.set(index,state.source.matrixWorld.clone().invert());
      }
      for(const p of primitives) {
        p.object.skeleton.update();
        p.toSource.multiplyMatrices(inverse.get(p.state.row.nodeIndex),p.object.matrixWorld);
        const state=p.state,row=state.row;
        for(let i=0;i<p.count;i++) {
          p.object.getVertexPosition(i,vertex);vertex.applyMatrix4(p.toSource);
          require(Number.isFinite(vertex.x)&&Number.isFinite(vertex.y)&&Number.isFinite(vertex.z),
            'Non-finite deformed vertex '+row.nodeName+' '+clip+' '+timeSeconds+' '+i);
          state.box.expandByPoint(vertex);row.sampledVertexCount++;result.sampledVertexCount++;
          if(state.center) {
            const distance=vertex.distanceTo(state.center),signed=distance-state.radius;
            if(signed>state.maxSigned) {
              state.maxSigned=signed;row.maximumSignedDistanceM=signed;row.maxOutsideDistanceM=Math.max(0,signed);
              row.worstSample={nodeIndex:row.nodeIndex,nodeName:row.nodeName,primitiveIndex:p.primitiveIndex,
                vertexIndex:i,clip,timeSeconds,pointSourceLocal:vertex.toArray(),distanceFromCenterM:distance,
                declaredRadiusM:state.radius,signedDistanceM:signed};
            }
          }
        }
      }
    };
    restore();sample('__bind_pose__',0);
    const names=gltf.animations.map(clip=>clip.name);
    if(names.length!==new Set(names).size||[...names].sort().join('|')!==[...expectedClips].sort().join('|'))
      error('clip_set','Expected '+expectedClips.join(',')+'; found '+names.join(','));
    for(const clip of gltf.animations) {
      require(Number.isFinite(clip.duration)&&clip.duration>0,'Invalid clip duration: '+clip.name);
      const keyTimes=new Set(),times=new Set([0,clip.duration]);
      for(let i=0;i<=Math.ceil(clip.duration*sampleHz);i++)times.add(Math.min(i/sampleHz,clip.duration));
      for(const track of clip.tracks)for(const time of track.times) {
        require(Number.isFinite(time)&&time>=0&&time<=clip.duration+1e-6,'Invalid key time: '+clip.name);
        keyTimes.add(time);times.add(time);
      }
      for(const time of input.extraTimes?.[clip.name]??[])if(Number.isFinite(time)&&time>=0&&time<=clip.duration)times.add(time);
      const ordered=[...times].sort((a,b)=>a-b);
      restore();
      const action=mixer.clipAction(clip);action.reset();action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
      for(const time of ordered){mixer.setTime(time);sample(clip.name,time);}
      result.clips.push({name:clip.name,durationSeconds:clip.duration,sampleCount:ordered.length,
        sampledKeyTimeCount:keyTimes.size,allKeyTimesCovered:[...keyTimes].every(time=>times.has(time)),
        includesStart:times.has(0),includesEnd:times.has(clip.duration),sampleTimesSeconds:ordered});
    }
    restore();mixer.uncacheRoot(scene);
    for(const state of states.values()) {
      const row=state.row,sphere=state.box.getBoundingSphere(new THREE.Sphere());
      row.sampledAabbMin=state.box.min.toArray();row.sampledAabbMax=state.box.max.toArray();
      row.sampledAabbSphere={sphere_center_y_up_m:sphere.center.toArray(),sphere_radius_m:sphere.radius};
      row.status=row.declaredBoundsValid&&row.maxOutsideDistanceM<=tolerance?'pass':'fail';
      if(row.maxOutsideDistanceM>tolerance)error('bounds_outside','Node '+row.nodeIndex+' '+row.nodeName+' exceeds its sphere by '+row.maxOutsideDistanceM+' m');
      if(row.worstSample&&(result.worstSample===null||row.worstSample.signedDistanceM>result.worstSample.signedDistanceM))
        result.worstSample=row.worstSample;
      result.maxOutsideDistanceM=Math.max(result.maxOutsideDistanceM,row.maxOutsideDistanceM);
      result.sourceNodes.push(row);
    }
    result.status=result.errors.length?'fail':'pass';
  } catch(error) {
    result.errors.push({code:'audit_error',message:String(error?.stack??error)});
  }
  return result;
}

async function main() {
  const options={};
  for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i];if(!key.startsWith('--')||!process.argv[i+1])throw new Error('Expected --option value pairs');options[key.slice(2)]=process.argv[i+1];}
  if(!options.run)throw new Error('--run is required');
  const here=path.dirname(fileURLToPath(import.meta.url)),worktree=path.resolve(here,'../../..');
  const run=path.resolve(options.run),stem=options.stem??'original-guard-assembly';
  const contractPath=path.resolve(options.contract??path.join(worktree,'art-factory/rts/contracts/original-guard-assembly.json'));
  const contractBytes=await readFile(contractPath),contract=JSON.parse(contractBytes);
  const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
  const assets=[];
  for(const lod of [0,1]) {
    const assetPath=path.resolve(options['lod'+lod]??path.join(run,'candidate',stem+'-lod'+lod+'.glb'));
    const bytes=await readFile(assetPath);assets.push({lod,path:assetPath,bytes,sha256:sha(bytes)});
  }
  const require=createRequire(import.meta.url),threeRoot=path.resolve(path.dirname(require.resolve('three')),'..');
  const {chromium}=await import('@playwright/test');
  const browser=await chromium.launch({channel:'chromium',headless:true});
  const base=options['base-url']??process.env.RTS_BASE_URL??'http://127.0.0.1:4324';
  const origin=new URL(base).origin;
  const report={status:'fail',runtime_publish_allowed:false,visual_approval:false,
    proof_scope:'Frozen exported GLB bytes parsed and skinned by the installed Three GLTFLoader in Chromium. Source-node local spheres contain all tested vertices at bind pose, exported keys and 60Hz samples. Sampling does not prove a continuous envelope, runtime culling code, or visual quality.',
    generatedAt:new Date().toISOString(),contract:{path:contractPath,sha256:sha(contractBytes)},lods:[],errors:[]};
  try {
    const page=await browser.newPage();
    page.on('pageerror',error=>report.errors.push(String(error)));
    const html='<!doctype html><meta charset="utf-8"><script type="importmap">'+JSON.stringify({imports:{
      three:'/rts-bounds-deps/build/three.module.js','three/addons/':'/rts-bounds-deps/examples/jsm/'
    }})+'</script><title>Independent guard bounds audit</title>';
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      try {
        if(url.origin!==origin)return await route.abort();
        if(url.pathname==='/rts-bounds-audit')return await route.fulfill({contentType:'text/html',body:html});
        const assetMatch=/^\/rts-bounds-lod([01])\.glb$/.exec(url.pathname);
        if(assetMatch)return await route.fulfill({contentType:'model/gltf-binary',body:assets[Number(assetMatch[1])].bytes});
        if(url.pathname.startsWith('/rts-bounds-deps/')) {
          const file=path.resolve(threeRoot,decodeURIComponent(url.pathname.slice('/rts-bounds-deps/'.length)));
          if(!file.startsWith(threeRoot+path.sep))throw new Error('Dependency path escaped the installed Three directory');
          return await route.fulfill({contentType:'text/javascript',body:await readFile(file)});
        }
        await route.fulfill({status:404,body:'Not an audit resource'});
      } catch(error) {await route.fulfill({status:500,body:String(error)});}
    });
    await page.goto(origin+'/rts-bounds-audit');
    for(const asset of assets) {
      console.log('Auditing LOD'+asset.lod+' frozen SHA '+asset.sha256);
      const audit=await page.evaluate(auditBoundsGlb,{url:origin+'/rts-bounds-lod'+asset.lod+'.glb',
        sampleHz:60,toleranceMeters:1e-5,expectedClips:Object.keys(contract.clips),
        extraTimes:{Attack:[contract.runtime_extras?.attack?.contactSeconds].filter(Number.isFinite)}});
      if(audit.loadedByteLength!==asset.bytes.length)audit.errors.push({code:'snapshot_length',message:'Loaded bytes differ from frozen snapshot'});
      audit.status=audit.errors.length?'fail':audit.status;
      report.lods.push({lod:asset.lod,path:asset.path,sha256:asset.sha256,bytes:asset.bytes.length,...audit});
    }
    for(const lod of report.lods) {
      const currentSha=sha(await readFile(lod.path));
      lod.sourceStillMatchesAtCompletion=currentSha===lod.sha256;lod.currentSha256AtCompletion=currentSha;
    }
    report.status=report.lods.every(lod=>lod.status==='pass'&&lod.sourceStillMatchesAtCompletion)&&!report.errors.length?'pass':'fail';
    if(report.lods.some(lod=>!lod.sourceStillMatchesAtCompletion))report.errors.push('Candidate changed during audit; frozen SHA results remain diagnostic only.');
  } catch(error) {
    report.errors.push(String(error?.stack??error));
  } finally {
    await browser.close();
  }
  await mkdir(path.join(run,'qa'),{recursive:true});
  const out=path.join(run,'qa/runtime-bounds.json');
  await writeFile(out,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,report:out,lods:report.lods.map(lod=>({
    lod:lod.lod,sha256:lod.sha256,status:lod.status,sourceStillMatchesAtCompletion:lod.sourceStillMatchesAtCompletion,
    primitives:lod.primitiveDrawCount,triangles:lod.triangleCount,nodes:lod.sourceNodes.length,
    sampledVertices:lod.sampledVertexCount,maxOutsideDistanceM:lod.maxOutsideDistanceM,worstSample:lod.worstSample,errors:lod.errors})),errors:report.errors},null,2));
  return report.status==='pass'?0:1;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)process.exitCode=await main();
