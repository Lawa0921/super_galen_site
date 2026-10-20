import { describe, expect, it } from 'vitest';
import { LIMIT_PER_ACTION, resolveRound, type BattleState } from '../battle';
import { rollHit, type Combatant } from '../combatant';
import { applyEffect, type EffectContext } from '../skills';
import { constRng, makeBattle, makeCombatant } from '../testing';

const rin = (over: Partial<Combatant> = {}) => makeCombatant({
  key: 'rin', side: 'party', defId: 'rin', mech: { kind: 'mark', marks: [], cap: 1 },
  max: { hp: 200, tp: 99, atk: 40, def: 20, mag: 20, res: 20, spd: 50 }, ...over,
});
const P = (key: string, over: Partial<Combatant> = {}) => makeCombatant({ key, side: 'party', defId: key, ...over });
const foe = (key: string, over: Partial<Combatant> = {}) =>
  makeCombatant({ key, side: 'enemy', sleep: 9, max: { hp: 99999, tp: 0, atk: 30, def: 20, mag: 20, res: 20, spd: 1 }, ...over });
const marksOf = (c: Combatant) => (c.mech?.kind === 'mark' ? c.mech.marks : null);
const ctxOf = (s: BattleState): EffectContext => ({ rng: constRng(0.5), itemBoost: false, revealed: {}, log: s.log, battle: s });
const phys = { power: 100, element: 'phys' as const, scale: 'atk' as const, melee: false };

