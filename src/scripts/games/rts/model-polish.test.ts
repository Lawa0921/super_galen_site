// @vitest-environment node
/** Close-up polish gate (model-polish-2026-10-16): rebuilt equipment is a real rigid piece on the hand bone using the
 *  shared 2048 equipment atlas, budgets stay inside the approved +30% allowance, and the polished buildings gain
 *  facade relief and >= 1024 maps without new materials or draw calls. RTS_MODEL_DIR points the gate at another
 *  model folder (e.g. the pre-polish snapshot) to prove it fails there. */
import {describe,it,expect} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';

const ROOT=path.resolve(__dirname,'../../../..');
const MODELS=process.env.RTS_MODEL_DIR?path.resolve(ROOT,process.env.RTS_MODEL_DIR):path.join(ROOT,'public/assets/games/rts/models');
const PUBLIC_MODELS=path.join(ROOT,'public/assets/games/rts/models');
interface Prim {attributes:Record<string,number>;indices?:number;material?:number}
interface Gltf {nodes:{name?:string;mesh?:number;skin?:number}[];meshes:{name?:string;primitives:Prim[]}[];materials?:{name?:string;pbrMetallicRoughness?:{baseColorTexture?:{index:number}}}[];
  textures?:{source:number}[];images?:{uri?:string}[];accessors:{count:number;bufferView?:number;byteOffset?:number;componentType:number;type:string}[];
  bufferViews:{byteOffset?:number;byteLength:number;byteStride?:number}[];skins?:{joints:number[]}[]}
const read=(file:string)=>{const b=readFileSync(file);const len=b.readUInt32LE(12);const json=JSON.parse(b.subarray(20,20+len).toString()) as Gltf;
  const binStart=20+len+8;return {json,bin:b.subarray(binStart)};};
const tris=(g:Gltf)=>g.nodes.filter(n=>n.mesh!==undefined).reduce((s,n)=>s+g.meshes[n.mesh!].primitives.reduce((t,p)=>t+(p.indices===undefined?0:g.accessors[p.indices].count/3),0),0);
const prims=(g:Gltf)=>g.nodes.filter(n=>n.mesh!==undefined).reduce((s,n)=>s+g.meshes[n.mesh!].primitives.length,0);
function u16(g:Gltf,bin:Buffer,index:number):number[] {
  const a=g.accessors[index],v=g.bufferViews[a.bufferView!],size=a.componentType===5121?1:2,stride=v.byteStride??size*4,out:number[]=[];
  for(let i=0;i<a.count;i++){const o=(v.byteOffset??0)+(a.byteOffset??0)+i*stride;out.push(size===1?bin.readUInt8(o):bin.readUInt16LE(o));}
  return out;
}
function f32(g:Gltf,bin:Buffer,index:number):number[] {
  const a=g.accessors[index],v=g.bufferViews[a.bufferView!],n=a.type==='VEC4'?4:a.type==='VEC3'?3:a.type==='VEC2'?2:1,stride=v.byteStride??n*4,out:number[]=[];
  for(let i=0;i<a.count;i++)for(let k=0;k<n;k++)out.push(bin.readFloatLE((v.byteOffset??0)+(a.byteOffset??0)+i*stride+k*4));
  return out;
}
function pngSize(file:string){const b=readFileSync(file);return b[0]===0x89?{w:b.readUInt32BE(16),h:b.readUInt32BE(20)}:jpegSize(b);}
function jpegSize(b:Buffer){for(let i=2;i<b.length;){const m=b[i+1],l=b.readUInt16BE(i+2);if(m>=0xc0&&m<=0xc2)return {w:b.readUInt16BE(i+7),h:b.readUInt16BE(i+5)};i+=2+l;}throw new Error('no SOF');}

const EQUIPMENT:Record<string,{nodes:[string,string][];lod0:number;lod1:number}>={
  guard:{nodes:[['KingdomSteelSword','Hand_R'],['KingdomSunShield','Hand_L']],lod0:26000,lod1:10000},
  commander:{nodes:[['CommanderLongsword','Hand_R'],['CommanderDawnShield','Hand_L']],lod0:35000,lod1:13000},
  knight:{nodes:[['KnightLance','Hand_R'],['KnightSunShield','Hand_L']],lod0:35000,lod1:13000},
  worker:{nodes:[['WorkerCraftAxe','Hand_R']],lod0:26000,lod1:10000},
  'neutral-raider':{nodes:[['RaiderShortAxe','Hand_R']],lod0:26000,lod1:10000},
};

