export type GraphicsQuality='high'|'low';
export interface RtsSettings {volume:number;quality:GraphicsQuality;edgeScroll:boolean;cameraSpeed:number}
type Store=Pick<Storage,'getItem'|'setItem'>;
export const SETTINGS_KEY='rts.settings.v1';
export const DEFAULT_SETTINGS:Readonly<RtsSettings>={volume:70,quality:'high',edgeScroll:true,cameraSpeed:1};
export const CAMERA_SPEED={min:.5,max:2} as const;
/** Storage may be missing or throw on access (private windows, blocked site data, previews). */
export function browserStorage():Store|null {try{return window.localStorage;}catch{return null;}}
export function loadSettings(store:Store|null=browserStorage()):RtsSettings {
  let raw:Partial<Record<keyof RtsSettings,unknown>>={};
  try{const text=store?.getItem(SETTINGS_KEY);if(text){const parsed:unknown=JSON.parse(text);if(parsed&&typeof parsed==='object')raw=parsed;}}catch{/* Defaults below. */}
  const number=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max?v:undefined;
  return {volume:number(raw.volume,0,100)??DEFAULT_SETTINGS.volume,quality:raw.quality==='low'||raw.quality==='high'?raw.quality:DEFAULT_SETTINGS.quality,
    edgeScroll:typeof raw.edgeScroll==='boolean'?raw.edgeScroll:DEFAULT_SETTINGS.edgeScroll,cameraSpeed:number(raw.cameraSpeed,CAMERA_SPEED.min,CAMERA_SPEED.max)??DEFAULT_SETTINGS.cameraSpeed};
}
export function saveSettings(settings:RtsSettings,store:Store|null=browserStorage()):void {try{store?.setItem(SETTINGS_KEY,JSON.stringify(settings));}catch{/* Not persisted this session. */}}
/** Lobby AI difficulty (簡單 / 普通 / 困難); stored apart from the battle settings and chosen before a match. */
export type AiDifficulty='easy'|'normal'|'hard';
export const DIFFICULTY_KEY='rts.difficulty.v1';
export function loadDifficulty(store:Store|null=browserStorage()):AiDifficulty {
  try{const v=store?.getItem(DIFFICULTY_KEY);return v==='easy'||v==='hard'?v:'normal';}catch{return 'normal';}
}
export function saveDifficulty(difficulty:AiDifficulty,store:Store|null=browserStorage()):void {try{store?.setItem(DIFFICULTY_KEY,difficulty);}catch{/* Not persisted this session. */}}
/** Render-cost profile. Low skips the shadow pass, renders fewer pixels and switches models to LOD1 at twice the screen size. */
export function qualityProfile(quality:GraphicsQuality){
  return quality==='low'?{shadows:false,shadowMapSize:1024,pixelRatioCap:1,lodScale:.5}:{shadows:true,shadowMapSize:2048,pixelRatioCap:1.5,lodScale:1};
}
type ShadowRenderer={shadowMap:{enabled:boolean;needsUpdate:boolean}};
type ShadowLight={castShadow:boolean;shadow:{mapSize:{x:number;set(x:number,y:number):unknown};map:{dispose():void}|null}};
/** Toggling the shadow map changes the light state, so Three recompiles the affected programs once. */
export function applyShadowQuality(renderer:ShadowRenderer,sun:ShadowLight,profile:ReturnType<typeof qualityProfile>):void {
  renderer.shadowMap.enabled=profile.shadows;sun.castShadow=profile.shadows;
  if(!profile.shadows||sun.shadow.mapSize.x!==profile.shadowMapSize){sun.shadow.map?.dispose();sun.shadow.map=null;}
  sun.shadow.mapSize.set(profile.shadowMapSize,profile.shadowMapSize);renderer.shadowMap.needsUpdate=profile.shadows;
}
