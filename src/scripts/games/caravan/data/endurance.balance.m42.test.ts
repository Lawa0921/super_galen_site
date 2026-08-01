import { describe, expect, it } from 'vitest';
import {
  currentActor,
  enemyAct,
  partyAct,
  partyMoveAvailability,
  type CombatState,
  type Move,
  type PartyMember,
} from '../combat';
import { statMod } from '../check';
import { createRng, type Rng } from '../rng';
import { createProtagonist, newGame, type CompanionRecord, type SaveData } from '../save';
import {
  applyEnduranceCamp,
  beginEnduranceBattle,
  createEnduranceRun,
  finishEnduranceBattle,
  type EnduranceCampChoice,
} from './endurance';

const COMPOSITIONS: Record<string, CompanionRecord['job'][]> = {
  balanced: ['swordsman', 'ranger', 'mage', 'cleric'],
  martial: ['swordsman', 'swordsman', 'ranger', 'cleric'],
  pureMartial: ['swordsman', 'swordsman', 'ranger', 'ranger'],
  arcane: ['swordsman', 'mage', 'mage', 'cleric'],
  noCleric: ['swordsman', 'swordsman', 'ranger', 'mage'],
};

function record(job: CompanionRecord['job'], id: string): CompanionRecord {
  const member = createProtagonist({ job });
  member.id = id;
  member.name = `${job}-${id}`;
  member.level = 5;
  member.xp = 9999;
  member.injuredForTrips = 0;
  member.stats = job === 'swordsman'
    ? { str: 20, dex: 13, int: 9, cha: 11, con: 19 }
    : job === 'ranger'
      ? { str: 12, dex: 21, int: 12, cha: 11, con: 15 }
      : job === 'mage'
        ? { str: 8, dex: 13, int: 22, cha: 12, con: 13 }
        : { str: 12, dex: 10, int: 15, cha: 22, con: 17 };
  member.maxHp = job === 'swordsman' ? 39 : job === 'cleric' ? 34 : job === 'ranger' ? 31 : 28;
  member.skills = { martial: 4, scouting: 4, lore: 4, negotiation: 4, survival: 4 };
  return member;
}

function makeSave(jobs: CompanionRecord['job'][], seed: number): SaveData {
  const data = newGame(seed, { job: jobs[0] });
  const members = jobs.map((job, index) => record(job, index === 0 ? 'protagonist' : `member-${index}`));
  data.protagonist = members[0];
  data.companions = members.slice(1);
  data.reputation = 50;
  data.flags['world-quest:ashen-reliquary:completed'] = true;
  data.inventory = { ...data.inventory, 'dried-rations': 6, herb: 6, bandage: 6 };
  data.expeditionPlan = {
    activeIds: members.map((member) => member.id),
    positions: Object.fromEntries(members.map((member) => [
      member.id,
      member.job === 'swordsman' || member.job === 'cleric' ? 'front' : 'back',
    ])),
    roles: { captain: members[0].id },
  };
  return data;
}

function expectedDamage(actor: PartyMember, move: Move, targetCount: number): number {
  if (!move.damage) return 0;
  const averageDice = move.damage.dice * (move.damage.sides + 1) / 2;
  const bonus = move.damage.bonusStat ? statMod(actor.stats[move.damage.bonusStat]) : 0;
  return (averageDice + bonus + (actor.damageBonus ?? 0)) * (move.area ? Math.max(1, targetCount) : 1);
}

function chooseTarget(state: CombatState, move: Move): string {
  if (move.target === 'self' || move.kind === 'guard') return currentActor(state)!.id;
  if (move.kind === 'support') {
    const alive = state.party.filter((member) => member.hp > 0);
    return alive.reduce((lowest, member) => member.hp / member.maxHp < lowest.hp / lowest.maxHp ? member : lowest, alive[0]).id;
  }
  const alive = state.enemies.filter((enemy) => enemy.hp > 0);
  if (move.area) return alive[0].id;
  const element = move.element;
  const weak = element ? alive.filter((enemy) => enemy.weaknesses?.includes(element)) : [];
  const pool = weak.length > 0 ? weak : alive;
  return pool.reduce((lowest, enemy) => enemy.hp < lowest.hp ? enemy : lowest, pool[0]).id;
}

