import { describe, expect, it } from 'vitest';
import type { RuneRef } from '../data/runes';
import { newGame, type GameState } from './state';
import { STANDARD_LINEUP } from './party';
import { defaultTree } from './progression';
import { runeStates } from './runes';
import { SKILLS } from '../data/skills';
import { RESERVE_CAP } from '../data/runes';
import { T } from '../data/text.zh-TW';
import { bagCount, repairRuneFields, reservedTpPct, returnOrphanRunes, socketCount, socketRune, socketable, unsocketRune, validRuneFields } from './sockets';

const spread: RuneRef = { id: 'spread', tier: 'magic' };
const focus: RuneRef = { id: 'focus', tier: 'magic' };
const ignite: RuneRef = { id: 'ignite', tier: 'magic' };
const lasting: RuneRef = { id: 'lasting', tier: 'common' };

/** A game with Noel at `level` on her default build and this rune bag. */
const noelAt = (level: number, runes: Record<string, number>): GameState => {
  const s = newGame(undefined, 0, STANDARD_LINEUP);
  s.party.roster.noel = { ...s.party.roster.noel, level, tree: defaultTree('noel', level) };
  return { ...s, runes };
};
const ok = (r: ReturnType<typeof socketRune>): GameState => {
  if (!r.ok) throw new Error(`refused: ${r.reason}`);
  return r.state;
};

