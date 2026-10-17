// sprites.ts — 角色 / 樹 / 火把的程式手繪像素精靈（原生像素尺寸烘焙，繪製時整數倍放大）。
//   · 玩家：分件組裝（頭髮 / 臉、上衣、腰帶、褲腿、靴），每件自動描邊；身體影格（idle 4、walk 8、jump、fall）
//     烘成一張表；前後手臂連同手上的鎬以 RotSprite 旋轉、依角度量化後延遲快取。
//   · 樹：三種樹（橡樹 / 白樺 / 深綠），錐形帶樹皮紋的樹幹、根部外擴、側枝、多團球狀樹冠，依 (種類,高,冠) 快取。
//   · 火把：4 格火焰 + 階梯式光暈。
import { Bmp, INK, bayer, h01, hex, mix, ramp, rotPrep, rotate, shade, toCanvas, type RGB } from './pixel';
import { ARM_STEPS, WALK_FRAMES, IDLE_FRAMES, FLAME_FRAMES, angleIndex } from './anim';
import { PAL, PICK_METAL } from './textures';
import { ITEMS, type ArmorSetId, type ItemId } from '../engine/items';
import { ARMOR_RAMP, R as CR, WEAPON_METAL, shadeMask } from './combatArt';

/** 身上穿的防具（各部位的套裝 id；null = 沒穿） */
export interface ArmorLook { head: ArmorSetId | null; body: ArmorSetId | null; legs: ArmorSetId | null; }
export const NO_ARMOR: ArmorLook = { head: null, body: null, legs: null };
export function armorKey(a: ArmorLook): string { return `${a.head ?? ''}|${a.body ?? ''}|${a.legs ?? ''}`; }
/** 防具色階（7 階）→ 上衣 6 階 / 褲子 5 階 / 靴子 5 階 */
const asShirt = (r: RGB[]): RGB[] => [r[0], r[1], r[2], r[3], r[4], r[5]];
const asPants = (r: RGB[]): RGB[] => [r[0], r[1], r[2], r[3], r[4]];
const asBoots = (r: RGB[]): RGB[] => [r[0], r[0], r[1], r[2], r[3]];

// ── 可自訂外觀（之後的角色客製化用） ─────────────────────
export const SKIN_TONES: RGB[][] = [
  ramp('#623924', '#b07a4b', '#d98f66', '#f2b888', '#fff4c0'),
  ramp('#4a2418', '#7e4430', '#a8623e', '#c88250', '#e0a470'),
  ramp('#2c140c', '#52281a', '#734026', '#935a34', '#b07848'),
];
export const HAIR_COLORS: RGB[][] = [
  ramp('#1c1424', '#2a1810', '#472819', '#623924', '#7c4c2e'),
  ramp('#141018', '#24202c', '#363244', '#4c4860', '#66627c'),
  ramp('#3a1a08', '#7a3a12', '#b05a1c', '#d8802c', '#f0a850'),
];
export interface Look { skin: number; hair: number; }
export const DEFAULT_LOOK: Look = { skin: 0, hair: 0 };

const SHIRT_BASE = ramp('#0c0a12', '#1f6474', '#1f6474', '#2c8692', '#4aaeb0', '#a2c8b0');
const PANTS_BASE = ramp('#0c0a12', '#1c1424', '#2c2450', '#463c78', '#7a5a8c');
const BOOTS_BASE = ramp('#0c0a12', '#2a1810', '#472819', '#623924', '#7c4c2e');
const BELT = ramp('#1c1424', '#2a1810', '#472819');
const BUCKLE = hex('#ffd86a');

export const FW = 32;
export const FH = 48;
/** 身體影格索引 */
export const FRAME = { IDLE: 0, WALK: IDLE_FRAMES, JUMP: IDLE_FRAMES + WALK_FRAMES, FALL: IDLE_FRAMES + WALK_FRAMES + 1 } as const;
const FRAMES = FRAME.FALL + 1;
/** 肩膀軸心（影格座標，含呼吸 / 走路的身體位移前） */
const SHOULDER_FRONT = { x: 18, y: 22 };
const SHOULDER_BACK = { x: 14, y: 22 };

// 頭（面向右；12×12） a=髮 A=髮暗 q=髮亮 s=膚 S=膚暗 h=膚亮 w=眼白 e=瞳 m=嘴
const HEAD = [
  '...aaaaaa...',
  '.aaqqqqaaa..',
  'aaqqaaaaaaa.',
  'aaaaaaaaaaaa',
  'aaaaaAhhhhAa',
  'aaaAShhsssss',
  'aaASSssswess',
  'aaAhSssswess',
  'AaSSsssssssS',
  '.ASssssssmSS',
  '..SSsssssSS.',
  '...SSSSSSS..',
];
// 上衣（10×12，從脖子到腰帶下緣） c/C/k/K = 衣服各階、n = 脖子膚色、b = 腰帶、u = 扣環
const TORSO = [
  '...nnnn...',
  '.kkkCCkkk.',
  'kkkkkccccC',
  'kkkcccccCC',
  'kkccccccCC',
  'kkccccccCC',
  'kkccccccCC',
  'kccccccCCC',
  'kccccccCCC',
  'KccccccCCK',
  'bbbbbbbubb',
  'bbbbbbbbbb',
];

