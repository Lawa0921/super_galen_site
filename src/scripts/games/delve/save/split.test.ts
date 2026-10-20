// 存讀編排：備份順序、角色缺失 / 損毀、單一寫入。記憶體版 SplitStore 記錄每次呼叫的順序。
import { describe, expect, it } from 'vitest';
import { DelveGame } from '../engine/game';
import { Inventory } from '../engine/inventory';
import { normalizeAppearance } from '../engine/appearance';
import { restoreGame } from './serialize';
import { readLegacyFixture } from './legacyFixture';
import { createCharacter, decodeCharacter, encodeCharacter, type DelveCharacter } from './character';
import { decodeWorld, encodeWorld, restoreSplit, saveSplitGame, type WorldData } from './worldSave';
import { expectSameGame } from './expectSameGame';
import type { CharacterMeta } from './storage';
import { levelForXp } from '../engine/levels';
import {
  CHARACTER_CORRUPT_MSG, CHARACTER_MISSING_MSG, NO_CHARACTER_MSG, WORLD_CORRUPT_MSG, SplitSession, commitMigration, importWorld, newWorldSlot,
  planContinue, planNewWorld, planPlay, saveSplit,
  type SlotRead, type SplitStore,
} from './split';

const fixtureGame = (): DelveGame => { const r = restoreGame(readLegacyFixture()); if (!r.ok) throw new Error(r.message); return r.game; };

type MemStore = SplitStore & { log: string[]; slots: Record<string, SlotRead>; chars: Record<string, Uint8Array>; times: Record<string, number>; ctimes: Record<string, number> };
function memStore(slots: Record<string, SlotRead>, o: { failPutOnce?: boolean } = {}): MemStore {
  let fail = o.failPutOnce ?? false;
  const st: MemStore = {
    log: [], slots: { ...slots }, chars: {}, times: {}, ctimes: {},
    async getSlot(slot) { return st.slots[slot] ?? null; },
    async getCharacter(id) { return st.chars[id] ?? null; },
    async backupSlot(from, to) {
      st.log.push(`backupSlot ${from} ${to}`);
      if (st.slots[to]) return; // 備份只寫一次（同 idbSplitStore）：第二個分頁再遷移不會蓋掉原始舊檔
      const r = st.slots[from]; if (!r) throw new Error('no such slot');
      st.slots[to] = { bytes: r.bytes.slice(), charId: r.charId };
    },
    async putSplit(slot, world, character) {
      st.log.push(`putSplit ${slot} ${character.id}`);
      if (fail) { fail = false; throw new Error('tx aborted'); }
      st.slots[slot] = { bytes: world.bytes, charId: character.id };
      st.chars[character.id] = encodeCharacter(character);
      st.times[slot] = character.savedAt; st.ctimes[character.id] = character.savedAt;
      return { slot, seed: world.seed, savedAt: character.savedAt, bytes: world.bytes.length, summary: world.summary };
    },
    async putCharacter(c) { st.log.push(`putCharacter ${c.id}`); st.chars[c.id] = encodeCharacter(c); st.ctimes[c.id] = c.savedAt; },
    async deleteWorld(slot) { st.log.push(`deleteWorld ${slot}`); delete st.slots[slot]; },
    async deleteCharacter(id) { st.log.push(`deleteCharacter ${id}`); delete st.chars[id]; },
    async listWorlds() {
      return Object.keys(st.slots).filter((s) => !s.endsWith('.bak'))
        .map((slot) => ({ slot, seed: 's', savedAt: st.times[slot] ?? 0, bytes: st.slots[slot].bytes.length }))
        .sort((a, b) => b.savedAt - a.savedAt);
    },
    async listCharacters() {
      return Object.keys(st.chars).map((id): CharacterMeta => {
        const c = decodeCharacter(st.chars[id]);
        return { id, nick: c.nick, savedAt: st.ctimes[id] ?? 0, rev: c.rev, level: levelForXp(c.levels.xp), appearance: c.appearance };
      }).sort((a, b) => b.savedAt - a.savedAt);
    },
  };
  return st;
}
async function migratedStore(): Promise<MemStore> {
  const st = memStore({ main: { bytes: readLegacyFixture() } });
  await commitMigration(st, 'main', fixtureGame(), 5, { backup: true });
  return st;
}

