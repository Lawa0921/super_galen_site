import { describe, expect, it } from 'vitest';
import { ITEMS } from './items';
import {
  COMPANY_INITIATIVE_ORDER,
  buildCompanyInitiativeBoard,
  buildCompanyInitiativeOption,
  completeCompanyInitiative,
  initiativeCompletedStage,
  initiativeReceiptKey,
  initiativeStageUsage,
  nextInitiativeStage,
} from './initiatives';
import type {
  CompanyInitiativeId,
  CompanyInitiativeRouteId,
  CompanyInitiativeStage,
} from './initiatives';
import { newGame } from '../save';
import type { CompanionRecord, SaveData } from '../save';

function companion(id: string, bond = 3): CompanionRecord {
  return {
    id,
    name: id,
    job: id.endsWith('1') ? 'swordsman' : id.endsWith('2') ? 'ranger' : 'cleric',
    level: 5,
    xp: 0,
    stats: { str: 14, dex: 14, int: 14, cha: 14, con: 14 },
    maxHp: 24,
    injuredForTrips: 0,
    equipment: {
      weapon: 'salt-crystal-blade',
      armor: 'saltforged-mail',
      trinket: 'den-idol',
    },
    equipmentPlus: { weapon: 2, armor: 2, trinket: 1 },
    bond,
  };
}

function matureSave(): SaveData {
  const save = newGame(100, {
    job: 'swordsman',
    trait: 'seasoned',
    statRoll: { str: 15, dex: 14, int: 13, cha: 14, con: 14 },
    allocation: { int: 1, cha: 1, con: 1 },
  });
  save.protagonist.level = 5;
  save.protagonist.stats = { str: 18, dex: 18, int: 18, cha: 18, con: 18 };
  save.protagonist.skills = { martial: 5, scouting: 5, lore: 5, negotiation: 5, survival: 5 };
  save.protagonist.skillPoints = 12;
  save.protagonist.careerMilestones = [
    { level: 2, pathId: 'martial', score: 20 },
    { level: 3, pathId: 'scouting', score: 20 },
    { level: 4, pathId: 'lore', score: 20 },
    { level: 5, pathId: 'negotiation', score: 20 },
  ];
  save.companyCharter = { id: 'bound-fellowship', tier: 3 };
  save.flags['company-charter:bound-fellowship'] = true;
  for (let tier = 1; tier <= 3; tier++) save.flags[`company-charter-reward:bound-fellowship:${tier}`] = true;
  save.reputation = 100;
  save.gold = 5000;
  save.wagonLevel = 5;
  save.inventory = {
    ore: 30,
    'tattered-map': 30,
    torch: 30,
    'dried-rations': 30,
    salt: 30,
    'spice-pouch': 30,
    bandage: 30,
    'war-tonic': 30,
  };
  save.flags['discovered:a'] = true;
  save.flags['discovered:b'] = true;
  save.flags['discovered:c'] = true;
  save.visitedBossDungeons = ['boss-a', 'boss-b', 'boss-c'];
  save.companions = [companion('c1'), companion('c2'), companion('c3')];
  save.protagonist.equipment = {
    weapon: 'salt-crystal-blade', armor: 'saltforged-mail', trinket: 'den-idol',
  };
  save.protagonist.equipmentPlus = { weapon: 2, armor: 2, trinket: 2 };
  save.expeditionPlan = {
    activeIds: ['protagonist', 'c1', 'c2', 'c3'],
    positions: { protagonist: 'front', c1: 'front', c2: 'back', c3: 'back' },
    roles: { captain: 'protagonist', scout: 'c2', quartermaster: 'c3', medic: 'c1' },
  };
  return save;
}

function completePriorStages(save: SaveData, projectId: CompanyInitiativeId, upTo: number): void {
  for (let stage = 1; stage <= upTo; stage++) {
    save.flags[initiativeReceiptKey(projectId, stage as CompanyInitiativeStage, 'expertise')] = true;
  }
}

