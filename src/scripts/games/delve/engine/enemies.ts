// enemies.ts — 怪物資料表 + AI（每種 AI 是一個小狀態機，純函式：改寫 Enemy，透過 AiCtx 射擊 / 傳送）。
// 名稱全為原創中文（英文 id）。數值：hp / 接觸傷害 / 防禦 / 擊退抗性（0..1）；掉落見 drops。
import type { Body } from './physics';
import type { ItemId } from './items';
import type { LocalName } from './tiles';
import type { Rng } from './rng';
import { stepFalling, stepFlying, stepNoClip, type PhysEnv } from './entities';
import { LIQ } from './liquidKind';
import type { ProjKind } from './projectiles';
import { TILE_SIZE as S } from './constants';

export type EnemyKind =
  | 'gel_blob' | 'frost_blob' | 'night_walker' | 'dusk_owl' | 'cave_bat' | 'rock_crab' | 'frost_wolf'
  | 'sand_scorpion' | 'thorn_hornet' | 'snap_vine' | 'spore_walker' | 'bone_knight' | 'cursed_skull'
  | 'ember_imp' | 'magma_bat'
  // 水生（只在水裡游；離水只能在地上彈跳）
  | 'razor_fin' | 'glow_jelly'
  // 首領與其召喚物
  | 'lantern_warden' | 'warden_wisp';

export type AiKind = 'hop' | 'walker' | 'crawler' | 'flyer' | 'swooper' | 'shooter' | 'plant' | 'ghost' | 'teleporter' | 'boss'
  | 'swimmer' | 'jelly';
export interface DropRule { item: ItemId; min: number; max: number; chance: number; }
export interface EnemyDef {
  kind: EnemyKind;
  name: LocalName;
  /** 碰撞箱（px） */
  w: number; h: number;
  hp: number; damage: number; defense: number;
  /** 擊退抗性 0..1 */
  kbRes: number;
  ai: AiKind;
  /** 移動速度（px/s） */
  speed: number;
  /** 跳躍初速（px/s） */
  jump?: number;
  /** 投射物傷害（射擊型） */
  shot?: number;
  drops: readonly DropRule[];
  /** 銅幣 [min, max]（含） */
  coins: [number, number];
  /** 棲地說明（圖鑑 / 文件） */
  habitat: string;
  /** 首領 / 召喚物：不自然生成、不因距離消失 */
  boss?: boolean;
  minion?: boolean;
  /** 火系：不怕熔岩，碰到水會被澆熄（持續重傷） */
  fire?: boolean;
  /** 水生：在水裡游、不會溺水 */
  aquatic?: boolean;
  /** 發光（點光源強度 0..1） */
  glow?: number;
}