function chooseMove(state: CombatState, actor: PartyMember): Move {
  const aliveParty = state.party.filter((member) => member.hp > 0);
  const hurt = aliveParty.reduce((lowest, member) => member.hp / member.maxHp < lowest.hp / lowest.maxHp ? member : lowest, aliveParty[0]);
  const available = actor.moves.filter((move) => partyMoveAvailability(actor, move).allowed);

  if (actor.mystic?.kind === 'favor') {
    const healing = available
      .filter((move) => move.heal && hurt.hp / hurt.maxHp < 0.55)
      .sort((a, b) => (b.heal?.dice ?? 0) - (a.heal?.dice ?? 0));
    if (healing[0]) return healing[0];
    const holyStrike = available.find((move) => move.id === 'holy-strike');
    if (holyStrike && actor.mystic.current <= 1) return holyStrike;
    const prayer = available.find((move) => move.id === 'field-prayer');
    if (prayer && actor.mystic.current === 0) return prayer;
  }

  if (actor.mystic?.kind === 'mana') {
    const focus = available.find((move) => move.id === 'arcane-focus');
    if (focus && actor.mystic.current <= 1) return focus;
  }

  const attacks = available.filter((move) => move.kind === 'attack');
  if (attacks.length > 0) {
    const aliveEnemies = state.enemies.filter((enemy) => enemy.hp > 0);
    return [...attacks].sort((a, b) => {
      const aWeak = a.element && aliveEnemies.some((enemy) => enemy.weaknesses?.includes(a.element!)) ? 8 : 0;
      const bWeak = b.element && aliveEnemies.some((enemy) => enemy.weaknesses?.includes(b.element!)) ? 8 : 0;
      return (expectedDamage(actor, b, aliveEnemies.length) + bWeak)
        - (expectedDamage(actor, a, aliveEnemies.length) + aWeak);
    })[0];
  }
  return available[0] ?? actor.moves[0];
}

function playBattle(state: CombatState, rng: Rng): void {
  let actions = 0;
  while (state.outcome === 'ongoing' && actions < 260) {
    const actorInfo = currentActor(state);
    if (!actorInfo) break;
    if (actorInfo.side === 'enemy') {
      enemyAct(rng, state, actorInfo.id);
    } else {
      const actor = state.party.find((member) => member.id === actorInfo.id)!;
      const move = chooseMove(state, actor);
      const target = chooseTarget(state, move);
      partyAct(rng, state, actor.id, move.id, target);
    }
    actions += 1;
  }
  if (actions >= 260 && state.outcome === 'ongoing') state.outcome = 'defeat';
}

function chooseCamp(data: SaveData, run: ReturnType<typeof createEnduranceRun>): EnduranceCampChoice {
  const living = Object.values(run.members).filter((member) => member.hp > 0);
  const averageHp = living.reduce((sum, member) => sum + member.hp / member.maxHp, 0) / Math.max(1, living.length);
  const mana = living.filter((member) => member.mystic?.kind === 'mana');
  const favor = living.filter((member) => member.mystic?.kind === 'favor');
  const manaRatio = mana.length
    ? mana.reduce((sum, member) => sum + member.mystic!.current / member.mystic!.max, 0) / mana.length
    : 1;
  const favorRatio = favor.length
    ? favor.reduce((sum, member) => sum + member.mystic!.current / member.mystic!.max, 0) / favor.length
    : 1;
  if (averageHp < 0.62 && (data.inventory['dried-rations'] ?? 0) > 0) return 'ration-rest';
  if (mana.length && manaRatio < 0.28 && (data.inventory.herb ?? 0) > 0) return 'arcane-vigil';
  if (favor.length && (averageHp < 0.82 || favorRatio < 0.25) && (data.inventory.herb ?? 0) > 0) return 'sacred-vigil';
  return 'forced-march';
}

interface SimulationResult {
  victory: boolean;
  stage: number;
  camps: EnduranceCampChoice[];
}

