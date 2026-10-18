// doll.ts — 紙娃娃的「看得見的樣子」（純資料，無 DOM）：由角色外觀 + 裝備欄 + 外觀欄算出每個部位畫什麼。
//   部位優先序：外觀欄（時裝或拿來當樣子的防具）> 防具（沒被隱藏）> null（= 客製化的基本服裝 / 髮飾）。
//   每件看得見的裝備帶稀有度 / 強化 / 元素詞條 → 渲染時加滾邊、寶石、閃光、元素點綴。
//   看得見的飾品：跳躍靴 / 疾行靴（換鞋）、輕羽墜（背上小翅膀）、甲殼小盾（背在背上）、墜飾（胸前）、腰間小物。
//   dollKey = 精靈快取 key（只含看得見的東西：換數值不重烘）。
import { appearanceKey, type Appearance } from './appearance';
import type { Equipment } from './equipment';
import type { Vanity } from './vanity';
import { ITEMS, type ItemId } from './items';
import type { Stack } from './inventory';
import type { AffixId } from './gear';

/** 合成順序（由後往前）。渲染：背飾 / 後髮 / 身體 / 腿 / 胸 在第一張，手臂 + 手持由渲染器畫，臉 / 前髮 / 頭飾 / 前飾品在第二張 */
export const DOLL_LAYERS = ['back', 'backHair', 'body', 'legs', 'chest', 'arms', 'held', 'face', 'frontHair', 'headgear', 'frontAcc'] as const;
export type DollLayer = typeof DOLL_LAYERS[number];

export type DollElem = 'fire' | 'ice' | 'poison' | 'light' | 'storm';
export interface DollPiece {
  /** 'armor:<套裝>' | 'outfit:<服裝>' | 'hat:<帽子>' | 'back:<背飾>' */
  look: string;
  rarity: number;
  plus: number;
  elem: DollElem | null;
}
export type DollFeet = 'jump' | 'swift';
export type DollNeck = 'night' | 'fang' | 'heart' | 'magma';
export type DollBelt = 'compass' | 'depth' | 'map' | 'magnet';
export interface DollLook {
  app: Appearance;
  head: DollPiece | null;
  body: DollPiece | null;
  legs: DollPiece | null;
  back: DollPiece | null;
  feet: DollFeet | null;
  neck: DollNeck | null;
  belt: DollBelt | null;
}

const ELEM_OF: Partial<Record<AffixId, DollElem>> = { blazing: 'fire', rime: 'ice', venom: 'poison', glow: 'light', stormcall: 'storm' };
const FEET: Partial<Record<ItemId, DollFeet>> = { jump_boots: 'jump', swift_boots: 'swift' };
const NECK: Partial<Record<ItemId, DollNeck>> = { night_amulet: 'night', fang_charm: 'fang', warden_heart: 'heart', magma_ward: 'magma' };
const BELT: Partial<Record<ItemId, DollBelt>> = { compass: 'compass', depth_meter: 'depth', explorer_map: 'map', magnet: 'magnet' };
const BACK_ACC: Partial<Record<ItemId, string>> = { feather_charm: 'back:feathers', chitin_buckler: 'back:buckler' };

/** 一格裝備 → 看得見的樣子（時裝 / 防具 / 背上的飾品）；不是穿戴物 → null */
export function pieceOf(st: Stack | null | undefined): DollPiece | null {
  if (!st) return null;
  const d = ITEMS[st.item];
  const look = d?.vanity?.look ?? (d?.armor ? `armor:${d.armor.set}` : BACK_ACC[st.item]);
  if (!look) return null;
  const g = st.gear;
  let elem: DollElem | null = null;
  for (const a of g?.affixes ?? []) { const e = ELEM_OF[a.id]; if (e) { elem = e; break; } }
  return { look, rarity: g?.rarity ?? 0, plus: g?.plus ?? 0, elem };
}

export function buildDollLook(app: Appearance, eq: Equipment, v: Vanity): DollLook {
  const part = (s: 'head' | 'body' | 'legs'): DollPiece | null => pieceOf(v.getStack(s)) ?? (v.hide[s] ? null : pieceOf(eq.getStack(s)));
  let feet: DollFeet | null = null, neck: DollNeck | null = null, belt: DollBelt | null = null, backAcc: DollPiece | null = null;
  for (const s of ['acc0', 'acc1', 'acc2', 'acc3', 'acc4'] as const) {
    const st = eq.getStack(s);
    if (!st) continue;
    feet ??= FEET[st.item] ?? null;
    neck ??= NECK[st.item] ?? null;
    belt ??= BELT[st.item] ?? null;
    if (!backAcc && BACK_ACC[st.item]) backAcc = pieceOf(st);
  }
  return { app, head: part('head'), body: part('body'), legs: part('legs'), back: pieceOf(v.getStack('back')) ?? backAcc, feet, neck, belt };
}

const pk = (p: DollPiece | null): string => (p ? `${p.look}/${p.rarity}/${p.plus}/${p.elem ?? ''}` : '-');
export function dollKey(l: DollLook): string {
  return [appearanceKey(l.app), pk(l.head), pk(l.body), pk(l.legs), pk(l.back), l.feet ?? '-', l.neck ?? '-', l.belt ?? '-'].join('|');
}
/** 只有外觀、什麼都沒穿 */
export function plainLook(app: Appearance): DollLook {
  return { app, head: null, body: null, legs: null, back: null, feet: null, neck: null, belt: null };
}
