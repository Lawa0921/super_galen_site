// Imported only by the explicitly opted-in development client.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import characterUrl from '../../../../art-factory/cs/runs/run-20261004-v7-skin-gait/candidate/sole-weights-v1.glb?url';
import calibrationUrl from '../../../../art-factory/cs/runs/run-20261004-v7-rifle-grip/calibration-v17-thumb-patch.json?url';
import vestLodUrl from '../../../../art-factory/cs/runs/run-20261005-v7-character-lod/candidate/vest-half-v2.u16?url';
import motionUrl from '../../../../art-factory/cs/runs/run-20261005-v7-cmu-body-track/candidate/body-compact-v1.json?url';
import { createGameEngineActor } from './skin-rig';
import { createRifleStance, type RifleStanceCalibration } from './rifle-stance';
import { disposeModelInstance, disposeModelResources } from './model-resources';
import { createSkinLodGeometry, bindSkinLod } from './skin-lod';
import { mountRifleToChest } from './rifle-rest';
import { compileSkinMotion, type MotionBake } from './skin-motion';
import { createSkinCombatMotion } from './skin-combat-pose';
import type { SkinCandidateSource } from './renderer';

async function verifiedBytes(url: string, expected: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Candidate source unavailable');
  const bytes = await response.arrayBuffer();
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
  if (hash !== expected) throw new Error('Candidate source hash mismatch');
  return bytes;
}

/** Development motion candidate. Forward contact and bounded hit response are
 * integrated. Strafe and aim need acceptance; source retargeting stays offline.
 */
export async function loadSkinCandidate(rifle: THREE.Group): Promise<SkinCandidateSource> {
  const [character, calibration, , lodBytes, motionBytes] = await Promise.all([
    verifiedBytes(characterUrl, 'ceed6a8d8936bdf1eef464f8ed50d602fc7a2255bf1d483f2d423ddd953113e1'),
    verifiedBytes(calibrationUrl, 'a643bc94b294e916e8f6ff61366af456684802bb975dc8a8c8a060deba62551f'),
    // V33 separates the real magazine and compacts receiver indices. Frozen
    // grip/trigger points, triangle positions, PBR and root transforms match
    // the original source; FPS hands are excluded from the rigid world mount.
    // V36 only adds the sleeve fabric detail to the GLB JSON; its BIN is byte-exact.
    verifiedBytes('/assets/games/cs/rifle.glb', '2ed2448e8132dcd60d106615c6358b9f1b5a3fd5841ca1d068fd9722e2de4a51'),
    verifiedBytes(vestLodUrl, '67f4cb45ad3d49bae863a4748ebf087c32c2d3df4b59a4a00c94ed49e1fc2b79'),
    verifiedBytes(motionUrl, '15132eadb5a63f972399717233b9e4e85af8f810403fc3d930280f1cced9866b'),
  ]);
  const motion = compileSkinMotion(JSON.parse(new TextDecoder().decode(motionBytes)) as MotionBake);
  const config = JSON.parse(new TextDecoder().decode(calibration)) as RifleStanceCalibration;
  if (config.fingerCommands.length !== 39 || config.fingerTargets?.length !== 1 ||
      config.fingerTargets[0].side !== 'r' || config.fingerTargets[0].finger !== 'index') throw new Error('Unsupported candidate calibration');
  config.fingerTargets[0].vertex = 6903;
  const source = (await new GLTFLoader().parseAsync(character, '')).scene;
  let prototype: THREE.Group | undefined;
  const lodResources = new THREE.Group();
  try {
    let rig = createGameEngineActor(source); prototype = rig.actor;
    const stance = createRifleStance(rig, rifle, config);
    rig.applyPose(stance.commands); stance.prepareArms();
    if (!stance.solveArms() || !stance.solveFingers()) throw new Error('Candidate rifle pose rejected');
    stance.weaponRoot.name = 'held-weapon'; mountRifleToChest(rig, stance.weaponRoot);
    rig = createGameEngineActor(rig.model); disposeModelInstance(prototype); prototype = rig.actor;
    prototype.name = 'skin-candidate-cmu-cycle';
    prototype.traverse(node => { if (node instanceof THREE.Mesh) { node.castShadow = true; node.receiveShadow = false; } });
    prototype.updateMatrixWorld(true);
    // Conservative actor bounds encompass the current walk/run and transition
    // poses. Avoid a full skinned vertex scan every frame or per new bot.
    prototype.traverse(node => { if (node instanceof THREE.SkinnedMesh) {
      node.boundingBox = new THREE.Box3(new THREE.Vector3(-2, -1, -2), new THREE.Vector3(2, 3, 2));
      node.boundingSphere = node.boundingBox.getBoundingSphere(new THREE.Sphere());
    } });
    const prepared = prototype;
    const vest = source.getObjectByName('tactical_vest');
    if (!(vest instanceof THREE.SkinnedMesh) || Array.isArray(vest.material)) throw new Error('Unsupported candidate vest');
    const reduced = createSkinLodGeometry(vest.geometry, new Uint16Array(lodBytes));
    // Retain the dormant geometry in the owner's disposal traversal. Its
    // attributes and material belong to source, never to an individual actor.
    lodResources.add(new THREE.Mesh(reduced, vest.material));
    const updates = new WeakMap<THREE.Group, ReturnType<typeof bindSkinLod>>();
    const controllers = new WeakMap<THREE.Group, ReturnType<typeof createSkinCombatMotion>>();
    return { source: prepared, resources: [source, prepared, lodResources], dispose: () => {
      disposeModelInstance(prepared); disposeModelResources([source, lodResources]);
    }, create: () => {
      const instance = createGameEngineActor(rig.model), model = instance.actor, mesh = model.getObjectByName('tactical_vest') as THREE.SkinnedMesh;
      const controller = createSkinCombatMotion(instance, motion); controllers.set(model, controller); model.userData.skinMotion = controller.state;
      updates.set(model, bindSkinLod(mesh, reduced)); return model;
    }, updatePose: (model, actor, match, flinch) => {
      controllers.get(model)!.update(actor, match, flinch);
    }, updateLod: (model, camera) => {
      const distance = Math.hypot(camera.position.x - model.position.x, camera.position.y - model.position.y - .9, camera.position.z - model.position.z);
      const distant = updates.get(model)!(distance, camera.fov);
      model.userData.skinLod = distant ? 'half' : 'source'; return distant;
    } };
  } catch (error) {
    if (prototype) disposeModelInstance(prototype);
    disposeModelResources([source, lodResources]);
    throw error;
  }
}
