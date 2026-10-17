import * as THREE from 'three';
import type {Building} from './types';
import {BuildingCueHistory,buildingIntegrity} from './building-lifecycle';
type Point=[number,number,number];
/** `collapse` marks generic footprint corners for art without authored lifecycle data. */
export interface BuildingEffectAnchors {impact:Point[];repair:Point[];collapse?:Point[];collapseSize?:[number,number]}
export interface BuildingEffectInput {building:Building;anchors:BuildingEffectAnchors}
export const MAX_BUILDING_EFFECT_SPRITES=64;
export type BuildingEffectKind='impact-dust'|'repair-sparks'|'damage-smoke'|'fire-ember';
export interface BuildingEffectSample {kind:BuildingEffectKind;position:Point;size:[number,number];opacity:number;rotation:number}
interface Burst {kind:'impact-dust'|'repair-sparks'|'damage-smoke';position:Point;time:number;duration:number;size:[number,number]}
interface Observer {history:BuildingCueHistory;alive:boolean;bursts:Burst[];repairAt:number}
const lowest=(points:Point[])=>points.reduce((a,b)=>a[1]<b[1]?a:b);
function anchor(points:Point[],building:Building,index=0,source?:{x:number;z:number}):Point {
  if(building.construction<1)return [...lowest(points)];
  if(source)return [...points.reduce((a,b)=>Math.hypot(a[0]-source.x,a[2]-source.z)<Math.hypot(b[0]-source.x,b[2]-source.z)?a:b)];
  return [...points[index%points.length]];
}
/** Per-visible-instance state. No wall clock, fog snapshots or HP delta guesses. */
export class BuildingEffectTimeline {
  private observers=new Map<number,Observer>();
  private time=-Infinity;
  update(inputs:BuildingEffectInput[],time:number):BuildingEffectSample[]{
    if(!Number.isFinite(time))throw new Error('Invalid building effect time');
    if(time<this.time)this.observers.clear();this.time=time;
    const visible=new Set(inputs.map(i=>i.building.id));for(const id of this.observers.keys())if(!visible.has(id))this.observers.delete(id);
    const transient:BuildingEffectSample[]=[],sustained:BuildingEffectSample[]=[];
    for(const {building:b,anchors} of inputs){
      let observer=this.observers.get(b.id);
      if(!observer){observer={history:new BuildingCueHistory(),alive:b.alive,bursts:[],repairAt:-Infinity};this.observers.set(b.id,observer);}
      const cues=observer.history.observe(b,time);
      observer.bursts=observer.bursts.filter(p=>time-p.time<p.duration&&(b.alive||p.kind!=='repair-sparks'));
      if(b.removalReason==='cancelled'){observer.bursts=[];observer.alive=false;continue;}
      for(const cue of cues.impacts)observer.bursts.push({kind:'impact-dust',position:anchor(anchors.impact,b,cue.sequence,cue.source),time:cue.time,duration:.65,size:[2.1,1.4]});
      if(cues.repair&&b.repairCue&&b.repairCue.time-observer.repairAt>=.18){
        observer.repairAt=b.repairCue.time;observer.bursts.push({kind:'repair-sparks',position:anchor(anchors.repair,b,b.repairCue.sequence),time:b.repairCue.time,duration:.38,size:[2,2]});
      }
      if(observer.alive&&!b.alive&&b.removalReason==='combat'&&b.deathTime!==undefined&&time>=b.deathTime&&time-b.deathTime<1.4){
        if(anchors.collapse?.length){
          // Generic collapse: staggered corner dust, rising smoke, then a final settling puff.
          const [w,d]=anchors.collapseSize??[4,4],span=Math.max(w,d),c=anchors.collapse,cx=c.reduce((n,p)=>n+p[0],0)/c.length,cz=c.reduce((n,p)=>n+p[2],0)/c.length;
          c.slice(0,4).forEach((p,i)=>observer!.bursts.push({kind:'impact-dust',position:[...p],time:b.deathTime!+i*.2,duration:1.5,size:[span*.95,span*.68]}));
          observer.bursts.push({kind:'damage-smoke',position:[cx,.4,cz],time:b.deathTime+.3,duration:2.2,size:[span*1.1,span*1.6]});
          observer.bursts.push({kind:'impact-dust',position:[cx,.15,cz],time:b.deathTime+1.2,duration:1.2,size:[span*1.45,span*.95]});
        }else{const foundation=lowest(anchors.impact);observer.bursts.push({kind:'impact-dust',position:[...foundation],time:b.deathTime,duration:1.4,size:[4.8,3.2]});}
      }
      observer.alive=b.alive;observer.bursts=observer.bursts.slice(-6);
      for(const p of observer.bursts){
        const age=time-p.time,t=age/p.duration;if(t<0||t>=1)continue;
        const growth=p.kind==='impact-dust'?1+t*.5:p.kind==='damage-smoke'?1+t*.6:1;
        transient.push({kind:p.kind,position:[p.position[0],p.position[1]+age*.35,p.position[2]],size:[p.size[0]*growth,p.size[1]*growth],opacity:Math.min(1,(1-t)*2),rotation:0});
      }
      if(b.alive&&b.construction===1){
        const integrity=buildingIntegrity(b),top=anchors.impact.reduce((a,c)=>a[1]>c[1]?a:c),phase=time*2+b.id*.71;
        if(integrity<.65)sustained.push({kind:'damage-smoke',position:[top[0]+Math.sin(phase*.4)*.12,top[1],top[2]],size:[3.1,4.8],opacity:.5+.12*Math.sin(phase),rotation:.035*Math.sin(phase*.7)});
        if(integrity<.3)sustained.push({kind:'fire-ember',position:[...top],size:[1.7,2.4*(1+.05*Math.sin(phase*3))],opacity:.85+.1*Math.sin(phase*4),rotation:0});
      }
    }
    return [...transient,...sustained].slice(0,MAX_BUILDING_EFFECT_SPRITES);
  }
}
const frames:Record<BuildingEffectKind,{offset:[number,number];center:[number,number]}>= {
  'impact-dust':{offset:[0,.5],center:[.5,.22]},'repair-sparks':{offset:[.5,.5],center:[.43,.27]},
  'damage-smoke':{offset:[0,0],center:[.41,.08]},'fire-ember':{offset:[.5,0],center:[.49,.1]},
};
export class BuildingEffectLayer {
  readonly root=new THREE.Group();
  private timeline=new BuildingEffectTimeline();
  private views=new Map<BuildingEffectKind,THREE.Texture>();
  private sprites:THREE.Sprite[]=[];
  private disposed=false;
  constructor(texture:THREE.Texture){
    this.root.name='Building effects';
    for(const [kind,frame] of Object.entries(frames) as Array<[BuildingEffectKind,typeof frames[BuildingEffectKind]]>){
      const view=texture.clone();view.colorSpace=THREE.SRGBColorSpace;view.flipY=true;view.generateMipmaps=false;
      view.minFilter=view.magFilter=THREE.LinearFilter;view.wrapS=view.wrapT=THREE.ClampToEdgeWrapping;
      view.repeat.set(.5,.5);view.offset.fromArray(frame.offset);view.needsUpdate=true;this.views.set(kind,view);
    }
  }
  update(inputs:BuildingEffectInput[],time:number):void {
    if(this.disposed)return;const samples=this.timeline.update(inputs,time);
    for(let i=0;i<samples.length;i++){
      const p=samples[i];let sprite=this.sprites[i];
      if(!sprite){sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:this.views.get(p.kind),transparent:true,depthWrite:false,depthTest:true,toneMapped:false,blending:THREE.NormalBlending}));this.sprites.push(sprite);this.root.add(sprite);}
      sprite.name=p.kind;sprite.visible=true;sprite.material.map=this.views.get(p.kind)!;sprite.material.opacity=p.opacity;sprite.material.rotation=p.rotation;
      sprite.center.fromArray(frames[p.kind].center);sprite.position.fromArray(p.position);sprite.scale.set(p.size[0],p.size[1],1);
    }
    for(let i=samples.length;i<this.sprites.length;i++)this.sprites[i].visible=false;
  }
  dispose():void {
    if(this.disposed)return;this.disposed=true;for(const sprite of this.sprites)sprite.material.dispose();this.sprites=[];
    for(const view of this.views.values())view.dispose();this.views.clear();this.root.clear();this.root.removeFromParent();
  }
}
