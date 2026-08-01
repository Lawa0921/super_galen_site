import { describe, expect, it } from 'vitest';
import type { CombatState } from '../combat';
import { newGame, type CompanionRecord, type SaveData } from '../save';
import {
  applyReliquaryBattleInjuries,
  buildReliquaryParty,
  completeReliquaryBattle,
  createReliquaryEncounter,
  reliquaryBattleAccess,
  reliquaryBattleCleared,
} from './ashenReliquaryCombat';
import {
  combatGatedReliquaryState,
  resolveCombatGatedReliquary,
} from './ashenReliquaryFlow';

function companion(id: string, job: CompanionRecord['job'], injuredForTrips = 0): CompanionRecord {
  return {
    id,
    name: id,
    job,
    level: 4,
    xp: 200,
    stats: { str: 16, dex: 16, int: 16, cha: 16, con: 16 },
    maxHp: 28,
    injuredForTrips,
    equipment: { weapon: null, armor: null, trinket: null },
    skills: { martial: 3, scouting: 3, lore: 3, negotiation: 3, survival: 3 },
  };
}

function preparedSave(): SaveData {
  const save = newGame(4040, { job: 'mage', trait: 'learned', allocation: { int: 3 } });
  save.marketSeed = 4400;
  save.reputation = 40;
  save.gold = 1000;
  save.inventory = {
    ...save.inventory,
    torch: 10,
    herb: 10,
    bandage: 10,
    'dried-rations': 20,
    'tattered-map': 10,
    'spice-pouch': 10,
    'war-tonic': 10,
    ore: 10,
  };
  save.protagonist.level = 5;
  save.protagonist.stats = { str: 30, dex: 30, int: 30, cha: 30, con: 30 };
  save.protagonist.skills = { martial: 5, scouting: 5, lore: 5, negotiation: 5, survival: 5 };
  save.protagonist.growth = { potential: { str: 5, dex: 5, int: 5, cha: 5, con: 5 } } as never;
  save.companions = [
    companion('sword', 'swordsman'),
    companion('cleric', 'cleric'),
    companion('ranger', 'ranger'),
    companion('wounded', 'mage', 2),
  ];
  save.expeditionPlan = {
    activeIds: ['protagonist', 'ranger', 'wounded', 'cleric'],
    positions: { protagonist: 'back', ranger: 'back', cleric: 'front' },
    roles: { captain: 'protagonist', medic: 'cleric' },
  };
  return save;
}

