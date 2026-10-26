// cultures.ts — gen2 文化池（依版面版本）與各文化的命名池（M1 只放名字）。
// 文化池：每片大陸（鎖表沒存文化的）從 poolFor(ver) 排除上一片的文化後均勻挑；null = 荒野。新增文化 = 在新版本號加一組池，不改版面演算法。
import type { CultureId } from '../regionInfo';

export interface CultureDef {
  // 顯示名稱
  name: string;
  // 地區名前綴（地區名 = prefixes[h] + suffixes[h]）
  prefixes: readonly string[];
  suffixes: readonly string[];
}

export const CULTURES: Readonly<Record<CultureId, CultureDef>> = {
  mistbamboo: {
    name: '霧竹之國',
    prefixes: ['雲隱', '白霧', '竹', '青嵐', '月影', '鳴神', '朝霞', '松風'],
    suffixes: ['山', '谷', '之里'],
  },
};

// 版面版本 → 該版起用的文化池（null = 荒野）。v0（以及 M2b 凍結的 v1）只有荒野（M2a Task 18、spec §4.1 2026-10-24 修訂、Q14）：
// 霧竹之國的指派（離家最近、尚未進入過的那片大陸，ver ≥ 2）是 M4 的工作；鎖表裡已存的文化照舊尊重（layout.ts 的 locked 那一支）
export const CULTURE_POOL: Readonly<Record<number, readonly (CultureId | null)[]>> = { 0: [null] };

// 取版本號 ≤ ver 的最新一組文化池
export function poolFor(ver: number): readonly (CultureId | null)[] {
  let best = -1;
  for (const k of Object.keys(CULTURE_POOL)) { const v = Number(k); if (v <= ver && v > best) best = v; }
  if (best < 0) throw new RangeError(`no culture pool for ver ${ver}`);
  return CULTURE_POOL[best];
}
