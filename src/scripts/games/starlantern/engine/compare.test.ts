import { describe, it, expect } from 'vitest';
import { compareDelta, itemLines, specialLines } from './compare';
import { newMember, statsOf } from './party';
import { plainItem } from './testing';
import { implicitStats, rollItem } from './loot/item';
import { mulberry32 } from './rng';
import { T } from '../data/text.zh-TW';
import { ENHANCE_STEP } from '../data/forge';
import { POWERS, SETS, SPECIALS } from '../data/gear';
import type { AnyStat, ItemInstance, Member } from './types';

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
  it('taking off one of two set pieces drops the two-piece bonus from the delta too', () => {
    const blaze = (slot: string, uid: number) => rollItem(mulberry32(uid), { uid, ilvl: 10, rarity: 'set', special: `set-blaze-${slot}` });
    const body = blaze('body', 2);
    const m: Member = { ...newMember('scarlet'), equip: { weapon: blaze('weapon', 1), body } };
    const pieceFire = body.affixes.find((a) => a.key === 'fireDmg')!.value;
    // The body's own fireDmg goes, and the set's two-piece fireDmg with it.
    expect(compareDelta(m, 'body', null).fireDmg).toBe(-(pieceFire + SETS['set-blaze'].two.fireDmg!));
    // Swapping it for a plain piece loses the bonus the same way.
    expect(compareDelta(m, 'body', plainItem('cloth-robe', 3)).fireDmg).toBe(-(pieceFire + SETS['set-blaze'].two.fireDmg!));
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
    expect(itemLines(it)[0]).toEqual({ kind: 'implicit', text: '基礎 攻擊 +4' });   // 基礎 sets the base bonus apart from a same-stat affix
  });
  it('a power line says whether the wearer can use it: only a member whose kit has the skill', () => {
    const gloves = rollItem(mulberry32(5), { uid: 5, ilvl: 10, rarity: 'legendary', special: 'lg-bobby' });   // turret
    const power = (m?: Member) => itemLines(gloves, m).find((l) => l.kind === 'power')!;
    expect(power({ ...newMember('bobby'), equip: {} }).usable).toBe(true);
    expect(power({ ...newMember('scarlet'), equip: {} }).usable).toBe(false);
    expect(power().usable).toBeUndefined();                                // no wearer: nothing to judge
  });
  it('a power in the tree but not learned is usable and marked not learned', () => {
    const neck = rollItem(mulberry32(6), { uid: 6, ilvl: 10, rarity: 'legendary', special: 'frost-bloom-neck' });   // ice-star
    const gloves = rollItem(mulberry32(5), { uid: 5, ilvl: 10, rarity: 'legendary', special: 'lg-bobby' });       // turret
    const power = (it: ItemInstance, m?: Member) => itemLines(it, m).find((l) => l.kind === 'power')!;
    const noel = power(neck, newMember('noel'));
    expect([noel.usable, noel.learned]).toEqual([true, false]);
    const taught = power(neck, { ...newMember('noel'), tree: { 'fire-star': 1, 'ice-star': 1 } });
    expect([taught.usable, taught.learned]).toEqual([true, true]);
    const bobby = power(gloves, newMember('bobby'));
    expect([bobby.usable, bobby.learned]).toEqual([true, true]);
    expect(power(gloves, newMember('scarlet')).usable).toBe(false);
    expect(power(gloves).learned).toBeUndefined();                       // no wearer: nothing to judge
  });

  it('shows the power and the lore of a legendary', () => {
    const lg = rollItem(mulberry32(3), { uid: 3, ilvl: 10, rarity: 'legendary', special: 'mire-whisper-gloves' });
    const lines = itemLines(lg);
    expect(lines.find((l) => l.kind === 'power')!.text).toBe('衰弱咒必定使目標中毒（頭目減半）');
    expect(lines.at(-1)).toEqual({ kind: 'lore', text: SPECIALS['mire-whisper-gloves'].lore });
  });

  it('a starlit piece has a starlit line after its affixes and before its power', () => {
    const lg = rollItem(mulberry32(3), { uid: 3, ilvl: 10, rarity: 'legendary', special: 'mire-whisper-gloves' });
    const kinds = itemLines({ ...lg, starlit: true }).map((l) => l.kind);
    const at = kinds.indexOf('starlit');
    expect(itemLines({ ...lg, starlit: true })[at]).toEqual({ kind: 'starlit', text: T.gear.starlitLine });
    expect(T.gear.starlitLine).toBe('星輝：所有詞綴皆為最大值，另多一條詞綴');
    expect(kinds.lastIndexOf('affix')).toBe(at - 1);
    expect(kinds[at + 1]).toBe('power');
    expect(kinds.filter((k) => k === 'starlit')).toHaveLength(1);
    // A plain piece has none.
    expect(itemLines(lg).some((l) => l.kind === 'starlit')).toBe(false);
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

  it('the locked affix is marked', () => {
    const it0: ItemInstance = { ...sword, rarity: 'rare', affixes: [{ key: 'atk', value: 3 }, { key: 'crit', value: 2 }], locked: 1 };
    const lines = itemLines(it0).filter((l) => l.kind === 'affix');
    expect(lines.map((l) => l.locked)).toEqual([undefined, true]);
    expect(lines[1].text).toBe(`${T.gear.affix('crit', 2)}${T.gear.lockedAffix}`);
    expect(lines[0].text).toBe(T.gear.affix('atk', 3));
    expect(itemLines({ ...it0, locked: undefined }).some((l) => l.locked)).toBe(false);
  });

  it('the implicit line of a +5 item shows the enhanced value', () => {
    const plus5: ItemInstance = { ...sword, enhance: 5 };
    const want = Object.entries(implicitStats(plus5)).map(([k, v]) => T.gear.affix(k as AnyStat, v as number)).join('、');
    expect(itemLines(plus5).find((l) => l.kind === 'implicit')!.text).toBe(T.gear.implicit(want));
    expect(want).not.toBe(Object.entries(implicitStats(sword)).map(([k, v]) => T.gear.affix(k as AnyStat, v as number)).join('、'));
  });

  it('shows the enhanced value of a base bonus', () => {
    const m: Member = { ...newMember('scarlet'), equip: { weapon: sword } };
    const plus5: ItemInstance = { ...sword, enhance: 5 };
    expect(compareDelta(m, 'weapon', plus5).atk).toBe(statsOf({ ...m, equip: { weapon: plus5 } }).atk - statsOf(m).atk);
    expect(compareDelta(m, 'weapon', plus5).atk).toBeGreaterThan(0);
  });

  it('a whole stat changes by what the member really gets: the floored total, never a fraction', () => {
    const m: Member = { ...newMember('scarlet'), equip: { weapon: sword } };
    for (let e = 1; e <= 10; e++) {
      const d = compareDelta(m, 'weapon', { ...sword, enhance: e }).atk ?? 0;
      expect(Number.isInteger(d), `+${e}`).toBe(true);
      expect(d).toBe(statsOf({ ...m, equip: { weapon: { ...sword, enhance: e } } }).atk - statsOf(m).atk);
    }
  });

  it('a fractional base bonus reads with one decimal, a whole one without', () => {
    expect(itemLines({ ...sword, enhance: 5 })[0].text).toBe(T.gear.implicit(`攻擊 +${(4 * (1 + 5 * ENHANCE_STEP)).toFixed(1)}`));
    expect(itemLines(sword)[0].text).toBe(T.gear.implicit('攻擊 +4'));
  });
});
