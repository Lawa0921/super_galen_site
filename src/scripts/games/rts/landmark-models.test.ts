import {it,expect,vi,afterEach} from 'vitest';
import * as THREE from 'three';
import {GLTFLoader,type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {REQUIRED_MODELS,validateModelManifest,ModelLibrary} from './models';
import {createMap} from './maps';
const ids=['river-gatehouse','river-shrine','highland-watchtower','quarry-ruins'];
const manifest=()=>({assets:Object.fromEntries([...new Set([...REQUIRED_MODELS,...ids])].map(id=>[id,{url:`/assets/games/rts/models/${id}.glb`,status:'published',scale:1,...(ids.includes(id)?{lod1:`/assets/games/rts/models/${id}-lod1.glb`}:{})}]))});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it.each(['river','pass'] as const)('assigns distinct %s landmarks with the existing footprints',id=>{
  const map=createMap(id),expected=id==='river'?ids.slice(0,2):ids.slice(2);
  // Outposts beside both bases, natural and third expansions, then ruins beside all ten camps.
  expect(map.landmarks!.map(p=>(p as any).assetId)).toEqual([...Array(6).fill(expected[0]),...Array(10).fill(expected[1])]);
  for(const p of map.landmarks!){expect(p.width).toBe(3.8);expect(p.depth).toBe(3.8);}
  for(const model of ids)expect(REQUIRED_MODELS).toContain(model);
});
it.each([{lod1:undefined},{lod1:'https://example.com/lod.glb'},{scale:2},{status:'candidate'}])('rejects an incomplete or distorted landmark %j',change=>{
  const data=manifest();Object.assign(data.assets['river-gatehouse'],change);expect(()=>validateModelManifest(data)).toThrow('river-gatehouse');
});
it('loads only the selected map LODs, reuses common assets and retires the atlas fetch',async()=>{
  const data={...manifest(),landscape:{undergrowth:{url:'/assets/games/rts/terrain/valley-undergrowth.webp',status:'published'},ruins:{url:'/assets/games/rts/terrain/kingdom-ruins.webp',status:'published'}}};
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>data}));
  const loader=vi.spyOn(GLTFLoader.prototype,'loadAsync').mockResolvedValue({scene:new THREE.Group(),animations:[]} as unknown as GLTF),textures=vi.spyOn(THREE.TextureLoader.prototype,'loadAsync').mockResolvedValue(new THREE.Texture()),library=new ModelLibrary();
  await library.load(()=>{},'river');
  for(const id of ids)for(const suffix of ['', '-lod1'])expect(loader.mock.calls.some(c=>c[0].endsWith(`/${id}${suffix}.glb`))).toBe(id.startsWith('river-'));
  expect(textures).not.toHaveBeenCalledWith('/assets/games/rts/terrain/kingdom-ruins.webp');
  loader.mockClear();await library.load(()=>{},'pass');
  expect(loader).toHaveBeenCalledTimes(5);
  for(const id of ids.slice(2))for(const suffix of ['', '-lod1'])expect(loader).toHaveBeenCalledWith(`/assets/games/rts/models/${id}${suffix}.glb`);
  library.dispose();
});
