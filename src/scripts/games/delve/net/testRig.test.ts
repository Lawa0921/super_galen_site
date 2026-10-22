// testRig.test.ts — 驗收輔助本身：sameTiles 在同步集合是空的時候要報差異；客人一直到不了 live 時建 rig 要丟例外。
import { describe, it, expect } from 'vitest';
import { coopRig } from './testRig';

describe('coopRig', () => {
  it('sameTiles：同步集合是空的（全部 unsynced）→ 報差異，不是 []', () => {
    const r = coopRig();
    expect(r.sameTiles(0)).toEqual([]);
    r.guests[0].sync!.reset();
    expect(r.sameTiles(0)).not.toEqual([]);
  });

  it('客人一直到不了 live → 建 rig 時丟例外', () => {
    expect(() => coopRig({ latencyMs: [20_000, 20_000] })).toThrow(/live/);
  });
});