const n = (zh: string, en: string): LocalName => ({ zh, en });
const d = (item: ItemId, min: number, max: number, chance = 1): DropRule => ({ item, min, max, chance });

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  gel_blob: { kind: 'gel_blob', name: n('凝膠團', 'Gel Blob'), w: 16, h: 12, hp: 25, damage: 8, defense: 0, kbRes: 0, ai: 'hop', speed: 95, jump: 330, drops: [d('gel', 1, 2)], coins: [3, 8], habitat: '地表白天（森林 / 沙漠 / 叢林）、淺層洞穴' },
  frost_blob: { kind: 'frost_blob', name: n('霜凝膠', 'Frost Gel'), w: 18, h: 14, hp: 50, damage: 13, defense: 3, kbRes: 0.1, ai: 'hop', speed: 105, jump: 360, drops: [d('gel', 2, 3), d('ice', 1, 2, 0.3)], coins: [6, 14], habitat: '雪原（地表與地下）' },
  night_walker: { kind: 'night_walker', name: n('夜行屍', 'Night Walker'), w: 16, h: 38, hp: 50, damage: 14, defense: 5, kbRes: 0.35, ai: 'walker', speed: 70, jump: 330, drops: [d('bone', 1, 1, 0.3)], coins: [10, 25], habitat: '地表夜晚' },
  dusk_owl: { kind: 'dusk_owl', name: n('暗羽梟', 'Duskwing Owl'), w: 18, h: 14, hp: 32, damage: 12, defense: 2, kbRes: 0.2, ai: 'swooper', speed: 150, drops: [d('feather', 1, 2, 0.75)], coins: [6, 15], habitat: '地表夜晚（森林 / 雪原）' },
  cave_bat: { kind: 'cave_bat', name: n('穴蝠', 'Cave Flitter'), w: 14, h: 10, hp: 18, damage: 10, defense: 1, kbRes: 0.1, ai: 'flyer', speed: 130, drops: [d('fang', 1, 1, 0.25)], coins: [4, 10], habitat: '洞穴（成群出沒）' },
  rock_crab: { kind: 'rock_crab', name: n('岩甲蟹', 'Rockshell Crab'), w: 22, h: 14, hp: 45, damage: 13, defense: 10, kbRes: 0.6, ai: 'crawler', speed: 42, drops: [d('chitin', 1, 2, 0.8)], coins: [8, 18], habitat: '岩層與洞穴層' },
  frost_wolf: { kind: 'frost_wolf', name: n('霜牙狼', 'Rimefang Wolf'), w: 28, h: 18, hp: 65, damage: 17, defense: 5, kbRes: 0.3, ai: 'walker', speed: 150, jump: 300, drops: [d('fang', 1, 2, 0.7)], coins: [12, 25], habitat: '雪原（夜晚與地下）' },
  sand_scorpion: { kind: 'sand_scorpion', name: n('赤砂蠍', 'Redsand Scorpion'), w: 26, h: 14, hp: 55, damage: 16, defense: 7, kbRes: 0.3, ai: 'walker', speed: 78, jump: 260, drops: [d('chitin', 1, 2, 0.6), d('stinger', 1, 1, 0.25)], coins: [10, 22], habitat: '沙漠（地表與地下）' },
  thorn_hornet: { kind: 'thorn_hornet', name: n('刺翅蜂', 'Thornwing Hornet'), w: 18, h: 16, hp: 40, damage: 14, defense: 3, kbRes: 0.2, ai: 'shooter', speed: 120, shot: 12, drops: [d('stinger', 1, 2, 0.7)], coins: [8, 18], habitat: '叢林（地表與地下）' },
  snap_vine: { kind: 'snap_vine', name: n('噬花藤', 'Snapjaw Vine'), w: 20, h: 20, hp: 75, damage: 19, defense: 6, kbRes: 1, ai: 'plant', speed: 220, drops: [d('stinger', 1, 2, 0.4), d('mud', 2, 4, 0.5)], coins: [12, 28], habitat: '地下叢林（攀附在方塊上）' },
  spore_walker: { kind: 'spore_walker', name: n('孢行者', 'Sporeshamble'), w: 18, h: 30, hp: 55, damage: 15, defense: 4, kbRes: 0.3, ai: 'walker', speed: 58, jump: 300, drops: [d('spore', 1, 2, 0.8), d('glow_mushroom', 1, 1, 0.3)], coins: [10, 22], habitat: '螢光菇林' },
  bone_knight: { kind: 'bone_knight', name: n('骸骨戰士', 'Ossuary Knight'), w: 18, h: 40, hp: 90, damage: 22, defense: 12, kbRes: 0.5, ai: 'walker', speed: 82, jump: 340, drops: [d('bone', 1, 3), d('bone_greatsword', 1, 1, 0.03)], coins: [20, 45], habitat: '地下城' },
  cursed_skull: { kind: 'cursed_skull', name: n('咒顱', 'Hex Skull'), w: 18, h: 18, hp: 55, damage: 20, defense: 8, kbRes: 0.4, ai: 'ghost', speed: 85, drops: [d('bone', 1, 1, 0.6)], coins: [15, 30], habitat: '地下城（穿牆飛行）' },
  ember_imp: { kind: 'ember_imp', name: n('燼角魔', 'Cinderhorn Imp'), w: 18, h: 28, hp: 70, damage: 18, defense: 8, kbRes: 0.4, ai: 'teleporter', speed: 0, shot: 20, drops: [d('ember', 1, 2, 0.8)], coins: [20, 40], habitat: '熔岩深淵（瞬移、丟火球）', fire: true },
  magma_bat: { kind: 'magma_bat', name: n('熔岩蝠', 'Magma Flitter'), w: 16, h: 12, hp: 45, damage: 18, defense: 6, kbRes: 0.2, ai: 'flyer', speed: 165, drops: [d('ember', 1, 1, 0.6)], coins: [12, 26], habitat: '熔岩深淵', fire: true },
  razor_fin: { kind: 'razor_fin', name: n('鋸鰭魚', 'Sawfin'), w: 16, h: 10, hp: 24, damage: 14, defense: 2, kbRes: 0.2, ai: 'swimmer', speed: 150, drops: [d('fang', 1, 1, 0.3)], coins: [3, 9], habitat: '叢林水域、地下湖（成群，追咬水裡的人）', aquatic: true },
  glow_jelly: { kind: 'glow_jelly', name: n('螢光水母', 'Lumen Jelly'), w: 16, h: 18, hp: 32, damage: 16, defense: 2, kbRes: 0.4, ai: 'jelly', speed: 120, drops: [d('gel', 1, 2), d('crystal', 1, 1, 0.15)], coins: [5, 12], habitat: '洞穴裡的水（一伸一縮地游、會發光）', aquatic: true, glow: 0.7 },
  lantern_warden: { kind: 'lantern_warden', name: n('燈脈守望者', 'Lumen Warden'), w: 56, h: 64, hp: 3000, damage: 26, defense: 8, kbRes: 1, ai: 'boss', speed: 160, shot: 16, drops: [], coins: [0, 0], habitat: '首領：夜晚或洞穴層以下使用燈芯祭品召喚', boss: true, fire: true },
  warden_wisp: { kind: 'warden_wisp', name: n('燈靈', 'Lumen Wisp'), w: 12, h: 12, hp: 22, damage: 14, defense: 0, kbRes: 0.5, ai: 'ghost', speed: 120, drops: [], coins: [0, 0], habitat: '首領召喚物', minion: true },
};
export const ENEMY_KINDS = Object.keys(ENEMIES) as EnemyKind[];
/** 會自然生成的一般怪物 */
export const NATURAL_KINDS = ENEMY_KINDS.filter((k) => !ENEMIES[k].boss && !ENEMIES[k].minion);