interface LegPose { thigh: number; shin: number; }

/** 以粗線段畫肢體：左側受光 */
function limb(b: Bmp, x0: number, y0: number, x1: number, y1: number, half: number, pal: RGB[]): void {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, nx = uy, ny = -ux;
  const minX = Math.floor(Math.min(x0, x1) - half - 1), maxX = Math.ceil(Math.max(x0, x1) + half + 1);
  const minY = Math.floor(Math.min(y0, y1) - 1), maxY = Math.ceil(Math.max(y0, y1) + 1);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5 - x0, py = y + 0.5 - y0;
      const t = px * ux + py * uy, s = px * nx + py * ny;
      if (t < -0.5 || t > len + 0.5 || Math.abs(s) > half) continue;
      // s 以 n=(uy,-ux) 為正：向下的肢體 n = (1,0)，s<0 在左（受光）
      b.set(x, y, s < -half + 1 ? pal[3] : s > half - 1 ? pal[1] : pal[2]);
    }
  }
}

function leg(pose: LegPose, hipX: number, hipY: number, pants: RGB[], boots: RGB[]): { b: Bmp; ankleY: number } {
  const b = new Bmp(FW, FH);
  const r = (d: number): number => (d * Math.PI) / 180;
  const kx = hipX + Math.sin(r(pose.thigh)) * 7, ky = hipY + Math.cos(r(pose.thigh)) * 7;
  const ax = kx + Math.sin(r(pose.shin)) * 7, ay = ky + Math.cos(r(pose.shin)) * 7;
  limb(b, hipX, hipY, kx, ky, 2, pants);
  limb(b, kx, ky, ax, ay, 2, pants);
  // 靴子：5×3、鞋尖朝前
  const bx = Math.round(ax - 2), by = Math.round(ay) - 1;
  b.rect(bx, by, 5, 1, boots[3]);
  b.rect(bx, by + 1, 6, 1, boots[2]);
  b.rect(bx, by + 2, 6, 1, boots[1]);
  b.set(bx, by, boots[4]);
  b.outline(INK);
  return { b, ankleY: ay };
}

/** 頭盔：蓋住頭髮（頭頂 + 後腦），前緣到眉毛；各套裝有自己的細節 */
function helmetOver(head: Bmp, set: ArmorSetId, ox: number, oy: number): void {
  const r = ARMOR_RAMP[set];
  const m = (x: number, y: number): boolean => {
    const lx = x - ox, ly = y - oy;
    if (ly < -1 || ly > 9 || lx < -1 || lx > 12) return false;
    if (ly <= 3) return Math.hypot(lx + 0.5 - 6, (ly + 0.5 - 4.5) * 1.15) <= 6.6;
    if (ly === 4) return lx >= -1 && lx <= 12;
    return lx >= -1 && lx <= 3 - (ly > 7 ? 1 : 0);
  };
  shadeMask(head, m, r, { x0: 0, y0: 0, x1: head.w - 1, y1: head.h - 1 });
  head.rect(ox, oy + 4, 13, 1, r[2]);
  if (set === 'gold') { head.set(ox + 5, oy - 2, CR.red[3]); head.set(ox + 6, oy - 2, CR.red[4]); head.set(ox + 6, oy - 3, CR.red[3]); }
  if (set === 'molten') { head.set(ox + 4, oy + 1, CR.lava[3]); head.set(ox + 8, oy + 2, CR.lava[4]); head.set(ox + 1, oy + 6, CR.lava[3]); }
  if (set === 'bone') { head.set(ox + 8, oy + 1, r[1]); head.set(ox + 9, oy + 2, r[1]); head.set(ox + 3, oy + 2, r[1]); }
  if (set === 'iron' || set === 'copper') { head.set(ox + 6, oy, r[6]); head.set(ox + 6, oy + 1, r[5]); }
  if (set === 'wood') { head.set(ox + 4, oy + 1, r[2]); head.set(ox + 8, oy + 1, r[2]); }
}

