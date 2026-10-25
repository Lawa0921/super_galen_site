// coop.gen2.test.ts — Task 18：連線帶生成器描述（Welcome.gen2）。gen2 客人只生成自己附近（不建中央、不生成家鄉整片）；
// 烘焙世界的 LegacyMeta 由 legacy bulk 帶過去（比 welcome 先到 / 後到都行）；舊世界的 Welcome 位元組不變（裁決 P9）。
import { describe, expect, it, vi } from 'vitest';
import { OUTER_GEN_VERSION } from '../engine/legacy/chunkgen/index';
import { SPAWN_X } from '../engine/gen2/layout';
import { normalizeAppearance } from '../engine/appearance';
import { createCharacter, type DelveCharacter } from '../save/character';
import { fnv1a } from './codec';
import { columnSums } from './chunkSync';
import { END_TEXT, NetGuest, coopGenOk } from './guest';
import { LoopbackNet } from './loopback';
import { SaveFormatError } from '../save/serialize';
import type { Welcome } from './protocol';
import type { BakeInfo } from '../save/bake';
import { coopRig, FRAME, outerVillageBoard, seaHermit, siteNpcIds } from './testRig';
import { walletOf } from '../engine/npcs';

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
    // 一致是客人自己生成出來的：房主回的每一則 col 都沒有要補的 chunk（沒傳任何地形資料）
    expect(rig.cols[0].length).toBeGreaterThan(0);
    expect(rig.cols[0].every((c) => c.diff.length === 0)).toBe(true);
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
    // 烘焙世界：bake.v1（舊外圍生成器版本）必須 = 客人的 OUTER_GEN_VERSION；沒有 bake → 不行
    const bk = (bake?: Partial<BakeInfo>) => ({ kind: 'baked' as const, locks: [], ...(bake ? { bake: bake as BakeInfo } : {}) });
    expect(coopGenOk({ genVersion: 8, outerGenVersion: 0, gen2: bk({ v1: OUTER_GEN_VERSION }) })).toBe(true);
    expect(coopGenOk({ genVersion: 8, outerGenVersion: 0, gen2: bk({ v1: OUTER_GEN_VERSION + 1 }) })).toBe(false);
    expect(coopGenOk({ genVersion: 8, outerGenVersion: 0, gen2: bk({ v1: OUTER_GEN_VERSION - 1 }) })).toBe(false);
    expect(coopGenOk({ genVersion: 8, outerGenVersion: 0, gen2: bk({}) })).toBe(false);
    expect(coopGenOk({ genVersion: 8, outerGenVersion: 0, gen2: bk() })).toBe(false);
  });

  it('烘焙世界：房主的 bake.v1 比客人新 → 客人以 END_TEXT.gen 結束', () => {
    const rig = coopRig({ world: 'baked', tamperWelcome: (m) => ({ ...m, gen2: { ...m.gen2!, bake: { ...m.gen2!.bake!, v1: OUTER_GEN_VERSION + 1 } } }) });
    rig.run(2000); expect(rig.guests[0].endText).toBe(END_TEXT.gen); expect(rig.guests[0].game).toBeNull();
  }, 120_000);

  it('建副本：描述不合法（RangeError / SaveFormatError）→ 世界版本不同；其他例外是程式錯誤，不冒充版本不同', () => {
    const run = (err: Error): NetGuest => {
      const net = new LoopbackNet(), p = net.pair();
      const c: DelveCharacter = { ...createCharacter('丁', normalizeAppearance(undefined), 0), id: `build-${err.name}` };
      const g = new NetGuest(p.guest, { build: 'b', character: c, createReplica: () => { throw err; } });
      const w: Welcome = {
        t: 'welcome', pid: 'p1', worldId: 'w', seed: 's', genVersion: 8, outerGenVersion: 0, bounds: 'infinite', w: 4200, h: 1200,
        time: 0, tick: 0, peaceful: true, you: { x: 0, y: 0 }, players: [], gen2: { kind: 'gen2', locks: [] },
      };
      p.host.send('ctrl', JSON.stringify(w));
      net.flush();
      g.frame(FRAME, 1);
      return g;
    };
    expect(run(new RangeError('bad lock')).endText).toBe(END_TEXT.gen);
    expect(run(new SaveFormatError('bad bake')).endText).toBe(END_TEXT.gen);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bug = run(new TypeError('engine bug'));
    expect(bug.endText).toBeNull(); expect(bug.state).toBe('connecting');
    expect(err).toHaveBeenCalledWith('[delve] guest replica build failed', expect.any(TypeError));
    err.mockRestore();
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

  it('烘焙世界：legacy bulk 晚到（過了 char 計時）期間的 ctrl 不丟——房主用 held 那份較新的角色，副本的背包與房主相同', () => {
    const rig = coopRig({ world: 'baked', guests: 0, deliver: 'welcomeFirst', bulkDelayFrames: 30 });
    const c: DelveCharacter = { ...createCharacter('丙', normalizeAppearance(undefined), 0), id: 'late-legacy-char' };
    const kept: DelveCharacter = JSON.parse(JSON.stringify(c)) as DelveCharacter;
    kept.rev = c.rev + 5;
    const slot = kept.inventory.slots.findIndex((s) => s === null);
    kept.inventory.slots[slot] = { item: 'copper_coin', count: 37 };
    rig.held.set(c.id, { rev: kept.rev, character: kept, at: 1 });
    const g = rig.join({ character: c });
    for (let t = 0; t < 10_000 && g.state !== 'live'; t += FRAME) rig.run(FRAME);
    expect(g.state).toBe('live');
    rig.run(4000);
    const host = rig.hostGame.actors.get(g.pid!)!.inventory.count('copper_coin');
    expect(host).toBe(c.inventory.slots.reduce((n, s) => n + (s?.item === 'copper_coin' ? s.count : 0), 0) + 37);
    expect(g.game!.local.inventory.count('copper_coin')).toBe(host);
  }, 120_000);

  // Task 18：外圍聚落的 NPC 在欄載入時登錄（world.onGenSites → SiteRegistry → FolkWorld.addSite），id = npcIdFor(key)、不依登錄順序
  it('外圍村莊：客人在房主之後才載入那段 → NPC key / id 與房主相同；之前收到的位置被略過、不丟錯', () => {
    const rig = coopRig({ world: 'gen2' }); rig.run(2000); const board = outerVillageBoard(rig);
    rig.hostTeleport(board); rig.run(30 * FRAME);
    const gg = rig.guests[0].game!, before = siteNpcIds(gg).length;
    // 房主那邊已經有外圍村民、客人還沒載入那段（還沒登錄）
    expect(siteNpcIds(rig.hostGame).length).toBeGreaterThan(before);
    expect(() => rig.run(30 * FRAME)).not.toThrow();
    rig.guestTeleport(board); rig.run(120 * FRAME);
    expect(siteNpcIds(gg).length).toBeGreaterThan(before);
    expect(siteNpcIds(gg)).toEqual(siteNpcIds(rig.hostGame));
  }, 120_000);

  // M2a Task 20（指揮官裁決 3，照 Task 18 裁決 6）：島上的隱士在欄載入時登錄；客人遇到未登錄的 NPC 位置略過、不丟錯；chart 服務由房主結算
  it('島上的隱士：客人在房主之後才載入那段 → 隱士 key / id 與房主相同、之前收到的位置被略過不丟錯；客人送 chart 指令由房主用客人的錢結算', () => {
    const rig = coopRig({ world: 'gen2' }); rig.run(2000); const h = seaHermit(rig), key = `${h.key}:hermit`;
    rig.hostTeleport(h.at); rig.run(30 * FRAME);
    const gg = rig.guests[0].game!;
    expect(rig.hostGame.folk.byKey(key)).not.toBeNull(); expect(gg.folk.byKey(key)).toBeNull();
    expect(() => rig.run(30 * FRAME)).not.toThrow();
    rig.guestTeleport(h.at); rig.run(120 * FRAME);
    expect(gg.folk.byKey(key)?.id).toBe(rig.hostGame.folk.byKey(key)!.id);
    expect(siteNpcIds(gg)).toEqual(siteNpcIds(rig.hostGame));
    const a = rig.hostGame.actors.get(rig.guests[0].pid!)!;
    a.inventory.add('copper_coin', 500);
    const marks = rig.hostGame.scoutMarks.length, coins = walletOf(a.inventory), mine = walletOf(rig.hostGame.local.inventory);
    gg.exec(gg.localPid, { op: 'folkService', key, svc: 'chart' }); rig.run(30 * FRAME);
    expect(rig.hostGame.scoutMarks.length).toBe(marks + 1);
    expect(walletOf(a.inventory)).toBe(coins - 120); expect(walletOf(rig.hostGame.local.inventory)).toBe(mine);
  }, 120_000);

  it('舊世界連線不變：Welcome 位元組與改動前相同（P9）', () => {
    let seen: Welcome | null = null;
    const rig = coopRig({ world: 'real', tamperWelcome: (m) => (seen = m) }); rig.run(2000);
    expect(seen!.genVersion).toBe(7); expect(seen!.outerGenVersion).toBe(OUTER_GEN_VERSION); expect('gen2' in seen!).toBe(false);
    expect(fnv1a(utf8(JSON.stringify(seen)), 0x811c9dc5)).toBe(LEGACY_WELCOME_HASH);
    expect(rig.guests[0].game!.genKind).toBe('legacy');
  }, 120_000);
});