export interface Enemy {
  id: number;
  kind: EnemyKind;
  body: Body;
  hp: number;
  maxHp: number;
  /** 面向（render） */
  dir: 1 | -1;
  state: string;
  /** 狀態計時（秒） */
  t: number;
  /** 動作冷卻（秒） */
  cd: number;
  /** 活了多久（動畫相位） */
  age: number;
  /** 被打中閃白（秒） */
  flash: number;
  /** 被近戰打中過的揮擊 id（同一下不重複打） */
  lastSwing: number;
  /** 燃燒剩餘秒數 */
  burn: number;
  burnTick: number;
  /** 擊退中（秒）：AI 暫不控制水平速度 */
  stun: number;
  /** 卡住偵測 */
  stuckT: number;
  lastX: number;
  /** 噬花藤：根部（px） */
  anchor?: { x: number; y: number };
  /** 首領階段 1 / 2 */
  phase?: number;
  /** 液體傷害計時（秒；火系碰水 / 一般怪碰熔岩） */
  wetT: number;
}

export function makeEnemy(id: number, kind: EnemyKind, cx: number, bottom: number): Enemy {
  const def = ENEMIES[kind];
  return {
    id, kind, hp: def.hp, maxHp: def.hp, dir: 1, state: 'idle', t: 0.4, cd: 1, age: 0, flash: 0, lastSwing: -1,
    burn: 0, burnTick: 0, stun: 0, stuckT: 0, lastX: cx, wetT: 0,
    body: { x: cx - def.w / 2, y: bottom - def.h, w: def.w, h: def.h, vx: 0, vy: 0, onGround: false, gfxOffY: 0 },
  };
}

export interface AiCtx {
  q: PhysEnv;
  /** 玩家中心（px） */
  px: number; py: number;
  playerDead: boolean;
  rng: Rng;
  night: boolean;
  /** 射出投射物；noclip = 穿牆（首領的火球 / 餘燼） */
  shoot(kind: ProjKind, x: number, y: number, vx: number, vy: number, damage: number, noclip?: boolean): void;
  /** 在玩家附近找一個可站的點（腳底 px）；找不到 null */
  teleportSpot(e: Enemy): { x: number; y: number } | null;
  summon(kind: EnemyKind, x: number, y: number): void;
  /** 首領事件（phase2 / leave） */
  bossEvent(phase: 'phase2' | 'leave'): void;
  /** 玩家在水裡（水生怪只追水裡的人）；省略 = false */
  playerWet?: boolean;
}

const approach = (v: number, t: number, a: number): number => (v < t ? Math.min(t, v + a) : v > t ? Math.max(t, v - a) : v);
const sign = (v: number): 1 | -1 => (v < 0 ? -1 : 1);
/** 玩家在這麼遠（px）以內才會追 */
const AGGRO = 46 * S;

