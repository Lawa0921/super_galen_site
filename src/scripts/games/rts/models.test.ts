import {describe,it,expect,vi,afterEach,beforeEach} from 'vitest';
import * as THREE from 'three';
import {GLTFLoader,type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {validateModelManifest,REQUIRED_MODELS,ModelLibrary,ModelInstance} from './models';
import {prepareTeamMasks} from './team-material';
import {GUARD_MOTION} from './catalog';
import {LANDMARK_MODELS} from './landmark-models';
import {RUBBLE_MODELS} from './building-collapse';
const landmarkEntry=(id:string)=>LANDMARK_MODELS.includes(id)?{scale:1,lod1:`/assets/games/rts/models/${id}-lod1.glb`}:{};
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
beforeEach(()=>{vi.spyOn(THREE.TextureLoader.prototype,'loadAsync').mockResolvedValue(new THREE.Texture());});
describe('runtime art publication boundary',()=>{
  it.each([{status:'candidate',url:'/assets/games/rts/effects/building-effects-atlas.png'},{status:'published',url:'https://example.com/fx.png'}])('rejects unapproved or external building effects',building=>{
    const assets=Object.fromEntries(REQUIRED_MODELS.map(id=>[id,{...landmarkEntry(id),url:`/assets/games/rts/models/${id}.glb`,status:'published'}]));
    expect(()=>validateModelManifest({assets,effects:{building}})).toThrow('building effects');
  });
  it('loads the one published effect atlas once and disposes its source with the library',async()=>{
    const assets=Object.fromEntries(REQUIRED_MODELS.map(id=>[id,{...landmarkEntry(id),url:`/assets/games/rts/models/${id}.glb`,status:'published'}]));
    const url='/assets/games/rts/effects/building-effects-atlas.png',texture=new THREE.Texture<HTMLImageElement>();
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({assets,effects:{building:{status:'published',url}}})}));
    vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async()=>({scene:new THREE.Group(),animations:[]} as unknown as GLTF));
    const load=vi.spyOn(THREE.TextureLoader.prototype,'loadAsync').mockImplementation(async()=>texture),dispose=vi.spyOn(texture,'dispose');
    const library=new ModelLibrary();await library.load(()=>{});expect(library.buildingEffects()).toBe(texture);await library.load(()=>{});
    expect(load.mock.calls.filter(([path])=>path===url)).toHaveLength(1);library.dispose();expect(dispose).toHaveBeenCalledTimes(1);
  });
  it.each([{status:'candidate',url:'/assets/games/rts/terrain/valley-undergrowth.webp'},{status:'published',url:'https://example.com/plants.webp'}])('rejects unapproved or external landscape artwork',undergrowth=>{
    const assets=Object.fromEntries(REQUIRED_MODELS.map(id=>[id,{...landmarkEntry(id),url:`/assets/games/rts/models/${id}.glb`,status:'published'}]));
    expect(()=>validateModelManifest({assets,landscape:{undergrowth}})).toThrow('undergrowth');
  });
  it.each([{status:'candidate',url:'/assets/games/rts/terrain/kingdom-ruins.webp'},{status:'published',url:'https://example.com/ruins.webp'}])('rejects unapproved or external ruins',ruins=>{
    const assets=Object.fromEntries(REQUIRED_MODELS.map(id=>[id,{...landmarkEntry(id),url:`/assets/games/rts/models/${id}.glb`,status:'published'}]));
    expect(()=>validateModelManifest({assets,landscape:{undergrowth:{url:'/assets/games/rts/terrain/valley-undergrowth.webp',status:'published'},ruins}})).toThrow('ruins');
  });
  it('requires both original projectile meshes before entering battle',()=>{
    const assets=Object.fromEntries(REQUIRED_MODELS.map(id=>[id,{...landmarkEntry(id),url:`/assets/games/rts/models/${id}.glb`,status:'published'}]));
    delete assets.bolt;delete assets['heavy-bolt'];expect(()=>validateModelManifest({assets})).toThrow();
  });
  it('loads only complete published local GLB assets',()=>{const assets=Object.fromEntries(REQUIRED_MODELS.map(id=>[id,{...landmarkEntry(id),url:`/assets/games/rts/models/${id}.glb`,status:'published'}]));expect(()=>validateModelManifest({assets})).not.toThrow();});
  it('rejects missing, unreviewed and external assets without placeholder substitution',()=>{
    expect(()=>validateModelManifest({assets:{}})).toThrow();
    const assets=Object.fromEntries(REQUIRED_MODELS.map(id=>[id,{...landmarkEntry(id),url:`/assets/games/rts/models/${id}.glb`,status:'published'}]));assets.guard.status='candidate';expect(()=>validateModelManifest({assets})).toThrow();
    assets.guard.status='published';assets.guard.url='https://example.com/guard.glb';expect(()=>validateModelManifest({assets})).toThrow();
  });
  it('rejects an external secondary LOD just like the primary mesh',()=>{
    const assets=Object.fromEntries(REQUIRED_MODELS.map(id=>[id,{...landmarkEntry(id),url:`/assets/games/rts/models/${id}.glb`,status:'published',lod1:id==='guard'?'https://example.com/guard-lod1.glb':landmarkEntry(id).lod1}]));
    expect(()=>validateModelManifest({assets})).toThrow();
  });
});

