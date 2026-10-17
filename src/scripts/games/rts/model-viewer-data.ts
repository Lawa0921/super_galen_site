/** Pure helpers for the dev-only model inspection page. Never imported by the game. */
import * as THREE from 'three';
import {BUILDINGS,UNITS,TIER_UPGRADES,type BuildingKind,type UnitKind} from './catalog';
import {REQUIRED_MODELS} from './models';

export type ModelGroupKey='unit'|'hero'|'building'|'prop';
export interface ModelItem {id:string;name:string}
export interface ModelGroup {key:ModelGroupKey;label:string;items:ModelItem[]}

const LABELS:Record<ModelGroupKey,string>={unit:'單位',hero:'英雄',building:'建築',prop:'地標・道具'};
const HEROES=new Set<string>(['commander']);
const UNIT_ORDER=Object.keys(UNITS).filter(id=>!HEROES.has(id));
const BUILDING_ORDER=['townhall','townhall-tier2','townhall-tier3',...Object.keys(BUILDINGS).filter(id=>id!=='townhall')];
const PROP_NAMES:Record<string,string>={
  'stone-bridge':'石橋',oak:'橡樹',pine:'松樹',rock:'岩石','gold-mine':'金礦','timber-pile':'木材堆',bolt:'弩箭','heavy-bolt':'重型弩矢',
  'river-gatehouse':'河關門樓','river-shrine':'河畔神龕','highland-watchtower':'高地瞭望塔','quarry-ruins':'採石場遺跡',
  'rubble-a':'瓦礫 A','rubble-b':'瓦礫 B',
};
const PROP_ORDER=Object.keys(PROP_NAMES);

export function modelDisplayName(id:string):string {
  if(id in UNITS)return UNITS[id as UnitKind].name;
  if(id in BUILDINGS)return BUILDINGS[id as BuildingKind].name;
  const tier=/^townhall-tier([23])$/.exec(id);if(tier)return TIER_UPGRADES[Number(tier[1]) as 2|3].name;
  return PROP_NAMES[id]??id;
}
/** Preview-gated roster units (and their projectiles) are published for style review but are not in
 * the game's load list, so the inspection room loads them itself. */
export function isPreviewModel(id:string):boolean {
  if(id in UNITS&&(UNITS[id as UnitKind] as {preview?:boolean}).preview)return true;
  return !id.startsWith('rubble-')&&!(REQUIRED_MODELS as readonly string[]).includes(id);
}
/** List label: catalog name, marked when the unit is still behind the preview gate. */
export function previewLabel(id:string):string {
  const preview=id in UNITS&&(UNITS[id as UnitKind] as {preview?:boolean}).preview;
  return modelDisplayName(id)+(preview?'（預覽・待審）':'');
}
function groupOf(id:string):ModelGroupKey {
  if(HEROES.has(id))return 'hero';
  if(id in UNITS)return 'unit';
  if(BUILDING_ORDER.includes(id))return 'building';
  return 'prop';
}
const ORDER:Record<ModelGroupKey,string[]>={unit:UNIT_ORDER,hero:[...HEROES],building:BUILDING_ORDER,prop:PROP_ORDER};
function rank(order:string[],id:string){const i=order.indexOf(id);return i<0?order.length:i;}

/** Groups registry ids in catalog order; unknown ids stay visible under props. */
export function groupModels(ids:readonly string[]):ModelGroup[] {
  return (Object.keys(LABELS) as ModelGroupKey[]).map(key=>({key,label:LABELS[key],
    items:ids.filter(id=>groupOf(id)===key).sort((a,b)=>rank(ORDER[key],a)-rank(ORDER[key],b)||a.localeCompare(b)).map(id=>({id,name:modelDisplayName(id)}))}))
    .filter(group=>group.items.length>0);
}

export interface TextureSize {width:number;height:number;count:number}
export interface ModelStats {meshes:number;triangles:number;vertices:number;drawCalls:number;materials:number;textures:TextureSize[];maxTextureSize:number;height:number;bones:number}

