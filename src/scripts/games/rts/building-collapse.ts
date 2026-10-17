import * as THREE from 'three';
import {BUILDINGS,type BuildingKind} from './catalog';
import type {Footprint} from './maps';
import type {BuildingEffectAnchors} from './building-effects';

/** Generic, data-free building destruction (WC3-style): the intact model sinks
 * with a slight tilt and decaying shake while footprint-corner dust hides the
 * swap, then a shared original rubble prop scaled to the footprint remains.
 * Everything is a pure function of simulation time, so pause freezes it. */
export const COLLAPSE_SECONDS=2.6;
export const RUBBLE_APPEAR_AGE=1.1;
export const RUBBLE_RISE_SECONDS=.9;
export const RUBBLE_LIFETIME_SECONDS=45;
export const RUBBLE_SINK_SECONDS=8;
/** Authored rubble covers a 4 m x 4 m footprint, about 1.3 m high. */
export const RUBBLE_AUTHORED_FOOTPRINT=4;
const RUBBLE_AUTHORED_HEIGHT=1.3;
const RUBBLE_COVERAGE=.92;
/** Own small manifest; deliberately separate from model-registry.json. */
export const RUBBLE_MODELS=[
  {id:'rubble-a',url:'/assets/games/rts/models/props/rubble-a.glb'},
  {id:'rubble-b',url:'/assets/games/rts/models/props/rubble-b.glb'},
] as const;

type Point=[number,number,number];
export interface CollapsePose {sink:number;tiltX:number;tiltZ:number;shakeX:number;shakeZ:number;visible:boolean}
const hash=(seed:number)=>{const s=Math.sin(seed*12.9898+78.233)*43758.5453;return s-Math.floor(s);};

export function genericCollapsePose(age:number,height:number,seed:number):CollapsePose {
  if(!Number.isFinite(age)||age<0||!Number.isFinite(height))throw new Error('Invalid collapse age');
  const t=Math.min(1,age/COLLAPSE_SECONDS),settle=t*t*(3-2*t);
  // A short hesitation, then accelerating fall into the ground.
  const sink=Math.max(0,height)*1.04*(.12*settle+.88*t*t*t);
  const direction=hash(seed)*Math.PI*2,lean=(.06+.1*hash(seed+1))*settle;
  const shake=.07*(1-t)*Math.min(1,age/.15),phase=age*41+seed;
  return {sink,tiltX:Math.cos(direction)*lean,tiltZ:Math.sin(direction)*lean,shakeX:Math.sin(phase)*shake,shakeZ:Math.cos(phase*1.31)*shake,visible:age<COLLAPSE_SECONDS};
}
/** Adds the pose to a root whose base position was set this frame. */
export function applyCollapsePose(root:THREE.Object3D,pose:CollapsePose):void {
  root.position.x+=pose.shakeX;root.position.z+=pose.shakeZ;root.position.y-=pose.sink;
  root.rotation.x=pose.tiltX;root.rotation.z=pose.tiltZ;root.visible=pose.visible;
}
/** Effect anchors from the simulation footprint for art without authored anchors. */
export function genericEffectAnchors(b:{kind:BuildingKind;x:number;z:number},height:number):BuildingEffectAnchors {
  const d=BUILDINGS[b.kind],hx=d.width/2*.85,hz=d.depth/2*.85,top=Math.max(1,height*.78);
  const corners:Point[]=[[b.x-hx,.25,b.z-hz],[b.x+hx,.25,b.z-hz],[b.x+hx,.25,b.z+hz],[b.x-hx,.25,b.z+hz]];
  return {impact:[...corners.map(p=>[p[0],height*.35,p[2]] as Point),[b.x,top,b.z]],repair:[[b.x,height*.5,b.z],[b.x,top*.9,b.z]],collapse:corners,collapseSize:[d.width,d.depth]};
}

