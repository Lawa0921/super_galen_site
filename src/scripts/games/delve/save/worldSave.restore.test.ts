// 世界檔 + 角色檔 → 遊戲（restoreSplit）；同一個角色跨世界、死亡中存檔、多角色各自的重生核心。
import { describe, expect, it } from 'vitest';
import { DelveGame } from '../engine/game';
import { restoreGame, serializeGame } from './serialize';
import { readLegacyFixture } from './legacyFixture';
import { decodeCharacter, encodeCharacter } from './character';
import { encodeWorld, restoreSplit, saveSplitGame } from './worldSave';
import { expectSameGame } from './expectSameGame';

const who = { id: 'c1', nick: '旅人', createdAt: 5, rev: 1 }, where = { worldId: 'w1', worldName: 'fixture-v9', visits: {} };
const fixtureGame = (): DelveGame => { const r = restoreGame(readLegacyFixture()); if (!r.ok) throw new Error(r.message); return r.game; };

describe('restoreSplit', () => {
  it('角色 + 世界往返：restoreSplit 的遊戲與原遊戲逐欄相等', () => {
    const a = fixtureGame();
    const { world, character } = saveSplitGame(a, who, where, 99);
    const r = restoreSplit(encodeWorld(world), decodeCharacter(encodeCharacter(character)));
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.freshVisit).toBe(false);
    expect(r.world.worldId).toBe('w1');
    expect(r.world.visits.c1.lastSeen).toBe(99);
    expectSameGame(a, r.game);
  });

  it('同一個角色進另一個世界：物品／裝備／等級都在，visit 是新的', () => {
    const a = fixtureGame();
    const { character } = saveSplitGame(a, who, where, 99);
    const other = new DelveGame({ seed: 'other-world', width: 200, height: 100, peaceful: true });
    const { world: w2 } = saveSplitGame(other, { ...who, id: 'someone-else' }, { worldId: 'w2', worldName: 'other-world', visits: {} }, 50);
    const r = restoreSplit(w2, character);
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.freshVisit).toBe(true);
    expect(r.game.seed).toBe('other-world');
    expect(r.game.inventory.toJSON()).toEqual(a.inventory.toJSON());
    expect(r.game.equipment.gearJSON()).toEqual(a.equipment.gearJSON());
    expect(r.game.levels.toJSON()).toEqual(a.levels.toJSON());
    // 出生點（不是 joinSplit 的佔位座標 0,0）
    expect(r.game.feetTile()).toEqual(other.feetTile());
    expect({ x: r.game.player.x, y: r.game.player.y }).toEqual({ x: other.player.x, y: other.player.y });
    expect(r.game.markers).toEqual([]); expect(r.game.bed).toBeNull(); expect(r.game.settle.spawnCore).toBeNull();
    // 只有出生點周圍揭露、只發現出生地區（同新開的世界）
    expect(r.game.explored.count).toBe(other.explored.count);
    expect(r.game.explored.encode()).toEqual(other.explored.encode());
    expect(r.game.discovery.toJSON()).toEqual(other.discovery.toJSON());
  });

  it('同一個世界的新角色：世界與角色欄位都相等，只有 visit 是新的', () => {
    const a = fixtureGame();
    const { world, character } = saveSplitGame(a, who, where, 99);
    const r = restoreSplit(world, { ...character, id: 'newcomer' });
    if (!r.ok) throw new Error(r.message);
    expect(r.freshVisit).toBe(true);
    expectSameGame(a, r.game, { visit: false });
    expect(() => expectSameGame(a, r.game)).toThrow();
    expect(r.game.feetTile()).toEqual(r.game.spawn);
    expect(r.game.settle.spawnCore).toBeNull();
  });

  it('buff 帶到時間較早的世界：剩餘秒數不變', () => {
    const a = fixtureGame(); const leftA = a.activeBuffs()[0].left;
    const { character } = saveSplitGame(a, who, where, 99);
    const other = new DelveGame({ seed: 'early', width: 200, height: 100 }); other.time = 10;
    const r = restoreSplit(saveSplitGame(other, { ...who, id: 'x' }, { worldId: 'w3', worldName: 'early', visits: {} }, 1).world, character);
    if (!r.ok) throw new Error(r.message);
    expect(r.game.time).toBe(10);
    expect(r.game.activeBuffs()[0].left).toBeCloseTo(leftA, 6);
  });

  it('死亡中存檔：visit 存重生點（據點爐心旁）、角色滿血', () => {
    const a = fixtureGame(); a.hurtPlayer(9999, 0); expect(a.dead).toBe(true);
    const respawn = a.respawnPoint();
    expect(respawn).not.toEqual(a.spawn); // 是爐心旁，不是世界出生點
    const { world, character } = saveSplitGame(a, who, where, 99);
    expect(character.combat.hp).toBe(a.maxHp());
    const r = restoreSplit(world, character); if (!r.ok) throw new Error(r.message);
    expect(r.game.dead).toBe(false);
    expect(r.game.hp).toBe(r.game.maxHp());
    expect(r.game.settle.spawnCore).toBe(a.settle.spawnCore);
    expect(r.game.feetTile()).toEqual(respawn);
  });

  it('兩個角色各自的重生核心互不影響', () => {
    const a = fixtureGame();
    const core = a.settle.spawnCore;
    expect(core).not.toBeNull();
    const s1 = saveSplitGame(a, who, where, 99);
    // c2 第一次進這個世界（沒有 visit → 沒有重生核心），存檔後世界有兩筆 visit
    const c2 = { ...s1.character, id: 'c2' };
    const first = restoreSplit(s1.world, c2); if (!first.ok) throw new Error(first.message);
    expect(first.freshVisit).toBe(true);
    expect(first.game.settle.spawnCore).toBeNull();
    const s2 = saveSplitGame(first.game, { ...who, id: 'c2' }, { ...where, visits: s1.world.header.visits }, 120);
    expect(s2.world.header.settle!.spawnCore).toBeNull();
    expect(s2.world.header.visits.c1.spawnCore).toBe(core);
    expect(s2.world.header.visits.c2.spawnCore).toBeNull();

    const r1 = restoreSplit(encodeWorld(s2.world), s1.character); if (!r1.ok) throw new Error(r1.message);
    const r2 = restoreSplit(encodeWorld(s2.world), c2); if (!r2.ok) throw new Error(r2.message);
    expect(r1.freshVisit).toBe(false); expect(r2.freshVisit).toBe(false);
    expect(r1.game.settle.spawnCore).toBe(core);
    expect(r2.game.settle.spawnCore).toBeNull();
    // 爐心本身是世界的：兩人都看得到同一個據點
    expect(r2.game.settle.cores.map((c) => c.id)).toEqual(r1.game.settle.cores.map((c) => c.id));
    expect(r1.game.respawnPoint()).toEqual(a.respawnPoint());
    expect(r2.game.respawnPoint()).toEqual(r2.game.spawn);
  });

  it('世界檔損毀 / 給的是舊合併檔 → format 錯誤，不丟例外', () => {
    const { character } = saveSplitGame(fixtureGame(), who, where, 99);
    const bad = restoreSplit(new Uint8Array([1, 2, 3]), character);
    expect(bad).toMatchObject({ ok: false, error: 'format' });
    const legacy = restoreSplit(serializeGame(fixtureGame(), 1), character);
    expect(legacy).toMatchObject({ ok: false, error: 'format' });
  });
});
