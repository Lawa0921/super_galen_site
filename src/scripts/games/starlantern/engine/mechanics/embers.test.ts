import { describe, expect, it } from 'vitest';
import { forcedTarget, intentLabel, planEnemies, resolveRound, type Action, type BattleState, type EnemyAction } from '../battle';
import { dealDamage, hitAmount, rollHit, type Combatant } from '../combatant';
import { lossOf, newLedger } from '../ledger';
import { constRng, makeBattle, makeCombatant } from '../testing';
import { SKILLS } from '../../data/skills';
import { ENEMIES } from '../../data/enemies';
import type { EnemyDef } from '../types';
import { castDef, memberWords } from './index';
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
    // 15% of 200 = 30: 20 from the embers, 10 from her HP.
    expect(r.party[0].hp).toBe(190);
    expect(embersOf(r.party[0])).toBe(0);
    const rich = round(makeBattle([scarlet({ mech: { kind: 'embers', embers: 50 } })], [foe('e0', { frozen: true })]), { scarlet: { kind: 'skill', skill: 'flame-burst', target: 'e0' } });
    expect(rich.party[0].hp).toBe(200);
    expect(embersOf(rich.party[0])).toBe(20);
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
    // A fast foe fells Scarlet first: the cover ends with her, and the slow foe's planned blow lands on Noel.
    const t = makeBattle([P('noel'), scarlet({ row: 'back', hp: 1, cover: { ally: 'noel', turns: 2 } }), sturdy()], [soft('e0', 1), soft('e1', 99)]);
    planEnemies(t, constRng(0.5));
    expect([t.intents!.e0.shownTarget, t.intents!.e1.shownTarget]).toEqual(['scarlet', 'scarlet']);
    const u = resolveRound(t, {}, constRng(0.5));
    expect(u.party[1].alive).toBe(false);
    expect(u.party[0].hp).toBeLessThan(200);
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
