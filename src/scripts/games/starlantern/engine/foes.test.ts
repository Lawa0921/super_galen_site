import { describe, expect, it } from 'vitest';
import { ROW_MAX, createBattle, intentLabel, planEnemies, resolveRound, rewards, turnOrder, type Action, type BattleState } from './battle';
import { guardTargets } from './foes';
import { constRng, fullParty, makeBattle, makeCombatant, withRosterLive } from './testing';
import { LEGACY_LINEUP } from './party';
import { mulberry32, type Rng } from './rng';
import { applyEffect } from './skills';
import { T } from '../data/text.zh-TW';
import { ENEMIES } from '../data/enemies';
import type { Effect, EnemyDef, EnemySkill } from './types';
import type { Combatant } from './combatant';

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
    let s = withRosterLive(['lantern-brood', 'lantern-larva'], () => {
      let b = makeBattle([P('scarlet', { max: { hp: 9999 } as never })], [E('e0', { defId: 'lantern-brood', max: { hp: 9999 } as never })], { meet: { k: 1, cap: 3 } });
      const acts: string[][] = [];
      for (let i = 0; i < 6; i++) {
        b = resolveRound(b, defend(b), mulberry32(i + 1));
        acts.push(acted(b, 'e0'));
      }
      expect(acts.slice(0, 2)).toEqual([['孵化'], ['孵化']]);
      expect(acts.slice(2).every((a) => a.length === 1 && a[0] === '蜷縮')).toBe(true);
      expect(acts.flat()).not.toContain('攻擊');
      return b;
    });
    expect(s.enemies.filter((e) => e.summoned)).toHaveLength(2);
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