describe("Rin's mark and 還有。", () => {
  it("rin's hits on her mark always crit and draw no crit roll", () => {
    const counted = (marked: boolean) => {
      let n = 0;
      const rng = () => { n++; return 0.99; };
      const r = rollHit(rin({ x: { crit: 10 }, mech: { kind: 'mark', marks: marked ? ['e0'] : [], cap: 1 } }), foe('e0'), phys, rng);
      return { n, crit: r?.crit };
    };
    expect(counted(true)).toEqual({ n: 1, crit: true });
    expect(counted(false)).toEqual({ n: 2, crit: false });
    // Only her: another member's hits on the same foe roll as ever.
    let n = 0;
    expect(rollHit(P('noel', { x: { crit: 10 } }), foe('e0'), phys, () => { n++; return 0.99; })?.crit).toBe(false);
    expect(n).toBe(2);
  });

  it('marking moves the mark', () => {
    const s = makeBattle([rin()], [foe('e0'), foe('e1', { hp: 1 })]);
    const r = s.party[0];
    applyEffect(r, s.enemies[0], { kind: 'mark' }, ctxOf(s));
    expect(marksOf(r)).toEqual(['e0']);
    applyEffect(r, s.enemies[1], { kind: 'mark' }, ctxOf(s));
    expect(marksOf(r)).toEqual(['e1']);
    applyEffect(r, s.enemies[1], { kind: 'damage', ...phys }, ctxOf(s));
    expect(s.enemies[1].alive).toBe(false);
    expect(marksOf(r)).toEqual([]);
  });

  it('felling her mark brings 還有。: the same command again, once a round', () => {
    const marked = (...keys: string[]) => ({ mech: { kind: 'mark' as const, marks: keys, cap: 1 } });
    const fight = (tp: number) => {
      const s = makeBattle([rin({ tp, ...marked('e0') })], [foe('e0', { hp: 1 }), foe('e1', { hp: 1 }), foe('e2')]);
      return resolveRound(s, { rin: { kind: 'skill', skill: 'rin-needle', target: 'e0' } }, constRng(0.5));
    };
    const r = fight(99);
    const acts = r.log.filter((e) => e.type === 'act' && e.actor === 'rin');
    expect(acts.map((e) => e.type === 'act' && e.label)).toEqual(['飛針', '飛針']);
    expect(r.log.filter((e) => e.type === 'mech')).toEqual([{ type: 'mech', actor: 'rin', cue: 'again' }]);
    expect(r.enemies.map((e) => e.alive)).toEqual([false, false, true]);   // the second kill brings nothing more
    expect(r.party[0].limit).toBe(LIMIT_PER_ACTION);
    // Short of TP for the same skill: a plain attack instead.
    const poor = fight(3);
    expect(poor.log.filter((e) => e.type === 'act' && e.actor === 'rin').map((e) => e.type === 'act' && e.label)).toEqual(['飛針', '攻擊']);
    // A kill that was not her mark brings nothing.
    const other = resolveRound(makeBattle([rin(marked('e2'))], [foe('e0', { hp: 1 }), foe('e1'), foe('e2')]), { rin: { kind: 'attack', target: 'e0' } }, constRng(0.5));
    expect(other.enemies[0].alive).toBe(false);
    expect(other.log.some((e) => e.type === 'mech')).toBe(false);
    // A new round brings it back; a kill that leaves nobody brings nothing.
    const r1 = resolveRound(makeBattle([rin(marked('e0'))], [foe('e0', { hp: 1 }), foe('e1'), foe('e2', { hp: 1 })]), { rin: { kind: 'attack', target: 'e0' } }, constRng(0.5));
    expect(r1.log.filter((e) => e.type === 'mech')).toHaveLength(1);
    const again = structuredClone(r1);
    again.party[0].mech = { kind: 'mark', marks: ['e2'], cap: 1 };
    const r2 = resolveRound(again, { rin: { kind: 'attack', target: 'e2' } }, constRng(0.5));
    expect(r2.log.filter((e) => e.type === 'mech')).toHaveLength(1);
    const last = resolveRound(makeBattle([rin(marked('e0'))], [foe('e0', { hp: 1 })]), { rin: { kind: 'attack', target: 'e0' } }, constRng(0.5));
    expect(last.outcome).toBe('win');
    expect(last.log.some((e) => e.type === 'mech')).toBe(false);
  });

  it('veil hides rin unless everyone in reach is veiled', () => {
    const intents = { e0: { kind: 'attack' as const, target: 'rin' } };
    const attacker = () => foe('e0', { sleep: 0, max: { hp: 99999, tp: 0, atk: 300, def: 20, mag: 20, res: 20, spd: 1 } });
    const hidden = resolveRound(makeBattle([rin({ veil: 2 }), P('scarlet', { max: { hp: 9999, tp: 20, atk: 20, def: 20, mag: 20, res: 20, spd: 1 } })], [attacker()], { intents }), {}, constRng(0.5));
    expect(hidden.party[0].hp).toBe(200);
    expect(hidden.party[1].hp).toBeLessThan(9999);
    const alone = resolveRound(makeBattle([rin({ veil: 2 })], [attacker()], { intents }), {}, constRng(0.5));
    expect(alone.party[0].hp).toBeLessThan(200);
    // Two round ends and the veil is gone.
    let s = makeBattle([rin({ veil: 2 })], [foe('e0')]);
    s = resolveRound(s, {}, constRng(0.5));
    expect(s.party[0].veil).toBe(1);
    s = resolveRound(s, {}, constRng(0.5));
    expect(s.party[0].veil).toBeUndefined();
    // Casting it: the veil, and her next landed hit crits, once.
    const ctx = ctxOf(s);
    const r = s.party[0];
    applyEffect(r, r, { kind: 'veil', turns: 2 }, ctx);
    expect([r.veil, r.nextCrit]).toEqual([2, true]);
    const hit = resolveRound(makeBattle([rin({ nextCrit: true })], [foe('e0')]), { rin: { kind: 'attack', target: 'e0' } }, constRng(0.99));
    expect(hit.log.find((e) => e.type === 'damage')).toMatchObject({ crit: true });
    expect(hit.party[0].nextCrit).toBeUndefined();
  });

  it('the veil ends with her first blow, which still crits', () => {
    // Rin (fast) strikes from the veil; the foe (slow) then finds her: the veil is gone the moment she hits.
    const attacker = foe('e0', { sleep: 0, max: { hp: 99999, tp: 0, atk: 300, def: 20, mag: 20, res: 20, spd: 1 } });
    const intents = { e0: { kind: 'attack' as const, target: 'rin' } };
    const struck = resolveRound(makeBattle([rin({ veil: 4, nextCrit: true }), P('scarlet', { max: { hp: 9999, tp: 20, atk: 20, def: 20, mag: 20, res: 20, spd: 1 } })], [attacker], { intents }),
      { rin: { kind: 'attack', target: 'e0' } }, constRng(0.99));
    expect(struck.log.find((e) => e.type === 'damage' && e.target === 'e0')).toMatchObject({ crit: true });
    expect(struck.party[0].veil).toBeUndefined();
    expect(struck.party[0].hp).toBeLessThan(200);
    // A skill that hurts ends it too; one that does not (defending, marking) keeps it.
    const needled = resolveRound(makeBattle([rin({ veil: 4 })], [foe('e0')]), { rin: { kind: 'skill', skill: 'rin-needle', target: 'e0' } }, constRng(0.5));
    expect(needled.party[0].veil).toBeUndefined();
    const kept = resolveRound(makeBattle([rin({ veil: 4 })], [foe('e0')]), { rin: { kind: 'skill', skill: 'rin-mark', target: 'e0' } }, constRng(0.5));
    expect(kept.party[0].veil).toBe(3);
    const waited = resolveRound(makeBattle([rin({ veil: 4 })], [foe('e0')]), { rin: { kind: 'defend' } }, constRng(0.5));
    expect(waited.party[0].veil).toBe(3);
  });

  it('when its owner or its target falls', () => {
    // Her mark's foe felled by someone else: the mark goes with it, and no 還有。 for a kill that was not hers.
    const s = makeBattle([rin({ mech: { kind: 'mark', marks: ['e0'], cap: 1 } }), P('noel', { max: { hp: 100, tp: 20, atk: 999, def: 20, mag: 20, res: 20, spd: 99 } })],
      [foe('e0', { hp: 1 }), foe('e1')]);
    const r = resolveRound(s, { noel: { kind: 'attack', target: 'e0' }, rin: { kind: 'defend' } }, constRng(0.5));
    expect(r.enemies[0].alive).toBe(false);
    expect(marksOf(r.party[0])).toEqual([]);
    expect(r.log.some((e) => e.type === 'mech')).toBe(false);
    // A foe that falls to a round-end tick loses her mark that same round.
    const ticked = resolveRound(makeBattle([rin({ mech: { kind: 'mark', marks: ['e0'], cap: 1 } })], [foe('e0', { hp: 3, burn: { tick: 5, turns: 2, src: 'rin' } }), foe('e1')]),
      { rin: { kind: 'defend' } }, constRng(0.5));
    expect(ticked.enemies[0].alive).toBe(false);
    expect(marksOf(ticked.party[0])).toEqual([]);
    // A fallen Rin acts no more, again or otherwise.
    const down = resolveRound(makeBattle([rin({ alive: false, hp: 0 }), P('noel')], [foe('e0', { hp: 1 }), foe('e1')]),
      { noel: { kind: 'attack', target: 'e0' } }, constRng(0.5));
    expect(down.log.some((e) => e.type === 'mech' || (e.type === 'act' && e.actor === 'rin'))).toBe(false);
  });
});

describe('mechanic cues', () => {
  it("each mechanic colours its own moment; one nobody claims is plain", async () => {
    const { cueWord } = await import('./index');
    expect(cueWord('overload').tone).toBe('heat');
    expect(cueWord('again').tone).toBe('mark');
    expect(cueWord('nobody' as never)).toEqual({ tone: 'plain', text: 'nobody' });
  });
});
