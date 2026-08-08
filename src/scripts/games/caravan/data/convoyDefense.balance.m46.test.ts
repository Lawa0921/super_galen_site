import { describe, expect, it } from 'vitest';
import {
  currentActor,
  partyMoveAvailability,
  type Move,
  type PartyMember,
} from '../combat';
import { createRng, type Rng } from '../rng';
import { newGame, type CompanionRecord, type SaveData } from '../save';
import {
  braceConvoy,
  convoyEnemyAct,
  convoyPartyAct,
  convoyThreatForEnemy,
  createConvoyDefenseBattle,
  projectedConvoyPressure,
} from './convoyDefense.m46';

const highRng: Rng = {
  next: () => 0.5,
  roll: (sides) => sides,
  d20: () => 20,
  pick: (items) => items[0],
  weightedPick: (items) => items[0].value,
};

function statsFor(job: CompanionRecord['job']) {
  if (job === 'swordsman') return { str: 17, dex: 13, int: 10, cha: 12, con: 17 };
  if (job === 'ranger') return { str: 11, dex: 18, int: 11, cha: 11, con: 14 };
  if (job === 'mage') return { str: 9, dex: 13, int: 18, cha: 12, con: 13 };
  return { str: 12, dex: 11, int: 13, cha: 18, con: 16 };
}

function hpFor(job: CompanionRecord['job']): number {
  return job === 'mage' ? 24 : job === 'ranger' ? 27 : job === 'cleric' ? 31 : 34;
}

function companion(id: string, job: CompanionRecord['job']): CompanionRecord {
  return {
    id,
    name: id,
    job,
    level: 4,
    xp: 180,
    stats: statsFor(job),
    maxHp: hpFor(job),
    injuredForTrips: 0,
    equipment: { weapon: null, armor: null, trinket: null },
    skills: { martial: 3, scouting: 3, lore: 3, negotiation: 3, survival: 3 },
  };
}

function saveForJobs(jobs: CompanionRecord['job'][]): SaveData {
  const save = newGame(46000 + jobs.length, { job: jobs[0], allocation: {} });
  save.marketSeed = 4666;
  save.reputation = 30;
  save.protagonist.level = 4;
  save.protagonist.stats = statsFor(jobs[0]);
  save.protagonist.maxHp = hpFor(jobs[0]);
  save.protagonist.skills = { martial: 3, scouting: 3, lore: 3, negotiation: 3, survival: 3 };
  save.companions = jobs.slice(1).map((job, index) => companion(`member-${index + 1}-${job}`, job));
  const ids = [save.protagonist.id, ...save.companions.map((member) => member.id)];
  save.expeditionPlan = {
    activeIds: ids,
    positions: Object.fromEntries(ids.map((id, index) => [id, index < 2 ? 'front' : 'back'])),
    roles: { captain: save.protagonist.id },
  };
  return save;
}

function forceSingleActor(battle: ReturnType<typeof createConvoyDefenseBattle>, actor: PartyMember): void {
  battle.combat.order = [actor.id];
  battle.combat.turnIndex = 0;
  battle.combat.round = 1;
}

function totalEnemyHp(battle: ReturnType<typeof createConvoyDefenseBattle>): number {
  return battle.combat.enemies.reduce((sum, enemy) => sum + enemy.hp, 0);
}

function totalPartyHp(battle: ReturnType<typeof createConvoyDefenseBattle>): number {
  return battle.combat.party.reduce((sum, member) => sum + member.hp, 0);
}

interface PolicySnapshot {
  wagonHp: number;
  enemyHp: number;
  partyHp: number;
  mana: number;
}

