import { describe, expect, it } from 'vitest';
import { resolveRound, type Action, type BattleState } from '../battle';
import { elementMult, hitAmount, type Combatant, type HitRolls } from '../combatant';
import { newLedger } from '../ledger';
import { applyEffect, type EffectContext } from '../skills';
import { constRng, makeBattle, makeCombatant } from '../testing';
import { SKILLS } from '../../data/skills';
import { castDef } from './index';
import { HEAT } from './heat';
import { T } from '../../data/text.zh-TW';

const noel = (heat: number, over: Partial<Combatant> = {}) => makeCombatant({
  key: 'noel', side: 'party', defId: 'noel', mech: { kind: 'heat', heat },
  max: { hp: 200, tp: 999, atk: 20, def: 20, mag: 60, res: 20, spd: 10 }, ...over,
});
/** A foe that sleeps through the round and does not fall. */
const foe = (over: Partial<Combatant> = {}) => makeCombatant({ key: 'e0', side: 'enemy', sleep: 9, max: { hp: 99999, tp: 0, atk: 20, def: 20, mag: 20, res: 20, spd: 1 }, ...over });
const cast = (skill: string): Record<string, Action> => ({ noel: { kind: 'skill', skill, target: 'e0' } });
const heatOf = (s: BattleState) => { const m = s.party[0].mech; return m?.kind === 'heat' ? m.heat : NaN; };
const pct = (base: number, p: number) => Math.round((base * p) / 100);

