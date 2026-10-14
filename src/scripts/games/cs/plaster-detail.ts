import * as THREE from 'three';

/** glTF material extras key written by the V37 plaster detail cook. */
export const PLASTER_DETAIL_KEY = 'csPlasterDetail';
const CACHE_KEY = 'cs-plaster-detail-v37';
const FIELDS = {
  normalStrength: [0, 2], albedoStrength: [0, 1], cavityMean: [.05, 1, true], roughnessStrength: [0, 1],
  macroStrength: [0, .4], macroScale: [.02, .6], macroBlend: [0, 1], grimeHeight: [0, 3], grimeStrength: [0, .6], streakStrength: [0, .6],
} as const;
type PlasterDetailParams = Record<keyof typeof FIELDS, number>;
const UNIFORMS: Record<keyof typeof FIELDS, string> = {
  normalStrength: 'csPlasterNormal', albedoStrength: 'csPlasterAlbedo', cavityMean: 'csPlasterMean', roughnessStrength: 'csPlasterRough',
  macroStrength: 'csMacroStrength', macroScale: 'csMacroScale', macroBlend: 'csMacroBlend', grimeHeight: 'csGrimeHeight',
  grimeStrength: 'csGrimeStrength', streakStrength: 'csStreakStrength',
};

function readParams(material: THREE.Material): PlasterDetailParams | null {
  const raw = material.userData[PLASTER_DETAIL_KEY] as Record<string, unknown> | undefined;
  if (raw === undefined) return null;
  const valid = material instanceof THREE.MeshStandardMaterial && material.map && material.normalMap && material.aoMap
    && material.normalMapType === THREE.TangentSpaceNormalMap
    && Object.entries(FIELDS).every(([key, [min, max, openMin]]) => {
      const value = raw?.[key];
      return typeof value === 'number' && (openMin ? value > min : value >= min) && value <= max;
    });
  if (!valid) throw new Error(`Invalid plaster detail on ${material.name}`);
  return Object.fromEntries(Object.keys(FIELDS).map(key => [key, raw[key]])) as PlasterDetailParams;
}

function replace(source: string, anchor: string, text: string) {
  if (!source.includes(anchor)) throw new Error(`Plaster detail anchor missing: ${anchor}`);
  return source.replace(anchor, text);
}

// Cheap 3D value noise; world-space, so it breaks the 2 m base tile without UVs.
const NOISE = `
float csHash( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
float csNoise( vec3 x ) {
	vec3 i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( mix( csHash( i ), csHash( i + vec3( 1, 0, 0 ) ), f.x ), mix( csHash( i + vec3( 0, 1, 0 ) ), csHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
		mix( mix( csHash( i + vec3( 0, 0, 1 ) ), csHash( i + vec3( 1, 0, 1 ) ), f.x ), mix( csHash( i + vec3( 0, 1, 1 ) ), csHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}
const mat2 csRot = mat2( 0.8, -0.6, 0.6, 0.8 );`;

