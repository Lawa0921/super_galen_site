/** Actor-aligned coordinates relative to one shared sole-anchor origin.
 * Input is the calibrated foot+ball skin only, with weights summing to one.
 * Pitch is about actor +X; +pitch lifts the actor's -Z-facing toe.
 */
export interface SolePoint { point: readonly [number, number, number]; ballWeight: number; contactMask?: 0 | 1 | 2 | 3 }
export interface SoleContactSample { offsetY: number; offsetZ: number; ballPitch: number; supportMask: number }
export interface SoleContactProfile { samples: SoleContactSample[]; cellSupportMasks: number[]; step: number; limit: number }

/** Calibrate once, outside the frame loop. During toe-off the ball counter-
 * rotates, so the preserved toe weights participate in the contact surface.
 * A deterministic lower-envelope integral keeps the instantaneous supporting
 * vertex stationary in Z as the sole rolls. Contact-patch coverage and actual
 * skinned mesh agreement must be checked against the source separately.
 */
export function createSoleContactProfile(points: readonly SolePoint[], ballPivot: readonly [number, number, number]): SoleContactProfile {
  if (!points.length || ballPivot.length !== 3 || !ballPivot.every(Number.isFinite) || points.some(p =>
    p.point.length !== 3 || !p.point.every(Number.isFinite) || !Number.isFinite(p.ballWeight) || p.ballWeight < 0 || p.ballWeight > 1)) {
    throw new Error('Invalid calibrated sole points or ball pivot');
  }
  const coefficients = points.map(({ point: p, ballWeight: w }) => ({
    y: p[1], z: p[2], ay: (1 - w) * p[1] + w * ballPivot[1], az: (1 - w) * p[2] + w * ballPivot[2],
    by: w * (p[1] - ballPivot[1]),
  }));
  const support = (angle: number, toe: boolean) => {
    const sine = Math.sin(angle), cosine = Math.cos(angle);
    let minimum = Infinity, derivativeZ = 0, supportMask = 0;
    for (let i = 0; i < coefficients.length; i++) {
      const p = coefficients[i];
      const derivative = (toe ? p.ay : p.y) * cosine - (toe ? p.az : p.z) * sine;
      const y = derivative + (toe ? p.by : 0);
      // Stable source-order tie break, including duplicated UV-seam points.
      if (y < minimum - 1e-12) { minimum = y; derivativeZ = derivative; supportMask = points[i].contactMask ?? 0; }
      else if (Math.abs(y - minimum) <= 1e-12) supportMask |= points[i].contactMask ?? 0;
    }
    return { y: minimum, derivativeZ, supportMask };
  };
  const limit = 10 * Math.PI / 180, step = limit / 40;
  const samples: SoleContactSample[] = new Array(81);
  const cellSupportMasks: number[] = new Array(80);
  const rest = support(0, false);
  samples[40] = { offsetY: rest.y === 0 ? 0 : -rest.y, offsetZ: 0, ballPitch: 0, supportMask: rest.supportMask };
  for (const direction of [-1, 1]) {
    let z = 0, previousAngle = 0;
    const toe = direction < 0;
    for (let i = 1; i <= 40; i++) {
      const angle = direction * i * step, h = (angle - previousAngle) / 32;
      const initial = support(previousAngle, toe);
      let previous = initial.derivativeZ, cellMask = initial.supportMask;
      // Fine deterministic trapezoids tolerate support changes without fitting
      // one smooth polynomial across a kink or across the toe/heel branch.
      for (let j = 1; j <= 32; j++) {
        const next = support(previousAngle + h * j, toe);
        cellMask |= next.supportMask;
        z -= (previous + next.derivativeZ) * h / 2; previous = next.derivativeZ;
      }
      cellSupportMasks[direction > 0 ? 40 + i - 1 : 40 - i] = cellMask;
      const final = support(angle, toe);
      samples[40 + direction * i] = { offsetY: -final.y, offsetZ: z, ballPitch: toe ? -angle : 0, supportMask: final.supportMask };
      previousAngle = angle;
    }
  }
  return { samples, cellSupportMasks, step, limit };
}

/** Constant-time runtime lookup; no skin evaluation, searches or allocations
 * when the caller supplies its reusable output object. Bounds are not clamped.
 */
export function sampleSoleContact(profile: SoleContactProfile, pitch: number, output: SoleContactSample = { offsetY: 0, offsetZ: 0, ballPitch: 0, supportMask: 0 }) {
  if (!Number.isFinite(pitch) || Math.abs(pitch) > profile.limit + 1e-12) throw new Error('Pitch outside calibrated sole profile');
  const index = Math.max(0, Math.min(80, (pitch + profile.limit) / profile.step));
  const left = Math.floor(index), right = Math.min(80, left + 1), t = index - left;
  const a = profile.samples[left], b = profile.samples[right];
  output.offsetY = a.offsetY + (b.offsetY - a.offsetY) * t;
  output.offsetZ = a.offsetZ + (b.offsetZ - a.offsetZ) * t;
  output.ballPitch = a.ballPitch + (b.ballPitch - a.ballPitch) * t;
  // Include support patches observed inside the cell, not only its endpoints.
  // This sampled envelope still needs source-specific skinned-pose validation.
  output.supportMask = t < 1e-10 ? a.supportMask : 1 - t < 1e-10 ? b.supportMask : profile.cellSupportMasks[left];
  return output;
}
