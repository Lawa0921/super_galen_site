// gen2.lock.test.ts — gen2 每個版本的固定種子輸出雜湊鎖。
// 版本已發佈（凍結）後輸出不得再變。M1 期間 GEN2_VERSION = 0 尚未發佈（unfrozen），v0 的雜湊可以重錄；
// M2 把 GEN2_VERSION 改成 1 時，就是在這裡重錄並從此凍結（新增 v1 的雜湊、v0 之後視為發佈版）。
import { describe, it, expect } from 'vitest';
import { Gen2Source, GEN2_VERSION, GEN2_MIN_VERSION } from './index';
import { fillCol, bytes } from './testUtil';
import { fnv1a } from '../../net/codec';

const GEN2_HASHES: Record<number, number> = { 0: 2630624027 };
// 101：家鄉的小屋（M2a Task 7 起家鄉表層槽多半是錨點，原本 105 的遺跡沒了）；8：家鄉地城的入口塔與塔下的房間（M2a Task 8）；
// 57：第一座村莊的委託板與廣場、26：第一座地廳的礦車（M2a Task 9）；Task 10：家鄉的礦坑密室錨點換了槽，101 的小屋沒了 → 118（另一間小屋），
// 16：第一座空島、107：有密室的礦坑；Task 11：118 的小屋讓給蜂巢錨點（118 現在是蜂巢 + 水晶洞），加 91（家鄉的蘑菇林）與 154（外圍大陸的小屋）；
// Task 14：16 也有雪原 / 沙漠石室，加 19（坑道底藏物）、35（熔岩祭壇）、59（有石碑的小屋錨點）、79（出生點石碑）、80（地下湖錨點的石台）、
// 95（空島：空島避開小屋 / 石室的槽後換了位置，16 不再有空島）；
// Task 18：荒野大陸的大東西（村莊 / 小地城 / 地廳）與隱士小屋錨點、第一片東 / 西大陸不再有霧竹（v0 只有荒野）→ 外圍欄（131 起）改變，家鄉欄不變；
// Task 19：小點位（26 的帳篷、118 的石堆）與海點偏移收到 ± 20（海上的島 / 沉船 / 漂流箱換了位置）；家鄉其他藍圖與小點位外框以外的家鄉欄不變
// Task 20：海槽的點改成 沉船 30% / 漂流箱 30% / 珊瑚礁 20% / 海底遺跡 20%、有建物的島（-4 現在是海底遺跡）；加 135（東側第一道海的隱士島）。
// 這個種子前 8 道海沒有沉船 / 漂流箱——M1 沉船的形狀改由 islands.test 的 SHIPWRECK_HASH 直接釘住；家鄉欄不變（Task 20 報告附實測）
const COLS = [-300, -40, -8, -4, -1, 0, 8, 16, 19, 26, 30, 35, 57, 59, 65, 79, 80, 91, 95, 100, 107, 118, 131, 132, 135, 140, 154, 160, 220, 400];

describe('gen2 版本雜湊鎖', () => {
  for (let v = GEN2_MIN_VERSION; v <= GEN2_VERSION; v++) {
    it(`gen2 v${v} 區塊雜湊`, () => {
      const src = new Gen2Source('gen2-lock', { latestVer: v });
      let h = 0x811c9dc5;
      for (const cx of COLS) h = fnv1a(bytes(fillCol(src, cx)), h);
      expect(h).toBe(GEN2_HASHES[v]);
    });
  }
  it('雜湊的欄涵蓋海上（沉船 / 浮箱 / 珊瑚礁 / 海底遺跡之一，加上有建物的島）與陸上結構（小屋或遺跡）', () => {
    const src = new Gen2Source('gen2-lock');
    const kinds = new Set<string>();
    for (const cx of COLS) for (const b of src.blueprints.overlapping(cx * 32, cx * 32 + 32)) kinds.add(b.kind);
    expect([...kinds].some((k) => k === 'shipwreck' || k === 'crate' || k === 'reef' || k === 'sea_ruin'), [...kinds].join()).toBe(true);
    expect(kinds.has('island'), [...kinds].join()).toBe(true);
    expect([...kinds].some((k) => k === 'cabin' || k === 'ruin'), [...kinds].join()).toBe(true);
    expect(kinds.has('dungeon'), [...kinds].join()).toBe(true);
    expect(kinds.has('village'), [...kinds].join()).toBe(true); expect(kinds.has('hall'), [...kinds].join()).toBe(true);
    expect(kinds.has('mineshaft'), [...kinds].join()).toBe(true); expect(kinds.has('sky_island'), [...kinds].join()).toBe(true);
    for (const k of ['mushroom_biome', 'crystal_cave', 'hive']) expect(kinds.has(k), [...kinds].join()).toBe(true);
    for (const k of ['alcove', 'shaft_cache', 'molten_shrine', 'spawn_tablet', 'cave_lake', 'minor']) expect(kinds.has(k), [...kinds].join()).toBe(true);
  });
  it('每個版本都有雜湊', () => {
    for (let v = GEN2_MIN_VERSION; v <= GEN2_VERSION; v++) expect(GEN2_HASHES[v]).toBeTypeOf('number');
  });
});
