import { describe, expect, it } from 'vitest';
import { createRng } from '../rng';
import { newGame, type CompanionRecord, type SaveData } from '../save';
import {
  CONVOY_DEFENSE_HOLD_ROUNDS,
  CONVOY_WAGON_MAX_HP,
  beginConvoyAttempt,
  braceConvoy,
  buildConvoyParty,
  claimConvoyDefenseReward,
  convoyAbandonmentCount,
  convoyAdvanceTurnForTest,
  convoyDefenseAccess,
  convoyRewardReceipt,
  createConvoyDefenseBattle,
  createConvoyDefenseEncounter,
  projectedConvoyPressure,
} from './convoyDefense.m46';

function companion(id: string, job: CompanionRecord['job'], injuredForTrips = 0): CompanionRecord {
  return {
    id,
    name: id,
    job,
    level: 4,
    xp: 200,
    stats: { str: 15, dex: 15, int: 15, cha: 15, con: 15 },
    maxHp: 27,
    injuredForTrips,
    equipment: { weapon: null, armor: null, trinket: null },
    skills: { martial: 3, scouting: 3, lore: 3, negotiation: 3, survival: 3 },
  };
}

function preparedSave(): SaveData {
  const save = newGame(4600, { job: 'swordsman', trait: 'hardy', allocation: { con: 2, str: 1 } });
  save.marketSeed = 4612;
  save.reputation = 20;
  save.gold = 100;
  save.inventory = { ...save.inventory, 'dried-rations': 3 };
  save.protagonist.level = 4;
  save.protagonist.stats = { str: 16, dex: 12, int: 10, cha: 12, con: 16 };
  save.companions = [
    companion('ranger', 'ranger'),
    companion('mage', 'mage'),
    companion('cleric', 'cleric'),
    companion('wounded', 'swordsman', 2),
  ];
  save.expeditionPlan = {
    activeIds: ['protagonist', 'ranger', 'mage', 'wounded'],
    positions: { protagonist: 'front', ranger: 'back', mage: 'back' },
    roles: { captain: 'protagonist', scout: 'ranger' },
  };
  return save;
}

function finishRound(battle: ReturnType<typeof createConvoyDefenseBattle>): void {
  battle.combat.turnIndex = battle.combat.order.length - 1;
  convoyAdvanceTurnForTest(battle);
}

