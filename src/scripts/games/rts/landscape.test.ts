import {describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {createMap,groundFrame,PASS_OUTCROPS} from './maps';
import {channelBanks} from './river-layout';
import {canPlace,findPath,isWalkable} from './navigation';
import {roadPaths,terrainMask} from './terrain';
import {layeredGroundMaterial} from './terrain';
import * as THREE from 'three';

const distanceToSegment=(x:number,z:number,a:{x:number;z:number},b:{x:number;z:number})=>{
  const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
  return Math.hypot(x-a.x-t*dx,z-a.z-t*dz);
};

describe('authored map landscapes',()=>{
  it('keeps district footprints and materials stable without moving existing resources or groves',()=>{
    const sha=(v:Uint8Array|string)=>createHash('sha256').update(v).digest('hex');
    // Snapshot of the 180°-symmetric layouts (map symmetry change: east nodes, groves,
    // pass gaps and the river S-bend became twins of the west half).
    // Wood balance added one home grove per seat: only the resource list and the
    // ground mask under it changed; walkability and every tree/rock stayed put.
    // 2026-10-16: intentionally re-snapshotted for the 192×192 re-layout (natural
    // expansions, river ford, wider pass ridge, larger groves, 384² ground mask).
    // 2026-10-16: re-snapshotted again for the 288×288 re-layout (third and centre
    // expansions, ten camps, winding river, funnel chamber, 480² ground mask).
    const before={
      river:['2893c1e04865159e02a974c4a6714ddcb06f07cbd15b73ae2e5cf310f1faf19b','10885674264475da992f0bad2fe03c4936053dd952f3107f60a81208826b3012','efe1b20edde7e79fc02ab96d73584ef78bede406474ba8f19078c3624f0da047','8ae6e859a1825ff67cee086821571ec5657edcf783200ed289f29ffd29f1aeab','04268b9cd6d9e9682ae4c232679a32829755a645c23ca653de21ba6823baf2bc'],
      pass:['c1b991510efc2edb79eeb7c137dc5ec3721e1a49c490cfd6fcd8d1a9e5bf1901','c7b7d8520f9a8088e1b176b3c286a48ce706f2772cdeb80143dc34e04572fdba','e90e7e4c0f5d9a5c6e0cd0ee685cfcb3bffc899b75273b7f395d7efeccf312cb','7bd79a370f46ab36c598416e81fc440342fc2e1a8fded5648f789a05cacddcad','d6fd2a81c1e83213e7646c5df2c3cfbcc2ddb559c958bab5d2f283cbae385e1a']
    };
    for(const id of ['river','pass'] as const){const m=createMap(id);expect([sha(m.blocked),sha(m.noBuild),sha(JSON.stringify(m.resources)),sha(JSON.stringify(m.scenery.map(({kind,...p})=>p))),sha(terrainMask(m).data)]).toEqual(before[id]);}
  });
  it.each(['river','pass'] as const)('%s stays deterministic, protects full footprints and preserves routes for the largest unit',id=>{
    const map=createMap(id),repeat=createMap(id);
    expect(map.scenery).toEqual(repeat.scenery);
    const tree=id==='pass'?'pine':'oak';
    expect(map.scenery.filter(p=>p.kind===tree).length).toBeGreaterThan(520);
    expect(map.scenery.filter(p=>p.kind===tree).length).toBeLessThanOrEqual(860);
    expect(map.scenery.some(p=>p.kind===(id==='pass'?'oak':'pine'))).toBe(false);
    expect(map.scenery.filter(p=>p.kind==='rock').length).toBeLessThanOrEqual(460);
    for(const spawn of map.spawns)expect(map.scenery.filter(p=>p.kind===tree&&Math.hypot(p.x-spawn.x,p.z-spawn.z)<20).length).toBeGreaterThanOrEqual(3);
    const paths=roadPaths(map);
    for(const prop of map.scenery){
      const protectedPoints=[...map.spawns.map(p=>({point:p,radius:12})),...map.resources.map(p=>({point:p,radius:prop.onOriginalObstacle?2.5:6})),...map.camps.map(p=>({point:p,radius:prop.onOriginalObstacle?2.5:5}))];
      for(const {point,radius} of protectedPoints)expect(Math.hypot(prop.x-point.x,prop.z-point.z),`${id} prop near protected point`).toBeGreaterThanOrEqual(radius+prop.radius);
      for(const path of paths)for(let i=1;i<path.length;i++)expect(distanceToSegment(prop.x,prop.z,path[i-1],path[i]),`${id} prop near road`).toBeGreaterThanOrEqual((prop.onOriginalObstacle?.5:5)+prop.radius);
      const covered=[] as number[];
      for(let z=0;z<map.height;z++)for(let x=0;x<map.width;x++){
        const nearX=Math.max(x,Math.min(prop.x,x+1)),nearZ=Math.max(z,Math.min(prop.z,z+1));
        if(Math.hypot(prop.x-nearX,prop.z-nearZ)<prop.radius)covered.push(z*map.width+x);
      }
      expect(covered.length).toBeGreaterThan(0);
      for(const cell of covered){expect(map.blocked[cell],`${id} footprint blocked`).toBe(1);expect(map.noBuild[cell],`${id} footprint no-build`).toBe(1);}
      if(id==='river'&&prop.kind==='rock')expect(prop.onOriginalObstacle).toBe(true);
      if(id==='pass'&&prop.kind==='rock')expect(prop.onOriginalObstacle).toBe(true);
    }
    for(const path of paths)for(let i=1;i<path.length;i++){
      const a=path[i-1],b=path[i],steps=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)*2);
      for(let j=0;j<=steps;j++){const point={x:a.x+(b.x-a.x)*j/steps,z:a.z+(b.z-a.z)*j/steps};expect(isWalkable(map,point,[],.78),`${id} road ${point.x},${point.z}`).toBe(true);}
    }
    expect(findPath(map,map.spawns[0],map.spawns[1],[],.78)).not.toBeNull();
    for(const spawn of map.spawns)for(const target of [...map.resources,...map.camps])expect(findPath(map,spawn,target,[],.78),`${id} reachable ${target.x},${target.z}`).not.toBeNull();
  });
  it('makes the impassable ridge read as continuous rock and places river stones near banks',()=>{
    const pass=createMap('pass'),river=createMap('river');
    // Two rock columns cover the 8 m ridge (x 140–147) everywhere except its five openings.
    for(const x of [142,146]){const rocks=pass.scenery.filter(p=>p.kind==='rock'&&Math.abs(p.x-x)<.2);
      for(const z of [6,14,40,50,90,110,128,160,180,200,236,250,276])
        expect(rocks.some(p=>Math.abs(p.z-z)<2.8),`ridge ${x} at z=${z}`).toBe(true);}
    for(const p of river.scenery.filter(p=>p.kind==='rock')){const bank=channelBanks(p.z);expect(p.x<bank.left||p.x>bank.right,`${p.x},${p.z} in water`).toBe(true);}
  });
  it('covers all eight short blocked outcrops with overlapping, full-height rock faces',()=>{
    const map=createMap('pass'),N=map.width;
    // The east strips are the 180° twins of the west ones (x ↔ 288−x−length, row ↔ 287−row).
    const west=PASS_OUTCROPS;expect(west).toHaveLength(4);
    for(const [start,z,length] of [...west,...west.map(([x,z,l])=>[N-x-l,N-1-z,l])]){
      const rocks=map.scenery.filter(p=>p.kind==='rock'&&Math.abs(p.z-z-.5)<.1&&p.x>=start&&p.x<=start+length);
      expect(rocks.length).toBeGreaterThanOrEqual(3);
      for(const rock of rocks){
        expect(rock.size?.height).toBeGreaterThan(1.2);
        expect(rock.size?.depth).toBeLessThanOrEqual(1);
        expect(rock.x-rock.size!.width/2).toBeGreaterThanOrEqual(start);
        expect(rock.x+rock.size!.width/2).toBeLessThanOrEqual(start+length+1e-9);
        for(let row=Math.floor(rock.z-rock.size!.depth/2);row<Math.ceil(rock.z+rock.size!.depth/2);row++)for(let col=Math.floor(rock.x-rock.size!.width/2);col<Math.ceil(rock.x+rock.size!.width/2);col++){
          expect(map.blocked[row*N+col]).toBe(1);expect(map.noBuild[row*N+col]).toBe(1);
          expect(row).toBe(z);expect(col).toBeGreaterThanOrEqual(start);expect(col).toBeLessThan(start+length);
        }
      }
      for(let x=start+.15;x<start+length-.1;x+=.1)expect(rocks.some(p=>Math.abs(x-p.x)<p.size!.width/2),`unreadable outcrop ${x},${z}`).toBe(true);
    }
  });
  it('uses a few separated river stone clusters following the actual water edge',()=>{
    const rocks=createMap('river').scenery.filter(p=>p.kind==='rock').sort((a,b)=>a.z-b.z);
    const gaps=rocks.slice(1).map((p,i)=>p.z-rocks[i].z);
    expect(gaps.filter(g=>g>5).length).toBeGreaterThanOrEqual(3);
    expect(gaps.filter(g=>g<2).length).toBeGreaterThanOrEqual(6);
    for(const p of rocks){const bank=channelBanks(p.z);expect(Math.min(Math.abs(p.x-bank.left),Math.abs(p.x-bank.right))).toBeCloseTo(1.05);}
  });
  it('creates finite normalized map-specific RGBA weights aligned to the 480 m ground frame',()=>{
    const river=terrainMask(createMap('river')),pass=terrainMask(createMap('pass'));
    // 288 m grid plus a 96 m margin on every side (the margin is capped at 96 m).
    expect(river.width).toBe(480);expect(river.height).toBe(480);expect(river.data).toHaveLength(480*480*4);
    // One assertion per mask: 230k per-texel expect() calls timed out on a contended host.
    for(const mask of [river,pass]){let over=0;for(let i=0;i<mask.data.length;i+=4)if(mask.data[i]+mask.data[i+1]+mask.data[i+2]+mask.data[i+3]>255)over++;expect(over).toBe(0);}
    const at=(data:Uint8Array,x:number,z:number,channel:number)=>data[((383-z)*480+96+x)*4+channel];
    const bank=Math.round(channelBanks(45).left)-2;
    expect(at(river.data,bank,45,2)).toBeGreaterThan(at(river.data,40,45,2));
    expect(at(pass.data,143,40,3)).toBeGreaterThan(at(pass.data,40,40,3));
    expect(Array.from(river.data).some((v,i)=>v!==pass.data[i])).toBe(true);
  });
  it.each(['river','pass'] as const)('keeps late AI construction sites open on %s',id=>{
    const map=createMap(id);
    for(const point of [{x:24,z:131},{x:15,z:131},{x:37,z:131},{x:24,z:174},{x:37,z:174},{x:264,z:157},{x:273,z:157},{x:251,z:157},{x:264,z:114},{x:251,z:114}])
      expect(canPlace(map,{...point,width:7,depth:7}),`${id} construction at ${point.x},${point.z}`).toBe(true);
  });
  it('blends four loaded textures with meadow residual in one ground material',()=>{
    const textures=Array.from({length:5},()=>new THREE.Texture());
    const mask=new THREE.DataTexture(new Uint8Array(480*480*4),480,480);
    const material=layeredGroundMaterial(textures[0],textures.slice(1) as [THREE.Texture,THREE.Texture,THREE.Texture,THREE.Texture],mask,groundFrame({width:288,height:288}));
    const shader={uniforms:{},vertexShader:'#include <worldpos_vertex>',fragmentShader:'#include <map_fragment>'};material.onBeforeCompile(shader as any,{} as any);
    expect(shader.fragmentShader).toContain('texture2D(rtsWeightMap, rtsMaskUv)');
    expect(shader.fragmentShader).toContain('(vRtsWorldXZ.x + 96.0) / 480.0, (384.0 - vRtsWorldXZ.y) / 480.0');
    expect(shader.fragmentShader).toContain('1.0 - dot(weights, vec4(1.0))');
    expect(Object.values(shader.uniforms).map((v:any)=>v.value)).toEqual(expect.arrayContaining([mask,...textures.slice(1)]));
    material.dispose();mask.dispose();textures.forEach(t=>t.dispose());
  });
});