describe('model polish: equipment',()=>{
  for(const [unit,spec] of Object.entries(EQUIPMENT))for(const lod of [0,1]){
    const id=lod?`${unit}-lod1`:unit;
    it(`${id}: rebuilt pieces use the equipment atlas, stay rigid on their hand bone and within budget`,()=>{
      const {json,bin}=read(path.join(MODELS,`${id}.glb`));
      expect(tris(json)).toBeLessThanOrEqual(lod?spec.lod1:spec.lod0);
      for(const [base,bone] of spec.nodes){
        const node=json.nodes.find(n=>n.name===`${base}_LOD${lod}`)!;expect(node,base).toBeDefined();
        const mesh=json.meshes[node.mesh!],names=mesh.primitives.map(p=>json.materials![p.material!].name);
        expect(names,base).toContain('PolishEquipment');
        expect(names.filter(n=>n!=='PolishEquipment'&&!/TeamCloth/.test(n??'')),base).toEqual([]);
        // A real silhouette, not a block: hundreds of triangles even at LOD1.
        expect(mesh.primitives.reduce((t,p)=>t+json.accessors[p.indices!].count/3,0),base).toBeGreaterThan(lod?150:900);
        const joints=json.skins![node.skin!].joints,slot=joints.findIndex(j=>json.nodes[j].name===bone);
        for(const p of mesh.primitives){
          expect(new Set(u16(json,bin,p.attributes.JOINTS_0).filter((_,i)=>i%4===0)),base).toEqual(new Set([slot]));
          const w=f32(json,bin,p.attributes.WEIGHTS_0);expect(w.filter((_,i)=>i%4===0).every(x=>x===1),base).toBe(true);
          expect(p.attributes.TANGENT,base).toBeDefined();
        }
      }
      for(const image of json.images??[])if(image.uri)expect(existsSync(path.join(PUBLIC_MODELS,image.uri)),image.uri).toBe(true);
    });
  }
  it('ships a 2048 equipment atlas built from generated >= 1024 material maps',()=>{
    const dir=path.join(ROOT,'public/assets/games/rts/materials/polish-v1');
    // Round 3 (2026-10-17) re-grades the oak cell to walnut: the colour atlas moved to polish-v2 (normal / MR stay).
    expect(pngSize(path.join(ROOT,'public/assets/games/rts/materials/polish-v2/equipment-atlas-color.jpg'))).toEqual({w:2048,h:2048});
    expect(existsSync(path.join(dir,'equipment-atlas-color.jpg'))).toBe(false);
    for(const m of ['blade-steel','aged-brass','grip-leather','shield-oak','cut-stone-face','navy-slate'])
      expect(pngSize(path.join(dir,`${m}-color.jpg`)).w,m).toBeGreaterThanOrEqual(1024);
  });
});

const BUILDINGS:Record<string,{materials:number;primitives:number;minTris:number}>={
  barracks:{materials:11,primitives:18,minTris:6800},townhall:{materials:11,primitives:19,minTris:9100},
  'townhall-tier2':{materials:10,primitives:17,minTris:11000},'townhall-tier3':{materials:10,primitives:17,minTris:15800},
};
describe('model polish: buildings',()=>{
  for(const [id,spec] of Object.entries(BUILDINGS))it(`${id}: facade relief and >= 1024 maps without new materials or draw calls`,()=>{
    const {json}=read(path.join(MODELS,`${id}.glb`));
    expect(json.materials!.length).toBe(spec.materials);expect(prims(json)).toBe(spec.primitives);
    expect(tris(json)).toBeGreaterThanOrEqual(spec.minTris);expect(tris(json)).toBeLessThanOrEqual(20000);
    for(const m of json.materials!){
      if(!/Stone|Limestone|Slate|Timber/.test(m.name??''))continue;
      const tex=m.pbrMetallicRoughness?.baseColorTexture;expect(tex,m.name).toBeDefined();
      const uri=json.images![json.textures![tex!.index].source].uri!;if(m.name!=='IvoryLimestone')expect(uri,m.name).toMatch(/polish-v1\//);
      expect(pngSize(path.join(PUBLIC_MODELS,uri)).w,m.name).toBeGreaterThanOrEqual(1024);
    }
  });
});
