import * as THREE from 'three';
import {groupModels,modelDisplayName,summarizeModel,viewPreset,clipLabel,GAME_VIEW_DIRECTION,isPreviewModel,previewLabel} from './model-viewer-data';

describe('preview-gated roster units',()=>{
  it('flags catalog preview units and models outside the game load list so the viewer loads them itself',()=>{
    expect(isPreviewModel('pikeman')).toBe(true);
    expect(isPreviewModel('mage')).toBe(true);
    expect(isPreviewModel('arrow')).toBe(true);
    expect(isPreviewModel('guard')).toBe(false);
    expect(isPreviewModel('oak')).toBe(false);
  });
  it('labels preview units as pending style review and lists them with the units',()=>{
    expect(previewLabel('ranger')).toBe('遊俠（預覽・待審）');
    expect(previewLabel('guard')).toBe('王國衛兵');
    expect(groupModels(['guard','ranger'])[0].items.map(i=>i.id)).toEqual(['guard','ranger']);
  });
});

describe('model viewer grouping',()=>{
  it('groups registry ids into units, hero, buildings and props with catalog names',()=>{
    const groups=groupModels(['oak','townhall-tier2','commander','worker','barracks','townhall','rubble-a','guard']);
    expect(groups.map(g=>g.label)).toEqual(['單位','英雄','建築','地標・道具']);
    expect(groups[0].items).toEqual([{id:'worker',name:'工人'},{id:'guard',name:'王國衛兵'}]);
    expect(groups[1].items).toEqual([{id:'commander',name:'誓衛統領'}]);
    expect(groups[2].items.map(i=>i.id)).toEqual(['townhall','townhall-tier2','barracks']);
    expect(groups[2].items[1].name).toBe('城堡');
    expect(groups[3].items.map(i=>i.name)).toEqual(['橡樹','瓦礫 A']);
  });
  it('omits empty groups and keeps unknown ids visible under props by their id',()=>{
    const groups=groupModels(['mystery-thing']);
    expect(groups).toEqual([{key:'prop',label:'地標・道具',items:[{id:'mystery-thing',name:'mystery-thing'}]}]);
    expect(modelDisplayName('neutral-raider')).toBe('灰斗篷掠兵');
  });
});

describe('model stats',()=>{
  it('counts only visible meshes, unique materials and unique texture sources',()=>{
    const texture=new THREE.DataTexture(new Uint8Array(4*8*4),8,4);
    const twin=texture.clone();
    const a=new THREE.MeshStandardMaterial({map:texture,normalMap:twin}),b=new THREE.MeshStandardMaterial();
    const indexed=new THREE.BoxGeometry(1,2,1);
    const root=new THREE.Group();
    root.add(new THREE.Mesh(indexed,a));
    root.add(new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(new Array(18).fill(0),3)),[a,b]));
    const hidden=new THREE.Group();hidden.visible=false;hidden.add(new THREE.Mesh(new THREE.BoxGeometry(),b));root.add(hidden);
    const stats=summarizeModel(root);
    expect(stats.meshes).toBe(2);
    expect(stats.triangles).toBe(12+2);
    expect(stats.materials).toBe(2);
    expect(stats.textures).toEqual([{width:8,height:4,count:1}]);
    expect(stats.maxTextureSize).toBe(8);
    expect(stats.height).toBeCloseTo(2);
    expect(stats.bones).toBe(0);
  });
  it('counts only vertices referenced by the drawn index range',()=>{
    const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(new Array(30).fill(0),3));
    geometry.setIndex([0,1,2,2,1,3,4,5,6]);geometry.setDrawRange(0,6);
    const stats=summarizeModel(new THREE.Mesh(geometry,new THREE.MeshStandardMaterial()));
    expect(stats.vertices).toBe(4);
    expect(stats.triangles).toBe(2);
  });
  it('reports zero-sized stats for an empty root',()=>{
    const stats=summarizeModel(new THREE.Group());
    expect(stats).toMatchObject({meshes:0,triangles:0,materials:0,textures:[],maxTextureSize:0,height:0});
  });
});

describe('view presets',()=>{
  it('places the game preset along the in-game orthographic camera offset',()=>{
    const p=viewPreset('game',{x:1,y:2,z:3},10);
    const d=new THREE.Vector3(p.x-1,p.y-2,p.z-3);
    expect(d.length()).toBeCloseTo(10);
    expect(d.normalize().toArray()).toEqual(GAME_VIEW_DIRECTION.map(v=>expect.closeTo(v,6)));
    expect(GAME_VIEW_DIRECTION[1]).toBeCloseTo(52/Math.hypot(24,52,35));
  });
  it('front looks at the authored -z facing, side from +x and top from above',()=>{
    const o={x:0,y:0,z:0},front=viewPreset('front',o,5);
    expect(front.z).toBeLessThan(-4.9);expect(Math.hypot(front.x,front.y,front.z)).toBeCloseTo(5);
    expect(viewPreset('side',o,5).x).toBeGreaterThan(4.9);
    const top=viewPreset('top',o,5);expect(top.y).toBeCloseTo(5,3);expect(Math.abs(top.z)).toBeGreaterThan(0);
  });
});

describe('clip labels',()=>{
  it('adds a Chinese gloss to known clips and leaves unknown clip names unchanged',()=>{
    expect(clipLabel('Idle')).toBe('Idle · 待機');
    expect(clipLabel('CastBlast')).toBe('CastBlast · 施放曦光術');
    expect(clipLabel('CastCleave')).toBe('CastCleave · 施放破陣斬');
    expect(clipLabel('Wave')).toBe('Wave');
  });
});
