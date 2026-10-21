// mapping.ts — 純輸入映射（無 DOM）：鍵盤代碼 → 動作、滾輪換格、虛擬搖桿數學、觸控意圖、螢幕 → tile。
import { ITEMS } from '../engine/items';
import { T, isInteractive } from '../engine/tiles';
import type { Stack } from '../engine/inventory';
import { HOTBAR_SIZE, TILE_SIZE } from '../engine/constants';

export type KeyAction = 'left' | 'right' | 'jump' | 'up' | 'down' | 'inventory' | 'menu' | 'zoomIn' | 'zoomOut'
  | 'map' | 'minimap' | 'journal' | 'housing' | 'settle' | 'quests' | 'talk' | 'toss';

const KEYS: Record<string, KeyAction> = {
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'jump', KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyE: 'inventory', KeyG: 'toss',
  KeyM: 'map', KeyN: 'minimap', KeyJ: 'journal', KeyH: 'housing', KeyB: 'settle', KeyL: 'quests', KeyT: 'talk',
  Escape: 'menu',
  Equal: 'zoomIn', NumpadAdd: 'zoomIn',
  Minus: 'zoomOut', NumpadSubtract: 'zoomOut',
};

export function keyAction(code: string): KeyAction | null {
  return KEYS[code] ?? null;
}

/** Digit1..9 → 0..8、Digit0 → 9（Numpad 同理）；其他鍵 null。 */
export function slotForKey(code: string): number | null {
  const m = /^(?:Digit|Numpad)([0-9])$/.exec(code);
  if (!m) return null;
  const d = Number(m[1]);
  return d === 0 ? 9 : d - 1;
}

/** 滾輪：deltaY > 0 往右一格、< 0 往左一格，循環。 */
export function wheelSlot(current: number, deltaY: number, size: number = HOTBAR_SIZE): number {
  if (deltaY === 0 || !Number.isFinite(deltaY)) return current;
  const d = deltaY > 0 ? 1 : -1;
  return (((current + d) % size) + size) % size;
}

export function moveAxis(left: boolean, right: boolean): -1 | 0 | 1 {
  return ((right ? 1 : 0) - (left ? 1 : 0)) as -1 | 0 | 1;
}

export interface JoystickResult {
  /** 正規化 -1..1 */
  x: number; y: number;
  /** knob 在畫面上的偏移（px，夾在半徑內） */
  knobX: number; knobY: number;
  moveX: -1 | 0 | 1;
  /** 往上推很多（可當作跳） */
  up: boolean;
  /** 往下推很多（穿過平台） */
  down: boolean;
}

/** 由觸點相對搖桿中心的位移計算搖桿狀態。dead 為死區比例。 */
export function joystick(dx: number, dy: number, radius: number, dead = 0.25): JoystickResult {
  const len = Math.hypot(dx, dy);
  const k = len > radius && len > 0 ? radius / len : 1;
  const knobX = dx * k, knobY = dy * k;
  const x = knobX / radius, y = knobY / radius;
  const moveX: -1 | 0 | 1 = Math.abs(x) < dead ? 0 : x > 0 ? 1 : -1;
  return { x, y, knobX, knobY, moveX, up: y < -0.7, down: y > 0.7 };
}

/** 滑鼠 PointerEvent.buttons 位元遮罩 → 挖（左鍵 1）/ 放（右鍵 2）。可同時按（和弦）。 */
export function mouseIntent(buttons: number): { mine: boolean; use: boolean } {
  return { mine: (buttons & 1) !== 0, use: (buttons & 2) !== 0 };
}

/** 觸控點格子時：點到箱子 / 門 / 古碑 → use（互動）；手持可放置的方塊 → place，否則 mine。 */
export function touchIntent(held: Stack | null, aimTile: number = T.AIR, npc = false): 'place' | 'mine' | 'use' {
  if (npc || aimTile === T.CHEST || isInteractive(aimTile)) return 'use';
  if (held && ITEMS[held.item]?.use) return 'use';
  if (held && ITEMS[held.item]?.place !== undefined) return 'place';
  return 'mine';
}

/** 螢幕（CSS px，相對 canvas 左上）→ tile 座標。 */
export function screenToTile(sx: number, sy: number, camX: number, camY: number, tile: number = TILE_SIZE): { x: number; y: number } {
  return { x: Math.floor((sx + camX) / tile), y: Math.floor((sy + camY) / tile) };
}
