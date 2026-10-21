import { describe, expect, it } from 'vitest';
import { resolveRound, turnOrder, type Action, type BattleState } from '../battle';
import { dealDamage, hitAmount, rollHit, type Combatant, type HitRolls } from '../combatant';
import { constRng, makeBattle, makeCombatant } from '../testing';
import { SKILLS } from '../../data/skills';
import { castDef, foeWords } from './index';
import { skillFor } from '../battle';

const sylvie = (aim: { target: string | null; stacks: number; lock?: number } = { target: null, stacks: 0 }, over: Partial<Combatant> = {}) => makeCombatant({
  key: 'sylvie', side: 'party', defId: 'sylvie', melee: false, mech: { kind: 'aim', ...aim },
  max: { hp: 200, tp: 99, atk: 40, def: 20, mag: 20, res: 20, spd: 50 }, ...over,
});
const foe = (key: string, over: Partial<Combatant> = {}) =>
  makeCombatant({ key, side: 'enemy', sleep: 9, max: { hp: 99999, tp: 0, atk: 1, def: 20, mag: 20, res: 20, spd: 1 }, ...over });   // harmless: she outlives every test
const aimOf = (s: BattleState) => { const m = s.party.find((c) => c.key === 'sylvie')?.mech; return m?.kind === 'aim' ? { target: m.target, stacks: m.stacks, ...(m.lock ? { lock: m.lock } : {}) } : null; };
const act = (a: Action): Record<string, Action> => ({ sylvie: a });
const round = (s: BattleState, acts: Record<string, Action>, rng = constRng(0.5)) => resolveRound(s, acts, rng);
const shot = { power: 100, element: 'phys' as const, scale: 'atk' as const, melee: false };
const R: HitRolls = { variance: 1, crit: false, blocked: false };

describe("an owner's words go when she falls (plan 8c final)", () => {
  it("Rin's mark and Sylvie's aim end with them", () => {
    const rin = makeCombatant({ key: 'rin', side: 'party', defId: 'rin', hp: 5, mech: { kind: 'mark', marks: ['e0'], cap: 1 } });
    const syl = makeCombatant({ key: 'sylvie', side: 'party', defId: 'sylvie', hp: 5, mech: { kind: 'aim', target: 'e0', stacks: 3, lock: 2 } });
    const s = makeBattle([rin, syl], [makeCombatant({ key: 'e0', side: 'enemy' })]);
    expect(foeWords(s, s.enemies[0]).map((w) => w.text)).toEqual(['暗記', '瞄準3・鎖定']);
    dealDamage(rin, 99);
    dealDamage(syl, 99);
    expect(rin.mech).toEqual({ kind: 'mark', marks: [], cap: 1 });
    expect(syl.mech).toEqual({ kind: 'aim', target: null, stacks: 0 });
    expect(foeWords(s, s.enemies[0])).toEqual([]);
  });
});

