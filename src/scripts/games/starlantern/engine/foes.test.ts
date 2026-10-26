import { describe, expect, it } from 'vitest';
import { BOSS_GROUP_CAP, ROW_MAX, createBattle, intentLabel, planEnemies, resolveRound, rewards, skillsOf, turnOrder, type Action, type BattleState } from './battle';
import { scaleEnemy } from './scaling';
import { REGIONS } from '../data/regions';
import { choosable, guardTargets, syncParts, syncRallies } from './foes';
import { constRng, fullParty, makeBattle, makeCombatant, withRosterLive } from './testing';
import { LEGACY_LINEUP, activeIds } from './party';
import { wardenGroup } from '../data/monsters';
import { mulberry32, type Rng } from './rng';
import { applyEffect } from './skills';
import { T } from '../data/text.zh-TW';
import { ENEMIES } from '../data/enemies';
import type { Effect, EnemyDef, EnemySkill } from './types';
import { stat, type BattleEvent, type Combatant } from './combatant';
import { AILMENT_IDS, ailmentChance, ailmentChips, cureAilments } from './ailments';

/** Roster plan B2–B4 (spec §6.2): the foes' mechanics, each named as the spec's test duties name it. */

const P = (key: string, over: Partial<Combatant> = {}) => makeCombatant({ key, side: 'party', ...over });
const E = (key: string, over: Partial<Combatant> = {}) => makeCombatant({ key, side: 'enemy', ...over });
const hit = (power: number): Effect => ({ kind: 'damage', power, element: 'phys', scale: 'atk', melee: true });
/** A foe definition: the slime's numbers with these skills. */
const def = (skills: EnemySkill[], over: Partial<EnemyDef> = {}): EnemyDef => ({ ...ENEMIES.slime, skills, ...over });
/** Everyone in the party defends. */
const defend = (s: BattleState): Record<string, Action> => Object.fromEntries(s.party.map((c) => [c.key, { kind: 'defend' as const }]));
/** A counting rng: always `v`, and how many times it was drawn. */
const counted = (v = 0.5) => { const r = { n: 0, rng: (() => { r.n++; return v; }) as Rng }; return r; };
const acted = (s: BattleState, key: string) => s.log.filter((e) => e.type === 'act' && e.actor === key).map((e) => (e as { label: string }).label);
const hitsOn = (s: BattleState, key: string) => s.log.filter((e) => e.type === 'damage' && e.target === key).length;

describe('M1 wind-up (roster plan B2)', () => {
  /** A hound that winds up 伏低 before 撲咬, and a member it hits. */
  const hound = (skills: EnemySkill[] = [{ name: '撲咬', chance: 1, target: 'enemy', windup: '伏低', effects: [hit(230)] }]) =>
    makeBattle([P('scarlet')], [E('e0', { name: '霧根獵犬' })], { enemyDefs: { e0: def(skills) } });

  it('lands the round after its wind-up', () => {
    const r1 = resolveRound(hound(), defend(hound()), constRng(0.5));
    expect(acted(r1, 'e0')).toEqual(['伏低']);
    expect(hitsOn(r1, 'scarlet')).toBe(0);
    expect(r1.enemies[0].winding).toBe(0);
    const r2 = resolveRound(r1, defend(r1), constRng(0.5));
    expect(acted(r2, 'e0')).toEqual(['撲咬']);
    expect(hitsOn(r2, 'scarlet')).toBe(1);
    expect(r2.enemies[0].winding).toBeUndefined();
    // And then it winds up again.
    const r3 = resolveRound(r2, defend(r2), constRng(0.5));
    expect(acted(r3, 'e0')).toEqual(['伏低']);
  });

  it('sleep breaks a charge', () => {
    const r1 = resolveRound(hound(), defend(hound()), constRng(0.5));
    // Asleep at its blow: the turn is lost and the charge with it.
    const slept = structuredClone(r1);
    slept.enemies[0].sleep = 1;
    const r2 = resolveRound(slept, defend(slept), constRng(0.5));
    expect(acted(r2, 'e0')).toEqual([]);
    expect(hitsOn(r2, 'scarlet')).toBe(0);
    expect(r2.enemies[0].winding).toBeUndefined();
    // A sleep that lands on it breaks the charge even when a hit wakes it before it acts: it attacks plainly.
    const s = structuredClone(r1);
    const ctx = { rng: constRng(0), itemBoost: false, revealed: {}, log: [], battle: s };
    applyEffect(s.party[0], s.enemies[0], { kind: 'inflict', status: 'sleep', chance: 1 }, ctx);
    expect(s.enemies[0].winding).toBeUndefined();
    s.enemies[0].sleep = 0;
    const r3 = resolveRound(s, defend(s), constRng(0.5));
    expect(acted(r3, 'e0')).toEqual(['攻擊']);
  });

  it('freeze breaks a charge', () => {
    const r1 = resolveRound(hound(), defend(hound()), constRng(0.5));
    const s = structuredClone(r1);
    const ctx = { rng: constRng(0), itemBoost: false, revealed: {}, log: [], battle: s };
    applyEffect(s.party[0], s.enemies[0], { kind: 'inflict', status: 'freeze', chance: 1 }, ctx);
    expect(s.enemies[0].frozen).toBe(true);
    expect(s.enemies[0].winding).toBeUndefined();
    const r2 = resolveRound(s, defend(s), constRng(0.5));
    expect(acted(r2, 'e0')).toEqual([]);
    expect(hitsOn(r2, 'scarlet')).toBe(0);
  });

  it('shows in intentLabel', () => {
    const s = hound();
    planEnemies(s, constRng(0.5));
    expect(intentLabel(s, 'e0')).toBe('蓄力：撲咬');
    const r1 = resolveRound(s, defend(s), constRng(0.5));
    expect(intentLabel(r1, 'e0')).toBe('撲咬 → scarlet');
  });

  it('draws nothing while winding', () => {
    // Two skills: the first never comes (chance 0), so a free foe's findIndex draws twice; a winding one draws neither.
    const two: EnemySkill[] = [{ name: '空', chance: 0, target: 'enemy', effects: [hit(100)] }, { name: '撲咬', chance: 1, target: 'enemy', windup: '伏低', effects: [hit(230)] }];
    const free = counted(), wound = counted();
    planEnemies(hound(two), free.rng);
    const s = hound(two);
    s.enemies[0].winding = 1;
    planEnemies(s, wound.rng);
    expect(free.n - wound.n).toBe(2);
    expect(s.intents!.e0).toEqual({ kind: 'enemy-skill', index: 1, target: 'scarlet', charged: true });
  });
});

describe('M2 guard (roster plan B2)', () => {
  const field = (over: Partial<Combatant> = {}) =>
    makeBattle([P('scarlet', { max: { atk: 60 } as never })], [E('e0', { name: '錫兵', cover: { ally: 'e1', turns: 2 }, ...over }), E('e1', { name: '幽影' })]);

  it('takes single-target hits', () => {
    const r = resolveRound(field(), { scarlet: { kind: 'attack', target: 'e1' } }, constRng(0.5));
    expect(hitsOn(r, 'e0')).toBe(1);
    expect(hitsOn(r, 'e1')).toBe(0);
    // A sleeping guard guards no one.
    const asleep = resolveRound(field({ sleep: 3 }), { scarlet: { kind: 'attack', target: 'e1' } }, constRng(0.5));
    expect(hitsOn(asleep, 'e1')).toBe(1);
    // A skill on one foe is turned as an attack is.
    const s2 = field();
    s2.party[0].tp = 50;
    const r2 = resolveRound(s2, { scarlet: { kind: 'skill', skill: 'fire-star', target: 'e1' } }, constRng(0.5));
    expect(hitsOn(r2, 'e0')).toBe(1);
    expect(hitsOn(r2, 'e1')).toBe(0);
  });

  it('area ignores a guard', () => {
    const s = field();
    s.party[0].tp = 50;
    const r = resolveRound(s, { scarlet: { kind: 'skill', skill: 'sweep' } }, constRng(0.5));
    expect(hitsOn(r, 'e0')).toBe(1);
    expect(hitsOn(r, 'e1')).toBe(1);
  });

  it('ends after its turns', () => {
    // 列隊 guards the ally most hurt but itself, for two rounds.
    const s = makeBattle([P('scarlet')], [E('e0'), E('e1', { hp: 50 }), E('e2', { hp: 90 })], {
      enemyDefs: { e0: def([{ name: '列隊', chance: 1, target: 'ally', effects: [{ kind: 'cover', turns: 2 }] }]) },
    });
    s.enemies[0].hp = 10;   // the most hurt is itself: it guards the next most hurt
    const r1 = resolveRound(s, defend(s), constRng(0.5));
    expect(acted(r1, 'e0')).toEqual(['列隊']);
    expect(r1.enemies[0].cover).toEqual({ ally: 'e1', turns: 1 });
    const quiet = structuredClone(r1);
    quiet.enemies[0].sleep = 9;
    const r2 = resolveRound(quiet, defend(quiet), constRng(0.5));
    expect(r2.enemies[0].cover).toBeUndefined();
  });
});

describe('M24 hunt (roster plan B2)', () => {
  const field = (noel: Partial<Combatant> = {}, scarlet: Partial<Combatant> = {}) => {
    const s = makeBattle([P('scarlet', scarlet), P('noel', noel)], [E('e0')], { round: 1 });
    s.intents = { e0: { kind: 'attack', target: 'scarlet' } };
    return s;
  };
  const both: Record<string, Action> = { scarlet: { kind: 'attack', target: 'e0' }, noel: { kind: 'attack', target: 'e0' } };

  it('focuses the hunted member', () => {
    const r = resolveRound(field({ hunted: 2 }), both, constRng(0.5));
    expect(hitsOn(r, 'noel')).toBe(1);
    expect(hitsOn(r, 'scarlet')).toBe(0);
    // The hunt goes with the round.
    expect(r.party[1].hunted).toBeUndefined();
    // The skill that calls a hunt marks its target for the next round, and the plan shows the blow on it.
    const caller = makeBattle([P('scarlet'), P('noel')], [E('e0'), E('e1')], {
      enemyDefs: { e0: def([{ name: '宣告', chance: 1, target: 'enemy', effects: [{ kind: 'hunt' }] }]), e1: def([]) },
    });
    caller.intents = { e0: { kind: 'enemy-skill', index: 0, target: 'noel' }, e1: { kind: 'attack', target: 'scarlet' } };
    const r1 = resolveRound(caller, defend(caller), constRng(0.5));
    expect(r1.party[1].hunted).toBe(2);
    expect(r1.intents!.e1.shownTarget ?? r1.intents!.e1.target).toBe('noel');
  });

  it('taunt overrides', () => {
    const r = resolveRound(field({ hunted: 2 }, { taunt: 2 }), both, constRng(0.5));
    expect(hitsOn(r, 'scarlet')).toBe(1);
    expect(hitsOn(r, 'noel')).toBe(0);
  });

  it('defending lifts the hunt', () => {
    const r = resolveRound(field({ hunted: 2 }), { scarlet: { kind: 'attack', target: 'e0' }, noel: { kind: 'defend' } }, constRng(0.5));
    expect(hitsOn(r, 'scarlet')).toBe(1);
    expect(hitsOn(r, 'noel')).toBe(0);
    expect(r.party[1].hunted).toBeUndefined();
  });
});

