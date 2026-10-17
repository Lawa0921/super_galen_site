import {describe,it,expect,vi,afterEach} from 'vitest';
import {Group,Mesh,BufferGeometry,MeshStandardMaterial,Texture,TextureLoader,Color} from 'three';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {prepareTeamMasks,configureTeamMaterial} from './team-material';
afterEach(()=>vi.restoreAllMocks());
describe('per-texel cloth team colours',()=>{
  it('decodes one shared embedded fabric mask before exposing the model',async()=>{
    const scene=new Group(),material=new MeshStandardMaterial({map:new Texture()}),mask=new Texture<HTMLImageElement>();
    material.userData.teamTintMask='data:image/png;base64,aGVsbG8=';
    scene.add(new Mesh(new BufferGeometry(),material),new Mesh(new BufferGeometry(),material));
    const load=vi.spyOn(TextureLoader.prototype,'loadAsync').mockResolvedValue(mask);
    await prepareTeamMasks({scene} as unknown as GLTF);
    expect(load).toHaveBeenCalledTimes(1);expect(material.userData.teamTintTexture).toBe(mask);expect(mask.flipY).toBe(false);
    expect(Object.keys(material.userData)).not.toContain('teamTintMask');
    expect(material.clone().userData.teamTintMask).toBeUndefined();
    await prepareTeamMasks({scene} as unknown as GLTF);expect(load).toHaveBeenCalledTimes(1);
  });
  it('rejects an external mask instead of introducing an unreviewed request',async()=>{
    const scene=new Group(),material=new MeshStandardMaterial();material.userData.teamTintMask='https://example.com/mask.png';scene.add(new Mesh(new BufferGeometry(),material));
    const load=vi.spyOn(TextureLoader.prototype,'loadAsync');await expect(prepareTeamMasks({scene} as unknown as GLTF)).rejects.toThrow('Embedded');expect(load).not.toHaveBeenCalled();
  });
  it('changes only masked fabric and gives instances independent tint uniforms',()=>{
    const mask=new Texture(),blue=new MeshStandardMaterial(),red=new MeshStandardMaterial();blue.userData.teamTintTexture=red.userData.teamTintTexture=mask;
    configureTeamMaterial(blue,0);configureTeamMaterial(red,1);
    const shader=()=>({uniforms:{},fragmentShader:'#include <map_fragment>'});const a=shader(),b=shader();
    blue.onBeforeCompile(a as any,{} as any);red.onBeforeCompile(b as any,{} as any);
    expect(a.fragmentShader).toContain('mix(rtsOriginal');expect(a.fragmentShader).toContain('texture2D(rtsTeamMask, vMapUv).r');
    expect((a.uniforms as any).rtsTeamMask.value).toBe(mask);
    const ac=(a.uniforms as any).rtsTeamHue.value as Color,bc=(b.uniforms as any).rtsTeamHue.value as Color;
    expect(ac).not.toBe(bc);expect(ac.b).toBeGreaterThan(ac.r);expect(bc.r).toBeGreaterThan(bc.b);
    expect(blue.customProgramCacheKey()).toBe(red.customProgramCacheKey());
  });
});