describe("Sylvie's aim", () => {
  it('aim builds on the same target and resets on another', () => {
    let s = makeBattle([sylvie()], [foe('e0'), foe('e1')]);
    s = round(s, act({ kind: 'attack', target: 'e0' }));
    s = round(s, act({ kind: 'attack', target: 'e0' }));
    expect(aimOf(s)).toEqual({ target: 'e0', stacks: 2 });
    s = round(s, act({ kind: 'skill', skill: 'arrow-rain' }));   // an area shot leaves the aim alone
    expect(aimOf(s)).toEqual({ target: 'e0', stacks: 2 });
    s.enemies[1].hp = 1;
    s = round(s, act({ kind: 'attack', target: 'e1' }));
    expect(s.enemies[1].alive).toBe(false);
    expect(aimOf(s)).toEqual({ target: null, stacks: 0 });   // switched to e1, which fell
    s = round(s, act({ kind: 'attack', target: 'e0' }));
    expect(aimOf(s)).toEqual({ target: 'e0', stacks: 1 });
    for (let i = 0; i < 4; i++) s = round(s, act({ kind: 'attack', target: 'e0' }));
    expect(aimOf(s)).toEqual({ target: 'e0', stacks: 3 });   // the cap
  });

  it('each stack is more damage and more crit on that target only', () => {
    const t = foe('e0');
    const base = hitAmount(sylvie({ target: 'e0', stacks: 0 }), t, shot, R).amount;
    expect(hitAmount(sylvie({ target: 'e0', stacks: 2 }), t, shot, R).amount).toBe(Math.max(1, Math.floor(hitAmount(sylvie(), t, shot, R).amount * 1.2)));   // 10% a stack
    expect(hitAmount(sylvie({ target: 'e1', stacks: 2 }), t, shot, R).amount).toBe(base);
    // Crit: none a stack (tuned to 0 in Task 4), so no crit roll is added either.
    const draws = (stacks: number) => { let n = 0; rollHit(sylvie({ target: 'e0', stacks }), t, shot, () => { n++; return 0.5; }); return n; };
    expect(draws(2)).toBe(draws(0));
    expect(rollHit(sylvie({ target: 'e0', stacks: 3 }), t, shot, () => 0.001)?.crit).toBe(false);
    let n = 0;
    expect(rollHit(sylvie({ target: 'e1', stacks: 2 }), t, shot, () => { n++; return 0.01; })?.crit).toBe(false);
    expect(n).toBe(1);   // no aim there: no crit chance, no crit roll
  });

  it('starfall spends the stacks for 50% each', () => {
    const s = makeBattle([sylvie({ target: 'e0', stacks: 3 })], [foe('e0')]);
    const d = castDef(s, s.party[0], SKILLS['starfall-arrow']).effects[0];
    expect(d.kind === 'damage' && d.power).toBe(650);   // 260 at +50% a stack: x2.5
    const after = round(s, act({ kind: 'skill', skill: 'starfall-arrow', target: 'e0' }));
    expect(aimOf(after)).toEqual({ target: 'e0', stacks: 1 });   // spent to 0, then this shot is one on the same target
  });

  it("the hunter's mark locks three stacks for four rounds", () => {
    let s = makeBattle([sylvie()], [foe('e0'), foe('e1')]);
    s = round(s, act({ kind: 'skill', skill: 'hunters-mark', target: 'e0' }));
    expect(aimOf(s)).toEqual({ target: 'e0', stacks: 3, lock: 3 });   // 4 rounds, one gone
    const atE1 = hitAmount(s.party[0], s.enemies[1], shot, R).amount;
    expect(atE1).toBe(hitAmount(sylvie(), s.enemies[1], shot, R).amount);   // no bonus away from the mark
    s = round(s, act({ kind: 'attack', target: 'e1' }));
    expect(aimOf(s)).toEqual({ target: 'e0', stacks: 3, lock: 2 });   // the lock holds
    for (let i = 0; i < 2; i++) s = round(s, act({ kind: 'defend' }));
    expect(aimOf(s)).toEqual({ target: 'e0', stacks: 3 });
    s = round(s, act({ kind: 'attack', target: 'e1' }));
    expect(aimOf(s)).toEqual({ target: 'e1', stacks: 1 });   // unlocked: the ordinary rule
  });

  it('a pinned foe acts last next round, and the pin draws nothing', () => {
    let s = makeBattle([sylvie()], [foe('e0', { sleep: 0, max: { hp: 99999, tp: 0, atk: 20, def: 20, mag: 20, res: 20, spd: 999 } })]);
    s = round(s, act({ kind: 'skill', skill: 'pin-shot', target: 'e0' }));
    expect(s.enemies[0].delay).toBe(s.round + 1);
    const order = (st: BattleState, rng: () => number) => turnOrder([...st.party, ...st.enemies], rng, st.round + 1).map((c) => c.key);
    let n = 0, m = 0;
    expect(order(s, () => { n++; return 0.5; })).toEqual(['sylvie', 'e0']);
    expect(turnOrder([...s.party, ...s.enemies], () => { m++; return 0.5; }).map((c) => c.key)).toEqual(['e0', 'sylvie']);
    expect(n).toBe(m);
  });

  it('scatter shot fires three hits at random foes', () => {
    const s = makeBattle([sylvie()], [foe('e0'), foe('e1'), foe('e2')]);
    const hits = round(s, act({ kind: 'skill', skill: 'scatter-shot' }), (() => { let i = 0; const v = [0.1, 0.4, 0.7, 0.95]; return () => v[i++ % v.length]; })()).log
      .filter((e) => e.type === 'damage' && e.target !== 'sylvie');
    expect(hits).toHaveLength(3);
    expect(aimOf(round(s, act({ kind: 'skill', skill: 'scatter-shot' })))).toEqual({ target: null, stacks: 0 });
  });
});