describe('M3 flee (roster plan B3)', () => {
  /** A treasure foe that flees after `n` rounds, beside a slime; the party only defends. */
  const field = (n: number) => makeBattle([P('scarlet')], [E('e0', { name: '拾憶鼠' }), E('e1')], { enemyDefs: { e0: def([], { fleeAfter: n }) } });

  it('flees at the end of round N', () => {
    let s = field(3);
    for (let r = 1; r <= 2; r++) {
      s = resolveRound(s, defend(s), constRng(0.5));
      expect(s.enemies[0].alive, `round ${r}`).toBe(true);
    }
    s = resolveRound(s, defend(s), constRng(0.5));
    expect(s.enemies[0]).toMatchObject({ alive: false, left: true });
    expect(s.log).toContainEqual({ type: 'foe', actor: 'e0', cue: 'flee' });
    // Gone, it is no one's target and makes no plan.
    expect(s.intents!.e0).toBeUndefined();
    expect(s.outcome).toBe('ongoing');
  });

  it('a fled foe pays nothing and takes no loot or rune draw', () => {
    let s = field(1);
    s = resolveRound(s, defend(s), constRng(0.5));
    s.enemies[1].hp = 0;
    s.enemies[1].alive = false;
    const solo = { ...s, enemies: [s.enemies[1]], enemyDefs: {} };
    expect(rewards(s, constRng(0), false)).toEqual(rewards(solo, constRng(0), false));
  });

  it('a foe that falls before its round does not flee', () => {
    let s = field(1);
    s.enemies[0].hp = 1;
    s = resolveRound(s, { scarlet: { kind: 'attack', target: 'e0' } }, constRng(0.5));
    expect(s.enemies[0].left).toBeUndefined();
    expect(s.log.some((e) => e.type === 'foe' && e.cue === 'flee')).toBe(false);
  });
});

describe('M13 steal (roster plan B3)', () => {
  const steal = (perDepth = 5): EnemySkill => ({ name: '順手牽羊', chance: 1, target: 'enemy', effects: [hit(50), { kind: 'steal', perDepth }] });
  /** A thief beside a slime; the party's run pack holds `gold` at depth 4 (cap 20 a steal). */
  const field = (gold: number, over: Partial<EnemyDef> = {}) =>
    makeBattle([P('scarlet', { max: { hp: 999 } as never })], [E('e0', { name: '吆喝聲' }), E('e1')], { enemyDefs: { e0: def([steal()], over) }, purse: { gold, depth: 4 } });

  it('takes from the pack, up to depth × perDepth', () => {
    const r = resolveRound(field(100), defend(field(100)), constRng(0.5));
    expect(r.purse).toEqual({ gold: 80, depth: 4 });
    expect(r.enemies[0].stolen).toBe(20);
    expect(r.log).toContainEqual({ type: 'foe', actor: 'e0', cue: 'steal', target: 'scarlet', amount: 20 });
  });

  it('never below zero', () => {
    let s = field(3);
    s = resolveRound(s, defend(s), constRng(0.5));
    expect(s.purse!.gold).toBe(0);
    expect(s.enemies[0].stolen).toBe(3);
    s = resolveRound(s, defend(s), constRng(0.5));
    expect(s.purse!.gold).toBe(0);
    expect(s.enemies[0].stolen).toBe(3);
  });

  it('only a landed hit steals', () => {
    const s = field(100);
    s.party[0].x = { evasion: 100000 };
    const r = resolveRound(s, defend(s), constRng(0.1));
    expect(r.purse!.gold).toBe(100);
    expect(r.enemies[0].stolen).toBeUndefined();
  });

  /** A thief that has taken 20 (the pack down to 80), then felled by the party's blow. */
  const felled = (over: Partial<EnemyDef> = {}) => {
    let s = resolveRound(field(100, over), defend(field(100, over)), constRng(0.5));
    s.enemies[0].hp = 1;
    s.enemies[0].sleep = 9;
    s.party[0].max = { ...s.party[0].max, atk: 999 };
    s = resolveRound(s, { scarlet: { kind: 'attack', target: 'e0' } }, constRng(0.5));
    expect(s.enemies[0].alive).toBe(false);
    return s;
  };

  it('returns on a kill', () => {
    // The moment it falls, what it took is back in the pack (B1 review item 9), win or not.
    const s = felled();
    expect(s.purse!.gold).toBe(100);
    expect(s.enemies[0].returned).toBe(20);
    expect(s.log).toContainEqual({ type: 'foe', actor: 'e0', cue: 'return', amount: 20 });
    // The win's rewards tell it, and do not pay it twice.
    for (const e of s.enemies) { e.hp = 0; e.alive = false; }
    s.outcome = 'win';
    const paid = rewards(s, constRng(0.99), false);
    const none = rewards({ ...s, enemies: s.enemies.map((e) => ({ ...e, stolen: undefined, returned: undefined })) }, constRng(0.99), false);
    expect(paid.returned).toBe(20);
    expect(paid.gold).toBe(none.gold);
    expect(none.returned).toBeUndefined();
  });

  it('a warden returns twice', () => {
    const s = felled({ rank: 'warden' });
    expect(s.purse!.gold).toBe(120);
    expect(s.enemies[0].returned).toBe(40);
  });

  it('a thief already down when the round opens gives it back too', () => {
    const s = resolveRound(field(100), defend(field(100)), constRng(0.5));
    for (const e of s.enemies) { e.hp = 0; e.alive = false; }
    const r = resolveRound(s, defend(s), constRng(0.5));
    expect(r.outcome).toBe('win');
    expect(r.purse!.gold).toBe(100);
  });

  it('lost on a flee', () => {
    const s = resolveRound(field(100), defend(field(100)), constRng(0.5));
    s.enemies[0].alive = false;
    s.enemies[0].left = true;
    s.enemies[1].hp = 0;
    s.enemies[1].alive = false;
    s.outcome = 'win';
    expect(rewards(s, constRng(0.99), false).returned).toBeUndefined();
  });

  it('the sim steals nothing', () => {
    // A fight with no purse (the sim has no run): the hit lands and nothing is taken.
    const s = makeBattle([P('scarlet', { max: { hp: 999 } as never })], [E('e0')], { enemyDefs: { e0: def([steal()]) } });
    const r = resolveRound(s, defend(s), constRng(0.5));
    expect(hitsOn(r, 'scarlet')).toBe(1);
    expect(r.enemies[0].stolen).toBeUndefined();
    expect(r.log.some((e) => e.type === 'foe')).toBe(false);
  });
});

describe('M14 openers (roster plan B3)', () => {
  const party = () => fullParty(LEGACY_LINEUP);
  /** A fight with one roster-shaped foe whose definition opens its own way. */
  const open = (opener: NonNullable<EnemyDef['opener']>, skills: EnemySkill[] = []) => {
    const was = ENEMIES.slime;
    try {
      (ENEMIES as Record<string, EnemyDef>).slime = { ...was, opener, skills, stats: { ...was.stats, hp: 9999, spd: 1 } };
      return createBattle({ party: party(), enemyIds: ['slime'], inventory: {}, revealed: {} });
    } finally {
      (ENEMIES as Record<string, EnemyDef>).slime = was;
    }
  };
  const defendAll = (s: BattleState) => Object.fromEntries(s.party.filter((c) => c.alive).map((c) => [c.key, { kind: 'defend' as const }]));

  it('asleep wakes on a hit or by round three', () => {
    let s = open('asleep');
    expect(s.enemies[0].sleep).toBe(2);
    // Left alone it sleeps two rounds and wakes in the third, angrier.
    s = resolveRound(s, defendAll(s), constRng(0.5));
    s = resolveRound(s, defendAll(s), constRng(0.5));
    expect(acted(s, 'e0')).toEqual([]);
    s = resolveRound(s, defendAll(s), constRng(0.5));
    expect(acted(s, 'e0')).toEqual(['攻擊']);
    expect(s.log).toContainEqual({ type: 'foe', actor: 'e0', cue: 'wake' });
    expect(s.enemies[0].buffs).toContainEqual(expect.objectContaining({ stat: 'atk', pct: 50 }));
    // A hit wakes it at once: slower than the party, it acts in that very round, angrier.
    const h = open('asleep');
    const r1 = resolveRound(h, { ...defendAll(h), scarlet: { kind: 'attack', target: 'e0' } }, constRng(0.5));
    expect(r1.enemies[0].sleep).toBe(0);
    expect(acted(r1, 'e0')).toEqual(['攻擊']);
    expect(r1.log).toContainEqual({ type: 'foe', actor: 'e0', cue: 'wake' });
  });

  it('ambush acts first only in round one', () => {
    let s = open('ambush');
    s = resolveRound(s, defendAll(s), constRng(0.5));
    const order = (b: BattleState) => b.log.filter((e) => e.type === 'act').map((e) => (e as { actor: string }).actor);
    expect(order(s)[0]).toBe('e0');
    s = resolveRound(s, defendAll(s), constRng(0.5));
    expect(order(s).at(-1)).toBe('e0');   // the slowest, as it is
  });

  it('disguise lifts on the first hit', () => {
    let s = open('disguise');
    const foe = () => s.enemies[0];
    expect(foe().name).toBe('寶箱？');
    expect(foe().disguised).toBe(ENEMIES.slime.name);
    expect(foe().buffs).toContainEqual(expect.objectContaining({ stat: 'atk', pct: 50, turns: 1 }));
    // It springs first in round one, still in disguise while no hit lands on it.
    s = resolveRound(s, defendAll(s), constRng(0.5));
    expect(s.log.find((e) => e.type === 'act')).toMatchObject({ actor: 'e0' });
    expect(foe().name).toBe('寶箱？');
    expect(foe().buffs.some((b) => b.stat === 'atk')).toBe(false);   // the first round's bite only
    s = resolveRound(s, { ...defendAll(s), scarlet: { kind: 'attack', target: 'e0' } }, constRng(0.5));
    expect(foe().name).toBe(ENEMIES.slime.name);
    expect(foe().disguised).toBeUndefined();
    expect(s.log).toContainEqual({ type: 'foe', actor: 'e0', cue: 'reveal' });
  });
});