/** 一步 AI + 物理。回傳 false = 這隻要移除（首領離開等）。 */
export function stepEnemy(e: Enemy, ctx: AiCtx, dt: number): boolean {
  const def = ENEMIES[e.kind], b = e.body;
  e.age += dt;
  if (e.flash > 0) e.flash -= dt;
  if (e.cd > 0) e.cd -= dt;
  if (e.stun > 0) e.stun -= dt;
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const dx = ctx.px - cx, dy = ctx.py - cy;
  const chase = !ctx.playerDead && Math.abs(dx) < AGGRO && Math.abs(dy) < AGGRO;
  switch (def.ai) {
    case 'hop': hop(e, ctx, dt, dx, chase); break;
    case 'walker': walker(e, ctx, dt, dx, dy, chase); break;
    case 'crawler': crawler(e, ctx, dt, dx, dy, chase); break;
    case 'flyer': flyer(e, ctx, dt, dx, dy, chase); break;
    case 'swooper': swooper(e, ctx, dt, dx, dy, chase); break;
    case 'shooter': shooter(e, ctx, dt, dx, dy, chase); break;
    case 'plant': plant(e, ctx, dt, dx, dy); break;
    case 'ghost': ghost(e, ctx, dt, dx, dy, chase); break;
    case 'teleporter': teleporter(e, ctx, dt, dx, dy, chase); break;
    case 'swimmer': swimmer(e, ctx, dt, dx, dy, chase); break;
    case 'jelly': jelly(e, ctx, dt, dx, dy, chase); break;
    case 'boss': return boss(e, ctx, dt, dx, dy);
  }
  return true;
}

/** 前方（腳邊那欄、腳那列與下一列）有沒有水：怕水的步行怪會停在岸邊 / 掉頭。本身已在水裡就不管 */
export function waterAhead(q: PhysEnv, b: Body, dir: number): boolean {
  if (!q.liquidAt) return false;
  const fy = Math.floor((b.y + b.h - 1) / S);
  const here = Math.floor((b.x + b.w / 2) / S);
  if (q.liquidAt(here, fy).type === LIQ.WATER) return false;
  const ax = Math.floor((dir > 0 ? b.x + b.w + 3 : b.x - 3) / S);
  const a = q.liquidAt(ax, fy), c = q.liquidAt(ax, fy + 1);
  return (a.type === LIQ.WATER && a.amount >= 64) || (c.type === LIQ.WATER && c.amount >= 128);
}

/** 身體在水裡（浸入 ≥ 一半）、頭在水下 */
function inWater(q: PhysEnv, b: Body): { wet: boolean; head: boolean } {
  const c = q.contactAt?.(b);
  return { wet: Boolean(c && c.type === LIQ.WATER && c.frac >= 0.5), head: Boolean(c && c.type === LIQ.WATER && c.head) };
}
/** 水生怪離水：受重力，在地上隔一陣子亂跳一下（像擱淺的魚） */
function flop(e: Enemy, ctx: AiCtx, dt: number): void {
  const b = e.body;
  e.state = 'flop';
  e.t -= dt;
  if (b.onGround) {
    b.vx = approach(b.vx, 0, 600 * dt);
    if (e.t <= 0) { b.vy = -160 - ctx.rng.next() * 80; b.vx = (ctx.rng.next() - 0.5) * 140; b.onGround = false; e.t = 0.5 + ctx.rng.next() * 0.6; }
  }
  stepFalling(ctx.q, b, dt);
  if (Math.abs(b.vx) > 1) e.dir = sign(b.vx);
}

/** 鋸鰭魚：在水裡巡游；玩家也在水裡且夠近 → 直衝過去咬；保持在水面下 */
function swimmer(e: Enemy, ctx: AiCtx, dt: number, dx: number, dy: number, chase: boolean): void {
  const def = ENEMIES[e.kind], b = e.body;
  const w = inWater(ctx.q, b);
  if (!w.wet) { flop(e, ctx, dt); return; }
  let tx: number, ty: number;
  if (chase && ctx.playerWet && Math.hypot(dx, dy) < 22 * S) {
    const r = Math.hypot(dx, dy) || 1;
    tx = (dx / r) * def.speed; ty = (dy / r) * def.speed + Math.sin(e.age * 9 + e.id) * 30;
    e.state = 'chase';
  } else {
    e.t -= dt;
    if (e.t <= 0) { e.dir = ctx.rng.next() < 0.5 ? -1 : 1; e.t = 1.5 + ctx.rng.next() * 2; }
    tx = e.dir * def.speed * 0.35; ty = Math.sin(e.age * 1.7 + e.id) * 25;
    e.state = 'idle';
  }
  if (!w.head) ty = Math.max(ty, 60); // 浮出水面了 → 往下鑽
  b.vx = approach(b.vx, tx, 520 * dt);
  b.vy = approach(b.vy, ty, 520 * dt);
  const r = stepFlying(ctx.q, b, dt, 0.3);
  if (r.hitX && e.state === 'idle') e.dir = (-e.dir) as 1 | -1;
  if (Math.abs(b.vx) > 1) e.dir = sign(b.vx);
}

