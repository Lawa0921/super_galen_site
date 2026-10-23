// upgrade.test.ts — Task 17（裁決 P7）：session 的舊世界升級路徑 upgradeSlot（讀槽 → 烘焙 → 還原；失敗不寫、可重試）。
// fixture = Task 1 的 format11-v7（seed 'fixture-v11'）；舊生成器的結果在檔案內共用一次。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../engine/legacy/worldgen';
import { GEN_VERSION_V2 } from '../engine/constants';
import { createCharacter, type DelveCharacter } from './character';
import { normalizeAppearance } from '../engine/appearance';
import { decodeWorld, restoreSplit } from './worldSave';
import { V7_BACKUP_SUFFIX, saveSplit } from './split';
import { FIXTURE11_PATH, FIXTURE11_SEED, FIXTURE11_WHO } from './legacyFixture11';
import { UPGRADE_FAILED_MSG, upgradeSlot } from './bake';
import { fakeSplitStore } from './testUtil';

const originalBytes = new Uint8Array(readFileSync(FIXTURE11_PATH));
const char: DelveCharacter = { ...createCharacter(FIXTURE11_WHO.nick, normalizeAppearance(undefined), 1), id: FIXTURE11_WHO.id };
const gen = generateWorld(FIXTURE11_SEED);

describe('upgradeSlot（裁決 P7）', () => {
  it('烘焙失敗 → 不開局、存檔原封不動；重試成功 → baked，第一次存檔先備份原檔', async () => {
    const store = fakeSplitStore({ slots: { 'w-1': originalBytes } });
    const bad = await upgradeSlot(store, 'w-1', char, gen, 1, () => { throw new Error('boom'); });
    expect(bad).toEqual({ ok: false, message: UPGRADE_FAILED_MSG + 'boom' });
    expect(store.putCalls).toBe(0); expect(store.slot('w-1')).toEqual(originalBytes); expect(store.slot('w-1' + V7_BACKUP_SUFFIX)).toBeUndefined();
    const ok = await upgradeSlot(store, 'w-1', char, gen, 1); if (!ok.ok) throw new Error(ok.message);
    expect(ok.game.genKind).toBe('baked'); expect(ok.session.pendingBackup).toBe(V7_BACKUP_SUFFIX); expect(store.slot('w-1')).toEqual(originalBytes);
    expect(store.putCalls).toBe(0);   // 升級本身不寫：第一次存檔才寫
    await saveSplit(store, ok.session, ok.game, 2);
    expect(store.slot('w-1' + V7_BACKUP_SUFFIX)).toEqual(originalBytes); expect(store.slot('w-1')).not.toEqual(originalBytes);
    // 寫進去的是 genVersion 8 的烘焙世界，讀回來不必再跑舊生成器也是 baked；之後的存檔不再備份
    const saved = decodeWorld(store.slot('w-1')!);
    expect(saved.header.genVersion).toBe(GEN_VERSION_V2);
    const back = restoreSplit(saved, char);
    if (!back.ok) throw new Error(back.message);
    expect(back.game.genKind).toBe('baked');
    expect(ok.session.pendingBackup).toBeNull();
  }, 120_000);

  it('讀不到槽 / 槽不是世界檔 → { ok: false }（繁中訊息開頭），不寫 store', async () => {
    const store = fakeSplitStore({ slots: { 'w-2': new Uint8Array([1, 2, 3]) } });
    for (const slot of ['nope', 'w-2']) {
      const r = await upgradeSlot(store, slot, char, gen, 1);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message.startsWith(UPGRADE_FAILED_MSG)).toBe(true);
    }
    expect(store.putCalls).toBe(0);
    expect(store.slot('w-2')).toEqual(new Uint8Array([1, 2, 3]));
  });
});