describe('M4 summon (roster plan B4)', () => {
  const caller = (max = 9, id = 'slime'): EnemySkill => ({ name: '呼喚', chance: 1, target: 'self', effects: [{ kind: 'summon', id, max }] });
  /** A summoner (and `others` more slimes) with room for `cap` foes, the party defending. */
  const field = (cap: number, others = 0, skill = caller()) => {
    const foes = [E('e0', { name: '母體' }), ...Array.from({ length: others }, (_, i) => E(`e${i + 1}`))];
    return makeBattle([P('scarlet', { max: { hp: 999 } as never })], foes, { enemyDefs: { e0: def([skill]) }, meet: { k: 1, cap } });
  };

  it('a summon joins at the end of the line, pays nothing, and acts from the next round', () => {
    const r1 = resolveRound(field(4), defend(field(4)), constRng(0.5));
    expect(r1.enemies.map((e) => e.key)).toEqual(['e0', 'e1']);
    expect(r1.enemies[1]).toMatchObject({ defId: 'slime', summoned: true, alive: true });
    expect(r1.log).toContainEqual({ type: 'foe', actor: 'e0', cue: 'summon', target: 'e1' });
    expect(acted(r1, 'e1')).toEqual([]);
    expect(r1.intents!.e1).toBeDefined();
    const r2 = resolveRound(r1, defend(r1), constRng(0.5));
    expect(acted(r2, 'e1').length).toBe(1);
  });

  it('respects the cap', () => {
    // Two standing and a cap of two: no room, so it attacks instead.
    const r = resolveRound(field(2, 1), defend(field(2, 1)), constRng(0.5));
    expect(r.enemies).toHaveLength(2);
    expect(acted(r, 'e0')).toEqual(['攻擊']);
    // A fallen foe makes room again.
    const s = field(2, 1);
    s.enemies[1].alive = false;
    s.enemies[1].hp = 0;
    expect(resolveRound(s, defend(s), constRng(0.5)).enemies).toHaveLength(3);
  });

  it('calls no more than its max a fight', () => {
    let s = field(9, 0, caller(2));
    for (let i = 0; i < 4; i++) s = resolveRound(s, defend(s), constRng(0.5));
    expect(s.enemies.filter((e) => e.summoned)).toHaveLength(2);
  });

  it('the row never grows past ROW_MAX, the fallen counted (roster plan B6)', () => {
    let s = field(99, ROW_MAX - 2);
    for (const e of s.enemies.slice(1)) { e.alive = false; e.hp = 0; }
    s = resolveRound(s, defend(s), constRng(0.5));
    expect(s.enemies).toHaveLength(ROW_MAX);   // one call fills the row
    s = resolveRound(s, defend(s), constRng(0.5));
    expect(s.enemies).toHaveLength(ROW_MAX);
    expect(acted(s, 'e0')).toEqual(['攻擊']);
  });

  it('calls no one not yet live', () => {
    const r = resolveRound(field(4, 0, caller(9, 'lamp-wight')), defend(field(4)), constRng(0.5));
    expect(r.enemies).toHaveLength(1);
    expect(acted(r, 'e0')).toEqual(['攻擊']);
  });

  it('the target id must exist', () => {
    for (const d of Object.values(ENEMIES)) for (const k of d.skills) for (const e of k.effects) {
      if (e.kind === 'summon') expect(ENEMIES[e.id], `${d.id} ${k.name} ${e.id}`).toBeDefined();
    }
  });
});

describe('M19 decoy (roster plan B4)', () => {
  const dancer = () => {
    const was = ENEMIES.slime;
    try {
      (ENEMIES as Record<string, EnemyDef>).slime = { ...was, opener: 'decoy', skills: [] };
      return createBattle({ party: fullParty(LEGACY_LINEUP), enemyIds: ['slime'], inventory: {}, revealed: {} });
    } finally {
      (ENEMIES as Record<string, EnemyDef>).slime = was;
    }
  };

  it('decoy pays nothing', () => {
    const s = dancer();
    expect(s.enemies).toHaveLength(2);
    expect(s.enemies[1]).toMatchObject({ summoned: true, decoyOf: 'e0', hp: 1 });
    expect(s.enemies[1].max.hp).toBe(1);
    for (const e of s.enemies) { e.hp = 0; e.alive = false; }
    s.outcome = 'win';
    const solo = { ...s, enemies: [s.enemies[0]] };
    expect(rewards(s, constRng(0), false)).toEqual(rewards(solo, constRng(0), false));
  });

  it('a decoy never acts', () => {
    let s = dancer();
    s = resolveRound(s, defend(s), constRng(0.5));
    expect(acted(s, 'e1')).toEqual([]);
    expect(s.intents!.e1).toBeUndefined();
  });

  it('evasion drops with the decoy', () => {
    const s = dancer();
    expect(s.enemies[0].x.evasion).toBe(20);
    const r = resolveRound(s, { ...defend(s), scarlet: { kind: 'attack', target: 'e1' } }, constRng(0.9));
    expect(r.enemies[1].alive).toBe(false);
    expect(r.enemies[0].x.evasion ?? 0).toBe(0);
  });
});

describe('M10 last words (roster plan B4)', () => {
  const burst = (target: 'enemies' | 'allies' = 'enemies', power = 40): NonNullable<EnemyDef['onFall']> => ({ name: '燭爆', target, effects: [hit(power)] });
  const field = (onFall: EnemyDef['onFall'], n = 1) =>
    makeBattle([P('scarlet', { max: { hp: 999, atk: 999 } as never })], Array.from({ length: n }, (_, i) => E(`e${i}`, { hp: 1 })),
      { enemyDefs: Object.fromEntries(Array.from({ length: n }, (_, i) => [`e${i}`, def([], { onFall })])) });

  it('fires once', () => {
    let s = field(burst());
    s.enemies.push(E('e1', { max: { hp: 9999 } as never }));
    s = resolveRound(s, { scarlet: { kind: 'attack', target: 'e0' } }, constRng(0.5));
    expect(s.enemies[0].alive).toBe(false);
    expect(acted(s, 'e0')).toEqual(['燭爆']);
    expect(hitsOn(s, 'scarlet')).toBeGreaterThanOrEqual(1);
    const r2 = resolveRound(s, defend(s), constRng(0.5));
    expect(acted(r2, 'e0')).toEqual([]);
  });

  it('does not chain forever', () => {
    // Each one's burst hits its own side: the first fells the second, whose burst does not go off in turn.
    let s = field(burst('allies', 9999), 3);
    s.enemies[2].max = { ...s.enemies[2].max, hp: 99999 };
    s.enemies[2].hp = 99999;
    s = resolveRound(s, { scarlet: { kind: 'attack', target: 'e0' } }, constRng(0.5));
    expect(s.enemies[1].alive).toBe(false);
    expect(s.log.filter((e) => e.type === 'act' && e.label === '燭爆')).toHaveLength(1);
  });
});

describe('M22 second winds (roster plan B4)', () => {
  it('rises only once', () => {
    let s = makeBattle([P('scarlet', { max: { atk: 999 } as never })], [E('e0', { hp: 1 }), E('e1', { max: { hp: 9999 } as never })], { enemyDefs: { e0: def([], { rise: { pct: 30 } }) } });
    s = resolveRound(s, { scarlet: { kind: 'attack', target: 'e0' } }, constRng(0.5));
    expect(s.enemies[0]).toMatchObject({ alive: true, hp: 30, rose: true });
    expect(s.log).toContainEqual({ type: 'foe', actor: 'e0', cue: 'rise' });
    s = resolveRound(s, { scarlet: { kind: 'attack', target: 'e0' } }, constRng(0.5));
    expect(s.enemies[0].alive).toBe(false);
    expect(s.log.some((e) => e.type === 'foe' && e.cue === 'rise')).toBe(false);
  });

  it('a last foe that rises keeps the fight going', () => {
    let s = makeBattle([P('scarlet', { max: { atk: 999 } as never })], [E('e0', { hp: 1 })], { enemyDefs: { e0: def([], { rise: { pct: 30 } }) } });
    s = resolveRound(s, { scarlet: { kind: 'attack', target: 'e0' } }, constRng(0.5));
    expect(s.outcome).toBe('ongoing');
  });

  it('a revive with no fallen ally is passed over, and the draw count holds', () => {
    const fold: EnemySkill = { name: '重摺', chance: 1, target: 'deadAlly', when: 'deadAlly', effects: [{ kind: 'revive', hpPct: 0.3 }] };
    const blade: EnemySkill = { name: '紙刃', chance: 1, target: 'enemy', effects: [hit(90)] };
    const crane = (first: EnemySkill, fallen: boolean) =>
      makeBattle([P('scarlet')], [E('e0'), E('e1', fallen ? { alive: false, hp: 0 } : {})], { enemyDefs: { e0: def([first, blade]) } });
    // No one fallen: 重摺 is passed over for 紙刃, drawing as a skill whose chance failed would.
    const passed = counted(), failed = counted();
    planEnemies(crane(fold, false), passed.rng);
    planEnemies(crane({ ...fold, chance: 0 }, false), failed.rng);
    expect(passed.n).toBe(failed.n);
    const s = crane(fold, false);
    planEnemies(s, constRng(0.5));
    expect(s.intents!.e0).toMatchObject({ kind: 'enemy-skill', index: 1 });
    // One fallen: it folds the fallen one back, once.
    const f = crane(fold, true);
    planEnemies(f, constRng(0.5));
    expect(f.intents!.e0).toMatchObject({ kind: 'enemy-skill', index: 0 });
    const r = resolveRound(f, defend(f), constRng(0.5));
    expect(r.enemies[1]).toMatchObject({ alive: true, hp: 30, rose: true });
    const again = crane(fold, true);
    again.enemies[1].rose = true;
    planEnemies(again, constRng(0.5));
    expect(again.intents!.e0).toMatchObject({ kind: 'enemy-skill', index: 1 });
  });
});

describe('M20 shared wounds (roster plan B4)', () => {
  it('splits while both stand', () => {
    const pair = () => createBattle({ party: fullParty(LEGACY_LINEUP), enemyIds: ['ice-komainu', 'ice-komainu'], inventory: {}, revealed: {} });
    const s = pair();
    expect(s.enemies[0].share).toBe('e1');
    expect(s.enemies[1].share).toBe('e0');
    const r = resolveRound(s, { ...defend(s), scarlet: { kind: 'attack', target: 'e0' } }, constRng(0.5));
    const lost = (i: number) => s.enemies[i].hp - r.enemies[i].hp;
    expect(lost(0)).toBeGreaterThan(0);
    expect(Math.abs(lost(0) - lost(1))).toBeLessThanOrEqual(1);
    // With its partner down, it takes the whole blow.
    const t = pair();
    t.enemies[1].alive = false;
    t.enemies[1].hp = 0;
    const whole = resolveRound(t, { ...defend(t), scarlet: { kind: 'attack', target: 'e0' } }, constRng(0.5));
    expect(t.enemies[0].hp - whole.enemies[0].hp).toBeGreaterThanOrEqual(lost(0) + lost(1) - 1);
  });
});

describe('the intent says what a foe mechanic will do (roster plan B6)', () => {
  it('a guard shows whom it will guard, and a hunt whom it calls out', () => {
    const s = makeBattle([P('scarlet'), P('noel')], [E('e0', { name: '錫兵' }), E('e1', { name: '幽影', hp: 40 })], {
      enemyDefs: {
        e0: def([{ name: '列隊', chance: 1, target: 'ally', effects: [{ kind: 'cover', turns: 2 }] }]),
        e1: def([{ name: '記下名字', chance: 1, target: 'enemy', effects: [{ kind: 'hunt' }] }]),
      },
    });
    s.intents = { e0: { kind: 'enemy-skill', index: 0 }, e1: { kind: 'enemy-skill', index: 0, target: 'noel' } };
    expect(intentLabel(s, 'e0')).toBe(`列隊${T.battle.foe.guardTag} → 幽影`);
    expect(intentLabel(s, 'e1')).toBe(`記下名字${T.battle.foe.huntTag} → noel`);
  });

  it('a decoy shows no intent', () => {
    const s = makeBattle([P('scarlet')], [E('e0'), E('e1', { decoyOf: 'e0' })]);
    s.intents = { e1: { kind: 'attack', target: 'scarlet' } };
    expect(intentLabel(s, 'e1')).toBe('');
  });
});

