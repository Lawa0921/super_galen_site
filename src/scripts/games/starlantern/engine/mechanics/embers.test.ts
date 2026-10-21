import { describe, expect, it } from 'vitest';
import { forcedTarget, intentLabel, planEnemies, resolveRound, type Action, type BattleState, type EnemyAction } from '../battle';
import { dealDamage, hitAmount, rollHit, type Combatant } from '../combatant';
import { lossOf, newLedger } from '../ledger';
import { constRng, makeBattle, makeCombatant } from '../testing';
import { SKILLS } from '../../data/skills';
import { ENEMIES } from '../../data/enemies';
import type { EnemyDef } from '../types';
import { castDef, initMechs, memberWords } from './index';
import { skillFor } from '../battle';
import { EMBER } from './embers';

const MAX = { hp: 200, tp: 99, atk: 40, def: 20, mag: 20, res: 20, spd: 1 };
const scarlet = (over: Partial<Combatant> = {}) => makeCombatant({ key: 'scarlet', side: 'party', defId: 'scarlet', mech: { kind: 'embers', embers: 0 }, max: MAX, ...over });
const P = (key: string, over: Partial<Combatant> = {}) => makeCombatant({ key, side: 'party', defId: key, max: { ...MAX, def: 10 }, ...over });
const foe = (key = 'e0', over: Partial<Combatant> = {}) =>
  makeCombatant({ key, side: 'enemy', max: { hp: 99999, tp: 0, atk: 200, def: 20, mag: 20, res: 20, spd: 99 }, ...over });
const embersOf = (c: Combatant) => (c.mech?.kind === 'embers' ? c.mech.embers : NaN);
const round = (s: BattleState, acts: Record<string, Action> = {}, rng = constRng(0.5)) => resolveRound(s, acts, rng);
const planEnemiesKeys = (s: BattleState) => { planEnemies(s, constRng(0.5)); return Object.keys(s.intents!.e0).sort(); };