describe("Sylvie's aim nodes (plan 8d Task 6)", () => {
  it('patience raises the cap', () => {
    let s = makeBattle([sylvie({ target: 'e0', stacks: 3 }, { ranks: { 'sylvie-patience': 1 } })], [foe('e0')]);
    s = round(s, act({ kind: 'attack', target: 'e0' }));
    expect(aimOf(s)).toEqual({ target: 'e0', stacks: 4 });
    s = round(s, act({ kind: 'attack', target: 'e0' }));
    expect(aimOf(s)).toEqual({ target: 'e0', stacks: 4 });
    expect(aimOf(round(makeBattle([sylvie({ target: 'e0', stacks: 3 })], [foe('e0')]), act({ kind: 'attack', target: 'e0' })))).toEqual({ target: 'e0', stacks: 3 });
  });

  it('shift keeps stacks across a switch, and across a fall', () => {
    const shift = { ranks: { 'sylvie-shift': 2 } };
    const s = round(makeBattle([sylvie({ target: 'e0', stacks: 3 }, shift)], [foe('e0'), foe('e1')]), act({ kind: 'attack', target: 'e1' }));
    expect(aimOf(s)).toEqual({ target: 'e1', stacks: 3 });                // min(3, 2) kept, then +1
    expect(aimOf(round(makeBattle([sylvie({ target: 'e0', stacks: 3 })], [foe('e0'), foe('e1')]), act({ kind: 'attack', target: 'e1' })))).toEqual({ target: 'e1', stacks: 1 });
    // Her foe falls: the next single shot starts from what she keeps.
    let f = makeBattle([sylvie({ target: 'e0', stacks: 3 }, shift)], [foe('e0', { hp: 1 }), foe('e1')]);
    f = round(f, act({ kind: 'attack', target: 'e0' }));
    expect(aimOf(f)?.target).toBeNull();
    f = round(f, act({ kind: 'attack', target: 'e1' }));
    expect(aimOf(f)).toEqual({ target: 'e1', stacks: 3 });
  });

  it('one shot makes each stack count double', () => {
    const t = foe('e0');
    const one = sylvie({ target: 'e0', stacks: 3 }, { ranks: { 'aimed-shot': 1, 'sylvie-aim-one': 1 } });
    const spec = skillFor(one, 'aimed-shot')!.effects[0] as { power: number; element: 'phys'; scale: 'atk'; melee: boolean; aimPct?: number };
    expect(spec.aimPct).toBe(18);                                          // tuned from the plan's 20 (8d Task 6)
    const base = hitAmount(sylvie({ target: 'e0', stacks: 0 }), t, spec, R).amount;
    expect(hitAmount(one, t, spec, R).amount).toBe(Math.max(1, Math.floor(base * 1.54)));   // 18% a stack, three stacks
    expect(hitAmount(one, t, { ...spec, aimPct: undefined }, R).amount).toBe(Math.max(1, Math.floor(base * 1.3)));   // the plain 10%
  });

  it('cover adds stacks to her aimed foe without a draw', () => {
    const cover = { ranks: { 'arrow-rain': 1, 'sylvie-rain-cover': 2 } };
    const s = round(makeBattle([sylvie({ target: 'e1', stacks: 1 }, cover)], [foe('e0'), foe('e1')]), act({ kind: 'skill', skill: 'arrow-rain' }));
    expect(aimOf(s)).toEqual({ target: 'e1', stacks: 3 });
    // No aim yet: the first foe it strikes.
    expect(aimOf(round(makeBattle([sylvie({ target: null, stacks: 0 }, cover)], [foe('e0'), foe('e1')]), act({ kind: 'skill', skill: 'arrow-rain' })))).toEqual({ target: 'e0', stacks: 2 });
    const draws = (ranks: Record<string, number>) => {
      let n = 0;
      resolveRound(makeBattle([sylvie({ target: 'e1', stacks: 1 }, { ranks })], [foe('e0'), foe('e1')]), act({ kind: 'skill', skill: 'arrow-rain' }), () => { n++; return 0.5; });
      return n;
    };
    expect(draws(cover.ranks)).toBe(draws({ 'arrow-rain': 1 }));
  });
});
