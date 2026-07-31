import { describe, expect, it } from 'vitest';
import { newGame, type CompanionRecord, type SaveData } from '../save';
import {
  COMPANY_CHARTER_ORDER,
  companyCharterTierEligible,
  type CompanyCharterId,
} from './charters';
import { buildCompanyDossier, dossierCharterRequirements } from './dossier';

function companion(id: string, job: CompanionRecord['job'] = 'swordsman'): CompanionRecord {
  return {
    id,
    name: id,
    job,
    level: 3,
    xp: 120,
    stats: { str: 12, dex: 12, int: 12, cha: 12, con: 12 },
    maxHp: 24,
    injuredForTrips: 0,
    equipment: { weapon: null, armor: null, trinket: null },
    bond: 2,
  };
}

function matureSave(): SaveData {
  const save = newGame(1, {
    job: 'ranger',
    trait: 'nimble',
    allocation: { dex: 3 },
  });
  save.protagonist.level = 5;
  save.protagonist.careerMilestones = [
    { level: 2, pathId: 'scouting', score: 20 },
    { level: 3, pathId: 'lore', score: 19 },
    { level: 4, pathId: 'negotiation', score: 18 },
    { level: 5, pathId: 'survival', score: 17 },
  ];
  save.companions = [companion('a'), companion('b', 'mage'), companion('c', 'cleric')];
  save.companions[0].equipment.weapon = 'salt-crystal-blade';
  save.companions[0].equipment.armor = 'saltforged-mail';
  save.companions[1].equipment.weapon = 'ghostflame-staff';
  save.companions[1].equipment.armor = 'saltwoven-robe';
  save.companions[2].equipment.weapon = 'brine-blessed-mace';
  save.companions[2].equipment.armor = 'saltpriest-vestment';
  save.expeditionPlan = {
    activeIds: ['protagonist', 'a', 'b', 'c'],
    positions: { protagonist: 'back', a: 'front', b: 'back', c: 'front' },
    roles: { captain: 'protagonist', scout: 'a', quartermaster: 'b', medic: 'c' },
  };
  save.gold = 700;
  save.reputation = 60;
  save.wagonLevel = 3;
  save.inventory = {
    torch: 3,
    'tattered-map': 3,
    'dried-rations': 3,
    salt: 3,
    'spice-pouch': 2,
    ore: 4,
    'overseer-ledger': 1,
  };
  save.flags['discovered:mist-pass'] = true;
  save.flags['discovered:salt-cave'] = true;
  save.visitedBossDungeons = ['goblin-den', 'salt-cave'];
  return save;
}

