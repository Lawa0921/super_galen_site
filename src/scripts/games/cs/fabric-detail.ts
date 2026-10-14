import * as THREE from 'three';

/** glTF material extras key written by the V36 sleeve surface cook. */
export const FABRIC_DETAIL_KEY = 'csFabricDetail';
const CACHE_KEY = 'cs-fabric-detail-v36';
interface FabricDetailParams { normalStrength: number; albedoStrength: number; cavityMean: number; foldContrast: number; atlasMean: number }

const within = (value: unknown, min: number, max: number, openMin = false): value is number =>
  typeof value === 'number' && (openMin ? value > min : value >= min) && value <= max;

function readParams(material: THREE.Material): FabricDetailParams | null {
  const raw = material.userData[FABRIC_DETAIL_KEY] as Partial<FabricDetailParams> | undefined;
  if (raw === undefined) return null;
  const { normalStrength, albedoStrength, cavityMean, foldContrast, atlasMean } = raw ?? {};
  const valid = material instanceof THREE.MeshStandardMaterial && material.normalMap && material.aoMap
    && material.normalMapType === THREE.TangentSpaceNormalMap
    && within(normalStrength, 0, 2) && within(albedoStrength, 0, 1) && within(cavityMean, .05, 1, true)
    && within(foldContrast, 1, 6) && within(atlasMean, .05, 1, true);
  if (!valid) throw new Error(`Invalid fabric detail on ${material.name}`);
  return { normalStrength, albedoStrength, cavityMean, foldContrast, atlasMean };
}

// The tiled cloth detail lives in the glTF occlusion slot (R cavity, GB tangent
// normal XY) with KHR_texture_transform, so it loads, shares and releases like any
// authored map and keeps one draw. Three only applies R to indirect light; this
// patch also uses it for albedo and adds GB to the baked fold normal. The detail
// UV is a uniform scale of the normal-map UV, so the same tangent frame applies.
function patch(material: THREE.MeshStandardMaterial, params: FabricDetailParams) {
  material.onBeforeCompile = shader => {
    shader.uniforms.csFabricNormal = { value: params.normalStrength };
    shader.uniforms.csFabricAlbedo = { value: params.albedoStrength };
    shader.uniforms.csFabricMean = { value: params.cavityMean };
    shader.uniforms.csFoldContrast = { value: params.foldContrast };
    shader.uniforms.csAtlasMean = { value: params.atlasMean };
    const uniforms = ['csFabricNormal', 'csFabricAlbedo', 'csFabricMean', 'csFoldContrast', 'csAtlasMean'].map(name => `uniform float ${name};`).join('\n');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `${uniforms}\nvoid main() {`)
      .replace('#include <map_fragment>', `#include <map_fragment>
	// The licensed fold bake is low contrast; expand it around its measured mean.
	diffuseColor.rgb *= pow( max( sampledDiffuseColor.rgb / csAtlasMean, vec3( 1e-3 ) ), vec3( csFoldContrast - 1.0 ) );
	vec3 csFabric = texture2D( aoMap, vAoMapUv ).rgb;
	diffuseColor.rgb *= mix( 1.0, csFabric.r / csFabricMean, csFabricAlbedo );`)
      .replace('#include <normal_fragment_maps>', `vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	mapN.xy *= normalScale;
	mapN.xy += ( csFabric.gb * 2.0 - 1.0 ) * csFabricNormal;
	normal = normalize( tbn * mapN );`);
  };
  material.customProgramCacheKey = () => CACHE_KEY;
}

/** Validate every marked material first, then patch them; returns the count. */
export function applyFabricDetail(root: THREE.Object3D) {
  const pending = new Map<THREE.MeshStandardMaterial, FabricDetailParams>();
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      const params = readParams(material);
      if (params) pending.set(material as THREE.MeshStandardMaterial, params);
    }
  });
  pending.forEach((params, material) => patch(material, params));
  return pending.size;
}