function bodyFrame(look: Look, kind: 'idle' | 'walk' | 'jump' | 'fall', f: number, armor: ArmorLook = NO_ARMOR): { b: Bmp; dy: number } {
  const skin = SKIN_TONES[look.skin] ?? SKIN_TONES[0];
  const hair = HAIR_COLORS[look.hair] ?? HAIR_COLORS[0];
  const SHIRT = armor.body ? asShirt(ARMOR_RAMP[armor.body]) : SHIRT_BASE;
  const PANTS = armor.legs ? asPants(ARMOR_RAMP[armor.legs]) : PANTS_BASE;
  const BOOTS = armor.legs ? asBoots(ARMOR_RAMP[armor.legs]) : BOOTS_BASE;
  let near: LegPose, far: LegPose, snap = true, breath = 0;
  if (kind === 'walk') {
    const ph = (f / WALK_FRAMES) * Math.PI * 2;
    const th = (p: number): LegPose => ({ thigh: 30 * Math.sin(p), shin: 30 * Math.sin(p) - (6 + 46 * Math.max(0, Math.cos(p))) });
    near = th(ph); far = th(ph + Math.PI);
  } else if (kind === 'jump') {
    near = { thigh: 48, shin: -6 }; far = { thigh: -12, shin: -40 }; snap = false;
  } else if (kind === 'fall') {
    near = { thigh: 18, shin: 6 }; far = { thigh: -22, shin: -14 }; snap = false;
  } else {
    near = { thigh: 4, shin: 2 }; far = { thigh: -4, shin: -3 };
    breath = f === 2 || f === 3 ? 1 : 0;
  }
  const farDark = PANTS.map((c) => shade(c, 0.78));
  const bootDark = BOOTS.map((c) => shade(c, 0.8));
  const L1 = leg(far, 14.5, 31, farDark, bootDark), L2 = leg(near, 17.5, 31, PANTS, BOOTS);
  const ground = 46;
  const dy = snap ? Math.round(ground - Math.max(L1.ankleY, L2.ankleY)) : 0;

  const torso = new Bmp(FW, FH);
  torso.grid(TORSO, { n: skin[2], k: SHIRT[4], c: SHIRT[3], C: SHIRT[2], K: SHIRT[1], b: BELT[1], u: BUCKLE }, 11, 19 + breath);
  torso.set(12, 20 + breath, SHIRT[5]); torso.set(13, 20 + breath, SHIRT[5]);
  torso.outline(INK);
  const head = new Bmp(FW, FH);
  head.grid(HEAD, {
    a: hair[2], A: hair[1], q: hair[3], s: skin[3], S: skin[2], h: skin[4], w: hex('#f4f2ea'), e: hex('#1c1424'), m: skin[1],
  }, 10, 7 + breath);
  if (armor.head) helmetOver(head, armor.head, 10, 7 + breath);
  head.outline(INK);

  const out = new Bmp(FW, FH);
  const legs = new Bmp(FW, FH);
  legs.blit(L1.b, 0, 0); legs.blit(L2.b, 0, 0);
  out.blit(legs, 0, dy);
  out.blit(torso, 0, dy);
  out.blit(head, 0, dy);
  return { b: out, dy: dy + breath };
}

// ── 手臂 + 手持鎬 ──────────────────────────────────────
const ARM_W = 26, ARM_H = 34, PIV = { x: 13, y: 3 };
/** 劍 / 大劍：握把在手心、刀身沿手臂往外伸（跟著手臂旋轉） */
function bladeBmp(item: ItemId): Bmp {
  const w = ITEMS[item].weapon;
  const m = WEAPON_METAL[item] ?? CR.iron;
  const broad = w?.kind === 'broadsword';
  const len = broad ? 17 : item === 'lumen_blade' ? 17 : item === 'wood_sword' ? 12 : Math.min(17, Math.round((w?.reach ?? 34) / 2.4));
  const g = item === 'lumen_blade' || item === 'gold_sword' ? CR.gold : item === 'wood_sword' ? CR.wood : broad ? CR.leather : m;
  const b = new Bmp(ARM_W, ARM_H);
  // 握把（手心）+ 護手
  b.rect(12, 11, 2, 3, CR.leather[3]); b.set(12, 11, CR.leather[5]);
  b.rect(9, 14, 8, 1, g[4]); b.set(9, 14, g[5]); b.set(16, 14, g[2]);
  // 刀身
  const x0 = broad ? 11 : 12, wd = broad ? 4 : 2;
  for (let y = 15; y < 15 + len && y < ARM_H - 1; y++) {
    for (let k = 0; k < wd; k++) b.set(x0 + k, y, k === 0 ? m[5] : k === wd - 1 ? m[2] : m[4]);
    if (broad && y % 4 === 1) b.set(x0 + wd - 1, y, m[1]);
  }
  const tip = Math.min(ARM_H - 1, 15 + len);
  b.set(broad ? 12 : 12, tip, m[4]); if (broad) b.set(13, tip, m[3]);
  if (item === 'lumen_blade') for (let y = 17; y < tip; y += 3) b.set(12, y, CR.cyan[6]);
  return b.outline(INK);
}

function armBmp(look: Look, back: boolean, pick: ItemId | null, bodySet: ArmorSetId | null = null, blade: ItemId | null = null): Bmp {
  const skin = (SKIN_TONES[look.skin] ?? SKIN_TONES[0]).map((c) => (back ? shade(c, 0.8) : c));
  const SH = bodySet ? asShirt(ARMOR_RAMP[bodySet]) : SHIRT_BASE;
  const sh = SH.map((c) => (back ? shade(c, 0.78) : c));
  const b = new Bmp(ARM_W, ARM_H);
  if (blade) b.blit(bladeBmp(blade), 0, 0);
  if (pick) {
    const w = PAL.bark, m = PICK_METAL[pick] ?? PAL.metal;
    const item = new Bmp(ARM_W, ARM_H);
    // 柄：從手往外延伸
    for (let y = 10; y <= 24; y++) { item.set(12, y, w[4]); item.set(13, y, w[2]); }
    // 鎬頭：中間厚、兩端尖、微微朝手彎
    for (let dx = -7; dx <= 7; dx++) {
      const ad = Math.abs(dx);
      const y = 25 - Math.round((dx * dx) / 18);
      const th = ad <= 1 ? 4 : ad <= 3 ? 3 : ad <= 5 ? 2 : 1;
      const x = 12.5 + dx;
      for (let k = 0; k < th; k++) item.set(x, y + k, k === 0 ? m[5] : k === th - 1 ? m[2] : m[3]);
    }
    item.set(6, 24, m[6]); item.set(19, 24, m[4]);
    // 綁繩
    item.set(12, 24, w[1]); item.set(13, 24, w[1]); item.set(12, 23, w[2]); item.set(13, 23, w[1]);
    item.outline(INK);
    b.blit(item, 0, 0);
  }
  const arm = new Bmp(ARM_W, ARM_H);
  // 袖子（肩到手肘）+ 前臂 + 手
  arm.rect(11, 1, 4, 5, sh[3]); arm.rect(11, 1, 1, 5, sh[4]); arm.rect(14, 1, 1, 5, sh[2]);
  arm.rect(11, 6, 4, 1, sh[2]);
  arm.rect(11, 7, 4, 4, skin[3]); arm.rect(11, 7, 1, 4, skin[4]); arm.rect(14, 7, 1, 4, skin[2]);
  arm.rect(11, 11, 4, 3, skin[3]); arm.set(14, 12, skin[2]); arm.set(11, 13, skin[2]); arm.set(14, 13, skin[1]);
  arm.outline(INK);
  b.blit(arm, 0, 0);
  return b;
}

