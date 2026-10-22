import type { SteadyFootSample } from './steady-gait';

export type StopFeet = [SteadyFootSample, SteadyFootSample];
interface StopSegment { start: StopFeet; end: StopFeet; lifts: [number, number]; startTime: number; duration: number }
export interface StopGaitPlan { bodyDistance: number; initial: StopFeet; final: StopFeet; segments: StopSegment[]; duration: number }
const copy = (feet: StopFeet) => feet.map(f => ({ ...f })) as StopFeet;
const ease = (t: number) => t * t * t * (10 + t * (-15 + 6 * t));
const deadzone = .015, lift = .045;

/** Stop-only plan from a captured pose: flat ground, fixed heading/body position.
 * Distances are along the same fixed path in metres BEFORE actor uniform scale.
 * The snapshot and segment boundaries are C0; abrupt stopping does not promise
 * velocity continuity with the preceding moving gait. Not a start/turn policy.
 */
export function createStopGaitPlan(bodyDistance: number, feet: StopFeet): StopGaitPlan {
  if (!Number.isFinite(bodyDistance) || feet.length !== 2 || feet.some(f =>
    !['stance', 'swing'].includes(f.phase) || ![f.distance, f.clearance, f.pitch].every(Number.isFinite) ||
    f.clearance < 0 || Math.abs(f.pitch) > Math.PI / 18 + 1e-12 || (f.phase === 'stance' && f.clearance > 1e-9))) {
    throw new Error('Invalid stop gait snapshot');
  }
  const initial = copy(feet), segments: StopSegment[] = [];
  let current = copy(feet), duration = 0;
  const append = (end: StopFeet, seconds: number, lifts: [number, number]) => {
    segments.push({ start: current, end, lifts, startTime: duration, duration: seconds });
    duration += seconds; current = end;
  };
  if (feet.some(f => f.phase === 'swing' || f.pitch !== 0 || f.clearance !== 0)) {
    const end = feet.map(f => ({ phase: 'stance', distance: f.phase === 'swing' ? bodyDistance : f.distance, clearance: 0, pitch: 0 })) as StopFeet;
    const lifts = feet.map(f => f.phase === 'swing' && Math.abs(f.distance - bodyDistance) > deadzone ? lift : 0) as [number, number];
    append(end, .18, lifts);
  }
  const order = [0, 1].sort((a, b) => Math.abs(current[b].distance - bodyDistance) - Math.abs(current[a].distance - bodyDistance) || a - b);
  for (const side of order) if (Math.abs(current[side].distance - bodyDistance) > deadzone) {
    const end = copy(current), lifts: [number, number] = [0, 0];
    end[side] = { phase: 'stance', distance: bodyDistance, clearance: 0, pitch: 0 }; lifts[side] = lift;
    append(end, .24, lifts);
  }
  return { bodyDistance, initial, final: copy(current), segments, duration };
}

export function sampleStopGait(plan: StopGaitPlan, time: number, output: StopFeet = [{ ...plan.initial[0] }, { ...plan.initial[1] }]): StopFeet {
  if (!Number.isFinite(time) || time < 0) throw new Error('Invalid stop gait time');
  if (time === 0 || time >= plan.duration) {
    const value = time === 0 ? plan.initial : plan.final;
    for (let i = 0; i < 2; i++) Object.assign(output[i], value[i]);
    return output;
  }
  const segment = plan.segments.find(s => time < s.startTime + s.duration)!;
  const t = Math.max(0, (time - segment.startTime) / segment.duration), e = ease(t), bell = 16 * t * t * (1 - t) * (1 - t);
  for (let i = 0; i < 2; i++) {
    const a = segment.start[i], b = segment.end[i], foot = output[i];
    foot.phase = a.phase === 'swing' || segment.lifts[i] > 0 ? 'swing' : 'stance';
    foot.distance = a.distance + (b.distance - a.distance) * e;
    foot.pitch = a.pitch + (b.pitch - a.pitch) * e;
    foot.clearance = a.clearance * (1 - e) + bell * segment.lifts[i];
  }
  return output;
}