describe('roster plan B1 review', () => {
  it('1. a last word never fells the last member standing: she is left at 1 HP and the fight is won', () => {
    const blast = { name: '燭爆', target: 'enemies' as const, effects: [hit(999)] };
    const s = makeBattle([P('scarlet', { hp: 1, max: { hp: 1, atk: 999 } as never })], [E('e0', { hp: 1 })], { enemyDefs: { e0: def([], { onFall: blast }) } });
    const r = resolveRound(s, { scarlet: { kind: 'attack', target: 'e0' } }, constRng(0.5));
    expect(r.party[0]).toMatchObject({ alive: true, hp: 1 });
    expect(r.outcome).toBe('win');
    // With two standing, the first may fall; the last one standing does not.
    const two = makeBattle([P('scarlet', { max: { hp: 50, atk: 999 } as never }), P('noel', { max: { hp: 50 } as never })], [E('e0', { hp: 1 })],
      { enemyDefs: { e0: def([], { onFall: blast }) } });
    const r2 = resolveRound(two, { scarlet: { kind: 'attack', target: 'e0' }, noel: { kind: 'defend' } }, constRng(0.5));
    expect(r2.party.filter((c) => c.alive)).toHaveLength(1);
    expect(r2.party.find((c) => c.alive)!.hp).toBe(1);
    expect(r2.outcome).toBe('win');
    // The guard is the last word's only: it leaves no one undying after it.
    expect(r2.party.some((c) => c.undying)).toBe(false);
  });

  it('2. a call that cannot happen is passed over at its draw, so the intent tells the truth', () => {
    const caller: EnemySkill = { name: '呼喚', chance: 1, target: 'self', effects: [{ kind: 'summon', id: 'slime', max: 1 }] };
    const spent = () => makeBattle([P('scarlet', { max: { hp: 999 } as never })], [E('e0', { summons: 1 })], { enemyDefs: { e0: def([caller]) }, meet: { k: 1, cap: 4 } });
    const s = spent();
    planEnemies(s, constRng(0.5));
    expect(s.intents!.e0.kind).toBe('attack');
    expect(intentLabel(s, 'e0')).toBe('攻擊 → scarlet');
    // It drew for the call, as a failed chance would.
    const a = counted(), b = counted();
    planEnemies(spent(), a.rng);
    planEnemies(makeBattle([P('scarlet')], [E('e0')], { enemyDefs: { e0: def([{ ...caller, chance: 0 }]) } }), b.rng);
    expect(a.n).toBe(b.n);
  });

  it('3. the nest never attacks: it hatches each turn while there is room, and curls up when there is none', () => {
    const nest = ENEMIES['lantern-brood'];
    expect(nest.skills[0].effects[0]).toMatchObject({ kind: 'summon', id: 'lantern-larva' });
    expect(nest.skills[0].effects[0]).not.toHaveProperty('max');
    // The real warden fight (its group, the elite path, a party of five): a warden's fight holds BOSS_GROUP_CAP at most
    // (B1 confirmation review item 1).
    withRosterLive(['lantern-brood', 'lantern-larva'], () => {
      const group = wardenGroup('lantern-brood');
      expect(group).toEqual(['lantern-brood', 'lantern-larva']);
      const party = fullParty(LEGACY_LINEUP);
      expect(activeIds(party)).toHaveLength(5);
      let b = createBattle({ party, enemyIds: group, inventory: {}, revealed: {}, scale: { depth: 28, region: 'mainline', elite: group[0] } });
      expect(b.meet!.cap).toBe(BOSS_GROUP_CAP);
      for (const c of b.party) { c.max = { ...c.max, hp: 999999 }; c.hp = 999999; }
      const acts: string[][] = [];
      for (let i = 0; i < 8 && b.outcome === 'ongoing'; i++) {
        b = resolveRound(b, defend(b), mulberry32(i + 7));
        acts.push(acted(b, 'e0'));
        expect(b.enemies.filter((e) => e.alive).length).toBeLessThanOrEqual(BOSS_GROUP_CAP);
      }
      expect(acts.slice(0, 2)).toEqual([['孵化'], ['孵化']]);
      expect(acts.slice(2).every((a) => a.length === 1 && a[0] === '蜷縮')).toBe(true);
      expect(acts.flat()).not.toContain('攻擊');
      expect(b.enemies.filter((e) => e.summoned)).toHaveLength(2);
    });
  });

  it('2b. a planned skill blocked by the time it acts is a plain attack, never another skill at full odds', () => {
    // Two callers, room for one more: the second's call is blocked when its turn comes (B1 confirmation review item 2).
    const big: EnemySkill = { name: '大招', chance: 0.05, target: 'enemies', effects: [hit(300)] };
    const caller: EnemySkill = { name: '呼喚', chance: 1, target: 'self', effects: [{ kind: 'summon', id: 'slime', max: 2 }] };
    const s = makeBattle([P('scarlet', { max: { hp: 9999 } as never })], [E('e0'), E('e1')], { enemyDefs: { e0: def([caller, big]), e1: def([caller, big]) }, meet: { k: 1, cap: 3 } });
    const r = resolveRound(s, defend(s), constRng(0.5));
    expect(acted(r, 'e0').concat(acted(r, 'e1')).sort()).toEqual(['呼喚', '攻擊']);
    // A foe with no damaging skill at all (the nest) takes its first usable one instead.
    const curl: EnemySkill = { name: '蜷縮', chance: 1, target: 'self', effects: [{ kind: 'buff', stat: 'def', pct: 20, turns: 2 }] };
    const n = makeBattle([P('scarlet', { max: { hp: 9999 } as never })], [E('e0'), E('e1')], { enemyDefs: { e0: def([caller, curl]), e1: def([caller, curl]) }, meet: { k: 1, cap: 3 } });
    const rn = resolveRound(n, defend(n), constRng(0.5));
    expect(acted(rn, 'e0').concat(acted(rn, 'e1')).sort()).toEqual(['呼喚', '蜷縮']);
  });

  it('4. decoys leave with their body when it falls for good', () => {
    const was = ENEMIES.slime;
    let s: BattleState;
    try {
      (ENEMIES as Record<string, EnemyDef>).slime = { ...was, opener: 'decoy', skills: [] };
      s = createBattle({ party: fullParty(LEGACY_LINEUP), enemyIds: ['slime'], inventory: {}, revealed: {} });
    } finally {
      (ENEMIES as Record<string, EnemyDef>).slime = was;
    }
    s.enemies[0].hp = 1;
    const acts = Object.fromEntries(s.party.map((c) => [c.key, { kind: 'defend' as const }])) as Record<string, Action>;
    acts[s.party[0].key] = { kind: 'attack', target: 'e0' };
    const r = resolveRound(s, acts, constRng(0.5));
    expect(r.enemies[0].alive).toBe(false);
    expect(r.enemies[1]).toMatchObject({ alive: false, left: true });
    expect(r.log).toContainEqual({ type: 'foe', actor: 'e1', cue: 'vanish' });
    expect(r.outcome).toBe('win');
  });

  it('6. a fold-back works once a fight for the whole flock', () => {
    const fold: EnemySkill = { name: '重摺', chance: 1, target: 'deadAlly', when: 'deadAlly', oncePerFight: true, effects: [{ kind: 'revive', hpPct: 0.3 }] };
    expect(ENEMIES['paper-cranes'].skills.find((k) => k.name === '重摺')).toMatchObject({ when: 'deadAlly', oncePerFight: true });
    let s = makeBattle([P('scarlet', { max: { hp: 9999 } as never })], [E('e0', { defId: 'paper-cranes' }), E('e1', { defId: 'paper-cranes' }), E('e2', { alive: false, hp: 0 }), E('e3', { alive: false, hp: 0 })],
      { enemyDefs: { e0: def([fold]), e1: def([fold]) } });
    s = resolveRound(s, defend(s), constRng(0.5));
    expect(s.log.filter((e) => e.type === 'revive')).toHaveLength(1);
    s = resolveRound(s, defend(s), constRng(0.5));
    expect(s.log.filter((e) => e.type === 'revive')).toHaveLength(0);
  });

  it('7. a decoy draws nothing in the turn order', () => {
    const a = counted(), b = counted();
    turnOrder([E('e0'), E('e1', { decoyOf: 'e0' })], a.rng, 1);
    turnOrder([E('e0')], b.rng, 1);
    expect(a.n).toBe(b.n);
    expect(turnOrder([E('e0'), E('e1', { decoyOf: 'e0' })], constRng(0.5), 1).map((c) => c.key)).toEqual(['e0']);
  });

  it('8. a guard never guards a decoy', () => {
    const s = makeBattle([P('scarlet')], [E('e0'), E('e1', { decoyOf: 'e9', hp: 1, max: { hp: 1 } as never })]);
    expect(guardTargets(s, s.enemies[0], { name: 'g', chance: 1, target: 'ally', effects: [{ kind: 'cover', turns: 2 }] })).toEqual([]);
  });

  it('11. a veil beats a hunt: a veiled member is never the one called out', () => {
    const caller = makeBattle([P('scarlet'), P('noel', { veil: 2 })], [E('e0')], { enemyDefs: { e0: def([{ name: '宣告', chance: 1, target: 'enemy', effects: [{ kind: 'hunt' }] }]) } });
    caller.intents = { e0: { kind: 'enemy-skill', index: 0, target: 'noel' } };
    const r = resolveRound(caller, defend(caller), constRng(0.5));
    expect(r.party[1].hunted).toBeUndefined();
    // Hunted, then veiled: the blows go where they were drawn.
    const s = makeBattle([P('scarlet'), P('noel', { hunted: 2, veil: 2 })], [E('e0')], { round: 1 });
    s.intents = { e0: { kind: 'attack', target: 'scarlet' } };
    // (Her own action would end her veil, so she holds it this round.)
    const r2 = resolveRound(s, { scarlet: { kind: 'defend' } }, constRng(0.5));
    expect(hitsOn(r2, 'scarlet')).toBe(1);
    expect(hitsOn(r2, 'noel')).toBe(0);
  });

  it('13. two foes in disguise keep their letters', () => {
    const was = ENEMIES.slime;
    try {
      (ENEMIES as Record<string, EnemyDef>).slime = { ...was, opener: 'disguise' };
      const s = createBattle({ party: fullParty(LEGACY_LINEUP), enemyIds: ['slime', 'slime'], inventory: {}, revealed: {} });
      expect(s.enemies.map((e) => e.name)).toEqual([`${T.battle.foe.disguise} A`, `${T.battle.foe.disguise} B`]);
      expect(s.enemies.map((e) => e.disguised)).toEqual([`${was.name} A`, `${was.name} B`]);
    } finally {
      (ENEMIES as Record<string, EnemyDef>).slime = was;
    }
  });

  it('13. opening decoys stop at ROW_MAX', () => {
    const was = ENEMIES.slime;
    try {
      (ENEMIES as Record<string, EnemyDef>).slime = { ...was, opener: 'decoy', decoys: 3, skills: [] };
      const s = createBattle({ party: fullParty(LEGACY_LINEUP), enemyIds: ['slime', 'slime', 'slime'], inventory: {}, revealed: {}, extra: 9 });
      expect(s.enemies.length).toBe(ROW_MAX);
      expect(s.enemies.filter((e) => e.decoyOf)).toHaveLength(ROW_MAX - 3);
    } finally {
      (ENEMIES as Record<string, EnemyDef>).slime = was;
    }
  });
});

