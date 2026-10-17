import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {addBuilding} from './state';
import {createGame} from './simulation';
import {BuildingEffectTimeline,BuildingEffectLayer,MAX_BUILDING_EFFECT_SPRITES,type BuildingEffectInput} from './building-effects';

function fixture(){
  const state=createGame('river'),building=addBuilding(state,0,'house',{x:20,z:20},true);
  const input:BuildingEffectInput={building,anchors:{impact:[[18,.2,20],[22,3,20]],repair:[[20,.15,22],[20,2,18]]}};
  return {building,input};
}
describe('building effect event timeline',()=>{
  it('does not replay pre-observation impacts, repairs or death',()=>{
    const {building,input}=fixture(),fx=new BuildingEffectTimeline();building.damageCues=[{sequence:1,time:1}];building.repairCue={sequence:1,time:1};
    expect(fx.update([input],1)).toEqual([]);building.alive=false;building.deathTime=1;const fresh=new BuildingEffectTimeline();
    expect(fresh.update([input],1)).toEqual([]);
  });
  it('separates simultaneous actual impacts, picks the source-facing anchor and freezes at simulation time',()=>{
    const {building,input}=fixture(),fx=new BuildingEffectTimeline();fx.update([input],0);
    building.damageCues=[{sequence:1,time:.1,source:{x:15,z:20}},{sequence:2,time:.1,source:{x:25,z:20}}];
    const first=fx.update([input],.2);expect(first.map(p=>p.kind)).toEqual(['impact-dust','impact-dust']);
    expect(first[0].position[0]).toBe(18);expect(first[1].position[0]).toBe(22);
    expect(fx.update([input],.2)).toEqual(first);expect(fx.update([input],2)).toEqual([]);
  });
  it('clears hidden instances and never replays their events after rediscovery',()=>{
    const {building,input}=fixture(),fx=new BuildingEffectTimeline();fx.update([input],0);building.damageCues=[{sequence:1,time:.1}];
    expect(fx.update([input],.2)).toHaveLength(1);expect(fx.update([],.3)).toEqual([]);
    building.damageCues.push({sequence:2,time:.4});expect(fx.update([input],.5)).toEqual([]);
  });
  it('shows sustained damage only on completed living buildings and extinguishes immediately after repair',()=>{
    const {building,input}=fixture(),fx=new BuildingEffectTimeline();building.hp=building.maxHp*.2;
    expect(fx.update([input],0).map(p=>p.kind)).toEqual(['damage-smoke','fire-ember']);
    building.hp=building.maxHp*.5;expect(fx.update([input],.1).map(p=>p.kind)).toEqual(['damage-smoke']);
    building.hp=building.maxHp;expect(fx.update([input],.2)).toEqual([]);
    building.construction=.1;building.hp=1;expect(fx.update([input],.3)).toEqual([]);
  });
  it('uses the authored foundation anchor for unfinished impacts and repair',()=>{
    const {building,input}=fixture(),fx=new BuildingEffectTimeline();building.construction=.05;fx.update([input],0);
    building.damageCues=[{sequence:1,time:.1,source:{x:30,z:20}}];building.repairCue={sequence:1,time:.1};
    const particles=fx.update([input],.1);expect(particles.map(p=>p.position)).toEqual([[18,.2,20],[20,.15,22]]);
  });
  it('emits collapse dust only on an observed combat death and clears repair sparks',()=>{
    const {building,input}=fixture(),fx=new BuildingEffectTimeline();fx.update([input],0);building.repairCue={sequence:1,time:.1};
    expect(fx.update([input],.1).map(p=>p.kind)).toEqual(['repair-sparks']);building.alive=false;building.deathTime=.2;building.removalReason='combat';
    const dead=fx.update([input],.2);expect(dead.length).toBeGreaterThan(0);expect(dead.every(p=>p.kind==='impact-dust')).toBe(true);
    expect(fx.update([input],.2)).toEqual(dead);expect(fx.update([input],3.2)).toEqual([]);
  });
  it('does not emit cancellation dust and discards effects when simulation rewinds',()=>{
    const {building,input}=fixture(),fx=new BuildingEffectTimeline();fx.update([input],2);building.damageCues=[{sequence:1,time:2.1}];
    expect(fx.update([input],2.2)).toHaveLength(1);expect(fx.update([input],1)).toEqual([]);
    building.alive=false;building.removalReason='cancelled';expect(fx.update([input],2.2)).toEqual([]);
  });
  it('bounds high-rate repair/impact bursts and the complete visible sprite budget',()=>{
    const {building,input}=fixture(),fx=new BuildingEffectTimeline();fx.update([input],0);
    for(let tick=1;tick<=30;tick++){const time=tick/100;building.repairCue={sequence:tick,time};building.damageCues=[{sequence:tick,time}];expect(fx.update([input],time).length).toBeLessThanOrEqual(6);}
    const crowd=Array.from({length:100},(_,id)=>{const b=structuredClone(building);b.id=id;b.hp=1;return {...input,building:b};});
    expect(fx.update(crowd,1).length).toBe(MAX_BUILDING_EFFECT_SPRITES);
  });
});
describe('building effect GPU ownership',()=>{
  it('shares one source image across four padded atlas views and reuses a bounded unpickable sprite pool',()=>{
    const image={width:256,height:256},texture=new THREE.Texture(image),layer=new BuildingEffectLayer(texture),{input,building}=fixture();building.hp=1;
    layer.update([input],0);const sprites=layer.root.children as THREE.Sprite[];expect(sprites).toHaveLength(2);
    expect(sprites.every(s=>s.userData.entityId===undefined&&s.material.depthTest&&!s.material.depthWrite&&!s.material.toneMapped)).toBe(true);
    expect(sprites[0].material.map!.source).toBe(texture.source);expect(sprites[0].material.map!.repeat.toArray()).toEqual([.5,.5]);
    expect(sprites[0].material.map!.offset.toArray()).toEqual([0,0]);expect(sprites[1].material.map!.offset.toArray()).toEqual([.5,0]);
    const initial=sprites.slice();layer.update([input],0);expect(layer.root.children).toEqual(initial);
    layer.update([],1);expect(sprites.every(s=>!s.visible)).toBe(true);layer.update([input],2);expect(layer.root.children).toEqual(initial);
    let sourceDisposed=0,ownedDisposed=0;texture.addEventListener('dispose',()=>sourceDisposed++);for(const s of sprites)s.material.addEventListener('dispose',()=>ownedDisposed++);
    layer.dispose();layer.dispose();expect(sourceDisposed).toBe(0);expect(ownedDisposed).toBe(2);expect(layer.root.children).toHaveLength(0);
  });
});
