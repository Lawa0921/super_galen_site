import { describe, expect, it } from 'vitest';
import { ITEMS } from './items';
import type { CareerMilestone, CareerPathId } from './careers';
import {
  COMPANY_CHARTER_ORDER,
  chooseCompanyCharter,
  companyCharterMetrics,
  companyCharterReward,
  companyCharterTierEligible,
  isValidCompanyCharterProgress,
  type CompanyCharterId,
  type CompanyCharterSnapshot,
} from './charters';
import {
  newGame,
  realizeSaveCompanyCharter,
  type CompanionRecord,
  type SaveData,
} from '../save';

const milestone = (level: 2 | 3 | 4 | 5, pathId: CareerPathId): CareerMilestone => ({
  level,
  pathId,
  score: 20,
});

function member(id: string, job: CompanionRecord['job'] = 'swordsman'): CompanionRecord {
  return {
    id,
    name: id,
    job,
    level: 5,
    xp: 320,
    stats: { str: 12, dex: 12, int: 12, cha: 12, con: 12 },
    maxHp: 24,
    injuredForTrips: 0,
    equipment: { weapon: null, armor: null, trinket: null },
  };
}

function snapshot(paths: CareerPathId[]): CompanyCharterSnapshot {
  const protagonist = member('protagonist');
  protagonist.genesis = { lifepathId: 'seasoned', aptitudeId: 'int', burdenId: 'str' };
  protagonist.growth = { potential: { str: 2, dex: 2, int: 2, cha: 2, con: 2 } };
  protagonist.careerMilestones = paths.map((pathId, index) => milestone((index + 2) as 2 | 3 | 4 | 5, pathId));
  return {
    protagonist,
    companions: [],
    gold: 200,
    reputation: 30,
    wagonLevel: 0,
    inventory: {},
    flags: {},
    visitedBossDungeons: [],
  };
}

function prepareSave(paths: CareerPathId[]): SaveData {
  const save = newGame(100, { job: 'swordsman', trait: 'seasoned' });
  save.protagonist.level = 5;
  save.protagonist.growthRealizedLevel = 5;
  save.protagonist.careerMilestones = paths.map((pathId, index) =>
    milestone((index + 2) as 2 | 3 | 4 | 5, pathId));
  save.reputation = 60;
  return save;
}

function totalInventory(save: SaveData): number {
  return Object.values(save.inventory).reduce((sum, count) => sum + count, 0);
}