/** 螢光水母：慢慢下沉 → 收縮一下往上（朝玩家）推進 → 再下沉 */
function jelly(e: Enemy, ctx: AiCtx, dt: number, dx: number, dy: number, chase: boolean): void {
  const def = ENEMIES[e.kind], b = e.body;
  const w = inWater(ctx.q, b);
  if (!w.wet) { flop(e, ctx, dt); return; }
  e.t -= dt;
  if (e.t <= 0) {
    const r = Math.hypot(dx, dy) || 1, near = chase && ctx.playerWet && r < 16 * S;
    b.vx = near ? (dx / r) * def.speed * 0.8 : (ctx.rng.next() - 0.5) * 60;
    b.vy = near ? Math.min(-40, (dy / r) * def.speed) : -def.speed;
    e.state = 'pulse'; e.t = 1.2 + ctx.rng.next() * 0.6;
  } else {
    if (e.t < 0.8) e.state = 'drift';
    b.vx = approach(b.vx, 0, 60 * dt);
    b.vy = approach(b.vy, 26, 110 * dt);
  }
  if (!w.head) b.vy = Math.max(b.vy, 30);
  stepFlying(ctx.q, b, dt, 0.2);
  e.dir = sign(dx);
}

function hop(e: Enemy, ctx: AiCtx, dt: number, dx: number, chase: boolean): void {
  const def = ENEMIES[e.kind], b = e.body;
  if (b.onGround && e.stun <= 0) {
    b.vx = approach(b.vx, 0, 900 * dt);
    e.state = 'idle';
    e.t -= dt;
    if (e.t <= 0) {
      e.dir = chase ? sign(dx) : (ctx.rng.next() < 0.5 ? -1 : 1);
      b.vy = -(def.jump ?? 300) * (0.8 + ctx.rng.next() * 0.35);
      b.vx = e.dir * def.speed * (0.8 + ctx.rng.next() * 0.4);
      b.onGround = false;
      e.state = 'hop';
      e.t = 0.9 + ctx.rng.next() * 0.9;
    }
  }
  const r = stepFalling(ctx.q, b, dt);
  if (r.hitX && !b.onGround) b.vx = -b.vx * 0.3;
}

function walker(e: Enemy, ctx: AiCtx, dt: number, dx: number, dy: number, chase: boolean): void {
  const def = ENEMIES[e.kind], b = e.body;
  if (e.state === 'wander') {
    e.t -= dt;
    if (e.t <= 0) e.state = 'chase';
  } else if (chase && Math.abs(dx) > 6) e.dir = sign(dx);
  else if (!chase && e.t <= 0) { e.dir = ctx.rng.next() < 0.5 ? -1 : 1; e.t = 2 + ctx.rng.next() * 2; }
  if (!chase) e.t -= dt;
  let speed = def.speed * (chase ? 1 : 0.4);
  // 霜牙狼：靠近時撲擊
  if (e.kind === 'frost_wolf' && chase && b.onGround && e.cd <= 0 && Math.abs(dx) < 7 * S && Math.abs(dy) < 3 * S) {
    b.vy = -(def.jump ?? 300); b.vx = e.dir * def.speed * 1.9; b.onGround = false; e.cd = 2.2; e.state = 'leap';
  }
  if (e.state === 'leap' && b.onGround) e.state = 'chase';
  if (e.state === 'leap') speed = Math.abs(b.vx);
  if (b.onGround && waterAhead(ctx.q, b, e.dir)) { if (chase) speed = 0; else { e.dir = (-e.dir) as 1 | -1; e.t = 2; } }
  if (e.stun <= 0) b.vx = approach(b.vx, e.dir * speed, (b.onGround ? 700 : 300) * dt);
  const r = stepFalling(ctx.q, b, dt, undefined, true);
  // 撞牆：跳；跳不過去（卡住 1.5 秒）→ 掉頭亂走一陣
  if (r.hitX && b.onGround && e.stun <= 0) { b.vy = -(def.jump ?? 300); b.onGround = false; }
  if (chase && Math.abs(b.x - e.lastX) < 0.5 && Math.abs(dx) > 16) e.stuckT += dt; else e.stuckT = 0;
  e.lastX = b.x;
  if (e.stuckT > 1.5) { e.stuckT = 0; e.state = 'wander'; e.dir = (-e.dir) as 1 | -1; e.t = 2; }
  if (e.state !== 'wander' && e.state !== 'leap') e.state = chase ? 'chase' : 'idle';
}

