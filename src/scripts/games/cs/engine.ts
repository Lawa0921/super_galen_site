import { MAP, canStand } from './map';
import { groundHeight, supportHeight, STEP_HEIGHT } from './elevation';
import { rayBoxHit, worldImpact, type WorldSurface } from './ballistics';
import { advanceVelocity, movementInaccuracy, MOVE_SPEED, advanceCrouch, crouchDrop, crouchSpeedScale, crouchSpreadScale, eyeHeight } from './movement';
import { wallDistance } from './map';
import { GRENADES, SMOKE, THROW, applyBlastArmor, flashStrength, grenadeCount, heDamage, launchVelocity, smokeBlocks, throwStrength, updateSmoke, MAX_GRENADES, type GrenadeId, type Smoke } from './grenades';
import { stepGrenadeBody, type GrenadeBody } from './grenade-physics';
export type { GrenadeId, Smoke } from './grenades';
export type Team = 'attack' | 'defend';
export type WeaponId = 'pistol' | 'smg' | 'rifle' | 'sniper';
export type Phase = 'buy' | 'live' | 'round-over' | 'match-over';
export interface Input { forward: number; right: number; yaw: number; pitch: number; fire: boolean; aim: boolean; slow: boolean; jump: boolean; interact: boolean; reload: boolean; crouch: boolean; equip: 'gun' | GrenadeId }
export interface Grenade extends GrenadeBody { id: number; kind: GrenadeId; actor: number; team: Team; at: number }
/** Short-lived detonation events for presentation (sound, flash, smoke bloom). */
export interface Blast { id: number; kind: GrenadeId; actor: number; x: number; y: number; z: number; at: number }
export interface Actor {
  id: number; name: string; team: Team; bot: boolean; x: number; y: number; z: number; vx: number; vy: number; vz: number; yaw: number; pitch: number;
  hp: number; armor: number; money: number; weapon: WeaponId; ammo: number; reserve: number; cooldown: number; reload: number;
  kills: number; deaths: number; interaction: number; moving: boolean; aim: boolean; shot: number;
  recoilPitch: number; recoilYaw: number; burst: number; fireAt: number;
  /** Smoothed duck amount: 0 standing, 1 fully crouched. */
  crouch: number;
  /** Carried utility (counts include the one in hand). */
  grenades: Record<GrenadeId, number>;
  /** Item in hand, the time it was drawn, buttons held while priming (1 primary, 2 secondary). */
  held: 'gun' | GrenadeId; heldAt: number; throwHold: number;
  /** Pin pull start (−1 idle) and last release time (−1 none). */
  primedAt: number; thrownAt: number;
  /** Flash white-out end time and its total length, seconds. */
  flashUntil: number; flashDuration: number;
}
export interface Bomb { carrier: number | null; planted: boolean; x: number; z: number; fuse: number }
export interface Shot {
  id: number; round: number; actor: number; weapon: WeaponId; at: number;
  x: number; y: number; z: number; tx: number; ty: number; tz: number;
  nx: number; ny: number; nz: number; surface: WorldSurface | 'actor'; target: number | null;
  damage: number; armorDamage: number; killed: boolean; hit: boolean; head: boolean;
  /** Set for blast damage records: no tracer, muzzle flash or gunshot. */
  grenade?: 'he';
}
// Round-lived entry data for death presentation. Actors and effect shots keep
// changing independently, so neither object may be retained by reference here.
export interface DeathRecord { readonly actor: Readonly<Actor>; readonly shot: Readonly<Shot> }
export interface Match {
  actors: Actor[]; phase: Phase; timer: number; time: number; round: number; scores: Record<Team, number>;
  winner: Team | null; reason: string; bomb: Bomb; feed: { text: string; team: Team; at: number }[]; shots: Shot[]; deaths: DeathRecord[]; serial: number; seed: number;
  grenades: Grenade[]; smokes: Smoke[]; blasts: Blast[];
}
export const WEAPONS = {
  pistol: { name: 'P9 手槍', price: 0, damage: 27, magazine: 12, reserve: 60, interval: .26, reload: 1.35, spread: .009 },
  smg: { name: 'VECT 衝鋒槍', price: 1200, damage: 22, magazine: 30, reserve: 120, interval: .075, reload: 1.7, spread: .018 },
  rifle: { name: 'AR-4 突擊步槍', price: 2000, damage: 36, magazine: 30, reserve: 90, interval: .12, reload: 2.1, spread: .01 },
  sniper: { name: 'SR-8 狙擊步槍', price: 3500, damage: 95, magazine: 5, reserve: 25, interval: 1.2, reload: 2.6, spread: .014 },
} as const;
export function createMatch(team: Team): Match {
  const m: Match = { actors: [], phase: 'buy', timer: 12, time: 0, round: 1, scores: { attack: 0, defend: 0 }, winner: null, reason: '', bomb: { carrier: null, planted: false, x: 0, z: 0, fuse: 35 }, feed: [], shots: [], deaths: [], serial: 0, seed: 971, grenades: [], smokes: [], blasts: [] };
  for (let id = 0; id < 6; id++) m.actors.push({ id, name: ['你', 'KESTREL', 'ECHO', 'VIPER', 'ONYX', 'ROOK'][id], team: id < 3 ? team : team === 'attack' ? 'defend' : 'attack', bot: id !== 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, hp: 100, armor: 0, money: 2400, weapon: 'pistol', ammo: 12, reserve: 60, cooldown: 0, reload: 0, kills: 0, deaths: 0, interaction: 0, moving: false, aim: false, shot: 0, recoilPitch: 0, recoilYaw: 0, burst: 0, fireAt: -1, crouch: 0, grenades: { he: 0, flash: 0, smoke: 0 }, held: 'gun', heldAt: 0, throwHold: 0, primedAt: -1, thrownAt: -1, flashUntil: 0, flashDuration: 0 });
  resetRound(m); return m;
}
export const holdsGrenade = (p: { held?: 'gun' | GrenadeId }) => p.held !== undefined && p.held !== 'gun';
/** Death discards carried utility, including a grenade with its pin pulled. */
function dropUtility(p: Actor) {
  p.grenades = { he: 0, flash: 0, smoke: 0 }; p.held = 'gun'; p.primedAt = -1; p.throwHold = 0;
}
function resetRound(m: Match) {
  m.phase = 'buy'; m.timer = 12; m.winner = null; m.reason = ''; m.shots = []; m.deaths = [];
  m.grenades = []; m.smokes = []; m.blasts = [];
  for (const p of m.actors) {
    if (p.hp <= 0) { p.weapon = 'pistol'; p.armor = 0; dropUtility(p); }
    p.held = 'gun'; p.heldAt = 0; p.primedAt = -1; p.thrownAt = -1; p.throwHold = 0; p.flashUntil = 0; p.flashDuration = 0;
    p.hp = 100; p.x = (p.id % 3 - 1) * 3; p.z = p.team === 'attack' ? 23 : -23;
    p.y = 0; p.vx = 0; p.vy = 0; p.vz = 0; p.yaw = p.team === 'attack' ? 0 : Math.PI; p.pitch = 0;
    p.ammo = WEAPONS[p.weapon].magazine; p.reserve = WEAPONS[p.weapon].reserve;
    p.cooldown = 0; p.reload = 0; p.interaction = 0; p.moving = false; p.aim = false;
    p.recoilPitch = 0; p.recoilYaw = 0; p.burst = 0; p.fireAt = -1; p.crouch = 0;
  }
  const carrier = m.actors.find(p => p.team === 'attack')!;
  m.bomb = { carrier: carrier.id, planted: false, x: carrier.x, z: carrier.z, fuse: 35 };
}
export function buyWeapon(m: Match, id: number, item: WeaponId | 'armor' | GrenadeId) {
  const p = m.actors.find(p => p.id === id);
  if (!p || p.hp <= 0 || m.phase !== 'buy') return false;
  if (item === 'armor') { if (p.armor >= 100 || p.money < 650) return false; p.armor = 100; p.money -= 650; return true; }
  if (Object.hasOwn(GRENADES, item)) {
    const g = GRENADES[item as GrenadeId];
    if (p.grenades[item as GrenadeId] >= g.max || grenadeCount(p) >= MAX_GRENADES || p.money < g.price) return false;
    p.grenades[item as GrenadeId]++; p.money -= g.price; return true;
  }
  const weapon = item as WeaponId;
  if (!Object.hasOwn(WEAPONS, weapon) || p.weapon === weapon || p.money < WEAPONS[weapon].price) return false;
  p.money -= WEAPONS[weapon].price; p.weapon = weapon; p.ammo = WEAPONS[weapon].magazine; p.reserve = WEAPONS[weapon].reserve; p.reload = 0; p.cooldown = 0;
  p.recoilPitch = 0; p.recoilYaw = 0; p.burst = 0;
  return true;
}
export function reloadWeapon(p: Actor) {
  if (p.hp <= 0 || p.reload > 0 || p.ammo >= WEAPONS[p.weapon].magazine || p.reserve <= 0) return false;
  p.reload = WEAPONS[p.weapon].reload; return true;
}
function random(m: Match) { m.seed = (Math.imul(m.seed, 1664525) + 1013904223) >>> 0; return m.seed / 4294967296; }
export function currentSpread(p: Actor) {
  return WEAPONS[p.weapon].spread * (p.aim ? .25 : 1) * movementInaccuracy(p.vx, p.vz, p.weapon) * (p.y - supportHeight(p.x, p.z, p.y) > .1 ? 3 : crouchSpreadScale(p)) * (1 + Math.min(p.burst, 12) * .08);
}
const weaponKick = { pistol: .006, smg: .008, rifle: .013, sniper: .024 } as const;
export function weaponRecoilKick(weapon: WeaponId, aiming: boolean) { return weaponKick[weapon] * (aiming ? .7 : 1); }
function shoot(m: Match, p: Actor) {
  if (p.cooldown > 0 || p.reload > 0 || p.ammo <= 0) return;
  const w = WEAPONS[p.weapon]; p.ammo--; p.cooldown = w.interval; p.shot++;
  const spread = currentSpread(p);
  const yaw = p.yaw + p.recoilYaw + (random(m) - .5) * spread, pitch = p.pitch + p.recoilPitch + (random(m) - .5) * spread;
  const origin = [p.x, p.y + eyeHeight(p), p.z], dir = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
  let impact = worldImpact(origin, dir), distance = impact.distance, victim: Actor | undefined, head = false;
  for (const a of m.actors) {
    if (a.id === p.id || a.hp <= 0) continue;
    const drop = crouchDrop(a);
    const headHit = rayBoxHit(origin, dir, [a.x - .22, a.y + 1.4 - drop, a.z - .22], [a.x + .22, a.y + 1.8 - drop, a.z + .22]);
    const bodyHit = rayBoxHit(origin, dir, [a.x - .32, a.y + .12, a.z - .26], [a.x + .32, a.y + 1.4 - drop, a.z + .26]);
    const hit = headHit && (!bodyHit || headHit.distance < bodyHit.distance) ? headHit : bodyHit;
    if (hit && hit.distance < distance) { distance = hit.distance; victim = a; head = hit === headHit; impact = { ...hit, surface: 'none' }; }
  }
  let damage = 0, armorDamage = 0, killed = false;
  if (victim && victim.team !== p.team) {
    const rawDamage = w.damage * (head ? 3 : 1), beforeHp = victim.hp;
    armorDamage = Math.min(victim.armor, rawDamage * .4);
    victim.armor = Math.max(0, victim.armor - armorDamage); victim.hp = Math.max(0, victim.hp - Math.ceil(rawDamage - armorDamage));
    damage = beforeHp - victim.hp; killed = beforeHp > 0 && victim.hp === 0;
    if (killed) {
      p.kills++; victim.deaths++; p.money = Math.min(9000, p.money + 300);
      m.feed.unshift({ text: `${p.name}  ›  ${victim.name}${head ? '  · HEADSHOT' : ''}`, team: p.team, at: m.time }); m.feed = m.feed.slice(0, 5);
    }
  }
  const shot: Shot = { id: ++m.serial, round: m.round, actor: p.id, weapon: p.weapon, x: origin[0], y: origin[1], z: origin[2], tx: origin[0] + dir[0] * distance, ty: origin[1] + dir[1] * distance, tz: origin[2] + dir[2] * distance, nx: impact.nx, ny: impact.ny, nz: impact.nz, surface: victim ? 'actor' : impact.surface, target: victim?.id ?? null, damage, armorDamage, killed, hit: damage > 0, head, at: m.time };
  m.shots.push(shot);
  if (killed && victim && !m.deaths.some(death => death.actor.id === victim.id)) {
    m.deaths.push(Object.freeze({ actor: Object.freeze({ ...victim }), shot: Object.freeze({ ...shot }) }));
  }
  // Retain the entry pose in the immutable death record, then stop live state
  // immediately: the victim may have already taken its turn this tick.
  if (killed && victim) { victim.vx = victim.vy = victim.vz = 0; victim.moving = false; dropUtility(victim); }
  if (m.shots.length > 64) m.shots.splice(0, m.shots.length - 64);
  p.burst++; p.fireAt = m.time;
  const kick = weaponRecoilKick(p.weapon, p.aim);
  p.recoilPitch = Math.min(.09, p.recoilPitch + kick); p.recoilYaw = Math.sin(p.burst * .8) * kick * .4;
}
export function spawnGrenade(m: Match, p: Actor, kind: GrenadeId, position: readonly number[], velocity: readonly number[]) {
  const g: Grenade = { id: ++m.serial, kind, actor: p.id, team: p.team, at: m.time, x: position[0], y: position[1], z: position[2], vx: velocity[0], vy: velocity[1], vz: velocity[2], rest: 0, bounces: 0 };
  m.grenades.push(g); return g;
}
function equip(m: Match, p: Actor, slot: 'gun' | GrenadeId) {
  if (slot === p.held || (slot !== 'gun' && !(Object.hasOwn(GRENADES, slot) && p.grenades[slot] > 0))) return;
  // Drawing a grenade cancels a reload; switching back puts the pin back in.
  p.held = slot; p.heldAt = m.time; p.primedAt = -1; p.throwHold = 0; p.reload = 0; p.aim = false;
  if (slot === 'gun') p.cooldown = Math.max(p.cooldown, .25);
}
function throwHeld(m: Match, p: Actor) {
  const kind = p.held as GrenadeId, strength = throwStrength((p.throwHold & 1) !== 0, (p.throwHold & 2) !== 0);
  const eye = [p.x, p.y + eyeHeight(p), p.z];
  const dir = [-Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch)];
  // Release point just ahead of the eye, kept on this side of a wall.
  const reach = Math.max(0, Math.min(.3, wallDistance(eye, dir) - .12));
  spawnGrenade(m, p, kind, [eye[0] + dir[0] * reach, eye[1] + dir[1] * reach - .08, eye[2] + dir[2] * reach], launchVelocity(p.yaw, p.pitch, strength, p));
  p.grenades[kind]--; p.thrownAt = m.time; p.primedAt = -1; p.throwHold = 0;
}
function handleGrenade(m: Match, p: Actor, input: Partial<Input>) {
  if (p.thrownAt > p.heldAt) {
    // Follow-through, then draw the next of the same type or return to the gun.
    if (m.time - p.thrownAt >= THROW.recover) {
      if (p.grenades[p.held as GrenadeId] > 0) { p.heldAt = m.time; p.primedAt = -1; p.throwHold = 0; }
      else equip(m, p, 'gun');
    }
    return;
  }
  const pressed = !!input.fire || !!input.aim;
  if (pressed && m.time - p.heldAt >= THROW.deploy) {
    if (p.primedAt < 0) p.primedAt = m.time;
    p.throwHold |= (input.fire ? 1 : 0) | (input.aim ? 2 : 0);
  }
  if (!pressed && p.primedAt >= 0 && m.time - p.primedAt >= THROW.pin) throwHeld(m, p);
}
function hurtByBlast(m: Match, g: Grenade, victim: Actor, center: readonly number[]) {
  const drop = crouchDrop(victim);
  let nearest = Infinity;
  for (const height of [.3, 1 - drop * .5, 1.6 - drop]) {
    const delta = [victim.x - center[0], victim.y + height - center[1], victim.z - center[2]], distance = Math.hypot(...delta);
    // Blasts do not pass through walls: at least one body point must be in the open.
    if (distance < .01 || wallDistance([...center], delta.map(v => v / distance)) >= distance - .02) nearest = Math.min(nearest, distance);
  }
  const raw = heDamage(nearest);
  if (raw <= 0) return;
  const thrower = m.actors.find(a => a.id === g.actor), cut = applyBlastArmor(raw, victim.armor), before = victim.hp;
  victim.armor = Math.max(0, victim.armor - cut.armor); victim.hp = Math.max(0, victim.hp - Math.round(cut.health));
  const damage = before - victim.hp, killed = before > 0 && victim.hp === 0;
  if (killed) {
    victim.deaths++;
    if (thrower && thrower.team !== victim.team) { thrower.kills++; thrower.money = Math.min(9000, thrower.money + 300); }
    m.feed.unshift({ text: `${thrower?.name ?? '未知'}  ›  ${victim.name}  · HE 手雷`, team: g.team, at: m.time }); m.feed = m.feed.slice(0, 5);
  }
  const shot: Shot = { id: ++m.serial, round: m.round, actor: g.actor, weapon: thrower?.weapon ?? 'pistol', at: m.time, x: center[0], y: center[1], z: center[2], tx: victim.x, ty: victim.y + 1, tz: victim.z, nx: 0, ny: 1, nz: 0, surface: 'actor', target: victim.id, damage, armorDamage: cut.armor, killed, hit: damage > 0, head: false, grenade: 'he' };
  m.shots.push(shot);
  if (killed) {
    if (!m.deaths.some(death => death.actor.id === victim.id)) m.deaths.push(Object.freeze({ actor: Object.freeze({ ...victim, grenades: { ...victim.grenades } }), shot: Object.freeze({ ...shot }) }));
    victim.vx = victim.vy = victim.vz = 0; victim.moving = false; dropUtility(victim);
  }
}
function detonate(m: Match, g: Grenade) {
  m.blasts.push({ id: ++m.serial, kind: g.kind, actor: g.actor, x: g.x, y: g.y, z: g.z, at: m.time });
  if (g.kind === 'smoke') {
    m.smokes.push(updateSmoke({ id: m.serial, actor: g.actor, x: g.x, y: Math.max(0, g.y - THROW.radius), z: g.z, at: m.time, until: m.time + SMOKE.life, radius: 0, density: 0 }, m.time));
    return;
  }
  const center = [g.x, g.y + .05, g.z];
  for (const a of m.actors) {
    if (a.hp <= 0) continue;
    if (g.kind === 'he') { if (a.team !== g.team || a.id === g.actor) hurtByBlast(m, g, a, center); continue; }
    const eye = [a.x, a.y + eyeHeight(a), a.z], delta = [g.x - eye[0], g.y - eye[1], g.z - eye[2]], distance = Math.hypot(...delta);
    if (distance < .01) continue;
    const dir = delta.map(v => v / distance);
    if (wallDistance(eye, dir) < distance - .05 || smokeBlocks(eye, dir, distance, m.smokes)) continue;
    const facing = -Math.sin(a.yaw) * Math.cos(a.pitch) * dir[0] + Math.sin(a.pitch) * dir[1] - Math.cos(a.yaw) * Math.cos(a.pitch) * dir[2];
    const duration = THROW.flashMax * flashStrength(distance, facing);
    if (duration > 0 && m.time + duration > a.flashUntil) { a.flashUntil = m.time + duration; a.flashDuration = duration; }
  }
}
function stepUtility(m: Match, dt: number) {
  for (const s of m.smokes) updateSmoke(s, m.time);
  m.smokes = m.smokes.filter(s => m.time < s.until);
  const remaining: Grenade[] = [];
  for (const g of m.grenades) {
    stepGrenadeBody(g, dt);
    const age = m.time - g.at;
    const due = g.kind === 'smoke' ? g.rest >= THROW.smokeSettle || age >= THROW.smokeFailsafe : age >= THROW.fuse;
    if (due) detonate(m, g);
    else if (Math.abs(g.x) < 90 && Math.abs(g.z) < 90 && g.y > -2) remaining.push(g);
  }
  m.grenades = remaining;
}
function endRound(m: Match, winner: Team, reason: string) {
  if (m.phase !== 'live') return;
  m.scores[winner]++; m.winner = winner; m.reason = reason; m.timer = 5;
  m.phase = m.scores[winner] >= 4 ? 'match-over' : 'round-over';
  for (const p of m.actors) { p.money = Math.min(9000, p.money + (p.team === winner ? 2400 : 1600)); p.interaction = 0; p.vx = p.vy = p.vz = 0; p.moving = false; }
}
const finite = (n: unknown, fallback = 0) => typeof n === 'number' && Number.isFinite(n) ? n : fallback;
export function stepMatch(m: Match, inputs: Record<number, Partial<Input>>, delta: number) {
  const dt = Math.max(0, Math.min(.05, finite(delta))); if (dt === 0 || m.phase === 'match-over') return;
  m.time += dt; m.timer = Math.max(0, m.timer - dt); m.shots = m.shots.filter(s => m.time - s.at < .4); m.blasts = m.blasts.filter(b => m.time - b.at < 1);
  if (m.phase === 'round-over') { if (m.timer <= 0) { m.round++; resetRound(m); } return; }
  if (m.phase === 'buy') { if (m.timer <= 0) { m.phase = 'live'; m.timer = 100; } return; }
  for (const p of m.actors) {
    if (p.hp <= 0) { p.interaction = 0; p.vx = p.vy = p.vz = 0; p.moving = false; p.crouch = 0; if (p.held !== 'gun' || grenadeCount(p) > 0) dropUtility(p); continue; }
    const input = inputs[p.id] ?? {};
    if (input.equip) equip(m, p, input.equip);
    p.yaw = finite(input.yaw, p.yaw) % (Math.PI * 2); p.pitch = Math.max(-1.45, Math.min(1.45, finite(input.pitch, p.pitch)));
    let forward = Math.max(-1, Math.min(1, finite(input.forward))), right = Math.max(-1, Math.min(1, finite(input.right)));
    const magnitude = Math.max(1, Math.hypot(forward, right)); forward /= magnitude; right /= magnitude;
    p.aim = !holdsGrenade(p) && !!input.aim;
    advanceCrouch(p, input.crouch === true, dt);
    // Crouch speed replaces, rather than stacks with, the walk/aim slowdown.
    const speed = MOVE_SPEED[holdsGrenade(p) ? 'pistol' : p.weapon] * Math.min(input.slow || p.aim ? .49 : 1, crouchSpeedScale(p));
    const oldFloor = supportHeight(p.x, p.z, p.y), grounded = p.y <= oldFloor + .01 && p.vy <= 0;
    const { dx, dz } = advanceVelocity(p, -Math.sin(p.yaw) * forward + Math.cos(p.yaw) * right, -Math.cos(p.yaw) * forward - Math.sin(p.yaw) * right, speed, grounded, dt);
    if (canStand(p.x + dx, p.z, p.y) && groundHeight(p.x + dx, p.z) <= p.y + STEP_HEIGHT) p.x += dx; else p.vx = 0;
    if (canStand(p.x, p.z + dz, p.y) && groundHeight(p.x, p.z + dz) <= p.y + STEP_HEIGHT) p.z += dz; else p.vz = 0;
    p.moving = Math.hypot(p.vx, p.vz) > .05;
    const floor = supportHeight(p.x, p.z, p.y);
    if (grounded && Math.abs(floor - oldFloor) <= STEP_HEIGHT) p.y = floor;
    if (input.jump && p.y <= floor + .01 && p.vy <= 0) p.vy = 5;
    p.vy -= 15 * dt; p.y = Math.max(floor, p.y + p.vy * dt); if (p.y === floor) p.vy = 0;
    p.cooldown = Math.max(0, p.cooldown - dt);
    const recovering = m.time - p.fireAt > .2;
    p.recoilPitch *= Math.exp(-dt * (recovering ? 9 : 2.4)); p.recoilYaw *= Math.exp(-dt * 9);
    if (recovering) p.burst = 0;
    if (p.reload > 0) {
      p.reload = Math.max(0, p.reload - dt);
      if (p.reload === 0) { const amount = Math.min(WEAPONS[p.weapon].magazine - p.ammo, p.reserve); p.ammo += amount; p.reserve -= amount; }
    }
    if (holdsGrenade(p)) { if (!input.interact) handleGrenade(m, p, input); continue; }
    if (input.reload) reloadWeapon(p);
    if (input.fire && !input.interact) shoot(m, p);
    if (p.ammo === 0 && input.fire) reloadWeapon(p);
  }
  stepUtility(m, dt);
  const carrier = m.actors.find(a => a.id === m.bomb.carrier);
  if (carrier) { m.bomb.x = carrier.x; m.bomb.z = carrier.z; if (carrier.hp <= 0) m.bomb.carrier = null; }
  if (!m.bomb.planted && m.bomb.carrier === null) {
    const pickup = m.actors.find(a => a.hp > 0 && a.team === 'attack' && Math.abs(a.y - groundHeight(m.bomb.x, m.bomb.z)) < 1.2 && Math.hypot(a.x - m.bomb.x, a.z - m.bomb.z) < 1.2);
    if (pickup) m.bomb.carrier = pickup.id;
  }
  for (const p of m.actors) {
    if (p.hp <= 0) continue;
    const plant = !m.bomb.planted && m.bomb.carrier === p.id && MAP.sites.some(s => Math.hypot(p.x - s.x, p.z - s.z) < s.radius);
    const defuse = m.bomb.planted && p.team === 'defend' && Math.hypot(p.x - m.bomb.x, p.z - m.bomb.z) < 2;
    if (!inputs[p.id]?.interact || p.moving || p.y - groundHeight(p.x, p.z) > .01 || (!plant && !defuse)) { p.interaction = 0; continue; }
    p.interaction += dt;
    if (plant && p.interaction >= 3) { m.bomb = { carrier: null, planted: true, x: p.x, z: p.z, fuse: 35 }; p.interaction = 0; }
    else if (defuse && p.interaction >= 5) { endRound(m, 'defend', 'defused'); return; }
  }
  if (m.bomb.planted) { m.bomb.fuse -= dt; if (m.bomb.fuse <= 0) { endRound(m, 'attack', 'exploded'); return; } }
  if (!m.actors.some(a => a.team === 'defend' && a.hp > 0)) endRound(m, 'attack', 'eliminated');
  else if (!m.bomb.planted && !m.actors.some(a => a.team === 'attack' && a.hp > 0)) endRound(m, 'defend', 'eliminated');
  else if (!m.bomb.planted && m.timer <= 0) endRound(m, 'defend', 'timeout');
}
