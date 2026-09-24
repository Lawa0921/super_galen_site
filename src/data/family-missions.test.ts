import { describe, expect, it } from 'vitest';
import { abilityCatalog, abilityGrades, abilityStages, rankChapters, rankSteps, scoutProfiles } from './family-missions';

describe('雙羽任務靜態資料', () => {
  it('每位偵查員都有五個可部署任務，且任務 id 不重複', () => {
    const allTasks = Object.values(scoutProfiles).flatMap((profile) => profile.tasks);
    const allIds = allTasks.map((task) => task.id);

    expect(scoutProfiles.apple.tasks).toHaveLength(5);
    expect(scoutProfiles.amy.tasks).toHaveLength(5);
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('所有任務都有核心能力，且每位孩子每天有三個主線與兩個自由挑戰', () => {
    const abilityIds = new Set(Object.keys(abilityCatalog));

    for (const profile of Object.values(scoutProfiles)) {
      expect(profile.tasks.filter((task) => task.kind === 'main')).toHaveLength(3);
      expect(profile.tasks.filter((task) => task.kind === 'free')).toHaveLength(2);
      for (const task of profile.tasks) {
        expect(task.abilityIds.length).toBeGreaterThan(0);
        expect(task.steps).toHaveLength(3);
        task.steps.forEach((step) => expect(step.length).toBeGreaterThan(0));
        expect(new Set(task.abilityIds).size).toBe(task.abilityIds.length);
        task.abilityIds.forEach((abilityId) => expect(abilityIds.has(abilityId)).toBe(true));
      }
    }
  });

  it('以每十星一階組成 50 階、500 星成長路徑', () => {
    expect(rankChapters).toHaveLength(10);
    expect(rankSteps).toHaveLength(50);
    expect(rankSteps.map((rank) => rank.level)).toEqual(Array.from({ length: 50 }, (_, index) => index + 1));
    expect(rankSteps.map((rank) => rank.stars)).toEqual(Array.from({ length: 50 }, (_, index) => (index + 1) * 10));
    expect(rankSteps.at(-1)?.name).toBe('雙羽星光總隊長');
    expect(rankSteps.at(-1)?.stars).toBe(500);
  });

  it('能力使用七個兒童可理解的階段，共 21 個成長小步', () => {
    expect(abilityStages).toEqual(['萌芽', '練習', '熟悉', '穩定', '熟練', '自主', '閃耀']);
    expect(abilityGrades).toHaveLength(21);
    expect(abilityGrades.slice(0, 3)).toEqual(['萌芽 1', '萌芽 2', '萌芽 3']);
    expect(abilityGrades.slice(-3)).toEqual(['閃耀 1', '閃耀 2', '閃耀 3']);
  });

  it('保留 Apple 與 Amy 的目前星星進度', () => {
    const rankAt = (stars: number) => rankSteps.filter((rank) => stars >= rank.stars).at(-1)?.name ?? '見習小兵';

    expect(scoutProfiles.apple.startingStars).toBe(39);
    expect(rankAt(scoutProfiles.apple.startingStars)).toBe('初級偵查兵');
    expect(scoutProfiles.amy.startingStars).toBe(11);
    expect(rankAt(scoutProfiles.amy.startingStars)).toBe('小兵');
  });
});