function visible(object:THREE.Object3D,root:THREE.Object3D):boolean {
  for(let node:THREE.Object3D|null=object;node;node=node===root?null:node.parent)if(!node.visible)return false;
  return true;
}
function imageSize(texture:THREE.Texture):{width:number;height:number}|undefined {
  const image=texture.image as {width?:number;height?:number}|undefined;
  return image&&Number.isFinite(image.width)&&Number.isFinite(image.height)?{width:image.width!,height:image.height!}:undefined;
}

/** Measures what is actually drawn: visible meshes only, textures deduplicated by GPU source. */
export function summarizeModel(root:THREE.Object3D):ModelStats {
  root.updateWorldMatrix(true,true);
  const materials=new Set<THREE.Material>(),sources=new Map<string,{width:number;height:number}>(),bones=new Set<THREE.Bone>(),box=new THREE.Box3();
  let meshes=0,triangles=0,vertices=0,drawCalls=0;
  root.traverse(object=>{
    if(!(object instanceof THREE.Mesh)||!visible(object,root))return;
    const geometry=object.geometry as THREE.BufferGeometry,index=geometry.index,total=index?.count??geometry.attributes.position?.count??0;
    // Batched assets may keep unreferenced vertices in a buffer; count only the drawn range.
    const start=Math.min(total,geometry.drawRange.start),count=Math.max(0,Math.min(total,start+geometry.drawRange.count)-start);
    meshes++;triangles+=Math.floor(count/3);
    if(index){const used=new Set<number>();for(let i=start;i<start+count;i++)used.add(index.getX(i));vertices+=used.size;}else vertices+=count;
    const list=Array.isArray(object.material)?object.material:[object.material];
    drawCalls+=Array.isArray(object.material)?Math.max(1,geometry.groups.length):1;
    for(const material of list){
      materials.add(material);
      for(const value of Object.values(material))if(value instanceof THREE.Texture){const size=imageSize(value);if(size)sources.set(value.source.uuid,size);}
    }
    if(object instanceof THREE.SkinnedMesh)object.skeleton.bones.forEach(bone=>bones.add(bone));
    box.union(new THREE.Box3().setFromObject(object,object instanceof THREE.SkinnedMesh));
  });
  const sizes=new Map<string,TextureSize>();
  for(const {width,height} of sources.values()){const key=width+'x'+height,entry=sizes.get(key);if(entry)entry.count++;else sizes.set(key,{width,height,count:1});}
  const textures=[...sizes.values()].sort((a,b)=>b.width*b.height-a.width*a.height);
  return {meshes,triangles,vertices,drawCalls,materials:materials.size,textures,maxTextureSize:Math.max(0,...textures.map(t=>Math.max(t.width,t.height))),height:box.isEmpty()?0:box.max.y-box.min.y,bones:bones.size};
}

export type ViewPreset='front'|'side'|'top'|'game';
/** Same offset as Battlefield.updateCamera: (+24, 52, +35) from the look-at point. */
export const GAME_VIEW_DIRECTION=new THREE.Vector3(24,52,35).normalize().toArray();
const DIRECTIONS:Record<ViewPreset,readonly number[]>={front:[0,.12,-1],side:[1,.12,0],top:[0,1,.001],game:GAME_VIEW_DIRECTION};
export function viewPreset(name:ViewPreset,center:{x:number;y:number;z:number},distance:number):{x:number;y:number;z:number} {
  const d=new THREE.Vector3().fromArray(DIRECTIONS[name]).normalize().multiplyScalar(distance);
  return {x:center.x+d.x,y:center.y+d.y,z:center.z+d.z};
}

const CLIP_GLOSS:Record<string,string>={idle:'待機',walk:'行走',attack:'攻擊',hurt:'受擊',death:'死亡',mine:'採金',chop:'伐木',build:'建造',
  cast:'施法',castblast:'施放曦光術',castcleave:'施放破陣斬',castmend:'施放戰地救援',castbanner:'施放王旗'};
export function clipLabel(name:string):string {const gloss=CLIP_GLOSS[name.toLowerCase()];return gloss?`${name} · ${gloss}`:name;}
