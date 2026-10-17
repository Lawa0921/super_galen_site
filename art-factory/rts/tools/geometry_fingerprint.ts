/** Order-independent geometry fingerprints for glTF binary (GLB) mesh primitives.
 *  Each primitive's POSITION vertices are quantized to 1e-4 m (survives re-export
 *  float noise), sorted, and hashed, so renaming nodes/meshes/materials or
 *  re-indexing triangles does not change the fingerprint. */
import {createHash} from 'node:crypto';

export const FINGERPRINT_QUANTUM=1e-4;
export interface PrimitiveFingerprint {node:string;mesh:string;primitive:number;vertices:number;sha1:string|null;componentType:number}
interface Accessor {bufferView?:number;byteOffset?:number;count:number;componentType:number;type:string;sparse?:unknown}
interface Gltf {nodes?:{name?:string;mesh?:number}[];meshes?:{name?:string;primitives:{attributes:Record<string,number>}[]}[];
  accessors?:Accessor[];bufferViews?:{byteOffset?:number;byteStride?:number}[]}

export function parseGlb(bytes:Uint8Array):{json:Gltf;bin:Buffer} {
  const b=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(b.readUInt32LE(0)!==0x46546c67)throw new Error('Not a GLB');
  const jsonLength=b.readUInt32LE(12),json=JSON.parse(b.subarray(20,20+jsonLength).toString('utf8')) as Gltf;
  const binHeader=20+jsonLength,bin=binHeader+8<=b.length?b.subarray(binHeader+8,binHeader+8+b.readUInt32LE(binHeader)):Buffer.alloc(0);
  return {json,bin};
}
/** Fingerprint of one POSITION accessor; null when it is not plain float32 VEC3 (a quantized or sparse accessor cannot be compared). */
export function positionFingerprint(json:Gltf,bin:Buffer,accessorIndex:number):string|null {
  const a=json.accessors?.[accessorIndex];
  if(!a||a.bufferView===undefined||a.componentType!==5126||a.type!=='VEC3'||a.sparse)return null;
  const view=json.bufferViews![a.bufferView],stride=view.byteStride||12,offset=(view.byteOffset??0)+(a.byteOffset??0),q=(v:number)=>Math.round(v/FINGERPRINT_QUANTUM);
  const rows:string[]=new Array(a.count);
  for(let i=0;i<a.count;i++){const o=offset+i*stride;rows[i]=`${q(bin.readFloatLE(o))},${q(bin.readFloatLE(o+4))},${q(bin.readFloatLE(o+8))}`;}
  rows.sort();return createHash('sha1').update(rows.join(';')).digest('hex');
}
/** One record per primitive of every mesh-bearing node (a mesh shared by nodes is listed once per node; orphan meshes once). */
export function glbFingerprints(bytes:Uint8Array):PrimitiveFingerprint[] {
  const {json,bin}=parseGlb(bytes),out:PrimitiveFingerprint[]=[],seen=new Set<number>();
  const visit=(nodeName:string,meshIndex:number)=>{const mesh=json.meshes![meshIndex];
    mesh.primitives.forEach((p,i)=>{const index=p.attributes.POSITION;if(index===undefined)return;const a=json.accessors![index];
      out.push({node:nodeName,mesh:mesh.name??'',primitive:i,vertices:a.count,componentType:a.componentType,sha1:positionFingerprint(json,bin,index)});});};
  for(const n of json.nodes??[])if(n.mesh!==undefined){seen.add(n.mesh);visit(n.name??'',n.mesh);}
  (json.meshes??[]).forEach((_,i)=>{if(!seen.has(i))visit('',i);});
  return out;
}