// The stucco grain lives in the glTF occlusion slot (R cavity, GB tangent normal
// XY) with KHR_texture_transform, like the V36 sleeve detail: one extra map, same
// draws. Three only applies R to indirect light; this patch also uses it for
// albedo/roughness and adds GB to the authored plaster normal. Macro variation,
// rising damp and rain streaks are procedural in world space, so no painted pixels.
function patch(material: THREE.MeshStandardMaterial, params: PlasterDetailParams) {
  material.onBeforeCompile = shader => {
    for (const [key, name] of Object.entries(UNIFORMS)) shader.uniforms[name] = { value: params[key as keyof PlasterDetailParams] };
    const uniforms = Object.values(UNIFORMS).map(name => `uniform float ${name};`).join('\n');
    let vert = replace(shader.vertexShader, 'void main() {', 'varying vec3 csWorldPos;\nvarying vec3 csWorldNormal;\nvoid main() {');
    vert = replace(vert, '#include <project_vertex>', `#include <project_vertex>
	csWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
	csWorldNormal = normalize( mat3( modelMatrix ) * objectNormal );`);
    shader.vertexShader = vert;
    let frag = replace(shader.fragmentShader, 'void main() {', `${uniforms}\nvarying vec3 csWorldPos;\nvarying vec3 csWorldNormal;\n${NOISE}\nvoid main() {`);
    frag = replace(frag, '#include <map_fragment>', `#include <map_fragment>
	vec3 csDetail = texture2D( aoMap, vAoMapUv ).rgb;
	float csCavity = csDetail.r / csPlasterMean;
	diffuseColor.rgb *= mix( 1.0, csCavity, csPlasterAlbedo );
	// Anti-tiling: blend in a rotated, rescaled second read of the base albedo.
	float csM = csNoise( csWorldPos * csMacroScale ) * 0.65 + csNoise( csWorldPos * csMacroScale * 2.7 + 17.0 ) * 0.35;
	vec3 csAlt = texture2D( map, csRot * vMapUv * 0.73 + 0.37 ).rgb;
	diffuseColor.rgb *= mix( vec3( 1.0 ), csAlt / max( sampledDiffuseColor.rgb, vec3( 0.02 ) ), smoothstep( 0.35, 0.65, csM ) * csMacroBlend );
	// Two-octave value noise clusters near 0.5; re-spread it so patches read at street distance.
	float csMv = smoothstep( 0.3, 0.7, csM );
	diffuseColor.rgb *= 1.0 + ( csMv - 0.5 ) * 2.0 * csMacroStrength * vec3( 1.0, 0.93, 0.8 );
	// Vertical faces only: rising damp at the base and rain streaks down the wall.
	float csVertical = 1.0 - smoothstep( 0.35, 0.7, abs( csWorldNormal.y ) );
	vec2 csTangent = vec2( -csWorldNormal.z, csWorldNormal.x );
	float csAlong = dot( csWorldPos.xz, csTangent ) / max( length( csTangent ), 1e-3 );
	float csEdge = csGrimeHeight * ( 0.55 + 0.6 * csNoise( vec3( csAlong * 1.7, 0.0, csM * 3.0 ) ) );
	float csGrime = ( 1.0 - smoothstep( 0.0, csEdge, csWorldPos.y ) ) * csVertical;
	float csStreak = smoothstep( 0.62, 0.95, csNoise( vec3( csAlong * 7.0, csWorldPos.y * 0.22, 3.1 ) ) )
		* smoothstep( 0.4, 0.8, csNoise( vec3( csAlong * 0.35, csWorldPos.y * 0.09, 9.7 ) ) ) * csVertical;
	diffuseColor.rgb *= mix( vec3( 1.0 ), vec3( 0.6, 0.54, 0.46 ), csGrime * csGrimeStrength );
	diffuseColor.rgb *= 1.0 - csStreak * csStreakStrength * vec3( 0.9, 0.95, 1.0 );`);
    frag = replace(frag, '#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
	roughnessFactor = clamp( roughnessFactor * mix( 1.0, 0.82 + 0.36 * ( 1.0 - csDetail.r ), csPlasterRough ) + csGrime * 0.08 - csStreak * 0.05, 0.3, 1.0 );`);
    frag = replace(frag, '#include <normal_fragment_maps>', `vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	mapN.xy *= normalScale;
	mapN.xy += ( csDetail.gb * 2.0 - 1.0 ) * csPlasterNormal;
	normal = normalize( tbn * mapN );`);
    shader.fragmentShader = frag;
  };
  material.customProgramCacheKey = () => CACHE_KEY;
}

/** Validate every marked material first, then patch them; returns the count. */
export function applyPlasterDetail(root: THREE.Object3D) {
  const pending = new Map<THREE.MeshStandardMaterial, PlasterDetailParams>();
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