function crawler(e: Enemy, ctx: AiCtx, dt: number, dx: number, dy: number, chase: boolean): void {
  const def = ENEMIES[e.kind], b = e.body;
  if (e.state === 'dash') {
    e.t -= dt;
    if (e.t <= 0) { e.state = 'chase'; e.cd = 2.4; }
  } else {
    if (chase) e.dir = sign(dx);
    if (chase && e.cd <= 0 && b.onGround && Math.abs(dx) < 6 * S && Math.abs(dy) < 2 * S) { e.state = 'dash'; e.t = 0.5; }
    else e.state = chase ? 'chase' : 'idle';
  }
  let speed = e.state === 'dash' ? def.speed * 6 : chase ? def.speed : 0;
  if (b.onGround && waterAhead(ctx.q, b, e.dir)) { speed = 0; if (e.state === 'dash') e.state = 'chase'; }
  if (e.stun <= 0) b.vx = approach(b.vx, e.dir * speed, 900 * dt);
  const r = stepFalling(ctx.q, b, dt, undefined, true);
  if (r.hitX && b.onGround && e.stun <= 0) { b.vy = -260; b.onGround = false; }
}

function flyer(e: Enemy, ctx: AiCtx, dt: number, dx: number, dy: number, chase: boolean): void {
  const def = ENEMIES[e.kind], b = e.body;
  const wob = Math.sin(e.age * 5.3 + e.id) * 0.9, wob2 = Math.cos(e.age * 3.7 + e.id * 2);
  let tx: number, ty: number;
  if (chase) {
    const r = Math.hypot(dx, dy) || 1;
    tx = (dx / r) * def.speed + wob * 60; ty = (dy / r) * def.speed + wob2 * 70;
  } else { tx = wob * def.speed * 0.5; ty = wob2 * 40; }
  b.vx = approach(b.vx, tx, 420 * dt);
  b.vy = approach(b.vy, ty, 420 * dt);
  if (Math.abs(b.vx) > 1) e.dir = sign(b.vx);
  e.state = chase ? 'chase' : 'idle';
  stepFlying(ctx.q, b, dt, 0.6);
}

/** 暗羽梟：在玩家斜上方盤旋 → 俯衝 → 拉高 */
function swooper(e: Enemy, ctx: AiCtx, dt: number, dx: number, dy: number, chase: boolean): void {
  const def = ENEMIES[e.kind], b = e.body;
  if (!chase) { flyer(e, ctx, dt, dx, dy, false); return; }
  e.t -= dt;
  if (e.state === 'dive') {
    if (e.t <= 0) { e.state = 'rise'; e.t = 0.9; }
  } else if (e.state === 'rise') {
    b.vy = approach(b.vy, -def.speed * 0.8, 600 * dt);
    b.vx = approach(b.vx, e.dir * def.speed * 0.6, 400 * dt);
    if (e.t <= 0) { e.state = 'hover'; e.t = 1.6 + ctx.rng.next(); }
  } else {
    e.state = 'hover';
    const side = Math.sin(e.age * 0.9 + e.id) > 0 ? 1 : -1;
    const gx = dx + side * 70, gy = dy - 90;
    b.vx = approach(b.vx, Math.max(-def.speed, Math.min(def.speed, gx * 2)), 500 * dt);
    b.vy = approach(b.vy, Math.max(-def.speed, Math.min(def.speed, gy * 2)), 500 * dt);
    if (e.t <= 0) {
      const r = Math.hypot(dx, dy) || 1;
      e.state = 'dive'; e.t = 0.8;
      b.vx = (dx / r) * def.speed * 2.1; b.vy = (dy / r) * def.speed * 2.1;
    }
  }
  if (Math.abs(b.vx) > 1) e.dir = sign(b.vx);
  stepFlying(ctx.q, b, dt, 0.4);
}

