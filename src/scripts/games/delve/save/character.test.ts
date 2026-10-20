import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeCharacter, encodeCharacter, newId, newIdentity, validateCharacter, type DelveCharacter } from './character';
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

describe('DelveCharacter', () => {
  it('encode → decode 往返完全相等', () => expect(decodeCharacter(encodeCharacter(good()))).toEqual(good()));
  it.each([
    ['cformat 2', { cformat: 2 }], ['沒有 id', { id: '' }], ['壞背包', { inventory: { slots: [{ item: 'nope', count: 1 }] } }],
    ['背包 gear 不合法', { inventory: { slots: [{ item: 'torch', count: 1, gear: { rarity: 9 } }] } }],
    ['hp 是字串', { combat: { hp: '80', baseMaxHp: 120, mana: 20 } }], ['rev 負數', { rev: -1 }],
  ])('壞角色檔被拒：%s', (_, patch) => expect(() => validateCharacter({ ...good(), ...patch })).toThrow(SaveFormatError));
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