describe('M26 商隊特許', () => {
  it('五種特許都有三章合法且只引用現有物品的獎勵', () => {
    for (const id of COMPANY_CHARTER_ORDER) {
      for (const tier of [1, 2, 3] as const) {
        const reward = companyCharterReward(id, tier);
        for (const [itemId, count] of Object.entries(reward.inventory ?? {})) {
          expect(ITEMS[itemId]).toBeDefined();
          expect(count).toBeGreaterThan(0);
        }
        expect(reward.gold ?? 0).toBeGreaterThanOrEqual(0);
        expect(reward.reputation ?? 0).toBeGreaterThanOrEqual(0);
        expect(reward.maxHp ?? 0).toBeGreaterThanOrEqual(0);
        expect(reward.wagonLevels ?? 0).toBeGreaterThanOrEqual(0);
        expect(reward.bondAll ?? 0).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('不同跨系統構築能鎖定五種不同特許，而非只由職業決定', () => {
    const iron = snapshot(['martial', 'martial', 'martial', 'martial']);
    iron.protagonist.genesis!.lifepathId = 'brawny';
    iron.protagonist.growth!.potential.str = 5;
    iron.protagonist.equipment = { weapon: 'salt-crystal-blade', armor: 'saltforged-mail', trinket: 'den-idol' };
    iron.protagonist.equipmentPlus = { weapon: 2, armor: 1, trinket: 0 };
    iron.expeditionPlan = {
      activeIds: ['protagonist'], positions: { protagonist: 'front' }, roles: { captain: 'protagonist' },
    };

    const horizon = snapshot(['scouting', 'scouting', 'scouting', 'scouting']);
    horizon.protagonist.genesis!.lifepathId = 'nimble';
    horizon.protagonist.growth!.potential.dex = 5;
    horizon.inventory = { torch: 3, 'tattered-map': 2, 'dried-rations': 3 };
    horizon.flags = { 'discovered:mist-pass': true, 'discovered:old-road': true };
    horizon.expeditionPlan = {
      activeIds: ['protagonist'], positions: { protagonist: 'back' }, roles: { scout: 'protagonist' },
    };

    const ledger = snapshot(['negotiation', 'negotiation', 'lore', 'negotiation']);
    ledger.protagonist.genesis!.lifepathId = 'charming';
    ledger.protagonist.growth!.potential.cha = 5;
    ledger.gold = 800;
    ledger.wagonLevel = 3;
    ledger.inventory = { salt: 4, 'spice-pouch': 4, 'silver-locket': 2 };
    ledger.expeditionPlan = {
      activeIds: ['protagonist'], positions: { protagonist: 'back' }, roles: { quartermaster: 'protagonist' },
    };

    const fellowship = snapshot(['martial', 'scouting', 'lore', 'negotiation']);
    fellowship.companions = [member('a'), member('b', 'ranger'), member('c', 'cleric')];
    fellowship.companions.forEach((companion) => { companion.bond = 4; });
    fellowship.expeditionPlan = {
      activeIds: ['protagonist', 'a', 'b', 'c'],
      positions: { protagonist: 'front', a: 'front', b: 'back', c: 'back' },
      roles: { captain: 'protagonist', scout: 'b', quartermaster: 'a', medic: 'c' },
    };

    const relic = snapshot(['lore', 'survival', 'lore', 'survival']);
    relic.protagonist.genesis!.lifepathId = 'learned';
    relic.protagonist.growth!.potential.int = 5;
    relic.protagonist.growth!.potential.con = 5;
    relic.protagonist.equipmentPlus = { weapon: 2, armor: 2, trinket: 1 };
    relic.inventory = { ore: 5, 'tattered-map': 2, 'overseer-ledger': 1 };
    relic.visitedBossDungeons = ['goblin-den', 'salt-mine'];

    expect(chooseCompanyCharter(iron)).toBe('iron-vanguard');
    expect(chooseCompanyCharter(horizon)).toBe('far-horizon');
    expect(chooseCompanyCharter(ledger)).toBe('ledger-guild');
    expect(chooseCompanyCharter(fellowship)).toBe('bound-fellowship');
    expect(chooseCompanyCharter(relic)).toBe('relic-covenant');
  });

  it('高階章節要求角色、編隊與經營條件共同成立', () => {
    const save = snapshot(['negotiation', 'negotiation', 'lore', 'negotiation']);
    save.gold = 600;
    save.reputation = 60;
    save.wagonLevel = 2;
    expect(companyCharterTierEligible(save, 'ledger-guild', 3)).toBe(true);

    save.wagonLevel = 0;
    expect(companyCharterTierEligible(save, 'ledger-guild', 3)).toBe(false);
    save.wagonLevel = 2;
    save.gold = 100;
    expect(companyCharterTierEligible(save, 'ledger-guild', 3)).toBe(false);
  });

  it('重複保存或重複實現不能刷取特許獎勵', () => {
    const save = prepareSave(['martial', 'martial', 'martial', 'martial']);
    save.protagonist.equipment = {
      weapon: 'salt-crystal-blade', armor: 'saltforged-mail', trinket: 'den-idol',
    };
    save.protagonist.equipmentPlus = { weapon: 2, armor: 2, trinket: 2 };
    save.expeditionPlan = {
      activeIds: ['protagonist'], positions: { protagonist: 'front' }, roles: { captain: 'protagonist' },
    };

    realizeSaveCompanyCharter(save);
    const after = {
      stats: { ...save.protagonist.stats },
      hp: save.protagonist.maxHp,
      skills: { ...save.protagonist.skills },
      gold: save.gold,
      reputation: save.reputation,
      inventory: { ...save.inventory },
      charter: { ...save.companyCharter! },
    };
    realizeSaveCompanyCharter(save);
    realizeSaveCompanyCharter(save);
    expect({
      stats: save.protagonist.stats,
      hp: save.protagonist.maxHp,
      skills: save.protagonist.skills,
      gold: save.gold,
      reputation: save.reputation,
      inventory: save.inventory,
      charter: save.companyCharter,
    }).toEqual(after);
  });

  it('身份鎖定後換裝、換編隊或改資產都不能跳槽領另一套獎勵', () => {
    const save = prepareSave(['martial', 'martial', 'martial', 'martial']);
    save.protagonist.equipment = {
      weapon: 'salt-crystal-blade', armor: 'saltforged-mail', trinket: 'den-idol',
    };
    realizeSaveCompanyCharter(save);
    expect(save.companyCharter?.id).toBe('iron-vanguard');

    save.protagonist.careerMilestones = [
      milestone(2, 'negotiation'), milestone(3, 'negotiation'),
      milestone(4, 'lore'), milestone(5, 'negotiation'),
    ];
    save.gold = 1000;
    save.wagonLevel = 4;
    save.inventory = { salt: 10, 'spice-pouch': 10 };
    realizeSaveCompanyCharter(save);
    expect(save.companyCharter?.id).toBe('iron-vanguard');
    expect(save.flags['company-charter:ledger-guild']).not.toBe(true);
  });

  it('獎勵收據可抵抗進度遺失，不能刪欄位後重新領取', () => {
    const save = prepareSave(['scouting', 'scouting', 'scouting', 'scouting']);
    save.inventory = { torch: 4, 'tattered-map': 3, 'dried-rations': 4 };
    save.flags['discovered:a'] = true;
    save.flags['discovered:b'] = true;
    save.expeditionPlan = {
      activeIds: ['protagonist'], positions: { protagonist: 'back' }, roles: { scout: 'protagonist' },
    };
    realizeSaveCompanyCharter(save);
    const total = totalInventory(save);
    const gold = save.gold;
    delete save.companyCharter;
    realizeSaveCompanyCharter(save);
    expect(totalInventory(save)).toBe(total);
    expect(save.gold).toBe(gold);
    expect(save.companyCharter?.id).toBe('far-horizon');
  });

  it('無命運角色不取得特許，非法進度會被清除而不發獎', () => {
    const legacy = newGame(1, { job: 'swordsman', trait: null });
    legacy.reputation = 99;
    legacy.companyCharter = { id: 'iron-vanguard', tier: 3 };
    realizeSaveCompanyCharter(legacy);
    expect(legacy.companyCharter).toEqual({ id: 'iron-vanguard', tier: 3 });
    expect(Object.keys(legacy.flags).some((key) => key.startsWith('company-charter-reward:'))).toBe(false);

    expect(isValidCompanyCharterProgress({ id: 'fake', tier: 99 })).toBe(false);
  });

  it('編隊指標只計算健康且真正出征的成員，後備不能灌高特許分數', () => {
    const state = snapshot(['martial']);
    const active = member('active');
    const reserve = member('reserve');
    const injured = member('injured');
    active.equipment.weapon = 'salt-crystal-blade';
    reserve.equipment = { weapon: 'salt-crystal-blade', armor: 'saltforged-mail', trinket: 'den-idol' };
    injured.injuredForTrips = 2;
    injured.equipment = { weapon: 'salt-crystal-blade', armor: 'saltforged-mail', trinket: 'den-idol' };
    state.companions = [active, reserve, injured];
    state.expeditionPlan = {
      activeIds: ['protagonist', 'active'],
      positions: { protagonist: 'front', active: 'front', reserve: 'front', injured: 'front' },
      roles: { captain: 'protagonist', scout: 'reserve', medic: 'injured' },
    };
    const metrics = companyCharterMetrics(state);
    expect(metrics.activeCount).toBe(2);
    expect(metrics.armedCount).toBe(1);
    expect(metrics.assignedRoles).toBe(1);
  });
});
