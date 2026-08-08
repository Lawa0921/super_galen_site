import { describe, expect, it } from 'vitest';
import type { Rng } from '../rng';
import { createRng } from '../rng';
import { newGame, type CompanionRecord, type SaveData } from '../save';
import { createReliquaryEncounter } from './ashenReliquaryCombat';
import {
  aftermathPreview,
  applyMoraleFromBattlefield,
  claimMoraleConvoyReward,
  commandAvailability,
  commandMorale,
  createMoraleConvoyDefenseBattle,
  moraleAftermathReceipt,
  moraleProfileForEnemy,
} from './convoyMorale.m47';
import { convoyRewardReceipt } from './convoyDefense.m46';

function fixedRng(d20 = 20, rollValue = 4): Rng {
  return {
    next: () => 0.5,
    roll: (sides) => Math.max(1, Math.min(sides, rollValue)),
    d20: () => d20,
    pick: (arr) => arr[0],
    weightedPick: (items) => items[0].value,
  };
}

function companion(id: string, job: CompanionRecord['job'], stats = { str: 14, dex: 14, int: 14, cha: 14, con: 14 }): CompanionRecord {
  return {
    id, name: id, job, level: 4, xp: 200, stats, maxHp: 28, injuredForTrips: 0,
    equipment: { weapon: null, armor: null, trinket: null },
    skills: { martial: 3, scouting: 3, lore: 3, negotiation: 3, survival: 3 },
  };
}

function preparedSave(): SaveData {
  const save = newGame(4700, { job: 'swordsman', trait: 'hardy', allocation: { con: 2, str: 1 } });
  save.marketSeed = 4712;
  save.reputation = 20;
  save.gold = 100;
  save.inventory = { ...save.inventory, 'dried-rations': 3 };
  save.protagonist.level = 4;
  save.protagonist.stats = { str: 16, dex: 12, int: 10, cha: 12, con: 16 };
  save.companions = [
    companion('ranger', 'ranger', { str: 10, dex: 18, int: 10, cha: 10, con: 11 }),
    companion('mage', 'mage', { str: 8, dex: 12, int: 18, cha: 10, con: 10 }),
    companion('cleric', 'cleric', { str: 10, dex: 9, int: 12, cha: 18, con: 13 }),
  ];
  save.expeditionPlan = {
    activeIds: ['protagonist', 'ranger', 'mage', 'cleric'],
    positions: { protagonist: 'front', ranger: 'back', mage: 'back', cleric: 'front' },
    roles: { captain: 'protagonist', scout: 'ranger' },
  };
  return save;
}

function putActorFirst(battle: ReturnType<typeof createMoraleConvoyDefenseBattle>, actorId: string): void {
  const rest = battle.combat.order.filter((id) => id !== actorId);
  battle.combat.order = [actorId, ...rest];
  battle.combat.turnIndex = 0;
}

