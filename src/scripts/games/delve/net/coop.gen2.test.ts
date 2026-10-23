// coop.gen2.test.ts — Task 18：連線帶生成器描述（Welcome.gen2）。gen2 客人只生成自己附近（不建中央、不生成家鄉整片）；
// 烘焙世界的 LegacyMeta 由 legacy bulk 帶過去（比 welcome 先到 / 後到都行）；舊世界的 Welcome 位元組不變（裁決 P9）。
import { describe, expect, it } from 'vitest';
import { OUTER_GEN_VERSION } from '../engine/legacy/chunkgen/index';
import { SPAWN_X } from '../engine/gen2/layout';
import { fnv1a } from './codec';
import { columnSums } from './chunkSync';
import { END_TEXT, coopGenOk } from './guest';
import type { Welcome } from './protocol';
import { coopRig, FRAME } from './testRig';

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);
/** 改 host.ts 之前（Task 18 之前的程式）用 coopRig({ world: 'real' }) 錄下的 Welcome 的 FNV-1a */
const LEGACY_WELCOME_HASH = 3624304289;

describe('Task 18 連線：版本描述、gen2 客人不生成家鄉、烘焙世界的 meta', () => {
  it('gen2 世界：客人加入時副本不建中央、genKind gen2、出生點附近的 chunk 與房主相同', () => {
    const rig = coopRig({ world: 'gen2' }); rig.run(2000); const gg = rig.guests[0].game!;
    expect(gg.genKind).toBe('gen2'); expect(gg.world.isResident(0)).toBe(false);
    // 鎖表照 welcome 帶過去（房主進家鄉就記了鎖）
    const hostLocks = rig.hostGame.gen2()!.locks.toJSON();
    expect(hostLocks.length).toBeGreaterThan(0); expect(gg.gen2()!.locks.toJSON()).toEqual(hostLocks);
    rig.run(120 * FRAME); expect(rig.sameTiles(0)).toEqual([]);
    expect(columnSums(gg.world, SPAWN_X >> 5)).toEqual(columnSums(rig.hostGame.world, SPAWN_X >> 5));
  }, 120_000);

  it('outerGen 不同 → 客人以 END_TEXT.gen 結束', () => {
    const rig = coopRig({ world: 'gen2', tamperWelcome: (m) => ({ ...m, outerGenVersion: 9 }) });
    rig.run(2000); expect(rig.guests[0].endText).toBe(END_TEXT.gen); expect(rig.guests[0].game).toBeNull();
  }, 120_000);

  it('coopGenOk 真值表', () => {
    const g = { kind: 'gen2' as const, locks: [] };
    expect(coopGenOk({ genVersion: 7, outerGenVersion: 1 })).toBe(true); expect(coopGenOk({ genVersion: 7, outerGenVersion: 2 })).toBe(false);
    expect(coopGenOk({ genVersion: 8, outerGenVersion: 0, gen2: g })).toBe(true); expect(coopGenOk({ genVersion: 8, outerGenVersion: 1, gen2: g })).toBe(false);
    expect(coopGenOk({ genVersion: 8, outerGenVersion: 0 })).toBe(false);
    expect(coopGenOk({ genVersion: 8, outerGenVersion: 0, gen2: { ...g, locks: [[1, 1, 5, null]] } })).toBe(false);
    // 舊世界不帶描述；其他版本一律不行
    expect(coopGenOk({ genVersion: 7, outerGenVersion: 1, gen2: g })).toBe(false);
    expect(coopGenOk({ genVersion: 9, outerGenVersion: 0, gen2: g })).toBe(false);
  });

  it('烘焙世界：legacy bulk 比 welcome 先到 / 後到都能加入；副本 genKind baked；中央 chunk 經同步後與房主相同', () => {
    for (const order of ['bulkFirst', 'welcomeFirst'] as const) {
      const rig = coopRig({ world: 'baked', deliver: order }); rig.run(2000 + 120 * FRAME);
      expect(rig.guests[0].game!.genKind).toBe('baked');
      expect(columnSums(rig.guests[0].game!.world, 65)).toEqual(columnSums(rig.hostGame.world, 65));
    }
  }, 120_000);

  it('烘焙世界：客人離開又回來，卸載過的中央欄（副本裡沒有生成器，重新載入是空氣）在房主回覆前不算 live，同步後與房主相同', () => {
    const rig = coopRig({ world: 'baked' }), hg = rig.hostGame, g = rig.guests[0], gw = g.game!.world;
    const away = (x: number): void => { const a = hg.actors.get(g.pid!)!; hg.withActor(a, () => hg.teleport(x, hg.world.surfaceAt(x) - 1)); };
    expect(columnSums(gw, 65)).toEqual(columnSums(hg.world, 65));
    away(3600); rig.run(3000);
    expect(gw.isResident(65)).toBe(false);
    away(hg.spawn.x);
    // 回來後副本重新載入第 65 欄（BakedSource 的中央不寫格 = 空氣）：房主的 col 回覆到之前，這欄不能是 live
    const host65 = columnSums(hg.world, 65), key = gw.chunkIndex(65, 7);   // (65, 7)：中央地表附近、與空氣不同的 chunk
    expect(host65[7]).not.toBe(0);
    let stale = 0, liveStale = 0;
    rig.run(3000, () => {
      if (!gw.isResident(65) || columnSums(gw, 65)[7] === host65[7]) return;
      stale++;                                                              // 重新載入、還沒收到房主的那幾幀
      if (g.sync!.state(key) === 'live') liveStale++;
    });
    expect(stale).toBeGreaterThan(0);
    expect(liveStale).toBe(0);
    expect(columnSums(gw, 65)).toEqual(columnSums(hg.world, 65));
    expect(rig.sameTiles(0)).toEqual([]);
  }, 120_000);

  it('舊世界連線不變：Welcome 位元組與改動前相同（P9）', () => {
    let seen: Welcome | null = null;
    const rig = coopRig({ world: 'real', tamperWelcome: (m) => (seen = m) }); rig.run(2000);
    expect(seen!.genVersion).toBe(7); expect(seen!.outerGenVersion).toBe(OUTER_GEN_VERSION); expect('gen2' in seen!).toBe(false);
    expect(fnv1a(utf8(JSON.stringify(seen)), 0x811c9dc5)).toBe(LEGACY_WELCOME_HASH);
    expect(rig.guests[0].game!.genKind).toBe('legacy');
  }, 120_000);
});
