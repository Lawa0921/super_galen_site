// testUtil.ts — save 測試共用（只給 *.test.ts 用，不進遊戲路徑）：記憶體 SplitStore（bake.test / upgrade.test）。
import type { SplitStore } from './split';

/** 記憶體 SplitStore：記錄 putSplit 次數；backupThrows / putThrows 丟錯時不改任何記錄。slot(k) = 目前記錄的 bytes（測試直接比對） */
export function fakeSplitStore(o: { backupThrows?: boolean; putThrows?: boolean; slots: Record<string, Uint8Array> }) {
  const slots = new Map<string, Uint8Array>(Object.entries(o.slots).map(([k, v]) => [k, v.slice()]));
  const unused = (): never => { throw new Error('unused'); };
  const st: SplitStore & { putCalls: number; slot(k: string): Uint8Array | undefined } = {
    putCalls: 0,
    slot: (k) => slots.get(k),
    async getSlot(k) { const b = slots.get(k); return b ? { bytes: new Uint8Array(b) } : null; },
    async getCharacter() { return null; },
    async backupSlot(from, to) {
      if (o.backupThrows) throw new Error('backup failed');
      const b = slots.get(from); if (!b) throw new Error('no such slot');
      if (!slots.has(to)) slots.set(to, b.slice());
    },
    async putSplit(slot, world, character) {
      st.putCalls++;
      if (o.putThrows) throw new Error('put failed');
      slots.set(slot, world.bytes);
      return { slot, seed: world.seed, savedAt: character.savedAt, bytes: world.bytes.length };
    },
    listWorlds: async () => [], listCharacters: async () => [],
    deleteWorld: async () => unused(), deleteCharacter: async () => unused(), putCharacter: async () => unused(),
  };
  return st;
}
