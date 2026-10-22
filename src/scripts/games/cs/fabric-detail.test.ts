import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyFabricDetail, FABRIC_DETAIL_KEY } from './fabric-detail';
import { cloneModel } from './model-resources';

const params = { normalStrength: .6, albedoStrength: .5, cavityMean: .8, foldContrast: 2, atlasMean: .5 };
function sleeve(extra: Record<string, unknown> | null = params, maps = true) {
  const material = new THREE.MeshStandardMaterial({ name: 'MakeHuman_authored_FPS_uniform_CC0' });
  if (maps) { material.normalMap = new THREE.Texture(); material.aoMap = new THREE.Texture(); }
  if (extra) material.userData[FABRIC_DETAIL_KEY] = extra;
  const root = new THREE.Group(); root.add(new THREE.Mesh(new THREE.BufferGeometry(), material));
  return { root, material };
}
function compile(material: THREE.Material) {
  const lib = THREE.ShaderLib.physical;
  const shader = { uniforms: THREE.UniformsUtils.clone(lib.uniforms), vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader } as unknown as THREE.WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  return shader;
}

describe('sleeve fabric detail material patch', () => {
  it('perturbs the baked normal and albedo with the tiled occlusion-slot detail', () => {
    const { root, material } = sleeve();
    expect(applyFabricDetail(root)).toBe(1);
    const shader = compile(material), frag = shader.fragmentShader;
    expect(shader.uniforms.csFabricNormal.value).toBe(.6);
    expect(shader.uniforms.csFabricAlbedo.value).toBe(.5);
    expect(shader.uniforms.csFabricMean.value).toBe(.8);
    // The baked fold albedo is re-contrasted around its measured mean, before detail.
    expect(shader.uniforms.csFoldContrast.value).toBe(2);
    expect(shader.uniforms.csAtlasMean.value).toBe(.5);
    expect(frag.indexOf('sampledDiffuseColor.rgb / csAtlasMean')).toBeGreaterThan(frag.indexOf('#include <map_fragment>'));
    // The detail is sampled once after the albedo map, then reused for the normal.
    const sample = frag.indexOf('texture2D( aoMap, vAoMapUv )'), albedo = frag.indexOf('csFabricAlbedo )'), normal = frag.indexOf('* csFabricNormal');
    expect(sample).toBeGreaterThan(frag.indexOf('#include <map_fragment>'));
    expect(albedo).toBeGreaterThan(sample);
    expect(frag).not.toContain('#include <normal_fragment_maps>');
    expect(normal).toBeGreaterThan(frag.indexOf('#include <normal_fragment_begin>'));
    expect(frag.indexOf('normal = normalize( tbn * mapN )', normal)).toBeGreaterThan(normal);
    expect(frag).toContain('uniform float csFabricNormal;');
    expect(material.customProgramCacheKey()).toBe('cs-fabric-detail-v36');
  });
  it('leaves unmarked materials untouched and survives per-instance cloning', () => {
    const plain = sleeve(null), marked = sleeve();
    const before = plain.material.onBeforeCompile;
    expect(applyFabricDetail(plain.root)).toBe(0);
    expect(plain.material.onBeforeCompile).toBe(before);
    applyFabricDetail(marked.root);
    const instance = cloneModel(marked.root), clone = (instance.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    expect(clone).not.toBe(marked.material);
    expect(clone.customProgramCacheKey()).toBe('cs-fabric-detail-v36');
    expect(compile(clone).fragmentShader).toContain('csFabricNormal');
  });
  it.each([
    ['non-finite strength', { ...params, normalStrength: Number.NaN }],
    ['excessive normal', { ...params, normalStrength: 3 }],
    ['zero cavity mean', { ...params, cavityMean: 0 }],
    ['missing field', { normalStrength: .5, albedoStrength: .5 }],
    ['flattening fold contrast', { ...params, foldContrast: .5 }],
    ['zero atlas mean', { ...params, atlasMean: 0 }],
  ])('rejects %s before patching anything', (_, extra) => {
    const good = sleeve(), bad = sleeve(extra as Record<string, unknown>);
    const root = new THREE.Group(); root.add(good.root, bad.root);
    const before = good.material.onBeforeCompile;
    expect(() => applyFabricDetail(root)).toThrow('Invalid fabric detail');
    expect(good.material.onBeforeCompile).toBe(before);
  });
  it('requires the tangent-space normal map and the detail map it patches', () => {
    expect(() => applyFabricDetail(sleeve(params, false).root)).toThrow('Invalid fabric detail');
  });
});