describe('M28 company initiatives', () => {
  it('defines three genuinely different available routes for every project and stage on a mature save', () => {
    for (const projectId of COMPANY_INITIATIVE_ORDER) {
      for (const stage of [1, 2, 3] as CompanyInitiativeStage[]) {
        const save = matureSave();
        completePriorStages(save, projectId, stage - 1);
        const options = (['expertise', 'capital', 'field'] as CompanyInitiativeRouteId[])
          .map((route) => buildCompanyInitiativeOption(save, projectId, stage, route));
        expect(options.every((option) => option.available)).toBe(true);
        expect(new Set(options.map((option) => JSON.stringify(option.cost))).size).toBe(3);
        expect(new Set(options.map((option) => JSON.stringify(option.reward))).size).toBe(3);
      }
    }
  });

  it('references only real items in all costs and rewards', () => {
    for (const projectId of COMPANY_INITIATIVE_ORDER) {
      for (const stage of [1, 2, 3] as CompanyInitiativeStage[]) {
        const save = matureSave();
        completePriorStages(save, projectId, stage - 1);
        for (const route of ['expertise', 'capital', 'field'] as CompanyInitiativeRouteId[]) {
          const option = buildCompanyInitiativeOption(save, projectId, stage, route);
          for (const itemId of Object.keys(option.cost.inventory ?? {})) expect(ITEMS[itemId]).toBeDefined();
          for (const itemId of Object.keys(option.reward.inventory ?? {})) expect(ITEMS[itemId]).toBeDefined();
        }
      }
    }
  });

  it('is atomic when requirements or resources fail', () => {
    const save = matureSave();
    save.protagonist.skillPoints = 0;
    const before = JSON.stringify(save);
    expect(() => completeCompanyInitiative(save, 'escort-network', 1, 'expertise')).toThrow();
    expect(JSON.stringify(save)).toBe(before);
  });

  it('cannot repeat the same stage or farm a second route', () => {
    const save = matureSave();
    const first = completeCompanyInitiative(save, 'escort-network', 1, 'expertise');
    const after = JSON.stringify(save);
    expect(first.available).toBe(true);
    expect(() => completeCompanyInitiative(save, 'escort-network', 1, 'capital')).toThrow();
    expect(JSON.stringify(save)).toBe(after);
  });

  it('cannot skip project stages', () => {
    const save = matureSave();
    expect(nextInitiativeStage(save, 'frontier-office')).toBe(1);
    expect(() => completeCompanyInitiative(save, 'frontier-office', 2, 'field')).toThrow(/先完成第 1 階/);
    expect(initiativeCompletedStage(save, 'frontier-office')).toBe(0);
  });

  it('enforces global 3/2/1 portfolio caps', () => {
    const save = matureSave();
    for (const projectId of COMPANY_INITIATIVE_ORDER.slice(0, 3)) {
      completeCompanyInitiative(save, projectId, 1, 'expertise');
    }
    expect(initiativeStageUsage(save, 1)).toBe(3);
    const fourth = buildCompanyInitiativeOption(save, 'fellowship-hall', 1, 'expertise');
    expect(fourth.available).toBe(false);
    expect(fourth.requirements.find((requirement) => requirement.id === 'stage-capacity')?.met).toBe(false);
  });

  it('capital routes cannot immediately print more gold than they cost', () => {
    for (const projectId of COMPANY_INITIATIVE_ORDER) {
      for (const stage of [1, 2, 3] as CompanyInitiativeStage[]) {
        const save = matureSave();
        completePriorStages(save, projectId, stage - 1);
        const option = buildCompanyInitiativeOption(save, projectId, stage, 'capital');
        expect(option.reward.gold ?? 0).toBeLessThan(option.cost.gold ?? 0);
      }
    }
  });

  it('caps skill rewards at rank 5 and wagon rewards at level 6', () => {
    const save = matureSave();
    save.protagonist.skills!.martial = 5;
    completeCompanyInitiative(save, 'escort-network', 1, 'expertise');
    completeCompanyInitiative(save, 'escort-network', 2, 'expertise');
    expect(save.protagonist.skills!.martial).toBe(5);

    const trade = matureSave();
    trade.wagonLevel = 6;
    completeCompanyInitiative(trade, 'trade-consortium', 1, 'capital');
    expect(trade.wagonLevel).toBe(6);
  });

  it('records irreversible route identity and exact resource deltas', () => {
    const save = matureSave();
    const beforePoints = save.protagonist.skillPoints ?? 0;
    const beforeStr = save.protagonist.stats.str;
    const option = completeCompanyInitiative(save, 'escort-network', 1, 'expertise');
    expect(save.flags[initiativeReceiptKey('escort-network', 1, 'expertise')]).toBe(true);
    expect(save.protagonist.skillPoints).toBe(beforePoints - (option.cost.skillPoints ?? 0));
    expect(save.protagonist.stats.str).toBe(beforeStr + (option.reward.stats?.str ?? 0));
  });

  it('detects conflicting receipt corruption without granting anything', () => {
    const save = matureSave();
    save.flags[initiativeReceiptKey('relic-workshop', 1, 'expertise')] = true;
    save.flags[initiativeReceiptKey('relic-workshop', 1, 'capital')] = true;
    const before = JSON.stringify(save);
    const board = buildCompanyInitiativeBoard(save);
    const project = board.projects.find((entry) => entry.id === 'relic-workshop')!;
    expect(project.history[0].conflict).toBe(true);
    expect(board.warnings.some((warning) => warning.includes('多個完成收據'))).toBe(true);
    expect(JSON.stringify(save)).toBe(before);
  });

  it('keeps low-system legacy saves outside all available initiative routes', () => {
    const save = newGame(1);
    const board = buildCompanyInitiativeBoard(save);
    expect(board.projects.every((project) => project.options.every((option) => !option.available))).toBe(true);
    expect(board.stageCapacity[1]).toEqual({ used: 0, cap: 3 });
  });
});
