import { describe, expect, it } from 'vitest';
import type { Rng } from '../rng';
import { createRng } from '../rng';
import { newGame, type CompanionRecord, type SaveData } from '../save';
import { braceConvoy, projectedConvoyPressure } from './convoyDefense.m46';
import {
  aftermathPreview,
  commandMorale,
  createMoraleConvoyDefenseBattle,
  moraleConvoyPartyAct,
} from './convoyMorale.m47';

function fixedRng(d20 = 20, rollValue = 4): Rng {
  return {
    next: () => 0.5,
    roll: (sides) => Math.max(1, Math.min(sides, rollValue)),
    d20: () => d20,
    pick: (arr) => arr[0],
    weightedPick: (items) => items[0].value,
  };
}

function companion(id: string, job: CompanionRecord['job'], stats: CompanionRecord['stats']): CompanionRecord {
  return {
    id, name: id, job, level: 4, xp: 200, stats, maxHp: 28, injuredForTrips: 0,
    equipment: { weapon: null, armor: null, trinket: null },
    skills: { martial: 3, scouting: 3, lore: 3, negotiation: 3, survival: 3 },
  };
}

function save(): SaveData {
  const data = newGame(4747, { job: 'swordsman', trait: 'hardy', allocation: { con: 2, str: 1 } });
  data.marketSeed = 4799;
  data.reputation = 20;
  data.inventory = { ...data.inventory, 'dried-rations': 3 };
  data.protagonist.level = 4;
  data.protagonist.stats = { str: 16, dex: 12, int: 10, cha: 12, con: 16 };
  data.companions = [
    companion('ranger', 'ranger', { str: 10, dex: 18, int: 10, cha: 10, con: 11 }),
    companion('mage', 'mage', { str: 8, dex: 12, int: 18, cha: 10, con: 10 }),
    companion('cleric', 'cleric', { str: 10, dex: 9, int: 12, cha: 18, con: 13 }),
  ];
  data.expeditionPlan = {
    activeIds: ['protagonist', 'ranger', 'mage', 'cleric'],
    positions: { protagonist: 'front', ranger: 'back', mage: 'back', cleric: 'front' },
    roles: { captain: 'protagonist', scout: 'ranger' },
  };
  return data;
}

function actorFirst(battle: ReturnType<typeof createMoraleConvoyDefenseBattle>, actorId: string): void {
  battle.combat.order = [actorId, ...battle.combat.order.filter((id) => id !== actorId)];
  battle.combat.turnIndex = 0;
}

function target(battle: ReturnType<typeof createMoraleConvoyDefenseBattle>) {
  return battle.combat.enemies.find((enemy) => enemy.id === 'convoy-hook-raider')!;
}

