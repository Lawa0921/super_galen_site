import { describe, expect, it } from 'vitest';
import { createBattle, resolveRound, type BattleState } from '../battle';
import type { Combatant } from '../combatant';
import { mulberry32 } from '../rng';
import { choose, partyAt } from '../sim';
import { constRng, makeBattle, makeCombatant } from '../testing';
import { SKILLS } from '../../data/skills';
import { ECHO, echoDef, echoOf } from './echo';

const MAX = { hp: 300, tp: 99, atk: 40, def: 20, mag: 60, res: 20, spd: 10 };
const hero = (over: Partial<Combatant> = {}) => makeCombatant({ key: 'hero', side: 'party', defId: 'hero', max: { ...MAX, spd: 1 }, ...over });
const P = (key: string, over: Partial<Combatant> = {}) => makeCombatant({ key, side: 'party', defId: key, max: { ...MAX, spd: 50 }, ...over });
const foe = () => makeCombatant({ key: 'e0', side: 'enemy', sleep: 9, max: { hp: 99999, tp: 0, atk: 1, def: 20, mag: 1, res: 20, spd: 20 } });

describe("the hero's echo", () => {
  it("echoes a companion's last skill at 70%, at her TP, named for it", () => {
    const s0 = makeBattle([hero(), P('noel', { mech: { kind: 'heat', heat: 3 } })], [foe()]);
    const r = resolveRound(s0, { noel: { kind: 'skill', skill: 'fire-star', target: 'e0' }, hero: { kind: 'echo', target: 'e0' } }, constRng(0.5));
    const rec = echoOf(r)!;
    expect(rec).toMatchObject({ by: 'noel', round: 1, cost: SKILLS['fire-star'].tp });
    expect((rec.def.effects[0] as { power: number }).power).toBe(174);   // 140 at heat 3: +24%
    expect((echoDef(rec).effects[0] as { power: number }).power).toBe(Math.round((174 * ECHO.powerPct) / 100));
    expect(r.log).toContainEqual({ type: 'act', actor: 'hero', label: '殘響・火之星彈' });
    expect(r.party[0].tp).toBe(99 - SKILLS['fire-star'].tp);
    expect(r.log.filter((e) => e.type === 'damage' && e.target === 'e0')).toHaveLength(2);
    // His own echo is not a skill of hers to echo again; the record is still Noel's.
    expect(echoOf(r)!.by).toBe('noel');
  });

  it('short of TP he loses the turn, as with a skill', () => {
    const s0 = makeBattle([hero({ tp: 1 }), P('noel')], [foe()]);
    const r = resolveRound(s0, { noel: { kind: 'skill', skill: 'fire-star', target: 'e0' }, hero: { kind: 'echo', target: 'e0' } }, constRng(0.5));
    expect(r.log).toContainEqual({ type: 'no-tp', actor: 'hero' });
    expect(r.log.some((e) => e.type === 'act' && e.actor === 'hero')).toBe(false);
  });

  it("only this round's or the last round's, and only plain skills of a companion", () => {
    const s: BattleState = { ...makeBattle([hero(), P('noel')], [foe()], { round: 3 }), echo: { by: 'noel', round: 1, def: SKILLS['fire-star'], cost: 5 } };
    expect(echoOf(s)).toBeNull();
    expect(echoOf({ ...s, echo: { ...s.echo!, round: 2 } })).not.toBeNull();
    expect(echoOf({ ...s, round: 2 }, 3)).toBeNull();
    // A barrier, a device, the moon, the coins and his own skills are never recorded.
    const recorded = (key: string, skill: string, over: Partial<Combatant> = {}) => {
      const r = resolveRound(makeBattle([hero(), P(key, over)], [foe()]), { [key]: { kind: 'skill', skill, target: 'e0' } }, constRng(0.5));
      return echoOf(r)?.def.id ?? null;
    };
    expect(recorded('chizuru', 'ward', { mech: { kind: 'barrier' } })).toBeNull();
    expect(recorded('bobby', 'turret', { mech: { kind: 'devices', devices: [], cap: 2 } })).toBeNull();
    expect(recorded('selene', 'full-moon-night')).toBeNull();
    expect(recorded('liz', 'fortune-strike', { mech: { kind: 'coins', coins: 3 } })).toBeNull();
    expect(recorded('selene', 'moonlight')).toBe('moonlight');
    const own = resolveRound(makeBattle([hero()], [foe()]), { hero: { kind: 'skill', skill: 'hero-slash', target: 'e0' } }, constRng(0.5));
    expect(echoOf(own)).toBeNull();
  });

  it('the sim never echoes', () => {
    const party = partyAt(20, { ids: ['hero', 'noel', 'rin', 'chizuru', 'selene'] });
    let s = createBattle({ party, enemyIds: ['lanterneater'], boss: true, inventory: {}, revealed: {}, scale: { depth: 5, region: 'mainline' } });
    const rng = mulberry32(7919);
    let seen = 0;
    for (let r = 0; r < 12 && s.outcome === 'ongoing'; r++) {
      const acts = choose(s, party);
      expect(Object.values(acts).some((a) => a.kind === 'echo')).toBe(false);
      s = resolveRound(s, acts, rng);
      seen++;
    }
    expect(seen).toBeGreaterThan(1);
  });
});
