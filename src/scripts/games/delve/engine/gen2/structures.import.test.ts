// structures.import.test.ts — 結構檔先被 import（blueprint.ts 還沒載入）也能用：structures/*.ts 只依賴 bpcore.ts，沒有循環依賴。
// 這個檔第一個 import 必須是 structures/cabin（獨立檔案 = 獨立的模組圖）。
import { buildCabin } from './structures/cabin';
import { buildRuin } from './structures/ruin';
import { describe, it, expect } from 'vitest';
import { Gen2Source } from './index';
import { BlueprintIndex, slotOf, BP_SURFACE, BP_UNDER } from './blueprint';
import { seedInt } from '../noise';

describe('gen2 structures 先 import', () => {
  it('buildCabin / buildRuin 在 blueprint.ts 之前載入也建得出與 BlueprintIndex 相同的藍圖', () => {
    expect(typeof buildCabin).toBe('function'); expect(typeof buildRuin).toBe('function');
    const g = new Gen2Source('imp'), all = new BlueprintIndex('imp', g.layout, g.profile).overlapping(4200, 30_000);
    const cab = all.find((b) => b.kind === 'cabin')!, ruin = all.find((b) => b.kind === 'ruin')!;
    for (const [b, build, layer] of [[cab, buildCabin, BP_UNDER], [ruin, buildRuin, BP_SURFACE]] as const) {
      const q = slotOf(b.id, g.layout);
      expect(q.layer).toBe(layer);
      const c = { seed: 'imp', s: seedInt('imp', 'g2-bp'), id: b.id, slotX0: q.x0, slotX1: q.x1, region: q.region, profile: g.profile, ver: 0 };
      expect(build(c)).toEqual(b);
    }
  });
});
