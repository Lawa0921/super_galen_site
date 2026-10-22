import { buyWeapon, WEAPONS, type Actor, type Match, type Input } from './engine';
import { MAP, visible, findPath, clearRoute, walkableTarget, wallDistance, type Point } from './map';
import { crouchDrop, eyeHeight } from './movement';
import { flashAmount, launchVelocity, THROW, type GrenadeId } from './grenades';
interface ThrowPlan { kind: GrenadeId; yaw: number; pitch: number; fire: boolean; aim: boolean; since: number; hold: number }
const brains = new WeakMap<Match, Map<number, { path: Point[]; round: number; target: string; seen: number; flank: number; duck: number; plan: ThrowPlan | null; utility: number; mark: { x: number; z: number; t: number } }>>();
/** Team calls: one smoke and one flash per attack per round, not a pile-up. */
const calls = new WeakMap<Match, { round: number; used: Set<string> }>();
function claim(m: Match, team: string, kind: GrenadeId) {
  let call = calls.get(m);
  if (!call || call.round !== m.round) { call = { round: m.round, used: new Set() }; calls.set(m, call); }
  const key = `${team}:${kind}`;
  if (call.used.has(key)) return false;
  call.used.add(key); return true;
}
/** The cross/rotation lane on the defender side of each site, not the plant spot. */
export function siteSmokeTarget(site: { x: number; z: number }) { return { x: site.x * .55, z: site.z + 3 }; }
const BUTTONS: readonly { strength: number; fire: boolean; aim: boolean }[] = [{ strength: 1, fire: true, aim: false }, { strength: .65, fire: true, aim: true }, { strength: .3, fire: false, aim: true }];
/** Flat-ground flight with the engine's bounce/roll constants (no walls):
 * horizontal travel and height above the floor after `time`, or at rest. */
function flatFlight(height: number, flat: number, vy: number, time: number) {
  const h = 1 / 60, g = THROW.gravity;
  let x = 0, y = height, t = 0, still = 0;
  for (; t < time && still < THROW.smokeSettle; t += h) {
    vy -= g * h; x += flat * h; y += vy * h;
    if (y <= 0) {
      y = 0; vy = -vy * THROW.elasticity; flat *= .8;
      if (vy < .405) vy = 0;
    }
    if (y === 0 && vy === 0) { flat = Math.max(0, flat - 5 * h); if (flat < .1) { flat = 0; still += h; } }
  }
  return { x, y };
}
/** View yaw/pitch and buttons for a throw. Smoke: come to rest on the target.
 * HE: be near the target when the fuse ends. Flash: pop ~2.5 m above it.
 * Flat-ground prediction; the bot only plans with a clear line to the target. */
