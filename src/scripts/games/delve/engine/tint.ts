// tint.ts — 時裝物品的實例顏色：[主色, 副色]（CLOTH_COLORS 的 index），存在物品那一格上、跟著物品走。
//   只有時裝（有 vanity 定義的物品）能帶；沒有 tint = 該款式的原色（defaultTint）。
//   帽子 / 背飾的原色表要和 render/avatarGear.ts 的畫法一致（沒有 tint 時畫出來和以前一模一樣）。
import { ITEMS, type ItemId } from './items';
import { CLOTH_COLORS, OUTFITS } from './appearance';

/** [主色, 副色]：CLOTH_COLORS 的 index */
export type Tint = [number, number];

/** 這件物品能不能帶顏色（= 是時裝） */
export function isTintable(item: ItemId): boolean { return Boolean(ITEMS[item]?.vanity); }

/** 合法的 tint（兩個 CLOTH_COLORS 範圍內的整數）→ 新陣列；否則 null */
export function validTint(raw: unknown): Tint | null {
  if (!Array.isArray(raw) || raw.length !== 2) return null;
  const n = CLOTH_COLORS.length;
  for (const v of raw) if (!Number.isInteger(v) || v < 0 || v >= n) return null;
  return [raw[0] as number, raw[1] as number];
}
export function cloneTint(t: Tint): Tint { return [t[0], t[1]]; }
/** 快取 / 重畫簽章用（沒有 tint = 空字串） */
export function tintKey(t: Tint | undefined): string { return t ? `${t[0]}.${t[1]}` : ''; }

/** 帽子的原色（只有主色的款式：副色 = 主色）；沒列的 = 沒有可換色的布料（礦工盔 / 花冠） */
const HAT_TINT: Record<string, Tint> = { straw: [8, 3], witch: [10, 11], beret: [3, 3], maid: [0, 1] };
/** 背飾的原色；羽翼（白羽）沒有布料 */
const BACK_TINT: Record<string, Tint> = { cape: [3, 8], feathers: [6, 11], bow: [4, 4] };

/** 一個 look（'outfit:<id>' / 'hat:<id>' / 'back:<id>'）的原色；沒有可換色的布料 → null */
export function defaultTint(look: string): Tint | null {
  const [kind, id] = look.split(':');
  if (kind === 'outfit') {
    const o = OUTFITS.find((q) => q.id === id);
    return o ? [o.colors[0], o.colors[1]] : null;
  }
  const t = kind === 'hat' ? HAT_TINT[id] : kind === 'back' ? BACK_TINT[id] : undefined;
  return t ? cloneTint(t) : null;
}
