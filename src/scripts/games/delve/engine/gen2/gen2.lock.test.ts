// gen2.lock.test.ts — gen2 每個版本的固定種子輸出雜湊鎖。
// 版本已發佈（凍結）後輸出不得再變。M1 期間 GEN2_VERSION = 0 尚未發佈（unfrozen），v0 的雜湊可以重錄；
// M2 把 GEN2_VERSION 改成 1 時，就是在這裡重錄並從此凍結（新增 v1 的雜湊、v0 之後視為發佈版）。
import { describe, it, expect } from 'vitest';
import { Gen2Source, GEN2_VERSION, GEN2_MIN_VERSION } from './index';
import { fillCol, bytes } from './testUtil';
import { fnv1a } from '../../net/codec';
import { homeSites } from './home';

const GEN2_HASHES: Record<number, number> = { 0: 1968941062 };
// 101：家鄉的小屋（M2a Task 7 起家鄉表層槽多半是錨點，原本 105 的遺跡沒了）；8：家鄉地城的入口塔與塔下的房間（M2a Task 8）；
// 57：第一座村莊的委託板與廣場、26：第一座地廳的礦車（M2a Task 9）；Task 10：家鄉的礦坑密室錨點換了槽，101 的小屋沒了 → 118（另一間小屋），
// 16：第一座空島、107：有密室的礦坑；Task 11：118 的小屋讓給蜂巢錨點（118 現在是蜂巢 + 水晶洞），加 91（家鄉的蘑菇林）與 154（外圍大陸的小屋）；
// Task 14：16 也有雪原 / 沙漠石室，加 19（坑道底藏物）、35（熔岩祭壇）、59（有石碑的小屋錨點）、79（出生點石碑）、80（地下湖錨點的石台）、
// 95（空島：空島避開小屋 / 石室的槽後換了位置，16 不再有空島）；
// Task 18：荒野大陸的大東西（村莊 / 小地城 / 地廳）與隱士小屋錨點、第一片東 / 西大陸不再有霧竹（v0 只有荒野）→ 外圍欄（131 起）改變，家鄉欄不變；
// Task 19：小點位（26 的帳篷、118 的石堆）與海點偏移收到 ± 20（海上的島 / 沉船 / 漂流箱換了位置）；家鄉其他藍圖與小點位外框以外的家鄉欄不變
// Task 20：海槽的點改成 沉船 30% / 漂流箱 30% / 珊瑚礁 20% / 海底遺跡 20%、有建物的島（-4 現在是海底遺跡）；加 135（東側第一道海的隱士島）。
// 這個種子前 8 道海沒有沉船 / 漂流箱——修正回合 1 加 -661（西側第 11 道海的沉船）與 671（東側第 11 道海的漂流箱），fill 的沉船 / 漂流箱路徑也進雜湊
// （M1 沉船的形狀另由 islands.test 的 SHIPWRECK_HASH 直接釘住）；家鄉欄不變（Task 20 報告附實測）
// Task 21：小點位層四捨五入切槽、偏好區只看槽中段、含坑道的槽也放（出生點石碑從 79 移到 74 → 加 74）；家鄉缺大東西的空隙補地廳；
// 大陸大東西的退讓與欠債（種類比例）；外圍礦坑一律通地表；村莊 / 隱士小屋依生態鋪地表；家鄉後備豎井與空島繩梯的保證（現有種子不觸發）。
// 鎖欄明列家鄉地城的入口塔（DUNGEON_COL：入口 x = 286）與第一座村莊（VILLAGE_COL：委託板 x = 1849），下面的守衛斷言釘住它們真的與藍圖相交
const DUNGEON_COL = 8, VILLAGE_COL = 57;
const COLS = [-661, -300, -40, -8, -4, -1, 0, DUNGEON_COL, 16, 19, 26, 30, 35, VILLAGE_COL, 59, 65, 74, 79, 80, 91, 95, 100, 107, 118, 131, 132, 135, 140, 154, 160, 220, 400, 671];
// 一定要和沉船 / 漂流箱藍圖相交的欄（下面的守衛斷言）
const WRECK_COL = -661, CRATE_COL = 671;

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
  it('守衛：WRECK_COL 與沉船藍圖相交、CRATE_COL 與漂流箱藍圖相交（換種子 / 改海點規則時這兩欄要跟著換）', () => {
    const src = new Gen2Source('gen2-lock'), at = (cx: number): string[] => src.blueprints.overlapping(cx * 32, cx * 32 + 32).map((b) => b.kind);
    expect(COLS).toContain(WRECK_COL); expect(COLS).toContain(CRATE_COL);
    expect(at(WRECK_COL)).toContain('shipwreck'); expect(at(CRATE_COL)).toContain('crate');
  }, 30_000);
  it('守衛：DUNGEON_COL 與家鄉地城的入口塔相交、VILLAGE_COL 與第一座村莊相交（Task 21；換種子 / 改家鄉錨點時這兩欄要跟著換）', () => {
    const src = new Gen2Source('gen2-lock'), sites = homeSites(src), at = (cx: number): string[] => src.blueprints.overlapping(cx * 32, cx * 32 + 32).map((b) => b.kind);
    const d = sites.find((q) => q.kind === 'dungeon'), v = sites.find((q) => q.kind === 'village');
    expect(d?.kind === 'dungeon' && d.info.entrance.x >> 5).toBe(DUNGEON_COL); expect(v?.kind === 'village' && v.info.board.x >> 5).toBe(VILLAGE_COL);
    expect(at(DUNGEON_COL)).toContain('dungeon'); expect(at(VILLAGE_COL)).toContain('village');
  }, 30_000);
  it('每個版本都有雜湊', () => {
    for (let v = GEN2_MIN_VERSION; v <= GEN2_VERSION; v++) expect(GEN2_HASHES[v]).toBeTypeOf('number');
  });
});
