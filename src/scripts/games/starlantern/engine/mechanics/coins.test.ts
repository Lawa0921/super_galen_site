import { describe, expect, it } from 'vitest';
import { resolveRound, rewards, type Action, type BattleState } from '../battle';
import type { Combatant } from '../combatant';
import { choose, partyAt } from '../sim';
import { constRng, makeBattle, makeCombatant } from '../testing';
import { mulberry32 } from '../rng';
import { SKILLS } from '../../data/skills';
import { ENEMIES } from '../../data/enemies';
import { castDef } from './index';

const liz = (coins: number, over: Partial<Combatant> = {}) => makeCombatant({
  key: 'liz', side: 'party', defId: 'liz', mech: { kind: 'coins', coins },
  max: { hp: 200, tp: 99, atk: 40, def: 20, mag: 20, res: 20, spd: 50 }, ...over,
});
const foe = (key: string, over: Partial<Combatant> = {}) =>
  makeCombatant({ key, side: 'enemy', sleep: 9, max: { hp: 99999, tp: 0, atk: 20, def: 20, mag: 20, res: 20, spd: 1 }, ...over });
const coinsOf = (s: BattleState) => { const m = s.party.find((c) => c.key === 'liz')?.mech; return m?.kind === 'coins' ? m.coins : NaN; };
const cast = (skill: string, target = 'e0'): Record<string, Action> => ({ liz: { kind: 'skill', skill, target } });
const round = (s: BattleState, acts: Record<string, Action>, rng = constRng(0.5)) => resolveRound(s, acts, rng);

describe("Liz's coins", () => {
  it('every landed hit is a coin, up to ten', () => {
    expect(coinsOf(round(makeBattle([liz(0)], [foe('e0')]), cast('twin-slash')))).toBe(2);
    // A hit that is dodged earns nothing.
    expect(coinsOf(round(makeBattle([liz(0)], [foe('e0', { x: { evasion: 100 } })]), cast('twin-slash'), constRng(0)))).toBe(0);
    expect(coinsOf(round(makeBattle([liz(9)], [foe('e0')]), cast('twin-slash')))).toBe(10);
  });

  it('pickpocket takes two more', () => {
    expect(coinsOf(round(makeBattle([liz(0)], [foe('e0')]), cast('pickpocket')))).toBe(5);   // three light hits, and two more
  });

  it('the big spender is +15% a coin and spends them all', () => {
    const s = makeBattle([liz(7)], [foe('e0')]);
    const d = castDef(s, s.party[0], SKILLS['fortune-strike']).effects[0];
    expect(d.kind === 'damage' && d.power).toBe(410);   // 200 at +15% a coin, seven coins
    expect(SKILLS['fortune-strike'].name).toBe('大手筆');
    expect(coinsOf(round(s, cast('fortune-strike')))).toBe(1);   // spent, then the blow earns one
  });

  it('the jackpot throws one hit per coin at random foes', () => {
    const s = makeBattle([liz(5)], [foe('e0'), foe('e1'), foe('e2')]);
    const def = castDef(s, s.party[0], SKILLS.jackpot);
    expect(def.effects[0]).toMatchObject({ kind: 'damage', hits: 5, scatter: true });
    // Each hit picks a living foe with the fight's pick: the same seed, the same throws.
    const throws = (seed: number) => resolveRound(s, cast('jackpot'), mulberry32(seed)).log
      .filter((e) => e.type === 'damage' && e.target !== 'liz').map((e) => (e.type === 'damage' ? e.target : ''));
    expect(throws(3)).toHaveLength(5);
    expect(throws(3)).toEqual(throws(3));
    for (const t of throws(3)) expect(['e0', 'e1', 'e2']).toContain(t);
    expect(new Set([1, 2, 3, 4, 5, 6].flatMap(throws)).size).toBe(3);   // every foe is hit sometime
    // No coins: no throw at all, and the sim reads it as worth nothing.
    const broke = makeBattle([liz(0)], [foe('e0')]);
    expect(castDef(broke, broke.party[0], SKILLS.jackpot).effects[0]).toMatchObject({ hits: 0 });
    expect(round(broke, cast('jackpot')).log.some((e) => e.type === 'damage' && e.target !== 'liz')).toBe(false);
  });

  it('an appraised foe doubles her coins when it falls', () => {
    const s = makeBattle([liz(4), makeCombatant({ key: 'noel', side: 'party', defId: 'noel', max: { hp: 100, tp: 20, atk: 999, def: 20, mag: 20, res: 20, spd: 1 } })],
      [foe('e0', { weak: ['fire', 'ice'] }), foe('e1')]);
    const appraised = round(s, cast('appraise'));
    expect(appraised.enemies[0].appraised).toBe('liz');
    expect(appraised.revealed[appraised.enemies[0].defId]).toEqual(expect.arrayContaining(['fire', 'ice']));
    // Someone else fells it: her 4 coins become 8.
    const low = structuredClone(appraised);
    low.enemies[0].hp = 1;
    const felled = round(low, { liz: { kind: 'defend' }, noel: { kind: 'attack', target: 'e0' } });
    expect(felled.enemies[0].alive).toBe(false);
    expect(coinsOf(felled)).toBe(8);
  });

  it('left-over coins become gold', () => {
    const won = makeBattle([liz(6)], [foe('e0', { alive: false, hp: 0 })], { outcome: 'win' });
    let n = 0;
    const counted = () => { n++; return 0.5; };
    const r = rewards(won, counted, false);
    const plain = rewards({ ...won, party: [liz(0)] }, (() => { let m = 0; return () => { m++; return 0.5; }; })(), false);
    expect(r.coinGold).toBe(12);   // 2 gold a coin
    expect(r.gold).toBe(plain.gold + 12);
    let m = 0;
    rewards({ ...won, party: [liz(0)] }, () => { m++; return 0.5; }, false);
    expect(n).toBe(m);   // the coins draw nothing
    expect(rewards({ ...won, outcome: 'fled' }, constRng(0.5), false).coinGold).toBe(0);
    expect(rewards({ ...won, outcome: 'lose' }, constRng(0.5), false).coinGold).toBe(0);
    expect(ENEMIES.slime).toBeDefined();
  });

  it('the sim waits for six coins', () => {
    const party = partyAt(50, { ids: ['hero', 'rin', 'liz', 'chizuru', 'selene'] });
    party.roster.liz.tree = { ...party.roster.liz.tree, jackpot: 1, 'fortune-strike': 1 };
    const withCoins = (coins: number) => {
      const s = makeBattle([liz(coins, { ranks: { ...party.roster.liz.tree } })], [foe('e0')]);
      return choose(s, party).liz;
    };
    expect(withCoins(5)).not.toMatchObject({ skill: 'jackpot' });
    expect(withCoins(5)).not.toMatchObject({ skill: 'fortune-strike' });
    expect(withCoins(6)).toMatchObject({ kind: 'skill', skill: 'jackpot' });
  });

  it('coins draw nothing but the jackpot\'s picks', () => {
    const draws = (skill: string, coins: number) => {
      let n = 0;
      const rng = () => { n++; return 0.5; };
      resolveRound(makeBattle([liz(coins)], [foe('e0', { frozen: true })]), cast(skill), rng);
      return n;
    };
    // The big spender with coins or without: the same draws.
    expect(draws('fortune-strike', 7)).toBe(draws('fortune-strike', 0));
    // The jackpot: per coin, one pick and one hit's variance.
    expect(draws('jackpot', 3) - draws('jackpot', 0)).toBe(3 * 2);
  });
});