describe('split orchestration', () => {
  it('遷移：先備份、再寫新格式；備份內容 = 原始 bytes', async () => {
    const st = memStore({ main: { bytes: readLegacyFixture() } });
    const plan = await planContinue(st, 'main'); expect(plan.kind).toBe('legacy');
    const s = await commitMigration(st, 'main', fixtureGame(), 5, { backup: true });
    expect(s.slot).toBe('main');
    expect(st.log).toEqual(['backupSlot main main.v9.bak', `putSplit main ${s.charId}`]);
    expect(st.slots['main.v9.bak'].bytes).toEqual(readLegacyFixture());
    expect((await planContinue(st, 'main')).kind).toBe('split');
  });
  it('遷移中斷（putSplit 丟錯）：舊存檔還在，再遷移一次成功', async () => {
    const st = memStore({ main: { bytes: readLegacyFixture() } }, { failPutOnce: true });
    await expect(commitMigration(st, 'main', fixtureGame(), 5, { backup: true })).rejects.toThrow();
    expect((await planContinue(st, 'main')).kind).toBe('legacy');
    await commitMigration(st, 'main', fixtureGame(), 6, { backup: true });
    expect(st.slots['main.v9.bak'].bytes).toEqual(readLegacyFixture());
    expect((await planContinue(st, 'main')).kind).toBe('split');
  });
  it('備份已存在 → 第二次 backupSlot 不覆寫（兩個分頁都遷移時，原始舊檔 bytes 保住）', async () => {
    const st = await migratedStore();
    expect(st.slots.main.charId).toBeDefined(); // main 已是 format 10
    await st.backupSlot('main', 'main.v9.bak');
    expect(st.slots['main.v9.bak'].bytes).toEqual(readLegacyFixture());
    await commitMigration(st, 'main', fixtureGame(), 7, { backup: true });
    expect(st.slots['main.v9.bak'].bytes).toEqual(readLegacyFixture());
    expect(st.slots['main.v9.bak'].charId).toBeUndefined();
  });
  it('備份失敗 → 不寫新格式', async () => {
    const st = memStore({});
    await expect(commitMigration(st, 'main', fixtureGame(), 5, { backup: true })).rejects.toThrow();
    expect(st.log).toEqual(['backupSlot main main.v9.bak']);
  });
  it('角色檔不見 → 錯誤訊息，沒有任何寫入', async () => {
    const st = await migratedStore(); delete st.chars[st.slots.main.charId!]; st.log.length = 0;
    expect(await planContinue(st, 'main')).toEqual({ kind: 'error', message: CHARACTER_MISSING_MSG });
    expect(st.log).toEqual([]);
  });
  it('世界記錄沒有 charId → 角色檔不見', async () => {
    const st = await migratedStore(); st.slots.main = { bytes: st.slots.main.bytes }; st.log.length = 0;
    expect(await planContinue(st, 'main')).toEqual({ kind: 'error', message: CHARACTER_MISSING_MSG });
    expect(st.log).toEqual([]);
  });
  it('角色檔損毀 → 錯誤訊息，世界 bytes 不變', async () => {
    const st = await migratedStore(); const before = st.slots.main.bytes.slice();
    st.chars[st.slots.main.charId!] = new TextEncoder().encode('{"cformat":1,"id":"x","inventory":7}');
    expect(await planContinue(st, 'main')).toEqual({ kind: 'error', message: CHARACTER_CORRUPT_MSG });
    expect(st.slots.main.bytes).toEqual(before);
  });
  it('角色檔 id 與記錄的 charId 不符 → 損毀', async () => {
    const st = await migratedStore();
    const id = st.slots.main.charId!;
    const c: DelveCharacter = { ...decodeCharacter(st.chars[id]), id: 'someone-else' };
    st.chars[id] = encodeCharacter(c);
    expect(await planContinue(st, 'main')).toEqual({ kind: 'error', message: CHARACTER_CORRUPT_MSG });
  });
  it('世界 bytes 解不開 → 讀取失敗訊息', async () => {
    const st = memStore({ main: { bytes: new Uint8Array([1, 2, 3, 4]) } });
    expect(await planContinue(st, 'main')).toEqual({ kind: 'error', message: WORLD_CORRUPT_MSG });
    expect(st.log).toEqual([]);
  });
  it('planContinue 不寫（legacy / split 都一樣）', async () => {
    const st = memStore({ main: { bytes: readLegacyFixture() } });
    await planContinue(st, 'main');
    const m = await migratedStore(); m.log.length = 0;
    const p = await planContinue(m, 'main');
    expect(p.kind).toBe('split');
    expect(st.log).toEqual([]); expect(m.log).toEqual([]);
  });
  it('saveSplit：每次只呼叫一次 putSplit，rev 遞增，visits 有自己的 lastSeen', async () => {
    const st = memStore({});
    const s = SplitSession.fresh('fixture-v9', 1, 'main');
    const g = fixtureGame();
    await saveSplit(st, s, g, 10);
    expect(st.log).toEqual([`putSplit main ${s.charId}`]);
    expect(decodeCharacter(st.chars[s.charId]).rev).toBe(1);
    await saveSplit(st, s, g, 20);
    expect(st.log).toEqual([`putSplit main ${s.charId}`, `putSplit main ${s.charId}`]);
    expect(decodeCharacter(st.chars[s.charId]).rev).toBe(2);
    const plan = await planContinue(st, 'main');
    if (plan.kind !== 'split') throw new Error(plan.kind);
    expect(plan.world.header.visits[s.charId].lastSeen).toBe(20);
    expect(plan.slot).toBe('main');
    const back = SplitSession.fromLoaded(plan.world.header, plan.character, 'main');
    expect(back.charId).toBe(s.charId); expect(back.slot).toBe('main');
  });
  it('匯入舊檔（backup: false）：不寫備份', async () => {
    const st = memStore({});
    const s = await commitMigration(st, 'main', fixtureGame(), 5, { backup: false });
    expect(st.log).toEqual([`putSplit main ${s.charId}`]);
  });
  it('listWorlds excludes backups and sorts newest first', async () => {
    const st = memStore({ a: { bytes: new Uint8Array(1) }, 'a.v9.bak': { bytes: new Uint8Array(1) }, b: { bytes: new Uint8Array(1) } });
    st.times.a = 5; st.times.b = 9;
    expect((await st.listWorlds()).map((m) => m.slot)).toEqual(['b', 'a']);
  });
  it('deleteCharacter removes only that character', async () => {
    const st = memStore({});
    const g = fixtureGame();
    const s1 = SplitSession.fresh('x', 1, 'w1'); const s2 = SplitSession.fresh('y', 2, 'w2');
    await saveSplit(st, s1, g, 10); await saveSplit(st, s2, g, 20);
    await st.deleteCharacter(s1.charId);
    expect((await st.listCharacters()).map((c) => c.id)).toEqual([s2.charId]);
    expect(Object.keys(st.slots).sort()).toEqual(['w1', 'w2']);
  });
  it('newWorldSlot is unique and prefixed', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) { const s = newWorldSlot(); expect(s).toMatch(/^w-[0-9a-f-]{36}$/); seen.add(s); }
    expect(seen.size).toBe(100);
  });
  it('空槽 → none', async () => expect(await planContinue(memStore({}), 'main')).toEqual({ kind: 'none' }));
});

