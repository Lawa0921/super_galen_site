import {BufferGeometry,Float32BufferAttribute} from 'three';
import {roadPaths,groundFrame,type RtsMap,type Vec2} from './maps';

import {CHANNEL_WATER_Y,RIVER,channelBanks,channelHeight,onBridge} from './river-layout';
export {CHANNEL_WATER_Y,RIVER,channelBanks,channelHeight,createChannelMap,onBridge} from './river-layout';
const SIZE={width:RIVER.length,height:RIVER.length};

/** Plane-local coordinates centred on the grid; UVs span the whole ground frame (grid plus margins). */
export function channelGroundGeometry(fog=false):BufferGeometry{
  const positions:number[]=[],uvs:number[]=[],indices:number[]=[],{margin,width,height}=groundFrame(SIZE),L=RIVER.length,half=L/2;
  const rows=[-margin,...Array.from({length:L*2+1},(_,i)=>i/2),L+margin],columns=8;
  rows.forEach((z,row)=>{
    const {left,right}=channelBanks(Math.max(0,Math.min(L,z)));
    [-margin,left-1,left,left+.4,right-.4,right,right+1,L+margin].forEach((x,col)=>{
      const ground=channelHeight(x,z);
      const height_=fog?Math.max(onBridge(x,z)?.025:CHANNEL_WATER_Y,ground)+.04:ground;
      positions.push(x-half,half-z,height_);uvs.push((x+margin)/width,(L+margin-z)/height);
      if(row&&col){const a=(row-1)*columns+col-1,b=row*columns+col-1;indices.push(a,b,a+1,a+1,b,b+1);}
    });
  });
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
export function channelFogGeometry():BufferGeometry{return channelGroundGeometry(true);}

export function channelWaterGeometry():BufferGeometry{
  const p:number[]=[],uv:number[]=[],indices:number[]=[];
  for(let z=0;z<=RIVER.length;z+=.5){const {left,right}=channelBanks(z),row=z*2;p.push(left,CHANNEL_WATER_Y,z,right,CHANNEL_WATER_Y,z);uv.push(left/6,z/6,right/6,z/6);if(row){const a=(row-1)*2,b=row*2;indices.push(a,b,a+1,a+1,b,b+1);}}
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(p,3));geometry.setAttribute('uv',new Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

/** Trim the ground decal at the bridge abutments; bridge stone supplies the crossing surface. */
export function channelRoadPaths(map:RtsMap):Vec2[][]{
  const paths=roadPaths(map);if(map.id!=='river')return paths;
  return paths.flatMap(path=>{
    const result:Vec2[][]=[];
    for(const side of [-1,1]){
      const boundary=RIVER.centerX+side*RIVER.bridgeHalf,inside=(p:Vec2)=>side<0?p.x<=boundary:p.x>=boundary;
      let part:Vec2[]=[];
      for(let i=0;i<path.length;i++){
        const p=path[i],a=path[i-1];
        if(a&&inside(a)!==inside(p)){const t=(boundary-a.x)/(p.x-a.x),crossing={x:boundary,z:a.z+(p.z-a.z)*t};part.push(crossing);if(!inside(p)){if(part.length>1)result.push(part);part=[];}}
        if(inside(p))part.push({...p});
      }
      if(part.length>1)result.push(part);
    }
    return result;
  });
}
