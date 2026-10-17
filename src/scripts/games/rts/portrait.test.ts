import {describe,it,expect,vi,afterEach} from 'vitest';
import * as THREE from 'three';
import {SelectionPortrait} from './portrait';
import type {ModelLibrary} from './models';
import type {Entity} from './types';
afterEach(()=>vi.restoreAllMocks());
const entity=(id:number,kind='worker',team=0,alive=true)=>({id,kind,team,alive,category:kind==='townhall'?'building':'unit'}) as Entity;
function setup(){
  const panel=document.createElement('section'),frame=document.createElement('div'),view=document.createElement('div');view.id='rts-portrait-view';frame.append(view);panel.append(frame);
  vi.spyOn(view,'getBoundingClientRect').mockReturnValue(new DOMRect(40,130,120,160));
  const instances:any[]=[];const instantiate=vi.fn(()=>{const m={root:new THREE.Group(),yaw:0,animate:vi.fn(),dispose:vi.fn()};instances.push(m);return m;});
  const portrait=new SelectionPortrait({instantiate} as unknown as ModelLibrary,frame);
  return {portrait,frame,view,panel,instances,instantiate};
}
function renderer(){
  const r={viewport:new THREE.Vector4(1,2,800,600),scissor:new THREE.Vector4(3,4,500,400),scissorTest:false,autoClear:false,color:new THREE.Color('#123456'),alpha:.4,
    getViewport:(v:THREE.Vector4)=>v.copy(r.viewport),getScissor:(v:THREE.Vector4)=>v.copy(r.scissor),getScissorTest:()=>r.scissorTest,getClearColor:(v:THREE.Color)=>v.copy(r.color),getClearAlpha:()=>r.alpha,
    setViewport:vi.fn((v:THREE.Vector4)=>r.viewport.copy(v)),setScissor:vi.fn((v:THREE.Vector4)=>r.scissor.copy(v)),setScissorTest:(v:boolean)=>{r.scissorTest=v;},setClearColor:(v:THREE.Color,a:number)=>{r.color.copy(v);r.alpha=a;},render:vi.fn(),clear:vi.fn()};return r;
}
describe('selection portraits',()=>{
  it('honors changes to the live reduced-motion preference without advancing Idle',()=>{
    const media={matches:true};vi.spyOn(window,'matchMedia').mockReturnValue(media as MediaQueryList);
    const a=setup();a.portrait.update({entities:[entity(1)]},[1],.1);expect(a.instances[0].animate).toHaveBeenLastCalledWith('idle',0);
    media.matches=false;a.portrait.update({entities:[entity(1)]},[1],.1);expect(a.instances[0].animate).toHaveBeenLastCalledWith('idle',.1);
  });
  it('uses selection order and only alive visible units, never remembered or absent enemies',()=>{
    const a=setup(),entities=[entity(1),entity(2,'guard',1),entity(3,'townhall'),entity(4,'priest',0,false)];
    a.portrait.update({entities},[4,2,1],.1);expect(a.instantiate).toHaveBeenLastCalledWith('guard',1);expect(a.view.getAttribute('aria-label')).toContain('王國衛兵');expect(a.frame.hidden).toBe(false);
    a.portrait.update({entities:entities.filter(e=>e.id!==2)},[2],.1);expect(a.frame.hidden).toBe(true);expect(a.instances[0].dispose).toHaveBeenCalledTimes(1);
    a.portrait.update({entities},[3,1],.1);expect(a.instantiate).toHaveBeenCalledTimes(1);expect(a.frame.hidden).toBe(true);
    a.portrait.update({entities},[4],.1);expect(a.frame.hidden).toBe(true);
  });
  it('reuses same-kind/team clone, pauses its mixer, replaces team/kind and releases on clear/dispose',()=>{
    const a=setup(),entities=[entity(1),entity(2),entity(3,'worker',1),entity(4,'knight')];
    a.portrait.update({entities},[1],.1);a.portrait.update({entities},[2],0);expect(a.instantiate).toHaveBeenCalledTimes(1);expect(a.instances[0].animate).toHaveBeenLastCalledWith('idle',0);
    a.portrait.update({entities},[3],.1);expect(a.instances[0].dispose).toHaveBeenCalledTimes(1);expect(a.instantiate).toHaveBeenLastCalledWith('worker',1);
    a.portrait.update({entities},[4],.1);expect(a.instances[1].dispose).toHaveBeenCalledTimes(1);
    a.portrait.update({entities},[],.1);expect(a.instances[2].dispose).toHaveBeenCalledTimes(1);expect(a.panel.classList.contains('rts-has-portrait')).toBe(false);
    a.portrait.dispose();a.portrait.dispose();expect(a.instances[2].dispose).toHaveBeenCalledTimes(1);
  });
  it('uses logical CSS pixels, inverts Y, clears depth and restores renderer state',()=>{
    const a=setup(),r=renderer();a.portrait.update({entities:[entity(1)]},[1],.1);
    expect(a.portrait.render(r as unknown as THREE.WebGLRenderer,new DOMRect(10,20,800,600))).toEqual({x:30,y:110,width:120,height:160});
    expect(r.setViewport.mock.calls[0][0].toArray()).toEqual([30,330,120,160]);expect(r.clear).toHaveBeenCalledWith(true,true,true);expect(r.render).toHaveBeenCalledTimes(1);
    expect(r.viewport.toArray()).toEqual([1,2,800,600]);expect(r.scissor.toArray()).toEqual([3,4,500,400]);expect(r.scissorTest).toBe(false);expect(r.autoClear).toBe(false);expect(r.alpha).toBe(.4);expect(r.color.getHexString()).toBe('123456');
  });
  it('clips only the scissor when partly outside the canvas, and restores even when rendering throws',()=>{
    const a=setup(),r=renderer();a.portrait.update({entities:[entity(1)]},[1],.1);
    r.render.mockImplementation(()=>{throw new Error('draw failed');});expect(()=>a.portrait.render(r as unknown as THREE.WebGLRenderer,new DOMRect(100,150,800,600))).toThrow('draw failed');
    expect(r.setViewport.mock.calls[0][0].toArray()).toEqual([-60,460,120,160]);expect(r.setScissor.mock.calls[0][0].toArray()).toEqual([0,460,60,140]);expect(r.viewport.toArray()).toEqual([1,2,800,600]);expect(r.scissorTest).toBe(false);
    a.portrait.update({entities:[]},[],0);r.render.mockClear();expect(a.portrait.render(r as unknown as THREE.WebGLRenderer,new DOMRect())).toBeNull();expect(r.render).not.toHaveBeenCalled();
  });
});
