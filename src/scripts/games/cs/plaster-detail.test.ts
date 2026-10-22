import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyPlasterDetail, PLASTER_DETAIL_KEY } from './plaster-detail';
import { applyFabricDetail, FABRIC_DETAIL_KEY } from './fabric-detail';
import { cloneModel } from './model-resources';

const params = {
  normalStrength: .9, albedoStrength: .5, cavityMean: .7, roughnessStrength: .4,
  macroStrength: .12, macroScale: .18, macroBlend: .5, grimeHeight: 1.4, grimeStrength: .35, streakStrength: .2,
};
function wall(extra: Record<string, unknown> | null = params, maps = true) {
  const material = new THREE.MeshStandardMaterial({ name: 'ochre_plaster' });
  if (maps) { material.map = new THREE.Texture(); material.normalMap = new THREE.Texture(); material.aoMap = new THREE.Texture(); }
  if (extra) material.userData[PLASTER_DETAIL_KEY] = extra;
  const root = new THREE.Group(); root.add(new THREE.Mesh(new THREE.BufferGeometry(), material));
  return { root, material };
}
function compile(material: THREE.Material, lib = THREE.ShaderLib.physical) {
  const shader = { uniforms: THREE.UniformsUtils.clone(lib.uniforms), vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader } as unknown as THREE.WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  return shader;
}

describe('plaster wall detail material patch (V37)', () => {
  it('passes world position and normal from the vertex stage without extra attributes', () => {
    const { root, material } = wall();
    expect(applyPlasterDetail(root)).toBe(1);
    const vert = compile(material).vertexShader;
    expect(vert).toContain('varying vec3 csWorldPos;');
    const assign = vert.indexOf('csWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    expect(assign).toBeGreaterThan(vert.indexOf('#include <project_vertex>'));
    expect(vert.indexOf('csWorldNormal = normalize( mat3( modelMatrix ) * objectNormal );')).toBeGreaterThan(vert.indexOf('#include <beginnormal_vertex>'));
  });
  it('layers grain albedo, world macro variation, base grime and streaks after the albedo map', () => {
    const { root, material } = wall();
    applyPlasterDetail(root);
    const shader = compile(material), frag = shader.fragmentShader;
    for (const [name, value] of Object.entries({
      csPlasterNormal: .9, csPlasterAlbedo: .5, csPlasterMean: .7, csPlasterRough: .4, csMacroStrength: .12,
      csMacroScale: .18, csMacroBlend: .5, csGrimeHeight: 1.4, csGrimeStrength: .35, csStreakStrength: .2,
    })) {
      expect(shader.uniforms[name].value, name).toBe(value);
      expect(frag).toContain(`uniform float ${name};`);
    }
    const map = frag.indexOf('#include <map_fragment>'), sample = frag.indexOf('texture2D( aoMap, vAoMapUv )');
    // Exactly one detail fetch, after the base albedo, reused by roughness and normal.
    expect(sample).toBeGreaterThan(map);
    expect(frag.indexOf('texture2D( aoMap, vAoMapUv )', sample + 1)).toBe(-1);
    // Anti-tiling: a rotated second base-map sample blended by world-space noise.
    expect(frag.indexOf('texture2D( map, csRot * vMapUv')).toBeGreaterThan(map);
    expect(frag).toContain('csNoise( csWorldPos * csMacroScale )');
    // Rising damp is a world-height gradient on vertical faces only.
    expect(frag).toContain('smoothstep( 0.0, csEdge, csWorldPos.y )');
    expect(frag).toContain('csVertical');
    expect(frag.indexOf('csStreakStrength', sample)).toBeGreaterThan(sample);
  });
  it('varies roughness with the cavity and replaces the normal-map chunk with the detail normal', () => {
    const { root, material } = wall();
    applyPlasterDetail(root);
    const frag = compile(material).fragmentShader;
    const rough = frag.indexOf('#include <roughnessmap_fragment>');
    expect(frag.indexOf('roughnessFactor = clamp(', rough)).toBeGreaterThan(rough);
    expect(frag).not.toContain('#include <normal_fragment_maps>');
    const normal = frag.indexOf('* csPlasterNormal');
    expect(normal).toBeGreaterThan(frag.indexOf('#include <normal_fragment_begin>'));
    expect(frag.indexOf('normal = normalize( tbn * mapN )', normal)).toBeGreaterThan(normal);
    expect(material.customProgramCacheKey()).toBe('cs-plaster-detail-v37');
  });
  it('fails loudly when a shader anchor it patches is missing', () => {
    const { root, material } = wall();
    applyPlasterDetail(root);
    const lib = { ...THREE.ShaderLib.physical, fragmentShader: THREE.ShaderLib.physical.fragmentShader.replace('#include <roughnessmap_fragment>', '') };
    expect(() => compile(material, lib)).toThrow('roughnessmap_fragment');
  });
  it('leaves unmarked and fabric materials untouched and survives per-instance cloning', () => {
    const plain = wall(null), marked = wall();
    const sleeve = new THREE.MeshStandardMaterial({ normalMap: new THREE.Texture(), aoMap: new THREE.Texture() });
    sleeve.userData[FABRIC_DETAIL_KEY] = { normalStrength: .6, albedoStrength: .5, cavityMean: .8, foldContrast: 2, atlasMean: .5 };
    plain.root.add(new THREE.Mesh(new THREE.BufferGeometry(), sleeve));
    const before = plain.material.onBeforeCompile;
    expect(applyPlasterDetail(plain.root)).toBe(0);
    expect(plain.material.onBeforeCompile).toBe(before);
    expect(applyFabricDetail(plain.root)).toBe(1);
    applyPlasterDetail(marked.root);
    const instance = cloneModel(marked.root), clone = (instance.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    expect(clone).not.toBe(marked.material);
    expect(clone.customProgramCacheKey()).toBe('cs-plaster-detail-v37');
    expect(compile(clone).fragmentShader).toContain('csPlasterNormal');
  });
  it.each([
    ['non-finite strength', { ...params, normalStrength: Number.NaN }],
    ['excessive normal', { ...params, normalStrength: 3 }],
    ['zero cavity mean', { ...params, cavityMean: 0 }],
    ['missing field', { normalStrength: .5, albedoStrength: .5 }],
    ['grime above a storey', { ...params, grimeHeight: 5 }],
    ['macro noise finer than the detail tile', { ...params, macroScale: 2 }],
    ['over-dark grime', { ...params, grimeStrength: .8 }],
  ])('rejects %s before patching anything', (_, extra) => {
    const good = wall(), bad = wall(extra as Record<string, unknown>);
    const root = new THREE.Group(); root.add(good.root, bad.root);
    const before = good.material.onBeforeCompile;
    expect(() => applyPlasterDetail(root)).toThrow('Invalid plaster detail');
    expect(good.material.onBeforeCompile).toBe(before);
  });
  it('requires the albedo, tangent-space normal and detail maps it patches', () => {
    expect(() => applyPlasterDetail(wall(params, false).root)).toThrow('Invalid plaster detail');
  });
});