/** 刺翅蜂：保持 6–9 格距離，每 1.8 秒朝玩家射一根刺 */
function shooter(e: Enemy, ctx: AiCtx, dt: number, dx: number, dy: number, chase: boolean): void {
  const def = ENEMIES[e.kind], b = e.body;
  if (!chase) { flyer(e, ctx, dt, dx, dy, false); return; }
  const r = Math.hypot(dx, dy) || 1, want = 7.5 * S;
  const k = (r - want) / want;
  const side = Math.sin(e.age * 0.7 + e.id) * 0.8;
  const tx = (dx / r) * def.speed * k - (dy / r) * def.speed * side;
  const ty = (dy / r) * def.speed * k + (dx / r) * def.speed * side - 30;
  b.vx = approach(b.vx, tx, 360 * dt);
  b.vy = approach(b.vy, ty + Math.sin(e.age * 6) * 30, 360 * dt);
  e.dir = sign(dx);
  e.state = 'aim';
  if (e.cd <= 0 && r < 14 * S) {
    e.cd = 1.8;
    const sp = 260, cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    ctx.shoot('stinger', cx, cy, (dx / r) * sp, (dy / r) * sp, def.shot ?? def.damage);
    e.state = 'shoot';
  }
  stepFlying(ctx.q, b, dt, 0.5);
}

/** 噬花藤：根部固定，頭在半徑內晃；玩家靠近時咬過去，再縮回 */
function plant(e: Enemy, ctx: AiCtx, dt: number, dx: number, dy: number): void {
  const def = ENEMIES[e.kind], b = e.body;
  if (!e.anchor) e.anchor = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const a = e.anchor, cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const toP = Math.hypot(ctx.px - a.x, ctx.py - a.y);
  const MAXR = 5 * S;
  e.t -= dt;
  let gx: number, gy: number, sp: number;
  if (e.state === 'lunge') {
    gx = ctx.px; gy = ctx.py; sp = def.speed;
    if (e.t <= 0) { e.state = 'retract'; e.t = 0.8; }
  } else if (e.state === 'retract') {
    gx = a.x; gy = a.y; sp = def.speed * 0.5;
    if (e.t <= 0) e.state = 'idle';
  } else {
    e.state = 'idle';
    gx = a.x + Math.sin(e.age * 1.7 + e.id) * 10; gy = a.y + Math.cos(e.age * 1.3) * 6; sp = 40;
    if (!ctx.playerDead && toP < 7 * S && e.cd <= 0) { e.state = 'lunge'; e.t = 0.6; e.cd = 2; }
  }
  const vx = gx - cx, vy = gy - cy, r = Math.hypot(vx, vy) || 1;
  b.vx = (vx / r) * Math.min(sp, r / dt);
  b.vy = (vy / r) * Math.min(sp, r / dt);
  stepNoClip(b, dt);
  // 夾在根部半徑內
  const ox = b.x + b.w / 2 - a.x, oy = b.y + b.h / 2 - a.y, or = Math.hypot(ox, oy);
  if (or > MAXR) { b.x = a.x + (ox / or) * MAXR - b.w / 2; b.y = a.y + (oy / or) * MAXR - b.h / 2; }
  e.dir = sign(ctx.px - a.x);
  void dx; void dy;
}

/** 咒顱 / 燈靈：穿牆、帶慣性地追，上下飄 */
function ghost(e: Enemy, ctx: AiCtx, dt: number, dx: number, dy: number, chase: boolean): void {
  const def = ENEMIES[e.kind], b = e.body;
  const r = Math.hypot(dx, dy) || 1;
  const tx = chase ? (dx / r) * def.speed : 0, ty = chase ? (dy / r) * def.speed + Math.sin(e.age * 3 + e.id) * 30 : Math.sin(e.age) * 20;
  b.vx = approach(b.vx, tx, 160 * dt);
  b.vy = approach(b.vy, ty, 160 * dt);
  e.dir = sign(dx);
  e.state = chase ? 'chase' : 'idle';
  stepNoClip(b, dt);
}

/** 燼角魔：站著 → 瞬移到玩家附近 → 施法 0.5 秒 → 丟火球 */
function teleporter(e: Enemy, ctx: AiCtx, dt: number, dx: number, dy: number, chase: boolean): void {
  const def = ENEMIES[e.kind], b = e.body;
  e.t -= dt;
  e.dir = sign(dx);
  if (e.state === 'cast') {
    if (e.t <= 0) {
      const cx = b.x + b.w / 2, cy = b.y + b.h * 0.35, r = Math.hypot(dx, dy) || 1, sp = 240;
      ctx.shoot('fireball', cx + e.dir * 8, cy, (dx / r) * sp, (dy / r) * sp, def.shot ?? def.damage);
      e.state = 'idle'; e.t = 2.6 + ctx.rng.next() * 1.2;
    }
  } else if (chase && e.t <= 0) {
    const spot = ctx.teleportSpot(e);
    if (spot) { b.x = spot.x - b.w / 2; b.y = spot.y - b.h; b.vx = 0; b.vy = 0; e.state = 'cast'; e.t = 0.55; e.flash = 0; }
    else e.t = 0.6;
  }
  if (e.stun <= 0) b.vx = approach(b.vx, 0, 600 * dt);
  stepFalling(ctx.q, b, dt);
  void dy;
}

