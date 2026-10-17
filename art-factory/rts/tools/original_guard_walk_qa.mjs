/**
 * Read-only Walk sole/heel/toe diagnosis on frozen exported GLB bytes.
 * It measures real skinned foot vertices; bone positions are labelled proxies.
 * Sampling success is not motion/visual approval. Ground proximity is not a force/contact proof.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';

export async function auditWalkGlb(input) {
  const THREE=await import('three');
  const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
  const result={status:'fail',errors:[],samples:[],feet:{},evidence:[],visualApproval:false,
    method:{footWeightThreshold:.5,soleRestHeightBandM:.03,heelToeEndFraction:.3,
      groundYM:0,velocityCentralDifferenceSeconds:.001,velocityUsesSameVertexAtBothTimes:true,
      bonePositionsAreProxiesOnly:true,groundProximityIsNotContactForce:true,runtimeTranslation:'Continuous 3m/s baseline. Shipped simulation root positions step at 20Hz; this audit does not model that stepping.'}};
  try {
    const speed=input.speedMps??3,sampleHz=input.sampleHz??240,scale=input.scale??1,yaw=input.yaw??0,toeSign=input.toeForwardSign??1;
    if(![1,-1].includes(toeSign))throw new Error('Toe direction sign must be +1 or -1');
    result.method.toeDirectionRelativeToAuthoredForward=toeSign;
    if(![speed,sampleHz,scale,yaw].every(Number.isFinite)||sampleHz<60||scale<=0)throw new Error('Invalid runtime/sampling parameters');
    const response=await fetch(input.url);if(!response.ok)throw new Error('GLB fetch failed');
    const bytes=await response.arrayBuffer(),resource=input.url.startsWith('data:')?'':new URL('.',input.url).href;
    const gltf=await new GLTFLoader().parseAsync(bytes,resource),clip=gltf.animations.find(c=>c.name==='Walk');
    if(!clip||!Number.isFinite(clip.duration)||clip.duration<=0)throw new Error('Valid Walk clip required');
    const duration=clip.duration,root=new THREE.Group();root.scale.setScalar(scale);root.rotation.y=Math.PI+yaw;
    root.add(gltf.scene);root.updateMatrixWorld(true);
    result.loadedByteLength=bytes.byteLength;result.durationSeconds=duration;result.speedMps=speed;
    result.runtimeTransform={scale,yawRadians:Math.PI+yaw,translation:[0,0,'speed*time'],groundYM:0};
    result.motionExtras=gltf.scene.userData.rtsMotion??null;result.threeRevision=THREE.REVISION;
    const primitives=[],bones=new Map(),footData={left:{items:[]},right:{items:[]}},v=new THREE.Vector3();
    gltf.scene.traverse(o=>{if(o.isBone)bones.set(o.name,o);if(o.isSkinnedMesh)primitives.push(o);});
    for(const [pi,object] of primitives.entries()) {
      object.skeleton.update();
      const position=object.geometry.getAttribute('position'),weights=object.geometry.getAttribute('skinWeight'),indices=object.geometry.getAttribute('skinIndex');
      if(!weights||!indices)throw new Error('Missing skin attributes');
      for(let i=0;i<position.count;i++) {
        const sums={left:0,right:0};
        for(let j=0;j<4;j++) {
          const name=object.skeleton.bones[indices.getComponent(i,j)]?.name??'',w=weights.getComponent(i,j);
          if(/^(Foot|Toe)[_.]L$/.test(name))sums.left+=w;
          if(/^(Foot|Toe)[_.]R$/.test(name))sums.right+=w;
        }
        for(const side of ['left','right'])if(sums[side]>=.5) {
          object.getVertexPosition(i,v);v.applyMatrix4(object.matrixWorld);
          const assoc=gltf.parser.associations.get(object);
          footData[side].items.push({object,vertexIndex:i,primitiveOrdinal:pi,primitiveIndex:assoc?.primitives??null,
            meshIndex:assoc?.meshes??null,objectName:object.name,weight:sums[side],rest:v.clone()});
        }
      }
    }
    const ref=item=>({objectName:item.objectName,meshIndex:item.meshIndex,primitiveIndex:item.primitiveIndex,vertexIndex:item.vertexIndex});
    for(const [side,foot] of Object.entries(footData)) {
      if(!foot.items.length)throw new Error('No actual Foot/Toe weighted vertices for '+side);
      const box=new THREE.Box3().setFromPoints(foot.items.map(i=>i.rest)),bottom=box.min.y;
      foot.sole=foot.items.filter(i=>i.rest.y<=bottom+.03);
      const soleBox=new THREE.Box3().setFromPoints(foot.sole.map(i=>i.rest)),length=soleBox.max.z-soleBox.min.z;
      if(length<.01)throw new Error('Sole forward extent is too small to identify heel/toe');
      const back=foot.sole.filter(i=>i.rest.z<=soleBox.min.z+.3*length),front=foot.sole.filter(i=>i.rest.z>=soleBox.max.z-.3*length);
      foot.heel=toeSign===1?back:front;foot.toe=toeSign===1?front:back;
      foot.markers={};for(const name of ['sole','heel','toe']){const b=new THREE.Box3().setFromPoints(foot[name].map(i=>i.rest)),center=b.getCenter(new THREE.Vector3());center.y=b.min.y;foot.markers[name]=foot[name].reduce((a,item)=>item.rest.distanceToSquared(center)<a.rest.distanceToSquared(center)?item:a);}
      result.feet[side]={boneNames:[...bones.keys()].filter(n=>new RegExp('^(Foot|Toe)[_.]'+(side==='left'?'L':'R')+'$').test(n)),
        weightedVertexCount:foot.items.length,soleVertexCount:foot.sole.length,heelVertexCount:foot.heel.length,toeVertexCount:foot.toe.length,
        weightedRestAabb:{min:box.min.toArray(),max:box.max.toArray()},soleRestAabb:{min:soleBox.min.toArray(),max:soleBox.max.toArray()},
        soleReferences:foot.sole.map(ref),heelReferences:foot.heel.map(ref),toeReferences:foot.toe.map(ref),
        fixedMarkerReferences:Object.fromEntries(Object.entries(foot.markers).map(([name,item])=>[name,{...ref(item),restWorld:item.rest.toArray()}]))};
    }
    const mixer=new THREE.AnimationMixer(gltf.scene),action=mixer.clipAction(clip);
    action.reset().setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
    const pose=(time,allowEnd=false)=>{
      let local=((time%duration)+duration)%duration;if(allowEnd)local=duration;
      action.enabled=true;action.paused=false;mixer.setTime(local);
      root.position.z=speed*time;root.updateMatrixWorld(true);
      for(const p of primitives)p.skeleton.update();
    };
    const point=item=>{const p=new THREE.Vector3();item.object.getVertexPosition(item.vertexIndex,p);return p.applyMatrix4(item.object.matrixWorld);};
    const lowest=items=>{
      let best=null;for(const item of items){const p=point(item);if(!p.toArray().every(Number.isFinite))throw new Error('Non-finite foot vertex');
        if(best===null||p.y<best.p.y)best={item,p};}return best;
    };
    const keyTimes=[...new Set(clip.tracks.flatMap(t=>Array.from(t.times)))].sort((a,b)=>a-b);
    const requested=[0,duration,...keyTimes];
    for(let i=0;i<=Math.ceil(duration*sampleHz);i++)requested.push(Math.min(duration,i/sampleHz));
    const times=requested.sort((a,b)=>a-b).filter((t,i,a)=>i===0||t-a[i-1]>1e-6);
    if(Math.abs(times.at(-1)-duration)<1e-6)times[times.length-1]=duration;
    result.sampling={sampleHz,includesExportedKeys:true,keyTimeCount:keyTimes.length,sampleCount:times.length,
      endpointDuplicatesStartForLoop:true,derivativeStepSeconds:.001};
    for(const time of times) {
      pose(time);const row={timeSeconds:time,phase:time/duration,feet:{}},chosen=[];
      for(const [side,foot] of Object.entries(footData)) {
        const f={};
        for(const region of ['sole','heel','toe']) {
          const m=lowest(foot[region]);f[region]={heightM:m.p.y,pointWorld:m.p.toArray(),reference:ref(m.item)};
          chosen.push({target:f[region],item:m.item});
        }
        f.fixedMarkers={};for(const [name,item] of Object.entries(foot.markers)){const p=point(item);const target={heightM:p.y,pointWorld:p.toArray(),reference:ref(item)};f.fixedMarkers[name]=target;chosen.push({target,item});}
        const all=lowest(foot.items);f.allFootWeightedLowest={heightM:all.p.y,reference:ref(all.item)};
        const bone=bones.get('Foot_'+(side==='left'?'L':'R'));
        if(bone)f.ankleBoneProxyWorld=bone.getWorldPosition(new THREE.Vector3()).toArray();
        row.feet[side]=f;
      }
      pose(time-.001);for(const c of chosen)c.before=point(c.item);
      pose(time+.001);for(const c of chosen) {
        const velocity=point(c.item).sub(c.before).divideScalar(.002);
        c.target.velocityWorldMps=velocity.toArray();c.target.horizontalSpeedMps=Math.hypot(velocity.x,velocity.z);
      }
      result.samples.push(row);
    }
    pose(0);const start=new Map();
    for(const foot of Object.values(footData))for(const item of foot.sole)start.set(item,point(item));
    pose(0,true);root.position.z=0;root.updateMatrixWorld(true);for(const p of primitives)p.skeleton.update();
    let seam=0;for(const [item,p] of start)seam=Math.max(seam,p.distanceTo(point(item)));
    result.maxFootLoopSeamPositionM=seam;
    if(input.render&&typeof document!=='undefined') {
      const world=new THREE.Scene();world.background=new THREE.Color('#222d31');world.add(root);
      const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(420,480);
      renderer.setPixelRatio(1);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
      renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
      world.add(new THREE.HemisphereLight('#dce5e6','#788065',2));
      const sun=new THREE.DirectionalLight('#ffe9ce',3);sun.position.set(4,7,5);sun.castShadow=true;
      sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-5;sun.shadow.camera.right=5;sun.shadow.camera.top=5;sun.shadow.camera.bottom=-5;world.add(sun);
      const floor=new THREE.Mesh(new THREE.PlaneGeometry(30,30),new THREE.MeshStandardMaterial({color:'#89958c',roughness:1}));
      floor.rotation.x=-Math.PI/2;floor.position.y=-.003;floor.receiveShadow=true;world.add(floor);
      const grid=new THREE.GridHelper(20,80,'#46554e','#75867c');grid.position.y=.0005;world.add(grid);
      root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;}});
      const markers=[];
      for(const side of ['left','right'])for(const region of ['heel','toe']) {
        const sphere=new THREE.Mesh(new THREE.SphereGeometry(.009,8,6),new THREE.MeshBasicMaterial({color:side==='left'?'#54ffb0':'#ff665d',depthTest:false}));
        sphere.renderOrder=20;world.add(sphere);markers.push({side,region,sphere});
      }
      const camera=new THREE.OrthographicCamera(-1,1,1.15,-1.15,.01,50);
      for(const view of ['side-full','side-feet','front-feet']) {
        const canvas=document.createElement('canvas');canvas.width=1680;canvas.height=1090;const ctx=canvas.getContext('2d');
        ctx.fillStyle='#172025';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#eef6ee';ctx.font='18px sans-serif';
        ctx.fillText('Frozen GLB '+(input.sha256??'')+' | Walk '+duration.toFixed(6)+'s | speed '+speed+'m/s',16,24);
        ctx.fillText(view+' | ground y=0 | green L / red R actual sole heel/toe vertices | camera follows runtime translation',16,48);
        for(let i=0;i<8;i++) {
          const time=duration*i/8;pose(time);const center=speed*time;
          for(const marker of markers)marker.sphere.position.copy(lowest(footData[marker.side][marker.region]).p);
          const full=view==='side-full',cy=full?1.05:.45,halfY=full?1.15:.8;
          camera.left=-halfY*420/480;camera.right=halfY*420/480;camera.top=halfY;camera.bottom=-halfY;camera.updateProjectionMatrix();
          camera.position.set(view==='front-feet'?0:5,cy,center+(view==='front-feet'?5:0));camera.lookAt(0,cy,center);
          renderer.render(world,camera);const x=(i%4)*420,y=64+Math.floor(i/4)*513;
          ctx.drawImage(renderer.domElement,x,y,420,480);
          if(view!=='side-full')for(const marker of markers){const p=marker.sphere.position.clone().project(camera);ctx.fillStyle=marker.side==='left'?'#54ffb0':'#ff665d';ctx.font='bold 13px monospace';ctx.fillText((marker.side==='left'?'L':'R')+' '+marker.region,x+(p.x*.5+.5)*420+5,y+(-p.y*.5+.5)*480-8);}
          if(view.startsWith('side')){ctx.strokeStyle='#d9e8ed';ctx.fillStyle='#d9e8ed';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+95,y+25);ctx.lineTo(x+20,y+25);ctx.lineTo(x+28,y+20);ctx.moveTo(x+20,y+25);ctx.lineTo(x+28,y+30);ctx.stroke();ctx.font='14px monospace';ctx.fillText('model front (+Y)',x+103,y+30);}
          ctx.fillStyle='#e7f4e9';ctx.font='15px monospace';
          const lh=lowest(footData.left.sole).p.y,rh=lowest(footData.right.sole).p.y;
          ctx.fillText('t='+time.toFixed(3)+' L='+lh.toFixed(3)+' R='+rh.toFixed(3)+'m',x+6,y+501);
        }
        result.evidence.push({view,mimeType:'image/png',dataUrl:canvas.toDataURL('image/png')});
      }
      renderer.dispose();
    }
    pose(0);mixer.stopAllAction();mixer.uncacheRoot(gltf.scene);result.status='pass';
  }catch(error){result.errors.push(String(error?.stack??error));}
  return result;
}

function thresholdWindows(samples,condition) {
  const windows=[];let start=null;
  for(let i=0;i<samples.length;i++) {
    const yes=condition(samples[i]);
    if(yes&&start===null)start=samples[i].timeSeconds;
    if(!yes&&start!==null){windows.push({startSeconds:start,endSeconds:samples[i].timeSeconds,durationSeconds:samples[i].timeSeconds-start});start=null;}
  }
  if(start!==null)windows.push({startSeconds:start,endSeconds:samples.at(-1).timeSeconds,durationSeconds:samples.at(-1).timeSeconds-start});
  return windows;
}
export function summarizeWalk(audit) {
  const result={groundYM:0,contactIsGeometricProximityOnly:true,feet:{},thresholds:[]};
  for(const side of ['left','right']) {
    const rows=audit.samples.map(s=>({timeSeconds:s.timeSeconds,phase:s.phase,...s.feet[side]}));
    const min=rows.reduce((a,b)=>a.sole.heightM<b.sole.heightM?a:b),max=rows.reduce((a,b)=>a.sole.heightM>b.sole.heightM?a:b);
    result.feet[side]={minimum:{timeSeconds:min.timeSeconds,phase:min.phase,...min.sole},maximum:{timeSeconds:max.timeSeconds,phase:max.phase,...max.sole},
      heelMinM:Math.min(...rows.map(r=>r.heel.heightM)),toeMinM:Math.min(...rows.map(r=>r.toe.heightM))};
    const start=side==='left'?0:audit.durationSeconds/2,end=start+.2;
    const select=(a,b)=>rows.filter(r=>r.timeSeconds>=a-1e-6&&r.timeSeconds<=b+1e-6);
    const stance=select(start,end),interior=select(start+1/30,end-1/30);
    const closest=t=>rows.reduce((a,r)=>Math.abs(r.timeSeconds-t)<Math.abs(a.timeSeconds-t)?r:a);
    const from=closest(start),to=closest(end),markers={};
    for(const name of ['sole','heel','toe']) {
      const a=from.fixedMarkers[name].pointWorld,b=to.fixedMarkers[name].pointWorld;
      const delta=b.map((v,i)=>v-a[i]),values=interior.map(r=>r.fixedMarkers[name].horizontalSpeedMps);
      markers[name]={startSeconds:from.timeSeconds,endSeconds:to.timeSeconds,startWorld:a,endWorld:b,
        deltaWorldM:delta,horizontalDisplacementM:Math.hypot(delta[0],delta[2]),
        interiorMaxSlipMps:Math.max(...values),interiorMeanSlipMps:values.reduce((a,b)=>a+b,0)/values.length};
    }
    const worst=interior.reduce((a,r)=>r.sole.horizontalSpeedMps>a.sole.horizontalSpeedMps?r:a);
    result.feet[side].authoredStance={startSeconds:start,endSeconds:end,observedFlatSole:true,
      description:'Source motion specification stance is 0.2s; full/foot strips confirm flat support. Interior excludes one 30Hz frame at either transition.',
      interiorWindowSeconds:[start+1/30,end-1/30],fixedMarkers:markers,
      interiorLowestVertexMaxSlipMps:worst.sole.horizontalSpeedMps,interiorWorst:{timeSeconds:worst.timeSeconds,phase:worst.phase,...worst.sole},
      interiorLowestVertexMeanSlipMps:interior.reduce((sum,r)=>sum+r.sole.horizontalSpeedMps,0)/interior.length,
      stanceMinSoleM:Math.min(...stance.map(r=>r.sole.heightM)),stanceMaxSoleM:Math.max(...stance.map(r=>r.sole.heightM))};
  }
  for(const thresholdM of [.01,.02,.03,.05]) {
    const item={thresholdM,feet:{},bothAirborneWindows:thresholdWindows(audit.samples,s=>s.feet.left.sole.heightM>thresholdM&&s.feet.right.sole.heightM>thresholdM)};
    for(const side of ['left','right']) {
      const rows=audit.samples.filter(s=>s.feet[side].sole.heightM<=thresholdM),windows=thresholdWindows(audit.samples,s=>s.feet[side].sole.heightM<=thresholdM);
      const worst=rows.reduce((a,s)=>!a||s.feet[side].sole.horizontalSpeedMps>a.feet[side].sole.horizontalSpeedMps?s:a,null);
      item.feet[side]={windows,sampleCount:rows.length,maxHorizontalSlipMps:worst?.feet[side].sole.horizontalSpeedMps??null,
        worst:worst?{timeSeconds:worst.timeSeconds,phase:worst.phase,...worst.feet[side].sole}:null,
        meanHorizontalSlipMps:rows.length?rows.reduce((sum,s)=>sum+s.feet[side].sole.horizontalSpeedMps,0)/rows.length:null};
    }
    result.thresholds.push(item);
  }
  return result;
}

async function main() {
  const options={};for(let i=2;i<process.argv.length;i+=2)options[process.argv[i].slice(2)]=process.argv[i+1];
  if(!options.run)throw new Error('--run required');
  const worktree=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'),run=path.resolve(options.run),out=path.join(run,'qa/walk-diagnostic');
  await mkdir(out,{recursive:true});
  const sha=b=>createHash('sha256').update(b).digest('hex'),assets=[];
  for(const lod of [0,1]) {
    const source=path.resolve(options['lod'+lod]??path.join(run,'candidate/original-guard-assembly-lod'+lod+'.glb')),bytes=await readFile(source),hash=sha(bytes);
    const snapshot=path.join(out,'lod'+lod+'-'+hash+'.glb');await writeFile(snapshot,bytes);
    assets.push({lod,path:source,snapshot,bytes,sha256:hash});
  }
  const registry=JSON.parse(await readFile(path.join(worktree,'public/assets/games/rts/model-registry.json'),'utf8')),entry=registry.assets.guard;
  const req=createRequire(import.meta.url),threeRoot=path.resolve(path.dirname(req.resolve('three')),'..'),{chromium}=await import('@playwright/test');
  const browser=await chromium.launch({channel:'chromium',headless:true});
  const report={status:'fail',runtime_publish_allowed:false,visual_approval:false,generatedAt:new Date().toISOString(),
    proofScope:'Actual Foot/Toe-weighted exported vertices, bind-defined sole regions, real GLTFLoader skinning and runtime pi+yaw plus 3m/s translation. Support windows are geometric proximity candidates, not physical force proof. Sampling status is not motion approval.',
    lods:[],errors:[]};
  try {
    const page=await browser.newPage(),origin='http://127.0.0.1:4324';
    const html='<!doctype html><script type="importmap">'+JSON.stringify({imports:{three:'/walk-deps/build/three.module.js','three/addons/':'/walk-deps/examples/jsm/'}})+'</script>';
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin!==origin)return route.abort();
      if(url.pathname==='/walk-qa')return route.fulfill({contentType:'text/html',body:html});
      const match=/^\/walk-lod([01])\.glb$/.exec(url.pathname);
      if(match)return route.fulfill({contentType:'model/gltf-binary',body:assets[Number(match[1])].bytes});
      if(url.pathname.startsWith('/walk-deps/')) {
        const file=path.resolve(threeRoot,decodeURIComponent(url.pathname.slice('/walk-deps/'.length)));
        if(!file.startsWith(threeRoot+path.sep))return route.abort();
        return route.fulfill({contentType:'text/javascript',body:await readFile(file)});
      }
      return route.fulfill({status:404,body:'No resource'});
    });
    await page.goto(origin+'/walk-qa');
    for(const asset of assets) {
      console.log('Walk audit LOD'+asset.lod+' SHA '+asset.sha256);
      const data=await page.evaluate(auditWalkGlb,{url:origin+'/walk-lod'+asset.lod+'.glb',speedMps:3,sampleHz:Number(options['sample-hz']??240),toeForwardSign:Number(options['toe-forward-sign']??1),
        scale:entry.scale??1,yaw:entry.yaw??0,render:asset.lod===0,sha256:asset.sha256});
      for(const evidence of data.evidence??[]) {
        const file=path.join(out,'lod'+asset.lod+'-'+evidence.view+'.png');
        await writeFile(file,Buffer.from(evidence.dataUrl.split(',')[1],'base64'));delete evidence.dataUrl;evidence.path=file;evidence.sha256=asset.sha256;
      }
      report.lods.push({lod:asset.lod,path:asset.path,snapshot:asset.snapshot,sha256:asset.sha256,bytes:asset.bytes.length,
        ...data,summary:data.status==='pass'?summarizeWalk(data):null});
    }
    report.status=report.lods.every(l=>l.status==='pass')?'pass':'fail';
  }catch(error){report.errors.push(String(error?.stack??error));}finally{await browser.close();}
  const file=path.join(out,'walk-qa.json');await writeFile(file,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,path:file,lods:report.lods.map(l=>({lod:l.lod,sha256:l.sha256,status:l.status,
    feet:Object.fromEntries(Object.entries(l.feet).map(([s,f])=>[s,{weightedVertexCount:f.weightedVertexCount,soleVertexCount:f.soleVertexCount,heelVertexCount:f.heelVertexCount,toeVertexCount:f.toeVertexCount,soleRestAabb:f.soleRestAabb}])),
    summary:l.summary,errors:l.errors})),errors:report.errors},null,2));
  return report.status==='pass'?0:1;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)process.exitCode=await main();
