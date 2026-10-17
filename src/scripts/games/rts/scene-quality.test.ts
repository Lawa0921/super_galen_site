import {describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import {Battlefield} from './scene';
import {ShadowCadence} from './shadow-cadence';
import {StaticTransform} from './static-transform';
import {createGame} from './simulation';
import {getTeamView} from './visibility';

function field(){
  // Real Battlefield methods without allocating WebGL; constructor-only layers are stubbed.
  const result=Object.create(Battlefield.prototype) as Battlefield,scene=new THREE.Scene(),staticWorld=new THREE.Group(),camera=new THREE.OrthographicCamera(-35,35,25,-25,.1,250);scene.add(staticWorld);
  camera.position.set(48,52,131);camera.lookAt(24,0,96);camera.updateProjectionMatrix();camera.updateMatrixWorld();
  const sun=new THREE.DirectionalLight();sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
  const renderer={shadowMap:{enabled:true,autoUpdate:false,needsUpdate:true},render:vi.fn(),setPixelRatio:vi.fn(),setSize:vi.fn()};
  const landmarks={update:vi.fn()};
  Object.assign(result,{models:new Map(),memories:new Map(),unitHeights:new Map(),selection:[],size:{width:100,height:100},center:{x:24,z:96},lodScale:1,scene,camera,map:createGame('river').map,sun,
    staticWorld,staticWorldTransform:new StaticTransform(staticWorld),canvas:{getBoundingClientRect:()=>({width:100,height:100})},overlay:{},
    shadowCadence:new ShadowCadence(),span:48,fogData:new Uint8Array(384*384*4),fogTexture:{},resourceMemory:{observe:vi.fn(),isExhausted:()=>false},
    scenery:{update:vi.fn()},landmarks,resourceGroves:new Map(),props:[],resources:new Map(),projectiles:{update:vi.fn()},renderer,drawOverlay:vi.fn()});
  const view={...getTeamView(createGame('river'),0),entities:[],knownBuildings:[]};
  return {result,sun,renderer,landmarks,view};
}

describe('battlefield graphics quality',()=>{
  it('low quality disables the shadow pass and lowers the pixel ratio; high restores both',()=>{
    const {result,sun,renderer}=field();
    result.setQuality('low');
    expect(renderer.shadowMap.enabled).toBe(false);expect(sun.castShadow).toBe(false);expect(renderer.setPixelRatio).toHaveBeenLastCalledWith(1);
    result.setQuality('high');
    expect(renderer.shadowMap.enabled).toBe(true);expect(sun.castShadow).toBe(true);expect(sun.shadow.mapSize.x).toBe(2048);
  });
  it('biases landmark and unit LOD selection toward LOD1 on low quality',()=>{
    const {result,landmarks,view}=field(),point={x:14,z:48};
    result.render(view,.016);const high=landmarks.update.mock.calls.at(-1)![1](point,6);
    result.setQuality('low');result.render(view,.016);const low=landmarks.update.mock.calls.at(-1)![1](point,6);
    const projected=Math.abs(result.screen(point,6).y-result.screen(point).y);
    expect(high).toBeGreaterThan(0);expect(low).toBeCloseTo(projected/2,6);
  });
});