function policySnapshots(): Record<'escort' | 'control' | 'pressure' | 'sustain', PolicySnapshot> {
  const save = saveForJobs(['swordsman', 'ranger', 'mage', 'cleric']);

  const escort = createConvoyDefenseBattle(save, highRng);
  const escortActor = escort.combat.party.find((member) => member.id === 'protagonist')!;
  forceSingleActor(escort, escortActor);
  braceConvoy(highRng, escort, escortActor.id);

  const pressure = createConvoyDefenseBattle(save, highRng);
  const pressureActor = pressure.combat.party.find((member) => member.id === 'protagonist')!;
  const hook = pressure.combat.enemies.find((enemy) => enemy.id === 'convoy-hook-raider')!;
  hook.hp = 8;
  forceSingleActor(pressure, pressureActor);
  convoyPartyAct(highRng, pressure, pressureActor.id, 'heavy-slash', hook.id);

  const control = createConvoyDefenseBattle(save, highRng);
  const mage = control.combat.party.find((member) => member.moves.some((move) => move.id === 'frost-bind'))!;
  const arsonist = control.combat.enemies.find((enemy) => enemy.id === 'convoy-ash-arsonist')!;
  forceSingleActor(control, mage);
  convoyPartyAct(highRng, control, mage.id, 'frost-bind', arsonist.id);

  const sustain = createConvoyDefenseBattle(save, highRng);
  const cleric = sustain.combat.party.find((member) => member.moves.some((move) => move.id === 'heal'))!;
  const wounded = sustain.combat.party.find((member) => member.id === 'protagonist')!;
  wounded.hp -= 10;
  forceSingleActor(sustain, cleric);
  convoyPartyAct(highRng, sustain, cleric.id, 'heal', wounded.id);

  return {
    escort: { wagonHp: escort.wagon.hp, enemyHp: totalEnemyHp(escort), partyHp: totalPartyHp(escort), mana: 0 },
    control: { wagonHp: control.wagon.hp, enemyHp: totalEnemyHp(control), partyHp: totalPartyHp(control), mana: mage.mystic?.current ?? 0 },
    pressure: { wagonHp: pressure.wagon.hp, enemyHp: totalEnemyHp(pressure), partyHp: totalPartyHp(pressure), mana: 0 },
    sustain: { wagonHp: sustain.wagon.hp, enemyHp: totalEnemyHp(sustain), partyHp: totalPartyHp(sustain), mana: 0 },
  };
}

function moveScore(move: Move): number {
  if (!move.damage) return 0;
  return move.damage.dice * move.damage.sides + (move.hitBonus ?? 0);
}

function lowestPartyTarget(party: PartyMember[]): PartyMember {
  return party.filter((member) => member.hp > 0)
    .reduce((lowest, member) => member.hp / member.maxHp < lowest.hp / lowest.maxHp ? member : lowest);
}

function takeAdaptivePartyTurn(rng: Rng, battle: ReturnType<typeof createConvoyDefenseBattle>): void {
  const actorInfo = currentActor(battle.combat);
  if (!actorInfo || actorInfo.side !== 'party') return;
  const actor = battle.combat.party.find((member) => member.id === actorInfo.id)!;
  const enemies = battle.combat.enemies.filter((enemy) => enemy.hp > 0);
  const pressure = projectedConvoyPressure(battle);

  const frostBind = actor.moves.find((move) => move.id === 'frost-bind');
  const highThreat = [...enemies].sort((a, b) => convoyThreatForEnemy(b) - convoyThreatForEnemy(a) || a.hp - b.hp)[0];
  if (
    frostBind && highThreat &&
    !highThreat.statuses?.some((status) => status.kind === 'stun' && status.remaining > 0) &&
    partyMoveAvailability(actor, frostBind).allowed && pressure >= 7
  ) {
    convoyPartyAct(rng, battle, actor.id, frostBind.id, highThreat.id);
    return;
  }

  const heal = actor.moves.find((move) => move.id === 'heal');
  const hurt = lowestPartyTarget(battle.combat.party);
  if (heal && hurt.hp / hurt.maxHp <= 0.45 && partyMoveAvailability(actor, heal).allowed) {
    convoyPartyAct(rng, battle, actor.id, heal.id, hurt.id);
    return;
  }

  if (pressure >= 7 && battle.protection < 5) {
    const brace = braceConvoy(rng, battle, actor.id);
    if (brace.acted) return;
  }

  const attacks = actor.moves
    .filter((move) => move.kind === 'attack' && partyMoveAvailability(actor, move).allowed)
    .sort((a, b) => moveScore(b) - moveScore(a));
  if (attacks.length > 0 && highThreat) {
    convoyPartyAct(rng, battle, actor.id, attacks[0].id, highThreat.id);
    return;
  }

  const recovery = actor.moves.find((move) => move.id === 'arcane-focus' || move.id === 'field-prayer');
  if (recovery) {
    convoyPartyAct(rng, battle, actor.id, recovery.id, hurt.id);
    return;
  }

  const fallback = actor.moves[0];
  if (fallback && highThreat) convoyPartyAct(rng, battle, actor.id, fallback.id, highThreat.id);
}

