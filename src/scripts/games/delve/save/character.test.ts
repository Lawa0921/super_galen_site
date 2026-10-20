import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHARACTER_FORMAT, createCharacter, decodeCharacter, encodeCharacter, newId, newIdentity, validateCharacter, type DelveCharacter } from './character';
import { DelveGame } from '../engine/game';
import { snapshotGame } from './serialize';
import { splitSnapshot } from './worldSave';
import { SaveFormatError } from './serialize';
import { normalizeAppearance } from '../engine/appearance';
import { Vanity } from '../engine/vanity';
import { Equipment } from '../engine/equipment';
import { Progression } from '../engine/levels';
import { Codex } from '../engine/codex';

const good = (): DelveCharacter => ({ cformat: 1, id: 'abc-123', nick: '小明', createdAt: 1, savedAt: 2, rev: 3,
  appearance: normalizeAppearance({ race: 3 }), vanity: new Vanity().toJSON(),
  inventory: { slots: [{ item: 'torch', count: 5 }], selected: 0 }, equipment: new Equipment().toJSON(),
  equipGear: new Equipment().gearJSON(), combat: { hp: 80, baseMaxHp: 120, mana: 20 },
  levels: new Progression().toJSON(), codex: new Codex().toJSON(), fishLog: { silver_minnow: 3 },
  undyingCd: 12, buffsLeft: { bless: 90 } });

afterEach(() => { vi.unstubAllGlobals(); });

describe('createCharacter', () => {
  const look = normalizeAppearance({ race: 2 });
  it("createCharacter matches a fresh game's player", () => {
    const c = createCharacter('阿明', look, 1000);
    const g = new DelveGame({ seed: 'ref', width: 160, height: 100 });
    const ref = splitSnapshot(snapshotGame(g, 1000), newIdentity(1000), { worldId: 'w', worldName: 'ref', visits: {} }, 1000).character;
    for (const k of ['inventory', 'equipment', 'equipGear', 'combat', 'levels', 'codex', 'fishLog', 'buffsLeft', 'undyingCd'] as const) {
      expect(c[k]).toEqual(ref[k]);
    }
    expect(c.nick).toBe('阿明'); expect(c.appearance).toEqual(look); expect(c.rev).toBe(0);
    expect(() => validateCharacter(c)).not.toThrow();
  });
  it('空白暱稱 → 旅人；17 字被截成 16 字', () => {
    expect(createCharacter('   ', look, 0).nick).toBe('旅人');
    expect(createCharacter('x'.repeat(17), look, 0).nick).toBe('x'.repeat(16));
  });
});

describe('DelveCharacter', () => {
  it('encode → decode 往返完全相等', () => expect(decodeCharacter(encodeCharacter(good()))).toEqual(good()));
  it.each([
    ['cformat 3', { cformat: 3 }], ['cformat 0', { cformat: 0 }], ['沒有 cformat', { cformat: undefined }], ['沒有 id', { id: '' }], ['壞背包', { inventory: { slots: [{ item: 'nope', count: 1 }] } }],
    ['背包 gear 不合法', { inventory: { slots: [{ item: 'torch', count: 1, gear: { rarity: 9 } }] } }],
    ['hp 是字串', { combat: { hp: '80', baseMaxHp: 120, mana: 20 } }], ['rev 負數', { rev: -1 }],
  ])('壞角色檔被拒：%s', (_, patch) => expect(() => validateCharacter({ ...good(), ...patch })).toThrow(SaveFormatError));
  it('cformat 1（還沒轉換時裝的舊角色）與 2 都讀得進來，版本原樣保留（applyCharacter 依它決定要不要轉換）', () => {
    expect(validateCharacter({ ...good(), cformat: 1 }).cformat).toBe(1);
    expect(validateCharacter({ ...good(), cformat: 2 }).cformat).toBe(2);
    expect(decodeCharacter(encodeCharacter({ ...good(), cformat: 2 }))).toEqual({ ...good(), cformat: 2 });
  });
  it('新角色 / 存檔寫出的角色一律是目前的格式（2）', () => {
    expect(CHARACTER_FORMAT).toBe(2);
    expect(createCharacter('新', normalizeAppearance(undefined), 0).cformat).toBe(2);
  });
  it('不是 JSON → SaveFormatError', () => expect(() => decodeCharacter(new Uint8Array([1, 2, 3]))).toThrow(SaveFormatError));
  it('暱稱空白或太長 → 旅人；未知 buff 丟掉', () => {
    const c = validateCharacter({ ...good(), nick: '   ', buffsLeft: { bless: 5, nope: 3, ward: -1 } });
    expect(c.nick).toBe('旅人'); expect(c.buffsLeft).toEqual({ bless: 5 });
    expect(validateCharacter({ ...good(), nick: 'x'.repeat(17) }).nick).toBe('旅人');
  });
  it('newId 是 UUID v4；沒有 randomUUID 時也是', () => {
    const re = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(newId()).toMatch(re);
    const real = globalThis.crypto; vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) }); // 沒有 randomUUID
    expect(newId()).toMatch(re); expect(newId()).not.toBe(newId());
  });
  it('newIdentity：暱稱旅人、rev 0', () => expect(newIdentity(7)).toMatchObject({ nick: '旅人', createdAt: 7, rev: 0 }));
});