// ── 手持方塊 / 火把（不旋轉） ─────────────────────────
function miniIcon(src: Bmp): Bmp {
  const b = new Bmp(8, 8);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) b.setRaw(x, y, src.raw(x * 2 + 1, y * 2 + 1));
  return b;
}

// ── 火把 ───────────────────────────────────────────────
const FLAMES = [
  ['..r...', '.ror..', '.oyo..', 'roWyor', 'oyWWyo', '.oyyo.'],
  ['...r..', '..ror.', '.royo.', 'royWo.', 'oyWWyo', '.oyyo.'],
  ['..r...', '..or..', '.oyor.', 'oyWyo.', 'oyWWyo', '.oyyo.'],
  ['......', '.r.r..', '.oroo.', 'royWyo', 'oyWWyo', '.oyyo.'],
];
/** 火把：mount = 'floor'（直立插地 / 背牆）或 'wall'（左牆壁掛：棍子底部貼牆、往右上斜，火焰仍朝上；右牆用鏡像） */
function torchBmp(frame: number, mount: 'floor' | 'wall' = 'floor'): Bmp {
  const t = PAL.torch, w = PAL.bark;
  const b = new Bmp(10, 16);
  if (mount === 'floor') {
    // 棍子
    b.rect(4, 8, 2, 7, w[3]); b.rect(4, 8, 1, 7, w[5]);
    b.rect(4, 7, 2, 1, hex('#5a3c26'));
  } else {
    // 斜棍：底端 (1,14) → 頂端 (4,8)，兩像素寬；牆上一個鐵托架
    for (let k = 0; k <= 6; k++) {
      const x = 1 + Math.round(k * 0.5), y = 14 - k;
      b.set(x, y, w[5]); b.set(x + 1, y, w[3]);
    }
    b.rect(4, 7, 2, 1, hex('#5a3c26'));
    b.set(0, 13, hex('#423f54')); b.set(0, 14, hex('#5e5e74')); b.set(1, 15, hex('#423f54'));
  }
  const stick = b.clone();
  stick.outline(INK);
  const fl = new Bmp(10, 16);
  fl.grid(FLAMES[frame % FLAMES.length], { r: t[1], o: t[2], y: t[4], W: t[5] }, 2, 2);
  const out = new Bmp(10, 16);
  out.blit(stick, 0, 0);
  out.blit(fl, 0, 0);
  return out;
}
/**
 * 火光暈（以 'lighter' 加色疊上）：不透明的同心環 + 由內而外變稀的 Bayer 抖動，
 * 每個像素要嘛加一階暖光、要嘛不加 —— 沒有放射狀模糊。
 */
function glowBmp(R = 18, hot: RGB = [64, 36, 8], warm: RGB = [36, 18, 4]): Bmp {
  const b = new Bmp(R * 2, R * 2), k = 18 / R;
  for (let y = 0; y < R * 2; y++) {
    for (let x = 0; x < R * 2; x++) {
      const d = Math.hypot(x + 0.5 - R, y + 0.5 - R) * k;
      const t = bayer(x, y);
      if (d < 4) b.set(x, y, hot);
      else if (d < 6) b.set(x, y, t < 0.5 ? hot : warm);
      else if (d < 10) b.set(x, y, warm);
      else if (d < 13 && t < 0.5) b.set(x, y, warm);
      else if (d < 16 && t < 0.125) b.set(x, y, warm);
    }
  }
  return b;
}