const small = (seed: string): DelveGame => new DelveGame({ seed, width: 200, height: 100 });
const look = normalizeAppearance(undefined);
/** 匯出檔 = 世界檔 + 內嵌角色 */
const exportFile = (w: WorldData, c?: DelveCharacter): Uint8Array => encodeWorld({ ...w, header: { ...w.header, character: c } });

describe('play any world with any character', () => {
  it("planPlay uses the chosen character's visit", async () => {
    const st = memStore({});
    const g = small('play-w');
    const sA = SplitSession.fresh('play-w', 1, 'W');
    g.player.x = 500;
    await saveSplit(st, sA, g, 10);
    const B = createCharacter('B', look, 2); await st.putCharacter(B);
    const pb = await planPlay(st, 'W', B.id);
    if (pb.kind !== 'split') throw new Error(pb.kind);
    expect(pb.slot).toBe('W'); expect(pb.character.id).toBe(B.id);
    const rb = restoreSplit(pb.world, pb.character);
    if (!rb.ok) throw new Error(rb.message);
    expect(rb.freshVisit).toBe(true);
    expect(rb.game.player.x).toBe(small('play-w').player.x);
    const pa = await planPlay(st, 'W', sA.charId);
    if (pa.kind !== 'split') throw new Error(pa.kind);
    const ra = restoreSplit(pa.world, pa.character);
    if (!ra.ok) throw new Error(ra.message);
    expect(ra.freshVisit).toBe(false);
    expect(ra.game.player.x).toBe(500);
  });
  it('planPlay with a missing character errors and writes nothing', async () => {
    const st = memStore({});
    await saveSplit(st, SplitSession.fresh('m', 1, 'W'), small('m'), 10);
    const before = st.log.length;
    expect(await planPlay(st, 'W', 'nobody')).toEqual({ kind: 'error', message: CHARACTER_MISSING_MSG });
    expect(st.log.length).toBe(before);
  });
  it('planPlay: empty slot → none; legacy slot → legacy with slot', async () => {
    const st = memStore({ main: { bytes: readLegacyFixture() } });
    expect(await planPlay(st, 'nope', 'x')).toEqual({ kind: 'none' });
    const p = await planPlay(st, 'main', 'x');
    expect(p.kind).toBe('legacy'); if (p.kind === 'legacy') expect(p.slot).toBe('main');
  });
  it('planContinue skips worlds whose character was deleted', async () => {
    const st = memStore({});
    const g = small('c');
    const sB = SplitSession.fresh('c', 1, 'W2'); const sA = SplitSession.fresh('c', 1, 'W1');
    await saveSplit(st, sB, g, 10); await saveSplit(st, sA, g, 20);
    const first = await planContinue(st);
    if (first.kind !== 'split') throw new Error(first.kind);
    expect(first.slot).toBe('W1'); expect(first.character.id).toBe(sA.charId);
    await st.deleteCharacter(sA.charId);
    const next = await planContinue(st);
    if (next.kind !== 'split') throw new Error(next.kind);
    expect(next.slot).toBe('W2'); expect(next.character.id).toBe(sB.charId);
    await st.deleteCharacter(sB.charId);
    expect(await planContinue(st)).toEqual({ kind: 'none' });
  });
  it('planContinue() with no slot returns a legacy main slot when it is the newest candidate', async () => {
    const st = memStore({ main: { bytes: readLegacyFixture() } });
    const p = await planContinue(st);
    expect(p.kind).toBe('legacy'); if (p.kind === 'legacy') expect(p.slot).toBe('main');
    expect(st.log).toEqual([]);
    expect(await planContinue(memStore({}))).toEqual({ kind: 'none' });
  });
  it("planNewWorld keeps the character's inventory", async () => {
    const st = memStore({});
    await saveSplit(st, SplitSession.fresh('nw', 1, 'old'), small('nw'), 5);
    const c0 = createCharacter('A', look, 1);
    const inv = Inventory.fromJSON(c0.inventory); inv.add('lantern', 1);
    const c: DelveCharacter = { ...c0, inventory: inv.toJSON() };
    const { game, session } = planNewWorld(small('nw'), c, 10);
    expect(game.inventory.count('lantern')).toBe(1);
    expect(game.seed).toBe('nw');
    expect(game.player.x).toBe(small('nw').player.x);
    expect(session.charId).toBe(c.id);
    expect(session.slot).toMatch(/^w-/);
    await saveSplit(st, session, game, 20);
    const w = decodeWorld(st.slots[session.slot].bytes).header;
    expect(w.worldId).not.toBe(decodeWorld(st.slots.old.bytes).header.worldId);
    expect(w.worldName).toBe('nw');
    expect(Object.keys(w.visits)).toEqual([c.id]); // 生成時附帶的角色已丟棄
    expect(st.slots[session.slot].charId).toBe(c.id);
  });
  it('same world name twice gives two slots', async () => {
    const st = memStore({});
    const c = createCharacter('A', look, 1);
    for (const now of [10, 20]) {
      const { game, session } = planNewWorld(small('twin'), c, now);
      await saveSplit(st, session, game, now);
    }
    expect((await st.listWorlds()).length).toBe(2);
  });
  it('importWorld keeps newer local character', async () => {
    const { world, character } = SplitSession.fresh('imp', 1, 'tmp').snapshot(small('imp'), 10);
    for (const [local, imported, expected] of [[5, 3, 5], [5, 7, 7]]) {
      const st = memStore({});
      await st.putCharacter({ ...character, rev: local });
      const r = await importWorld(st, exportFile(world, { ...character, rev: imported }), 20);
      if ('error' in r) throw new Error(r.error);
      expect(decodeCharacter(st.chars[character.id]).rev).toBe(expected);
      expect(st.slots[r.slot].charId).toBe(character.id);
      expect(decodeWorld(st.slots[r.slot].bytes).header.character).toBeUndefined();
      expect((await planPlay(st, r.slot, character.id)).kind).toBe('split');
    }
  });
  it('importWorld never touches existing slots', async () => {
    const st = memStore({ main: { bytes: readLegacyFixture() } });
    await saveSplit(st, SplitSession.fresh('e', 1, 'w1'), small('e'), 10);
    const before = Object.fromEntries(Object.entries(st.slots).map(([k, v]) => [k, v.bytes.slice()]));
    const { world, character } = SplitSession.fresh('imp', 1, 'tmp').snapshot(small('imp'), 10);
    const a = await importWorld(st, exportFile(world, character), 30);
    const b = await importWorld(st, readLegacyFixture(), 40);
    if ('error' in a) throw new Error(a.error);
    if ('error' in b) throw new Error(b.error);
    expect(new Set([a.slot, b.slot, ...Object.keys(before)]).size).toBe(Object.keys(before).length + 2);
    for (const [k, bytes] of Object.entries(before)) expect(st.slots[k].bytes).toEqual(bytes);
    expect(st.log.some((l) => l.startsWith('backupSlot'))).toBe(false); // 舊檔匯入不備份
    expect((await planContinue(st, b.slot)).kind).toBe('split');
  });
  it('importWorld rejects a world without character and corrupt bytes, writing nothing', async () => {
    const st = memStore({});
    const { world } = SplitSession.fresh('imp', 1, 'tmp').snapshot(small('imp'), 10);
    expect(await importWorld(st, exportFile(world), 5)).toEqual({ error: NO_CHARACTER_MSG });
    expect(await importWorld(st, new Uint8Array([1, 2, 3, 4]), 5)).toEqual({ error: WORLD_CORRUPT_MSG });
    expect(st.log).toEqual([]);
  });
});

