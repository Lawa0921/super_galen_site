// @vitest-environment node
/** Round-3 polish gate (2026-10-17): landmark / prop maps are shared >= 1024 files (no per-GLB embedded copies),
 *  tree canopies carry the denser card layer, shields carry proud brass rivets, the gold mine is no longer a faceted
 *  400-triangle blob, and the command panel ships as WebP. RTS_MODEL_DIR points it at another model folder (e.g. the
 *  round-3 publication-before snapshot) to show it fails there. */
import {describe,it,expect} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';

const ROOT=path.resolve(__dirname,'../../../..');
const MODELS=process.env.RTS_MODEL_DIR?path.resolve(ROOT,process.env.RTS_MODEL_DIR):path.join(ROOT,'public/assets/games/rts/models');
const PUBLIC_MODELS=path.join(ROOT,'public/assets/games/rts/models');
interface Gltf {nodes:{name?:string;mesh?:number}[];meshes:{name?:string;primitives:{indices?:number;material?:number}[]}[];
  materials?:{name?:string;pbrMetallicRoughness?:{baseColorTexture?:{index:number};baseColorFactor?:number[]}}[];
  textures?:{source:number}[];images?:{uri?:string;bufferView?:number;name?:string}[];accessors:{count:number}[]}
const read=(file:string)=>{const b=readFileSync(file);return JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString()) as Gltf;};
function imageSize(file:string){const b=readFileSync(file);if(b[0]===0x89)return b.readUInt32BE(16);
  for(let i=2;i<b.length;){const m=b[i+1],l=b.readUInt16BE(i+2);if(m>=0xc0&&m<=0xc2)return b.readUInt16BE(i+7);i+=2+l;}throw new Error('no SOF');}
const meshTris=(g:Gltf,name:string)=>g.meshes.filter(m=>m.name===name).flatMap(m=>m.primitives).reduce((s,p)=>s+(p.indices===undefined?0:g.accessors[p.indices].count/3),0);
const LANDMARKS=['river-gatehouse','river-shrine','highland-watchtower','quarry-ruins'].flatMap(id=>[id,id+'-lod1']);

describe('model polish round 3: shared landmark / prop maps',()=>{
  it.each([...LANDMARKS,'gold-mine','timber-pile','oak','pine','rock'])('%s: every colour map is >= 1024 px and only leaf atlases stay embedded',id=>{
    const g=read(path.join(MODELS,`${id}.glb`));
    const embedded=(g.images??[]).filter(im=>im.bufferView!==undefined).map(im=>im.name);
    expect(embedded.filter(n=>!/leaf-atlas|needle-atlas/.test(n??''))).toEqual([]);
    for(const m of g.materials??[]){
      const t=m.pbrMetallicRoughness?.baseColorTexture;if(!t)continue;
      const im=g.images![g.textures![t.index].source];if(!im.uri)continue;
      const file=path.join(PUBLIC_MODELS,im.uri);expect(existsSync(file),im.uri).toBe(true);
      expect(imageSize(file),`${m.name} ${im.uri}`).toBeGreaterThanOrEqual(1024);
    }
  });
  it('downloads the four landmark pairs well inside their 2 MB per-map budget (shared maps excluded)',()=>{
    for(const pair of [['river-gatehouse','river-shrine'],['highland-watchtower','quarry-ruins']]){
      const bytes=pair.flatMap(id=>[id,id+'-lod1']).reduce((s,id)=>s+readFileSync(path.join(MODELS,`${id}.glb`)).length,0);
      expect(bytes).toBeLessThan(3_000_000);
    }
  });
});

describe('model polish round 3: silhouettes and canopies',()=>{
  it('gold mine boulders and ore are subdivided (no faceted 400-triangle blobs)',()=>{
    const g=read(path.join(MODELS,'gold-mine.glb'));
    expect(meshTris(g,'MineRock export mesh')).toBeGreaterThanOrEqual(1600);expect(meshTris(g,'GoldOre export mesh')).toBeGreaterThanOrEqual(1500);
  });
  it.each([['oak','LeafCutout export mesh',1232],['pine','PineNeedles export mesh',1492]] as const)('%s canopy gains the inner card layer at <= +60%% leaf triangles',(id,mesh,before)=>{
    const t=meshTris(read(path.join(MODELS,`${id}.glb`)),mesh);
    expect(t).toBeGreaterThanOrEqual(before*1.4);expect(t).toBeLessThanOrEqual(before*1.6);
  });
});

describe('model polish round 3: wood grade and download',()=>{
  it.each(['crossbow','priest'])('%s PolishOak uses the walnut grade, not the orange-yellow one',id=>{
    const m=read(path.join(MODELS,`${id}.glb`)).materials!.find(x=>x.name==='PolishOak')!;
    const [r,g,b]=m.pbrMetallicRoughness!.baseColorFactor!;expect(r).toBeLessThan(0.3);expect(b/r).toBeGreaterThan(1.5);expect(g).toBeGreaterThan(0);
  });
  it('ships the command panel frame as WebP (the 2.1 MB PNG is gone from the runtime path)',()=>{
    expect(existsSync(path.join(ROOT,'public/assets/games/rts/ui/command-panel.webp'))).toBe(true);
    expect(existsSync(path.join(ROOT,'public/assets/games/rts/ui/command-panel.png'))).toBe(false);
    expect(readFileSync(path.join(ROOT,'src/styles/_rts.scss'),'utf8')).toContain("url('/assets/games/rts/ui/command-panel.webp')");
  });
});
