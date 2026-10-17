import {Color,Mesh,MeshStandardMaterial,Texture,TextureLoader} from 'three';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';
import type {TeamId} from './catalog';

/** A grayscale fabric mask shares the original base-colour UVs; never fetch an external mask. */
export async function prepareTeamMasks(gltf:GLTF):Promise<void>{
  const materials=new Set<MeshStandardMaterial>();
  gltf.scene.traverse(object=>{if(object instanceof Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material])if(material instanceof MeshStandardMaterial&&material.userData.teamTintMask)materials.add(material);});
  for(const material of materials){
    const uri=material.userData.teamTintMask;
    if(typeof uri!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(uri)||uri.length>3000000)throw new Error('Embedded PNG team mask required');
    if(material.userData.teamTintTexture instanceof Texture)continue;
    const texture=await new TextureLoader().loadAsync(uri);texture.flipY=false;
    // Material.clone JSON-copies userData. Keep GPU objects out of that copy.
    Object.defineProperty(material.userData,'teamTintTexture',{value:texture,writable:true,configurable:true,enumerable:false});
    // Retain source provenance without copying its base64 payload into every unit.
    Object.defineProperty(material.userData,'teamTintMask',{value:uri,writable:true,configurable:true,enumerable:false});
  }
}

export function configureTeamMaterial(material:MeshStandardMaterial,team:TeamId|-1,mask=material.userData.teamTintTexture as Texture|undefined):void {
  material.color.set(team===0?'#28577d':team===1?'#87382d':'#746953');
  if(!mask)return;
  const hue=new Color().copy(material.color);
  hue.multiplyScalar(1/Math.max(.00001,.2126*hue.r+.7152*hue.g+.0722*hue.b));
  material.onBeforeCompile=shader=>{
    shader.uniforms.rtsTeamMask={value:mask};shader.uniforms.rtsTeamHue={value:hue};
    shader.fragmentShader='uniform sampler2D rtsTeamMask;\nuniform vec3 rtsTeamHue;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      vec3 rtsOriginal = diffuseColor.rgb / max(diffuse, vec3(0.00001));
      float rtsMask = texture2D(rtsTeamMask, vMapUv).r;
      float rtsLuminance = dot(rtsOriginal, vec3(0.2126, 0.7152, 0.0722));
      diffuseColor.rgb = mix(rtsOriginal, rtsTeamHue * rtsLuminance, rtsMask);`);
  };
  material.customProgramCacheKey=()=> 'rts-team-mask-v1';
}
