import * as THREE from 'three';
import type { Actor, Match } from './engine';
export interface MotionBake {
  schema: string; bones: string[];
  clips: { name: string; duration: number; distance: number; phaseOffset?: number; frames: { offset: number[]; rotations: number[][] }[] }[];
  blendSpace?: { knots: { mix: number; frames: MotionBake['clips'][number]['frames'] }[] };
}
interface Pose { offset: THREE.Vector3; rotations: THREE.Quaternion[] }
type CompiledMotion = ReturnType<typeof compileSkinMotion>;
export function compileSkinMotion(input: MotionBake) {
  if (input.schema !== 'cs-cmu-target-cycles-v1' || !input.bones.length || new Set(input.bones).size !== input.bones.length ||
      input.clips.length !== 2 || !['walk', 'run'].every(name => input.clips.some(c => c.name === name))) throw new Error('Invalid motion bake');
  const bones = [...input.bones];
  const knots = input.blendSpace?.knots;
  if (knots && (knots.length < 2 || knots.length > 33 || knots[0].mix !== 0 || knots.at(-1)!.mix !== 1 ||
      knots.some((k, i) => !Number.isFinite(k.mix) || (i > 0 && k.mix <= knots[i - 1].mix)))) throw new Error('Invalid contact blend space');
  const mixes = knots?.map(k => k.mix);
  const tracks = [...input.clips, ...(knots ?? []).map((k, i) => ({ name: `@blend/${i}`, frames: k.frames, duration: 1, distance: 1, phaseOffset: 0 }))];
  const clips = new Map(tracks.map(clip => {
    const phaseOffset = clip.phaseOffset ?? 0;
    if (!Number.isFinite(phaseOffset) || phaseOffset < 0 || phaseOffset >= 1) throw new Error('Invalid motion phase alignment');
    if (![clip.duration, clip.distance].every(v => Number.isFinite(v) && v > 0) || clip.frames.length < 5 || clip.frames.length > 4097) throw new Error('Invalid motion interval');
    const count = clip.frames.length - 1, stride = 3 + bones.length * 4, values = new Float64Array((count + 1) * stride);
    clip.frames.forEach((frame, i) => {
      if (frame.offset.length !== 3 || !frame.offset.every(Number.isFinite) || frame.rotations.length !== bones.length) throw new Error('Invalid motion pose');
      values.set(frame.offset, i * stride);
      frame.rotations.forEach((q, j) => {
        const length = Math.hypot(...q);
        if (q.length !== 4 || !q.every(Number.isFinite) || Math.abs(length - 1) > 1e-5) throw new Error('Invalid motion rotation');
        const at = i * stride + 3 + j * 4, sign = i && q.reduce((n, v, k) => n + v * values[at - stride + k], 0) < 0 ? -1 : 1;
        // Quantized keys may be nearly unit-length. Normalize once on load so
        // the closed-loop dot test measures orientation, not storage length.
        for (let k = 0; k < 4; k++) values[at + k] = q[k] * sign / length;
      });
    });
    for (let k = 0; k < 3; k++) if (Math.abs(values[k] - values[count * stride + k]) > 1e-6) throw new Error('Open motion offset seam');
    for (let j = 0; j < bones.length; j++) {
      const at = 3 + j * 4;
      let dot = 0; for (let k = 0; k < 4; k++) dot += values[at + k] * values[count * stride + at + k];
      if (Math.abs(dot) < 1 - 1e-10) throw new Error('Open motion rotation seam');
    }
    return [clip.name, { duration: clip.duration, distance: clip.distance, phaseOffset, count, stride, values }] as const;
  }));
  return { bones, distance: (name: string) => clips.get(name)!.distance,
    createPose: (): Pose => ({ offset: new THREE.Vector3(), rotations: bones.map(() => new THREE.Quaternion()) }),
    sampleBlend(mix: number, phase: number, lower: Pose, upper: Pose) {
      if (!Number.isFinite(mix) || mix < 0 || mix > 1) throw new Error('Invalid motion blend');
      if (!mixes) { this.sample('walk', phase, lower); this.sample('run', phase, upper); return mix; }
      let i = 0; while (i < mixes.length - 2 && mix > mixes[i + 1]) i++;
      this.sample(`@blend/${i}`, phase, lower); this.sample(`@blend/${i + 1}`, phase, upper);
      return (mix - mixes[i]) / (mixes[i + 1] - mixes[i]);
    },
    sample(name: string, phase: number, out: Pose) {
      const c = clips.get(name);
      if (!c || !Number.isFinite(phase) || phase < 0 || phase > 1) throw new Error('Invalid motion sample');
      const key = ((phase + c.phaseOffset) % 1) * c.count, index = Math.floor(key), u = key - index, u2 = u * u, u3 = u2 * u;
      const a = ((index + c.count - 1) % c.count) * c.stride, b = index * c.stride;
      const d = ((index + 1) % c.count) * c.stride, e = ((index + 2) % c.count) * c.stride, v = c.values;
      const wa = -.5 * u3 + u2 - .5 * u, wb = 1.5 * u3 - 2.5 * u2 + 1, wd = -1.5 * u3 + 2 * u2 + .5 * u, we = .5 * u3 - .5 * u2;
      out.offset.set(wa*v[a]+wb*v[b]+wd*v[d]+we*v[e],wa*v[a+1]+wb*v[b+1]+wd*v[d+1]+we*v[e+1],wa*v[a+2]+wb*v[b+2]+wd*v[d+2]+we*v[e+2]);
      for (let j = 0; j < bones.length; j++) {
        const at = 3 + j * 4;
        let da=0,dd=0,de=0;for(let k=0;k<4;k++){da+=v[a+at+k]*v[b+at+k];dd+=v[d+at+k]*v[b+at+k];de+=v[e+at+k]*v[b+at+k];}
        const ca=wa*(da<0?-1:1),cd=wd*(dd<0?-1:1),ce=we*(de<0?-1:1),q=out.rotations[j];
        q.set(ca*v[a+at]+wb*v[b+at]+cd*v[d+at]+ce*v[e+at],ca*v[a+at+1]+wb*v[b+at+1]+cd*v[d+at+1]+ce*v[e+at+1],
          ca*v[a+at+2]+wb*v[b+at+2]+cd*v[d+at+2]+ce*v[e+at+2],ca*v[a+at+3]+wb*v[b+at+3]+cd*v[d+at+3]+ce*v[e+at+3]).normalize();
      }
    } };
}