function simulate(jobs: CompanionRecord['job'][], seed: number): SimulationResult {
  const data = makeSave(jobs, seed);
  const run = createEnduranceRun(data);
  while (run.phase === 'battle' || run.phase === 'camp') {
    if (run.phase === 'camp') {
      applyEnduranceCamp(run, data, chooseCamp(data, run));
      continue;
    }
    const rng = createRng(seed * 1009 + run.stage * 7919);
    try {
      const battle = beginEnduranceBattle(run, data, rng);
      playBattle(battle, rng);
      finishEnduranceBattle(run, battle);
    } catch {
      run.phase = 'defeat';
    }
  }
  return { victory: run.phase === 'victory', stage: run.stage, camps: [...run.camps] };
}

interface CompositionReport {
  name: string;
  wins: number;
  finalReach: number;
  total: number;
  camps: Set<EnduranceCampChoice>;
}

function compositionReport(name: string, jobs: CompanionRecord['job'][], startSeed: number, total = 20): CompositionReport {
  const results = Array.from({ length: total }, (_, index) => simulate(jobs, startSeed + index));
  const wins = results.filter((result) => result.victory).length;
  const finalReach = results.filter((result) => result.stage === 3).length;
  const camps = new Set(results.flatMap((result) => result.camps));
  console.info(`[M42 BALANCE] ${name}: wins=${wins}/${total}, final=${finalReach}/${total}, camps=${[...camps].join(',') || 'none'}`);
  return { name, wins, finalReach, total, camps };
}

function expectViableButNotGuaranteed(report: CompositionReport): void {
  expect(report.finalReach, `${report.name} should reach stage 3 in at least one deterministic run`).toBeGreaterThan(0);
  expect(report.wins, `${report.name} should have at least one winning deterministic run`).toBeGreaterThan(0);
  expect(report.wins, `${report.name} should still face a meaningful chance of failure`).toBeLessThan(report.total);
}

describe('M42 automated player-perspective balance probes', () => {
  const reports = new Map<string, CompositionReport>();
  const report = (name: string, seed: number): CompositionReport => {
    const existing = reports.get(name);
    if (existing) return existing;
    const created = compositionReport(name, COMPOSITIONS[name], seed);
    reports.set(name, created);
    return created;
  };

  it('balanced party has viable but non-guaranteed outcomes', () => {
    expectViableButNotGuaranteed(report('balanced', 9100));
  });

  it('martial party with cleric has viable but non-guaranteed outcomes', () => {
    expectViableButNotGuaranteed(report('martial', 9120));
  });

  it('pure martial party has viable but non-guaranteed outcomes', () => {
    expectViableButNotGuaranteed(report('pureMartial', 9140));
  });

  it('double-mage party has viable but non-guaranteed outcomes', () => {
    expectViableButNotGuaranteed(report('arcane', 9160));
  });

  it('party without cleric has viable but non-guaranteed outcomes', () => {
    expectViableButNotGuaranteed(report('noCleric', 9180));
  });

  it('composition win rates remain within a broad non-mandatory-class band', () => {
    const all = [
      report('balanced', 9100),
      report('martial', 9120),
      report('pureMartial', 9140),
      report('arcane', 9160),
      report('noCleric', 9180),
    ];
    const wins = all.map((entry) => entry.wins);
    console.info(`[M42 BALANCE] spread=${Math.max(...wins) - Math.min(...wins)}; counts=${wins.join(',')}`);
    expect(Math.max(...wins) - Math.min(...wins)).toBeLessThanOrEqual(15);
  });

  it('camp policy uses at least three recovery paths instead of one universal answer', () => {
    const choices = new Set<EnduranceCampChoice>();
    for (const jobs of Object.values(COMPOSITIONS)) {
      for (let seed = 9200; seed < 9216; seed += 1) {
        for (const choice of simulate(jobs, seed).camps) choices.add(choice);
      }
    }
    console.info(`[M42 BALANCE] camp choices=${[...choices].join(',')}`);
    expect(choices.has('ration-rest')).toBe(true);
    expect(choices.has('forced-march')).toBe(true);
    expect(choices.has('arcane-vigil') || choices.has('sacred-vigil')).toBe(true);
    expect(choices.size).toBeGreaterThanOrEqual(3);
  });
});