// ── 樹 ─────────────────────────────────────────────────
const TREE_BARK: RGB[][] = [
  PAL.bark,
  ramp('#1c1424', '#2c2838', '#5e5e74', '#858aa0', '#b4b9c8', '#f2e2b0', '#ffffff'),
  ramp('#0c0a12', '#1c1424', '#2a1810', '#472819', '#623924', '#7c4c2e', '#966139'),
  PAL.bark,
  // 叢林大樹：深色帶苔的樹皮
  ramp('#0c0a12', '#16301e', '#2a1810', '#472819', '#623924', '#7c4c2e', '#966139'),
];
const TREE_LEAF: RGB[][] = [
  ramp('#16301e', '#214528', '#2d672e', '#468a34', '#67ab3c', '#93cc50', '#c2e478'),
  ramp('#16301e', '#2d672e', '#468a34', '#67ab3c', '#93cc50', '#c2e478', '#fff4c0'),
  ramp('#0c0a12', '#16301e', '#214528', '#1f6474', '#3f7468', '#6a9c88', '#a2c8b0'),
  ramp('#0c0a12', '#16301e', '#214528', '#3f7468', '#6a9c88', '#a2c8b0', '#cceaf8'),
  // 叢林：飽和的亮綠
  ramp('#16301e', '#214528', '#2d672e', '#468a34', '#67ab3c', '#93cc50', '#c2e478'),
];
type Blob = [number, number, number];
const CANOPY: Blob[][] = [
  [[-0.3, -0.42, 0.42], [0.3, -0.4, 0.44], [-0.58, 0.02, 0.4], [0.56, 0.0, 0.42], [0, -0.05, 0.6], [-0.34, 0.38, 0.42], [0.34, 0.4, 0.42], [0, 0.5, 0.4]],
  [[-0.2, -0.45, 0.4], [0.28, -0.42, 0.38], [-0.62, -0.05, 0.36], [0.64, -0.02, 0.36], [0, -0.1, 0.5], [-0.38, 0.3, 0.4], [0.4, 0.32, 0.4], [0, 0.42, 0.38]],
  [[0, -0.62, 0.34], [-0.22, -0.3, 0.4], [0.24, -0.28, 0.4], [0, 0, 0.5], [-0.42, 0.3, 0.42], [0.44, 0.32, 0.42], [0, 0.5, 0.44]],
  [],
  // 叢林：寬扁的傘形樹冠（左右延伸的葉團）
  [[-0.62, 0.1, 0.36], [0.64, 0.12, 0.36], [-0.3, -0.25, 0.42], [0.3, -0.22, 0.42], [0, -0.05, 0.5], [-0.82, 0.32, 0.22], [0.84, 0.3, 0.22], [0, 0.32, 0.38]],
];

export interface TreeSprite { canvas: HTMLCanvasElement; ax: number; ay: number; }