/** Per-instance state, shared offline samples. No IK or vertex scans per frame. */
export function createSkinMotion(rig: { visual: THREE.Group; bones: ReadonlyMap<string, THREE.Bone> }, data: CompiledMotion) {
  const bones = data.bones.map(name => { const bone = rig.bones.get(name); if (!bone) throw new Error('Missing motion bone'); return bone; });
  const rest = bones.map(b => b.quaternion.clone()), origin = rig.visual.position.clone(), walk = data.createPose(), run = data.createPose();
  const state = { phase: 0, weight: 0, runMix: 0, speed: 0 };
  let previous: Match | undefined, round = -1, time = 0, x = 0, z = 0, hp = 0;
  function neutral() { state.phase = state.weight = state.runMix = state.speed = 0; bones.forEach((b, i) => b.quaternion.copy(rest[i])); rig.visual.position.copy(origin); }
  return { state, update(actor: Actor, match: Match) {
    if (![match.time, actor.x, actor.z, actor.hp].every(Number.isFinite)) throw new Error('Invalid actor motion');
    const dt = match.time - time, distance = Math.hypot(actor.x - x, actor.z - z);
    const reset = previous !== match || round !== match.round || dt < 0 || dt > .25 || hp <= 0 || actor.hp <= 0 || match.phase !== 'live' || distance > Math.max(.8, Math.max(0, dt) * 8);
    previous = match; round = match.round; time = match.time; x = actor.x; z = actor.z; hp = actor.hp;
    if (reset) { neutral(); return; }
    if (dt === 0) return;
    state.speed = distance / dt;
    state.runMix += (THREE.MathUtils.clamp((state.speed - 2.4) / 1.2, 0, 1) - state.runMix) * (1 - Math.exp(-dt * 15));
    const moving = distance > 1e-5, change = dt / .12;
    state.weight = THREE.MathUtils.clamp(state.weight + (moving ? change : -change), 0, 1);
    const stride = THREE.MathUtils.lerp(data.distance('walk'), data.distance('run'), state.runMix);
    state.phase = (state.phase + distance / stride) % 1;
    const blend = data.sampleBlend(state.runMix, state.phase, walk, run);
    for (let i = 0; i < bones.length; i++) {
      bones[i].quaternion.slerpQuaternions(walk.rotations[i], run.rotations[i], blend).slerp(rest[i], 1 - state.weight);
    }
    rig.visual.position.lerpVectors(walk.offset, run.offset, blend).multiplyScalar(state.weight).addScaledVector(origin, 1 - state.weight);
  } };
}
