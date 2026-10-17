import {afterEach,describe,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {Battlefield} from './scene';
import {BattlefieldInput} from './input';
import type {Hud} from './hud';
import {createGame} from './simulation';
import {getTeamView} from './visibility';

// 2026-10-16: on the 288 m maps the camera may not zoom out past ~60 m so the
// land reads large and crossing it takes real time.
describe('288 m map camera limits',()=>{
  it('opens at 48 m and clamps zoom to 24–60 m',()=>{
    expect(Battlefield.ZOOM).toEqual({min:24,max:60,initial:48});
  });
  let input:BattlefieldInput|undefined;
  afterEach(()=>{input?.dispose();input=undefined;document.body.replaceChildren();});
  const panSpeed=(viewSpan:number)=>{
    document.body.innerHTML='<canvas id="rts-minimap"></canvas><canvas id="battle" tabindex="0"></canvas>';
    const canvas=document.querySelector<HTMLCanvasElement>('#battle')!;const state=createGame('river');
    const scene={canvas,map:state.map,selection:[],placement:null,box:null,spell:null,pan:vi.fn(),zoom:vi.fn(),focus:vi.fn(),viewSpan} as unknown as Battlefield;
    input=new BattlefieldInput(scene,getTeamView(state,0),vi.fn(()=>true),{mode:vi.fn(),select:vi.fn()} as unknown as Hud,vi.fn());
    canvas.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));input.update(1);
    const [x,z]=vi.mocked(scene.pan).mock.calls[0];input.dispose();input=undefined;return Math.hypot(x,z);
  };
  it('pans about 34 m/s at the opening span and faster when zoomed out, so a 288 m map is crossed in under 8 s',()=>{
    const opening=panSpeed(48),wide=panSpeed(60),close=panSpeed(24);
    expect(opening).toBeCloseTo(34*Math.hypot(.83,.56),0);
    expect(wide).toBeGreaterThan(opening);expect(close).toBeLessThan(opening);
    expect(288/wide).toBeLessThan(8);
  });
});

describe('overview captures beyond the gameplay zoom',()=>{
  // The orthographic camera sits 52 m up; a 234 m thumbnail span put the near
  // half of the 288 m map behind its near plane (a flat band of background).
  const frame=(span:number)=>{
    const field={camera:new THREE.OrthographicCamera(-35,35,25,-25,.1,250),center:{x:144,z:144},span,size:{width:1800,height:1080},followSun:()=>{}} as any;
    (Battlefield.prototype as any).updateCamera.call(field);return field.camera as THREE.OrthographicCamera;
  };
  it('keeps the gameplay camera exactly as before',()=>{
    for(const span of [24,48,60]){const c=frame(span);expect(c.position.toArray()).toEqual([168,52,179]);expect(c.far).toBe(250);}
  });
  it('backs a wide overview camera off along its view axis so the whole map stays between near and far',()=>{
    const c=frame(234),view=new THREE.Vector3();c.getWorldDirection(view);
    const corners=[[0,0],[288,0],[0,288],[288,288]].map(([x,z])=>new THREE.Vector3(x,0,z).sub(c.position).dot(view));
    for(const depth of corners){expect(depth).toBeGreaterThan(c.near);expect(depth).toBeLessThan(c.far);}
    // Same ground point under the screen centre: only the clip range moved.
    const centre=new THREE.Vector3(144,0,144).project(c);expect(centre.x).toBeCloseTo(0,6);expect(centre.y).toBeCloseTo(0,6);
  });
});