describe("Noel's heat", () => {
  it('fire and thunder heat her up, ice cools her down', () => {
    const after = (heat: number, skill: string) => heatOf(resolveRound(makeBattle([noel(heat)], [foe()]), cast(skill), constRng(0.5)));
    expect(after(0, 'fire-star')).toBe(1);
    expect(after(1, 'thunder-star')).toBe(2);
    expect(after(2, 'ice-star')).toBe(0);
    expect(after(1, 'ice-star')).toBe(0);   // never below 0
    expect(after(HEAT.max - 1, 'fire-star')).toBe(HEAT.max);
    expect(after(3, 'hex')).toBe(3);         // no damage, no heat
    expect(after(3, 'blizzard')).toBe(3 - HEAT.iceCool);
  });

  it('each point of heat is more spell power', () => {
    const s = makeBattle([noel(0)], [foe()]);
    const power = (heat: number) => { const d = castDef(s, noel(heat), SKILLS['fire-star']).effects[0]; return d.kind === 'damage' ? d.power : NaN; };
    expect(power(0)).toBe(140);
    expect(power(3)).toBe(pct(140, 100 + 3 * HEAT.pctPer));
    expect(power(3)).toBeGreaterThan(140);
    expect(castDef(s, noel(3), SKILLS.hex)).toBe(SKILLS.hex);   // nothing to scale: the same def
    // Her plain attack and her ultimate do not run hot.
    const hit = (heat: number, act: Action) => {
      const r = resolveRound(makeBattle([noel(heat, { limit: 100 })], [foe()]), { noel: act }, constRng(0.5));
      return r.log.filter((e) => e.type === 'damage').map((e) => (e.type === 'damage' ? e.amount : 0));
    };
    expect(hit(3, { kind: 'attack', target: 'e0' })).toEqual(hit(0, { kind: 'attack', target: 'e0' }));
    expect(hit(3, { kind: 'ultimate', target: 'e0' })).toEqual(hit(0, { kind: 'ultimate', target: 'e0' }));
    expect(hit(0, { kind: 'ultimate', target: 'e0' }).length).toBeGreaterThan(0);
  });

  it('at full heat she overloads: more power, then backlash', () => {
    const s = makeBattle([noel(HEAT.max)], [foe()]);
    const d = castDef(s, noel(HEAT.max), SKILLS['fire-star']).effects[0];
    expect(d.kind === 'damage' && d.power).toBe(pct(140, HEAT.overloadPct));
    const l = newLedger();
    const r = resolveRound(makeBattle([noel(HEAT.max)], [foe()]), cast('fire-star'), constRng(0.5), l);
    const back = Math.floor((200 * HEAT.backlashPct) / 100);
    // The foe wakes to her hit and strikes back; take that out, and what is left is the backlash.
    const taken = r.log.reduce((n, e) => n + (e.type === 'damage' && e.target === 'noel' ? e.amount : 0), 0);
    expect(heatOf(r)).toBe(0);
    expect(r.party[0].hp).toBe(200 - back - taken);
    expect(r.log).toContainEqual({ type: 'mech', actor: 'noel', cue: 'overload', amount: back });
    const hitGain = taken ? Math.max(1, Math.floor((taken / 200) * 40)) : 0;
    expect(r.party[0].limit).toBe(12 + hitGain);   // the cast's own gain and the foe's hit: backlash fills no gauge
    expect(Object.keys(l.by)).toEqual(['noel']);
    expect(l.by.noel.prevented + l.by.noel.healing + l.by.noel.shield).toBe(0);
    // Backlash never fells her.
    const low = resolveRound(makeBattle([noel(HEAT.max, { hp: 5 })], [foe({ frozen: true })]), cast('fire-star'), constRng(0.5));   // a frozen foe loses its turn
    expect(low.party[0].hp).toBe(1);
    expect(low.party[0].alive).toBe(true);
    expect(low.log).toContainEqual({ type: 'mech', actor: 'noel', cue: 'overload', amount: 4 });
    // At 1 HP nothing is lost: the overload still shows, with no backlash to tell.
    const none = resolveRound(makeBattle([noel(HEAT.max, { hp: 1 })], [foe({ frozen: true })]), cast('fire-star'), constRng(0.5));
    expect(none.log.filter((e) => e.type === 'mech')).toEqual([{ type: 'mech', actor: 'noel', cue: 'overload' }]);
    expect(T.log.mech('諾艾兒', 'overload')).not.toContain('反噬');
    expect(T.log.mech('諾艾兒', 'overload', 30)).toContain('反噬 30');
  });

  it('hex makes fire, ice and thunder weak points for three rounds', () => {
    const ctx: EffectContext = { rng: constRng(0.5), itemBoost: false, revealed: {}, log: [] };
    const t = foe({ resist: ['fire'] });
    for (const e of SKILLS.hex.effects) applyEffect(noel(0), t, e, ctx);
    expect(t.exposed).toBe(3);
    expect(elementMult(t, 'fire')).toBe(1.5);
    expect(elementMult(t, 'ice')).toBe(1.5);
    expect(elementMult(t, 'thunder')).toBe(1.5);
    expect(elementMult(t, 'phys')).toBe(1);
    // vuln reads it as a weakness; so does weak-tp.
    const r: HitRolls = { variance: 1, crit: false, blocked: false };
    const ice = { power: 100, element: 'ice' as const, scale: 'mag' as const, melee: false };
    const plain = foe();
    const ratio = (t2: Combatant) => hitAmount(noel(0, { x: { vuln: 100 } }), t2, ice, r).amount / hitAmount(noel(0), t2, ice, r).amount;
    expect(ratio(t)).toBeCloseTo(2, 1);
    expect(ratio(plain)).toBe(1);
    const tpd = noel(0, { keystones: ['weak-tp'], tp: 0 });
    applyEffect(tpd, t, { kind: 'damage', ...ice }, ctx);
    expect(tpd.tp).toBeGreaterThan(0);
    // Three round ends and it is gone.
    let s = makeBattle([noel(0)], [t]);
    for (let i = 0; i < 3; i++) s = resolveRound(s, {}, constRng(0.5));
    expect(s.enemies[0].exposed).toBeUndefined();
  });

  it('heat draws nothing', () => {
    const draws = (skill: string) => {
      let n = 0;
      const rng = () => { n++; return 0.5; };
      let s = makeBattle([noel(0)], [foe()]);
      for (let i = 0; i < 8; i++) s = resolveRound(s, cast(skill), rng);
      return { n, heat: heatOf(s) };
    };
    const fire = draws('fire-star'), ice = draws('ice-star');
    expect(fire.n).toBe(ice.n);
    expect(fire.heat).not.toBe(ice.heat);
  });
});