describe('M5 a turning weakness (roster plan B7)', () => {
  const crow = () => createBattle({ party: fullParty(LEGACY_LINEUP), enemyIds: ['moon-crow'], inventory: {}, revealed: {} });

  it('cycles through all four elements', () => {
    expect(ENEMIES['moon-crow'].prism).toBe('cycle');
    let s = crow();
    for (const c of s.party) { c.max = { ...c.max, hp: 99999 }; c.hp = 99999; }
    s.enemies[0].max = { ...s.enemies[0].max, hp: 99999 };
    s.enemies[0].hp = 99999;
    const seen = [s.enemies[0].weak];
    for (let i = 0; i < 4; i++) {
      s = resolveRound(s, defend(s), constRng(0.5));
      seen.push(s.enemies[0].weak);   // planned for the next round, so it shows before the party chooses
    }
    expect(seen).toEqual([['phys'], ['fire'], ['ice'], ['thunder'], ['phys']]);
    expect(s.enemies[0].resist).toEqual([]);
  });

  it('a region does not override a prism', () => {
    const blaze = scaleEnemy(ENEMIES['moon-crow'], 8, REGIONS.blaze, false);
    expect([blaze.weak, blaze.resist]).toEqual([[], []]);
    // An ordinary foe takes the region's, as ever.
    expect(scaleEnemy(ENEMIES['paper-moth'], 8, REGIONS.blaze, false).weak).toEqual([...REGIONS.blaze.weak]);
  });

  it('a prism foe writes no revealed weakness', () => {
    const s = crow();
    const hero = s.party[0];
    const ctx = { rng: constRng(0.5), itemBoost: false, revealed: s.revealed, log: s.log, battle: s };
    applyEffect(hero, s.enemies[0], { kind: 'damage', power: 10, element: 'fire', scale: 'mag', melee: false }, ctx);
    applyEffect(hero, s.enemies[0], { kind: 'appraise' }, ctx);
    expect(s.revealed['moon-crow']).toBeUndefined();
    // Any other foe tells it as before.
    const plain = createBattle({ party: fullParty(LEGACY_LINEUP), enemyIds: ['slime'], inventory: {}, revealed: {} });
    applyEffect(hero, plain.enemies[0], { kind: 'damage', power: 10, element: 'fire', scale: 'mag', melee: false }, { ...ctx, revealed: plain.revealed, battle: plain });
    expect(plain.revealed.slime).toEqual(['fire']);
  });
});

describe('M16 adapt (roster plan B7)', () => {
  const crystal = (over: Partial<Combatant> = {}) =>
    makeBattle([P('scarlet', { max: { mag: 40, tp: 99 } as never, tp: 99 })], [E('e0', { adapt: 3, weak: ['fire'], max: { hp: 9999 } as never, ...over })], { enemyDefs: { e0: def([], { adapt: 3, weak: ['fire'] }) } });
  const cast = (skill: string): Record<string, Action> => ({ scarlet: { kind: 'skill', skill, target: 'e0' } });

  it('adapts to the first element', () => {
    expect(ENEMIES['sorrow-crystal'].adapt).toBe(3);
    const r = resolveRound(crystal(), cast('fire-star'), constRng(0.5));
    // The first fire landed as a weakness; now fire is its resistance and no weakness.
    expect(r.log.find((e) => e.type === 'damage' && e.target === 'e0')).toMatchObject({ mult: 1.5 });
    expect(r.enemies[0].resist).toEqual(['fire']);
    expect(r.enemies[0].weak).toEqual([]);
    expect(r.log).toContainEqual({ type: 'foe', actor: 'e0', cue: 'adapt' });
    // The next element finds it as it was: only the first one counts.
    const r2 = resolveRound(r, cast('ice-star'), constRng(0.5));
    expect(r2.enemies[0].resist).toEqual(['fire']);
    expect(r2.log.find((e) => e.type === 'damage' && e.target === 'e0')).toMatchObject({ mult: 1 });
  });

  it('adaptation expires', () => {
    let s = resolveRound(crystal(), cast('fire-star'), constRng(0.5));
    s = resolveRound(s, defend(s), constRng(0.5));
    expect(s.enemies[0].resist).toEqual(['fire']);
    s = resolveRound(s, defend(s), constRng(0.5));
    expect([s.enemies[0].resist, s.enemies[0].weak]).toEqual([[], ['fire']]);
    // Once a fight: fire lands as a weakness again, and it does not adapt a second time.
    s = resolveRound(s, cast('fire-star'), constRng(0.5));
    expect(s.enemies[0].resist).toEqual([]);
    expect(s.log.find((e) => e.type === 'damage' && e.target === 'e0')).toMatchObject({ mult: 1.5 });
  });
});

describe('M8 stages (roster plan B7)', () => {
  const blow = (name: string): EnemySkill => ({ name, chance: 1, target: 'enemy', effects: [hit(50)] });
  const staged = () => makeBattle([P('scarlet', { max: { hp: 9999 } as never })], [E('e0', { max: { hp: 100 } as never })],
    { enemyDefs: { e0: def([blow('一階')], { stages: [{ below: 50, skills: [blow('二階')], weak: ['ice'] }] }) } });

  it('switches under its threshold', () => {
    const s = staged();
    s.enemies[0].hp = 60;
    planEnemies(s, constRng(0.5));
    expect(intentLabel(s, 'e0')).toBe('一階 → scarlet');
    s.enemies[0].hp = 50;
    planEnemies(s, constRng(0.5));
    expect(intentLabel(s, 'e0')).toBe('二階 → scarlet');
    expect(s.enemies[0]).toMatchObject({ stage: 0, weak: ['ice'] });
    expect(s.log).toContainEqual({ type: 'foe', actor: 'e0', cue: 'stage' });
    const r = resolveRound(s, defend(s), constRng(0.5));
    expect(acted(r, 'e0')).toEqual(['二階']);
  });

  it('never switches back after healing', () => {
    const s = staged();
    s.enemies[0].hp = 40;
    planEnemies(s, constRng(0.5));
    s.enemies[0].hp = 100;
    const r = resolveRound(s, defend(s), constRng(0.5));
    expect(r.enemies[0].stage).toBe(0);
    expect(acted(r, 'e0')).toEqual(['二階']);
    expect(intentLabel(r, 'e0')).toBe('二階 → scarlet');
  });

  it('the false moon turns between bright and eclipse every two rounds', () => {
    const moon = ENEMIES['false-moon'];
    expect(moon.stageEvery).toBe(2);
    let s = createBattle({ party: fullParty(LEGACY_LINEUP), enemyIds: ['false-moon'], inventory: {}, revealed: {} });
    for (const c of s.party) { c.max = { ...c.max, hp: 99999 }; c.hp = 99999; }
    const lists: string[][] = [];
    for (let i = 0; i < 6; i++) {
      s = resolveRound(s, defend(s), mulberry32(i + 1));
      lists.push(skillsOf(s, s.enemies[0]).map((k) => k.name));   // the list its next round is drawn from
    }
    const bright = moon.skills.map((k) => k.name), eclipse = moon.stages![0].skills.map((k) => k.name);
    // Rounds 2..7: bright (2), eclipse (3, 4), bright (5, 6), eclipse (7).
    expect(lists).toEqual([bright, eclipse, eclipse, bright, bright, eclipse]);
    expect(bright.some((n) => n.includes('月明'))).toBe(true);
    expect(eclipse.some((n) => n.includes('月蝕'))).toBe(true);
  });
});

describe('M6 a borrowed blow (roster plan B8)', () => {
  const mirror = (cap: number): EnemySkill => ({ name: '借來的招式', chance: 1, target: 'enemy', effects: [{ kind: 'mirror', cap }] });
  const field = (cap: number, rec?: BattleState['lastPartyHit']) => {
    const s = makeBattle([P('scarlet', { max: { hp: 9999 } as never }), P('noel', { max: { hp: 9999 } as never })], [E('e0', { mirrors: true, max: { atk: 40, mag: 40 } as never })],
      { enemyDefs: { e0: def([mirror(cap)]) }, ...(rec ? { lastPartyHit: rec } : {}) });
    s.intents = { e0: { kind: 'enemy-skill', index: 0, target: 'scarlet' } };
    return s;
  };
  const blowOn = (s: BattleState, key: string) => s.log.find((e) => e.type === 'damage' && e.target === key) as { amount: number; element: string } | undefined;

  it('returns the last element at most cap', () => {
    const rec = { by: 'noel', element: 'fire' as const, power: 140 };
    const r = resolveRound(field(999, rec), defend(field(999, rec)), constRng(0.5));
    // It struck back at the one who cast it (noel, not the scarlet it drew), in her element.
    expect(acted(r, 'e0')).toEqual(['借來的招式']);
    expect(blowOn(r, 'scarlet')).toBeUndefined();
    expect(blowOn(r, 'noel')?.element).toBe('fire');
    const capped = resolveRound(field(50, rec), defend(field(50, rec)), constRng(0.5));
    const at140 = resolveRound(field(140, rec), defend(field(140, rec)), constRng(0.5));
    expect(blowOn(capped, 'noel')!.amount).toBeLessThan(blowOn(r, 'noel')!.amount);
    expect(blowOn(at140, 'noel')!.amount).toBe(blowOn(r, 'noel')!.amount);
  });

  it('remembers the last blow the party landed', () => {
    const s = field(999);
    s.party[0].tp = 50;
    const r = resolveRound(s, { scarlet: { kind: 'skill', skill: 'ice-star', target: 'e0' }, noel: { kind: 'defend' } }, constRng(0.5));
    expect(r.lastPartyHit).toMatchObject({ by: 'scarlet', element: 'ice' });
    // A fight with no foe that borrows keeps no record.
    const plain = makeBattle([P('scarlet', { tp: 50 })], [E('e0', { max: { hp: 9999 } as never })]);
    const r2 = resolveRound(plain, { scarlet: { kind: 'skill', skill: 'ice-star', target: 'e0' } }, constRng(0.5));
    expect(r2.lastPartyHit).toBeUndefined();
  });

  it('without a record it is an attack', () => {
    const r = resolveRound(field(999), defend(field(999)), constRng(0.5));
    expect(acted(r, 'e0')).toEqual(['攻擊']);
    expect(blowOn(r, 'scarlet')?.element).toBe('phys');
    // Nor when the one who cast it is down.
    const gone = field(999, { by: 'noel', element: 'fire', power: 140 });
    gone.party[1].alive = false;
    gone.party[1].hp = 0;
    expect(acted(resolveRound(gone, defend(gone), constRng(0.5)), 'e0')).toEqual(['攻擊']);
  });
});