describe("Scarlet's embers", () => {
  it('half of what she takes is kept as embers, up to half her max HP', () => {
    const s = scarlet();
    dealDamage(s, 50);
    expect(embersOf(s)).toBe(Math.floor((50 * EMBER.sharePct) / 100));
    dealDamage(s, 9, { dot: true });   // a tick counts too
    expect(embersOf(s)).toBe(25 + 4);
    const big = scarlet({ hp: 200, mech: { kind: 'embers', embers: 90 } });
    dealDamage(big, 40);
    expect(embersOf(big)).toBe(Math.floor((200 * EMBER.capPct) / 100));
    // Not hers: nobody else keeps any.
    const other = P('noel');
    dealDamage(other, 50);
    expect(other.mech).toBeUndefined();
  });

  it('a fire skill pays its HP with embers first', () => {
    const r = round(makeBattle([scarlet({ mech: { kind: 'embers', embers: 20 } })], [foe('e0', { frozen: true })]), { scarlet: { kind: 'skill', skill: 'flame-burst', target: 'e0' } });
    // 20% of 200 = 40 (plan 8d Task 7): 20 from the embers, 20 from her HP.
    expect(r.party[0].hp).toBe(180);
    expect(embersOf(r.party[0])).toBe(0);
    const rich = round(makeBattle([scarlet({ mech: { kind: 'embers', embers: 50 } })], [foe('e0', { frozen: true })]), { scarlet: { kind: 'skill', skill: 'flame-burst', target: 'e0' } });
    expect(rich.party[0].hp).toBe(200);
    expect(embersOf(rich.party[0])).toBe(10);
  });

  it('crimson end spends the embers left for power, 1% a point of max HP', () => {
    const at = (embers: number) => {
      const s = makeBattle([scarlet({ mech: { kind: 'embers', embers } })], [foe()]);
      const d = castDef(s, s.party[0], SKILLS['crimson-end']).effects[0];
      return d.kind === 'damage' ? d.power : NaN;
    };
    expect(at(0)).toBe(380);
    expect(at(60)).toBe(380);   // all of it pays the 30% HP cost
    expect(at(100)).toBe(Math.round((380 * (100 + 20)) / 100));   // 40 left of 200: +20%
    const r = round(makeBattle([scarlet({ mech: { kind: 'embers', embers: 100 } })], [foe('e0', { frozen: true })]), { scarlet: { kind: 'skill', skill: 'crimson-end', target: 'e0' } });
    expect(embersOf(r.party[0])).toBe(0);
    expect(r.party[0].hp).toBe(200);
  });

  it('taunt beats challenge beats cover beats the first target', () => {
    const intent = (target: string): EnemyAction => ({ kind: 'attack', target });
    const party = () => [scarlet(), P('noel'), P('selene', { row: 'back' })];
    const at = (s: BattleState, a = intent('noel')) => forcedTarget(s, s.enemies[0], a)?.to.key ?? a.target;
    // Nothing: the first target.
    expect(at(makeBattle(party(), [foe()]))).toBe('noel');
    // Cover: Scarlet stands in for Noel; the pool is Noel.
    const covered = makeBattle(party().map((c) => (c.key === 'scarlet' ? { ...c, cover: { ally: 'noel', turns: 2 } } : c)), [foe()]);
    expect(at(covered)).toBe('scarlet');
    expect(forcedTarget(covered, covered.enemies[0], intent('noel'))!.pool.map((c) => c.key)).toEqual(['noel']);
    expect(at(covered, intent('selene'))).toBe('selene');   // she covers Noel only
    // Challenge beats cover: Selene challenged it (a second guard) and Scarlet covers Noel.
    const challenged = makeBattle(party().map((c) => (c.key === 'scarlet' ? { ...c, cover: { ally: 'noel', turns: 2 } } : c)), [foe('e0', { challenged: { by: 'selene', round: 1 } })], { round: 1 });
    expect(at(challenged)).toBe('selene');
    // Taunt beats both.
    const taunting = structuredClone(challenged);
    taunting.party[1].taunt = 2;
    expect(at(taunting)).toBe('noel');
    expect(at(taunting, intent('selene'))).toBe('noel');
    // An area attack is never turned by cover or challenge.
    const def: EnemyDef = { ...ENEMIES.slime, skills: [{ name: '橫掃', chance: 1, target: 'row', effects: [{ kind: 'damage', power: 100, element: 'phys', scale: 'atk', melee: true }] }] };
    expect(forcedTarget({ ...challenged, enemyDefs: { e0: def } }, challenged.enemies[0], { kind: 'enemy-skill', index: 0, target: 'noel' })).toBeNull();
  });

  it('cover takes the single hit and credits what the ally was spared', () => {
    const l = newLedger();
    const soft = () => foe('e0', { max: { hp: 99999, tp: 0, atk: 60, def: 20, mag: 20, res: 20, spd: 99 } });   // neither falls
    // Selene (sturdier) stands in reach too: the pool is the covered ally alone, not everyone else the foe could hit.
    const s0 = makeBattle([scarlet({ cover: { ally: 'noel', turns: 2 } }), P('noel'), P('selene', { max: { ...MAX, def: 80 } })], [soft()],
      { intents: { e0: { kind: 'attack', target: 'noel' } } });
    const r = resolveRound(s0, {}, constRng(0.5), l);
    expect(r.party[1].hp).toBe(200);
    expect(r.party[2].hp).toBe(200);
    const taken = 200 - r.party[0].hp;
    expect(taken).toBeGreaterThan(0);
    const noel = P('noel');
    const spec = { power: 100, element: 'phys', scale: 'atk', melee: true } as const;
    const would = lossOf(noel, hitAmount(soft(), noel, spec, rollHit(soft(), noel, spec, constRng(0.5))!).amount);
    expect(would).toBeGreaterThan(taken);
    expect(l.by.scarlet.prevented).toBe(would - taken);
  });

  it('the words: 代受 on Scarlet, 受護 on the one she covers, gone when the cover ends or she falls', () => {
    const s = makeBattle([scarlet({ cover: { ally: 'noel', turns: 1 } }), P('noel'), P('selene')], [foe('e0', { sleep: 9 })]);
    const words = (b: BattleState, key: string) => memberWords(b, b.party.find((c) => c.key === key)!);
    expect(words(s, 'scarlet')).toEqual([{ tone: 'embers', text: '餘燼0' }, { tone: 'embers', text: '代受' }]);
    expect(words(s, 'noel')).toEqual([{ tone: 'embers', text: '受護' }]);
    expect(words(s, 'selene')).toEqual([]);
    const ended = round(s);
    expect(words(ended, 'scarlet')).toEqual([{ tone: 'embers', text: '餘燼0' }]);
    expect(words(ended, 'noel')).toEqual([]);
    const fallen = structuredClone(s);
    dealDamage(fallen.party[0], 999);
    expect(words(fallen, 'noel')).toEqual([]);
  });

  it("the intent shows where the blow will land (a challenge, a taunt over a challenge, a cover) and keeps the drawn target", () => {
    // Noel stands in front, the others behind: a melee foe can only pick Noel.
    const party = (over: Partial<Combatant> = {}, noel: Partial<Combatant> = {}) =>
      [P('noel', noel), scarlet({ row: 'back', ...over }), P('selene', { row: 'back' })];
    /** The planned intent's drawn target, and the one the screen shows. */
    const planned = (s: BattleState) => { planEnemies(s, constRng(0.5)); const a = s.intents!.e0; return [a.target, a.shownTarget ?? a.target]; };
    expect(planned(makeBattle(party(), [foe()]))).toEqual(['noel', 'noel']);
    expect(planEnemiesKeys(makeBattle(party(), [foe()]))).toEqual(['kind', 'target']);   // nothing added on a plain intent
    // 盾擊 hit it this round: next round's intent shows Scarlet.
    expect(planned(makeBattle(party(), [foe('e0', { challenged: { by: 'scarlet', round: 2 } })], { round: 1 }))).toEqual(['noel', 'scarlet']);
    // A taunt beats the challenge (the draw already picks the taunter).
    const both = makeBattle([P('noel'), scarlet({ row: 'back' }), P('selene', { row: 'back', taunt: 2 })], [foe('e0', { challenged: { by: 'scarlet', round: 2 } })], { round: 1 });
    expect(planned(both)).toEqual(['selene', 'selene']);
    // Scarlet covers Noel.
    expect(planned(makeBattle(party({ cover: { ally: 'noel', turns: 2 } }), [foe()], { round: 1 }))).toEqual(['noel', 'scarlet']);
    // A lone taunt: the draw itself picks the taunter, as it always has.
    expect(planned(makeBattle([P('noel'), scarlet({ row: 'back' }), P('selene', { row: 'back', taunt: 2 })], [foe()], { round: 1 }))).toEqual(['selene', 'selene']);
    // After a real 盾擊 the next intent shows her, and the label names her.
    const bashed = round(makeBattle(party(), [foe('e0', { max: { hp: 99999, tp: 0, atk: 30, def: 20, mag: 20, res: 20, spd: 1 } })]), { scarlet: { kind: 'skill', skill: 'shield-bash', target: 'e0' } });
    expect([bashed.intents!.e0.target, bashed.intents!.e0.shownTarget]).toEqual(['noel', 'scarlet']);
    expect(intentLabel(bashed, 'e0')).toBe('攻擊 → scarlet');
  });

  it('a planned intent under a cover: shown on Scarlet, credited to her, and back on its target if the cover ends first', () => {
    const soft = (key = 'e0', spd = 99, atk = 60) => foe(key, { max: { hp: 99999, tp: 0, atk, def: 20, mag: 20, res: 20, spd } });
    const sturdy = () => P('selene', { row: 'back', max: { ...MAX, def: 80 } });
    // Noel in front (the only one a melee foe can draw), Scarlet behind covering her.
    const s = makeBattle([P('noel'), scarlet({ row: 'back', cover: { ally: 'noel', turns: 2 } }), sturdy()], [soft()]);
    planEnemies(s, constRng(0.5));
    expect(s.intents!.e0).toEqual({ kind: 'attack', target: 'noel', shownTarget: 'scarlet' });
    expect(intentLabel(s, 'e0')).toBe('攻擊 → scarlet');
    const l = newLedger();
    const r = resolveRound(s, {}, constRng(0.5), l);
    expect(r.party[0].hp).toBe(200);
    const taken = 200 - r.party[1].hp;
    const spec = { power: 100, element: 'phys', scale: 'atk', melee: true } as const;
    const noel = P('noel');
    const would = lossOf(noel, hitAmount(soft(), noel, spec, rollHit(soft(), noel, spec, constRng(0.5))!).amount);
    expect(would - taken).toBeGreaterThan(0);
    expect(l.by.scarlet.prevented).toBe(would - taken);
    // Two ranged foes (anyone is in reach) both draw Noel. The fast one fells Scarlet first: the cover ends with her, and
    // the slow one's planned blow lands on Noel, its drawn target. (Had the plan held Scarlet as its target, the blow
    // would be drawn afresh among Noel and Selene: Selene, at this draw.)
    const ranged = (key: string, spd: number) => foe(key, { melee: false, max: { hp: 99999, tp: 0, atk: 60, def: 20, mag: 20, res: 20, spd } });
    const t = makeBattle([scarlet({ hp: 1, cover: { ally: 'noel', turns: 2 } }), P('noel'), sturdy()], [ranged('e0', 1), ranged('e1', 99)]);
    planEnemies(t, constRng(0.5));
    expect([t.intents!.e0, t.intents!.e1]).toEqual([{ kind: 'attack', target: 'noel', shownTarget: 'scarlet' }, { kind: 'attack', target: 'noel', shownTarget: 'scarlet' }]);
    const u = resolveRound(t, {}, constRng(0.5));
    expect(u.party[0].alive).toBe(false);
    expect(u.party[1].hp).toBeLessThan(200);
    expect(u.party[2].hp).toBe(200);
  });

  it("a cover credits only what the ally's own shield would not have caught", () => {
    const soft = () => foe('e0', { max: { hp: 99999, tp: 0, atk: 60, def: 20, mag: 20, res: 20, spd: 99 } });
    const credit = (shield?: number) => {
      const l = newLedger();
      const noel = P('noel', shield === undefined ? {} : { shield: { amount: shield, src: 'chizuru' } });
      resolveRound(makeBattle([scarlet({ cover: { ally: 'noel', turns: 2 } }), noel], [soft()], { intents: { e0: { kind: 'attack', target: 'noel' } } }), {}, constRng(0.5), l);
      return l.by.scarlet?.prevented ?? 0;
    };
    const full = credit();
    expect(full).toBeGreaterThan(10);
    expect(credit(999)).toBe(0);
    expect(credit(10)).toBe(full - 10);
  });

  it('a frozen or sleeping Scarlet neither covers nor answers with 贖火', () => {
    const soft = () => foe('e0', { max: { hp: 99999, tp: 0, atk: 60, def: 20, mag: 20, res: 20, spd: 99 } });
    for (const over of [{ frozen: true }, { sleep: 3 }] as Partial<Combatant>[]) {
      const r = round(makeBattle([scarlet({ cover: { ally: 'noel', turns: 2 }, ...over }), P('noel')], [soft()], { intents: { e0: { kind: 'attack', target: 'noel' } } }));
      expect(r.party[1].hp, JSON.stringify(over)).toBeLessThan(200);
      expect(r.party[0].hp, JSON.stringify(over)).toBe(200);
      const hit = round(makeBattle([scarlet({ riposte: { power: 80, turns: 3 }, ...over })], [soft()], { intents: { e0: { kind: 'attack', target: 'scarlet' } } }));
      expect(hit.log.filter((e) => e.type === 'mech' && e.cue === 'counter'), JSON.stringify(over)).toEqual([]);
    }
  });

  it("a veiled Rin is in no taunt's or challenge's pool", () => {
    const party = () => [scarlet({ taunt: 2 }), P('noel'), P('rin', { veil: 2 })];
    const s = makeBattle(party(), [foe()]);
    expect(forcedTarget(s, s.enemies[0], { kind: 'attack', target: 'noel' })!.pool.map((c) => c.key)).toEqual(['noel']);
    const c = makeBattle([scarlet(), P('noel'), P('rin', { veil: 2 })], [foe('e0', { challenged: { by: 'scarlet', round: 1 } })], { round: 1 });
    expect(forcedTarget(c, c.enemies[0], { kind: 'attack', target: 'noel' })!.pool.map((x) => x.key)).toEqual(['noel']);
  });

  it('cover turns no area attack, and ends after three round ends', () => {
    const sweep: EnemyDef = { ...ENEMIES.slime, skills: [{ name: '掃射', chance: 1, target: 'enemies', effects: [{ kind: 'damage', power: 50, element: 'phys', scale: 'atk', melee: false }] }] };
    const s0 = makeBattle([scarlet({ cover: { ally: 'noel', turns: 3 } }), P('noel')], [foe('e0', { max: { hp: 99999, tp: 0, atk: 60, def: 20, mag: 20, res: 20, spd: 99 } })],
      { enemyDefs: { e0: sweep }, intents: { e0: { kind: 'enemy-skill', index: 0, target: 'noel' } } });
    let s = round(s0);
    expect(s.party[1].hp).toBeLessThan(200);
    expect(s.party[0].cover).toEqual({ ally: 'noel', turns: 2 });
    s = round(s);
    expect(s.party[0].cover).toEqual({ ally: 'noel', turns: 1 });
    s = round(s);
    expect(s.party[0].cover).toBeUndefined();
  });

  it('shield bash makes the foe strike only her next round', () => {
    let s = makeBattle([scarlet(), P('noel')], [foe('e0', { max: { hp: 99999, tp: 0, atk: 200, def: 20, mag: 20, res: 20, spd: 1 } })], { intents: { e0: { kind: 'attack', target: 'noel' } } });
    s = round(s, { scarlet: { kind: 'skill', skill: 'shield-bash', target: 'e0' } });
    expect(s.enemies[0].challenged).toEqual({ by: 'scarlet', round: 2 });
    const noelBefore = s.party[1].hp;
    s.intents = { e0: { kind: 'attack', target: 'noel' } };
    const r = round(s, {});
    expect(r.party[1].hp).toBe(noelBefore);
    expect(r.party[0].hp).toBeLessThan(s.party[0].hp);
  });

  it('atoning flame answers each foe that lands a blow on her, once an action', () => {
    const s0 = makeBattle([scarlet({ riposte: { power: 80, turns: 3 } })], [foe('e0', { max: { hp: 99999, tp: 0, atk: 50, def: 20, mag: 20, res: 20, spd: 99 } })]);
    const r = round(s0, {});
    const counters = r.log.filter((e) => e.type === 'mech' && e.cue === 'counter');
    expect(counters).toEqual([{ type: 'mech', actor: 'scarlet', cue: 'counter' }]);
    expect(r.log.some((e) => e.type === 'damage' && e.target === 'e0' && e.element === 'fire')).toBe(true);
    expect(r.party[0].riposte).toEqual({ power: 80, turns: 2 });
    // The skill sets it up for her.
    const cast = round(makeBattle([scarlet()], [foe('e0', { sleep: 9 })]), { scarlet: { kind: 'skill', skill: 'atoning-flame' } });
    expect(cast.party[0].riposte).toEqual({ power: 80, turns: 3 });
  });

  it('atoning flame: one counter for a two-hit blow, even a counter that misses; none for a blow that missed her', () => {
    const twice: EnemyDef = { ...ENEMIES.slime, skills: [{ name: '連擊', chance: 1, target: 'enemy', effects: [{ kind: 'damage', power: 50, element: 'phys', scale: 'atk', melee: true, hits: 2 }] }] };
    const fight = (rng: () => number, over: { her?: Partial<Combatant>; it?: Partial<Combatant> } = {}) => {
      const s = makeBattle([scarlet({ riposte: { power: 80, turns: 3 }, ...over.her })], [foe('e0', { max: { hp: 99999, tp: 0, atk: 50, def: 20, mag: 20, res: 20, spd: 99 }, ...over.it })],
        { enemyDefs: { e0: twice }, intents: { e0: { kind: 'enemy-skill', index: 0, target: 'scarlet' } } });
      const r = resolveRound(s, {}, rng);
      return { hits: r.log.filter((e) => e.type === 'damage' && e.target === 'scarlet').length, counters: r.log.filter((e) => e.type === 'mech' && e.cue === 'counter').length, log: r.log };
    };
    expect(fight(constRng(0.5))).toMatchObject({ hits: 2, counters: 1 });
    // The foe dodges the counter (its evasion is 50%; 0.1 rolls under it): still one counter, a miss.
    const dodged = fight(constRng(0.1), { it: { x: { evasion: 100 } } });
    expect(dodged).toMatchObject({ hits: 2, counters: 1 });
    expect(dodged.log.filter((e) => e.type === 'miss' && e.target === 'e0')).toHaveLength(1);
    // She dodges both blows: nothing to answer.
    expect(fight(constRng(0.1), { her: { x: { evasion: 9999 } } })).toMatchObject({ hits: 0, counters: 0 });
  });

  it('when its owner falls: cover and atoning flame end with her', () => {
    const s = scarlet({ hp: 5, cover: { ally: 'noel', turns: 3 }, riposte: { power: 80, turns: 3 } });
    dealDamage(s, 50);
    expect(s.alive).toBe(false);
    expect([s.cover, s.riposte]).toEqual([undefined, undefined]);
  });

  it('embers draw nothing', () => {
    const draws = (embers: number) => {
      let n = 0;
      const rng = () => { n++; return 0.5; };
      resolveRound(makeBattle([scarlet({ mech: { kind: 'embers', embers } })], [foe('e0', { frozen: true })]), { scarlet: { kind: 'skill', skill: 'crimson-end', target: 'e0' } }, rng);
      return n;
    };
    expect(draws(100)).toBe(draws(0));
  });
});