describe('runes in sockets (plan 8e Task 2)', () => {
  it('slots open at Lv5, 20 and 35', () => {
    expect([1, 4, 5, 19, 20, 34, 35, 50].map(socketCount)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });

  it('passives and unlearned skills take no rune', () => {
    const s = newGame(undefined, 0, STANDARD_LINEUP);
    const liz = { ...s.party.roster.liz, level: 10, tree: { 'twin-slash': 1, stealth: 1 } };
    expect(socketable(liz)).toEqual(['twin-slash']);
    expect(socketable(s.party.roster.rin)).toContain('rin-mark');
    expect(socketable(s.party.roster.noel)).toEqual(['fire-star']);
    expect(socketable(s.party.roster.noel)).not.toContain('ice-star');
  });

  it('socketing takes from the bag and swaps out what was there', () => {
    const s = noelAt(20, { 'spread@magic': 1, 'ignite@magic': 1 });
    const before = JSON.stringify(s);
    const a = ok(socketRune(s, 'noel', 'fire-star', 0, spread));
    expect(a.runes).toEqual({ 'ignite@magic': 1 });
    expect(bagCount(a, spread)).toBe(0);
    expect(a.party.roster.noel.sockets).toEqual({ 'fire-star': [spread] });
    const b = ok(socketRune(a, 'noel', 'fire-star', 0, ignite));
    expect(b.runes).toEqual({ 'spread@magic': 1 });
    expect(b.party.roster.noel.sockets).toEqual({ 'fire-star': [ignite] });
    // The second slot is filled up to with null.
    const c = ok(socketRune(b, 'noel', 'fire-star', 1, spread));
    expect(c.party.roster.noel.sockets).toEqual({ 'fire-star': [ignite, spread] });
    const d = ok(socketRune(noelAt(20, { 'spread@magic': 1 }), 'noel', 'fire-star', 1, spread));
    expect(d.party.roster.noel.sockets).toEqual({ 'fire-star': [null, spread] });
    expect(JSON.stringify(s)).toBe(before);
    expect(bagCount({}, spread)).toBe(0);
  });

  it('socketing refuses with a reason', () => {
    expect(socketRune(noelAt(20, {}), 'noel', 'fire-star', 0, spread)).toEqual({ ok: false, reason: 'none' });
    expect(socketRune(noelAt(10, { 'spread@magic': 1 }), 'noel', 'fire-star', 1, spread)).toEqual({ ok: false, reason: 'slot' });
    expect(socketRune(noelAt(4, { 'spread@magic': 1 }), 'noel', 'fire-star', 0, spread)).toEqual({ ok: false, reason: 'slot' });
    const one = ok(socketRune(noelAt(20, { 'spread@magic': 2, 'focus@magic': 1 }), 'noel', 'fire-star', 0, spread));
    expect(socketRune(one, 'noel', 'fire-star', 1, spread)).toEqual({ ok: false, reason: 'same' });
    expect(socketRune(one, 'noel', 'fire-star', 1, focus)).toEqual({ ok: false, reason: 'group' });
    // In the slot that holds 擴散, 集中 simply swaps it out.
    expect(socketRune(one, 'noel', 'fire-star', 0, focus).ok).toBe(true);
    // 常駐 30% each: three hold 90%, a fourth would hold 120%.
    let s = noelAt(35, { 'lasting@common': 4 });
    const skills = socketable(s.party.roster.noel).slice(0, 4);
    expect(skills.length).toBe(4);
    for (const k of skills.slice(0, 3)) s = ok(socketRune(s, 'noel', k, 0, lasting));
    expect(reservedTpPct(s.party.roster.noel)).toBe(90);
    expect(socketRune(s, 'noel', skills[3], 0, lasting)).toEqual({ ok: false, reason: 'reserve' });
    // Swapping one 常駐 for another in its own slot holds no more.
    s = { ...s, runes: { ...s.runes, 'lasting@epic': 1 } };
    expect(socketRune(s, 'noel', skills[0], 0, { id: 'lasting', tier: 'epic' }).ok).toBe(true);
    const bag = noelAt(20, { 'spread@magic': 1 });
    expect(socketRune(bag, 'liz', 'twin-slash', 0, spread)).toEqual({ ok: false, reason: 'invalid' });   // not recruited
    expect(socketRune(bag, 'noel', 'moonlight', 0, spread)).toEqual({ ok: false, reason: 'invalid' });   // not hers
    const thief = noelAt(20, { 'spread@magic': 1 });
    thief.party.recruited = [...thief.party.recruited, 'liz'];
    thief.party.roster.liz = { ...thief.party.roster.liz, level: 20, tree: { 'twin-slash': 1, stealth: 1 } };
    expect(socketRune(thief, 'liz', 'stealth', 0, spread)).toEqual({ ok: false, reason: 'invalid' });   // a passive
    expect(socketRune(noelAt(20, { 'spread@legendary': 1 }), 'noel', 'fire-star', 0, { id: 'spread', tier: 'legendary' })).toEqual({ ok: false, reason: 'invalid' });
    expect(socketRune(noelAt(20, { 'spread@magic': 1 }), 'noel', 'fire-star', 0.5, spread)).toEqual({ ok: false, reason: 'slot' });
    // The words for each refusal; same and group read as runeWhy does.
    expect(T.rune.fail.reserve(RESERVE_CAP)).toBe('常駐保留的 TP 上限已經到 90%');
    expect([T.rune.fail.none, T.rune.fail.slot, T.rune.fail.same('擴散'), T.rune.fail.group('擴散')])
      .toEqual(['袋子裡沒有這個符文', '這一招還沒有這個插槽', '同一招不能裝兩個擴散', '已有同類符文：擴散']);
  });

  it('unsocketing tidies up', () => {
    const s = ok(socketRune(noelAt(20, { 'spread@magic': 1, 'focus@magic': 1 }), 'noel', 'fire-star', 1, spread));
    const r = unsocketRune(s, 'noel', 'fire-star', 1);
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.party.roster.noel).not.toHaveProperty('sockets');
    expect(r.state.runes).toEqual({ 'spread@magic': 1, 'focus@magic': 1 });
    expect(unsocketRune(r.state, 'noel', 'fire-star', 0)).toEqual({ ok: false, reason: 'empty' });
    expect(unsocketRune(s, 'liz', 'twin-slash', 0)).toEqual({ ok: false, reason: 'invalid' });
    // A rune left in the first slot keeps its array; the empty end is trimmed.
    const two = ok(socketRune(ok(socketRune(noelAt(20, { 'spread@magic': 1, 'ignite@magic': 1 }), 'noel', 'fire-star', 0, ignite)), 'noel', 'fire-star', 1, spread));
    const back = unsocketRune(two, 'noel', 'fire-star', 1);
    expect(back.ok && back.state.party.roster.noel.sockets).toEqual({ 'fire-star': [ignite] });
    const front = unsocketRune(two, 'noel', 'fire-star', 0);
    expect(front.ok && front.state.party.roster.noel.sockets).toEqual({ 'fire-star': [null, spread] });
  });

  it('a rune that does not fit can still be socketed', () => {
    const s = noelAt(20, { 'ignite@magic': 1 });
    s.party.recruited = [...s.party.recruited, 'sylvie'];
    s.party.roster.sylvie = { ...s.party.roster.sylvie, level: 20, tree: defaultTree('sylvie', 20) };
    const r = ok(socketRune(s, 'sylvie', 'aimed-shot', 0, ignite));
    const refs = r.party.roster.sylvie.sockets!['aimed-shot'].filter((x): x is RuneRef => x !== null);
    expect(runeStates(SKILLS['aimed-shot'], refs)[0].miss).toMatchObject({ kind: 'needs' });
  });

  it('a skill forgotten hands its runes back, and nothing else changes', () => {
    const s = ok(socketRune(noelAt(20, { 'spread@magic': 1 }), 'noel', 'fire-star', 0, spread));
    expect(returnOrphanRunes(s, 'noel')).toBe(s);
    const lost: GameState = structuredClone(s);
    lost.party.roster.noel.sockets = { ...lost.party.roster.noel.sockets, moonlight: [focus, null] };
    const back = returnOrphanRunes(lost, 'noel');
    expect(back.party.roster.noel.sockets).toEqual({ 'fire-star': [spread] });
    expect(back.runes).toEqual({ 'focus@magic': 1 });
    expect(lost.party.roster.noel.sockets).toHaveProperty('moonlight');
  });
});

describe('repairing rune fields (plan 8e Task 2)', () => {
  it('a list longer than her slots is cut back even when its end is empty', () => {
    const s = noelAt(10, {});
    s.party.roster.noel.sockets = { 'fire-star': [ignite, null] };
    const d = JSON.parse(JSON.stringify(s));
    expect(validRuneFields(d)).toBe(false);
    repairRuneFields(d);
    expect(validRuneFields(d)).toBe(true);
    expect(d.party.roster.noel.sockets).toEqual({ 'fire-star': [ignite] });
    expect(d.runes).toEqual({});
  });
  it('a member the save cannot read is left for the validation to refuse', () => {
    const s = noelAt(10, {});
    const d = JSON.parse(JSON.stringify(s));
    d.party.roster.noel.level = 'x';
    d.party.roster.noel.sockets = { moonlight: [spread] };
    const before = JSON.stringify(d);
    repairRuneFields(d);
    expect(JSON.stringify(d)).toBe(before);
  });
});
