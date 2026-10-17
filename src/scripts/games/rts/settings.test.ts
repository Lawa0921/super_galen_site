import {describe,it,expect} from 'vitest';
import {DEFAULT_SETTINGS,loadSettings,saveSettings,qualityProfile,applyShadowQuality,SETTINGS_KEY,loadDifficulty,saveDifficulty,DIFFICULTY_KEY} from './settings';

const memory=()=>{const data=new Map<string,string>();return {getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);},data};};
const throwing={getItem:()=>{throw new Error('SecurityError');},setItem:()=>{throw new Error('QuotaExceeded');}};

describe('persisted battle settings',()=>{
  it('round-trips volume, graphics quality, edge scrolling and camera speed',()=>{
    const store=memory(),settings={volume:35,quality:'low' as const,edgeScroll:false,cameraSpeed:1.5};
    saveSettings(settings,store);expect(store.data.has(SETTINGS_KEY)).toBe(true);
    expect(loadSettings(store)).toEqual(settings);
  });
  it('falls back to defaults for missing, corrupt or out-of-range values',()=>{
    const store=memory();expect(loadSettings(store)).toEqual(DEFAULT_SETTINGS);
    store.setItem(SETTINGS_KEY,'{not json');expect(loadSettings(store)).toEqual(DEFAULT_SETTINGS);
    store.setItem(SETTINGS_KEY,JSON.stringify({volume:400,quality:'ultra',edgeScroll:'yes',cameraSpeed:-3}));
    expect(loadSettings(store)).toEqual(DEFAULT_SETTINGS);
    store.setItem(SETTINGS_KEY,JSON.stringify({volume:0}));expect(loadSettings(store)).toEqual({...DEFAULT_SETTINGS,volume:0});
  });
  it('never throws when storage is blocked (private mode, sandboxed previews)',()=>{
    expect(loadSettings(throwing)).toEqual(DEFAULT_SETTINGS);expect(()=>saveSettings(DEFAULT_SETTINGS,throwing)).not.toThrow();
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
});

describe('persisted lobby difficulty',()=>{
  it('round-trips each level and defaults to normal for missing, unknown or blocked storage',()=>{
    const store=memory();expect(loadDifficulty(store)).toBe('normal');
    for(const d of ['easy','normal','hard'] as const){saveDifficulty(d,store);expect(store.data.get(DIFFICULTY_KEY)).toBe(d);expect(loadDifficulty(store)).toBe(d);}
    store.setItem(DIFFICULTY_KEY,'nightmare');expect(loadDifficulty(store)).toBe('normal');
    expect(loadDifficulty(throwing)).toBe('normal');expect(()=>saveDifficulty('hard',throwing)).not.toThrow();expect(loadDifficulty(null)).toBe('normal');
  });
});

describe('graphics quality',()=>{
  it('low quality drops the shadow pass, caps the pixel ratio and biases models toward LOD1',()=>{
    const high=qualityProfile('high'),low=qualityProfile('low');
    expect(high).toMatchObject({shadows:true,shadowMapSize:2048,lodScale:1});
    expect(low.shadows).toBe(false);expect(low.pixelRatioCap).toBeLessThan(high.pixelRatioCap);expect(low.lodScale).toBeLessThan(1);
  });
  it('turns the shadow map off and releases it, then restores it on high',()=>{
    let disposed=0;const renderer={shadowMap:{enabled:true,needsUpdate:false}},sun={castShadow:true,shadow:{mapSize:{x:2048,y:2048,set(x:number,y:number){this.x=x;this.y=y;}},map:{dispose:()=>{disposed++;}} as {dispose():void}|null}};
    applyShadowQuality(renderer,sun,qualityProfile('low'));
    expect(renderer.shadowMap.enabled).toBe(false);expect(sun.castShadow).toBe(false);expect(disposed).toBe(1);expect(sun.shadow.map).toBeNull();
    applyShadowQuality(renderer,sun,qualityProfile('high'));
    expect(renderer.shadowMap.enabled).toBe(true);expect(sun.castShadow).toBe(true);expect(renderer.shadowMap.needsUpdate).toBe(true);expect(sun.shadow.mapSize.x).toBe(2048);
  });
});
