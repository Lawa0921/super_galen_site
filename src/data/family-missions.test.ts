import { describe, expect, it } from 'vitest';
import { abilityCatalog, rankSteps, scoutProfiles } from './family-missions';

describe('雙羽任務靜態資料', () => {
  it('每位偵查員都有五個可部署任務，且任務 id 不重複', () => {
    const allTasks = Object.values(scoutProfiles).flatMap((profile) => profile.tasks);
    const allIds = allTasks.map((task) => task.id);

    expect(scoutProfiles.apple.tasks).toHaveLength(5);
    expect(scoutProfiles.amy.tasks).toHaveLength(5);
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('所有任務都指向六項核心能力之一', () => {
    const abilityIds = new Set(Object.keys(abilityCatalog));

    for (const profile of Object.values(scoutProfiles)) {
      for (const task of profile.tasks) {
        expect(abilityIds.has(task.abilityId)).toBe(true);
        expect(task.rewardStars).toBeGreaterThan(0);
        expect(task.abilityXp).toBeGreaterThan(0);
      }
    }
  });

  it('保留 Apple 與 Amy 的既定起始軍階', () => {
    const rankAt = (stars: number) => rankSteps.filter((rank) => stars >= rank.stars).at(-1)?.name;

    expect(scoutProfiles.apple.startingStars).toBe(80);
    expect(rankAt(scoutProfiles.apple.startingStars)).toBe('初級偵查兵');
    expect(scoutProfiles.amy.startingStars).toBe(0);
    expect(rankAt(scoutProfiles.amy.startingStars)).toBe('小兵');
  });
});
