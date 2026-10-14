export interface SteadyGaitProfile { cycleDistance: number; duty: number; lift: number; drop: number; swing?: 'cruise' }
export const WALK_GAIT: SteadyGaitProfile = { cycleDistance: .6, duty: .62, lift: .085, drop: .06 };
export const RUN_GAIT: SteadyGaitProfile = { cycleDistance: 1.3, duty: .42, lift: .14, drop: .06 };
export interface SteadyFootSample { phase: 'stance' | 'swing'; distance: number; clearance: number; pitch: number }
const ease = (x: number) => x * x * x * (10 + x * (-15 + x * 6));
const pitchLimit = 10 * Math.PI / 180;
// Integrate a smoothstep velocity ramp at each end, cruising in between.
// The short acceleration avoids a long-stride foot lingering behind its hip.
// Area under the velocity curve is 1-ramp; normalize to one complete stride.
const cruiseProgress = (t: number): number => {
  const ramp = .12;
  if (t > .5) return 1 - cruiseProgress(1 - t);
  if (t >= ramp) return (t - ramp / 2) / (1 - ramp);
  const u = t / ramp;
  return ramp * (u * u * u - .5 * u * u * u * u) / (1 - ramp);
};

/** Analytic steady-speed calibration, not a production transition controller.
 * cycleDistance is the distance travelled by the body during one SAME-foot
 * cycle. The other foot uses cycle + .5 and subtracts half a cycleDistance
 * from the returned distance. Stance bases stay fixed in world space.
 */
export function sampleSteadyFoot(cycle: number, profile: SteadyGaitProfile,
  output: SteadyFootSample = { phase: 'stance', distance: 0, clearance: 0, pitch: 0 }): SteadyFootSample {
  if (!Number.isFinite(cycle) || ![profile.cycleDistance, profile.duty, profile.lift, profile.drop].every(Number.isFinite) ||
      profile.cycleDistance <= 0 || profile.duty <= 0 || profile.duty >= 1 || profile.lift <= 0 || profile.drop < 0 ||
      (profile.swing !== undefined && profile.swing !== 'cruise')) {
    throw new Error('Invalid steady gait calibration');
  }
  const whole = Math.floor(cycle), phase = cycle - whole;
  output.distance = (whole + profile.duty / 2) * profile.cycleDistance;
  if (phase < profile.duty) {
    const stance = phase / profile.duty;
    output.phase = 'stance'; output.clearance = 0;
    output.pitch = stance < .25 ? pitchLimit * (1 - ease(stance / .25)) :
      stance > .7 ? -pitchLimit * ease((stance - .7) / .3) : 0;
  } else {
    const swing = (phase - profile.duty) / (1 - profile.duty), t = ease(swing);
    output.phase = 'swing'; output.distance += (profile.swing === 'cruise' ? cruiseProgress(swing) : t) * profile.cycleDistance;
    output.clearance = 16 * swing * swing * (1 - swing) * (1 - swing) * profile.lift;
    output.pitch = pitchLimit * (2 * t - 1);
  }
  return output;
}