function paintTree(variant: number, h: number, r: number, grounded: boolean): { b: Bmp; ax: number; ay: number } {
  const bark = TREE_BARK[variant], leaf = TREE_LEAF[variant];
  const trunkPx = h * 16;
  const jungle = variant === 4;
  const cw = r > 0 ? (2 * r + 1) * 16 + (variant === 1 ? 10 : variant === 2 ? -8 : jungle ? 24 : 0) : 0;
  const ch = r > 0 ? Math.round(cw * (variant === 2 ? 1.12 : variant === 1 ? 0.78 : jungle ? 0.5 : 0.86)) : 0;
  const W = Math.max(cw + 8, 44);
  const canopyCy = r > 0 ? ch / 2 + 2 : 0;
  const H = Math.max(trunkPx + 4, Math.round(canopyCy + (trunkPx - 6)) + 4);
  const b = new Bmp(W, H);
  const cx = W / 2; // 樹幹中心
  const bottom = H; // 地面
  const topY = bottom - trunkPx;

  // 樹幹
  const trunk = new Bmp(W, H);
  const seed = variant * 97 + h * 13 + r;
  const streaks = [0.34, 0.58, 0.78];
  for (let y = Math.max(0, topY - 4); y < bottom; y++) {
    const t = Math.min(1, (bottom - y) / trunkPx);
    const db = bottom - 1 - y;
    let wv = jungle ? 18 - 6 * t : 12 - 5 * t;
    if (grounded && db < 6) wv += Math.pow(6 - db, 1.5) * 0.75;
    const half = wv / 2;
    const xl = Math.round(cx - half), xr = Math.round(cx + half);
    for (let x = xl; x < xr; x++) {
      const u = (x - xl + 0.5) / (xr - xl);
      let k = u < 0.2 ? 5 : u < 0.45 ? 4 : u < 0.8 ? 3 : 2;
      if (variant === 1) {
        if (h01(x >> 1, y >> 1, seed) > 0.93) k = 1; // 白樺黑斑
      } else {
        // 樹皮紋：1px 縱向深線（有斷點），左側帶一點亮面
        for (let si = 0; si < streaks.length; si++) {
          const sx = Math.round(xl + streaks[si] * (xr - xl));
          if (x === sx && h01(si, (y + si * 3) >> 2, seed) > 0.3) k = Math.max(1, k - 2);
          else if (x === sx - 1 && h01(si, (y + si * 3) >> 2, seed) > 0.3 && k >= 3) k = Math.min(6, k + 1);
        }
      }
      trunk.set(x, y, bark[k]);
    }
    if (variant === 1 && h01(0, y, seed + 3) > 0.86) {
      for (let x = xl + 1; x < xr - 1; x++) if (h01(x, y, seed + 5) > 0.35) trunk.set(x, y, bark[1]);
    }
  }
  // 根
  if (grounded) {
    for (const dir of [-1, 1]) {
      const len = 9 + Math.floor(h01(dir, 1, seed) * 4);
      for (let i = 0; i < len; i++) {
        const x = Math.round(cx + dir * (4 + i));
        const yy = bottom - 3 + Math.floor((i / len) * 2.5);
        trunk.set(x, yy, bark[4]);
        trunk.set(x, yy + 1, bark[2]);
        if (i < len * 0.5) trunk.set(x, yy - 1, bark[3]);
      }
    }
  }
  // 樹瘤
  if (h >= 6) {
    const ky = topY + Math.floor(trunkPx * (0.45 + h01(1, 2, seed) * 0.25));
    trunk.set(Math.round(cx), ky, bark[1]); trunk.set(Math.round(cx) + 1, ky, bark[1]);
    trunk.set(Math.round(cx), ky - 1, bark[5]); trunk.set(Math.round(cx), ky + 1, bark[2]);
  }
  // 側枝 + 小葉簇
  const tufts: [number, number][] = [];
  if (h >= 7 && r > 0) {
    const n = 1 + (h01(3, 3, seed) > 0.5 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const dir = (k + variant) % 2 === 0 ? 1 : -1;
      const by = topY + Math.floor(trunkPx * (0.35 + 0.22 * k + h01(k, 4, seed) * 0.1));
      const sx = Math.round(cx + dir * 3);
      for (let i = 0; i < 6; i++) {
        const x = sx + dir * i, y = by - Math.floor(i * 0.7);
        trunk.set(x, y, bark[4]); trunk.set(x, y + 1, bark[2]);
      }
      tufts.push([sx + dir * 7, by - 5]);
    }
  }
  trunk.outline(INK);
  b.blit(trunk, 0, 0);

  // 樹冠
  if (r > 0) {
    const can = new Bmp(W, H);
    const owner = new Int16Array(W * H).fill(-1);
    const blobs = CANOPY[variant];
    const rx = cw / 2, ry = ch / 2;
    const ccx = cx, ccy = canopyCy;
    const order = blobs.map((q, i) => ({ q, i })).sort((a, c) => a.q[1] - c.q[1]);
    const inBlob = (q: Blob, x: number, y: number): number => {
      const bx = ccx + q[0] * rx, by = ccy + q[1] * ry, br = q[2] * rx, bry = q[2] * ry * 1.05;
      const nx = (x + 0.5 - bx) / br, ny = (y + 0.5 - by) / bry;
      return nx * nx + ny * ny;
    };
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        for (const { q, i } of order) {
          let d = inBlob(q, x, y);
          // 葉緣參差
          if (d > 0.8) d += (h01(x >> 1, y >> 1, seed + i) - 0.5) * 0.45;
          if (d <= 1) owner[y * W + x] = i;
        }
      }
    }
    tufts.forEach(([tx, ty], ti) => {
      for (let y = ty - 4; y <= ty + 4; y++) for (let x = tx - 5; x <= tx + 5; x++) {
        const nx = (x + 0.5 - tx) / 5, ny = (y + 0.5 - ty) / 3.6;
        if (nx * nx + ny * ny <= 1 && x >= 0 && y >= 0 && x < W && y < H && owner[y * W + x] < 0) owner[y * W + x] = 100 + ti;
      }
    });
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const o = owner[y * W + x];
        if (o < 0) continue;
        let nx: number, ny: number;
        const tuft = o >= 100;
        if (tuft) { const [tx, ty] = tufts[o - 100]; nx = (x + 0.5 - tx) / 5; ny = (y + 0.5 - ty) / 3.6; }
        else {
          const q = blobs[o];
          nx = (x + 0.5 - (ccx + q[0] * rx)) / (q[2] * rx);
          ny = (y + 0.5 - (ccy + q[1] * ry)) / (q[2] * ry);
        }
        let v = 0.58 - 0.42 * (nx * 0.62 + ny * 0.78);
        const gy = (y - ccy) / ry;
        if (!tuft) v -= Math.max(0, gy) * 0.22;
        v += (h01(x >> 2, y >> 2, seed + 17) - 0.5) * 0.06;
        // 葉團分隔：鄰格屬於「較後面」的團 → 暗縫
        const up = y > 0 ? owner[(y - 1) * W + x] : -1, lf = x > 0 ? owner[y * W + x - 1] : -1;
        const sep = !tuft && ((up >= 0 && up !== o && up < 100 && blobs[up][1] < blobs[o][1]) || (lf >= 0 && lf !== o && lf < 100 && Math.abs(blobs[lf][1] - blobs[o][1]) < 0.2 && blobs[lf][0] < blobs[o][0]));
        let k = v > 0.86 ? 5 : v > 0.64 ? 4 : v > 0.42 ? 3 : v > 0.24 ? 2 : 1;
        if (sep) k = Math.max(1, Math.min(k, 2));
        if (k >= 4 && v > 0.8 && h01(x >> 1, y, seed + 29) > 0.97) k = 6;
        can.set(x, y, leaf[k]);
      }
    }
    can.outline(leaf[0]);
    b.blit(can, 0, 0);
    if (jungle) {
      // 從樹冠下緣垂下的藤蔓（成束、帶小葉）
      const vines = new Bmp(W, H);
      const strands = 5 + (r > 5 ? 2 : 0);
      for (let k = 0; k < strands; k++) {
        const vx = Math.round(ccx - rx * 0.85 + (rx * 1.7 * (k + 0.5)) / strands + (h01(k, 31, seed) - 0.5) * 6);
        let vy = 0;
        while (vy < H - 1 && owner[vy * W + vx] < 0) vy++;
        while (vy < H - 1 && owner[(vy + 1) * W + vx] >= 0) vy++;
        const len = 10 + Math.floor(h01(k, 33, seed) * 26);
        for (let i = 1; i <= len && vy + i < H - 6; i++) {
          const x = vx + (Math.floor((i + k * 2) / 6) % 2);
          vines.set(x, vy + i, leaf[3]);
          if (i % 5 === 2) { vines.set(x - 1, vy + i, leaf[4]); vines.set(x + 1, vy + i + 1, leaf[2]); }
        }
      }
      vines.outline(leaf[0]);
      b.blit(vines, 0, 0);
    }
  }
  return { b, ax: cx, ay: H };
}

