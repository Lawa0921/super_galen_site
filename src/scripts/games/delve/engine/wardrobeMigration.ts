// wardrobeMigration.ts — 舊角色的時裝轉換（spec C6，純函式核心；套用層在 DelveGame.migrateWardrobe）。
//   舊角色檔（cformat 1）的外觀直接選服裝 / 頭飾 / 眼鏡；時裝物品化之後這些要變成物品，而且「看起來和轉換前一樣」：
//   - 服裝（非布衣）→ 上衣 + 下身兩件（OUTFIT_ITEMS），帶角色的主色 / 副色；頭飾（非無）→ 飾品物品（ACC_ITEMS），
//     帶外觀上畫它用的那個布色（accTintFromAppearance）；有戴眼鏡 → 眼鏡物品。
//   - 時裝欄那格空著、而且那個部位沒有露出的護甲 → 直接穿上；否則給背包（套用層：背包滿 → 掉在腳邊）。
//     繪製順序是時裝欄 > 護甲 > 基底服裝（engine/doll.ts），硬穿上會蓋掉原本露出的護甲。
//   - 頭飾 + 眼鏡都有：頭飾進飾品格、眼鏡進背包（飾品格一次一件）。
//   - 外觀改成布衣、沒有頭飾 / 眼鏡；主色 / 副色不動（布衣與雙馬尾髮圈等還在用它們）。
import { ACCESSORIES, OUTFITS, OUTFIT_PLAIN, type Appearance } from './appearance';
import { ACC_ITEMS, OUTFIT_ITEMS, type ItemId } from './items';
import { accTintFromAppearance, type Tint } from './tint';
import type { Stack } from './inventory';
import type { HideSlot, VanityJSON, VanitySlot } from './vanity';

/** 角色檔從這個版本（cformat）起，外觀上的服裝 / 頭飾 / 眼鏡已經轉成時裝物品；更舊的讀進遊戲時轉換一次 */
export const WARDROBE_CFORMAT = 2;

export interface WardrobePlan {
  /** 轉換後的外觀（布衣、沒有頭飾 / 眼鏡、主副色不變） */
  appearance: Appearance;
  /** 直接穿進時裝欄的 */
  equip: { slot: VanitySlot; stack: Stack }[];
  /** 給背包的（放不下由套用層掉在腳邊） */
  give: Stack[];
}

const stackOf = (item: ItemId, tint: Tint | null): Stack => (tint ? { item, count: 1, tint } : { item, count: 1 });

/**
 * app = 轉換前的外觀；vanity = 目前的時裝欄；equipVisible = 各部位是否有正在顯示的護甲（有護甲但設了隱藏 = false）。
 * 已經穿布衣、沒有頭飾 / 眼鏡 → 什麼都不發（equip / give 都空）。
 */
export function planWardrobeMigration(app: Appearance, vanity: VanityJSON, equipVisible: Record<HideSlot, boolean>): WardrobePlan {
  const equip: WardrobePlan['equip'] = [], give: Stack[] = [];
  const taken = new Set<VanitySlot>();
  const place = (slot: VanitySlot, st: Stack, blocked: boolean): void => {
    if (!blocked && vanity.slots[slot] === null && !taken.has(slot)) { equip.push({ slot, stack: st }); taken.add(slot); }
    else give.push(st);
  };
  const outfit = app.outfit === OUTFIT_PLAIN ? undefined : OUTFIT_ITEMS[OUTFITS[app.outfit]?.id ?? ''];
  if (outfit) {
    const tint: Tint = [app.color1, app.color2];
    place('body', stackOf(outfit[0], [tint[0], tint[1]]), equipVisible.body);
    place('legs', stackOf(outfit[1], [tint[0], tint[1]]), equipVisible.legs);
  }
  const accId = ACCESSORIES[app.acc]?.id;
  const accItem = accId && accId !== 'none' ? ACC_ITEMS[accId] : undefined;
  // 飾品格與頭盔 / 帽子的遮擋規則和外觀上的頭飾一樣（avatarHead），所以只看飾品格空不空
  if (accItem) place('acc', stackOf(accItem, accTintFromAppearance(accId!, app)), false);
  if (app.glasses) place('acc', stackOf(ACC_ITEMS.glasses, null), false);
  return { appearance: { ...app, outfit: OUTFIT_PLAIN, acc: 0, glasses: false }, equip, give };
}
