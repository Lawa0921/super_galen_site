import { describe, expect, it } from 'vitest';
import { createBattle, resolveRound, type Action, type BattleState } from '../battle';
import type { BattleEvent, Combatant } from '../combatant';
import { mulberry32 } from '../rng';
import { choose, partyAt } from '../sim';
import { constRng, makeBattle, makeCombatant } from '../testing';
import { SKILLS } from '../../data/skills';
import { castDef } from './index';
import { BEAT } from './beat';

const safira = (beat = 0, last: string | null = null, over: Partial<Combatant> = {}) => makeCombatant({
  key: 'safira', side: 'party', defId: 'safira', mech: { kind: 'beat', beat, last },
  max: { hp: 200, tp: 99, atk: 40, def: 20, mag: 20, res: 20, spd: 50 }, ...over,
});
const P = (key: string, over: Partial<Combatant> = {}) => makeCombatant({ key, side: 'party', defId: key, ...over });
const foe = () => makeCombatant({ key: 'e0', side: 'enemy', frozen: true, max: { hp: 99999, tp: 0, atk: 20, def: 20, mag: 20, res: 20, spd: 1 } });
const beatOf = (s: BattleState) => { const m = s.party.find((c) => c.key === 'safira')?.mech; return m?.kind === 'beat' ? [m.beat, m.last] : null; };
const step = (s: BattleState, a: Action) => { const r = resolveRound(s, { safira: a }, constRng(0.5)); r.enemies[0].frozen = true; return r; };
const skill = (id: string): Action => ({ kind: 'skill', skill: id, target: 'e0' });

describe("Safira's beat", () => {
  it('a different move each round counts up the beat; the same one twice trips it', () => {
    let s = makeBattle([safira()], [foe()]);
    s = step(s, { kind: 'attack', target: 'e0' });
    s = step(s, skill('blade-dance'));
    s = step(s, { kind: 'attack', target: 'e0' });
    expect(beatOf(s)).toEqual([3, 'attack']);
    s = step(s, { kind: 'attack', target: 'e0' });
    expect(beatOf(s)).toEqual([0, 'attack']);
    expect(s.log).toContainEqual({ type: 'mech', actor: 'safira', cue: 'misstep' });
  });

  it('each beat is 10% more power and more buff', () => {
    const s = makeBattle([safira(2)], [foe()]);
    const pct = (b: number) => (100 + BEAT.pctPer * b) / 100;
    const dmg = castDef(s, s.party[0], SKILLS['blade-dance']).effects[0];
    expect(dmg.kind === 'damage' && dmg.power).toBe(Math.round(50 * pct(2)));
    const buff = castDef(s, s.party[0], SKILLS['war-dance']).effects[0];
    expect(buff.kind === 'buff' && buff.pct).toBe(Math.round(25 * pct(2)));
    // Not hers: nothing.
    expect(castDef(s, P('liz', { mech: { kind: 'beat', beat: 2, last: null } }), SKILLS['blade-dance'])).toBe(SKILLS['blade-dance']);
  });

  it("the fourth beat's move is the finale: for the whole party, a round longer, a hit more; then back to one", () => {
    const s = makeBattle([safira(4, 'attack')], [foe()]);
    const step4 = castDef(s, s.party[0], SKILLS['mirage-step']);
    expect(step4.target).toBe('allies');
    expect(step4.effects[0]).toMatchObject({ kind: 'buff', stat: 'spd', turns: 4 });
    expect(castDef(s, s.party[0], SKILLS['blade-dance']).effects[0]).toMatchObject({ hits: 4 });
    const r = step(s, skill('blade-dance'));
    expect(r.log).toContainEqual({ type: 'mech', actor: 'safira', cue: 'finale' });
    expect(r.log.filter((e) => e.type === 'damage' && e.target === 'e0')).toHaveLength(4);
    expect(beatOf(r)).toEqual([1, 'blade-dance']);
  });

  it("a clap fills everyone's gauge and adds a beat", () => {
    const s = makeBattle([safira(1, 'attack', { limit: 0 }), P('noel', { limit: 50 })], [foe()]);
    const r = step(s, { kind: 'skill', skill: 'clap' });
    expect(beatOf(r)).toEqual([3, 'clap']);   // a new move, and the clap's own
    expect(r.party.map((c) => c.limit)).toEqual([10 + 12, 60]);   // her own action's gain too
    expect(SKILLS.clap.tp).toBe(0);
  });

  it('the mirage step jumps to the fourth beat', () => {
    const r = step(makeBattle([safira(0, null)], [foe()]), { kind: 'skill', skill: 'mirage-step' });
    expect(beatOf(r)).toEqual([4, 'mirage-step']);
  });

  it("the sim's alternate rule keeps the beat: no misstep in her first five rounds", () => {
    const party = partyAt(35, { ids: ['hero', 'liz', 'sylvie', 'safira', 'bobby'] });
    let s = createBattle({ party, enemyIds: ['lanterneater'], boss: true, inventory: {}, revealed: {}, scale: { depth: 3, region: 'mainline' } });
    s.enemies[0].max.hp = s.enemies[0].hp = 10 ** 7;   // it outlasts the five rounds
    const rng = mulberry32(7919);
    const seen: BattleEvent[] = [];
    for (let r = 0; r < 5 && s.outcome === 'ongoing'; r++) { s = resolveRound(s, choose(s, party), rng); seen.push(...s.log); }
    expect(s.round).toBe(5);
    expect(seen.filter((e) => e.type === 'act' && e.actor === 'safira').length).toBe(5);
    expect(seen.filter((e) => e.type === 'mech' && e.cue === 'misstep')).toEqual([]);
  });

  it('the beat draws nothing', () => {
    const draws = (beat: number) => {
      let n = 0;
      resolveRound(makeBattle([safira(beat, 'attack')], [foe()]), { safira: skill('shadow-step') }, () => { n++; return 0.5; });
      return n;
    };
    expect(draws(3)).toBe(draws(0));
  });
});
