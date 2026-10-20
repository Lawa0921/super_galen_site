import { describe, expect, it, vi } from 'vitest';
import { createBattle, resolveRound, type BattleState } from './battle';
import type { Combatant } from './combatant';
import { mechGauge, type MechState } from './mech';
import { applyPolicy, type PolicyRule } from './policy';
import { mulberry32 } from './rng';
import { encounterTable } from './scaling';
import { castPower, choose, partyAt } from './sim';
import { makeBattle, makeCombatant } from './testing';
import { DEFAULT_POLICIES } from '../data/policies';
import { SKILLS } from '../data/skills';
import type { CharacterId, Party, SkillDef } from './types';

const P = (key: string, over: Partial<Combatant> = {}) => makeCombatant({ key, side: 'party', ...over });
const E = (key: string, over: Partial<Combatant> = {}) => makeCombatant({ key, side: 'enemy', ...over });
const sk = (...ids: string[]): SkillDef[] => ids.map((id) => SKILLS[id]);
const run = (s: BattleState, c: Combatant, castable: SkillDef[], rules: readonly PolicyRule[]) =>
  applyPolicy(s, c, castable, rules, (def) => castPower(s, c, def));

/** A fight of `party` against `enemyIds` (depth 3, main road) played to the end with `choose`, each state before its round. */
function rounds(party: Party, enemyIds: string[], boss: boolean, rng = mulberry32(7919)): BattleState[] {
  let s = createBattle({ party, enemyIds, boss, inventory: {}, revealed: {}, scale: { depth: 3, region: 'mainline' } });
  const out: BattleState[] = [];
  for (let r = 0; r < 60 && s.outcome === 'ongoing'; r++) { out.push(s); s = resolveRound(s, choose(s, party), rng); }
  return out;
}

