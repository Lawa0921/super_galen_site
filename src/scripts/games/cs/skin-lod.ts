import * as THREE from 'three';

/** Source-owned geometry: all vertex streams remain shared and immutable.
 * Keep this geometry in the factory's resource set even when no actor uses it.
 * Never dispose it on a switch or when an individual actor is removed.
 */
export function createSkinLodGeometry(source: THREE.BufferGeometry, indices: Uint16Array) {
  const count = source.attributes.position?.count;
  if (!count || !source.index || !indices.length || indices.length % 3 || indices.length > source.index.count || source.groups.length ||
      indices.some(index => index >= count)) throw new Error('Invalid candidate LOD indices');
  for (let i = 0; i < indices.length; i += 3) if (indices[i] === indices[i + 1] || indices[i] === indices[i + 2] || indices[i + 1] === indices[i + 2]) {
    throw new Error('Degenerate candidate LOD face');
  }
  const geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute);
  geometry.morphAttributes = { ...source.morphAttributes }; geometry.morphTargetsRelative = source.morphTargetsRelative;
  geometry.setIndex(new THREE.BufferAttribute(indices.slice(), 1));
  geometry.boundingBox = source.boundingBox?.clone() ?? null; geometry.boundingSphere = source.boundingSphere?.clone() ?? null;
  return geometry;
}

/** Per-actor mesh assignment, not mutation of the source's shared index.
 * Distance is adjusted by camera FOV so zoom retains the near geometry.
 */
export function bindSkinLod(mesh: THREE.Mesh, reduced: THREE.BufferGeometry) {
  const original = mesh.geometry;
  let distant = false;
  return (distance: number, fov: number) => {
    const valid = Number.isFinite(distance) && distance >= 0 && Number.isFinite(fov) && fov > 0 && fov < 179;
    const apparentDistance = valid ? distance * Math.tan(fov * Math.PI / 360) / Math.tan(78 * Math.PI / 360) : 0;
    distant = valid && (distant ? apparentDistance >= 7 : apparentDistance >= 8);
    mesh.geometry = distant ? reduced : original;
    return distant;
  };
}