describe('M47 morale, rout and surrender', () => {
  it('keeps turn-one charisma from skipping an untouched battle', () => {
    const battle = createMoraleConvoyDefenseBattle(preparedSave(), createRng(4701));
    const actor = battle.combat.party.find((member) => member.id === 'cleric')!;
    const target = battle.combat.enemies.find((enemy) => enemy.id === 'convoy-hook-raider')!;
    putActorFirst(battle, actor.id);

    const availability = commandAvailability(battle, actor, target);
    expect(availability.allowed).toBe(false);
    expect(availability.reason).toContain('先造成傷亡');
    const result = commandMorale(fixedRng(20), battle, actor.id, target.id);
    expect(result.acted).toBe(false);
    expect(target.hp).toBe(target.maxHp);
    expect(battle.morale[target.id].current).toBe(battle.morale[target.id].max);
  });

  it('makes leader loss a larger morale shock than an ordinary casualty', () => {
    const ordinary = createMoraleConvoyDefenseBattle(preparedSave(), createRng(4702));
    const ordinaryBefore = Object.fromEntries(ordinary.combat.enemies.map((enemy) => [enemy.id, {
      hp: enemy.hp, poise: enemy.poise, stunned: false,
    }]));
    ordinary.combat.enemies.find((enemy) => enemy.id === 'convoy-hook-raider')!.hp = 0;
    applyMoraleFromBattlefield(ordinary, ordinaryBefore);
    const afterOrdinary = ordinary.morale['convoy-ash-arsonist'].current;

    const leader = createMoraleConvoyDefenseBattle(preparedSave(), createRng(4703));
    const leaderBefore = Object.fromEntries(leader.combat.enemies.map((enemy) => [enemy.id, {
      hp: enemy.hp, poise: enemy.poise, stunned: false,
    }]));
    leader.combat.enemies.find((enemy) => enemy.id === 'convoy-reaver-captain')!.hp = 0;
    applyMoraleFromBattlefield(leader, leaderBefore);
    const afterLeader = leader.morale['convoy-ash-arsonist'].current;

    expect(afterOrdinary).toBe(3);
    expect(afterLeader).toBe(1);
    expect(afterLeader).toBeLessThan(afterOrdinary);
  });

  it('makes failed commands spend a real action and escalate defiance instead of inviting spam', () => {
    const battle = createMoraleConvoyDefenseBattle(preparedSave(), createRng(4704));
    const actor = battle.combat.party.find((member) => member.id === 'cleric')!;
    const target = battle.combat.enemies.find((enemy) => enemy.id === 'convoy-hook-raider')!;
    battle.morale[target.id].current = 4;
    putActorFirst(battle, actor.id);
    const firstDc = commandAvailability(battle, actor, target).dc;

    const result = commandMorale(fixedRng(1), battle, actor.id, target.id);
    expect(result.acted).toBe(true);
    expect(result.success).toBe(false);
    expect(battle.morale[target.id].defiance).toBe(1);
    expect(battle.combat.turnIndex).not.toBe(0);

    putActorFirst(battle, actor.id);
    expect(commandAvailability(battle, actor, target).dc).toBe(firstDc + 2);
  });

  it('lets stun consume the attempted command turn without rolling or damaging morale', () => {
    const battle = createMoraleConvoyDefenseBattle(preparedSave(), createRng(4705));
    const actor = battle.combat.party.find((member) => member.id === 'cleric')!;
    const target = battle.combat.enemies.find((enemy) => enemy.id === 'convoy-hook-raider')!;
    battle.morale[target.id].current = 4;
    actor.statuses = [{ kind: 'stun', remaining: 1, potency: 0 }];
    putActorFirst(battle, actor.id);
    const before = battle.morale[target.id].current;

    const result = commandMorale(fixedRng(20), battle, actor.id, target.id);
    expect(result.acted).toBe(true);
    expect(result.success).toBe(false);
    expect(result.roll).toBe(0);
    expect(battle.morale[target.id].current).toBe(before);
    expect(actor.statuses?.some((status) => status.kind === 'stun')).toBe(false);
  });

  it('can end an intelligent-human fight through rout while the surrendered foes still had HP', () => {
    const battle = createMoraleConvoyDefenseBattle(preparedSave(), createRng(4706));
    const actor = battle.combat.party.find((member) => member.id === 'cleric')!;
    const remainingHp = new Map(battle.combat.enemies.map((enemy) => [enemy.id, enemy.hp]));

    for (const enemy of battle.combat.enemies) {
      battle.morale[enemy.id].current = 1;
      putActorFirst(battle, actor.id);
      const result = commandMorale(fixedRng(20), battle, actor.id, enemy.id);
      expect(result.success).toBe(true);
      expect(result.routed).toBe(true);
      expect(remainingHp.get(enemy.id)).toBeGreaterThan(0);
    }

    expect(battle.routedEnemies.size).toBe(3);
    expect(battle.combat.outcome).toBe('victory');
    expect(battle.combat.log.some((entry) => entry.text.includes('棄械'))).toBe(true);
  });

  it('keeps live Reliquary undead and the Dragon Ember Avatar unyielding', () => {
    const cantor = createReliquaryEncounter(2).find((enemy) => enemy.id === 'reliquary-tongueless-cantor')!;
    const avatar = createReliquaryEncounter(3).find((enemy) => enemy.id === 'reliquary-ember-avatar')!;
    expect(cantor.name).toBe('無舌領唱者');
    expect(moraleProfileForEnemy(cantor)).toBeNull();
    expect(moraleProfileForEnemy(avatar)).toBeNull();
  });

  it('gives post-rout choices different gold, reputation and supply costs', () => {
    const save = preparedSave();
    const battle = createMoraleConvoyDefenseBattle(save, createRng(4707));
    battle.routedEnemies.add('convoy-hook-raider');
    battle.routedEnemies.add('convoy-ash-arsonist');

    const release = aftermathPreview(save, battle, 'release');
    const disarm = aftermathPreview(save, battle, 'disarm');
    const ransom = aftermathPreview(save, battle, 'ransom');
    expect(release).toMatchObject({ gold: 0, reputation: 1, rations: 0 });
    expect(disarm).toMatchObject({ gold: 6, reputation: 0, rations: 0 });
    expect(ransom).toMatchObject({ gold: 16, reputation: 0, rations: -1 });
    expect(ransom.gold).toBeGreaterThan(disarm.gold);
    expect(release.reputation).toBeGreaterThan(disarm.reputation);
  });

  it('settles base reward plus chosen aftermath once and never creates negative ration', () => {
    const save = preparedSave();
    const battle = createMoraleConvoyDefenseBattle(save, createRng(4708));
    const target = battle.combat.enemies.find((enemy) => enemy.id === 'convoy-hook-raider')!;
    target.hp = 0;
    battle.morale[target.id].routed = true;
    battle.morale[target.id].current = 0;
    battle.routedEnemies.add(target.id);
    battle.combat.outcome = 'victory';
    battle.wagon.hp = 25;
    const goldBefore = save.gold;
    const repBefore = save.reputation;
    const rationBefore = save.inventory['dried-rations'];

    const reward = claimMoraleConvoyReward(save, battle, 'ransom');
    expect(reward.base.gold).toBe(52);
    expect(reward.aftermath.gold).toBe(8);
    expect(save.gold).toBe(goldBefore + 60);
    expect(save.reputation).toBe(repBefore + 2);
    expect(save.inventory['dried-rations']).toBe(rationBefore - 1);
    expect(save.flags[convoyRewardReceipt(save.marketSeed)]).toBe(true);
    expect(save.flags[moraleAftermathReceipt(save.marketSeed)]).toBe(true);
    expect(() => claimMoraleConvoyReward(save, battle, 'release')).toThrow();
  });

  it('rejects ransom without supplies before mutating any reward state', () => {
    const save = preparedSave();
    delete save.inventory['dried-rations'];
    const battle = createMoraleConvoyDefenseBattle(save, createRng(4709));
    const target = battle.combat.enemies.find((enemy) => enemy.id === 'convoy-hook-raider')!;
    target.hp = 0;
    battle.morale[target.id].routed = true;
    battle.routedEnemies.add(target.id);
    battle.combat.outcome = 'victory';
    const before = { gold: save.gold, reputation: save.reputation, flags: { ...save.flags } };

    expect(() => claimMoraleConvoyReward(save, battle, 'ransom')).toThrow('乾糧 1');
    expect(save.gold).toBe(before.gold);
    expect(save.reputation).toBe(before.reputation);
    expect(save.flags).toEqual(before.flags);
  });
});
