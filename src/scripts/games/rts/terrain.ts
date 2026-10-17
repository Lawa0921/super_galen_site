import {BufferGeometry,Float32BufferAttribute,MeshStandardMaterial,Texture,DataTexture} from 'three';
import type {RtsMap,Vec2} from './maps';
import {riverBanks,groundFrame} from './maps';
import {channelBanks} from './river-layout';
export {roadPaths} from './maps';

/** Irregular water edge entirely inside the authored 4m navigation barrier. */
export function riverGeometry():BufferGeometry{
  const positions:number[]=[],uvs:number[]=[],indices:number[]=[];
  for(let z=0;z<=96;z+=2){
    const {left,right}=riverBanks(z);
    const row=z/2;positions.push(left,.015,z,right,.015,z);uvs.push(0,z/96,1,z/96);
    if(row){const a=(row-1)*2,b=row*2;indices.push(a,b,a+1,a+1,b,b+1);}
  }
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

/** RGBA weights are lush grass, forest floor, river shingle and highland scree. Meadow is residual. */
export function terrainMask(map:RtsMap,banks:typeof riverBanks|undefined=map.terrainProfile==='meandering-river'?channelBanks:undefined):{width:number;height:number;data:Uint8Array}{
  // One texel per metre over the ground frame (the grid plus its margin on every side).
  const {margin,width,height}=groundFrame(map),data=new Uint8Array(width*height*4);
  const trees=[...(map.scenery?.filter(p=>p.kind==='oak'||p.kind==='pine')??[]),...map.resources.filter(r=>r.kind==='wood')];
  const clamp=(v:number)=>Math.max(0,Math.min(1,v));
  const noise=(x:number,z:number)=>{
    const hash=(a:number,b:number)=>{let n=Math.imul(a,374761393)+Math.imul(b,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;};
    const ax=Math.floor(x),az=Math.floor(z),fx=x-ax,fz=z-az,sx=fx*fx*(3-2*fx),sz=fz*fz*(3-2*fz);
    return (hash(ax,az)*(1-sx)+hash(ax+1,az)*sx)*(1-sz)+(hash(ax,az+1)*(1-sx)+hash(ax+1,az+1)*sx)*sz;
  };
  // Forest-floor weight: each tree splats its 9 m neighbourhood (max), instead of every texel scanning every tree.
  const grove=new Float32Array(width*height);
  for(const p of trees)for(let row=Math.max(0,Math.ceil(height-margin-p.z-9.5));row<=Math.min(height-1,Math.floor(height-margin-p.z+8.5));row++)for(let col=Math.max(0,Math.ceil(p.x-9.5+margin));col<=Math.min(width-1,Math.floor(p.x+8.5+margin));col++){
    const x=col-margin+.5,z=height-margin-1-row+.5;if(Math.abs(p.x-x)>=9||Math.abs(p.z-z)>=9)continue;
    const i=row*width+col;grove[i]=Math.max(grove[i],Math.exp(-(((p.x-x)/5.5)**2+((p.z-z)/5.5)**2)));
  }
  const ridge=map.width/2;
  for(let row=0;row<height;row++){const z=height-margin-1-row+.5,edges=banks?.(z);for(let col=0;col<width;col++){
    const x=col-margin+.5;
    const broad=noise(x/20,z/20),detail=noise(x/8+11,z/8-7),patch=clamp((broad*.7+detail*.3-.37)*2.2),forest=grove[row*width+col];
    const bank=edges?clamp((5+(edges.right-edges.left)/2-Math.abs(x-(edges.left+edges.right)/2))/5):clamp((8-Math.abs(x-ridge))/5);
    const scree=clamp((9-Math.abs(x-ridge))/7);
    let weights:number[];
    if(map.id==='river')weights=[.52+.68*patch,.02+1.35*forest,1.05*bank*(.65+.35*detail),.01];
    else weights=[.08+.23*patch,.03+1.3*forest,0,.2+.85*scree+.5*(1-patch)];
    const sum=weights.reduce((a,b)=>a+b,0),factor=sum>1?1/sum:1,at=(row*width+col)*4;
    weights.forEach((value,i)=>data[at+i]=Math.round(255*clamp(value*factor)));
    const rounded=data[at]+data[at+1]+data[at+2]+data[at+3];if(rounded>255)data[at+3]-=rounded-255;
  }}
  return {width,height,data};
}

/** One lit ground draw call; the mask uses world metres over the ground frame, independently of tiled diffuse UVs. */
export function layeredGroundMaterial(meadow:Texture,layers:[Texture,Texture,Texture,Texture],mask:DataTexture,frame:{margin:number;width:number;height:number},wetBanks=false,surfaceDetail=true):MeshStandardMaterial{
  const f=(v:number)=>v.toFixed(1);
  const material=new MeshStandardMaterial({map:meadow,roughness:.94,bumpMap:surfaceDetail?meadow:null,bumpScale:.85});
  material.onBeforeCompile=shader=>{
    shader.uniforms.rtsWeightMap={value:mask};
    layers.forEach((texture,i)=>{shader.uniforms[`rtsLayer${i}`]={value:texture};});
    shader.vertexShader='varying vec2 vRtsWorldXZ;\n'+shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvRtsWorldXZ = (modelMatrix * vec4(position, 1.0)).xz;');
    shader.fragmentShader=`varying vec2 vRtsWorldXZ;
uniform sampler2D rtsWeightMap;
uniform sampler2D rtsLayer0;
uniform sampler2D rtsLayer1;
uniform sampler2D rtsLayer2;
uniform sampler2D rtsLayer3;
`+shader.fragmentShader.replace('#include <map_fragment>',`
vec2 rtsMaskUv = vec2((vRtsWorldXZ.x + ${f(frame.margin)}) / ${f(frame.width)}, (${f(frame.height-frame.margin)} - vRtsWorldXZ.y) / ${f(frame.height)});
vec4 weights = texture2D(rtsWeightMap, rtsMaskUv);
vec4 rtsColor = texture2D(map, vMapUv) * (1.0 - dot(weights, vec4(1.0)));
rtsColor += texture2D(rtsLayer0, vMapUv) * vec4(0.70, 0.92, 0.64, 1.0) * weights.r;
rtsColor += texture2D(rtsLayer1, vMapUv) * vec4(0.76, 0.82, 0.68, 1.0) * weights.g;
rtsColor += texture2D(rtsLayer2, vMapUv) * weights.b;
rtsColor += texture2D(rtsLayer3, vMapUv) * weights.a;
diffuseColor *= rtsColor;
`);
    if(surfaceDetail){
      // Relief comes from the same original generated pixels and the same blend
      // weights as color. Screen derivatives use existing mip filtering, so no
      // second atlas, extra texture fetches or distant high-frequency shimmer.
      shader.fragmentShader=shader.fragmentShader
        .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
float rtsHeight = dot(rtsColor.rgb, vec3(0.2126, 0.7152, 0.0722));
roughnessFactor = clamp(0.94 - 0.19 * weights.b - 0.08 * weights.a + (0.45 - rtsHeight) * 0.08, 0.62, 1.0);`)
        .replace('#include <normal_fragment_maps>',`normal = perturbNormalArb(-vViewPosition, normal, vec2(dFdx(rtsHeight), dFdy(rtsHeight)) * bumpScale, faceDirection);`);
    }
    if(wetBanks){
      shader.vertexShader='varying float vRtsGroundY;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvRtsGroundY = (modelMatrix * vec4(position, 1.0)).y;');
      shader.fragmentShader='varying float vRtsGroundY;\n'+shader.fragmentShader.replace('diffuseColor *= rtsColor;','diffuseColor *= rtsColor;\ndiffuseColor.rgb *= mix(0.60, 1.0, smoothstep(-0.8, -0.25, vRtsGroundY));');
    }
  };
  material.customProgramCacheKey=()=>`rts-ground-4-v2-${wetBanks?'wet':'dry'}-${surfaceDetail?'relief':'flat'}-${frame.width}x${frame.height}`;
  return material;
}

/** The generated side-alpha texture uses U across the strip, V every four metres. */
export function roadGeometry(points:Vec2[],width:number):BufferGeometry{
  if(points.length<2||!Number.isFinite(width)||width<=0)throw new Error('Road requires a positive width and at least two points');
  const directions=points.slice(1).map((p,i)=>{const dx=p.x-points[i].x,dz=p.z-points[i].z,length=Math.hypot(dx,dz);if(!Number.isFinite(length)||length<.001)throw new Error('Degenerate road segment');return {x:dx/length,z:dz/length,length};});
  const positions:number[]=[],uvs:number[]=[],indices:number[]=[];let distance=0;
  points.forEach((p,i)=>{
    const before=directions[Math.max(0,i-1)],after=directions[Math.min(i,directions.length-1)];
    let nx=before.z+after.z,nz=-before.x-after.x;const length=Math.hypot(nx,nz);
    if(length<.001){nx=after.z;nz=-after.x;}else{nx/=length;nz/=length;}
    const radius=Math.min(width,width/2/Math.max(.5,nx*after.z-nz*after.x));
    if(i)distance+=before.length;
    positions.push(p.x+nx*radius,.025,p.z+nz*radius,p.x-nx*radius,.025,p.z-nz*radius);
    uvs.push(0,distance/4,1,distance/4);
    if(i){const a=(i-1)*2,b=i*2;indices.push(a,a+1,b,a+1,b+1,b);}
  });
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