describe('fix round 1: no second world generation, import timestamps', () => {
  /** 舊做法的參考：拆出世界、丟掉 visits，再用角色 restoreSplit（會重新生成） */
  const viaRestore = (g: DelveGame, c: DelveCharacter): DelveGame => {
    const { world } = saveSplitGame(g, { id: 'tmp', nick: 't', createdAt: 0, rev: 0 }, { worldId: 'x', worldName: g.seed, visits: {} }, 1);
    const r = restoreSplit({ ...world, header: { ...world.header, visits: {} } }, c);
    if (!r.ok) throw new Error(r.message);
    return r.game;
  };
  it('planNewWorld applies the character in place (same game instance, no regeneration) = restoreSplit result', () => {
    const rich = SplitSession.fresh('fixture-v9', 1, 'x').snapshot(fixtureGame(), 10).character;
    const g = small('inplace');
    const { game, session } = planNewWorld(g, rich, 20);
    expect(game).toBe(g);
    expect(session.charId).toBe(rich.id);
    expectSameGame(viaRestore(small('inplace'), rich), game);
  });
  it('legacy importWorld = what commitMigration would write', async () => {
    const a = memStore({});
    const r = await importWorld(a, readLegacyFixture(), 50);
    if ('error' in r) throw new Error(r.error);
    expect(a.log).toEqual([`putSplit ${r.slot} ${a.slots[r.slot].charId}`]);
    const b = memStore({});
    await commitMigration(b, 'main', fixtureGame(), 50, { backup: false });
    const pa = await planContinue(a, r.slot), pb = await planContinue(b, 'main');
    if (pa.kind !== 'split' || pb.kind !== 'split') throw new Error(`${pa.kind} ${pb.kind}`);
    expect({ ...pa.character, id: '' }).toEqual({ ...pb.character, id: '' });
    expect(pa.world.header.worldName).toBe(pb.world.header.worldName);
    const ga = restoreSplit(pa.world, pa.character), gb = restoreSplit(pb.world, pb.character);
    if (!ga.ok || !gb.ok) throw new Error('restore');
    expectSameGame(gb.game, ga.game);
  });
  it('imported world is stamped with the import time (sorts first, Continue picks it)', async () => {
    const st = memStore({});
    await saveSplit(st, SplitSession.fresh('old', 1, 'w-old'), small('old'), 100);
    const { world, character } = SplitSession.fresh('imp', 1, 'tmp').snapshot(small('imp'), 10);
    const r = await importWorld(st, exportFile(world, character), 200);
    if ('error' in r) throw new Error(r.error);
    expect((await st.listWorlds())[0].slot).toBe(r.slot);
    const p = await planContinue(st);
    expect(p.kind === 'split' && p.slot).toBe(r.slot);
    const l = await importWorld(st, readLegacyFixture(), 300);
    if ('error' in l) throw new Error(l.error);
    expect((await st.listWorlds())[0].slot).toBe(l.slot);
  });
});