/** 雪原松樹：細樹幹 + 層層三角形樹冠，每層上緣積雪 */
function paintPine(h: number, r: number, grounded: boolean): { b: Bmp; ax: number; ay: number } {
  const bark = PAL.bark, leaf = TREE_LEAF[3];
  const snow = ramp('#7f9cc4', '#94c8ee', '#cceaf8', '#ffffff');
  const trunkPx = h * 16, crownTop = Math.max(4, r * 16 - 4);
  const W = Math.max(40, (2 * r + 2) * 14), H = trunkPx + crownTop + 4;
  const b = new Bmp(W, H), cx = W / 2, bottom = H, seed = 300 + h * 7 + r;
  // 樹幹（只有下段露出）
  const trunk = new Bmp(W, H);
  for (let y = bottom - trunkPx; y < bottom; y++) {
    const db = bottom - 1 - y;
    let wv = 6 - 2 * ((bottom - y) / trunkPx);
    if (grounded && db < 4) wv += (4 - db) * 0.8;
    const xl = Math.round(cx - wv / 2), xr = Math.round(cx + wv / 2);
    for (let x = xl; x < xr; x++) trunk.set(x, y, bark[x === xl ? 5 : x === xr - 1 ? 2 : 3]);
  }
  trunk.outline(INK);
  b.blit(trunk, 0, 0);
  // 樹冠：從頂端到樹幹 75% 高度，分 n 層
  const can = new Bmp(W, H);
  const top = 2, base = bottom - Math.round(trunkPx * 0.22);
  const tiers = 3 + Math.floor(h / 4), span = base - top;
  const maxHalf = W / 2 - 3;
  for (let k = 0; k < tiers; k++) {
    const t0 = top + Math.round((span * k) / tiers) - (k ? 4 : 0);
    const t1 = top + Math.round((span * (k + 1)) / tiers);
    const half = 5 + ((maxHalf - 5) * (k + 1)) / tiers;
    for (let y = t0; y < t1; y++) {
      const f = (y - t0 + 1) / (t1 - t0);
      let hw = half * (0.35 + 0.65 * f);
      if (y >= t1 - 2) hw -= (Math.floor(h01(y, k, seed) * 3) % 2) * 2; // 鋸齒下緣
      for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
        const u = (x - (cx - hw)) / (hw * 2);
        let c = u < 0.3 ? leaf[3] : u > 0.72 ? leaf[1] : leaf[2];
        if (y >= t1 - 2) c = leaf[1];
        can.set(x, y, c);
      }
    }
  }
  // 積雪：每欄由上往下第一個葉像素 + 其下 1–2 px（左側較厚）
  for (let x = 0; x < W; x++) {
    let first = true, run = 0;
    for (let y = 0; y < H; y++) {
      const on = can.on(x, y);
      if (!on) { first = true; run = 0; continue; }
      if (first) { run = x < cx ? 3 : 2; first = false; }
      if (run > 0) { can.set(x, y, run === (x < cx ? 3 : 2) ? snow[3] : run === 1 ? snow[1] : snow[2]); run--; }
    }
  }
  can.outline(hex('#0c0a12'));
  b.blit(can, 0, 0);
  return { b, ax: cx, ay: H };
}

// ── 對外 ───────────────────────────────────────────────
export interface HeldDraw { canvas: HTMLCanvasElement; ox: number; oy: number; }

export class Sprites {
  /** 身體影格表：FRAMES × (FW×FH) */
  readonly body: HTMLCanvasElement;
  /** 每格身體影格的垂直位移（肩膀跟著動） */
  readonly bodyDy: number[];
  readonly torches: HTMLCanvasElement[] = [];
  /** 壁掛火把：貼左牆 / 貼右牆（右牆 = 左牆鏡像） */
  readonly torchesLeft: HTMLCanvasElement[] = [];
  readonly torchesRight: HTMLCanvasElement[] = [];
  readonly glow: HTMLCanvasElement;
  /** 螢光菇 / 水晶的冷色小光暈 */
  readonly coolGlow: HTMLCanvasElement;
  private armPrep = new Map<string, Bmp>();
  private armCache = new Map<string, HTMLCanvasElement>();
  private treeCache = new Map<string, TreeSprite>();
  private miniCache = new Map<string, HTMLCanvasElement>();

  private sheets = new Map<string, { canvas: HTMLCanvasElement; dy: number[] }>();
  private weaponCache = new Map<string, HTMLCanvasElement>();
  private weaponPrep = new Map<string, Bmp>();