describe('M7 parts (roster plan B8)', () => {
  const body = (handUp: boolean) => {
    const s = makeBattle([P('scarlet', { max: { atk: 60 } as never })], [E('e0', { max: { hp: 9999 } as never }), E('e1', { defId: 'archon-hand', alive: handUp, hp: handUp ? 100 : 0 })],
      { enemyDefs: { e0: def([], { parts: { cutPct: 50 } }), e1: def([], { rank: 'part' }) } });
    syncParts(s, (c) => s.enemyDefs![c.key]);
    return s;
  };
  const dealt = (s: BattleState) => (s.log.find((e) => e.type === 'damage' && e.target === 'e0') as { amount: number }).amount;

  it('half while a part stands', () => {
    const up = body(true), down = body(false);
    expect(up.enemies[0].cut).toBe(50);
    expect(down.enemies[0].cut).toBeUndefined();
    const a = dealt(resolveRound(up, { scarlet: { kind: 'attack', target: 'e0' } }, constRng(0.5)));
    const b = dealt(resolveRound(down, { scarlet: { kind: 'attack', target: 'e0' } }, constRng(0.5)));
    expect(a).toBe(Math.floor(b / 2));
    // The part itself takes its blows whole.
    const onHand = resolveRound(body(true), { scarlet: { kind: 'attack', target: 'e1' } }, constRng(0.5));
    expect(onHand.log.some((e) => e.type === 'damage' && e.target === 'e1')).toBe(true);
  });

  it('drops with the last part', () => {
    const s = body(true);
    s.enemies[1].hp = 1;
    const r = resolveRound(s, { scarlet: { kind: 'attack', target: 'e1' } }, constRng(0.5));
    expect(r.enemies[1].alive).toBe(false);
    expect(r.enemies[0].cut).toBeUndefined();
    // The real bodies: the archon's hands and the sovereign's pillars.
    expect(ENEMIES['old-city-archon'].parts).toEqual({ cutPct: 50 });
    expect(ENEMIES['rime-sovereign'].parts).toEqual({ cutPct: 50 });
  });
});

describe('M18 mimic (roster plan B8)', () => {
  const shadow = (ids: Parameters<typeof fullParty>[0]) => createBattle({ party: fullParty(ids), enemyIds: ['lost-shadow'], inventory: {}, revealed: {} });

  it('copies the strongest member', () => {
    expect(ENEMIES['lost-shadow'].mimic).toBe(60);
    const s = shadow(LEGACY_LINEUP);
    const top = s.party.reduce((a, b) => (b.max.atk > a.max.atk ? b : a));
    // A full party: no other multiplier at its home depth.
    expect(s.enemies[0].max.atk).toBe(Math.round(top.max.atk * 0.6));
    expect(s.enemies[0].max.mag).toBe(Math.round(top.max.mag * 0.6));
    expect(s.enemies[0].max.hp).toBe(ENEMIES['lost-shadow'].stats.hp);
  });

  it('scales with party size', () => {
    const solo = shadow(['hero']);
    const k = solo.partyScale!;
    expect(k).toBeLessThan(1);
    expect(solo.enemies[0].max.atk).toBe(Math.round(solo.party[0].max.atk * 0.6 * k));
    // And at depth, as every foe grows, so does the copy's multiplier (an elite's, a depth's power), never its growth.
    const deep = createBattle({ party: fullParty(LEGACY_LINEUP), enemyIds: ['lost-shadow'], inventory: {}, revealed: {}, scale: { depth: 20, region: 'mainline', elite: 'lost-shadow' } });
    const top = deep.party.reduce((a, b) => (b.max.atk > a.max.atk ? b : a));
    expect(deep.enemies[0].max.atk).toBeGreaterThan(Math.round(top.max.atk * 0.6));
  });
});

describe('M9 forget (roster plan B9)', () => {
  const lost = (over: Partial<Combatant> = {}) =>
    makeBattle([P('scarlet', { forget: true, tp: 50, max: { hp: 9999, tp: 50 } as never, ...over })], [E('e0', { max: { hp: 9999 } as never })], { inventory: { potion: 1 } });

  it('attacks instead of casting', () => {
    const r = resolveRound(lost(), { scarlet: { kind: 'skill', skill: 'fire-star', target: 'e0' } }, constRng(0.5));
    expect(acted(r, 'scarlet')).toEqual(['攻擊']);
    expect(r.log.find((e) => e.type === 'damage' && e.target === 'e0')).toMatchObject({ element: 'phys' });
    expect(r.party[0].tp).toBe(50);   // nothing was paid
    // It lasts her one turn.
    expect(r.party[0].forget).toBeUndefined();
    const r2 = resolveRound(r, { scarlet: { kind: 'skill', skill: 'fire-star', target: 'e0' } }, constRng(0.5));
    expect(acted(r2, 'scarlet')).toEqual(['火之星彈']);
  });

  it('items and ultimates still work', () => {
    const item = resolveRound(lost({ hp: 10 }), { scarlet: { kind: 'item', item: 'potion', target: 'scarlet' } }, constRng(0.5));
    expect(acted(item, 'scarlet')).toEqual(['回復藥']);
    const ult = resolveRound(lost({ limit: 100 }), { scarlet: { kind: 'ultimate', target: 'e0' } }, constRng(0.5));
    expect(ult.log.some((e) => e.type === 'act' && e.actor === 'scarlet' && e.ultimate)).toBe(true);
    const guard = resolveRound(lost(), { scarlet: { kind: 'defend' } }, constRng(0.5));
    expect(acted(guard, 'scarlet')).toEqual(['防禦']);
  });

  it('a foe that forgets attacks plainly too', () => {
    const s = makeBattle([P('scarlet', { max: { hp: 9999 } as never })], [E('e0', { forget: true })], { enemyDefs: { e0: def([{ name: '大招', chance: 1, target: 'enemies', effects: [hit(300)] }]) } });
    s.intents = { e0: { kind: 'enemy-skill', index: 0 } };
    expect(acted(resolveRound(s, defend(s), constRng(0.5)), 'e0')).toEqual(['攻擊']);
  });

  it('cure clears forget', () => {
    const s = lost();
    const ctx = { rng: constRng(0.5), itemBoost: false, revealed: {}, log: [], battle: s };
    applyEffect(s.party[0], s.party[0], { kind: 'cure' }, ctx);
    expect(s.party[0].forget).toBeUndefined();
    expect(ailmentChips(lost().party[0])).toEqual([{ id: 'forget' }]);
  });

  it("Bobby's first aid still cures in its old order", () => {
    expect(AILMENT_IDS).toEqual(['poison', 'burn', 'bleed', 'shock', 'freeze', 'sleep', 'forget']);
    // A cure of the old six leaves a forget alone; the whole list takes it.
    const c = P('bobby', { forget: true, poison: true });
    cureAilments(c, AILMENT_IDS.slice(0, 6));
    expect([c.poison, c.forget]).toEqual([false, true]);
    cureAilments(c, AILMENT_IDS);
    expect(c.forget).toBeUndefined();
  });

  it('a boss halves it, and sleepRes resists it', () => {
    expect(ailmentChance(E('e0', { boss: true }), 'forget', 0.5)).toBeCloseTo(0.25, 12);
    expect(ailmentChance(P('noel', { x: { sleepRes: 40 } }), 'forget', 0.5)).toBeCloseTo(0.3, 12);
    // It lands with one draw, and logs as an ailment.
    const s = lost({ forget: undefined });
    const ctx = { rng: constRng(0), itemBoost: false, revealed: {}, log: [] as BattleEvent[], battle: s };
    applyEffect(s.enemies[0], s.party[0], { kind: 'inflict', status: 'forget', chance: 0.5 }, ctx);
    expect(s.party[0].forget).toBe(true);
    expect(ctx.log).toContainEqual({ type: 'status', target: 'scarlet', status: 'forget' });
  });
});

describe('M17 TP thieves (roster plan B9)', () => {
  it('tp never below zero', () => {
    const s = makeBattle([P('scarlet', { tp: 5, max: { hp: 9999 } as never })], [E('e0')], { enemyDefs: { e0: def([{ name: '汲取', chance: 1, target: 'enemy', effects: [{ ...hit(50), tpDrain: 15 } as Effect] }]) } });
    s.intents = { e0: { kind: 'enemy-skill', index: 0, target: 'scarlet' } };
    const r = resolveRound(s, defend(s), constRng(0.5));
    expect(r.party[0].tp).toBe(0);
    expect(r.enemies[0].drained).toBe(5);
    expect(r.log).toContainEqual({ type: 'foe', actor: 'e0', cue: 'drain', target: 'scarlet', amount: 5 });
    // A full pool loses the whole share.
    const full = makeBattle([P('scarlet', { tp: 40, max: { hp: 9999, tp: 40 } as never })], [E('e0')], { enemyDefs: s.enemyDefs });
    full.intents = s.intents;
    expect(resolveRound(full, defend(full), constRng(0.5)).party[0].tp).toBe(25);
  });
});

describe('M25 poison hunters (roster plan B9)', () => {
  it('only against the poisoned', () => {
    const sting = (poisoned: boolean) => {
      const s = makeBattle([P('scarlet', { poison: poisoned, max: { hp: 9999 } as never })], [E('e0')], { enemyDefs: { e0: def([{ name: '毒針', chance: 1, target: 'enemy', effects: [{ ...hit(100), vsPoisoned: 50 } as Effect] }]) } });
      s.intents = { e0: { kind: 'enemy-skill', index: 0, target: 'scarlet' } };
      return (resolveRound(s, { scarlet: { kind: 'attack', target: 'e0' } }, constRng(0.5)).log.find((e) => e.type === 'damage' && e.target === 'scarlet') as { amount: number }).amount;
    };
    const plain = sting(false), poisoned = sting(true);
    expect(Math.abs(poisoned / plain - 1.5)).toBeLessThan(0.05);
    expect(ENEMIES['sand-scorpion'].skills.some((k) => k.effects.some((e) => e.kind === 'damage' && e.vsPoisoned === 50))).toBe(true);
  });
});

describe('M15 buff thieves (roster plan B9)', () => {
  it('moves buffs and leaves debuffs, auras and wards', () => {
    const m = P('scarlet', {
      buffs: [{ stat: 'atk', pct: 30, turns: 3, src: 'noel' }, { stat: 'def', pct: -20, turns: 2 }, { stat: 'spd', pct: 10, turns: 1 }],
      auras: [{ stat: 'res', pct: 15, turns: 0 }], ward: { def: 20, res: 20, src: 'chizuru' },
    });
    const foe = E('e0', { buffs: [{ stat: 'atk', pct: 10, turns: 1 }] });
    const log: BattleEvent[] = [];
    applyEffect(foe, m, { kind: 'dispel' }, { rng: constRng(0.5), itemBoost: false, revealed: {}, log });
    // Her debuff stays; her aura and the barrier's ward are not buffs.
    expect(m.buffs).toEqual([{ stat: 'def', pct: -20, turns: 2 }]);
    expect(m.auras).toEqual([{ stat: 'res', pct: 15, turns: 0 }]);
    expect(m.ward).toEqual({ def: 20, res: 20, src: 'chizuru' });
    // The foe has them now as its own (the stronger atk replacing its weaker one), for the rounds they had left.
    expect(foe.buffs).toEqual([{ stat: 'atk', pct: 30, turns: 3, src: 'e0' }, { stat: 'spd', pct: 10, turns: 1, src: 'e0' }]);
    expect(log).toContainEqual({ type: 'foe', actor: 'e0', cue: 'dispel', target: 'scarlet' });
    // Nothing to take: nothing happens, and nothing is said.
    const bare = P('noel');
    const quiet: BattleEvent[] = [];
    applyEffect(foe, bare, { kind: 'dispel' }, { rng: constRng(0.5), itemBoost: false, revealed: {}, log: quiet });
    expect(quiet).toEqual([]);
  });
});

