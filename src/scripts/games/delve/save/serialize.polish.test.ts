// serialize.polish.test.ts — 內容 / 打磨這一輪加進存檔的欄位：釣魚紀錄、玩家挖開的冰洞、放置的戰利品 / 家具
import { describe, it, expect } from 'vitest';
import { DelveGame } from '../engine/game';
import { serializeGame, restoreGame } from './serialize';

const SMALL = { width: 160, height: 100 };

describe('存檔：內容 / 打磨欄位', () => {
  it('釣魚紀錄存檔後讀回來還在；壞資料忽略', () => {
    const g = new DelveGame({ seed: 'save-polish', ...SMALL, peaceful: true });
    g.fishLog = { brook_trout: 3, old_whiskers: 1 };
    const r = restoreGame(serializeGame(g));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.game.fishLog).toEqual({ brook_trout: 3, old_whiskers: 1 });
  });
});
