import { describe, expect, it, vi } from 'vitest';
import { createBattle, resolveRound, skillFor, type Action, type BattleState } from './battle';
import type { Combatant } from './combatant';
import { mechGauge, type MechState, type MoonPhase } from './mech';
import { applyPolicy, reach, type PolicyRule } from './policy';
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
    ({ s, c } = bobby({ kind: 'devices', devices: [{ skill: 'turret', kind: 'turret', power: 70, level: 1, turns: 1 }], cap: 1 }));
    expect(run(s, c, sk('turret', 'cannon'), rule).action).toEqual({ kind: 'skill', skill: 'turret' });
    ({ s, c } = bobby({ kind: 'devices', devices: [{ skill: 'turret', kind: 'turret', power: 70, level: 1, turns: 3 }], cap: 1 }));
    expect(run(s, c, sk('turret', 'cannon'), rule).action).toBeNull();
    ({ s, c } = bobby({ kind: 'devices', devices: [], cap: 1 }));
    expect(run(s, c, sk('cannon'), rule).action).toBeNull();
    // `big`: only while a boss or an elite stands (plan 8c Task 6).
    const big: PolicyRule[] = [{ kind: 'ensure-device', skills: ['turret'], big: true }];
    const vs = (foe: Partial<Combatant>) => { const b = makeBattle([P('bobby', { mech: { kind: 'devices', devices: [], cap: 2 } })], [E('e0', foe)]); return run(b, b.party[0], sk('turret', 'cannon'), big).action; };
    expect(vs({})).toBeNull();
    expect(vs({ boss: true })).toEqual({ kind: 'skill', skill: 'turret' });
    expect(vs({ tint: 'elite' })).toEqual({ kind: 'skill', skill: 'turret' });
  });

  it('ensure-device keeps two turrets out once the turret sets a twin (雙砲台, plan 8d Task 8)', () => {
    const rule: PolicyRule[] = [{ kind: 'ensure-device', skills: ['turret', 'shock-mine'] }];
    const turret = { skill: 'turret', kind: 'turret' as const, power: 38, level: 1, turns: 3 };
    const twin = skillFor({ powers: [], ranks: { turret: 1, 'bobby-turret-pair': 1 } }, 'turret')!;
    const at = (devices: (typeof turret)[], castable: SkillDef[]) => {
      const s = makeBattle([P('bobby', { mech: { kind: 'devices', devices, cap: 3 } })], [E('e0')]);
      return run(s, s.party[0], castable, rule).action;
    };
    // One turret out: the twin turret is cast again for the second; a plain turret goes on to the mine.
    expect(at([turret], [twin, SKILLS['shock-mine']])).toEqual({ kind: 'skill', skill: 'turret' });
    expect(at([turret], sk('turret', 'shock-mine'))).toEqual({ kind: 'skill', skill: 'shock-mine' });
    // Two out: the mine next.
    expect(at([turret, { ...turret }], [twin, SKILLS['shock-mine']])).toEqual({ kind: 'skill', skill: 'shock-mine' });
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
    // `repeat`: with one damage skill and it was the last move, cast it again rather than attack (the beat is missed).
    const again: PolicyRule[] = [{ kind: 'alternate', repeat: true }];
    ({ s, c } = dancer('fire-star'));
    expect(run(s, c, sk('fire-star', 'ward'), again).action).toEqual({ kind: 'skill', skill: 'fire-star', target: 'e1' });
    expect(run(s, c, sk('ward'), again).action).toEqual({ kind: 'attack', target: 'e1' });   // nothing to repeat
    ({ s, c } = dancer('attack'));
    expect(run(s, c, sk('fire-star'), again).action).toEqual({ kind: 'skill', skill: 'fire-star', target: 'e1' });
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
    // pickpocket 55 x 3 x 120% at rank 3: her strongest (her tree without 大手筆 and its variants, plan 8d Task 6).
    party.roster.liz.tree = { 'twin-slash': 1, stealth: 1, pickpocket: 3 };
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
    expect(n).toBe(9);   // Bobby's three devices (plan 8c Task 6)
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

describe('build policy rules (plan 8h Task 1)', () => {
  const skill = (id: string, target?: string): Action => (target === undefined ? { kind: 'skill', skill: id } : { kind: 'skill', skill: id, target });

  it('ensure-taunt', () => {
    const rule: PolicyRule[] = [{ kind: 'ensure-taunt', skill: 'provoke' }];
    const at = (taunt: number, castable = sk('provoke', 'pierce')) => {
      const s = makeBattle([P('scarlet', { taunt })], [E('e0')]);
      return run(s, s.party[0], castable, rule).action;
    };
    expect(at(2)).toBeNull();
    expect(at(1)).toEqual(skill('provoke'));
    expect(at(0)).toEqual(skill('provoke'));
    expect(at(0, sk('pierce'))).toBeNull();   // not castable
  });

  it('ensure-cover', () => {
    const rule: PolicyRule[] = [{ kind: 'ensure-cover', skill: 'cover' }];
    const at = (over: Partial<Combatant> = {}, castable = sk('cover')) => {
      const s = makeBattle([P('scarlet', { hp: 10, ...over }), P('noel', { hp: 60 }), P('rin', { hp: 30 }), P('liz', { hp: 0, alive: false })], [E('e0')]);
      return run(s, s.party[0], castable, rule).action;
    };
    // The lowest share of HP among the others standing: Rin at 30%, not Scarlet herself at 10% nor fallen Liz.
    expect(at()).toEqual(skill('cover', 'rin'));
    expect(at({ cover: { ally: 'rin', turns: 2 } })).toBeNull();
    expect(at({}, sk('pierce'))).toBeNull();
    // A cover on an ally who has fallen covers no one.
    expect(at({ cover: { ally: 'liz', turns: 2 } })).toEqual(skill('cover', 'rin'));
    // A tie keeps the party order; the share, not the HP, decides.
    const tie = makeBattle([P('scarlet'), P('noel', { hp: 50 }), P('rin', { hp: 50 })], [E('e0')]);
    expect(run(tie, tie.party[0], sk('cover'), rule).action).toEqual(skill('cover', 'noel'));
    const share = makeBattle([P('scarlet'), P('noel', { hp: 90, max: { hp: 300 } as Combatant['max'] }), P('rin', { hp: 50 })], [E('e0')]);
    expect(run(share, share.party[0], sk('cover'), rule).action).toEqual(skill('cover', 'noel'));
    // Alone: no one to cover.
    const alone = makeBattle([P('scarlet')], [E('e0')]);
    expect(run(alone, alone.party[0], sk('cover'), rule).action).toBeNull();
  });

  it('release-at', () => {
    const rule: PolicyRule[] = [{ kind: 'release-at', min: 3, skill: 'heaven-spear' }];
    const at = (b: Partial<NonNullable<BattleState['barriers']>[number]>, castable = sk('heaven-spear', 'pierce')) => {
      const s = makeBattle([P('chizuru', { mech: { kind: 'barrier' } })], [E('e0', { alive: false, hp: 0 }), E('e1')], { barriers: [{ skill: 'ward', kind: 'guard', power: 30, turns: 2, src: 'chizuru', ...b }] });
      return run(s, s.party[0], castable, rule).action;
    };
    expect(at({ turns: 2 })).toBeNull();
    expect(at({ turns: 3 })).toEqual(skill('heaven-spear', 'e1'));
    expect(at({ turns: 4 })).toEqual(skill('heaven-spear', 'e1'));
    expect(at({ turns: 3, src: 'hero' })).toBeNull();   // someone else's barrier
    expect(at({ turns: 1, lasting: true })).toEqual(skill('heaven-spear', 'e1'));
    expect(at({ turns: 3 }, sk('pierce'))).toBeNull();
    const none = makeBattle([P('chizuru', { mech: { kind: 'barrier' } })], [E('e0')]);
    expect(run(none, none.party[0], sk('heaven-spear'), rule).action).toBeNull();
  });

  it('at-phase', () => {
    const at = (phase: MoonPhase | null, rule: PolicyRule, castable: SkillDef[]) => {
      const s = makeBattle([P('selene', { hp: 90 }), P('hero', { hp: 40 }), P('rin', { hp: 70 })], [E('e0', { alive: false, hp: 0 }), E('e1')], phase ? { moon: { phase } } : {});
      return run(s, s.party[0], castable, [rule]).action;
    };
    const full: PolicyRule = { kind: 'at-phase', phase: 'full', skill: 'full-moon' };
    expect(at('full', full, sk('full-moon'))).toEqual(skill('full-moon'));   // all allies: no target
    expect(at('first', full, sk('full-moon'))).toBeNull();
    expect(at(null, full, sk('full-moon'))).toBeNull();
    expect(at('full', full, sk('moonlight'))).toBeNull();   // not castable
    // Targets: a single foe gets the first one standing; a single ally the lowest share of HP.
    expect(at('new', { kind: 'at-phase', phase: 'new', skill: 'pierce' }, sk('pierce'))).toEqual(skill('pierce', 'e1'));
    expect(at('waning', { kind: 'at-phase', phase: 'waning', skill: 'moonlight' }, sk('moonlight'))).toEqual(skill('moonlight', 'hero'));
  });

  it('execute-below', () => {
    const rule: PolicyRule[] = [{ kind: 'execute-below', pct: 35, skill: 'rin-execute' }];
    const at = (marks: string[], hps: number[], castable = sk('rin-execute', 'rin-needle')) => {
      const s = makeBattle([P('rin', { mech: { kind: 'mark', marks, cap: 1 } })], hps.map((hp, i) => E(`e${i}`, { hp, alive: hp > 0 })));
      return run(s, s.party[0], castable, rule).action;
    };
    expect(at([], [50, 20, 20])).toEqual(skill('rin-execute', 'e1'));
    expect(at(['e2'], [50, 20, 20])).toEqual(skill('rin-execute', 'e2'));   // her mark first
    expect(at(['e0'], [50, 20, 20])).toEqual(skill('rin-execute', 'e1'));   // a mark above the line does not count
    expect(at([], [35, 50])).toBeNull();                                       // 35% is not under 35%
    expect(at([], [0, 34])).toEqual(skill('rin-execute', 'e1'));             // the fallen are not foes
    expect(at([], [20], sk('rin-needle'))).toBeNull();
  });

  it('cast-unless-last', () => {
    const rule: PolicyRule[] = [{ kind: 'cast-unless-last', skill: 'clap' }];
    const at = (mech: MechState | undefined, castable = sk('clap', 'blade-dance')) => {
      const s = makeBattle([P('safira', mech ? { mech } : {})], [E('e0')]);
      return run(s, s.party[0], castable, rule).action;
    };
    expect(at({ kind: 'beat', beat: 1, last: 'clap' })).toBeNull();
    expect(at({ kind: 'beat', beat: 1, last: 'blade-dance' })).toEqual(skill('clap'));
    expect(at({ kind: 'beat', beat: 0, last: null })).toEqual(skill('clap'));
    expect(at(undefined)).toBeNull();                                          // no beat to keep
    expect(at({ kind: 'beat', beat: 1, last: 'attack' }, sk('blade-dance'))).toBeNull();
  });

  it('cast-when', () => {
    const at = (rule: PolicyRule, foe: Partial<Combatant> = {}, buffs: Combatant['buffs'] = [], castable = sk('mirage-step', 'blade-dance')) => {
      const s = makeBattle([P('safira', { buffs }), P('hero')], [E('e0', foe)]);
      return run(s, s.party[0], castable, [rule]).action;
    };
    const plain: PolicyRule = { kind: 'cast-when', skill: 'mirage-step' };
    expect(at(plain)).toEqual(skill('mirage-step'));
    expect(at(plain, {}, [], sk('blade-dance'))).toBeNull();
    const big: PolicyRule = { kind: 'cast-when', skill: 'mirage-step', big: true };
    expect(at(big)).toBeNull();
    expect(at(big, { boss: true })).toEqual(skill('mirage-step'));
    expect(at(big, { tint: 'elite' })).toEqual(skill('mirage-step'));
    // `whileAbsent`: not while the effect she gave with it still holds on its target.
    const absent: PolicyRule = { kind: 'cast-when', skill: 'mirage-step', whileAbsent: true };
    expect(at(absent)).toEqual(skill('mirage-step'));
    expect(at(absent, {}, [{ stat: 'spd', pct: 30, turns: 1, src: 'safira' }])).toBeNull();
    expect(at(absent, {}, [{ stat: 'spd', pct: 30, turns: 2, src: 'hero' }])).toEqual(skill('mirage-step'));    // someone else's
    expect(at(absent, {}, [{ stat: 'spd', pct: -30, turns: 2, src: 'safira' }])).toEqual(skill('mirage-step'));  // a slow is not her step
    expect(at(absent, {}, [{ stat: 'atk', pct: 30, turns: 2, src: 'safira' }])).toEqual(skill('mirage-step'));   // another stat
  });

  it('cast-when whileAbsent reads the moon hold and her barrier', () => {
    const night: PolicyRule[] = [{ kind: 'cast-when', skill: 'full-moon-night', whileAbsent: true }];
    const moon = (m: BattleState['moon']) => {
      const s = makeBattle([P('selene')], [E('e0')], m ? { moon: m } : {});
      return run(s, s.party[0], sk('full-moon-night'), night).action;
    };
    expect(moon({ phase: 'full' })).toEqual(skill('full-moon-night'));
    expect(moon({ phase: 'full', hold: { turns: 1 } })).toBeNull();
    expect(moon(undefined)).toEqual(skill('full-moon-night'));
    const ward: PolicyRule[] = [{ kind: 'cast-when', skill: 'ward', whileAbsent: true }];
    const barrier = (barriers: NonNullable<BattleState['barriers']>) => {
      const s = makeBattle([P('chizuru', { mech: { kind: 'barrier' } })], [E('e0')], { barriers });
      return run(s, s.party[0], sk('ward'), ward).action;
    };
    expect(barrier([])).toEqual(skill('ward'));
    expect(barrier([{ skill: 'ward', kind: 'guard', power: 30, turns: 1, src: 'chizuru' }])).toBeNull();
    expect(barrier([{ skill: 'ward', kind: 'guard', power: 30, turns: 2, src: 'hero' }])).toEqual(skill('ward'));
  });

  it('cast-when whileAbsent: a self skill reads her own buffs, 贖火 its riposte, a barrier only from that skill', () => {
    const step: PolicyRule[] = [{ kind: 'cast-when', skill: 'mirage-step', whileAbsent: true }];
    const s = makeBattle([P('safira'), P('hero', { buffs: [{ stat: 'spd', pct: 30, turns: 2, src: 'safira' }] })], [E('e0')]);
    expect(run(s, s.party[0], sk('mirage-step'), step).action).toEqual(skill('mirage-step'));   // the hero's buff is not her step
    const flame: PolicyRule[] = [{ kind: 'cast-when', skill: 'atoning-flame', whileAbsent: true }];
    const riposte = (over: Partial<Combatant>) => {
      const st = makeBattle([P('scarlet', over), P('hero', { riposte: { power: 80, turns: 2 } })], [E('e0')]);
      return run(st, st.party[0], sk('atoning-flame'), flame).action;
    };
    expect(riposte({})).toEqual(skill('atoning-flame'));
    expect(riposte({ riposte: { power: 80, turns: 1 } })).toBeNull();
    const ward: PolicyRule[] = [{ kind: 'cast-when', skill: 'ward', whileAbsent: true }];
    const other = makeBattle([P('chizuru', { mech: { kind: 'barrier' } })], [E('e0')], { barriers: [{ skill: 'purify-ward', kind: 'purify', power: 30, turns: 2, src: 'chizuru' }] });
    expect(run(other, other.party[0], sk('ward'), ward).action).toEqual(skill('ward'));
  });

  /**
   * `who` casts `rule.skill` under `rule` (whileAbsent) in a real fight against a boss too big to fall: each round she casts
   * it exactly when `holds` is false, and she casts it at least twice with held rounds between.
   */
  function holdLoop(who: CharacterId, learn: string, holds: (s: BattleState) => boolean) {
    const party = partyAt(30, { ids: ['hero', 'safira', 'chizuru', 'selene', 'scarlet'] });
    party.roster[who].tree = { ...party.roster[who].tree, [learn]: 1 };
    const policies = { [who]: [{ kind: 'cast-when', skill: learn, whileAbsent: true }] as PolicyRule[] };
    let s = createBattle({ party, enemyIds: ['lanterneater'], boss: true, inventory: {}, revealed: {}, scale: { depth: 3, region: 'mainline' } });
    s.enemies[0].max.hp = s.enemies[0].hp = 1e7;   // a fight long enough to see the effect run out
    const rng = mulberry32(7919);
    const casts: number[] = [];
    let held = 0;
    for (let r = 0; r < 14 && s.outcome === 'ongoing'; r++) {
      const me = s.party.find((c) => c.key === who)!;
      if (!me.alive) break;
      me.tp = me.max.tp;   // TP and the gauge are not what this test is about
      me.limit = 0;
      const on = holds(s);
      const acts = choose(s, party, policies);
      expect(acts[who].kind === 'skill' && (acts[who] as { skill: string }).skill === learn, `${who} round ${s.round + 1}`).toBe(!on);
      if (on) held++;
      else casts.push(s.round + 1);
      s = resolveRound(s, acts, rng);
    }
    expect(casts.length, who).toBeGreaterThanOrEqual(2);   // cast, then again after it ran out
    expect(held, who).toBeGreaterThanOrEqual(2);          // and not while it held
    expect(casts[1] - casts[0], who).toBeGreaterThan(1);
  }

  it('cast-when whileAbsent recasts only once her effect is gone, round after round', () => {
    holdLoop('safira', 'mirage-step', (s) => s.party.find((c) => c.key === 'safira')!.buffs.some((b) => b.stat === 'spd' && b.pct > 0 && b.src === 'safira'));
    holdLoop('selene', 'full-moon-night', (s) => !!s.moon?.hold);
    holdLoop('chizuru', 'ward', (s) => (s.barriers ?? []).some((b) => b.src === 'chizuru' && b.skill === 'ward'));
  });

  it('echo', () => {
    const rule: PolicyRule[] = [{ kind: 'echo' }];
    // pierce 170 at 70% = 119: stronger than sweep (80), weaker than pierce itself.
    const rec = (over: Partial<NonNullable<BattleState['echo']>> = {}): NonNullable<BattleState['echo']> => ({ by: 'chizuru', round: 0, def: SKILLS.pierce, cost: 5, ...over });
    const at = (echo: BattleState['echo'], castable: SkillDef[], over: Partial<Combatant> = {}) => {
      const s = makeBattle([P('hero', { defId: 'hero', ...over }), P('chizuru')], [E('e0', { alive: false, hp: 0 }), E('e1')], echo ? { echo } : {});
      return run(s, s.party[0], castable, rule).action;
    };
    const r = rec();
    expect(at(r, sk('sweep'))).toEqual({ kind: 'echo', rec: r, target: 'e1' });
    expect(at(r, [])).toEqual({ kind: 'echo', rec: r, target: 'e1' });
    expect(at(r, sk('pierce'))).toBeNull();                                  // weaker than his strongest
    expect(at(r, sk('sweep'), { tp: 4 })).toBeNull();                        // short of TP
    expect(at(undefined, sk('sweep'))).toBeNull();                           // nothing to echo
    expect(at(rec({ round: -1 }), sk('sweep'))).toBeNull();                  // too old for the coming round
    expect(at(rec({ def: SKILLS.moonlight }), sk('sweep'))).toBeNull();      // no damage
    expect(at(r, sk('sweep'), { defId: 'scarlet' })).toBeNull();             // not the hero
    // The same measure on both sides: power x reach (sweep meets three foes: 240 > 119).
    const three = makeBattle([P('hero', { defId: 'hero' })], [E('e0'), E('e1'), E('e2')], { echo: r });
    expect(run(three, three.party[0], sk('sweep'), rule).action).toBeNull();
  });

  it('spend-at of max HP', () => {
    const rule: PolicyRule[] = [{ kind: 'spend-at', gauge: 'embers', min: 40, of: 'maxHp', skill: 'crimson-end' }];
    const at = (embers: number, hp = 100) => {
      const s = makeBattle([P('scarlet', { mech: { kind: 'embers', embers }, max: { hp } as Combatant['max'] })], [E('e0')]);
      return run(s, s.party[0], sk('crimson-end', 'provoke'), rule);
    };
    expect(at(40)).toEqual({ action: skill('crimson-end', 'e0'), hold: [] });
    expect(at(39)).toEqual({ action: null, hold: ['crimson-end'] });
    expect(at(40, 200)).toEqual({ action: null, hold: ['crimson-end'] });   // 20% of her max HP
    expect(at(80, 200)).toEqual({ action: skill('crimson-end', 'e0'), hold: [] });
  });

  it('reach counts the foes a cast meets', () => {
    const foes = (n: number, dead = 0) => makeBattle([P('hero')], [...Array.from({ length: dead }, (_, i) => E(`d${i}`, { alive: false, hp: 0 })), ...Array.from({ length: n }, (_, i) => E(`e${i}`))]);
    const bounce: SkillDef = { ...SKILLS.pierce, runeRules: { bounce: { bounces: 2, dropPct: 30 } } };
    expect(reach(foes(3), SKILLS.sweep)).toBe(3);
    expect(reach(foes(2, 1), SKILLS.sweep)).toBe(2);
    expect(reach(foes(3), SKILLS.pierce)).toBe(1);
    expect(reach(foes(3), SKILLS.moonlight)).toBe(1);
    expect(reach(foes(3), bounce)).toBeCloseTo(1 + 0.7 + 0.4, 10);
    expect(reach(foes(2), bounce)).toBeCloseTo(1.7, 10);
    expect(reach(foes(1), bounce)).toBe(1);
    // A scatter's hits land at random, one foe each: however many stand, it reaches one at a time (一擲千金, 散射).
    expect(SKILLS.jackpot.target).toBe('enemies');
    expect(reach(foes(3), SKILLS.jackpot)).toBe(1);
    expect(reach(foes(3), SKILLS['scatter-shot'])).toBe(1);
  });

  it('aoe ranks by reach, the default does not', () => {
    const spread = [{ id: 'spread' as const, tier: 'magic' as const }];
    const noel = P('noel', { defId: 'noel', runes: { 'fire-star': spread } });
    const s = makeBattle([noel], [E('e0'), E('e1'), E('e2')]);
    const fire = skillFor(noel, 'fire-star')!;
    expect(fire.target).toBe('enemies');
    const castable = [fire, SKILLS['ice-star']];
    expect(run(s, noel, castable, [{ kind: 'strongest-damage', aoe: true }]).action).toEqual(skill('fire-star', 'e0'));
    expect(run(s, noel, castable, [{ kind: 'strongest-damage' }]).action).toEqual(skill('ice-star', 'e0'));
    // Against one foe the spread cast is the weaker.
    const one = makeBattle([noel], [E('e0')]);
    expect(run(one, noel, castable, [{ kind: 'strongest-damage', aoe: true }]).action).toEqual(skill('ice-star', 'e0'));
    // The sim's default choice for the same party is as it was before this task.
    const party = partyAt(20, { ids: ['hero', 'noel', 'chizuru', 'selene', 'rin'], runes: { noel: { 'fire-star': spread } } });
    const st = createBattle({ party, enemyIds: ['slime', 'slime', 'slime'], inventory: {}, revealed: {} });
    expect(party.roster.noel.sockets).toEqual({ 'fire-star': spread });
    expect(choose(st, party)).toEqual({
      hero: skill('hero-slash', 'e0'), chizuru: skill('pierce', 'e0'), rin: skill('rin-needle', 'e0'),
      noel: skill('thunder-star', 'e0'),   // the spread fire star is not her strongest by power alone
      selene: { kind: 'attack', target: 'e0' },
    });
  });

  it('effective ranks by the damage each would really deal (plan 8h Task 5b, H1)', () => {
    // A caster with next to no attack: by power 深淵・劍 (250) wins, by what it would do 星火 does.
    const mage = P('hero', { defId: 'hero', max: { hp: 100, tp: 20, atk: 5, def: 20, mag: 80, res: 20, spd: 10 } });
    const s = makeBattle([mage], [E('e0')]);
    const castable = sk('abyss-sword', 'hero-flare');
    expect(run(s, mage, castable, [{ kind: 'strongest-damage' }]).action).toEqual(skill('abyss-sword', 'e0'));
    expect(run(s, mage, castable, [{ kind: 'strongest-damage', effective: true }]).action).toEqual(skill('hero-flare', 'e0'));
    // A foe that shrugs off fire: the ice star, though both are 140.
    const noel = P('noel', { defId: 'noel' });
    const cold = makeBattle([noel], [E('e0', { x: { fireRes: 80 } })]);
    const stars = sk('fire-star', 'ice-star');
    expect(run(cold, noel, stars, [{ kind: 'strongest-damage' }]).action).toEqual(skill('fire-star', 'e0'));
    expect(run(cold, noel, stars, [{ kind: 'strongest-damage', effective: true }]).action).toEqual(skill('ice-star', 'e0'));
    // With `aoe` too, what it would do on the first foe times the foes it meets.
    const three = makeBattle([P('chizuru', { defId: 'chizuru' })], [E('e0'), E('e1'), E('e2')]);
    expect(run(three, three.party[0], sk('pierce', 'sweep'), [{ kind: 'strongest-damage', effective: true, aoe: true }]).action).toEqual(skill('sweep', 'e0'));
    expect(run(three, three.party[0], sk('pierce', 'sweep'), [{ kind: 'strongest-damage', effective: true }]).action).toEqual(skill('pierce', 'e0'));
    // It draws nothing.
    const random = vi.spyOn(Math, 'random');
    run(cold, noel, stars, [{ kind: 'strongest-damage', effective: true }]);
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });

  it('choose hands on an echo as the rule gives it', () => {
    const party = partyAt(20, { ids: ['hero', 'noel', 'chizuru', 'selene', 'rin'] });
    const s = createBattle({ party, enemyIds: ['slime'], inventory: {}, revealed: {} });
    const rec: NonNullable<BattleState['echo']> = { by: 'chizuru', round: s.round, def: { ...SKILLS.pierce, effects: [{ kind: 'damage', power: 900, element: 'phys', scale: 'atk', melee: true }] }, cost: 1 };
    s.echo = rec;
    expect(choose(s, party, { hero: [{ kind: 'echo' }] }).hero).toEqual({ kind: 'echo', rec, target: 'e0' });
    expect(choose(s, party).hero.kind).not.toBe('echo');   // the default never echoes
  });

  it('no new rule is in the default policies', () => {
    const old = ['ensure-barrier', 'ensure-device', 'ensure-mark', 'alternate', 'spend-at', 'heal-below', 'strongest-damage'];
    for (const [id, rules] of Object.entries(DEFAULT_POLICIES)) {
      for (const r of rules ?? []) {
        expect(old, `${id} ${r.kind}`).toContain(r.kind);
        expect(r, id).not.toHaveProperty('aoe');
        expect(r, id).not.toHaveProperty('of');
        expect(r, id).not.toHaveProperty('effective');
      }
    }
  });
});