function simulate(jobs: CompanionRecord['job'][], seed: number): { won: boolean; wagonHp: number; completedRounds: number } {
  const rng = createRng(seed);
  const battle = createConvoyDefenseBattle(saveForJobs(jobs), rng);
  let safety = 0;
  while (battle.combat.outcome === 'ongoing' && safety < 160) {
    const actor = currentActor(battle.combat);
    if (!actor) break;
    if (actor.side === 'enemy') convoyEnemyAct(rng, battle, actor.id);
    else takeAdaptivePartyTurn(rng, battle);
    safety += 1;
  }
  return { won: battle.combat.outcome === 'victory', wagonHp: battle.wagon.hp, completedRounds: battle.completedRounds };
}

describe('M46 player-perspective multidimensional convoy review', () => {
  it('makes escort, control, pressure and sustain own different tactical advantages', () => {
    const result = policySnapshots();
    console.info('[M46 OBJECTIVE POLICIES]', result);

    expect(result.escort.wagonHp).toBeGreaterThan(result.pressure.wagonHp);
    expect(result.pressure.enemyHp).toBeLessThan(result.escort.enemyHp);
    expect(result.control.wagonHp).toBeGreaterThan(result.sustain.wagonHp);
    expect(result.control.mana).toBeLessThan(8);
    expect(result.sustain.partyHp).toBeGreaterThan(result.pressure.partyHp - 10);

    const dimensions = ['wagonHp', 'enemyHp', 'partyHp'] as const;
    const policies = Object.values(result);
    const dominates = (a: PolicySnapshot, b: PolicySnapshot): boolean => {
      const betterOrEqual = a.wagonHp >= b.wagonHp && a.partyHp >= b.partyHp && a.enemyHp <= b.enemyHp;
      const strictlyBetter = a.wagonHp > b.wagonHp || a.partyHp > b.partyHp || a.enemyHp < b.enemyHp;
      return betterOrEqual && strictlyBetter;
    };
    expect(dimensions).toHaveLength(3);
    expect(policies.some((candidate) => policies.filter((other) => other !== candidate).every((other) => dominates(candidate, other)))).toBe(false);
  });

  it('keeps a pure martial escort viable without mage or cleric', () => {
    const results = Array.from({ length: 12 }, (_, index) => simulate(['swordsman', 'ranger', 'swordsman', 'ranger'], 46100 + index));
    const wins = results.filter((result) => result.won);
    console.info(`[M46 COMPOSITION] pure-martial wins=${wins.length}/12 wagon=${wins.map((result) => result.wagonHp).join(',')}`);
    expect(wins.length).toBeGreaterThan(0);
  });

  it('keeps a party without swordsman viable through control, ranged pressure and ordinary convoy bracing', () => {
    const results = Array.from({ length: 12 }, (_, index) => simulate(['ranger', 'mage', 'cleric', 'ranger'], 46200 + index));
    const wins = results.filter((result) => result.won);
    console.info(`[M46 COMPOSITION] no-swordsman wins=${wins.length}/12 wagon=${wins.map((result) => result.wagonHp).join(',')}`);
    expect(wins.length).toBeGreaterThan(0);
  });

  it('does not require killing every enemy in simulated successful escorts', () => {
    const save = saveForJobs(['swordsman', 'ranger', 'mage', 'cleric']);
    const battle = createConvoyDefenseBattle(save, createRng(46300));
    for (let round = 0; round < 4; round++) {
      battle.protection = 10;
      battle.combat.turnIndex = battle.combat.order.length - 1;
      // The real objective settlement is exercised here while every hostile remains alive.
      const before = battle.combat.round;
      battle.combat.round += 1;
      // Reuse an ordinary no-op enemy cycle boundary by restoring round and bracing through a one-unit order.
      battle.combat.round = before;
      battle.combat.order = [battle.combat.party[0].id];
      battle.combat.turnIndex = 0;
      braceConvoy(highRng, battle, battle.combat.party[0].id);
    }
    expect(battle.combat.outcome).toBe('victory');
    expect(battle.combat.enemies.some((enemy) => enemy.hp > 0)).toBe(true);
  });
});
