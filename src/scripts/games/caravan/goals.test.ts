import { describe, it, expect } from 'vitest';
import { RANKS, currentRank, nextRank, rankProgress, isFinalRank } from './goals';
import { newGame } from './save';

describe('M12 商會晉升階梯（遊戲目標）', () => {
  it('RANKS：5 階、聲望門檻嚴格遞增、首階 0、末階帶 boss 條件', () => {
    expect(RANKS).toHaveLength(5);
    expect(RANKS[0].minReputation).toBe(0);
    for (let i = 1; i < RANKS.length; i++) {
      expect(RANKS[i].minReputation).toBeGreaterThan(RANKS[i - 1].minReputation);
    }
    expect(RANKS[RANKS.length - 1].requiredBossClears).toBe(3);
  });

  it('currentRank：新檔＝首階；聲望 45＝特許商人；聲望 100 但 boss 不足不算頂階', () => {
    const save = newGame(1000);
    expect(currentRank(save).id).toBe(RANKS[0].id);
    save.reputation = 45;
    expect(currentRank(save).minReputation).toBe(40);
    save.reputation = 120;
    save.visitedBossDungeons = ['a', 'b'];
    expect(currentRank(save).id).toBe(RANKS[3].id); // 差 1 個 boss，卡在第 4 階
  });

  it('nextRank 與 rankProgress：回報下一階與缺口；頂階時 nextRank=null', () => {
    const save = newGame(1000);
    save.reputation = 52;
    const next = nextRank(save);
    expect(next?.minReputation).toBe(60);
    const progress = rankProgress(save);
    expect(progress?.reputation).toEqual({ have: 52, need: 60 });
    expect(progress?.bossClears).toBeUndefined(); // 該階無 boss 條件

    save.reputation = 200;
    save.visitedBossDungeons = ['a', 'b', 'c'];
    expect(currentRank(save).id).toBe(RANKS[4].id);
    expect(nextRank(save)).toBeNull();
    expect(isFinalRank(save)).toBe(true);
  });

  it('rankProgress：末階含 boss 缺口', () => {
    const save = newGame(1000);
    save.reputation = 80;
    save.visitedBossDungeons = ['a'];
    const progress = rankProgress(save);
    expect(progress?.reputation).toEqual({ have: 80, need: 100 });
    expect(progress?.bossClears).toEqual({ have: 1, need: 3 });
  });
});
