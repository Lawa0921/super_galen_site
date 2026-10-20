// 世界檔 format 10：切分 / 拼回 / 編解碼 / visits LRU / 舊檔分流。
import { describe, expect, it } from 'vitest';
import { SaveFormatError, decodeSave, restoreGame } from './serialize';
import { readLegacyFixture } from './legacyFixture';
import { validateCharacter } from './character';
import {
  MAX_VISITS, WORLD_FORMAT, decodeAnySave, decodeWorld, encodeWorld, joinSplit, splitSnapshot, upsertVisit,
  type VisitMap, type VisitSave, type WorldHeader,
} from './worldSave';

const legacy = () => decodeSave(readLegacyFixture());
const who = { id: 'c1', nick: '旅人', createdAt: 5, rev: 1 }, where = { worldId: 'w1', worldName: 'fixture-v9', visits: {} };
const visit0: VisitSave = {
  pos: { x: 10, y: 20, vx: 0, vy: 0 }, bed: null, spawnCore: null, markers: [],
  vitals: { breath: 10, burning: 0, honey: 0 }, lastSeen: 0,
};

describe('world save format 10', () => {
  it('切分：角色拿到玩家欄位、世界不再有玩家欄位', () => {
    const { world, character } = splitSnapshot(legacy(), who, where, 99);
    const h = world.header as unknown as Record<string, unknown>;
    for (const k of ['player', 'inventory', 'appearance', 'vanity', 'levels', 'explored', 'markers', 'discovery', 'bed', 'vitals']) expect(h[k]).toBeUndefined();
    expect(world.header.format).toBe(WORLD_FORMAT);
    expect(world.header.settle!.spawnCore).toBeNull();
    expect(world.header.folk).not.toHaveProperty('buffs');
    expect(world.header.extra).not.toHaveProperty('codex');
    expect(world.header.extra).not.toHaveProperty('fishLog');
    expect(Object.keys(world.header.combat).sort()).toEqual(['bosses', 'kills', 'peaceful']);
    expect(world.header.visits.c1.spawnCore).toBe(legacy().header.settle!.spawnCore);
    expect(world.header.visits.c1.lastSeen).toBe(99);
    expect(character.undyingCd).toBe(42);
    expect(character.buffsLeft.bless).toBeCloseTo(legacy().header.folk!.buffs.bless! - legacy().header.time, 6);
    expect(character).toMatchObject({ cformat: 1, id: 'c1', nick: '旅人', createdAt: 5, rev: 1, savedAt: 99, fishLog: { silver_minnow: 3 } });
    expect(character.combat).toEqual({ hp: 63.5, baseMaxHp: legacy().header.combat!.maxHp, mana: legacy().header.combat!.mana });
  });

  it('切分不改輸入（where.visits / data.header）', () => {
    const src = legacy(), before = JSON.stringify(src.header);
    const visits: VisitMap = { old: { ...visit0, lastSeen: 1 } };
    splitSnapshot(src, who, { ...where, visits }, 99);
    expect(JSON.stringify(src.header)).toBe(before);
    expect(Object.keys(visits)).toEqual(['old']);
  });

  it('世界檔 encode → decode 往返相等', () => {
    const { world } = splitSnapshot(legacy(), who, where, 99);
    const back = decodeWorld(encodeWorld(world));
    expect(back.header).toEqual(world.header);
    expect([...back.chunks.keys()]).toEqual(world.header.chunks);
  });

  it('切分再拼回 = 原本的 header（buff 允許 1e-6 誤差）', () => {
    const src = legacy().header;
    const { world, character } = splitSnapshot(legacy(), who, where, 99);
    const { data, freshVisit } = joinSplit(world, character);
    expect(freshVisit).toBe(false);
    const { folk, savedAt, ...rest } = data.header; const { folk: f0, savedAt: s0, ...rest0 } = src;
    expect(rest).toEqual(rest0);
    expect(folk!.buffs.bless).toBeCloseTo(f0!.buffs.bless!, 6);
    expect(savedAt).toBe(s0); // 世界的 savedAt 照抄輸入（snapshotGame 給的就是 now）
    const { buffs, ...folkRest } = folk!; const { buffs: b0, ...folkRest0 } = f0!;
    expect(folkRest).toEqual(folkRest0);
    expect(Object.keys(buffs)).toEqual(Object.keys(b0));
    expect(data.chunks).toBe(world.chunks);
  });

  it('沒有這個角色的 visit → freshVisit', () => {
    const { world, character } = splitSnapshot(legacy(), who, where, 99);
    const { data, freshVisit } = joinSplit(world, { ...character, id: 'other' });
    expect(freshVisit).toBe(true);
    expect(data.header.player).toEqual({ x: 0, y: 0, vx: 0, vy: 0 });
    expect(data.header.settle!.spawnCore).toBeNull();
    expect(data.header.vitals).toEqual({ breath: 10, burning: 0, honey: 0, undying: 42 });
    expect(data.header.markers).toEqual([]);
    expect(data.header.bed).toBeNull();
  });

  it('拼回：世界沒有 folk → 補預設，buff 用世界時間換回到期時間', () => {
    const { world, character } = splitSnapshot(legacy(), who, where, 99);
    const { folk: _f, ...noFolk } = world.header;
    const { data } = joinSplit({ header: { ...noFolk, time: 5 }, chunks: world.chunks }, { ...character, buffsLeft: { bless: 30 } });
    expect(data.header.folk).toEqual({ world: {}, quests: {}, scoutMarks: [], perkDays: { guide: -1, healer: -1 }, scouted: [], buffs: { bless: 35 } });
  });

  it('visits LRU：第 9 個角色擠掉最久沒來的', () => {
    let v: VisitMap = {};
    for (let i = 0; i < 9; i++) v = upsertVisit(v, `c${i}`, { ...visit0, lastSeen: 100 + i });
    expect(Object.keys(v)).toHaveLength(MAX_VISITS); expect(v.c0).toBeUndefined(); expect(v.c8).toBeDefined();
  });

  it('upsertVisit 不改輸入；更新既有角色不擠掉別人；剛寫入的角色不會被自己擠掉', () => {
    const v: VisitMap = {};
    for (let i = 0; i < 8; i++) v[`c${i}`] = { ...visit0, lastSeen: 100 + i };
    const snapshot = JSON.stringify(v);
    const u = upsertVisit(v, 'c0', { ...visit0, lastSeen: 200 });
    expect(JSON.stringify(v)).toBe(snapshot);
    expect(Object.keys(u)).toHaveLength(8); expect(u.c0.lastSeen).toBe(200);
    const w = upsertVisit(v, 'late', { ...visit0, lastSeen: 1 });
    expect(w.late).toBeDefined(); expect(w.c0).toBeUndefined(); expect(Object.keys(w)).toHaveLength(8);
  });

  describe('decodeWorld 驗證', () => {
    const base = () => splitSnapshot(legacy(), who, where, 99).world;
    const tamper = (patch: Record<string, unknown>): Uint8Array => {
      const w = base();
      return encodeWorld({ header: { ...w.header, ...patch } as unknown as WorldHeader, chunks: w.chunks });
    };

    it('壞的單筆 visit 被丟掉，世界照讀；worldId 壞掉 → 損毀', () => {
      const good = base().header.visits.c1;
      const back = decodeWorld(tamper({
        visits: {
          c1: good,
          c2: { ...good, lastSeen: 5 },
          noPos: { ...good, pos: null },
          badMarkers: { ...good, markers: 'x' },
          badBed: { ...good, bed: { x: 'a', y: 1 } },
          badExplored: { ...good, explored: 'not-rle' },
          badVitals: { ...good, vitals: { breath: 'full' } },
          noLastSeen: { ...good, lastSeen: undefined },
          badCore: { ...good, spawnCore: 'x' },
          'bad key!': good,
          notObject: 7,
        },
      }));
      expect(Object.keys(back.header.visits).sort()).toEqual(['c1', 'c2']);
      expect(back.header.visits.c1).toEqual(good);
      expect(back.header.seed).toBe('fixture-v9');
      expect(back.chunks.size).toBe(back.header.chunks.length);

      for (const worldId of ['bad id!', '', 'x'.repeat(65), 42, undefined]) {
        expect(() => decodeWorld(tamper({ worldId }))).toThrow(SaveFormatError);
      }
    });

    it('visits 不是物件 → 損毀', () => {
      for (const visits of [null, [], 'x', 3, undefined]) expect(() => decodeWorld(tamper({ visits }))).toThrow(SaveFormatError);
    });

    it('超過 8 筆 visit → 只留 lastSeen 最新的 8 筆', () => {
      const good = base().header.visits.c1;
      const visits: Record<string, VisitSave> = {};
      for (let i = 0; i < 11; i++) visits[`v${i}`] = { ...good, lastSeen: 1000 - i };
      const back = decodeWorld(tamper({ visits }));
      expect(Object.keys(back.header.visits).sort()).toEqual(['v0', 'v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7']);
    });

    it('worldName 不是字串或超過 64 字 → 退回 seed', () => {
      expect(decodeWorld(tamper({ worldName: 123 })).header.worldName).toBe('fixture-v9');
      expect(decodeWorld(tamper({ worldName: 'x'.repeat(65) })).header.worldName).toBe('fixture-v9');
      expect(decodeWorld(tamper({ worldName: '我'.repeat(64) })).header.worldName).toBe('我'.repeat(64));
    });

    it('內嵌 character（匯出檔）：合法 → 正規化後保留；不合法 → 損毀', () => {
      const { character } = splitSnapshot(legacy(), who, where, 99);
      const back = decodeWorld(tamper({ character }));
      expect(back.header.character).toEqual(validateCharacter(character));
      expect(decodeWorld(tamper({})).header).not.toHaveProperty('character');
      expect(() => decodeWorld(tamper({ character: { ...character, id: 'bad id!' } }))).toThrow(SaveFormatError);
      expect(() => decodeWorld(tamper({ character: null }))).toThrow(SaveFormatError);
    });

    it('format 不是 10 → 損毀', () => {
      expect(() => decodeWorld(readLegacyFixture())).toThrow(SaveFormatError);
      expect(() => decodeWorld(tamper({ format: 11 }))).toThrow(SaveFormatError);
    });

    it('世界專屬欄位型別錯 → 損毀', () => {
      expect(() => decodeWorld(tamper({ combat: { bosses: 'x', kills: {}, peaceful: false } }))).toThrow(SaveFormatError);
      expect(() => decodeWorld(tamper({ combat: null }))).toThrow(SaveFormatError);
      expect(() => decodeWorld(tamper({ chests: 'x' }))).toThrow(SaveFormatError);
    });
  });

  it('decodeAnySave：format 9 → legacy、format 10 → world、亂碼 → SaveFormatError', () => {
    expect(decodeAnySave(readLegacyFixture()).kind).toBe('legacy');
    expect(decodeAnySave(encodeWorld(splitSnapshot(legacy(), who, where, 1).world)).kind).toBe('world');
    expect(() => decodeAnySave(new Uint8Array(10))).toThrow(SaveFormatError);
  });

  it('restoreGame 收到 format 10 bytes → format 錯誤（不會被誤讀）', () => {
    expect(restoreGame(encodeWorld(splitSnapshot(legacy(), who, where, 1).world))).toMatchObject({ ok: false, error: 'format' });
  });
});