describe('M46 convoy objective combat', () => {
  it('uses the current healthy expedition party and exposes a midgame guild-contract gate', () => {
    const save = preparedSave();
    const party = buildConvoyParty(save);
    expect(party.map((member) => member.id)).toEqual(['protagonist', 'ranger', 'mage', 'cleric']);
    expect(party).toHaveLength(4);
    expect(party.some((member) => member.id === 'wounded')).toBe(false);
    expect(convoyDefenseAccess(save).allowed).toBe(true);

    save.reputation = 11;
    expect(convoyDefenseAccess(save).allowed).toBe(false);
    save.reputation = 20;
    save.protagonist.injuredForTrips = 1;
    expect(convoyDefenseAccess(save).allowed).toBe(false);
  });

  it('creates fresh fantasy raiders with distinct weaknesses and a dangerous combined convoy pressure', () => {
    const first = createConvoyDefenseEncounter();
    const second = createConvoyDefenseEncounter();
    first[0].hp = 0;
    expect(second[0].hp).toBe(second[0].maxHp);
    expect(second.map((enemy) => enemy.name)).toEqual(expect.arrayContaining(['斷旗劫騎・領頭者', '鉤索掠手', '灰火縱咒師']));

    const battle = createConvoyDefenseBattle(preparedSave(), createRng(46));
    expect(projectedConvoyPressure(battle)).toBe(10);
    const arsonist = battle.combat.enemies.find((enemy) => enemy.id === 'convoy-ash-arsonist')!;
    expect(arsonist.mystic?.kind).toBe('mana');
    expect(arsonist.weaknesses).toEqual(expect.arrayContaining(['frost', 'pierce']));
  });

  it('turns convoy protection into a real action cost, respects turn ownership, and caps stacked protection', () => {
    const battle = createConvoyDefenseBattle(preparedSave(), createRng(47));
    const [front, second, third] = battle.combat.party;
    battle.combat.order = [front.id, second.id, third.id];
    battle.combat.turnIndex = 0;

    const firstBrace = braceConvoy(createRng(470), battle, front.id);
    expect(firstBrace.acted).toBe(true);
    expect(firstBrace.addedProtection).toBeGreaterThanOrEqual(5);
    expect(battle.protection).toBe(firstBrace.addedProtection);

    const illegalRepeat = braceConvoy(createRng(471), battle, front.id);
    expect(illegalRepeat.acted).toBe(false);

    const secondBrace = braceConvoy(createRng(472), battle, second.id);
    expect(secondBrace.acted).toBe(true);
    expect(battle.protection).toBeLessThanOrEqual(10);
    expect(battle.protection).toBeGreaterThan(firstBrace.addedProtection);
  });

  it('makes kill pressure, control and guarding all reduce the end-of-round threat in different ways', () => {
    const battle = createConvoyDefenseBattle(preparedSave(), createRng(48));
    expect(projectedConvoyPressure(battle)).toBe(10);

    const arsonist = battle.combat.enemies.find((enemy) => enemy.id === 'convoy-ash-arsonist')!;
    arsonist.statuses = [{ kind: 'stun', remaining: 1, potency: 0 }];
    expect(projectedConvoyPressure(battle)).toBe(6);
    arsonist.statuses = [];

    const hook = battle.combat.enemies.find((enemy) => enemy.id === 'convoy-hook-raider')!;
    hook.hp = 0;
    expect(projectedConvoyPressure(battle)).toBe(7);

    battle.protection = 5;
    finishRound(battle);
    expect(battle.lastPressure).toEqual({ raw: 7, blocked: 5, damage: 2 });
    expect(battle.wagon.hp).toBe(CONVOY_WAGON_MAX_HP - 2);
    expect(battle.protection).toBe(0);
  });

  it('wins by holding four rounds even with enemies alive, so annihilation is no longer the only victory condition', () => {
    const battle = createConvoyDefenseBattle(preparedSave(), createRng(49));
    for (let round = 1; round <= CONVOY_DEFENSE_HOLD_ROUNDS; round++) {
      battle.protection = 10;
      finishRound(battle);
    }
    expect(battle.completedRounds).toBe(CONVOY_DEFENSE_HOLD_ROUNDS);
    expect(battle.wagon.hp).toBe(CONVOY_WAGON_MAX_HP);
    expect(battle.combat.enemies.some((enemy) => enemy.hp > 0)).toBe(true);
    expect(battle.combat.outcome).toBe('victory');
  });

  it('fails the contract when the wagon breaks even while the party is still standing', () => {
    const battle = createConvoyDefenseBattle(preparedSave(), createRng(50), 19);
    finishRound(battle);
    finishRound(battle);
    expect(battle.wagon.hp).toBe(0);
    expect(battle.combat.party.some((member) => member.hp > 0)).toBe(true);
    expect(battle.combat.outcome).toBe('defeat');
  });

  it('turns refresh abandonment into escalating wagon damage plus a supply/economy penalty', () => {
    const save = preparedSave();
    const first = beginConvoyAttempt(save);
    expect(first.abandonmentCount).toBe(0);
    expect(first.startingWagonHp).toBe(CONVOY_WAGON_MAX_HP);
    expect(save.inventory['dried-rations']).toBe(3);

    const second = beginConvoyAttempt(save);
    expect(second.abandonmentCount).toBe(1);
    expect(second.startingWagonHp).toBe(CONVOY_WAGON_MAX_HP - 4);
    expect(save.inventory['dried-rations']).toBe(2);
    expect(second.penalty).toContain('中途放棄');

    beginConvoyAttempt(save);
    expect(convoyAbandonmentCount(save)).toBe(2);
    expect(save.inventory['dried-rations']).toBe(1);
  });

  it('rewards wagon condition, grants only once per market cycle, and blocks repeated farming', () => {
    const save = preparedSave();
    const pristine = claimConvoyDefenseReward(save, 25);
    expect(pristine.pristineBonus).toBe(true);
    expect(pristine.gold).toBe(52);
    expect(pristine.reputation).toBe(2);
    expect(save.flags[convoyRewardReceipt(save.marketSeed)]).toBe(true);
    expect(convoyDefenseAccess(save).allowed).toBe(false);
    expect(() => claimConvoyDefenseReward(save, 30)).toThrow();

    save.marketSeed += 1;
    expect(convoyDefenseAccess(save).allowed).toBe(true);
  });
});