describe('M21 mend (roster plan B10)', () => {
  const machine = () => makeBattle([P('scarlet', { tp: 50, max: { hp: 9999, mag: 1 } as never })], [E('e0', { hp: 50, max: { hp: 100 } as never, mend: { pct: 12, stopBy: 'thunder' } })],
    { enemyDefs: { e0: def([], { mend: { pct: 12, stopBy: 'thunder' } }) } });

  it('mends at the round end', () => {
    const r = resolveRound(machine(), defend(machine()), constRng(0.5));
    expect(r.enemies[0].hp).toBe(62);
    expect(r.log).toContainEqual({ type: 'heal', target: 'e0', amount: 12 });
    // Never past its max.
    const near = machine();
    near.enemies[0].hp = 95;
    expect(resolveRound(near, defend(near), constRng(0.5)).enemies[0].hp).toBe(100);
  });

  it('stops on its element', () => {
    const s = machine();
    const r = resolveRound(s, { scarlet: { kind: 'skill', skill: 'thunder-star', target: 'e0' } }, constRng(0.5));
    const after = r.enemies[0].hp;
    expect(r.log.some((e) => e.type === 'heal' && e.target === 'e0')).toBe(false);
    expect(r.log).toContainEqual({ type: 'foe', actor: 'e0', cue: 'short' });
    // Another element does not stop it.
    const f = resolveRound(machine(), { scarlet: { kind: 'skill', skill: 'fire-star', target: 'e0' } }, constRng(0.5));
    expect(f.log.some((e) => e.type === 'heal' && e.target === 'e0')).toBe(true);
    // And the next round it mends again.
    const r2 = resolveRound(r, defend(r), constRng(0.5));
    expect(r2.enemies[0].hp).toBe(after + 12);
    expect(ENEMIES['ancestor-automaton'].mend).toEqual({ pct: 12, stopBy: 'thunder' });
  });
});

describe('M23 encased (roster plan B10)', () => {
  const pilgrim = () => {
    const was = ENEMIES.slime;
    try {
      (ENEMIES as Record<string, EnemyDef>).slime = { ...was, opener: 'encased' };
      return createBattle({ party: fullParty(LEGACY_LINEUP), enemyIds: ['slime'], inventory: {}, revealed: {} });
    } finally {
      (ENEMIES as Record<string, EnemyDef>).slime = was;
    }
  };

  it('opens encased: hard to hurt, and it does not act', () => {
    const s = pilgrim();
    const e = s.enemies[0];
    expect(e.encased).toBe(true);
    expect(stat(e, 'def')).toBe(Math.floor(e.max.def * 2.5));
    expect(stat(e, 'res')).toBe(Math.floor(e.max.res * 2.5));
    planEnemies(s, constRng(0.5));
    expect(s.intents!.e0).toBeUndefined();
    expect(intentLabel(s, 'e0')).toBe(T.battle.foe.encased);
    const r = resolveRound(s, defend(s), constRng(0.5));
    expect(acted(r, 'e0')).toEqual([]);
  });

  it('fire thaws', () => {
    const s = pilgrim();
    const hero = s.party[0];
    const ctx = { rng: constRng(0.5), itemBoost: false, revealed: {}, log: s.log, battle: s };
    applyEffect(hero, s.enemies[0], { kind: 'damage', power: 10, element: 'ice', scale: 'mag', melee: false }, ctx);
    expect(s.enemies[0].encased).toBe(true);
    applyEffect(hero, s.enemies[0], { kind: 'damage', power: 10, element: 'fire', scale: 'mag', melee: false }, ctx);
    expect(s.enemies[0].encased).toBeUndefined();
    expect(s.log).toContainEqual({ type: 'foe', actor: 'e0', cue: 'thaw' });
  });

  it('thaws by round three', () => {
    let s = pilgrim();
    for (const c of s.party) { c.max = { ...c.max, hp: 99999 }; c.hp = 99999; }
    s = resolveRound(s, defend(s), constRng(0.5));
    expect(s.enemies[0].encased).toBe(true);
    s = resolveRound(s, defend(s), constRng(0.5));
    expect(s.enemies[0].encased).toBeUndefined();
    expect(s.intents!.e0).toBeDefined();
    s = resolveRound(s, defend(s), constRng(0.5));
    expect(acted(s, 'e0').length).toBe(1);
    expect(ENEMIES['frozen-pilgrim'].opener).toBe('encased');
  });
});

describe('M26 rally (roster plan B10)', () => {
  it('the rally goes with its bearer', () => {
    const s = makeBattle([P('scarlet', { max: { hp: 9999, atk: 999 } as never })], [E('e0', { hp: 1 }), E('e1', { max: { hp: 9999, atk: 100 } as never })],
      { enemyDefs: { e0: def([], { rally: { atk: 20 } }), e1: def([]) } });
    syncRallies(s, (c) => s.enemyDefs![c.key]);
    expect(stat(s.enemies[1], 'atk')).toBe(120);
    expect(stat(s.enemies[0], 'atk')).toBe(s.enemies[0].max.atk);   // the bearer's own banner is for the others
    const r = resolveRound(s, { scarlet: { kind: 'attack', target: 'e0' } }, constRng(0.5));
    expect(r.enemies[0].alive).toBe(false);
    expect(r.enemies[1].auras).toBeUndefined();
    expect(stat(r.enemies[1], 'atk')).toBe(100);
    // A fight with no banner carries no aura at all.
    const plain = makeBattle([P('scarlet')], [E('e0'), E('e1')]);
    syncRallies(plain, () => ENEMIES.slime);
    expect(plain.enemies.every((e) => e.auras === undefined)).toBe(true);
  });

  it('a throng grows with its kin', () => {
    const s = makeBattle([P('scarlet')], [E('e0', { defId: 'shadow-parade' }), E('e1', { defId: 'lost-shadow' }), E('e2', { defId: 'lost-shadow' })],
      { enemyDefs: { e0: def([], { throng: { id: 'lost-shadow', per: { atk: 15 } } }), e1: def([]), e2: def([]) } });
    syncRallies(s, (c) => s.enemyDefs![c.key]);
    expect(s.enemies[0].auras).toEqual([{ stat: 'atk', pct: 30, turns: 0, src: 'e0' }]);
    s.enemies[2].alive = false;
    syncRallies(s, (c) => s.enemyDefs![c.key]);
    expect(s.enemies[0].auras).toEqual([{ stat: 'atk', pct: 15, turns: 0, src: 'e0' }]);
  });
});

describe('M27 stall (roster plan B10)', () => {
  const stall: EnemySkill = { name: '遲滯', chance: 1, target: 'enemy', effects: [{ kind: 'delay' }, { kind: 'buff', stat: 'spd', pct: -30, turns: 2 }] };
  const clock = () => makeBattle([P('scarlet', { max: { hp: 9999 } as never }), P('noel', { max: { hp: 9999 } as never })], [E('e0', { max: { hp: 9999 } as never })], { enemyDefs: { e0: def([stall]) } });

  it('never delays one member twice in a row', () => {
    let s = clock();
    const hit: string[] = [];
    for (let i = 0; i < 6; i++) {
      s = resolveRound(s, defend(s), constRng(0.1));
      hit.push(s.party.find((c) => c.delay === s.round + 1)!.key);
    }
    for (let i = 1; i < hit.length; i++) expect(hit[i]).not.toBe(hit[i - 1]);
    // Even a taunt that sends the blow to the same member again leaves her undelayed this time.
    const t = clock();
    t.party[0].delayedBy = 'e0';
    t.party[0].taunt = 3;
    t.intents = { e0: { kind: 'enemy-skill', index: 0, target: 'scarlet' } };
    const r = resolveRound(t, defend(t), constRng(0.5));
    expect(r.party[0].delay).toBeUndefined();
  });

  it('a delay never skips a turn', () => {
    let s = clock();
    s = resolveRound(s, defend(s), constRng(0.1));
    const slowed = s.party.find((c) => c.delay === s.round + 1)!;
    expect(stat(slowed, 'spd')).toBeLessThan(slowed.max.spd);   // slower through the next round
    const order: string[] = [];
    const acts: Record<string, Action> = { scarlet: { kind: 'attack', target: 'e0' }, noel: { kind: 'attack', target: 'e0' } };
    const r = resolveRound(s, acts, constRng(0.5));
    for (const e of r.log) if (e.type === 'act') order.push(e.actor);
    // She still acts, and last of the party.
    expect(order).toContain(slowed.key);
    expect(order.filter((k) => k !== 'e0').at(-1)).toBe(slowed.key);
  });
});

