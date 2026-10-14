import { sampleSteadyFoot, type SteadyGaitProfile } from './steady-gait';
import type { StopFeet } from './stop-gait';

export interface StartGaitPlan { bodyDistance: number; initial: StopFeet; profile: SteadyGaitProfile; firstTouchdownDistance: number }
const ease = (t: number) => t * t * t * (10 + t * (-15 + 6 * t));

/** Start/restart on flat ground with a fixed heading and planted, flat feet.
 * All distances share a fixed path origin in metres before actor scale.
 * The caller treats this copied plan as read-only and advances travel using
 * actual forward displacement, monotonically, not intended movement or time.
 */
export function createStartGaitPlan(bodyDistance: number, feet: StopFeet, profile: SteadyGaitProfile): StartGaitPlan {
  if (!Number.isFinite(bodyDistance) || feet.length !== 2 || feet.some(f => f.phase !== 'stance' ||
      !Number.isFinite(f.distance) || Math.abs(f.distance - bodyDistance) > .015 + 1e-12 || f.clearance !== 0 || f.pitch !== 0)) {
    throw new Error('Start gait requires planted neutral feet');
  }
  sampleSteadyFoot(0, profile); // Validate calibration once before making a snapshot.
  return { bodyDistance, initial: feet.map(f => ({ ...f })) as StopFeet, profile: { ...profile }, firstTouchdownDistance: (1 - profile.duty) * profile.cycleDistance / 2 };
}
export function sampleStartGait(plan: StartGaitPlan, travel: number, output: StopFeet = [{ ...plan.initial[0] }, { ...plan.initial[1] }]): StopFeet {
  if (!Number.isFinite(travel) || travel < 0) throw new Error('Invalid forward gait travel');
  if (travel === 0) {
    for (let i = 0; i < 2; i++) Object.assign(output[i], plan.initial[i]);
    return output;
  }
  const { profile, bodyDistance, initial } = plan, originPhase = profile.duty / 2;
  const cycle = originPhase + travel / profile.cycleDistance;
  for (let i = 0; i < 2; i++) {
    const foot = sampleSteadyFoot(cycle + i * .5, profile, output[i]);
    foot.distance += bodyDistance - (originPhase + i * .5) * profile.cycleDistance;
    if (i === 0 && cycle < 1) {
      if (cycle < profile.duty) foot.distance = initial[0].distance;
      else foot.distance += (initial[0].distance - bodyDistance) * (1 - ease((cycle - profile.duty) / (1 - profile.duty)));
    }
    if (i === 1 && travel < plan.firstTouchdownDistance) {
      const t = travel / plan.firstTouchdownDistance, e = ease(t);
      foot.phase = 'swing';
      foot.distance = initial[1].distance + (bodyDistance + profile.cycleDistance / 2 - initial[1].distance) * e;
      foot.clearance = 16 * t * t * (1 - t) * (1 - t) * profile.lift / 2;
      foot.pitch = Math.PI / 18 * e;
    }
  }
  return output;
}