describe('M40 Ashen Reliquary combat', () => {
  it('creates fresh, mechanically distinct sword-and-sorcery encounters', () => {
    const first = createReliquaryEncounter(1);
    const second = createReliquaryEncounter(1);
    first[0].hp = 0;
    expect(second[0].hp).toBe(second[0].maxHp);

    const knight = second[0];
    expect(knight.name).toContain('灰燼騎士');
    expect(knight.moves.some((move) => move.kind === 'guard')).toBe(true);
    expect(knight.weaknesses).toContain('holy');
    expect(knight.resists).toContain('fire');
    expect(knight.enrage).toBeTruthy();

    const choir = createReliquaryEncounter(2);
    expect(choir.some((enemy) => enemy.moves.some((move) => move.area))).toBe(true);
    expect(choir.some((enemy) => enemy.moves.some((move) => move.applyStatus?.kind === 'stun'))).toBe(true);

    const finale = createReliquaryEncounter(3);
    const avatar = finale.find((enemy) => enemy.id === 'reliquary-ember-avatar')!;
    expect(avatar.maxHp).toBeGreaterThan(50);
    expect(avatar.maxPoise).toBe(5);
    expect(avatar.weaknesses).toEqual(expect.arrayContaining(['frost', 'holy']));
    expect(avatar.resists).toEqual(expect.arrayContaining(['fire', 'slash']));
    expect(avatar.moves.some((move) => move.area)).toBe(true);
    expect(avatar.enrage?.threshold).toBe(0.5);
  });

  it('uses the current formation, excludes wounded companions, and caps the party at four', () => {
    const save = preparedSave();
    const party = buildReliquaryParty(save);
    expect(party.map((member) => member.id)).toEqual(['protagonist', 'ranger', 'cleric', 'sword']);
    expect(party).toHaveLength(4);
    expect(party.find((member) => member.id === 'protagonist')?.formationRow).toBe('back');
    expect(party.find((member) => member.id === 'cleric')?.formationRow).toBe('front');
    expect(party.some((member) => member.id === 'wounded')).toBe(false);
  });

  it('requires the correct battle order and rejects duplicate victory receipts', () => {
    const save = preparedSave();
    expect(reliquaryBattleAccess(save, 1).allowed).toBe(true);
    expect(reliquaryBattleAccess(save, 2).allowed).toBe(false);
    expect(() => completeReliquaryBattle(save, 2)).toThrow();
    const receipt = completeReliquaryBattle(save, 1);
    expect(receipt).toBe('ashen-reliquary:battle:1');
    expect(save.flags[receipt]).toBe(true);
    const snapshot = JSON.stringify(save);
    expect(() => completeReliquaryBattle(save, 1)).toThrow();
    expect(JSON.stringify(save)).toBe(snapshot);
  });

  it('blocks player-facing route settlement until the corresponding fight is won', () => {
    const save = preparedSave();
    const before = JSON.stringify(save);
    const gated = combatGatedReliquaryState(save);
    expect(gated.stages[0].battleCleared).toBe(false);
    expect(gated.stages[0].routes.every((route) => !route.eligible)).toBe(true);
    expect(gated.stages[0].routes[0].blockers.some((blocker) => blocker.includes('戰') || blocker.includes('獲勝'))).toBe(true);
    expect(() => resolveCombatGatedReliquary(save, 1, 'read-runes')).toThrow();
    expect(JSON.stringify(save)).toBe(before);

    completeReliquaryBattle(save, 1);
    const afterBattle = combatGatedReliquaryState(save);
    expect(afterBattle.stages[0].battleCleared).toBe(true);
    expect(afterBattle.stages[0].routes.some((route) => route.eligible)).toBe(true);
    resolveCombatGatedReliquary(save, 1, 'read-runes');
    expect(save.flags['ashen-reliquary:stage:1:read-runes']).toBe(true);
    expect(reliquaryBattleAccess(save, 2).allowed).toBe(true);
  });

  it('treats completed M39 acts as legacy-cleared battles without rolling saves backward', () => {
    const save = preparedSave();
    save.flags['ashen-reliquary:stage:1:shield-march'] = true;
    expect(reliquaryBattleCleared(save, 1)).toBe(true);
    expect(combatGatedReliquaryState(save).stages[0].battleCleared).toBe(true);
    expect(reliquaryBattleAccess(save, 2).allowed).toBe(true);
  });

  it('turns downed units into visible recovery time without deleting companions', () => {
    const save = preparedSave();
    const party = buildReliquaryParty(save);
    party.find((member) => member.id === 'protagonist')!.hp = 0;
    party.find((member) => member.id === 'cleric')!.hp = 0;
    const combat: CombatState = {
      round: 4,
      order: party.map((member) => member.id),
      turnIndex: 0,
      party,
      enemies: createReliquaryEncounter(1),
      guarding: {},
      enemyIntents: {},
      log: [],
      outcome: 'defeat',
    };
    const ids = applyReliquaryBattleInjuries(save, combat);
    expect(ids).toEqual(expect.arrayContaining(['protagonist', 'cleric']));
    expect(save.protagonist.injuredForTrips).toBe(1);
    expect(save.companions.find((member) => member.id === 'cleric')?.injuredForTrips).toBe(2);
    expect(save.companions.some((member) => member.id === 'cleric')).toBe(true);
  });
});