describe('M28 engulf (roster plan B10)', () => {
  const gulp: EnemySkill = { name: '吞入', chance: 1, target: 'enemy', effects: [hit(10), { kind: 'engulf' }] };
  const maw = (n = 2) => {
    const party = [P('scarlet', { max: { hp: 9999, atk: 50 } as never }), P('noel', { max: { hp: 9999 } as never }), P('chizuru', { max: { hp: 9999 } as never })].slice(0, n);
    return makeBattle(party, [E('e0', { max: { hp: 10000 } as never }), E('e1', { max: { hp: 9999 } as never })], { enemyDefs: { e0: def([gulp]), e1: def([]) } });
  };
  const swallowed = (n = 2) => {
    const s = maw(n);
    s.intents = { e0: { kind: 'enemy-skill', index: 0, target: 'scarlet' }, e1: { kind: 'attack', target: 'noel' } };
    return resolveRound(s, defend(s), constRng(0.5));
  };

  it('swallows one member, and foes cannot reach her inside', () => {
    const r = swallowed();
    expect(r.party[0].engulfed).toBe('e0');
    expect(r.enemies[0].gulp).toMatchObject({ key: 'scarlet', until: 2 });
    expect(r.log).toContainEqual({ type: 'foe', actor: 'e0', cue: 'engulf', target: 'scarlet' });
    // Next round every blow goes to the one outside.
    r.intents = { e1: { kind: 'attack', target: 'scarlet' } };
    const r2 = resolveRound(r, { noel: { kind: 'defend' } }, constRng(0.5));
    expect(hitsOn(r2, 'scarlet')).toBe(0);
    expect(hitsOn(r2, 'noel')).toBeGreaterThan(0);
  });

  it('an engulfed member still acts, on the engulfer only', () => {
    const r = swallowed(3);
    const before = r.enemies[0].hp;
    const r2 = resolveRound(r, { scarlet: { kind: 'attack', target: 'e1' }, noel: { kind: 'defend' }, chizuru: { kind: 'defend' } }, constRng(0.5));
    expect(acted(r2, 'scarlet')).toEqual(['攻擊']);
    expect(hitsOn(r2, 'e1')).toBe(0);
    expect(r2.enemies[0].hp).toBeLessThan(before);
    // From inside, half again as hard.
    const out = maw(3);
    const plainHit = resolveRound(out, { scarlet: { kind: 'attack', target: 'e0' }, noel: { kind: 'defend' }, chizuru: { kind: 'defend' } }, constRng(0.5));
    const inside = (r2.log.find((e) => e.type === 'damage' && e.target === 'e0') as { amount: number }).amount;
    const outside = (plainHit.log.find((e) => e.type === 'damage' && e.target === 'e0') as { amount: number }).amount;
    expect(Math.abs(inside / outside - 1.5)).toBeLessThan(0.05);
    // What she may pick: the engulfer, and of allies herself.
    expect(choosable(r, r.party[0], 'foe').map((c) => c.key)).toEqual(['e0']);
    expect(choosable(r, r.party[0], 'ally').map((c) => c.key)).toEqual(['scarlet']);
  });

  it('released by damage', () => {
    const r = swallowed(3);
    r.party[1].max = { ...r.party[1].max, atk: 3000 };
    const r2 = resolveRound(r, { scarlet: { kind: 'defend' }, noel: { kind: 'attack', target: 'e0' }, chizuru: { kind: 'defend' } }, constRng(0.5));
    expect(r2.party[0].engulfed).toBeUndefined();
    expect(r2.enemies[0].gulp?.key).not.toBe('scarlet');   // (free again, it may take another later in the round)
    expect(r2.log).toContainEqual({ type: 'foe', actor: 'e0', cue: 'spit', target: 'scarlet' });
  });

  it('released after a round, poisoned by the round inside', () => {
    const r = swallowed();
    expect(r.party[0].engulfed).toBe('e0');   // still in at the end of the round she went in
    const r2 = resolveRound(r, { scarlet: { kind: 'defend' }, noel: { kind: 'defend' } }, constRng(0.5));
    expect(r2.log.some((e) => e.type === 'poison-tick' && e.target === 'scarlet')).toBe(true);
    expect(r2.party[0].engulfed).toBeUndefined();
    expect(r2.log).toContainEqual({ type: 'foe', actor: 'e0', cue: 'spit', target: 'scarlet' });
    // And the engulfer falling lets her out at once.
    const r3 = swallowed();
    r3.enemies[0].hp = 1;
    const r4 = resolveRound(r3, { scarlet: { kind: 'attack', target: 'e0' }, noel: { kind: 'defend' } }, constRng(0.5));
    expect(r4.enemies[0].alive).toBe(false);
    expect(r4.party[0].engulfed).toBeUndefined();
  });

  it('never engulfs the last standing', () => {
    const s = maw(2);
    s.party[1].alive = false;
    s.party[1].hp = 0;
    s.intents = { e0: { kind: 'enemy-skill', index: 0, target: 'scarlet' } };
    const r = resolveRound(s, { scarlet: { kind: 'defend' } }, constRng(0.5));
    expect(r.party[0].engulfed).toBeUndefined();
    // Nor a second one while it holds one.
    const two = swallowed(3);
    two.intents = { e0: { kind: 'enemy-skill', index: 0, target: 'noel' } };
    const r2 = resolveRound(two, defend(two), constRng(0.5));
    expect(r2.party[1].engulfed).toBeUndefined();
  });

  it('no ally can heal the engulfed', () => {
    const r = swallowed(3);
    r.party[0].hp = 100;
    const healer = r.party[1];
    healer.tp = 50;
    expect(choosable(r, healer, 'ally').map((c) => c.key)).toEqual(['noel', 'chizuru']);
    const r2 = resolveRound(r, { scarlet: { kind: 'defend' }, noel: { kind: 'skill', skill: 'moonlight', target: 'scarlet' }, chizuru: { kind: 'defend' } }, constRng(0.5));
    expect(r2.log.some((e) => e.type === 'heal' && e.target === 'scarlet')).toBe(false);
    // An item reaches her.
    expect(choosable(r, healer, 'ally', true).map((c) => c.key)).toEqual(['scarlet', 'noel', 'chizuru']);
  });
});

describe('roster plan B11: the traits that needed one more rule', () => {
  it('a skill every N rounds comes on those rounds only, and its draw holds on the others', () => {
    const swing: EnemySkill = { name: '沙暴', chance: 1, target: 'enemies', every: 2, effects: [hit(10)] };
    const s = makeBattle([P('scarlet', { max: { hp: 9999 } as never })], [E('e0')], { enemyDefs: { e0: def([swing]) } });
    let r = s;
    const names: string[][] = [];
    for (let i = 0; i < 4; i++) { r = resolveRound(r, defend(r), constRng(0.5)); names.push(acted(r, 'e0')); }
    expect(names).toEqual([['攻擊'], ['沙暴'], ['攻擊'], ['沙暴']]);
    // Passed over, it still drew for its chance.
    const a = counted(), b = counted();
    planEnemies(makeBattle([P('scarlet')], [E('e0')], { enemyDefs: { e0: def([swing]) } }), a.rng);   // plans round 1: passed over
    planEnemies(makeBattle([P('scarlet')], [E('e0')], { enemyDefs: { e0: def([{ ...swing, chance: 0 }]) } }), b.rng);
    expect(a.n).toBe(b.n);
  });

  it('a wound-up skill that comes every N rounds lands the round after, off its beat', () => {
    const dive: EnemySkill = { name: '吞沒', chance: 1, target: 'enemies', every: 3, windup: '深潛', effects: [hit(10)] };
    let s = makeBattle([P('scarlet', { max: { hp: 9999 } as never })], [E('e0')], { enemyDefs: { e0: def([dive]) } });
    const names: string[][] = [];
    for (let i = 0; i < 4; i++) { s = resolveRound(s, defend(s), constRng(0.5)); names.push(acted(s, 'e0')); }
    expect(names).toEqual([['攻擊'], ['攻擊'], ['深潛'], ['吞沒']]);
  });

  it('a skill that needs its kin waits for them', () => {
    const fire: EnemySkill = { name: '祭典之火', chance: 1, target: 'enemies', needs: { id: 'lamp-wight', n: 2 }, effects: [hit(10)] };
    const lit = (n: number) => makeBattle([P('scarlet', { max: { hp: 9999 } as never })], [E('e0'), ...Array.from({ length: n }, (_, i) => E(`e${i + 1}`, { defId: 'lamp-wight' }))],
      { enemyDefs: { e0: def([fire]), ...Object.fromEntries(Array.from({ length: n }, (_, i) => [`e${i + 1}`, def([])])) } });
    expect(acted(resolveRound(lit(1), defend(lit(1)), constRng(0.5)), 'e0')).toEqual(['攻擊']);
    expect(acted(resolveRound(lit(2), defend(lit(2)), constRng(0.5)), 'e0')).toEqual(['祭典之火']);
  });

  describe('the music box plays for two rounds', () => {
    const play: EnemySkill = { name: '搖籃曲', chance: 1, target: 'enemies', windup: '演奏', windupRounds: 2, fragile: true,
      windupAllies: [{ kind: 'restore', hpPct: 10 }], effects: [{ kind: 'inflict', status: 'sleep', chance: 1 }] };
    const box = () => makeBattle([P('scarlet', { max: { hp: 9999 } as never })], [E('e0'), E('e1', { hp: 50 })], { enemyDefs: { e0: def([play]), e1: def([]) } });

    it('two turns of playing mend its kin, then the row sleeps', () => {
      let s = box();
      s = resolveRound(s, defend(s), constRng(0.5));
      expect(acted(s, 'e0')).toEqual(['演奏']);
      expect(s.enemies[1].hp).toBe(60);
      expect(intentLabel(s, 'e0')).toBe(T.battle.foe.windup('搖籃曲'));
      s = resolveRound(s, defend(s), constRng(0.5));
      expect(acted(s, 'e0')).toEqual(['演奏']);
      expect(s.enemies[1].hp).toBe(70);
      s = resolveRound(s, defend(s), constRng(0.5));
      expect(acted(s, 'e0')).toEqual(['搖籃曲']);
      expect(s.log).toContainEqual({ type: 'status', target: 'scarlet', status: 'sleep' });
      expect(s.enemies[0].windLeft).toBeUndefined();
    });

    it('a landed hit breaks the song', () => {
      let s = box();
      s = resolveRound(s, defend(s), constRng(0.5));
      s = resolveRound(s, { scarlet: { kind: 'attack', target: 'e0' } }, constRng(0.5));
      expect(s.enemies[0].winding).toBeUndefined();
      expect(s.log).toContainEqual({ type: 'foe', actor: 'e0', cue: 'break' });
      s = resolveRound(s, defend(s), constRng(0.5));
      expect(acted(s, 'e0')).toEqual(['演奏']);   // it starts over
    });
  });

  it('each blow makes the gilded hoarder harder to hit', () => {
    const s = makeBattle([P('scarlet', { max: { atk: 1 } as never })], [E('e0', { dodgeUp: 10, max: { hp: 9999 } as never })]);
    const r = resolveRound(s, { scarlet: { kind: 'attack', target: 'e0' } }, constRng(0.5));
    expect(r.enemies[0].x.evasion).toBe(10);
    const r2 = resolveRound(r, { scarlet: { kind: 'attack', target: 'e0' } }, constRng(0.5));
    expect(r2.enemies[0].x.evasion).toBe(20);
    expect(ENEMIES['gilded-hoarder'].dodgeUp).toBeGreaterThan(0);
  });

  it('the fallen knight steels itself as an ally falls', () => {
    const steel = { name: '騎士的誓言', effects: [{ kind: 'buff', stat: 'def', pct: 30, turns: 3 } as Effect] };
    const s = makeBattle([P('scarlet', { max: { atk: 999 } as never })], [E('e0', { max: { hp: 9999 } as never }), E('e1', { hp: 1 })],
      { enemyDefs: { e0: def([], { onAllyFall: steel }), e1: def([]) } });
    const r = resolveRound(s, { scarlet: { kind: 'attack', target: 'e1' } }, constRng(0.5));
    expect(acted(r, 'e0')).toContain('騎士的誓言');
    expect(r.enemies[0].buffs.some((b) => b.stat === 'def' && b.pct === 30)).toBe(true);
    // Once for each fall.
    const r2 = resolveRound(r, defend(r), constRng(0.5));
    expect(acted(r2, 'e0')).not.toContain('騎士的誓言');
    expect(ENEMIES['fallen-knight'].onAllyFall).toBeDefined();
  });

  it('the white silence slows the party a little more each time, to its floor', () => {
    const hush: Effect = { kind: 'buff', stat: 'spd', pct: -10, turns: 3, stackTo: -30 };
    const m = P('scarlet');
    const ctx = { rng: constRng(0.5), itemBoost: false, revealed: {}, log: [] as BattleEvent[] };
    for (const want of [-10, -20, -30, -30]) {
      applyEffect(E('e0'), m, hush, ctx);
      expect(m.buffs.find((b) => b.stat === 'spd')!.pct).toBe(want);
    }
  });

  it("the vault dragon's breath grows with what it stole", () => {
    const breath: EnemySkill = { name: '金幣吐息', chance: 1, target: 'enemy', effects: [{ ...hit(100), hoardPct: 100 } as Effect] };
    const blow = (stolen: number) => {
      const s = makeBattle([P('scarlet', { max: { hp: 9999 } as never })], [E('e0', { stolen })], { enemyDefs: { e0: def([breath]) } });
      s.intents = { e0: { kind: 'enemy-skill', index: 0, target: 'scarlet' } };
      return (resolveRound(s, defend(s), constRng(0.5)).log.find((e) => e.type === 'damage' && e.target === 'scarlet') as { amount: number }).amount;
    };
    expect(blow(50) / blow(0)).toBeCloseTo(1.5, 1);
    expect(blow(500)).toBe(blow(100));   // up to +100%
  });
});
