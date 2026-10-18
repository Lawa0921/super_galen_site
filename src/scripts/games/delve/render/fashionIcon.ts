// fashionIcon.ts — 時裝道具的 16×16 圖示：直接用紙娃娃上的那一件（pieceBmp）裁切置中，太大就最近鄰縮小一半。
import { Bmp } from './pixel';
import { ITEMS, type ItemId } from '../engine/items';
import { DEFAULT_APPEARANCE } from '../engine/appearance';
import { plainLook, type DollLook } from '../engine/doll';
import { pieceBmp } from './avatarArt';

/** 把內容的外框裁出來、置中放進 size×size（放不下就每 2 格取 1 格） */
export function fitIcon(src: Bmp, size = 16): Bmp {
  let x0 = src.w, y0 = src.h, x1 = -1, y1 = -1;
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) if (src.on(x, y)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const out = new Bmp(size, size);
  if (x1 < 0) return out;
  const w = x1 - x0 + 1, h = y1 - y0 + 1, k = w > size || h > size ? 2 : 1;
  const ow = Math.ceil(w / k), oh = Math.ceil(h / k);
  const ox = Math.floor((size - ow) / 2), oy = Math.floor((size - oh) / 2);
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
    // 縮小時優先取不透明的那格（細線不會消失）
    let v = 0;
    for (let j = 0; j < k && !v; j++) for (let i = 0; i < k && !v; i++) v = src.raw(x0 + x * k + i, y0 + y * k + j);
    if (v >>> 24) out.setRaw(ox + x, oy + y, v);
  }
  return out;
}

/** 時裝道具的圖示；不是時裝 → null */
export function fashionIcon(item: ItemId): Bmp | null {
  const v = ITEMS[item]?.vanity;
  if (!v) return null;
  const piece = { look: v.look, rarity: 0, plus: 0, elem: null };
  const l: DollLook = { ...plainLook(DEFAULT_APPEARANCE), [v.slot]: piece };
  return fitIcon(pieceBmp(l, v.slot));
}