export function aimThrow(eye: readonly number[], target: readonly number[], kind: GrenadeId) {
  const dx = target[0] - eye[0], dz = target[2] - eye[2], distance = Math.hypot(dx, dz), yaw = Math.atan2(-dx, -dz);
  let best = { yaw, pitch: 0, strength: 1, fire: true, aim: false }, error = Infinity;
  for (const button of BUTTONS) for (let pitch = -.6; pitch <= 1.3; pitch += .01) {
    const [vx, vy, vz] = launchVelocity(yaw, pitch, button.strength, { vx: 0, vy: 0, vz: 0 });
    const end = flatFlight(eye[1] - target[1], Math.hypot(vx, vz), vy, kind === 'smoke' ? THROW.smokeFailsafe : THROW.fuse);
    const e = Math.hypot(end.x - distance, end.y - (kind === 'flash' ? 2.5 : kind === 'he' ? .5 : 0));
    if (e < error - 1e-6) { error = e; best = { yaw, pitch, strength: button.strength, fire: button.fire, aim: button.aim }; }
  }
  return best;
}
function buyUtility(m: Match, p: Actor) {
  const choice: GrenadeId | null = p.team === 'attack' ? ((p.id + m.round) % 2 === 0 ? 'smoke' : 'flash') : (p.id + m.round) % 2 === 0 ? 'he' : null;
  // Utility is bought only from money left after a primary and armor.
  if (choice && p.weapon !== 'pistol' && p.armor > 0) buyWeapon(m, p.id, choice);
}
function clearSight(eye: readonly number[], target: readonly number[]) {
  const d = [target[0] - eye[0], target[1] + 1 - eye[1], target[2] - eye[2]], length = Math.hypot(...d);
  return wallDistance(eye as number[], d.map(v => v / length)) >= length - .5;
}
function plan(m: Match, p: Actor, kind: GrenadeId, target: readonly number[]): ThrowPlan {
  const aim = aimThrow([p.x, p.y + eyeHeight(p), p.z], target, kind);
  return { kind, yaw: aim.yaw, pitch: aim.pitch, fire: aim.fire, aim: aim.aim, since: m.time, hold: -1 };
}
/** Draw, hold the pin for its full pull, release; abandon a stale plan. */
function executePlan(m: Match, p: Actor, brain: { plan: ThrowPlan | null }): Partial<Input> | null {
  const plan = brain.plan;
  if (!plan) return null;
  if (m.time - plan.since > 3 || (p.thrownAt >= plan.since && p.thrownAt >= 0) || (p.grenades[plan.kind] <= 0 && p.held !== plan.kind)) { brain.plan = null; return null; }
  const base = { yaw: plan.yaw, pitch: plan.pitch, forward: 0, right: 0, equip: plan.kind } as const;
  if (p.held !== plan.kind || m.time - p.heldAt < THROW.deploy) return base;
  if (plan.hold < 0) plan.hold = m.time;
  if (m.time - plan.hold < THROW.pin + .05) return { ...base, fire: plan.fire, aim: plan.aim };
  return base;
}
// Ends at the foot of the north stairs: the site route continues from there.
// (A final {15,1} hop forced a U-turn back east around container-east.)
const terraceFlank: readonly Point[] = [{x:19,z:23},{x:19,z:15},{x:19,z:7},{x:19,z:1}];
const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
export function botInputs(m: Match): Record<number, Partial<Input>> {
  const result: Record<number, Partial<Input>> = {};
  if (!brains.has(m)) brains.set(m, new Map());
  const memory = brains.get(m)!;
  for (const p of m.actors) {
    if (!p.bot || p.hp <= 0) continue;
    if (m.phase === 'buy') { if (p.weapon === 'pistol') buyWeapon(m, p.id, p.money >= 2000 ? 'rifle' : 'smg'); buyWeapon(m, p.id, 'armor'); buyUtility(m, p); continue; }
    if (m.phase !== 'live') continue;
    if (!memory.has(p.id)) memory.set(p.id, { path: [], round: m.round, target: '', seen: m.time, flank: 0, duck: -1, plan: null, utility: 0, mark: { x: p.x, z: p.z, t: m.time } });
    const brain = memory.get(p.id)!;
    if (brain.round !== m.round) { brain.flank = 0; brain.duck = -1; brain.plan = null; }
    // A flashed bot cannot see; its reaction clock restarts when sight returns.
    const blind = flashAmount(p, m.time);
    if (blind > .35) {
      brain.seen = Math.max(m.time, p.flashUntil - Math.min(p.flashDuration, 3) * .35); brain.plan = null;
      result[p.id] = { yaw: p.yaw + Math.sin(m.time * 2.3 + p.id) * .02, pitch: p.pitch, forward: -.6, crouch: false };
      continue;
    }
    // Turn away from a friendly flash about to pop in view (a real pop-flash habit).
    const popping = m.grenades.find(g => g.kind === 'flash' && g.team === p.team && m.time - g.at > THROW.fuse - .45 && Math.hypot(g.x - p.x, g.z - p.z) < 30);
    if (popping) { result[p.id] = { yaw: Math.atan2(popping.x - p.x, popping.z - p.z), pitch: 0 }; continue; }
    const throwing = executePlan(m, p, brain);
    if (throwing) { result[p.id] = throwing; continue; }
    const enemies = m.actors.filter(a => a.team !== p.team && a.hp > 0 && Math.hypot(a.x - p.x, a.z - p.z) < 32 && visible(p, a, m.smokes));
    enemies.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    const enemy = enemies[0];
    if (!enemy) brain.seen = m.time;
    const urgent = m.bomb.planted && p.team === 'defend' && m.bomb.fuse < 13;
    if (enemy && !urgent) {
      // Strafing/ducking moves the bot off its route: plan afresh after the fight.
      brain.path = [];
      const dx = enemy.x - p.x, dz = enemy.z - p.z, distance = Math.hypot(dx, dz);
      // Defenders sometimes answer a mid-range push with their HE instead of bullets.
      if (p.team === 'defend' && p.grenades.he > 0 && brain.utility !== m.round && (p.id + m.round) % 2 === 0 && distance > 7 && distance < 20 && m.time - brain.seen > .4) {
        brain.utility = m.round; brain.plan = plan(m, p, 'he', [enemy.x + enemy.vx * .8, enemy.y, enemy.z + enemy.vz * .8]);
        result[p.id] = executePlan(m, p, brain) ?? {}; continue;
      }
      // A partial flash still spoils the aim.
      const targetYaw = Math.atan2(-dx, -dz), error = Math.sin(m.time * 1.7 + p.id * 4) * (.04 + blind * .5);
      const yaw = p.yaw + Math.max(-.085, Math.min(.085, angleDelta(p.yaw, targetYaw + error)));
      // Reload behind low cover: duck only if a fully crouched body would be
      // hidden, and hold the duck (without strafing) until the reload ends.
      if ((p.reload > 0 || p.ammo === 0) && !visible({ x: p.x, y: p.y, z: p.z, crouch: 1 }, enemy)) {
        brain.duck = m.time + (p.reload || WEAPONS[p.weapon].reload) + .1;
        result[p.id] = { yaw, pitch: p.pitch, reload: true, crouch: true };
        continue;
      }
      // Long sight lines only: scoped snipers, and every other rifle bot. Close
      // fights stay upright and strafing, so crouching never becomes a free win.
      const crouch = (p.weapon === 'sniper' && distance > 10) || (p.weapon === 'rifle' && distance > 18 && p.id % 2 === 0);
      const aimHeight = enemy.y + 1.1 - crouchDrop(enemy) * 1.3 - p.y - eyeHeight(p);
      result[p.id] = { yaw, pitch: Math.atan2(aimHeight, distance) + error * .4, fire: m.time - brain.seen > .6 && Math.abs(angleDelta(yaw, targetYaw)) < .1, aim: true, reload: p.ammo === 0, right: !crouch && Math.sin(m.time + p.id) > .75 ? .5 : 0, crouch };
      continue;
    }
    if (m.time < brain.duck && p.reload > 0) { result[p.id] = { pitch: p.pitch, reload: true, crouch: true }; continue; }
    let target: Point, interact = false;
    if (m.bomb.planted) {
      target = p.team === 'defend' ? m.bomb : { x: m.bomb.x + (p.id % 2 ? 4 : -4), z: m.bomb.z + 5 };
      if (p.team === 'defend' && Math.hypot(p.x - target.x, p.z - target.z) < 1.65) interact = true;
    } else if (p.team === 'attack') {
      const carrier = m.actors.find(a => a.id === m.bomb.carrier);
      target = !carrier ? m.bomb : MAP.sites[(m.round - 1) % 2];
      if (m.bomb.carrier === p.id && Math.hypot(p.x - target.x, p.z - target.z) < 2.2) interact = true;
      if (carrier && carrier.id !== p.id) target = { x: target.x + (p.id % 2 ? 2 : -2), z: target.z + 5 };
    } else {
      target = { x: p.id % 2 ? -15 : 15, z: -8 };
      if (m.timer < 60) target = { x: p.id % 2 ? -8 : 8, z: 15 };
    }
    // On alternating B attacks one flank role crosses the upper terrace. The
    // bomb objective wins once planted/dropped, so no bot ignores a recovery.
    // A flanker that turned back to recover a dropped bomb stays with the site
    // push; resuming the flank would walk it back up the stairs it just left.
    if (p.team === 'attack' && !m.bomb.planted && m.bomb.carrier === null) brain.flank = terraceFlank.length;
    if (p.team === 'attack' && m.round % 2 === 0 && p.id % 2 === 1 && !m.bomb.planted && m.bomb.carrier !== null) {
      while (brain.flank < terraceFlank.length && Math.hypot(p.x-terraceFlank[brain.flank].x,p.z-terraceFlank[brain.flank].z)<.6) brain.flank++;
      if (brain.flank < terraceFlank.length) { target = terraceFlank[brain.flank]; interact = false; }
    }
    if (interact) { result[p.id] = { interact: true }; continue; }
    // Attackers smoke the defender cross, or pop a flash over the site, before entry.
    if (p.team === 'attack' && !m.bomb.planted && brain.utility !== m.round && (p.grenades.smoke > 0 || p.grenades.flash > 0)) {
      const site = MAP.sites[(m.round - 1) % 2], range = Math.hypot(p.x - site.x, p.z - site.z), eye = [p.x, p.y + eyeHeight(p), p.z];
      const kind: GrenadeId = p.grenades.smoke > 0 ? 'smoke' : 'flash', aimAt = kind === 'smoke' ? siteSmokeTarget(site) : site;
      const target = [aimAt.x, 0, aimAt.z];
      if (range > 8 && range < 18 && Math.hypot(aimAt.x - p.x, aimAt.z - p.z) > 6 && clearSight(eye, target) && claim(m, p.team, kind)) {
        brain.utility = m.round; brain.plan = plan(m, p, kind, target);
        result[p.id] = executePlan(m, p, brain) ?? {}; continue;
      }
    }
    target = walkableTarget(target);
    if (Math.hypot(target.x - p.x, target.z - p.z) < .6) { result[p.id] = { yaw: p.yaw + .007, reload: p.ammo < 10 }; continue; }
    const key = `${Math.round(target.x)},${Math.round(target.z)}`;
    // Keep a still-valid route instead of replanning on a timer. A fresh plan
    // from whichever lattice node is now nearest can flip between two
    // near-equal detours (e.g. east/west of container-east), and the bot then
    // walks back and forth in place. Replan only when the objective changes, the
    // route ran out (fights clear it), or the bot made no progress for 1 s.
    if (Math.hypot(p.x - brain.mark.x, p.z - brain.mark.z) > .5) brain.mark = { x: p.x, z: p.z, t: m.time };
    const stalled = m.time - brain.mark.t > 1;
    if (brain.round !== m.round || brain.target !== key || !brain.path.length || stalled) { brain.path = findPath(p.x, p.z, target.x, target.z); brain.round = m.round; brain.target = key; brain.mark = { x: p.x, z: p.z, t: m.time }; }
    while (brain.path.length > 1 && (Math.hypot(p.x - brain.path[0].x, p.z - brain.path[0].z) < .55 || clearRoute(p, brain.path[1]))) brain.path.shift();
    const waypoint = brain.path[0];
    if (!waypoint) { result[p.id] = { reload: p.ammo < 5 }; continue; }
    result[p.id] = { forward: 1, yaw: Math.atan2(p.x - waypoint.x, p.z - waypoint.z), pitch: 0, reload: p.ammo < 5 };
  }
  return result;
}