describe("Scarlet's nodes (plan 8d Task 7)", () => {
  const her = (ranks: Record<string, number>, over: Partial<Combatant> = {}) => scarlet({ ranks, ...over });
  const still = () => foe('e0', { frozen: true });
  const cast = (skill: string, target?: string): Record<string, Action> => ({ scarlet: { kind: 'skill', skill, ...(target ? { target } : {}) } });
  const soft = () => foe('e0', { max: { hp: 99999, tp: 0, atk: 60, def: 20, mag: 20, res: 20, spd: 99 } });

  it('a shout stores embers, up to the cap', () => {
    const shout = (r: number, embers = 0) => embersOf(round(makeBattle([her({ provoke: 1, 'scarlet-provoke-shout': r }, { mech: { kind: 'embers', embers } })], [still()]), cast('provoke')).party[0]);
    expect(shout(1)).toBe(20);                                             // 10% of 200
    expect(shout(3)).toBe(40);                                             // 20%
    expect(shout(3, 95)).toBe(100);                                        // held at half her max HP
    expect(embersOf(round(makeBattle([her({ provoke: 1 })], [still()]), cast('provoke')).party[0])).toBe(0);
  });

  it('ardent raises the cap', () => {
    const capped = (ranks: Record<string, number>) => {
      const s = makeBattle([her(ranks)], [foe()]);
      initMechs(s);
      const c = s.party[0];
      if (c.mech?.kind === 'embers') c.mech.embers = 110;
      dealDamage(c, 40);                                                   // +20, past either cap
      return embersOf(c);
    };
    expect(capped({ 'scarlet-ardent': 1 })).toBe(120);                     // 60% of 200
    expect(capped({ 'scarlet-ardent': 3 })).toBe(130);                     // 80% is 160: not reached
    expect(capped({})).toBe(100);
  });

  it('heart: paid in embers, the blow is 30% stronger; not, it is as before', () => {
    const who = (embers: number) => her({ 'flame-burst': 1, 'scarlet-burst-heart': 1 }, { mech: { kind: 'embers', embers } });
    const power = (embers: number) => {
      const c = who(embers);
      const d = castDef(makeBattle([c], [foe()]), c, skillFor(c, 'flame-burst')!).effects[0];
      return d.kind === 'damage' ? d.power : NaN;
    };
    expect(power(40)).toBe(338);                                           // the cost is 20% of 200: all in embers; 260 x 1.3
    expect(power(39)).toBe(260);
    const r = round(makeBattle([who(39)], [still()]), cast('flame-burst', 'e0'));
    expect([r.party[0].hp, embersOf(r.party[0])]).toEqual([199, 0]);       // the rest from her HP, as in 8c
    expect(skillFor(who(0), 'flame-burst')!.name).toBe('爆炎斬・赤心');
  });

  it('thanks: a blow she takes for the one she covers adds embers', () => {
    const covered = (ranks: Record<string, number>) => {
      const s = makeBattle([her({ cover: 1, ...ranks }, { cover: { ally: 'noel', turns: 2 } }), P('noel')], [soft()], { intents: { e0: { kind: 'attack', target: 'noel' } } });
      const r = round(s);
      expect(r.log.some((e) => e.type === 'damage' && e.target === 'scarlet')).toBe(true);
      return embersOf(r.party[0]);
    };
    expect(covered({ 'scarlet-thanks': 1 }) - covered({})).toBe(10);      // 5% of 200
    // A blow at her own self is no cover: nothing more.
    const own = (ranks: Record<string, number>) => embersOf(round(makeBattle([her(ranks), P('noel')], [soft()], { intents: { e0: { kind: 'attack', target: 'scarlet' } } })).party[0]);
    expect(own({ 'scarlet-thanks': 1 })).toBe(own({}));
  });

  it('both shoulders cover two at once', () => {
    const both = { cover: 1, 'scarlet-cover-both': 1 };
    let s = makeBattle([her(both), P('noel'), P('selene')], [foe('e0', { sleep: 9 })]);
    s = round(s, cast('cover', 'noel'));
    s = round(s, cast('cover', 'selene'));
    const words = (key: string) => memberWords(s, s.party.find((c) => c.key === key)!).map((w) => w.text);
    expect(words('noel')).toContain('受護');
    expect(words('selene')).toContain('受護');
    for (const target of ['noel', 'selene']) expect(forcedTarget(s, s.enemies[0], { kind: 'attack', target })?.to.key).toBe('scarlet');
    // Each lasts its own three rounds (雙肩 r1): Noel's has one left, Selene's two.
    s = round(s);
    expect(words('noel')).not.toContain('受護');
    expect(words('selene')).toContain('受護');
    // Without the node, the second cover takes the first one's place.
    let t = makeBattle([her({ cover: 1 }), P('noel'), P('selene')], [foe('e0', { sleep: 9 })]);
    t = round(t, cast('cover', 'noel'));
    t = round(t, cast('cover', 'selene'));
    expect(forcedTarget(t, t.enemies[0], { kind: 'attack', target: 'noel' })).toBeNull();
    expect(forcedTarget(t, t.enemies[0], { kind: 'attack', target: 'selene' })?.to.key).toBe('scarlet');
    expect(skillFor(her(both), 'cover')!.name).toBe('代受・雙肩');
  });

  it('both shoulders: a cover cast again on one of the two keeps the other (8d Task 7 review)', () => {
    const both = { cover: 1, 'scarlet-cover-both': 3 };                   // five rounds each: none runs out here
    const covering = (t: BattleState) => [t.party[0].cover?.ally, t.party[0].coverAlso?.ally].filter(Boolean).sort();
    let s = makeBattle([her(both), P('noel'), P('selene')], [foe('e0', { sleep: 9 })]);
    s = round(s, cast('cover', 'noel'));
    s = round(s, cast('cover', 'selene'));
    s = round(s, cast('cover', 'selene'));                                 // the newest again
    expect(covering(s)).toEqual(['noel', 'selene']);
    expect(s.party[0].cover).toEqual({ ally: 'selene', turns: 4 });        // renewed: 5, less this round's end
    s = round(s, cast('cover', 'noel'));                                   // the older one again
    expect(covering(s)).toEqual(['noel', 'selene']);
    expect(s.party[0].cover).toEqual({ ally: 'noel', turns: 4 });
  });

  it('thanks: no embers for a covered blow that misses her, nor for a blow a challenge sent her (8d Task 7 review)', () => {
    // She dodges every blow (constRng(0) under her evasion): nothing landed, nothing kept.
    const dodged = (ranks: Record<string, number>) => embersOf(round(makeBattle([her({ cover: 1, ...ranks }, { cover: { ally: 'noel', turns: 2 }, x: { evasion: 999 } }), P('noel')], [soft()],
      { intents: { e0: { kind: 'attack', target: 'noel' } } }), {}, constRng(0)).party[0]);
    expect(dodged({ 'scarlet-thanks': 3 })).toBe(dodged({}));
    // 盾擊's challenge turns the blow (it beats her cover): it lands on her, but no cover took it.
    const challenged = (ranks: Record<string, number>) => {
      const s = makeBattle([her({ cover: 1, ...ranks }, { cover: { ally: 'noel', turns: 2 } }), P('noel')], [foe('e0', { challenged: { by: 'scarlet', round: 1 }, max: { hp: 99999, tp: 0, atk: 60, def: 20, mag: 20, res: 20, spd: 99 } })],
        { round: 0, intents: { e0: { kind: 'attack', target: 'noel' } } });
      const r = round(s);
      expect(r.log.some((e) => e.type === 'damage' && e.target === 'scarlet')).toBe(true);
      return embersOf(r.party[0]);
    };
    expect(challenged({ 'scarlet-thanks': 3 })).toBe(challenged({}));
  });
});