  constructor(private readonly iconBmp: (item: ItemId) => Bmp, readonly look: Look = DEFAULT_LOOK) {
    const s = this.bodySheet(NO_ARMOR);
    this.body = s.canvas;
    this.bodyDy = s.dy;
    for (let f = 0; f < FLAME_FRAMES; f++) {
      this.torches.push(toCanvas(torchBmp(f)) as HTMLCanvasElement);
      const wb = torchBmp(f, 'wall');
      this.torchesLeft.push(toCanvas(wb) as HTMLCanvasElement);
      const mb = new Bmp(wb.w, wb.h);
      mb.blit(wb, 0, 0, true);
      this.torchesRight.push(toCanvas(mb) as HTMLCanvasElement);
    }
    this.glow = toCanvas(glowBmp(), null, true) as HTMLCanvasElement;
    this.coolGlow = toCanvas(glowBmp(12, [10, 30, 44], [4, 14, 24]), null, true) as HTMLCanvasElement;
  }

  /** 身體影格表（依穿的防具烘焙、快取） */
  bodySheet(armor: ArmorLook): { canvas: HTMLCanvasElement; dy: number[] } {
    const key = armorKey(armor);
    let s = this.sheets.get(key);
    if (s) return s;
    const sheet = new Bmp(FW * FRAMES, FH);
    const dy: number[] = [];
    const add = (i: number, kind: 'idle' | 'walk' | 'jump' | 'fall', f: number): void => {
      const r = bodyFrame(this.look, kind, f, armor);
      sheet.blit(r.b, i * FW, 0);
      dy[i] = r.dy;
    };
    for (let f = 0; f < IDLE_FRAMES; f++) add(FRAME.IDLE + f, 'idle', f);
    for (let f = 0; f < WALK_FRAMES; f++) add(FRAME.WALK + f, 'walk', f);
    add(FRAME.JUMP, 'jump', 0);
    add(FRAME.FALL, 'fall', 0);
    s = { canvas: toCanvas(sheet) as HTMLCanvasElement, dy };
    this.sheets.set(key, s);
    return s;
  }

  shoulder(back: boolean): { x: number; y: number } { return back ? SHOULDER_BACK : SHOULDER_FRONT; }

  /** 旋轉後的手臂（含鎬 / 劍）；bodySet = 胸甲套裝（袖子顏色）。回傳 canvas 與「軸心在 canvas 中的位置」 */
  arm(back: boolean, pick: ItemId | null, deg: number, bodySet: ArmorSetId | null = null, blade: ItemId | null = null): HeldDraw {
    const idx = angleIndex(deg, ARM_STEPS);
    const pk = `${back ? 1 : 0}:${pick ?? ''}:${bodySet ?? ''}:${blade ?? ''}`;
    const key = `${pk}:${idx}`;
    const size = 64;
    let c = this.armCache.get(key);
    if (!c) {
      let prep = this.armPrep.get(pk);
      if (!prep) { prep = rotPrep(armBmp(this.look, back, pick, bodySet, blade)); this.armPrep.set(pk, prep); }
      const rad = -(idx / ARM_STEPS) * Math.PI * 2;
      c = toCanvas(rotate(prep, PIV.x, PIV.y, rad, size)) as HTMLCanvasElement;
      this.armCache.set(key, c);
    }
    return { canvas: c, ox: size / 2, oy: size / 2 };
  }

  /**
   * 手持武器 / 投射物圖示旋轉到世界角度 rad（0 = 右、順時針為正）。base = 圖示本身朝向的角度
   * （劍 / 矛 / 箭的圖示朝右上 = −π/4，弓朝左上 = −3π/4）。canvas 中心 = 圖示中心。
   */
  rotatedIcon(item: ItemId, rad: number, base: number): HTMLCanvasElement {
    const steps = 32;
    const idx = ((Math.round(((rad - base) / (Math.PI * 2)) * steps) % steps) + steps) % steps;
    const key = `${item}:${idx}`;
    let c = this.weaponCache.get(key);
    if (!c) {
      let prep = this.weaponPrep.get(item);
      if (!prep) { prep = rotPrep(this.iconBmp(item)); this.weaponPrep.set(item, prep); }
      c = toCanvas(rotate(prep, 8, 8, (idx / steps) * Math.PI * 2, 24)) as HTMLCanvasElement;
      this.weaponCache.set(key, c);
    }
    return c;
  }

  /** 手到肩的距離（px），手持物件定位用 */
  readonly handReach = 10;

  mini(item: ItemId): HTMLCanvasElement {
    let c = this.miniCache.get(item);
    if (!c) { c = toCanvas(miniIcon(this.iconBmp(item))) as HTMLCanvasElement; this.miniCache.set(item, c); }
    return c;
  }

  tree(variant: number, h: number, r: number, grounded: boolean): TreeSprite {
    const key = `${variant}:${h}:${r}:${grounded ? 1 : 0}`;
    let t = this.treeCache.get(key);
    if (!t) {
      const p = variant === 3 ? paintPine(h, r, grounded) : paintTree(variant, h, r, grounded);
      t = { canvas: toCanvas(p.b) as HTMLCanvasElement, ax: p.ax, ay: p.ay };
      this.treeCache.set(key, t);
    }
    return t;
  }
}

export { mix };
