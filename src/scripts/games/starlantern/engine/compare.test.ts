import { describe, it, expect } from 'vitest';
import { compareDelta, itemLines, specialLines } from './compare';
import { newMember } from './party';
import { plainItem } from './testing';
import { rollItem } from './loot/item';
import { mulberry32 } from './rng';
import { T } from '../data/text.zh-TW';
import { POWERS, SETS, SPECIALS } from '../data/gear';
import type { ItemInstance, Member } from './types';

const sword = plainItem('iron-sword', 1);
const better = plainItem('star-saber', 2);

describe('compareDelta', () => {
  it('the delta of a better sword is positive in attack only', () => {
    const m: Member = { ...newMember('scarlet'), equip: { weapon: sword } };
    expect(compareDelta(m, 'weapon', better)).toEqual({ atk: 11 });
  });
  it('comparing a ring uses the given ring slot', () => {
    const ring = plainItem('star-ring', 3);
    const m: Member = { ...newMember('scarlet'), equip: { ring1: plainItem('copper-ring', 4), ring2: ring } };
    expect(compareDelta(m, 'ring1', ring)).toEqual({ hp: -8, atk: 4, mag: 4 });
    expect(compareDelta(m, 'ring2', ring)).toEqual({});
  });
  it('unequipping shows the loss', () => {
    const m: Member = { ...newMember('scarlet'), equip: { weapon: sword } };
    expect(compareDelta(m, 'weapon', null)).toEqual({ atk: -4 });
  });
});

describe('itemLines', () => {
  const pieces = (n: number): Member => {
    const equip: Member['equip'] = {};
    const slots = ['weapon', 'body', 'hands', 'ring1'] as const;
    for (let i = 0; i < n; i++) equip[slots[i]] = rollItem(mulberry32(i + 1), { uid: i + 1, ilvl: 10, rarity: 'set', special: SETS['set-blaze'].pieces[i] });
    return { ...newMember('scarlet'), equip };
  };
  const piece = rollItem(mulberry32(9), { uid: 9, ilvl: 10, rarity: 'set', special: 'set-blaze-weapon' });

  it('set lines mark the bonuses the wearer has reached', () => {
    const two = itemLines(piece, pieces(2)).filter((l) => l.kind === 'set');
    expect(two.map((l) => l.active)).toEqual([true, false]);
    const four = itemLines(piece, pieces(4)).filter((l) => l.kind === 'set');
    expect(four.map((l) => l.active)).toEqual([true, true]);
    expect(four[1].text).toContain(T.gear.setFour);
    expect(itemLines(piece).filter((l) => l.kind === 'set').every((l) => !l.active)).toBe(true);
  });
  it('percent stats read as percent, points as points', () => {
    const it: ItemInstance = { ...plainItem('iron-sword', 1), rarity: 'rare', affixes: [{ key: 'crit', value: 5 }, { key: 'atk', value: 7 }, { key: 'evasion', value: 40 }] };
    const lines = itemLines(it).filter((l) => l.kind === 'affix').map((l) => l.text);
    expect(lines).toEqual(['暴擊率 +5%', '攻擊 +7', '閃避 +40']);
    expect(itemLines(it)[0]).toEqual({ kind: 'implicit', text: '攻擊 +4' });
  });
  it('shows the power and the lore of a legendary', () => {
    const lg = rollItem(mulberry32(3), { uid: 3, ilvl: 10, rarity: 'legendary', special: 'mire-whisper-gloves' });
    const lines = itemLines(lg);
    expect(lines.find((l) => l.kind === 'power')!.text).toBe('衰弱咒必定使目標中毒（頭目減半）');
    expect(lines.at(-1)).toEqual({ kind: 'lore', text: SPECIALS['mire-whisper-gloves'].lore });
  });
});

describe('specialLines', () => {
  it('specialLines works from an id alone', () => {
    const lg = specialLines('lg-noel');
    expect(lg.map((l) => l.kind)).toEqual(['power', 'lore']);
    expect(lg[0].text).toBe(POWERS['lg-noel'].text);
    expect(specialLines('set-iron').map((l) => l.kind)).toEqual(['set', 'set']);
    expect(specialLines('set-iron-body').map((l) => l.kind)).toEqual(['set', 'set', 'lore']);
    expect(specialLines('nope')).toEqual([]);
  });
});
