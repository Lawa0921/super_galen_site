import * as THREE from 'three';

const IGNORED=new Set(['uuid','id','version','_listeners']);
const SAMPLER=['mapping','wrapS','wrapT','magFilter','minFilter','anisotropy','format','internalFormat','type','generateMipmaps','premultiplyAlpha','flipY','unpackAlignment','colorSpace','channel','rotation','matrixAutoUpdate'] as const;

function textureSignature(texture:THREE.Texture):string|undefined {
  if((texture as {isRenderTargetTexture?:boolean}).isRenderTargetTexture||(texture as {isVideoTexture?:boolean}).isVideoTexture)return undefined;
  return 'T'+texture.source.uuid+'/'+SAMPLER.map(k=>String(texture[k])).join(',')+'/'+[...texture.offset.toArray(),...texture.repeat.toArray(),...texture.center.toArray(),...texture.matrix.elements].join(',');
}
function valueSignature(value:unknown):string|undefined {
  if(value===null||value===undefined||typeof value==='number'||typeof value==='boolean'||typeof value==='string')return JSON.stringify(value)??'u';
  if(typeof value==='function')return undefined;
  if((value as THREE.Texture).isTexture)return textureSignature(value as THREE.Texture);
  const vector=value as {toArray?:()=>unknown[];isColor?:boolean;isVector2?:boolean;isVector3?:boolean;isVector4?:boolean;isEuler?:boolean;isMatrix3?:boolean;isMatrix4?:boolean};
  if(vector.isColor||vector.isVector2||vector.isVector3||vector.isVector4||vector.isEuler||vector.isMatrix3||vector.isMatrix4)return vector.toArray!().join(',');
  if(Array.isArray(value)){const parts=value.map(valueSignature);return parts.includes(undefined)?undefined:'['+parts.join(';')+']';}
  if(Object.getPrototypeOf(value)===Object.prototype){
    const parts:string[]=[];for(const key of Object.getOwnPropertyNames(value).sort()){const part=valueSignature((value as Record<string,unknown>)[key]);if(part===undefined)return undefined;parts.push(key+':'+part);}
    return '{'+parts.join(';')+'}';
  }
  return undefined;
}
/** Everything that affects rendering, or undefined when equality cannot be proven
 * (custom shader hooks, GPU objects or other class instances anywhere in it). */
export function materialSignature(material:THREE.Material):string|undefined {
  const parts:string[]=[material.constructor.name];
  for(const key of Object.keys(material).sort()){
    if(IGNORED.has(key))continue;
    const part=valueSignature((material as unknown as Record<string,unknown>)[key]);if(part===undefined)return undefined;parts.push(key+'='+part);
  }
  // Non-enumerable userData (prepared team masks) is part of the identity too.
  const user=valueSignature(material.userData);if(user===undefined)return undefined;
  for(const key of Object.getOwnPropertyNames(material.userData))if(!Object.keys(material.userData).includes(key))return undefined;
  return parts.join('|');
}

/** Points meshes of separately loaded assets at one shared copy of each identical
 * material. Materials within one asset are never merged with each other, so per-asset
 * batching (skins, completed buildings) groups exactly as before. */
export class MaterialRegistry {
  private bySignature=new Map<string,THREE.Material>();
  canonicalize(root:THREE.Object3D):void {
    const replacements=new Map<THREE.Material,THREE.Material>(),used=new Set<THREE.Material>(),own=new Map<string,THREE.Material>();
    const resolve=(material:THREE.Material):THREE.Material=>{
      const known=replacements.get(material);if(known)return known;
      const signature=materialSignature(material);let result=material;
      if(signature!==undefined){
        const canonical=this.bySignature.get(signature);
        if(canonical&&canonical!==material&&!used.has(canonical))result=canonical;
        else if(!canonical&&!own.has(signature))own.set(signature,material);
      }
      used.add(result);replacements.set(material,result);return result;
    };
    root.traverse(object=>{
      const mesh=object as THREE.Mesh;if(!mesh.isMesh)return;
      mesh.material=Array.isArray(mesh.material)?mesh.material.map(resolve):resolve(mesh.material);
    });
    for(const [signature,material] of own)this.bySignature.set(signature,material);
  }
  clear():void {this.bySignature.clear();}
}