describe('model loading lifecycle',()=>{
  it('deduplicates the courtyard surface and fails closed if it is missing',async()=>{
    const assets=Object.fromEntries(REQUIRED_MODELS.map(id=>[id,{...landmarkEntry(id),url:`/assets/games/rts/models/${id}.glb`,status:'published'}]));
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({assets})}));
    vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async function(this:GLTFLoader){
      expect(this.manager.getHandler('../terrain/dirt-road.png')).not.toBeNull();
      this.manager.itemError('/assets/games/rts/terrain/dirt-road.png');
      return {scene:new THREE.Group(),animations:[]} as unknown as GLTF;
    });
    const library=new ModelLibrary();await expect(library.load(()=>{},'river')).rejects.toThrow('Required model texture unavailable');
    expect(()=>library.instantiate('barracks')).toThrow('Model not loaded');
  });
  it('fails the load when a required shared material fails even if GLTFLoader resolves an untextured model',async()=>{
    const assets=Object.fromEntries(REQUIRED_MODELS.map(id=>[id,{...landmarkEntry(id),url:`/assets/games/rts/models/${id}.glb`,status:'published'}]));
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({assets})}));
    vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async function(this:GLTFLoader){
      this.manager.itemError('/assets/games/rts/materials/detail-v1/ashlar-color.jpg');
      return {scene:new THREE.Group(),animations:[]} as unknown as GLTF;
    });
    const library=new ModelLibrary();await expect(library.load(()=>{},'river')).rejects.toThrow('Required model texture unavailable');
    expect(()=>library.instantiate('guard')).toThrow('Model not loaded');
  });
  it.each(['jpg','png','webp'])('routes content-addressed %s images through the same library-scoped texture loader',async format=>{
    const assets=Object.fromEntries(REQUIRED_MODELS.map(id=>[id,{...landmarkEntry(id),url:`/assets/games/rts/models/${id}.glb`,status:'published'}]));
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({assets})}));
    const handlers:unknown[]=[];
    vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async function(this:GLTFLoader){
      const unitHandler=this.manager.getHandler(`../materials/unit-shared/${'a'.repeat(64)}.${format}`);
      expect(unitHandler).not.toBeNull();
      expect(this.manager.getHandler(`../../materials/unit-shared/${'a'.repeat(64)}.${format}`)).toBe(unitHandler);
      expect(unitHandler).toBe(this.manager.getHandler('../materials/detail-v1/ashlar-color.jpg'));
      expect(this.manager.getHandler(`../materials/unit-shared/not-a-content-hash.${format}`)).toBeNull();
      expect(this.manager.getHandler(`../../../materials/unit-shared/${'a'.repeat(64)}.${format}`)).toBeNull();
      handlers.push(unitHandler);
      return {scene:new THREE.Group(),animations:[]} as unknown as GLTF;
    });
    const library=new ModelLibrary();await library.load(()=>{},'river');
    expect(handlers.length).toBeGreaterThan(1);expect(new Set(handlers).size).toBe(1);library.dispose();
  });
  it('routes every external image of every published GLB through the one library-scoped loader (one download per file)',async()=>{
    // Without a handler GLTFLoader fetches the image once per GLB that references it: the polish-v1 equipment atlas was
    // downloaded 14 times on the first map. Every external uri in the shipped models must hit the shared handler.
    const {readFileSync,readdirSync}=await import('node:fs'),path=await import('node:path');
    const dir=path.resolve(__dirname,'../../../../public/assets/games/rts/models');
    const uris=new Set<string>();
    for(const rel of [...readdirSync(dir),...readdirSync(path.join(dir,'props')).map(f=>'props/'+f)].filter(f=>f.endsWith('.glb'))){
      const b=readFileSync(path.join(dir,rel)),json=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString()) as {images?:{uri?:string}[]};
      for(const image of json.images??[])if(image.uri)uris.add(image.uri);
    }
    expect([...uris].some(uri=>uri.includes('/polish-v1/'))).toBe(true);
    const assets=Object.fromEntries(REQUIRED_MODELS.map(id=>[id,{...landmarkEntry(id),url:`/assets/games/rts/models/${id}.glb`,status:'published'}]));
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({assets})}));
    const unrouted=new Set<string>(),handlers=new Set<unknown>();
    vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async function(this:GLTFLoader){
      for(const uri of uris){const handler=this.manager.getHandler(uri);if(handler)handlers.add(handler);else unrouted.add(uri);}
      expect(this.manager.getHandler('../materials/polish-v1/../../../escape.jpg')).toBeNull();
      expect(this.manager.getHandler('https://example.com/materials/polish-v1/a-color.jpg')).toBeNull();
      return {scene:new THREE.Group(),animations:[]} as unknown as GLTF;
    });
    const library=new ModelLibrary();await library.load(()=>{},'river');
    expect([...unrouted]).toEqual([]);expect(handlers.size).toBe(1);library.dispose();
  });
  it('rejects missing unit images and permits retry after the failed batch is disposed',async()=>{
    const assets=Object.fromEntries(REQUIRED_MODELS.map(id=>[id,{...landmarkEntry(id),url:`/assets/games/rts/models/${id}.glb`,status:'published'}]));
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({assets})}));
    let fail=true;
    vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async function(this:GLTFLoader){
      if(fail)this.manager.itemError(`/assets/games/rts/materials/unit-shared/${'a'.repeat(64)}.webp`);
      return {scene:new THREE.Group(),animations:[]} as unknown as GLTF;
    });
    const library=new ModelLibrary();await expect(library.load(()=>{},'river')).rejects.toThrow('Required model texture unavailable');
    expect(()=>library.instantiate('guard')).toThrow('Model not loaded');
    fail=false;await expect(library.load(()=>{},'river')).resolves.toBeUndefined();
    expect(library.instantiate('guard')).toBeInstanceOf(ModelInstance);library.dispose();
  });
  it('loads registered vegetation once across maps and releases its shared texture',async()=>{
    const assets=Object.fromEntries(REQUIRED_MODELS.map(id=>[id,{...landmarkEntry(id),url:`/assets/games/rts/models/${id}.glb`,status:'published'}]));
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({assets,landscape:{undergrowth:{url:'/assets/games/rts/terrain/valley-undergrowth.webp',status:'published'},ruins:{url:'/assets/games/rts/terrain/kingdom-ruins.webp',status:'published'}}})}));
    vi.spyOn(GLTFLoader.prototype,'loadAsync').mockResolvedValue({scene:new THREE.Group(),animations:[]} as unknown as GLTF);
    const library=new ModelLibrary();await library.load(()=>{},'river');const texture=library.undergrowth()!;expect(texture).toBeInstanceOf(THREE.Texture);
    const dispose=vi.spyOn(texture,'dispose');await library.load(()=>{},'pass');expect(library.undergrowth()).toBe(texture);
    expect(vi.mocked(THREE.TextureLoader.prototype.loadAsync).mock.calls.filter(([url])=>url.includes('undergrowth'))).toHaveLength(1);
    expect(vi.mocked(THREE.TextureLoader.prototype.loadAsync).mock.calls.filter(([url])=>url.includes('ruins'))).toHaveLength(0);
    library.dispose();expect(dispose).toHaveBeenCalledOnce();expect(library.undergrowth()).toBeUndefined();
  });
  it('consumes authored locomotion and contact metadata while keeping instance phases independent',()=>{
    const make=()=>{const scene=new THREE.Group(),body=new THREE.Object3D();body.name='Body';scene.add(body);scene.userData.rtsMotion=structuredClone(GUARD_MOTION);
      return {scene,animations:[new THREE.AnimationClip('Walk',2/3,[new THREE.NumberKeyframeTrack('Body.position[x]',[0,2/3],[0,1])]),
        new THREE.AnimationClip('Attack',1.5,[new THREE.NumberKeyframeTrack('Body.position[y]',[0,1.5],[0,1])])]} as unknown as GLTF;};
    const entry={url:'/assets/games/rts/models/guard.glb',status:'published' as const},gltfA=make(),gltfB=make(),a=new ModelInstance(gltfA,entry),b=new ModelInstance(gltfB,entry);
    a.animate('attack',0,{sequence:1,elapsed:.4});
    const attackA=a.mixer.existingAction(gltfA.animations[1])!;expect(attackA.time).toBeCloseTo(.5);
    a.animate('walk',.2,undefined,1.5);b.animate('walk',.2,undefined,4.5);
    const walkA=a.mixer.existingAction(gltfA.animations[0])!,walkB=b.mixer.existingAction(gltfB.animations[0])!;
    expect(walkA.time).toBeCloseTo(.1);expect(walkB.time).toBeCloseTo(.3);expect(a.mixer).not.toBe(b.mixer);
    a.dispose();b.dispose();
  });
  it('follows speed changes during the same walk cycle and resumes from a stationary pose in both LODs',()=>{
    const make=()=>{const scene=new THREE.Group(),body=new THREE.Object3D();body.name='Body';scene.add(body);scene.userData.rtsMotion=structuredClone(GUARD_MOTION);
      return {scene,animations:[new THREE.AnimationClip('Walk',2/3,[new THREE.NumberKeyframeTrack('Body.position[x]',[0,2/3],[0,1])]),new THREE.AnimationClip('Attack',1.2,[])]} as unknown as GLTF;};
    const high=make(),low=make(),model=new ModelInstance(high,{url:'/assets/games/rts/models/guard.glb',status:'published'},0,false,low);
    const phases=()=>model.root.children.map(root=>root.getObjectByName('Body')!.position.x);
    model.animate('walk',.2,undefined,3);phases().forEach(x=>expect(x).toBeCloseTo(.3));
    model.animate('walk',.1,undefined,1.5);phases().forEach(x=>expect(x).toBeCloseTo(.375));
    model.setDetailPixels(20);model.animate('walk',.2,undefined,0);phases().forEach(x=>expect(x).toBeCloseTo(.375));
    model.animate('walk',.1,undefined,6);phases().forEach(x=>expect(x).toBeCloseTo(.675));model.dispose();
  });
  it('fails closed when authored metadata names a clip missing from the GLB',()=>{
    const scene=new THREE.Group();scene.userData.rtsMotion=structuredClone(GUARD_MOTION);
    const gltf={scene,animations:[new THREE.AnimationClip('Idle',1,[])]} as unknown as GLTF;
    expect(()=>new ModelInstance(gltf,{url:'/assets/games/rts/models/guard.glb',status:'published'})).toThrow('RTS motion clip missing from asset');
  });
  it('rejects motion metadata that differs between LODs',()=>{
    const make=(stride:number)=>{const scene=new THREE.Group();scene.userData.rtsMotion={...structuredClone(GUARD_MOTION),locomotion:{...GUARD_MOTION.locomotion,strideMeters:stride}};return {scene,animations:[new THREE.AnimationClip('Walk',2/3,[]),new THREE.AnimationClip('Attack',1.2,[])]} as unknown as GLTF;};
    expect(()=>new ModelInstance(make(2),{url:'/assets/games/rts/models/guard.glb',status:'published'},0,false,make(2.1))).toThrow('RTS motion metadata differs between LODs');
  });
  it('restarts both LODs for each new attack cue and clamps a completed swing',()=>{
    const make=()=>{const scene=new THREE.Group(),body=new THREE.Object3D();body.name='Body';scene.add(body);
      return {scene,animations:[new THREE.AnimationClip('Attack',1,[new THREE.NumberKeyframeTrack('Body.position[x]',[0,1],[0,1])])]} as unknown as GLTF;};
    const model=new ModelInstance(make(),{url:'/assets/games/rts/models/guard.glb',status:'published'},0,false,make());
    const positions=()=>model.root.children.map(root=>root.getObjectByName('Body')!.position.x);
    model.animate('attack',.1,{sequence:1,elapsed:.35});expect(positions()).toEqual([.35,.35]);
    model.animate('attack',.2,{sequence:1,elapsed:.35});positions().forEach(x=>expect(x).toBeCloseTo(.55));
    model.setDetailPixels(20);model.animate('attack',1,{sequence:1,elapsed:.35});expect(positions()).toEqual([1,1]);
    model.animate('attack',.1,{sequence:2,elapsed:0});expect(positions()).toEqual([0,0]);
    model.animate('attack',.25,{sequence:2,elapsed:0});expect(positions()).toEqual([.25,.25]);model.dispose();
  });
  it('holds a completed cue for a late visible unit and does not advance while paused',()=>{
    const scene=new THREE.Group(),body=new THREE.Object3D();body.name='Body';scene.add(body);
    const animations=[new THREE.AnimationClip('Attack',1,[new THREE.NumberKeyframeTrack('Body.position[x]',[0,1],[0,1])])];
    const model=new ModelInstance({scene,animations} as unknown as GLTF,{url:'/assets/games/rts/models/guard.glb',status:'published'});
    model.animate('attack',0,{sequence:6,elapsed:3});expect(model.root.getObjectByName('Body')!.position.x).toBe(1);
    model.animate('attack',0,{sequence:7,elapsed:.4});model.animate('attack',0,{sequence:7,elapsed:.4});
    expect(model.root.getObjectByName('Body')!.position.x).toBeCloseTo(.4);model.dispose();
  });
  it('catches up the same attack cue after a stalled render without losing smooth intervening frames',()=>{
    const scene=new THREE.Group(),body=new THREE.Object3D();body.name='Body';scene.add(body);
    const animations=[new THREE.AnimationClip('Attack',1,[new THREE.NumberKeyframeTrack('Body.position[x]',[0,1],[0,1])])];
    const model=new ModelInstance({scene,animations} as unknown as GLTF,{url:'/assets/games/rts/models/guard.glb',status:'published'});
    const x=()=>model.root.getObjectByName('Body')!.position.x;
    model.animate('attack',0,{sequence:1,elapsed:0});model.animate('attack',.016,{sequence:1,elapsed:0});expect(x()).toBeCloseTo(.016);
    model.animate('attack',.1,{sequence:1,elapsed:.25});expect(x()).toBeCloseTo(.25);
    model.animate('attack',.1,{sequence:1,elapsed:.5});expect(x()).toBeCloseTo(.5);
    model.animate('attack',.016,{sequence:1,elapsed:.5});expect(x()).toBeCloseTo(.516);model.dispose();
  });
  it('advances the Idle-to-Attack fade clock when every rendered frame has a new simulation age',()=>{
    const make=()=>{const scene=new THREE.Group(),body=new THREE.Object3D();body.name='Body';scene.add(body);
      return {scene,animations:[new THREE.AnimationClip('Idle',1,[new THREE.NumberKeyframeTrack('Body.position[x]',[0,1],[0,0])]),
        new THREE.AnimationClip('Attack',1,[new THREE.NumberKeyframeTrack('Body.position[x]',[0,1],[0,1])])]} as unknown as GLTF;};
    const model=new ModelInstance(make(),{url:'/assets/games/rts/models/guard.glb',status:'published'},0,false,make());
    model.animate('idle',.1);
    for(let tick=0;tick<=5;tick++)model.animate('attack',.05,{sequence:1,elapsed:tick*.05});
    for(const root of model.root.children)expect(root.getObjectByName('Body')!.position.x).toBeCloseTo(.25);
    expect(model.mixer.time).toBeCloseTo(.4);model.dispose();
  });
  it('keeps attack seconds unwarped when fading from a longer idle clip through both LODs',()=>{
    const make=()=>{const scene=new THREE.Group(),body=new THREE.Object3D();body.name='Body';scene.add(body);
      return {scene,animations:[new THREE.AnimationClip('Idle',2,[new THREE.NumberKeyframeTrack('Body.position[x]',[0,2],[0,0])]),
        new THREE.AnimationClip('Attack',1,[new THREE.NumberKeyframeTrack('Body.position[x]',[0,1],[0,1])])]} as unknown as GLTF;};
    const primary=make(),model=new ModelInstance(primary,{url:'/assets/games/rts/models/guard.glb',status:'published'},0,false,make());
    const pose=()=>model.root.children.map(root=>root.getObjectByName('Body')!.position.x);
    model.animate('idle',.1);model.animate('attack',.05,{sequence:1,elapsed:0});
    model.animate('attack',.016,{sequence:1,elapsed:0});
    expect(model.mixer.existingAction(primary.animations[1])!.time).toBeCloseTo(.016,6);
    model.setDetailPixels(20);model.animate('attack',.1,{sequence:1,elapsed:.25});
    pose().forEach(x=>expect(x).toBeCloseTo(.25));
    model.animate('attack',.016,{sequence:1,elapsed:.25});pose().forEach(x=>expect(x).toBeCloseTo(.266));
    model.animate('attack',.1,{sequence:1,elapsed:1.2});model.animate('attack',.1,{sequence:1,elapsed:1.2});expect(pose()).toEqual([1,1]);
    model.animate('attack',.05,{sequence:2,elapsed:0});expect(pose()).toEqual([0,0]);
    model.animate('attack',.016,{sequence:2,elapsed:0});pose().forEach(x=>expect(x).toBeCloseTo(.016));model.dispose();
  });
  it('restores real-time attack speed after the previous swing was warped into idle',()=>{
    const make=()=>{const scene=new THREE.Group(),body=new THREE.Object3D();body.name='Body';scene.add(body);
      return {scene,animations:[new THREE.AnimationClip('Idle',2,[new THREE.NumberKeyframeTrack('Body.position[x]',[0,2],[0,0])]),
        new THREE.AnimationClip('Attack',1,[new THREE.NumberKeyframeTrack('Body.position[x]',[0,1],[0,1])])]} as unknown as GLTF;};
    const primary=make(),model=new ModelInstance(primary,{url:'/assets/games/rts/models/guard.glb',status:'published'},0,false,make());
    model.animate('attack',.05,{sequence:1,elapsed:.2});model.animate('idle',.2);
    model.animate('attack',.05,{sequence:2,elapsed:0});model.animate('attack',.016,{sequence:2,elapsed:0});
    expect(model.mixer.existingAction(primary.animations[1])!.time).toBeCloseTo(.016,6);
    model.animate('attack',.2,{sequence:2,elapsed:.25});model.setDetailPixels(20);
    model.animate('attack',.016,{sequence:2,elapsed:.25});
    for(const root of model.root.children)expect(root.getObjectByName('Body')!.position.x).toBeCloseTo(.266);model.dispose();
  });
  it('keeps animated parts pickable outside their first pose sphere under instance transforms',()=>{
    const scene=new THREE.Group(),bone=new THREE.Bone();bone.name='Moving';scene.add(bone);
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([-.25,-.25,0,.25,-.25,0,0,.25,0],3));
    geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Array(12).fill(0),4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0],4));
    const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshStandardMaterial({side:THREE.DoubleSide}));mesh.bind(new THREE.Skeleton([bone]));scene.add(mesh);
    mesh.userData.rtsConservativeBounds={sphere_center_y_up_m:[0,0,0],sphere_radius_m:5};
    mesh.computeBoundingBox(); // A previously cached box must not reject the later pose either.
    const animations=[new THREE.AnimationClip('Attack',1,[new THREE.NumberKeyframeTrack('Moving.position[x]',[0,1],[0,4])])];
    const model=new ModelInstance({scene,animations} as unknown as GLTF,{url:'/assets/games/rts/models/siege.glb',status:'published'});
    model.root.position.set(2,0,3);model.root.rotation.y=.5;model.root.scale.setScalar(2);model.root.updateMatrixWorld(true);
    const hitAt=(x:number)=>{const target=new THREE.Vector3(x,0,0).applyMatrix4(model.root.matrixWorld);return new THREE.Raycaster(target.clone().add(new THREE.Vector3(0,0,10)),new THREE.Vector3(0,0,-1)).intersectObject(model.root,true);};
    expect(hitAt(0)).toHaveLength(1);model.animate('attack',.99);model.root.updateMatrixWorld(true);
    expect(hitAt(3.96)).toHaveLength(1);expect(mesh.boundingSphere).toBeNull();model.dispose();
  });
  it('applies parent-node conservative bounds to every primitive in a parsed skinned GLTF node',async()=>{
    const bytes=new Uint8Array(180);
    new Float32Array(bytes.buffer,0,9).set([0,0,0,1,0,0,0,1,0]);
    new Uint16Array(bytes.buffer,36,12).set(new Array(12).fill(0));
    new Float32Array(bytes.buffer,60,12).set([1,0,0,0,1,0,0,0,1,0,0,0]);
    new Uint16Array(bytes.buffer,108,3).set([0,1,2]);
    new Float32Array(bytes.buffer,116,16).set(new THREE.Matrix4().toArray());
    const bufferViews=[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:24},{buffer:0,byteOffset:60,byteLength:48},{buffer:0,byteOffset:108,byteLength:6},{buffer:0,byteOffset:116,byteLength:64}];
    const accessors=[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]},{bufferView:1,componentType:5123,count:3,type:'VEC4'},{bufferView:2,componentType:5126,count:3,type:'VEC4'},{bufferView:3,componentType:5123,count:3,type:'SCALAR'},{bufferView:4,componentType:5126,count:1,type:'MAT4'}];
    const primitive={attributes:{POSITION:0,JOINTS_0:1,WEIGHTS_0:2},indices:3};
    const document={asset:{version:'2.0'},buffers:[{byteLength:bytes.length,uri:'data:application/octet-stream;base64,'+Buffer.from(bytes).toString('base64')}],bufferViews,accessors,meshes:[{primitives:[primitive,primitive]}],nodes:[{name:'ArmatureMesh',mesh:0,skin:0,children:[1],extras:{rtsConservativeBounds:{sphere_center_y_up_m:[10,0,0],sphere_radius_m:3}}},{name:'RootBone'}],skins:[{joints:[1],inverseBindMatrices:4}],scenes:[{nodes:[0]}],scene:0};
    const gltf=await new GLTFLoader().parseAsync(JSON.stringify(document),'');
    const sourceMeshes:THREE.SkinnedMesh[]=[];gltf.scene.traverse(object=>{if(object instanceof THREE.SkinnedMesh)sourceMeshes.push(object);});
    expect(sourceMeshes).toHaveLength(2);expect(sourceMeshes.every(mesh=>mesh.userData.rtsConservativeBounds===undefined)).toBe(true);
    sourceMeshes[0].position.x=2;
    const model=new ModelInstance(gltf,{url:'/assets/games/rts/models/guard.glb',status:'published'});
    const meshes:THREE.SkinnedMesh[]=[];model.root.traverse(object=>{if(object instanceof THREE.SkinnedMesh)meshes.push(object);});
    expect(meshes.map(mesh=>mesh.boundingSphere?.radius)).toEqual([3,3]);
    expect(meshes[0].boundingSphere!.center.x).toBeCloseTo(8);expect(meshes[1].boundingSphere!.center.x).toBeCloseTo(10);model.dispose();
  });
  it.each([0,-1,null,'5'])('rejects invalid conservative skin radius %s instead of silently culling units',radius=>{
    const scene=new THREE.Group(),bone=new THREE.Bone();scene.add(bone);
    const mesh=new THREE.SkinnedMesh(new THREE.BufferGeometry(),new THREE.MeshStandardMaterial());mesh.bind(new THREE.Skeleton([bone]));scene.add(mesh);
    mesh.userData.rtsConservativeBounds={sphere_center_y_up_m:[0,0,0],sphere_radius_m:radius};
    expect(()=>new ModelInstance({scene,animations:[]} as unknown as GLTF,{url:'/assets/games/rts/models/siege.glb',status:'published'})).toThrow('Invalid conservative skin bounds');
  });
  it('keeps a prepared cloth mask as a shared GPU texture when cloning instance materials',async()=>{
    const scene=new THREE.Group(),material=new THREE.MeshStandardMaterial({map:new THREE.Texture()});material.name='TeamClothMasked';material.userData.teamTintMask='data:image/png;base64,aGVsbG8=';
    const mesh=new THREE.Mesh(new THREE.BufferGeometry(),material);mesh.name='MaskedBody';scene.add(mesh);
    const gltf={scene,animations:[]} as unknown as GLTF;await prepareTeamMasks(gltf);
    const instance=new ModelInstance(gltf,{url:'/assets/games/rts/models/priest.glb',status:'published'},1);
    const copy=(instance.root.getObjectByName('MaskedBody') as THREE.Mesh).material as THREE.MeshStandardMaterial;
    const shader={uniforms:{},fragmentShader:'#include <map_fragment>'};copy.onBeforeCompile(shader as any,{} as any);
    expect((shader.uniforms as any).rtsTeamMask.value).toBe(material.userData.teamTintTexture);
    const dispose=vi.spyOn(material.userData.teamTintTexture,'dispose');instance.dispose();expect(dispose).not.toHaveBeenCalled();
  });
  // Every per-unit cloth copy forced a full material uniform refresh per draw. Copies
  // depend only on (source material, team, ghost), so the library shares them.
  it('shares team cloth and ghost copies between instances and disposes them with the library',async()=>{
    const assets=Object.fromEntries(REQUIRED_MODELS.map(id=>[id,{...landmarkEntry(id),url:`/assets/games/rts/models/${id}.glb`,status:'published'}]));
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({assets})}));
    const scene=new THREE.Group(),cloth=new THREE.MeshStandardMaterial({color:'#ffffff'}),steel=new THREE.MeshStandardMaterial({color:'#888888'});cloth.name='TeamCloth_Tabard';steel.name='Steel';
    const body=new THREE.Mesh(new THREE.BufferGeometry(),cloth),blade=new THREE.Mesh(new THREE.BufferGeometry(),steel);body.name='Body';blade.name='Blade';scene.add(body,blade);
    vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async url=>({scene:url.endsWith('/guard.glb')?scene:new THREE.Group(),animations:[]}) as unknown as GLTF);
    const library=new ModelLibrary();await library.load(()=>{},'river');
    const material=(instance:ModelInstance,name:string)=>(instance.root.getObjectByName(name) as THREE.Mesh).material as THREE.MeshStandardMaterial;
    const a=library.instantiate('guard',0),b=library.instantiate('guard',0),enemy=library.instantiate('guard',1),ghost=library.instantiate('guard',0,true),ghost2=library.instantiate('guard',0,true);
    expect(material(a,'Body')).toBe(material(b,'Body'));expect(material(a,'Body')).not.toBe(cloth);
    expect(material(a,'Body').color.getHexString()).toBe('28577d');expect(material(enemy,'Body').color.getHexString()).toBe('87382d');
    expect(material(enemy,'Body')).not.toBe(material(a,'Body'));
    expect(material(a,'Blade')).toBe(steel);
    expect(material(ghost,'Body')).toBe(material(ghost2,'Body'));expect(material(ghost,'Body')).not.toBe(material(a,'Body'));
    expect(material(ghost,'Blade')).toBe(material(ghost2,'Blade'));expect(material(ghost,'Blade').opacity).toBe(.4);expect(material(ghost,'Blade').transparent).toBe(true);
    const shared=material(a,'Body'),sharedGhost=material(ghost,'Blade'),disposeShared=vi.spyOn(shared,'dispose'),disposeGhost=vi.spyOn(sharedGhost,'dispose');
    a.dispose();ghost.dispose();expect(disposeShared).not.toHaveBeenCalled();expect(disposeGhost).not.toHaveBeenCalled();
    expect(material(b,'Body')).toBe(shared);
    b.dispose();enemy.dispose();ghost2.dispose();library.dispose();
    expect(disposeShared).toHaveBeenCalledTimes(1);expect(disposeGhost).toHaveBeenCalledTimes(1);
  });
  it('loads identical kit materials of separate assets as one shared material',async()=>{
    const assets=Object.fromEntries(REQUIRED_MODELS.map(id=>[id,{...landmarkEntry(id),url:`/assets/games/rts/models/${id}.glb`,status:'published'}]));
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({assets})}));
    const source=new THREE.Source({width:4,height:4});
    const asset=(name:string,color='#c8b48a')=>{const map=new THREE.Texture();map.source=source;const material=new THREE.MeshStandardMaterial({map,color});material.name='WeatheredBrass';
      const scene=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BufferGeometry(),material);mesh.name=name;scene.add(mesh);return scene;};
    const scenes:Record<string,THREE.Group>={house:asset('HouseTrim'),barracks:asset('BarracksTrim'),forge:asset('ForgeTrim','#ff0000')};
    vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async url=>({scene:scenes[url.replace('/assets/games/rts/models/','').replace('.glb','')]??new THREE.Group(),animations:[]}) as unknown as GLTF);
    const library=new ModelLibrary();await library.load(()=>{},'river');
    const material=(id:string,name:string)=>{const instance=library.instantiate(id);const m=(instance.root.getObjectByName(name) as THREE.Mesh).material;instance.dispose();return m;};
    expect(material('barracks','BarracksTrim')).toBe(material('house','HouseTrim'));
    expect(material('forge','ForgeTrim')).not.toBe(material('house','HouseTrim'));
    library.dispose();
  });
  it('defers the other map scenery, includes terrain progress and reuses loaded common assets',async()=>{
    expect(REQUIRED_MODELS).toContain('pine');
    const assets=Object.fromEntries(REQUIRED_MODELS.map(id=>[id,{...landmarkEntry(id),url:`/assets/games/rts/models/${id}.glb`,status:'published'}]));
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({assets})}));
    const gltf={scene:new THREE.Group(),animations:[]} as unknown as GLTF;
    const loader=vi.spyOn(GLTFLoader.prototype,'loadAsync').mockResolvedValue(gltf),progress=vi.fn(),library=new ModelLibrary();
    await library.load(progress,'river');
    expect(loader).not.toHaveBeenCalledWith('/assets/games/rts/models/pine.glb');
    expect(loader).toHaveBeenCalledWith('/assets/games/rts/models/stone-bridge.glb');expect(loader).toHaveBeenCalledWith('/assets/games/rts/models/rock.glb');
    expect(THREE.TextureLoader.prototype.loadAsync).toHaveBeenCalledTimes(7);expect(library.terrain()).toBeInstanceOf(THREE.Texture);
    for(const name of ['lush-grass','forest-floor','river-shingle','highland-scree'] as const)expect(library.terrain(name)).toBeInstanceOf(THREE.Texture);
    expect(library.terrain('road')).toBeInstanceOf(THREE.Texture);expect(library.terrain('water')).toBeInstanceOf(THREE.Texture);
    expect(progress).toHaveBeenLastCalledWith(REQUIRED_MODELS.length+6+RUBBLE_MODELS.length,REQUIRED_MODELS.length+6+RUBBLE_MODELS.length);
    loader.mockClear();progress.mockClear();await library.load(progress,'pass');
    expect(loader).toHaveBeenCalledTimes(5);expect(loader).toHaveBeenCalledWith('/assets/games/rts/models/pine.glb');
    expect(THREE.TextureLoader.prototype.loadAsync).toHaveBeenCalledTimes(7);expect(progress).toHaveBeenLastCalledWith(5,5);
    const textureDispose=vi.spyOn(library.terrain(),'dispose');library.dispose();expect(textureDispose).toHaveBeenCalledTimes(1);
  });
  // Oak canopies dithered into thin speckle at game zoom with a hard alpha test; both trees use alpha-to-coverage.
  it.each([['pine','pass'],['oak','river']] as const)('keeps original %s cutouts and enables multisample leaf edges without blending trunks',async(tree,map)=>{
    const assets=Object.fromEntries(REQUIRED_MODELS.map(id=>[id,{...landmarkEntry(id),url:`/assets/games/rts/models/${id}.glb`,status:'published'}]));
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({assets})}));
    const scene=new THREE.Group(),leaves=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshStandardMaterial({map:new THREE.Texture(),alphaTest:.48,side:THREE.DoubleSide})),trunk=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshStandardMaterial());
    leaves.name='Needles';trunk.name='Trunk';scene.add(leaves,trunk);
    vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async url=>({scene:url.endsWith(`/${tree}.glb`)?scene:new THREE.Group(),animations:[]}) as unknown as GLTF);
    const library=new ModelLibrary();await library.load(()=>{},map);const instance=library.instantiate(tree);
    const leaf=(instance.root.getObjectByName('Needles') as THREE.Mesh).material as THREE.MeshStandardMaterial;
    expect(leaf.alphaToCoverage).toBe(true);expect(leaf.alphaTest).toBe(.48);expect(leaf.transparent).toBe(false);expect(leaf.map).toBe(leaves.material.map);
    expect(((instance.root.getObjectByName('Trunk') as THREE.Mesh).material as THREE.MeshStandardMaterial).alphaToCoverage).toBe(false);
    instance.dispose();library.dispose();
  });
  it('does not fetch river water on the pass until the river is selected',async()=>{
    const assets=Object.fromEntries(REQUIRED_MODELS.map(id=>[id,{...landmarkEntry(id),url:`/assets/games/rts/models/${id}.glb`,status:'published'}]));
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({assets})}));
    vi.spyOn(GLTFLoader.prototype,'loadAsync').mockResolvedValue({scene:new THREE.Group(),animations:[]} as unknown as GLTF);
    const library=new ModelLibrary();await library.load(()=>{},'pass');
    expect(THREE.TextureLoader.prototype.loadAsync).toHaveBeenCalledTimes(6);expect(()=>library.terrain('water')).toThrow();
    await library.load(()=>{},'river');expect(THREE.TextureLoader.prototype.loadAsync).toHaveBeenCalledTimes(7);
    expect(library.terrain('water')).toBeInstanceOf(THREE.Texture);library.dispose();
  });
  it('fails closed and releases common assets when one landscape texture is missing',async()=>{
    const assets=Object.fromEntries(REQUIRED_MODELS.map(id=>[id,{...landmarkEntry(id),url:`/assets/games/rts/models/${id}.glb`,status:'published'}]));
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({assets})}));
    vi.spyOn(GLTFLoader.prototype,'loadAsync').mockResolvedValue({scene:new THREE.Group(),animations:[]} as unknown as GLTF);
    const textureDispose=vi.fn(),texture=new THREE.Texture(document.createElement('img'));vi.spyOn(texture,'dispose').mockImplementation(textureDispose);
    vi.spyOn(THREE.TextureLoader.prototype,'loadAsync').mockImplementation(async url=>{
      if(url.includes('river-shingle.webp'))throw new Error('missing landscape texture');
      return texture;
    });
    const library=new ModelLibrary();await expect(library.load(()=>{},'river')).rejects.toThrow('missing landscape texture');
    expect(()=>library.terrain()).toThrow('Terrain not loaded');
    expect(()=>library.instantiate('oak')).toThrow('Model not loaded');
    expect(textureDispose).toHaveBeenCalled();
  });
  it('shares identical cloned skin palettes per variant, isolates units and frees owned bone textures',()=>{
    const scene=new THREE.Group(),bone=new THREE.Bone();scene.add(bone);
    const skeleton=new THREE.Skeleton([bone]);
    for(let i=0;i<2;i++){const mesh=new THREE.SkinnedMesh(new THREE.BufferGeometry(),new THREE.MeshStandardMaterial());mesh.bind(skeleton,new THREE.Matrix4().makeTranslation(i,0,0));scene.add(mesh);}
    const gltf={scene,animations:[]} as unknown as GLTF,entry={url:'/assets/games/rts/models/guard.glb',status:'published' as const};
    const first=new ModelInstance(gltf,entry,0,false,gltf),second=new ModelInstance(gltf,entry);
    const skins=(root:THREE.Object3D)=>{const result:THREE.Skeleton[]=[];root.traverse(o=>{if(o instanceof THREE.SkinnedMesh)result.push(o.skeleton);});return result;};
    const high=skins(first.root.children[0]),low=skins(first.root.children[1]),other=skins(second.root);
    expect(high[0]).toBe(high[1]);expect(low[0]).toBe(low[1]);expect(high[0]).not.toBe(low[0]);expect(high[0]).not.toBe(other[0]);expect(high[0]).not.toBe(skeleton);
    const meshes:THREE.SkinnedMesh[]=[];first.root.children[0].traverse(o=>{if(o instanceof THREE.SkinnedMesh)meshes.push(o);});
    expect(meshes.map(m=>m.bindMatrix.elements[12])).toEqual([0,1]);expect(meshes.map(m=>m.bindMatrixInverse.elements[12])).toEqual([0,-1]);
    high[0].computeBoneTexture();const texture=high[0].boneTexture!,dispose=vi.spyOn(texture,'dispose'),sourceDispose=vi.spyOn(skeleton,'dispose');
    first.dispose();expect(dispose).toHaveBeenCalledTimes(1);expect(sourceDispose).not.toHaveBeenCalled();second.dispose();
  });
  it('keeps palettes with different inverse bind transforms separate',()=>{
    const scene=new THREE.Group(),bone=new THREE.Bone();scene.add(bone);
    for(let i=0;i<2;i++){const mesh=new THREE.SkinnedMesh(new THREE.BufferGeometry(),new THREE.MeshStandardMaterial());mesh.bind(new THREE.Skeleton([bone],[new THREE.Matrix4().makeTranslation(i,0,0)]),new THREE.Matrix4());scene.add(mesh);}
    const model=new ModelInstance({scene,animations:[]} as unknown as GLTF,{url:'/assets/games/rts/models/guard.glb',status:'published'});
    const skins:THREE.Skeleton[]=[];model.root.traverse(o=>{if(o instanceof THREE.SkinnedMesh)skins.push(o.skeleton);});
    expect(skins[0]).not.toBe(skins[1]);model.dispose();
  });
  it.each(['work','cast'])('plays the action clip for the engine %s state without resetting its phase',state=>{
    const scene=new THREE.Group(),body=new THREE.Group();body.name='Body';scene.add(body);
    const animations=[new THREE.AnimationClip('Idle',1,[new THREE.NumberKeyframeTrack('Body.position[x]',[0,1],[0,0])]),new THREE.AnimationClip('Attack',1,[new THREE.NumberKeyframeTrack('Body.position[x]',[0,1],[0,1])])];
    const model=new ModelInstance({scene,animations} as unknown as GLTF,{url:'/assets/games/rts/models/worker.glb',status:'published'});
    model.animate(state,.25);expect(model.root.getObjectByName('Body')!.position.x).toBeCloseTo(.25);
    model.animate('attack',.25);expect(model.root.getObjectByName('Body')!.position.x).toBeCloseTo(.5);
    model.dispose();
  });
  it('loads the reviewed lower LOD and keeps animation phase when switching detail',async()=>{
    const assets=Object.fromEntries(REQUIRED_MODELS.map(id=>[id,{...landmarkEntry(id),url:`/assets/games/rts/models/${id}.glb`,status:'published',lod1:id==='guard'?'/assets/games/rts/models/guard-lod1.glb':landmarkEntry(id).lod1}]));
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({assets})}));
    const makeModel=(name:string)=>{
      const scene=new THREE.Group();scene.name=name;const body=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());body.name='Body';scene.add(body);
      const animations=[new THREE.AnimationClip('Walk',1,[new THREE.NumberKeyframeTrack('Body.position[x]',[0,1],[0,1])])];
      return {scene,animations} as unknown as GLTF;
    };
    const high=makeModel('HighRoot'),low=makeModel('LowRoot');
    const loader=vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async url=>url.includes('-lod1')?low:high);
    const library=new ModelLibrary(),progress=vi.fn();await library.load(progress,'river');
    expect(loader).toHaveBeenCalledWith('/assets/games/rts/models/guard-lod1.glb');
    expect(progress).toHaveBeenLastCalledWith(REQUIRED_MODELS.length+7+RUBBLE_MODELS.length,REQUIRED_MODELS.length+7+RUBBLE_MODELS.length);
    const model=library.instantiate('guard');model.setDetailPixels(60);model.animate('walk',.5);
    const highRoot=model.root.getObjectByName('HighRoot')!,lowRoot=model.root.getObjectByName('LowRoot')!;
    expect(highRoot.visible).toBe(true);expect(lowRoot.visible).toBe(false);
    model.setDetailPixels(30);expect(highRoot.visible).toBe(false);expect(lowRoot.visible).toBe(true);
    expect(lowRoot.getObjectByName('Body')!.position.x).toBeCloseTo(.5);
    model.animate('walk',.25);model.setDetailPixels(60);
    expect(highRoot.getObjectByName('Body')!.position.x).toBeCloseTo(.75);
    model.dispose();library.dispose();
  });
  it('waits for in-flight assets and releases them after a partial failure',async()=>{
    const assets=Object.fromEntries(REQUIRED_MODELS.map(id=>[id,{...landmarkEntry(id),url:`/assets/games/rts/models/${id}.glb`,status:'published'}]));
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({assets})}));
    const requests:{resolve:(gltf:GLTF)=>void;reject:(reason:Error)=>void}[]=[];
    vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(()=>new Promise((resolve,reject)=>requests.push({resolve,reject})));
    const geometry=new THREE.BoxGeometry();const disposed=vi.spyOn(geometry,'dispose');
    const scene=new THREE.Group();scene.add(new THREE.Mesh(geometry,new THREE.MeshStandardMaterial()));
    const gltf={scene,animations:[]} as unknown as GLTF;
    const library=new ModelLibrary();let settled=false;
    const result=library.load(()=>{}).then(()=>null,error=>error).finally(()=>{settled=true;});
    await vi.waitFor(()=>expect(requests).toHaveLength(3));
    requests[0].reject(new Error('asset unavailable'));
    await new Promise(resolve=>setTimeout(resolve,0));
    expect(settled).toBe(false);
    requests[1].resolve(gltf);requests[2].resolve(gltf);
    expect(await result).toBeInstanceOf(Error);
    expect(requests).toHaveLength(3);
    expect(disposed).toHaveBeenCalled();
    expect(()=>library.instantiate('guard')).toThrow('Model not loaded');
  });
});
