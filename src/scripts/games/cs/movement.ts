import type { WeaponId } from './engine';

// Original tuning in metres/second, not Valve movement constants. Short
// integration slices keep acceleration consistent at 30–144 simulation Hz.
export const MOVE_SPEED: Record<WeaponId, number> = { pistol: 5.3, smg: 5.2, rifle: 4.75, sniper: 4.2 };
export function advanceVelocity(body: { vx: number; vz: number }, wishX: number, wishZ: number, speed: number, grounded: boolean, dt: number) {
  let dx = 0, dz = 0;
  const slices = Math.ceil(dt / .005), h = dt / slices, active = Math.hypot(wishX, wishZ) > .001;
  for (let i = 0; i < slices; i++) {
    const previousX = body.vx, previousZ = body.vz;
    if (grounded) {
      const length = Math.hypot(body.vx, body.vz);
      const retained = length > 0 ? Math.max(0, length - Math.max(length, 2) * 6 * h) / length : 0;
      body.vx *= retained; body.vz *= retained;
    }
    if (active) {
      const x = wishX * speed - body.vx, z = wishZ * speed - body.vz, distance = Math.hypot(x, z);
      const amount = distance > 0 ? Math.min(1, (grounded ? 55 : 8) * h / distance) : 0;
      body.vx += x * amount; body.vz += z * amount;
    }
    dx += (previousX + body.vx) * .5 * h; dz += (previousZ + body.vz) * .5 * h;
  }
  return { dx, dz };
}

export function movementInaccuracy(vx: number, vz: number, weapon: WeaponId) {
  // A short accurate window rewards a timed counter-strafe; walking and
  // residual momentum still differ continuously from a full-speed shot.
  const fraction = Math.hypot(vx, vz) / MOVE_SPEED[weapon];
  return 1 + 2 * Math.min(1, Math.max(0, (fraction - .27) / .73));
}

// CS2 crouch scaled to this game's metre units: 64u→46u eye (46/64 of 1.58 m),
// a ~0.15 s duck transition and 34% crouched move speed. Head/body boxes drop
// by the same eye delta, so a crouched head top sits at 1.36 m (CS: 72u→54u).
export const STAND_EYE_HEIGHT = 1.58;
export const CROUCH_EYE_HEIGHT = 1.14;
export const CROUCH_DROP = STAND_EYE_HEIGHT - CROUCH_EYE_HEIGHT;
export const CROUCH_TIME = .15;
export const CROUCH_SPEED_SCALE = .34;
export const CROUCH_SPREAD_SCALE = .75;
const amount = (body: { crouch?: number }) => Math.max(0, Math.min(1, Number.isFinite(body.crouch) ? body.crouch! : 0));
/** Vertical drop of eye and hit volumes for the current crouch amount. */
export function crouchDrop(body: { crouch?: number }) { return CROUCH_DROP * amount(body); }
export function eyeHeight(body: { crouch?: number }) { return STAND_EYE_HEIGHT - crouchDrop(body); }
export function advanceCrouch(body: { crouch: number }, held: boolean, dt: number) {
  body.crouch = Math.max(0, Math.min(1, amount(body) + (held ? 1 : -1) * dt / CROUCH_TIME));
}
export function crouchSpeedScale(body: { crouch?: number }) { return 1 - (1 - CROUCH_SPEED_SCALE) * amount(body); }
export function crouchSpreadScale(body: { crouch?: number }) { return 1 - (1 - CROUCH_SPREAD_SCALE) * amount(body); }
