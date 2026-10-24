// genCheck.ts — 讀檔 / 匯入 / 連線共用的生成器版本比對（純函式，不必生成世界）。
// 規則（spec §5：版本不符時拒絕或升級，絕不靜默用目前的生成器疊在舊改動上）：
//   · genVersion 7（舊生成器）：outerGen 沒有或 = OUTER_GEN_VERSION（外圍 v1）；比 v1 新 = newer（fix round 1 裁決：
//     推翻計畫真值表的 newer: false——外圍生成器較新的存檔要請玩家更新，不是說它是舊版）。
//   · genVersion 8（gen2）：無限世界（bounds = 'infinite'）、有 gen2 欄位、outerGen 與每個地塊鎖的 ver 都在
//     [GEN2_MIN_VERSION, GEN2_VERSION]；超過上限 = 較新版本（newer：請玩家更新遊戲）。
//     烘焙世界（gen2.bake）另外要 bake.v1 = OUTER_GEN_VERSION（接縫內的舊外圍由 v1 即時生成）；比 v1 新 = newer。
//   · 其他版本：format ≤ 5 的 COMPAT_GEN 可遷移；allowGenMismatch（測試用）放行；比 8 新 = newer。
import { GEN_VERSION, GEN_VERSION_V2 } from '../engine/constants';
import { OUTER_GEN_VERSION } from '../engine/legacy/chunkgen/index';
import { GEN2_MIN_VERSION, GEN2_VERSION } from '../engine/gen2';
import type { Gen2Save } from './serialize';

/** 可以遷移的舊生成器版本（format ≤ 5 的存檔）：v4 → v5（差異見 serialize.ts 檔頭） */
export const COMPAT_GEN: readonly number[] = [4];

export type GenBlock = { error: 'gen_version'; saveGenVersion: number; newer: boolean; message: string };
export interface GenHeader { format: number; genVersion: number; outerGen?: number; bounds?: 'infinite'; gen2?: Gen2Save }

const block = (saveGenVersion: number, newer: boolean, message: string): GenBlock => ({ error: 'gen_version', saveGenVersion, newer, message });

/** 存檔 header 的生成器版本能不能用目前的程式讀；不能 → GenBlock（newer = 存檔比程式新），能 → null */
export function genBlocker(h: GenHeader, opts: { allowGenMismatch?: boolean } = {}): GenBlock | null {
  const v = h.genVersion;
  if (v === GEN_VERSION) {
    if (h.outerGen !== undefined && h.outerGen !== OUTER_GEN_VERSION) {
      return block(v, h.outerGen > OUTER_GEN_VERSION, `save outer generator v${h.outerGen}, current outer generator v${OUTER_GEN_VERSION}`);
    }
    return null;
  }
  if (v === GEN_VERSION_V2) {
    if (h.bounds !== 'infinite') return block(v, false, 'gen2 save is not an infinite world');
    if (!h.gen2) return block(v, false, 'gen2 save has no lock table');
    // 每個版本號都要在支援範圍內；任一個比上限新 → newer（請更新），否則（太舊 / 缺）→ 舊版
    const vers = [h.outerGen, ...h.gen2.locks.map((l) => l[2])];
    const known = vers.filter((x): x is number => x !== undefined);
    const top = Math.max(...known);
    if (top > GEN2_VERSION) return block(v, true, `save gen2 v${top}, current gen2 v${GEN2_VERSION}`);
    const v1 = h.gen2.bake?.v1;
    if (v1 !== undefined && v1 !== OUTER_GEN_VERSION) {
      return block(v, v1 > OUTER_GEN_VERSION, `baked save outer generator v${v1}, current outer generator v${OUTER_GEN_VERSION}`);
    }
    if (known.length < vers.length || known.some((x) => x < GEN2_MIN_VERSION)) {
      return block(v, false, `save gen2 version below v${GEN2_MIN_VERSION} or missing`);
    }
    return null;
  }
  const migrate = h.format <= 5 && COMPAT_GEN.includes(v);
  if (migrate || opts.allowGenMismatch) return null;
  return block(v, v > GEN_VERSION_V2, `save generated with v${v}, current generator v${GEN_VERSION} / v${GEN_VERSION_V2}`);
}