describe('per-character policies', () => {
  it('no rule fires without a mechanic', () => {
    const s = makeBattle([P('hero')], [E('e0'), E('e1')]);
    const c = s.party[0];
    const all = Object.values(SKILLS).filter((d) => !d.passive);
    for (const [id, rules] of Object.entries(DEFAULT_POLICIES)) {
      for (const rule of rules ?? []) expect(run(s, c, all, [rule]), `${id} ${rule.kind}`).toEqual({ action: null, hold: [] });
    }
    // Whole fights on the old roster: the default policies choose exactly what no policies choose.
    const parties: Party[] = [partyAt(10), partyAt(35, { ids: ['hero', 'liz', 'sylvie', 'safira', 'bobby'] }), partyAt(35, { ids: ['hero', 'rin', 'chizuru', 'noel', 'selene'] })];
    let seen = 0;
    for (const party of parties) {
      for (const [ids, boss] of [[encounterTable('mainline', 3)[0], false], [['lanterneater'], true]] as const) {
        // Plan 8c gives Noel and Rin mechanics: read without them, the rule still holds.
        for (const st of rounds(party, [...ids], boss)) {
          const bare = structuredClone(st);
          for (const m of bare.party) delete m.mech;
          expect(choose(bare, party)).toEqual(choose(bare, party, {}));
          seen++;
        }
      }
    }
    expect(seen).toBeGreaterThan(10);
  });

  it('ensure-barrier', () => {
    const rule: PolicyRule[] = [{ kind: 'ensure-barrier', skills: ['ward'] }];
    const chizuru = (barriers?: BattleState['barriers']) => {
      const s = makeBattle([P('chizuru', { mech: { kind: 'barrier' } })], [E('e0')], barriers ? { barriers } : {});
      return { s, c: s.party[0] };
    };
    let { s, c } = chizuru();
    expect(run(s, c, sk('ward', 'pierce'), rule)).toEqual({ action: { kind: 'skill', skill: 'ward' }, hold: [] });
    ({ s, c } = chizuru([{ skill: 'ward', kind: 'guard', power: 30, turns: 2, src: 'chizuru' }]));
    expect(run(s, c, sk('ward', 'pierce'), rule).action).toBeNull();
    ({ s, c } = chizuru([{ skill: 'ward', kind: 'guard', power: 30, turns: 1, src: 'chizuru' }]));
    expect(run(s, c, sk('ward', 'pierce'), rule).action).toEqual({ kind: 'skill', skill: 'ward' });
    ({ s, c } = chizuru());
    expect(run(s, c, sk('pierce'), rule).action).toBeNull();   // ward not castable: short of TP
    // `big` and `below`: only once a boss or an elite is under that share of its HP.
    const late: PolicyRule[] = [{ kind: 'ensure-barrier', skills: ['ward'], big: true, below: 30 }];
    const facing = (foe: Partial<Combatant>) => {
      const s2 = makeBattle([P('chizuru', { mech: { kind: 'barrier' } })], [E('e0', foe)]);
      return run(s2, s2.party[0], sk('ward', 'pierce'), late).action;
    };
    expect(facing({})).toBeNull();
    expect(facing({ boss: true })).toBeNull();
    expect(facing({ boss: true, hp: 29 })).toEqual({ kind: 'skill', skill: 'ward' });
    expect(facing({ tint: 'elite', hp: 29 })).toEqual({ kind: 'skill', skill: 'ward' });
    expect(facing({ boss: true, hp: 30 })).toBeNull();
  });

  it('ensure-device', () => {
    const rule: PolicyRule[] = [{ kind: 'ensure-device', skills: ['turret'] }];
    const bobby = (mech: MechState) => { const s = makeBattle([P('bobby', { mech })], [E('e0')]); return { s, c: s.party[0] }; };
    let { s, c } = bobby({ kind: 'devices', devices: [], cap: 1 });
    expect(run(s, c, sk('turret', 'cannon'), rule).action).toEqual({ kind: 'skill', skill: 'turret' });
    ({ s, c } = bobby({ kind: 'devices', devices: [{ skill: 'turret', level: 1, turns: 1 }], cap: 1 }));
    expect(run(s, c, sk('turret', 'cannon'), rule).action).toEqual({ kind: 'skill', skill: 'turret' });
    ({ s, c } = bobby({ kind: 'devices', devices: [{ skill: 'turret', level: 1, turns: 3 }], cap: 1 }));
    expect(run(s, c, sk('turret', 'cannon'), rule).action).toBeNull();
    ({ s, c } = bobby({ kind: 'devices', devices: [], cap: 1 }));
    expect(run(s, c, sk('cannon'), rule).action).toBeNull();
  });

  it('ensure-mark', () => {
    const rule: PolicyRule[] = [{ kind: 'ensure-mark', skill: 'rin-mark' }];
    const rin = (marks: string[], e0alive = true) => {
      const s = makeBattle([P('rin', { mech: { kind: 'mark', marks, cap: 1 } })], [E('e0', { alive: e0alive, hp: e0alive ? 100 : 0 }), E('e1')]);
      return { s, c: s.party[0] };
    };
    let { s, c } = rin([]);
    expect(run(s, c, sk('rin-mark', 'rin-needle'), rule).action).toEqual({ kind: 'skill', skill: 'rin-mark', target: 'e0' });
    ({ s, c } = rin(['e0']));
    expect(run(s, c, sk('rin-mark', 'rin-needle'), rule).action).toBeNull();
    ({ s, c } = rin(['e0'], false));
    expect(run(s, c, sk('rin-mark', 'rin-needle'), rule).action).toEqual({ kind: 'skill', skill: 'rin-mark', target: 'e1' });
    // `big`: only a boss or an elite is worth it; `below`: only once it is under that share of its HP.
    const big: PolicyRule[] = [{ kind: 'ensure-mark', skill: 'rin-mark', big: true, below: 50 }];
    const foes = (e1: Partial<Combatant>) => {
      const s2 = makeBattle([P('rin', { mech: { kind: 'mark', marks: [], cap: 1 } })], [E('e0'), E('e1', e1)]);
      return run(s2, s2.party[0], sk('rin-mark', 'rin-needle'), big).action;
    };
    expect(foes({})).toBeNull();
    expect(foes({ boss: true })).toBeNull();                       // a boss at full HP: not yet
    expect(foes({ boss: true, hp: 49 })).toEqual({ kind: 'skill', skill: 'rin-mark', target: 'e1' });
    expect(foes({ tint: 'elite', hp: 49 })).toEqual({ kind: 'skill', skill: 'rin-mark', target: 'e1' });
    expect(foes({ boss: true, hp: 50 })).toBeNull();
  });

  it('alternate', () => {
    const rule: PolicyRule[] = [{ kind: 'alternate' }];
    const dancer = (last: string | null) => { const s = makeBattle([P('safira', { mech: { kind: 'beat', beat: 0, last } })], [E('e0', { alive: false, hp: 0 }), E('e1')]); return { s, c: s.party[0] }; };
    // pierce 170, fire-star 140, sweep 80 (data/skills.ts); ward deals nothing.
    const mixed = sk('sweep', 'fire-star', 'ward', 'pierce');
    let { s, c } = dancer('pierce');
    expect(run(s, c, mixed, rule).action).toEqual({ kind: 'skill', skill: 'fire-star', target: 'e1' });
    ({ s, c } = dancer('fire-star'));
    expect(run(s, c, mixed, rule).action).toEqual({ kind: 'skill', skill: 'pierce', target: 'e1' });
    // A tie keeps the castable order: the stars all hit for 140.
    ({ s, c } = dancer('thunder-star'));
    expect(run(s, c, sk('thunder-star', 'fire-star', 'ice-star'), rule).action).toEqual({ kind: 'skill', skill: 'fire-star', target: 'e1' });
    ({ s, c } = dancer('attack'));
    expect(run(s, c, sk('ward'), rule).action).toEqual({ kind: 'attack', target: 'e1' });
    ({ s, c } = dancer('fire-star'));
    expect(run(s, c, sk('fire-star'), rule).action).toEqual({ kind: 'attack', target: 'e1' });
  });

  it('spend-at holds the skill below its threshold', () => {
    const rule: PolicyRule[] = [{ kind: 'spend-at', gauge: 'coins', min: 6, skill: 'fortune-strike' }];
    const liz = (coins: number) => { const s = makeBattle([P('liz', { mech: { kind: 'coins', coins } })], [E('e0')]); return { s, c: s.party[0] }; };
    let { s, c } = liz(3);
    expect(run(s, c, sk('fortune-strike', 'twin-slash'), rule)).toEqual({ action: null, hold: ['fortune-strike'] });
    ({ s, c } = liz(6));
    expect(run(s, c, sk('fortune-strike', 'twin-slash'), rule)).toEqual({ action: { kind: 'skill', skill: 'fortune-strike', target: 'e0' }, hold: [] });
    // aim: the marked target while it stands, else the first living enemy.
    const aimRule: PolicyRule[] = [{ kind: 'spend-at', gauge: 'aim', min: 3, skill: 'starfall-arrow' }];
    const sylvie = (target: string, e1alive: boolean) => {
      const st = makeBattle([P('sylvie', { mech: { kind: 'aim', target, stacks: 3 } })], [E('e0'), E('e1', { alive: e1alive, hp: e1alive ? 100 : 0 })]);
      return { s: st, c: st.party[0] };
    };
    ({ s, c } = sylvie('e1', true));
    expect(run(s, c, sk('starfall-arrow'), aimRule).action).toEqual({ kind: 'skill', skill: 'starfall-arrow', target: 'e1' });
    ({ s, c } = sylvie('e1', false));
    expect(run(s, c, sk('starfall-arrow'), aimRule).action).toEqual({ kind: 'skill', skill: 'starfall-arrow', target: 'e0' });
    // No gauge of that kind: the rule neither fires nor holds.
    ({ s, c } = sylvie('e1', true));
    expect(run(s, c, sk('fortune-strike'), rule)).toEqual({ action: null, hold: [] });
    expect(mechGauge(c, 'aim')).toBe(3);
    expect(mechGauge(c, 'coins')).toBeUndefined();

    // Through choose: a held skill is never picked even when it is the strongest; at the threshold it is.
    const party = partyAt(20, { ids: ['hero', 'liz', 'sylvie', 'safira', 'bobby'] });
    const table = { liz: [{ kind: 'spend-at', gauge: 'coins', min: 6, skill: 'pickpocket' }] as PolicyRule[] };
    party.roster.liz.tree = { ...party.roster.liz.tree, 'liz-triple-up': 3 };   // pickpocket 55 x 3 x 150%: her strongest
    const at = (coins: number) => {
      const st = createBattle({ party, enemyIds: ['slime'], inventory: {}, revealed: {} });
      st.party.find((m) => m.key === 'liz')!.mech = { kind: 'coins', coins };
      return choose(st, party, table).liz;
    };
    const st0 = createBattle({ party, enemyIds: ['slime'], inventory: {}, revealed: {} });
    expect(choose(st0, party, {}).liz).toEqual({ kind: 'skill', skill: 'pickpocket', target: 'e0' });   // the strongest, unheld
    expect(at(3)).toEqual({ kind: 'skill', skill: 'twin-slash', target: 'e0' });
    expect(at(6)).toEqual({ kind: 'skill', skill: 'pickpocket', target: 'e0' });
  });

  it('heal-below and strongest-damage', () => {
    const heal: PolicyRule[] = [{ kind: 'heal-below', pct: 70 }];
    const s = makeBattle([P('selene'), P('hero', { hp: 60 }), P('rin', { hp: 65 })], [E('e0')]);
    expect(run(s, s.party[0], sk('pierce', 'moonlight'), heal).action).toEqual({ kind: 'skill', skill: 'moonlight', target: 'hero' });
    const fine = makeBattle([P('selene'), P('hero', { hp: 75 })], [E('e0')]);
    expect(run(fine, fine.party[0], sk('moonlight'), heal).action).toBeNull();
    expect(run(s, s.party[0], sk('pierce'), heal).action).toBeNull();   // no heal to cast
    const strong: PolicyRule[] = [{ kind: 'strongest-damage' }];
    expect(run(s, s.party[0], sk('sweep', 'pierce', 'ward'), strong).action).toEqual({ kind: 'skill', skill: 'pierce', target: 'e0' });
    expect(run(s, s.party[0], sk('ward'), strong).action).toEqual({ kind: 'attack', target: 'e0' });
  });

  it('a full gauge still comes first', () => {
    const party = partyAt(20, { ids: ['hero', 'liz', 'sylvie', 'safira', 'bobby'] });
    const s = createBattle({ party, enemyIds: ['slime'], inventory: {}, revealed: {} });
    const safira = s.party.find((m) => m.key === 'safira')!;
    safira.mech = { kind: 'beat', beat: 0, last: null };
    expect(choose(s, party).safira.kind).toBe('skill');
    safira.limit = 100;
    expect(choose(s, party).safira).toEqual({ kind: 'ultimate', target: 'e0' });
  });

  it('the default policies name real skills of their owners', () => {
    const named = (r: PolicyRule): string[] => 'skills' in r ? [...r.skills] : 'skill' in r ? [r.skill] : [];
    let n = 0;
    for (const [id, rules] of Object.entries(DEFAULT_POLICIES) as [CharacterId, PolicyRule[]][]) {
      for (const r of rules) for (const skill of named(r)) { n++; expect(SKILLS[skill]?.owner, `${id} ${skill}`).toBe(id); }
    }
    expect(n).toBe(7);
    expect(Object.keys(DEFAULT_POLICIES).sort()).toEqual(['bobby', 'chizuru', 'liz', 'rin', 'safira', 'sylvie']);
  });

  it('rules draw nothing', () => {
    expect(applyPolicy.length).toBe(5);   // no rng goes in
    const party = partyAt(10);
    // Plan 8c gives the standard five mechanics, so the policies now change the fight; what must hold is that choosing
    // never draws: no Math.random while the policies choose, through a whole fight.
    const random = vi.spyOn(Math, 'random');
    let s = createBattle({ party, enemyIds: encounterTable('mainline', 3)[0], boss: false, inventory: {}, revealed: {}, scale: { depth: 3, region: 'mainline' } });
    const rng = mulberry32(7919);
    let chose = 0;
    for (let r = 0; r < 60 && s.outcome === 'ongoing'; r++) {
      const calls = random.mock.calls.length;
      const acts = choose(s, party);
      expect(random.mock.calls.length).toBe(calls);
      chose++;
      s = resolveRound(s, acts, rng);
    }
    random.mockRestore();
    expect(chose).toBeGreaterThan(1);
  });
});