export interface RubbleSource {id:number;kind:BuildingKind;x:number;z:number;alive:boolean;deathTime?:number;construction:number;removalReason?:'combat'|'cancelled'}
interface RubbleInstance {root:THREE.Object3D;dispose():void}
interface Rubble {source:RubbleSource&{deathTime:number};instance?:RubbleInstance;done:boolean}
export class BuildingRubbleLayer {
  readonly root=new THREE.Group();
  private records=new Map<number,Rubble>();
  private disposed=false;
  constructor(private create:(variant:number)=>RubbleInstance){this.root.name='Building rubble';}
  /** Call for every visible dead building; idempotent per entity. */
  observe(b:RubbleSource):void {
    if(this.disposed||b.alive||b.removalReason==='cancelled'||b.deathTime===undefined||this.records.has(b.id))return;
    this.records.set(b.id,{source:{id:b.id,kind:b.kind,x:b.x,z:b.z,alive:false,deathTime:b.deathTime,construction:b.construction},done:false});
  }
  get size():number {let n=0;for(const r of this.records.values())if(r.instance)n++;return n;}
  update(time:number,explored:ArrayLike<number>,occupied:Footprint[],width:number):void {
    if(this.disposed)return;
    for(const record of this.records.values()){
      const s=record.source,age=time-s.deathTime;
      if(age<0){this.release(record);this.records.delete(s.id);continue;}
      // Any overlap between a new footprint and the ruined one clears the rubble (edge contact does not).
      const ruin=BUILDINGS[s.kind],blocked=occupied.some(f=>Math.abs(f.x-s.x)<(f.width+ruin.width)/2-1e-6&&Math.abs(f.z-s.z)<(f.depth+ruin.depth)/2-1e-6);
      if(record.done||age<RUBBLE_APPEAR_AGE)continue;
      if(age>=RUBBLE_LIFETIME_SECONDS||blocked){this.release(record);record.done=true;continue;}
      if(!record.instance){record.instance=this.create(Math.floor(hash(s.id*3.7+11)*RUBBLE_MODELS.length)%RUBBLE_MODELS.length);this.root.add(record.instance.root);}
      // Deterministic per-building variety: full-circle yaw, ±8% size, seeded mirror.
      const jitter=.92+.16*hash(s.id*5.3+2),mirror=hash(s.id*7.1+5)<.5?-1:1,yaw=hash(s.id*1.9+17)*Math.PI*2;
      const d=BUILDINGS[s.kind],root=record.instance.root,sx=d.width/RUBBLE_AUTHORED_FOOTPRINT*RUBBLE_COVERAGE*jitter,sz=d.depth/RUBBLE_AUTHORED_FOOTPRINT*RUBBLE_COVERAGE*jitter;
      const rise=Math.min(1,(age-RUBBLE_APPEAR_AGE)/RUBBLE_RISE_SECONDS),grow=.35+.65*rise*rise*(3-2*rise);
      const sy=Math.max(.75,Math.min(1.7,Math.sqrt(sx*sz)))*(.6+.4*Math.max(0,Math.min(1,s.construction)));
      const sinkT=Math.max(0,(age-(RUBBLE_LIFETIME_SECONDS-RUBBLE_SINK_SECONDS))/RUBBLE_SINK_SECONDS);
      root.position.set(s.x,sinkT>0?-RUBBLE_AUTHORED_HEIGHT*sy*1.05*sinkT*sinkT:0,s.z);root.rotation.y=yaw;root.scale.set(sx*mirror,sy*grow,sz);
      root.visible=explored[Math.floor(s.z)*width+Math.floor(s.x)]===1;
    }
  }
  private release(record:Rubble):void {if(record.instance){record.instance.dispose();record.instance.root.removeFromParent();record.instance=undefined;}}
  dispose():void {
    if(this.disposed)return;this.disposed=true;for(const record of this.records.values())this.release(record);this.records.clear();this.root.removeFromParent();
  }
}
