import { describe, expect, it } from 'vitest';
import {
  newGame,
  realizeSaveCareer,
  realizeSaveProgression,
  STARTING_PROFILE,
} from '../save';
import {
  CAREER_LEVELS,
  CAREER_PATHS,
  careerReward,
  chooseCareerMilestone,
  careerSignature,
} from './careers';

function makeCareerSave() {
  return newGame(1, {
    job: 'ranger',
    trait: 'nimble',
    allocation: { dex: 2, con: 1 },
  });
}

const totalStats = (stats: Record<string, number>) =>
  Object.values(stats).reduce((sum, value) => sum + value, 0);

describe('M25 自適應職涯里程碑', () => {
  it('五條職涯都有 Lv2～Lv5 獎勵且不會引用負資源', () => {
    for (const pathId of Object.keys(CAREER_PATHS) as Array<keyof typeof CAREER_PATHS>) {
      for (const level of CAREER_LEVELS) {
        const reward = careerReward(level, pathId);
        expect((reward.maxHp ?? 0)).toBeGreaterThanOrEqual(0);
        expect((reward.skillPoints ?? 0)).toBeGreaterThanOrEqual(0);
        expect((reward.gold ?? 0)).toBeGreaterThanOrEqual(0);
        expect((reward.reputation ?? 0)).toBeGreaterThanOrEqual(0);
        for (const count of Object.values(reward.inventory ?? {})) expect(count).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('同職業可因屬性、技能與潛力不同而走不同路線', () => {
    const growth = {
      potential: { str: 2, dex: 4, int: 2, cha: 2, con: 3 } as const,
    };
    const scout = chooseCareerMilestone({
      stats: { str: 10, dex: 16, int: 10, cha: 10, con: 11 },
      skills: { scouting: 2 },
      growth,
    }, 2);
    const scholar = chooseCareerMilestone({
      stats: { str: 10, dex: 12, int: 17, cha: 10, con: 11 },
      skills: { lore: 3 },
      growth: { potential: { str: 2, dex: 2, int: 5, cha: 2, con: 3 } },
    }, 2);
    expect(scout.pathId).toBe('scouting');
    expect(scholar.pathId).toBe('lore');
  });

  it('保存或實現多次不會重複發放里程碑獎勵', () => {
    const save = makeCareerSave();
    save.protagonist.level = 3;
    realizeSaveProgression(save);
    const snapshot = JSON.stringify({
      stats: save.protagonist.stats,
      maxHp: save.protagonist.maxHp,
      skills: save.protagonist.skills,
      skillPoints: save.protagonist.skillPoints,
      gold: save.gold,
      reputation: save.reputation,
      inventory: save.inventory,
      milestones: save.protagonist.careerMilestones,
    });
    realizeSaveProgression(save);
    realizeSaveProgression(save);
    expect(JSON.stringify({
      stats: save.protagonist.stats,
      maxHp: save.protagonist.maxHp,
      skills: save.protagonist.skills,
      skillPoints: save.protagonist.skillPoints,
      gold: save.gold,
      reputation: save.reputation,
      inventory: save.inventory,
      milestones: save.protagonist.careerMilestones,
    })).toBe(snapshot);
  });

  it('一次跳至 Lv5 與逐級實現得到相同職涯歷史和總資源', () => {
    const jump = makeCareerSave();
    jump.protagonist.level = 5;
    realizeSaveProgression(jump);

    const step = makeCareerSave();
    for (const level of CAREER_LEVELS) {
      step.protagonist.level = level;
      realizeSaveProgression(step);
    }

    expect(step.protagonist.careerMilestones).toEqual(jump.protagonist.careerMilestones);
    expect(step.protagonist.stats).toEqual(jump.protagonist.stats);
    expect(step.protagonist.maxHp).toBe(jump.protagonist.maxHp);
    expect(step.protagonist.skills).toEqual(jump.protagonist.skills);
    expect(step.protagonist.skillPoints).toBe(jump.protagonist.skillPoints);
    expect(step.gold).toBe(jump.gold);
    expect(step.reputation).toBe(jump.reputation);
    expect(step.inventory).toEqual(jump.inventory);
  });

  it('玩家能中途轉向，既有里程碑不會被後續屬性改寫', () => {
    const save = makeCareerSave();
    save.protagonist.level = 2;
    realizeSaveProgression(save);
    const first = save.protagonist.careerMilestones![0];

    save.protagonist.stats.int += 10;
    save.protagonist.skills = { ...(save.protagonist.skills ?? {}), lore: 4 };
    save.protagonist.level = 3;
    realizeSaveProgression(save);

    expect(save.protagonist.careerMilestones![0]).toEqual(first);
    expect(save.protagonist.careerMilestones![1].pathId).toBe('lore');
    expect(careerSignature(save.protagonist.careerMilestones)).toContain('學識者');
  });

  it('技能達上限時不會溢出，其他獎勵仍正常發放', () => {
    const save = makeCareerSave();
    save.protagonist.skills = { scouting: 5 };
    save.protagonist.level = 2;
    const goldBefore = save.gold;
    realizeSaveProgression(save);
    expect(save.protagonist.skills.scouting).toBe(5);
    expect(save.gold).toBeGreaterThanOrEqual(goldBefore);
    expect(save.protagonist.careerMilestones).toHaveLength(1);
  });

  it('無出身角色完全不啟動職涯系統', () => {
    const save = newGame(1, { job: 'swordsman', trait: null });
    save.protagonist.level = 5;
    const statsBefore = { ...save.protagonist.stats };
    const hpBefore = save.protagonist.maxHp;
    const goldBefore = save.gold;
    realizeSaveCareer(save);
    expect(save.protagonist.careerMilestones).toBeUndefined();
    expect(save.protagonist.stats).toEqual(statsBefore);
    expect(save.protagonist.maxHp).toBe(hpBefore);
    expect(save.gold).toBe(goldBefore);
  });

  it('舊 M24 角色缺少里程碑時依目前等級安全補算且只補一次', () => {
    const save = makeCareerSave();
    save.protagonist.level = 4;
    delete save.protagonist.careerMilestones;
    realizeSaveProgression(save);
    expect(save.protagonist.careerMilestones?.map((m) => m.level)).toEqual([2, 3, 4]);
    const total = totalStats(save.protagonist.stats);
    realizeSaveProgression(save);
    expect(totalStats(save.protagonist.stats)).toBe(total);
    expect(save.protagonist.careerMilestones?.map((m) => m.level)).toEqual([2, 3, 4]);
  });

  it('毀損或重複里程碑會被整理，不得阻止缺少等級正常補發', () => {
    const save = makeCareerSave();
    save.protagonist.level = 4;
    save.protagonist.careerMilestones = [
      { level: 2, pathId: 'scouting' },
      { level: 2, pathId: 'martial' },
      { level: 9, pathId: 'lore' } as never,
    ];
    realizeSaveProgression(save);
    expect(save.protagonist.careerMilestones?.map((m) => m.level)).toEqual([2, 3, 4]);
    expect(new Set(save.protagonist.careerMilestones?.map((m) => m.level)).size).toBe(3);
  });

  it('四次同路線獎勵仍保持受控，不壓過手動升級與裝備系統', () => {
    const base = STARTING_PROFILE.swordsman.stats;
    let statGain = 0;
    let hpGain = 0;
    let skillGain = 0;
    for (const level of CAREER_LEVELS) {
      const reward = careerReward(level, 'martial');
      statGain += totalStats(reward.stats ?? {});
      hpGain += reward.maxHp ?? 0;
      skillGain += reward.skill?.amount ?? 0;
    }
    expect(statGain).toBeLessThanOrEqual(2);
    expect(hpGain).toBeLessThanOrEqual(2);
    expect(skillGain).toBeLessThanOrEqual(2);
    expect(totalStats(base)).toBeGreaterThan(statGain * 10);
  });
});
