// @vitest-environment node
/** Hand polish gate (2026-10-16): every humanoid hand is an articulated original hand (separate phalanx pieces, not a
 *  swept mitten) on the shared equipment atlas, bound only to that side's Hand / Forearm bones, the bare TripoSR
 *  mitten hands it covers are gone from the body, shield hands hold a real handle, and budgets hold.
 *  RTS_MODEL_DIR points the gate at another model folder (e.g. the pre-hands snapshot) to prove it fails there. */
import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';

const ROOT=path.resolve(__dirname,'../../../..');
const MODELS=process.env.RTS_MODEL_DIR?path.resolve(ROOT,process.env.RTS_MODEL_DIR):path.join(ROOT,'public/assets/games/rts/models');
interface Prim {attributes:Record<string,number>;indices?:number;material?:number}
interface Gltf {nodes:{name?:string;mesh?:number;skin?:number;extras?:Record<string,unknown>}[];meshes:{name?:string;primitives:Prim[]}[];
  materials?:{name?:string}[];accessors:{count:number;bufferView?:number;byteOffset?:number;componentType:number;type:string}[];
  bufferViews:{byteOffset?:number;byteLength:number;byteStride?:number}[];skins?:{joints:number[]}[]}
const read=(file:string)=>{const b=readFileSync(file);const len=b.readUInt32LE(12);return {json:JSON.parse(b.subarray(20,20+len).toString()) as Gltf,bin:b.subarray(20+len+8)};};
const tris=(g:Gltf)=>g.nodes.filter(n=>n.mesh!==undefined).reduce((s,n)=>s+g.meshes[n.mesh!].primitives.reduce((t,p)=>t+(p.indices===undefined?0:g.accessors[p.indices].count/3),0),0);
const SIZE:Record<number,number>={5121:1,5123:2,5125:4,5126:4};
const WIDTH:Record<string,number>={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
function read_accessor(g:Gltf,bin:Buffer,index:number):number[][] {
  const a=g.accessors[index],v=g.bufferViews[a.bufferView!],n=WIDTH[a.type],size=SIZE[a.componentType],stride=v.byteStride??size*n,out:number[][]=[];
  for(let i=0;i<a.count;i++){const row:number[]=[];for(let k=0;k<n;k++){const o=(v.byteOffset??0)+(a.byteOffset??0)+i*stride+k*size;
    row.push(a.componentType===5126?bin.readFloatLE(o):a.componentType===5125?bin.readUInt32LE(o):a.componentType===5123?bin.readUInt16LE(o):bin.readUInt8(o));}out.push(row);}
  return out;
}
/** Connected pieces of one primitive (vertices joined by shared triangles). */
function pieces(g:Gltf,bin:Buffer,p:Prim):number {
  const idx=read_accessor(g,bin,p.indices!).map(r=>r[0]),parent=new Int32Array(g.accessors[p.attributes.POSITION].count).map((_,i)=>i);
  const find=(x:number):number=>{while(parent[x]!==x){parent[x]=parent[parent[x]];x=parent[x];}return x;};
  for(let i=0;i<idx.length;i+=3){const a=find(idx[i]),b=find(idx[i+1]),c=find(idx[i+2]);parent[b]=a;parent[find(c)]=a;}
  return new Set(Array.from(new Set(idx),v=>find(v))).size;
}

// host node base -> sides it carries; bare: the body's own hand on that side is replaced by the glove.
const HANDS:Record<string,{hosts:Record<string,('L'|'R')[]>;bare:('L'|'R')[];lod0:number;lod1:number;shield?:string}>={
  worker:{hosts:{ProceduralGauntlet_R:['R','L']},bare:['L'],lod0:26000,lod1:10000},
  guard:{hosts:{GuardGauntlet_R:['R'],GuardGauntlet_L:['L']},bare:[],lod0:26000,lod1:10000,shield:'KingdomSunShield'},
  crossbow:{hosts:{ProceduralGauntlet_R:['R'],ProceduralGauntlet_L:['L']},bare:[],lod0:26000,lod1:10000},
  knight:{hosts:{KnightCommanderHand_R:['R'],KnightCommanderHand_L:['L']},bare:[],lod0:26000,lod1:13000,shield:'KnightSunShield'},
  priest:{hosts:{AssemblyHand_R:['R','L']},bare:['L'],lod0:26000,lod1:10000},
  'neutral-raider':{hosts:{AssemblyHand_R:['R','L']},bare:['L'],lod0:26000,lod1:10000},
  commander:{hosts:{CommanderClosedGrip_R:['R'],CommanderClosedGrip_L:['L']},bare:[],lod0:26000,lod1:13000,shield:'CommanderDawnShield'},
};

describe('model polish: hands',()=>{
  for(const [unit,spec] of Object.entries(HANDS))for(const lod of [0,1]){
    const id=lod?`${unit}-lod1`:unit;
    it(`${id}: articulated original hands on the equipment atlas, bound to their own wrist, within budget`,()=>{
      const {json,bin}=read(path.join(MODELS,`${id}.glb`));
      expect(tris(json)).toBeLessThanOrEqual(lod?spec.lod1:spec.lod0);
      const joints=json.skins![0].joints.map(j=>json.nodes[j].name);
      for(const [base,sides] of Object.entries(spec.hosts)){
        const node=json.nodes.find(n=>n.name===`${base}_LOD${lod}`)!;expect(node,base).toBeDefined();
        expect(String(node.extras?.rtsHandPolish??''),base).toMatch(/articulated original hand/);
        const mesh=json.meshes[node.mesh!];
        expect(mesh.primitives.map(p=>json.materials![p.material!].name),base).toEqual(['PolishEquipment']);
        const allowed=new Set(sides.flatMap(s=>[`Hand_${s}`,`Forearm_${s}`]));
        const p=mesh.primitives[0],jj=read_accessor(json,bin,p.attributes.JOINTS_0),ww=read_accessor(json,bin,p.attributes.WEIGHTS_0);
        const used=new Set<string>();let rigid=0;
        jj.forEach((row,i)=>row.forEach((j,k)=>{if(ww[i][k]>0)used.add(joints[j]!);}));
        ww.forEach(row=>{if(row[0]===1)rigid++;});
        expect([...used].filter(n=>!allowed.has(n)),base).toEqual([]);
        for(const s of sides)expect(used.has(`Hand_${s}`),`${base} ${s}`).toBe(true);
        expect(rigid/ww.length,base).toBeGreaterThan(.6);  // fingers / palm / thumb ride the hand bone rigidly
        // Separate phalanx capsules per digit: >= 15 pieces per hand near, >= 6 far (a swept mitten is 1-5).
        expect(pieces(json,bin,p),base).toBeGreaterThanOrEqual(sides.length*(lod?6:15));
      }
      // The bare TripoSR hand the glove covers is removed from the body (no Hand-dominant body triangles left).
      const body=json.nodes.find(n=>/Body_LOD/.test(n.name??'')&&n.skin===0)!;
      for(const s of spec.bare){
        const slot=joints.indexOf(`Hand_${s}`);let dominant=0;
        for(const p of json.meshes[body.mesh!].primitives){
          const jj=read_accessor(json,bin,p.attributes.JOINTS_0),ww=read_accessor(json,bin,p.attributes.WEIGHTS_0),idx=read_accessor(json,bin,p.indices!).map(r=>r[0]);
          const w=(v:number)=>jj[v].reduce((t,j,k)=>t+(j===slot?ww[v][k]:0),0);
          for(let i=0;i<idx.length;i+=3)if(w(idx[i])>=.5&&w(idx[i+1])>=.5&&w(idx[i+2])>=.5)dominant++;
        }
        expect(dominant,`${id} body Hand_${s}`).toBe(0);
      }
      if(spec.shield){
        // The old strap loops the hand floated beside are gone; the new handle lives in the hand mesh.
        const node=json.nodes.find(n=>n.name===`${spec.shield}_LOD${lod}`)!;
        expect(json.meshes[node.mesh!].primitives.length).toBeGreaterThan(0);
      }
    });
  }
});
