/** Staged visual diagnostic, not a natural-gameplay or art-acceptance test.
 * Uses the published registry, actual stepGame and Battlefield.render. The
 * fixture is 1v1 by default or four attackers against one hold target with --group;
 * no damage, animation pose, HP or range is injected.
 * Run: node --import tsx tests/manual/rts-melee-contact.ts OUTPUT_DIRECTORY [--group]
 */
import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {GUARD_MOTION,UNITS} from '../../src/scripts/games/rts/catalog';

const folder=process.argv[2];if(!folder)throw new Error('Expected output directory');
const groupMode=process.argv.includes('--group');
await mkdir(folder,{recursive:true});
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const registryBytes=await readFile('public/assets/games/rts/model-registry.json');
const registry=JSON.parse(registryBytes.toString('utf8'));
const entry=registry.assets.guard;
const assets=await Promise.all([entry.url,entry.lod1].filter(Boolean).map(async(url:string)=>({url,sha256:hash(await readFile('public'+url))})));
const candidateArg=process.argv.indexOf('--candidate-dir'),candidateDir=candidateArg>=0?process.argv[candidateArg+1]:undefined;
if(candidateArg>=0&&!candidateDir)throw new Error('--candidate-dir requires a frozen GLB directory');
const candidateOverrides=new Map<string,{path:string;bytes:Buffer;sha256:string}>();
if(candidateDir){
  if(!entry.lod1)throw new Error('Candidate override requires both published guard LOD URLs');
  for(const [url,name] of [[entry.url,'original-guard-assembly-lod0.glb'],[entry.lod1,'original-guard-assembly-lod1.glb']] as const){
    const path=join(candidateDir,name),bytes=await readFile(path);candidateOverrides.set(url,{path,bytes,sha256:hash(bytes)});
  }
}
const servedAssets=assets.map(asset=>({url:asset.url,sourceSha256:asset.sha256,mode:candidateOverrides.has(asset.url)?'frozen candidate route':'published public model',...(candidateOverrides.has(asset.url)?{sourcePath:candidateOverrides.get(asset.url)!.path,servedSha256:candidateOverrides.get(asset.url)!.sha256}:{servedSha256:asset.sha256})}));
const provenance={head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),fixtureSha256:hash(await readFile('tests/manual/rts-melee-contact.ts')),registrySha256:hash(registryBytes)};
const browser=await chromium.launch({channel:'chromium',headless:true,args:['--enable-gpu','--force_high_performance_gpu']});
try{
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors:string[]=[],abortedViteDeps:Array<{path:string;url:string;error:string}>=[],abortedRequests:Array<{url:string;error:string}>=[];
  const successfulViteDepPaths=new Set<string>(),networkActivity:Array<{url:string;method:string;status?:number;finished?:boolean;failure?:string}>=[];
  const responses:Array<Promise<{url:string;sha256:string}>>=[];let registryResponse:Promise<string>|undefined;
  for(const [url,candidate] of candidateOverrides)await page.route('**'+url,route=>route.fulfill({status:200,contentType:'model/gltf-binary',body:candidate.bytes}));
  const recordFor=(url:string)=>[...networkActivity].reverse().find(item=>item.url===url&&!item.finished&&!item.failure);
  page.on('request',request=>networkActivity.push({url:request.url(),method:request.method()}));
  page.on('response',response=>{const record=recordFor(response.url());if(record)record.status=response.status();const url=new URL(response.url()).pathname;if(url==='/assets/games/rts/model-registry.json')registryResponse=response.text();if(url.startsWith('/node_modules/.vite/deps/')&&response.status()<400)successfulViteDepPaths.add(url);if(assets.some(asset=>asset.url===url))responses.push(response.body().then(bytes=>({url,sha256:hash(bytes)})));});
  page.on('requestfinished',request=>{const record=recordFor(request.url());if(record)record.finished=true;});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('requestfailed',request=>{const url=request.url(),path=new URL(url).pathname,error=request.failure()?.errorText??'unknown',record=recordFor(url);if(record)record.failure=error;if(error==='net::ERR_ABORTED'){abortedRequests.push({url,error});if(path.startsWith('/node_modules/.vite/deps/'))abortedViteDeps.push({path,url,error});}else errors.push('requestfailed '+url+': '+error);});
  page.on('response',response=>{if(response.status()>=400)errors.push('HTTP '+response.status()+' '+response.url());});
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`${process.env.RTS_BASE_URL??'http://127.0.0.1:4321'}/games/rts`);await page.waitForLoadState('networkidle');
  // Native ES module text avoids tsx's __name helpers in browser serialization.
  const fixtureModule=`
    const mainPath='/src/scripts/games/rts/main.ts';
    const source=await(await fetch(mainPath)).text();
    const scenePath=source.match(new RegExp('from "([^\"]*scene[.]ts[^\"]*)"'))[1];
    const {Battlefield}=await import(scenePath),{mountRts}=await import(mainPath);
    const {createGame,stepGame}=await import('/src/scripts/games/rts/simulation.ts');
    const {addUnit,distanceToEntity}=await import('/src/scripts/games/rts/state.ts');
    const {updateVisibility,getTeamView}=await import('/src/scripts/games/rts/visibility.ts');
    const {UNITS}=await import('/src/scripts/games/rts/catalog.ts');
    const loadTrace=[];window.rtsLoadTrace=loadTrace;
    const modelsPath=source.match(new RegExp('from "([^\"]*models[.]ts[^\"]*)"'))[1];
    const {ModelLibrary}=await import(modelsPath),originalModelLoad=ModelLibrary.prototype.load;
    const libraryIds=new WeakMap();let nextLibraryId=1;
    ModelLibrary.prototype.load=async function(progress,map){
      let libraryId=libraryIds.get(this);if(!libraryId){libraryId=nextLibraryId++;libraryIds.set(this,libraryId);}
      loadTrace.push({event:'start',libraryId,libraryGeneration:this.generation,map,timeOrigin:performance.timeOrigin});
      try{const result=await originalModelLoad.call(this,(n,total)=>{loadTrace.push({event:'progress',libraryId,libraryGeneration:this.generation,n,total,statusConnected:document.getElementById('rts-load-status')?.isConnected,timeOrigin:performance.timeOrigin});progress(n,total);},map);loadTrace.push({event:'done',libraryId,libraryGeneration:this.generation,timeOrigin:performance.timeOrigin});return result;}
      catch(error){loadTrace.push({event:'error',libraryId,libraryGeneration:this.generation,error:String(error),timeOrigin:performance.timeOrigin});throw error;}
    };
    const groupMode=${groupMode};
    const audit={state:null,field:null,attacker:null,target:null,attackers:[],targets:[],samples:[]};window.meleeContactAudit=audit;
    const render=Battlefield.prototype.render;
    Battlefield.prototype.render=function(view,dt,alpha){audit.field=this;return render.call(this,view,dt,alpha);};
    const old=document.getElementById('rts'),root=old.cloneNode(true);old.replaceWith(root);
    mountRts(root,(map,seed)=>{
      const state=createGame(map,seed);state.aiEnabled=[false,false];
      state.entities=state.entities.filter(e=>e.category==='building');
      const attackers=[],targets=[];
      const target=addUnit(state,1,'guard',{x:26,z:48+UNITS.guard.radius+UNITS.guard.range-.001});
      target.order={type:'hold'};target.cooldown=1000;target.facing=Math.PI;targets.push(target);
      const starts=groupMode?[{x:24.5,z:48},{x:25.5,z:48},{x:26.5,z:48},{x:27.5,z:48}]:[{x:26,z:48}];
      for(const position of starts){
        const attacker=addUnit(state,0,'guard',position);attacker.order={type:'attack',targetId:target.id};attacker.facing=0;attackers.push(attacker);
      }
      const attacker=attackers[0];
      state.paused=true;updateVisibility(state);Object.assign(audit,{state,attacker,target,attackers,targets});return state;
    });
    const projectedBounds=(root,origin,direction,swordOnly)=>{
      root.updateWorldMatrix(true,true);let min=Infinity,max=-Infinity,vertices=0;const meshes=[];
      const bounds={min:{x:Infinity,y:Infinity,z:Infinity},max:{x:-Infinity,y:-Infinity,z:-Infinity}};
      root.traverseVisible(mesh=>{
        if(!mesh.isMesh||swordOnly&&!/Sword/i.test(mesh.name))return;
        if(mesh.isSkinnedMesh)mesh.skeleton.update();
        const point=root.position.clone(),count=mesh.geometry.attributes.position.count;
        for(let i=0;i<count;i++){
          mesh.getVertexPosition(i,point).applyMatrix4(mesh.matrixWorld);
          const forward=(point.x-origin.x)*direction.x+(point.z-origin.z)*direction.z;
          if(!Number.isFinite(forward))throw new Error('Nonfinite deformed vertex');
          min=Math.min(min,forward);max=Math.max(max,forward);vertices++;
          bounds.min.x=Math.min(bounds.min.x,point.x);bounds.min.y=Math.min(bounds.min.y,point.y);bounds.min.z=Math.min(bounds.min.z,point.z);
          bounds.max.x=Math.max(bounds.max.x,point.x);bounds.max.y=Math.max(bounds.max.y,point.y);bounds.max.z=Math.max(bounds.max.z,point.z);
        }
        meshes.push({name:mesh.name,vertices:count});
      });
      if(vertices<3)throw new Error('Missing visible mesh geometry');
      return {min,max,vertices,meshes,bounds};
    };
    const pointTriangleDistanceSquared=(p,a,b,c)=>{
      const ab=b.clone().sub(a),ac=c.clone().sub(a),ap=p.clone().sub(a),d1=ab.dot(ap),d2=ac.dot(ap);
      if(d1<=0&&d2<=0)return p.distanceToSquared(a);
      const bp=p.clone().sub(b),d3=ab.dot(bp),d4=ac.dot(bp);
      if(d3>=0&&d4<=d3)return p.distanceToSquared(b);
      const vc=d1*d4-d3*d2;
      if(vc<=0&&d1>=0&&d3<=0)return p.distanceToSquared(a.clone().addScaledVector(ab,d1/(d1-d3)));
      const cp=p.clone().sub(c),d5=ab.dot(cp),d6=ac.dot(cp);
      if(d6>=0&&d5<=d6)return p.distanceToSquared(c);
      const vb=d5*d2-d1*d6;
      if(vb<=0&&d2>=0&&d6<=0)return p.distanceToSquared(a.clone().addScaledVector(ac,d2/(d2-d6)));
      const va=d3*d6-d5*d4;
      if(va<=0&&(d4-d3)>=0&&(d5-d6)>=0)return p.distanceToSquared(b.clone().addScaledVector(c.clone().sub(b),(d4-d3)/((d4-d3)+(d5-d6))));
      const denominator=1/(va+vb+vc),v=vb*denominator,w=vc*denominator;
      return p.distanceToSquared(a.clone().addScaledVector(ab,v).addScaledVector(ac,w));
    };
    const sampledSurfaceDistance=(swordRoot,targetRoot)=>{
      const swordPoints=[],targetTriangles=[],scratch=swordRoot.position.clone(),stride=32;
      swordRoot.updateWorldMatrix(true,true);targetRoot.updateWorldMatrix(true,true);
      swordRoot.traverseVisible(mesh=>{
        if(!mesh.isMesh||!/Sword/i.test(mesh.name))return;
        if(mesh.isSkinnedMesh)mesh.skeleton.update();
        const count=mesh.geometry.attributes.position.count;
        for(let i=0;i<count;i+=stride)swordPoints.push(mesh.getVertexPosition(i,scratch).clone().applyMatrix4(mesh.matrixWorld));
      });
      targetRoot.traverseVisible(mesh=>{
        if(!mesh.isMesh)return;
        if(mesh.isSkinnedMesh)mesh.skeleton.update();
        const geometry=mesh.geometry,position=geometry.attributes.position,index=geometry.index,count=index?index.count:position.count;
        const vertex=(i)=>mesh.getVertexPosition(index?index.getX(i):i,scratch).clone().applyMatrix4(mesh.matrixWorld);
        for(let i=0;i+2<count;i+=stride*3)targetTriangles.push([vertex(i),vertex(i+1),vertex(i+2)]);
      });
      if(!swordPoints.length||!targetTriangles.length)throw new Error('Missing sword or target triangles for 3D contact check');
      let minDistanceSquared=Infinity;
      for(const point of swordPoints)for(const triangle of targetTriangles)minDistanceSquared=Math.min(minDistanceSquared,pointTriangleDistanceSquared(point,...triangle));
      return {minDistance:Math.sqrt(minDistanceSquared),method:'sampled deformed sword vertices to sampled deformed target triangles',swordPointStride:stride,targetTriangleStride:stride};
    };
    const deformedSurface=(root,swordOnly)=>{
      root.updateMatrixWorld(true);const vertices=[],vertexOwners=[],triangles=[],scratch=root.position.clone();
      root.traverseVisible(mesh=>{
        if(!mesh.isMesh||(swordOnly?!/Sword/i.test(mesh.name):/Sword/i.test(mesh.name)))return;
        if(mesh.isSkinnedMesh)mesh.skeleton.update();
        const position=mesh.geometry.attributes.position,count=position.count,world=[];
        for(let i=0;i<count;i++){world.push(mesh.getVertexPosition(i,scratch).clone().applyMatrix4(mesh.matrixWorld));vertexOwners.push({mesh:mesh.name,vertex:i});}
        vertices.push(...world);
        const index=mesh.geometry.index,total=index?index.count:count;
        for(let i=0;i+2<total;i+=3){
          const indices=[index?index.getX(i):i,index?index.getX(i+1):i+1,index?index.getX(i+2):i+2],a=world[indices[0]],b=world[indices[1]],c=world[indices[2]];
          triangles.push({a,b,c,mesh:mesh.name,indices,min:{x:Math.min(a.x,b.x,c.x),y:Math.min(a.y,b.y,c.y),z:Math.min(a.z,b.z,c.z)},max:{x:Math.max(a.x,b.x,c.x),y:Math.max(a.y,b.y,c.y),z:Math.max(a.z,b.z,c.z)}});
        }
      });
      return {vertices,vertexOwners,triangles};
    };
    const pointBoxDistanceSquared=(p,box)=>{const dx=Math.max(box.min.x-p.x,0,p.x-box.max.x),dy=Math.max(box.min.y-p.y,0,p.y-box.max.y),dz=Math.max(box.min.z-p.z,0,p.z-box.max.z);return dx*dx+dy*dy+dz*dz;};
    const closestPointOnTriangle=(p,a,b,c)=>{
      const ab=b.clone().sub(a),ac=c.clone().sub(a),ap=p.clone().sub(a),d1=ab.dot(ap),d2=ac.dot(ap);
      if(d1<=0&&d2<=0)return a.clone();
      const bp=p.clone().sub(b),d3=ab.dot(bp),d4=ac.dot(bp);
      if(d3>=0&&d4<=d3)return b.clone();
      const vc=d1*d4-d3*d2;
      if(vc<=0&&d1>=0&&d3<=0)return a.clone().addScaledVector(ab,d1/(d1-d3));
      const cp=p.clone().sub(c),d5=ab.dot(cp),d6=ac.dot(cp);
      if(d6>=0&&d5<=d6)return c.clone();
      const vb=d5*d2-d1*d6;
      if(vb<=0&&d2>=0&&d6<=0)return a.clone().addScaledVector(ac,d2/(d2-d6));
      const va=d3*d6-d5*d4;
      if(va<=0&&(d4-d3)>=0&&(d5-d6)>=0)return b.clone().addScaledVector(c.clone().sub(b),(d4-d3)/((d4-d3)+(d5-d6)));
      const denominator=1/(va+vb+vc),v=vb*denominator,w=vc*denominator;
      return a.clone().addScaledVector(ab,v).addScaledVector(ac,w);
    };
    const fullVertexFaceDistance=(a,b)=>{
      let minDistanceSquared=Infinity,checks=0,closestPair=null;
      const direction=(vertices,owners,triangles,sourceRole)=>{for(let i=0;i<vertices.length;i++)for(const triangle of triangles){if(pointBoxDistanceSquared(vertices[i],triangle)>=minDistanceSquared)continue;checks++;const nearest=closestPointOnTriangle(vertices[i],triangle.a,triangle.b,triangle.c),distance=vertices[i].distanceToSquared(nearest);if(distance<minDistanceSquared){minDistanceSquared=distance;closestPair=sourceRole==='sword-vertex'?{swordMesh:owners[i].mesh,swordVertex:owners[i].vertex,targetMesh:triangle.mesh,targetTriangle:triangle.indices,swordWorld:vertices[i].toArray(),targetWorld:nearest.toArray()}:{targetMesh:owners[i].mesh,targetVertex:owners[i].vertex,swordMesh:triangle.mesh,swordTriangle:triangle.indices,targetWorld:vertices[i].toArray(),swordWorld:nearest.toArray()};}}};
      direction(a.vertices,a.vertexOwners,b.triangles,'sword-vertex');direction(b.vertices,b.vertexOwners,a.triangles,'target-vertex');
      return {minimumVertexFaceDistanceMeters:Math.sqrt(minDistanceSquared),closestPair,vertexCounts:[a.vertices.length,b.vertices.length],triangleCounts:[a.triangles.length,b.triangles.length],narrowPhaseChecks:checks,method:'all deformed sword vertices against every defender triangle and all defender vertices against every sword triangle; triangle AABB broad-phase'};
    };
    const triangleAabbDistanceSquared=(a,b)=>{const dx=Math.max(a.min.x-b.max.x,b.min.x-a.max.x,0),dy=Math.max(a.min.y-b.max.y,b.min.y-a.max.y,0),dz=Math.max(a.min.z-b.max.z,b.min.z-a.max.z,0);return dx*dx+dy*dy+dz*dz;};
    const segmentTriangleIntersection=(p0,p1,triangle)=>{
      const direction=p1.clone().sub(p0),edge1=triangle.b.clone().sub(triangle.a),edge2=triangle.c.clone().sub(triangle.a),h=direction.clone().cross(edge2),det=edge1.dot(h);
      if(Math.abs(det)<1e-10)return null;
      const inv=1/det,s=p0.clone().sub(triangle.a),u=s.dot(h)*inv;if(u<0||u>1)return null;
      const q=s.clone().cross(edge1),v=direction.dot(q)*inv;if(v<0||u+v>1)return null;
      const t=edge2.dot(q)*inv;if(t<0||t>1)return null;
      return p0.clone().addScaledVector(direction,t);
    };
    const segmentSegmentClosest=(p1,q1,p2,q2)=>{
      const d1=q1.clone().sub(p1),d2=q2.clone().sub(p2),r=p1.clone().sub(p2),a=d1.dot(d1),e=d2.dot(d2),f=d2.dot(r);let s=0,t=0;
      if(a<=1e-12&&e<=1e-12)return {a:p1.clone(),b:p2.clone()};
      if(a<=1e-12)t=Math.max(0,Math.min(1,f/e));
      else{const c=d1.dot(r);if(e<=1e-12)s=Math.max(0,Math.min(1,-c/a));else{const b=d1.dot(d2),denom=a*e-b*b;s=denom!==0?Math.max(0,Math.min(1,(b*f-c*e)/denom)):0;t=(b*s+f)/e;if(t<0){t=0;s=Math.max(0,Math.min(1,-c/a));}else if(t>1){t=1;s=Math.max(0,Math.min(1,(b-c)/a));}}}
      return {a:p1.clone().addScaledVector(d1,s),b:p2.clone().addScaledVector(d2,t)};
    };
    const triangleSurfaceClosest=(a,b)=>{
      const edgesA=[[a.a,a.b],[a.b,a.c],[a.c,a.a]],edgesB=[[b.a,b.b],[b.b,b.c],[b.c,b.a]],verticesA=[a.a,a.b,a.c],verticesB=[b.a,b.b,b.c];let best={distanceSquared:Infinity,a:null,b:null,method:''};
      for(const [p,q] of edgesA){const hit=segmentTriangleIntersection(p,q,b);if(hit)return {distanceSquared:0,a:hit,b:hit,method:'segment-triangle intersection'};}
      for(const [p,q] of edgesB){const hit=segmentTriangleIntersection(p,q,a);if(hit)return {distanceSquared:0,a:hit,b:hit,method:'segment-triangle intersection'};}
      const consider=(pa,pb,method)=>{const distanceSquared=pa.distanceToSquared(pb);if(distanceSquared<best.distanceSquared)best={distanceSquared,a:pa,b:pb,method};};
      for(const p of verticesA)consider(p,closestPointOnTriangle(p,b.a,b.b,b.c),'vertex-face');
      for(const p of verticesB)consider(closestPointOnTriangle(p,a.a,a.b,a.c),p,'vertex-face');
      for(const [a0,a1] of edgesA)for(const [b0,b1] of edgesB){const pair=segmentSegmentClosest(a0,a1,b0,b1);consider(pair.a,pair.b,'edge-edge');}
      return best;
    };
    const triangleSurfaceDistance=(sword,target)=>{
      let best={distanceSquared:Infinity,closestPair:null,trianglePairsConsidered:0,aabbPairsSkipped:0};
      for(const swordTriangle of sword.triangles)for(const targetTriangle of target.triangles){
        if(triangleAabbDistanceSquared(swordTriangle,targetTriangle)>=best.distanceSquared){best.aabbPairsSkipped++;continue;}
        best.trianglePairsConsidered++;const pair=triangleSurfaceClosest(swordTriangle,targetTriangle);
        if(pair.distanceSquared<best.distanceSquared)best={distanceSquared:pair.distanceSquared,trianglePairsConsidered:best.trianglePairsConsidered,aabbPairsSkipped:best.aabbPairsSkipped,closestPair:{swordMesh:swordTriangle.mesh,swordTriangle:swordTriangle.indices,targetMesh:targetTriangle.mesh,targetTriangle:targetTriangle.indices,swordWorld:pair.a.toArray(),targetWorld:pair.b.toArray(),method:pair.method}};
      }
      return {minimumTriangleSurfaceDistanceMeters:Math.sqrt(best.distanceSquared),closestPair:best.closestPair,triangleCounts:[sword.triangles.length,target.triangles.length],trianglePairsConsidered:best.trianglePairsConsidered,aabbPairsSkipped:best.aabbPairsSkipped,method:'full triangle-triangle distance; segment-triangle intersections, vertex-face and edge-edge closest points with world AABB broadphase'};
    };
    const geometryFixtureValidation=()=>{
      const V=(x,y,z)=>audit.field.renderer?new audit.field.camera.position.constructor(x,y,z):null;
      const crossing=triangleSurfaceClosest({a:V(0,0,0),b:V(2,0,0),c:V(0,2,0)},{a:V(.5,.5,-1),b:V(.5,.5,1),c:V(1,.5,1)});
      const parallel=triangleSurfaceClosest({a:V(0,0,0),b:V(1,0,0),c:V(0,1,0)},{a:V(0,0,2),b:V(1,0,2),c:V(0,1,2)});
      const skew=segmentSegmentClosest(V(0,0,0),V(1,0,0),V(.5,-1,1),V(.5,1,1));
      return {crossing:Math.sqrt(crossing.distanceSquared),parallel:Math.sqrt(parallel.distanceSquared),skew:Math.sqrt(skew.a.distanceToSquared(skew.b))};
    };
    audit.geometryFixtureValidation=geometryFixtureValidation;
    audit.fineSurfaceDistance=(attackerId)=>{const sword=deformedSurface(audit.field.models.get(attackerId).instance.root,true),target=deformedSurface(audit.field.models.get(audit.target.id).instance.root,false);return {...fullVertexFaceDistance(sword,target),...triangleSurfaceDistance(sword,target)};};
    audit.cloneClipInterval=(attackerId,startElapsed,endElapsed,step)=>{
      const field=audit.field,unit=audit.attackers.find((item)=>item.id===attackerId),source=field.models.get(attackerId).instance,targetRoot=field.models.get(audit.target.id).instance.root;
      field.scene.updateMatrixWorld(true);
      const target=deformedSurface(targetRoot,false),probe=field.library.instantiate('guard',unit.team),samples=[];
      probe.root.position.copy(source.root.position);probe.root.quaternion.copy(source.root.quaternion);probe.root.scale.copy(source.root.scale);field.scene.add(probe.root);field.scene.updateMatrixWorld(true);
      const motion=source.motion,elapsedValues=new Set([motion.attack.contactSeconds]);for(let elapsed=startElapsed;elapsed<endElapsed+step*.25;elapsed+=step)elapsedValues.add(Math.min(endElapsed,elapsed));elapsedValues.add(endElapsed);
      for(const elapsed of [...elapsedValues].sort((a,b)=>a-b)){
        probe.animate('attack',0,{sequence:991,elapsed},0);field.scene.updateMatrixWorld(true);
        const result=triangleSurfaceDistance(deformedSurface(probe.root,true),target);
        samples.push({elapsed,minimumTriangleSurfaceDistanceMeters:result.minimumTriangleSurfaceDistanceMeters,closestPair:result.closestPair,trianglePairsConsidered:result.trianglePairsConsidered});
      }
      const liveSword=deformedSurface(source.root,true),cloneSword=deformedSurface(probe.root,true);if(liveSword.vertices.length!==cloneSword.vertices.length)throw new Error('Clone/live Sword vertex count mismatch');let maxVertexDeviation=0,sumVertexDeviationSquared=0;for(let i=0;i<liveSword.vertices.length;i++){const deviation=liveSword.vertices[i].distanceTo(cloneSword.vertices[i]);maxVertexDeviation=Math.max(maxVertexDeviation,deviation);sumVertexDeviationSquared+=deviation*deviation;}const poseComparison={liveActionTime:source.variants.find((v)=>v.root.visible)?.action?.time,cloneActionTime:probe.variants.find((v)=>v.root.visible)?.action?.time,vertexCount:liveSword.vertices.length,maxWorldVertexDeviationMeters:maxVertexDeviation,rmsWorldVertexDeviationMeters:Math.sqrt(sumVertexDeviationSquared/liveSword.vertices.length)};
      probe.dispose();return {attackerId,targetId:audit.target.id,worldTransform:{x:source.root.position.x,y:source.root.position.y,z:source.root.position.z,facing:unit.facing,rotationY:source.root.rotation.y,scale:source.root.scale.toArray(),probePosition:probe.root.position.toArray(),probeMatrixWorld:probe.root.matrixWorld.elements},poseComparison,clip:motion.attack.clip,authoredContactSeconds:motion.attack.contactSeconds,interval:{startElapsed,endElapsed,sampleStepSeconds:step,sampleCount:samples.length},samples,minimum:samples.reduce((best,item)=>item.minimumTriangleSurfaceDistanceMeters<best.minimumTriangleSurfaceDistanceMeters?item:best,samples[0])};
    };
    audit.sample=()=>{
      const {state,attacker,target,field}=audit;
      const attackerVisual=field.models.get(attacker.id),targetVisual=field.models.get(target.id);
      const direction={x:Math.sin(attacker.facing),z:Math.cos(attacker.facing)};
      const sword=projectedBounds(attackerVisual.instance.root,attacker,direction,true);
      const targetAllGeometry=projectedBounds(targetVisual.instance.root,attacker,direction,false);
      const clips=attackerVisual.instance.variants.map(v=>({visible:v.root.visible,name:v.action?.getClip().name,time:v.action?.time,weight:v.action?.getEffectiveWeight()}));
      const motion={instance:attackerVisual.instance.motion,variants:attackerVisual.instance.variants.map(v=>v.motion)};
      const surfaceDistance3d=sampledSurfaceDistance(attackerVisual.instance.root,targetVisual.instance.root);
      const a=sword.bounds,b=targetAllGeometry.bounds;
      const aabbOverlap3d={x:Math.min(a.max.x,b.max.x)-Math.max(a.min.x,b.min.x),y:Math.min(a.max.y,b.max.y)-Math.max(a.min.y,b.min.y),z:Math.min(a.max.z,b.max.z)-Math.max(a.min.z,b.min.z)};
      const pairs=audit.attackers.map(unit=>{const foe=audit.targets[0],nearestAllyGap=Math.min(Infinity,...audit.attackers.filter(other=>other.id!==unit.id).map(other=>Math.hypot(unit.x-other.x,unit.z-other.z)-UNITS.guard.radius*2));return {unitId:unit.id,targetId:foe.id,x:unit.x,z:unit.z,targetX:foe.x,targetZ:foe.z,hp:foe.hp,inRange:distanceToEntity(unit,foe)<=UNITS.guard.range,engagedTargetId:unit.engagedTargetId,animation:unit.animation,cooldown:unit.cooldown,attackSequence:unit.attackSequence,attackContactSequence:unit.attackContactSequence,attackCue:unit.attackCue?{...unit.attackCue}:undefined,pathLength:unit.path.length,pathGoal:unit.pathGoal,blockedTime:unit.blockedTime,nearestAllyGap,unreachableTargets:unit.unreachableTargets?.map(r=>({id:r.id,revision:r.revision}))??[]};});
      const sample={tick:state.tick,time:state.time,hp:target.hp,range:UNITS.guard.range,attacker:{x:attacker.x,z:attacker.z,animation:attacker.animation,facing:attacker.facing,cooldown:attacker.cooldown},pairs,surfaceDistance:distanceToEntity(attacker,target),sword,targetAllGeometry,projectedGap:targetAllGeometry.min-sword.max,surfaceDistance3d,aabbOverlap3d,motion,clips};
      audit.samples.push(sample);return sample;
    };
    audit.advance=()=>{
      audit.state.paused=false;stepGame(audit.state);audit.state.paused=true;
      render.call(audit.field,getTeamView(audit.state,0),.05);return audit.sample();
    };
  `;
  await writeFile(`${folder}/fixture-injected.js`,fixtureModule);
  await page.addScriptTag({type:'module',content:fixtureModule});
  try{await page.waitForFunction(()=>!!(window as any).meleeContactAudit,undefined,{timeout:10000});}
  catch(error){const diagnostic={status:'fixture-module-not-installed',error:String(error),errors,networkActivity,bodyText:(await page.locator('body').innerText()).slice(0,3000)};await writeFile(`${folder}/fixture-install-diagnostics.json`,JSON.stringify(diagnostic,null,2)+'\n');throw error;}
  await page.locator('#rts-start').click();
  try{await page.locator('#rts-battle').waitFor({state:'visible',timeout:15000});}
  catch(error){const diagnostics={status:'startup-failed',startupFailure:String(error),errors,battleClass:await page.locator('#rts-battle').getAttribute('class'),bodyText:(await page.locator('body').innerText()).slice(0,5000),loadStatus:await page.locator('#rts-load-status').innerText(),visibleAlerts:await page.locator('[role=alert]').allInnerTexts(),loadTrace:await page.evaluate(()=>(window as any).rtsLoadTrace??[]),registryResponseBody:registryResponse?await registryResponse:undefined,abortedViteDeps,successfulViteDepPaths:[...successfulViteDepPaths],networkActivity,pendingRequests:networkActivity.filter(item=>!item.finished&&!item.failure)};await writeFile(`${folder}/startup-diagnostics.json`,JSON.stringify(diagnostics,null,2)+'\n');console.log(JSON.stringify(diagnostics,null,2));throw error;}
  try{await page.waitForFunction(()=>{const a=(window as any).meleeContactAudit;return a?.attackers?.every((u:any)=>a.field?.models?.has(u.id))&&a.targets?.every((u:any)=>a.field?.models?.has(u.id));});}
  catch(error){const diagnostic=await page.evaluate(()=>{const a=(window as any).meleeContactAudit;return {fieldExists:!!a?.field,attackerIds:a?.attackers?.map((u:any)=>u.id),targetIds:a?.targets?.map((u:any)=>u.id),modelIds:a?.field?[...a.field.models.keys()]:[],loadTrace:(window as any).rtsLoadTrace,bodyText:document.body.innerText.slice(0,3000)};});await page.screenshot({path:`${folder}/runtime-wait-failure.png`});await writeFile(`${folder}/runtime-diagnostics.json`,JSON.stringify({status:'runtime-model-wait-failed',error:String(error),diagnostic,networkActivity},null,2)+'\n');throw error;}
  await page.evaluate(()=>{
    const a=(window as any).meleeContactAudit,f=a.field,mid=(a.attacker.z+a.target.z)/2;
    f.span=4.5;f.focus({x:26,z:mid});f.camera.position.set(35,4.8,mid+1);f.camera.lookAt(26,.9,mid);f.camera.updateMatrixWorld();
    // Isolate the two real runtime models for readable screenshots. This only
    // hides unrelated scenery/resources/buildings immediately before drawing;
    // it never changes the simulation, unit geometry, transforms or animation.
    const draw=f.renderer.render.bind(f.renderer);f.renderer.render=(scene:any,camera:any)=>{
      if(scene===f.scene){
        f.scenery.root.visible=false;
        for(const p of f.props)p.instance.root.visible=false;
        for(const instance of f.resources.values())instance.root.visible=false;
        const keep=new Set([...a.attackers,...a.targets].map((unit:any)=>unit.id));
        for(const [id,visual] of f.models)if(!keep.has(id))visual.instance.root.visible=false;
      }
      return draw(scene,camera);
    };
  });
  const initial=await page.evaluate(()=>(window as any).meleeContactAudit.sample());
  const geometryFixtures=await page.evaluate(()=>(window as any).meleeContactAudit.geometryFixtureValidation());
  expect(initial.hp).toBeGreaterThan(0);
  if(groupMode){expect(initial.pairs).toHaveLength(4);expect(initial.pairs.every((p:any)=>Math.hypot(p.x-p.targetX,p.z-p.targetZ)-UNITS.guard.radius>initial.range)).toBe(true);}
  else expect(initial.surfaceDistance).toBeCloseTo(initial.range-.001,6);
  await page.screenshot({path:`${folder}/before.png`});
  await writeFile(`${folder}/initial-runtime.json`,JSON.stringify({initial,servedAssets,expectedMotion:GUARD_MOTION,errors},null,2)+'\n');
  expect(initial.motion.instance).toEqual(GUARD_MOTION);
  expect(initial.motion.variants).toHaveLength(2);
  for(const lodMotion of initial.motion.variants)expect(lodMotion).toEqual(GUARD_MOTION);
  let firstDamage:any;const cloneIntervalDiagnostics=[] as unknown[];
  const lastContactSequence=new Map(initial.pairs.map((pair:any)=>[pair.unitId,pair.attackContactSequence]));
  // Exact 20 Hz increments. The live page remains paused between samples, so
  // screenshots and machine speed cannot advance either simulation or mixers.
  for(let tick=1;tick<=28;tick++){
    const sample=await page.evaluate(()=>(window as any).meleeContactAudit.advance());
    for(const pair of sample.pairs){
      if(pair.attackContactSequence!==undefined&&pair.attackContactSequence!==lastContactSequence.get(pair.unitId)){
        pair.fullVertexFaceDistance3d=await page.evaluate((unitId)=>(window as any).meleeContactAudit.fineSurfaceDistance(unitId),pair.unitId);
        await page.evaluate(({tick,unitId,metrics})=>{const audit=(window as any).meleeContactAudit,sample=audit.samples.find((item:any)=>item.tick===tick),tracked=sample?.pairs.find((item:any)=>item.unitId===unitId);if(!tracked)throw new Error(`Missing shared contact sample for unit ${unitId} at tick ${tick}`);tracked.fullVertexFaceDistance3d=metrics;},{tick:sample.tick,unitId:pair.unitId,metrics:pair.fullVertexFaceDistance3d});
        // Diagnose one attack at the live contact tick itself. The clone is
        // read-only and runs over identical world transforms; this validates the
        // authored contact frame and the preceding 50 ms without advancing live state.
        if(cloneIntervalDiagnostics.length===0&&(!groupMode||pair.fullVertexFaceDistance3d.minimumTriangleSurfaceDistanceMeters>.001)){
          const elapsed=sample.time-(pair.attackCue?.startedAt??sample.time);
          const scans=[{purpose:'damage-tick interval',start:elapsed-.05,end:elapsed,step:1/240},{purpose:'coarse authored attack window',start:.3,end:.7,step:1/30}];
          for(const scan of scans){
            const diagnostic=await page.evaluate(({unitId,start,end,step})=>(window as any).meleeContactAudit.cloneClipInterval(unitId,start,end,step),{unitId:pair.unitId,start:scan.start,end:scan.end,step:scan.step});
            cloneIntervalDiagnostics.push({sequence:pair.attackContactSequence,startedAt:pair.attackCue?.startedAt??null,simTime:sample.time,damageTick:sample.tick,liveWorldAtDamageTick:true,scanPurpose:scan.purpose,...diagnostic});
          }
        }
        lastContactSequence.set(pair.unitId,pair.attackContactSequence);
      }
    }
    if(!firstDamage&&sample.hp<initial.hp){sample.fullVertexFaceDistance3d=sample.pairs.find((pair:any)=>pair.fullVertexFaceDistance3d)?.fullVertexFaceDistance3d??null;firstDamage=sample;await page.screenshot({path:`${folder}/first-damage.png`});}
    if([6,11,16,21,24].includes(tick))await page.screenshot({path:`${folder}/tick-${tick}.png`});
  }
  const samples=await page.evaluate(()=>(window as any).meleeContactAudit.samples);
  const browserAssets=await Promise.all(responses);
  const recoveredAbortedRequests=abortedRequests.filter(abort=>networkActivity.some(item=>item.url===abort.url&&item.finished&&item.status!==undefined&&item.status<400));
  for(const abort of abortedRequests)if(!recoveredAbortedRequests.includes(abort))errors.push(`unreplaced request abort ${abort.url}: ${abort.error}`);
  for(const abort of abortedViteDeps)if(!successfulViteDepPaths.has(abort.path))errors.push(`unreplaced Vite dependency abort ${abort.url}: ${abort.error}`);
  for(const asset of servedAssets)if(browserAssets.find(response=>response.url===asset.url)?.sha256!==asset.servedSha256)errors.push(`served hash mismatch ${asset.url}`);
  const verifiedServedAssets=await Promise.all(servedAssets.map(async asset=>{const candidate=candidateOverrides.get(asset.url),current=hash(await readFile(candidate?.path??'public'+asset.url));if(current!==asset.servedSha256)errors.push(`source hash changed during run ${asset.url}`);return {...asset,sourceStillMatchesAtCompletion:current===asset.servedSha256,currentSha256AtCompletion:current};}));
  const movementDiagnostics=initial.pairs.map((start:any)=>{
    const track=samples.map((sample:any)=>sample.pairs.find((pair:any)=>pair.unitId===start.unitId)).filter(Boolean),radial=track.map((pair:any)=>Math.hypot(pair.x-pair.targetX,pair.z-pair.targetZ));
    return {unitId:start.unitId,totalTravelMeters:track.slice(1).reduce((sum:number,pair:any,index:number)=>sum+Math.hypot(pair.x-track[index].x,pair.z-track[index].z),0),radialDistanceIncreases:radial.slice(1).filter((value:number,index:number)=>value>radial[index]+.05).length,blockedTimePeak:Math.max(...track.map((pair:any)=>pair.blockedTime)),swingStartedAt:[...new Set(track.map((pair:any)=>pair.attackCue?.startedAt).filter((time:any)=>time!==undefined))]};
  });
  const contactStrikes=[] as Array<{unitId:number;targetId:number;sequence:number;startedAt:number;tick:number;time:number;targetHp:number;fullVertexFaceDistance3d?:unknown}>;
  const lastContact=new Map(initial.pairs.map((pair:any)=>[pair.unitId,pair.attackContactSequence]));
  for(const sample of samples.slice(1))for(const pair of sample.pairs){if(pair.attackContactSequence!==undefined&&pair.attackContactSequence!==lastContact.get(pair.unitId)){contactStrikes.push({unitId:pair.unitId,targetId:pair.targetId,sequence:pair.attackContactSequence,startedAt:pair.attackCue?.startedAt??-1,tick:sample.tick,time:sample.time,targetHp:sample.hp,fullVertexFaceDistance3d:pair.fullVertexFaceDistance3d});lastContact.set(pair.unitId,pair.attackContactSequence);}}
  const damageTicks=samples.filter((sample:any,index:number)=>index>0&&sample.hp<samples[index-1].hp).map((sample:any)=>({tick:sample.tick,time:sample.time,hp:sample.hp,strikers:contactStrikes.filter(strike=>strike.tick===sample.tick).map(strike=>({unitId:strike.unitId,targetId:strike.targetId,sequence:strike.sequence}))}));
  const report={
    purpose:'Staged current-runtime melee geometry/timing diagnosis; no natural-win or art approval claim',
    fixture:groupMode?'Four guard attackers explicitly target one hold guard with cooldown=1000; unchanged catalog HP, range, speed and damage; AI disabled; attackers start outside attack range in a close line; 20 Hz steps while paused between samples.':'Two guards, unchanged catalog stats; target hold with cooldown=1000; AI disabled; target starts at catalog melee surface range-.001; simulation manually stepped at 20 Hz while page is paused.',
    candidateScope:candidateDir?'Isolated pre-hand assembly WIP served by Playwright routes over the published guard URLs; no public model file or registry was modified. Results calibrate current blade pose/range only and require rerun against final SHA.':'Published registry assets served without candidate overrides.',
    measurement:'At each new attackContactSequence, CPU-deformed attacker Sword blade triangles are measured against all visible defender body, armor, clothing and shield triangles in world-space 3D; the defender Sword is excluded. Per-tick surfaceDistance3d remains a stride-32 vertex-face upper-bound diagnostic. fullVertexFaceDistance3d reports its exhaustive vertex-face upper bound; minimumTriangleSurfaceDistanceMeters uses full triangle-triangle distance with segment-triangle intersection, vertex-face and edge-edge checks plus world AABB broadphase. projectedGap and AABBs are supporting measures only.',
    geometryAlgorithmFixtures:geometryFixtures,loadTrace:await page.evaluate(()=>(window as any).rtsLoadTrace??[]),networkActivity,provenance,assets,servedAssets:verifiedServedAssets,browserAssets,registryScale:entry.scale??1,registryYaw:entry.yaw??0,errors,abortedRequests,recoveredAbortedRequests,abortedViteDeps,successfulViteDepPaths:[...successfulViteDepPaths],firstDamage:firstDamage??null,damageTicks,contactStrikes,cloneIntervalDiagnostics,movementDiagnostics,
    status:{startup:'passed',geometry:firstDamage?'damage-observed':'no-damage',loading:errors.length?'failed':'passed'},
    minProjectedGap:Math.min(...samples.map((s:any)=>s.projectedGap)),samples,
  };
  await writeFile(`${folder}/contact-diagnostic.json`,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({samples:samples.length,firstDamageTime:firstDamage?.time??null,firstDamageGap:firstDamage?.projectedGap??null,firstDamageSurfaceDistance3d:firstDamage?.surfaceDistance3d.minDistance??null,firstDamageFullVertexFaceUpperBound3d:firstDamage?.fullVertexFaceDistance3d?.minimumVertexFaceDistanceMeters??null,firstDamageTriangleSurfaceDistance3d:firstDamage?.fullVertexFaceDistance3d?.minimumTriangleSurfaceDistanceMeters??null,firstDamageClosestPair:firstDamage?.fullVertexFaceDistance3d?.closestPair??null,geometryFixtures,contactStrikes,cloneIntervalDiagnostics,minProjectedGap:report.minProjectedGap,status:report.status,errors}));
  expect(firstDamage,'fixture must exercise a real melee hit').toBeTruthy();
  expect(samples).toHaveLength(29);
  expect(geometryFixtures).toEqual({crossing:0,parallel:2,skew:1});
  expect(errors).toEqual([]);
}finally{await browser.close();}
