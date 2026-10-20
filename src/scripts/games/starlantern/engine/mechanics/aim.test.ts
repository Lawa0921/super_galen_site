import { describe, expect, it } from 'vitest';
import { resolveRound, turnOrder, type Action, type BattleState } from '../battle';
import { hitAmount, rollHit, type Combatant, type HitRolls } from '../combatant';
import { constRng, makeBattle, makeCombatant } from '../testing';
import { SKILLS } from '../../data/skills';
import { castDef } from './index';
import { AIM } from './aim';

const sylvie = (aim: { target: string | null; stacks: number; lock?: number } = { target: null, stacks: 0 }, over: Partial<Combatant> = {}) => makeCombatant({
  key: 'sylvie', side: 'party', defId: 'sylvie', melee: false, mech: { kind: 'aim', ...aim },
  max: { hp: 200, tp: 99, atk: 40, def: 20, mag: 20, res: 20, spd: 50 }, ...over,
});
const foe = (key: string, over: Partial<Combatant> = {}) =>
  makeCombatant({ key, side: 'enemy', sleep: 9, max: { hp: 99999, tp: 0, atk: 20, def: 20, mag: 20, res: 20, spd: 1 }, ...over });
const aimOf = (s: BattleState) => { const m = s.party.find((c) => c.key === 'sylvie')?.mech; return m?.kind === 'aim' ? { target: m.target, stacks: m.stacks, ...(m.lock ? { lock: m.lock } : {}) } : null; };
const act = (a: Action): Record<string, Action> => ({ sylvie: a });
const round = (s: BattleState, acts: Record<string, Action>, rng = constRng(0.5)) => resolveRound(s, acts, rng);
const shot = { power: 100, element: 'phys' as const, scale: 'atk' as const, melee: false };
const R: HitRolls = { variance: 1, crit: false, blocked: false };

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
    expect(aimOf(s)).toEqual({ target: 'e0', stacks: AIM.cap });
  });

  it('each stack is more damage and more crit on that target only', () => {
    const t = foe('e0');
    const base = hitAmount(sylvie({ target: 'e0', stacks: 0 }), t, shot, R).amount;
    expect(hitAmount(sylvie({ target: 'e0', stacks: 2 }), t, shot, R).amount).toBe(Math.max(1, Math.floor(hitAmount(sylvie(), t, shot, R).amount * (1 + (AIM.dmgPct * 2) / 100))));
    expect(hitAmount(sylvie({ target: 'e1', stacks: 2 }), t, shot, R).amount).toBe(base);
    // Crit: each stack adds AIM.critPct points on that foe (tuned to 0 in Task 4: then no crit roll is added either).
    const draws = (stacks: number) => { let n = 0; rollHit(sylvie({ target: 'e0', stacks }), t, shot, () => { n++; return 0.5; }); return n; };
    if (AIM.critPct > 0) {
      const crit = (v: number) => { let i = 0; return rollHit(sylvie({ target: 'e0', stacks: 2 }), t, shot, () => (i++ === 0 ? 0.5 : v))?.crit; };
      expect(crit((AIM.critPct * 2) / 100 - 0.01)).toBe(true);
      expect(crit((AIM.critPct * 2) / 100 + 0.01)).toBe(false);
      expect(draws(2)).toBe(2);
    } else expect(draws(2)).toBe(draws(0));
    let n = 0;
    expect(rollHit(sylvie({ target: 'e1', stacks: 2 }), t, shot, () => { n++; return 0.01; })?.crit).toBe(false);
    expect(n).toBe(1);   // no aim there: no crit chance, no crit roll
  });

  it('starfall spends the stacks for 50% each', () => {
    const s = makeBattle([sylvie({ target: 'e0', stacks: 3 })], [foe('e0')]);
    const d = castDef(s, s.party[0], SKILLS['starfall-arrow']).effects[0];
    expect(d.kind === 'damage' && d.power).toBe(Math.round((260 * (100 + AIM.consumePct * 3)) / 100));
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