describe('M47 player-perspective multidimensional morale review', () => {
  it('keeps brace, control, physical pressure and morale command as materially different answers', () => {
    const braceBattle = createMoraleConvoyDefenseBattle(save(), createRng(1));
    const front = braceBattle.combat.party.find((member) => member.id === 'protagonist')!;
    actorFirst(braceBattle, front.id);
    braceConvoy(fixedRng(), braceBattle, front.id);
    const brace = {
      protection: braceBattle.protection,
      pressure: projectedConvoyPressure(braceBattle),
      targetHp: target(braceBattle).hp,
      manaSpent: 0,
      setup: 0,
      routed: 0,
    };

    const controlBattle = createMoraleConvoyDefenseBattle(save(), createRng(2));
    const mage = controlBattle.combat.party.find((member) => member.id === 'mage')!;
    actorFirst(controlBattle, mage.id);
    const manaBefore = mage.mystic?.current ?? 0;
    moraleConvoyPartyAct(fixedRng(20, 4), controlBattle, mage.id, 'frost-bind', target(controlBattle).id);
    const control = {
      protection: controlBattle.protection,
      pressure: projectedConvoyPressure(controlBattle),
      targetHp: target(controlBattle).hp,
      manaSpent: manaBefore - (mage.mystic?.current ?? 0),
      setup: 0,
      routed: controlBattle.routedEnemies.size,
    };

    const pressureBattle = createMoraleConvoyDefenseBattle(save(), createRng(3));
    const ranger = pressureBattle.combat.party.find((member) => member.id === 'ranger')!;
    actorFirst(pressureBattle, ranger.id);
    moraleConvoyPartyAct(fixedRng(20, 8), pressureBattle, ranger.id, 'quick-shot', target(pressureBattle).id);
    const pressure = {
      protection: pressureBattle.protection,
      pressure: projectedConvoyPressure(pressureBattle),
      targetHp: target(pressureBattle).hp,
      manaSpent: 0,
      setup: 0,
      routed: pressureBattle.routedEnemies.size,
    };

    const commandBattle = createMoraleConvoyDefenseBattle(save(), createRng(4));
    const cleric = commandBattle.combat.party.find((member) => member.id === 'cleric')!;
    const commandTarget = target(commandBattle);
    commandBattle.morale[commandTarget.id].current = 4; // represents prior battlefield pressure; command cannot create this state itself.
    actorFirst(commandBattle, cleric.id);
    const commandResult = commandMorale(fixedRng(20), commandBattle, cleric.id, commandTarget.id);
    const command = {
      protection: commandBattle.protection,
      pressure: projectedConvoyPressure(commandBattle),
      targetHp: commandTarget.hp,
      manaSpent: 0,
      setup: 1,
      routed: commandBattle.routedEnemies.size,
    };

    console.log('[M47 MORALE POLICIES]', { brace, control, pressure, command });
    expect(brace.protection).toBeGreaterThan(Math.max(control.protection, pressure.protection, command.protection));
    expect(control.pressure).toBeLessThan(brace.pressure);
    expect(control.manaSpent).toBeGreaterThan(0);
    expect(pressure.targetHp).toBeLessThan(brace.targetHp);
    expect(pressure.setup).toBe(0);
    expect(commandResult.success).toBe(true);
    expect(command.routed).toBe(1);
    expect(command.pressure).toBeLessThan(brace.pressure);
    expect(command.setup).toBe(1);
  });

  it('makes charisma useful but probabilistic after setup, including for a non-cleric martial captain', () => {
    let clericWins = 0;
    let martialWins = 0;
    const trials = 60;
    for (let seed = 1; seed <= trials; seed++) {
      const clericBattle = createMoraleConvoyDefenseBattle(save(), createRng(seed + 100));
      const cleric = clericBattle.combat.party.find((member) => member.id === 'cleric')!;
      const clericTarget = target(clericBattle);
      clericBattle.morale[clericTarget.id].current = 4;
      actorFirst(clericBattle, cleric.id);
      if (commandMorale(createRng(seed * 7919), clericBattle, cleric.id, clericTarget.id).success) clericWins += 1;

      const martialBattle = createMoraleConvoyDefenseBattle(save(), createRng(seed + 300));
      const martial = martialBattle.combat.party.find((member) => member.id === 'protagonist')!;
      const martialTarget = target(martialBattle);
      martialBattle.morale[martialTarget.id].current = 4;
      actorFirst(martialBattle, martial.id);
      if (commandMorale(createRng(seed * 3571), martialBattle, martial.id, martialTarget.id).success) martialWins += 1;
    }
    console.log(`[M47 COMMAND RATE] cleric=${clericWins}/${trials} martial=${martialWins}/${trials}`);
    expect(clericWins).toBeGreaterThan(martialWins);
    expect(clericWins).toBeGreaterThan(30);
    expect(clericWins).toBeLessThan(trials);
    expect(martialWins).toBeGreaterThan(15);
    expect(martialWins).toBeLessThan(trials - 5);
  });

  it('keeps release, disarm and ransom on a Pareto frontier across money, reputation and supplies', () => {
    const data = save();
    const battle = createMoraleConvoyDefenseBattle(data, createRng(88));
    battle.routedEnemies.add('convoy-hook-raider');
    battle.routedEnemies.add('convoy-ash-arsonist');
    const startingRations = data.inventory['dried-rations'] ?? 0;
    const vectors = ['release', 'disarm', 'ransom'].map((choice) => {
      const preview = aftermathPreview(data, battle, choice as 'release' | 'disarm' | 'ransom');
      return {
        choice,
        gold: preview.gold,
        reputation: preview.reputation,
        rationsRemaining: startingRations + preview.rations,
      };
    });
    const dominates = (a: (typeof vectors)[number], b: (typeof vectors)[number]) =>
      a.gold >= b.gold && a.reputation >= b.reputation && a.rationsRemaining >= b.rationsRemaining &&
      (a.gold > b.gold || a.reputation > b.reputation || a.rationsRemaining > b.rationsRemaining);
    console.log('[M47 AFTERMATH FRONTIER]', vectors);
    for (const vector of vectors) {
      expect(vectors.some((other) => other.choice !== vector.choice && dominates(other, vector))).toBe(false);
    }
  });
});