// ── 首領：燈脈守望者 ─────────────────────────────────────
// 第一階段（hover）：在玩家上方左右游移，每 2.2 秒射三連火球、每 7 秒召喚兩隻燈靈。
// 生命 ≤ 50% → 碎籠（shatter，1.4 秒無敵、咆哮）→ 第二階段：
//   三連衝刺（每次 0.45 秒蓄力 + 0.65 秒衝）→ 一圈 12 顆餘燼 → 回到衝刺。
// 玩家死亡或距離太遠 → 離開（leave）。
export const WARDEN_PHASE2 = 0.5;
function boss(e: Enemy, ctx: AiCtx, dt: number, dx: number, dy: number): boolean {
  const def = ENEMIES[e.kind], b = e.body;
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  e.phase = e.phase ?? 1;
  e.t -= dt;
  if (e.state === 'leave') {
    b.vy = approach(b.vy, -380, 400 * dt);
    stepNoClip(b, dt);
    return e.t > 0;
  }
  if (ctx.playerDead || Math.abs(dx) > 120 * S || Math.abs(dy) > 90 * S) {
    e.state = 'leave'; e.t = 3; ctx.bossEvent('leave');
    return true;
  }
  if (e.phase === 1 && e.hp <= e.maxHp * WARDEN_PHASE2) {
    e.phase = 2; e.state = 'shatter'; e.t = 1.4; b.vx = 0; b.vy = 0;
    ctx.bossEvent('phase2');
  }
  const r = Math.hypot(dx, dy) || 1;
  if (e.state === 'shatter') {
    b.vx *= 0.9; b.vy *= 0.9;
    if (e.t <= 0) { e.state = 'windup'; e.t = 0.45; e.cd = 3; }
  } else if (e.phase === 1) {
    if (e.state !== 'hover') { e.state = 'hover'; e.t = 2.2; e.cd = 5; }
    const gx = dx + Math.sin(e.age * 0.8) * 150, gy = dy - 150 + Math.sin(e.age * 1.9) * 24;
    b.vx = approach(b.vx, Math.max(-def.speed, Math.min(def.speed, gx * 1.4)), 260 * dt);
    b.vy = approach(b.vy, Math.max(-def.speed, Math.min(def.speed, gy * 1.4)), 260 * dt);
    if (e.t <= 0) {
      e.t = 2.2;
      const base = Math.atan2(dy, dx);
      for (const off of [-0.22, 0, 0.22]) {
        ctx.shoot('fireball', cx, cy + 12, Math.cos(base + off) * 230, Math.sin(base + off) * 230, def.shot ?? 16, true);
      }
    }
    if (e.cd <= 0) {
      e.cd = 7;
      ctx.summon('warden_wisp', cx - 30, cy);
      ctx.summon('warden_wisp', cx + 30, cy);
    }
  } else {
    // 第二階段
    if (e.state === 'windup') {
      b.vx *= 0.85; b.vy *= 0.85;
      if (e.t <= 0) { e.state = 'dash'; e.t = 0.65; b.vx = (dx / r) * 520; b.vy = (dy / r) * 520; }
    } else if (e.state === 'dash') {
      if (e.t <= 0) {
        e.cd -= 1;
        if (e.cd <= 0) {
          e.state = 'ring'; e.t = 0.9;
        } else { e.state = 'windup'; e.t = 0.45; }
      }
    } else if (e.state === 'ring') {
      b.vx *= 0.9; b.vy = approach(b.vy, -60, 300 * dt);
      if (e.t <= 0) {
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2 + e.age;
          ctx.shoot('ember', cx, cy, Math.cos(a) * 200, Math.sin(a) * 200, (def.shot ?? 16) - 2, true);
        }
        e.state = 'windup'; e.t = 0.6; e.cd = 3;
      }
    } else { e.state = 'windup'; e.t = 0.45; e.cd = 3; }
  }
  e.dir = sign(dx);
  stepNoClip(b, dt);
  return true;
}