describe('M27 商隊檔案與路線圖', () => {
  it('逐項門檻與正式特許 eligibility 在五種身份與三章保持完全一致', () => {
    const base = matureSave();
    for (const id of COMPANY_CHARTER_ORDER) {
      for (const tier of [1, 2, 3] as const) {
        const cases: SaveData[] = [structuredClone(base)];
        const low = structuredClone(base);
        low.reputation = 0;
        cases.push(low);
        const sparse = structuredClone(base);
        sparse.inventory = {};
        sparse.gold = 0;
        sparse.wagonLevel = 0;
        sparse.visitedBossDungeons = [];
        sparse.flags = {};
        cases.push(sparse);
        for (const save of cases) {
          const requirements = dossierCharterRequirements(save, id, tier);
          expect(requirements.every((requirement) => requirement.met)).toBe(
            companyCharterTierEligible(save, id, tier),
          );
        }
      }
    }
  });

  it('檔案使用與正式 M26 相同的特許分數、候選與指標', () => {
    const save = matureSave();
    const dossier = buildCompanyDossier(save);
    expect(dossier.charter.scores).toHaveLength(5);
    expect(dossier.charter.scores[0].score).toBeGreaterThanOrEqual(dossier.charter.scores[4].score);
    expect(dossier.charter.candidateId).toBeTruthy();
    expect(dossier.charter.metrics.activeCount).toBe(4);
    expect(dossier.charter.metrics.assignedRoles).toBe(4);
    expect(dossier.company.activeCount).toBe(4);
  });

  it('完整呈現命運、五維潛力、四次職涯與基礎／有效屬性差異', () => {
    const save = matureSave();
    save.protagonist.equipment.trinket = 'overseer-ledger';
    const dossier = buildCompanyDossier(save);
    expect(dossier.protagonist.genesis).not.toContain('舊版');
    expect(dossier.protagonist.growthSignature).not.toBe('—');
    expect(dossier.protagonist.stats).toHaveLength(5);
    expect(dossier.protagonist.careers).toHaveLength(4);
    expect(dossier.protagonist.careers.every((career) => career.pathId !== null)).toBe(true);
    const int = dossier.protagonist.stats.find((stat) => stat.id === 'int')!;
    expect(int.effective).toBeGreaterThanOrEqual(int.base);
  });

  it('不寫入或正規化原始存檔，保持純只讀診斷', () => {
    const save = matureSave();
    save.expeditionPlan!.activeIds.push('missing-member');
    const before = JSON.stringify(save);
    buildCompanyDossier(save);
    expect(JSON.stringify(save)).toBe(before);
  });

  it('偵測非法命運、潛力、技能、物品、裝備與編隊髒資料', () => {
    const save = matureSave();
    save.protagonist.genesis = {
      lifepathId: 'bad' as never,
      aptitudeId: 'str',
      burdenId: 'con',
    };
    save.protagonist.growth = { potential: { str: 99 } } as never;
    save.protagonist.growthRealizedLevel = 99;
    save.protagonist.skills = { martial: 6, unknown: 1 };
    save.protagonist.equipment.weapon = 'missing-sword';
    save.inventory['missing-item'] = 2;
    save.inventory.ore = -1;
    save.expeditionPlan = {
      activeIds: ['protagonist', 'protagonist', 'ghost'],
      positions: { protagonist: 'front' },
      roles: { captain: 'protagonist', scout: 'protagonist', medic: 'ghost' },
    };
    const codes = new Set(buildCompanyDossier(save).audit.map((item) => item.code));
    expect(codes.has('invalid-genesis')).toBe(true);
    expect(codes.has('invalid-growth')).toBe(true);
    expect(codes.has('growth-level')).toBe(true);
    expect(codes.has('duplicate-active')).toBe(true);
    expect(codes.has('missing-active')).toBe(true);
    expect(codes.has('duplicate-role')).toBe(true);
    expect(codes.has('reserve-role')).toBe(true);
    expect([...codes].some((code) => code.startsWith('unknown-equipment'))).toBe(true);
    expect([...codes].some((code) => code.startsWith('invalid-skill'))).toBe(true);
    expect(codes.has('unknown-item-missing-item')).toBe(true);
    expect(codes.has('invalid-count-ore')).toBe(true);
  });

  it('舊版無命運角色仍可產生可讀檔案且不出現虛假特許', () => {
    const save = newGame(1, { job: 'swordsman', trait: null });
    const dossier = buildCompanyDossier(save);
    expect(dossier.protagonist.genesis).toContain('舊版');
    expect(dossier.protagonist.growthSignature).toBe('—');
    expect(dossier.charter.currentId).toBeNull();
    expect(dossier.charter.candidateId).toBeNull();
    expect(dossier.charter.nextTierEligible).toBe(false);
  });

  it('已鎖定特許時顯示該身份下一章，而不是改追最高候選分數', () => {
    const save = matureSave();
    save.companyCharter = { id: 'iron-vanguard', tier: 1 };
    save.flags['company-charter:iron-vanguard'] = true;
    save.flags['company-charter-reward:iron-vanguard:1'] = true;
    const dossier = buildCompanyDossier(save);
    expect(dossier.charter.currentId).toBe('iron-vanguard');
    expect(dossier.charter.nextTier).toBe(2);
    expect(dossier.charter.requirements.length).toBeGreaterThan(0);
    expect(dossier.charter.scores.find((score) => score.id === 'iron-vanguard')?.locked).toBe(true);
  });
});
