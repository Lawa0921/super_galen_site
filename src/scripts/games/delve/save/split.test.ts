// 存讀編排：備份順序、角色缺失 / 損毀、單一寫入。記憶體版 SplitStore 記錄每次呼叫的順序。
import { describe, expect, it } from 'vitest';
import type { DelveGame } from '../engine/game';
import { restoreGame } from './serialize';
import { readLegacyFixture } from './legacyFixture';
import { decodeCharacter, encodeCharacter, type DelveCharacter } from './character';
import type { CharacterMeta } from './storage';
import { levelForXp } from '../engine/levels';
import {
  CHARACTER_CORRUPT_MSG, CHARACTER_MISSING_MSG, WORLD_CORRUPT_MSG, SplitSession, commitMigration, newWorldSlot, planContinue, saveSplit,
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
    const s = SplitSession.fresh('fixture-v9', 1);
    const g = fixtureGame();
    await saveSplit(st, 'main', s, g, 10);
    expect(st.log).toEqual([`putSplit main ${s.charId}`]);
    expect(decodeCharacter(st.chars[s.charId]).rev).toBe(1);
    await saveSplit(st, 'main', s, g, 20);
    expect(st.log).toEqual([`putSplit main ${s.charId}`, `putSplit main ${s.charId}`]);
    expect(decodeCharacter(st.chars[s.charId]).rev).toBe(2);
    const plan = await planContinue(st, 'main');
    if (plan.kind !== 'split') throw new Error(plan.kind);
    expect(plan.world.header.visits[s.charId].lastSeen).toBe(20);
    expect(SplitSession.fromLoaded(plan.world.header, plan.character).charId).toBe(s.charId);
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
    const s1 = SplitSession.fresh('x', 1); const s2 = SplitSession.fresh('y', 2);
    await saveSplit(st, 'w1', s1, g, 10); await saveSplit(st, 'w2', s2, g, 20);
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
