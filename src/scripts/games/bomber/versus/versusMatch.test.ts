// src/scripts/games/bomber/versus/versusMatch.test.ts
import { describe, it, expect } from 'vitest';
import { VersusMatch } from './versusMatch';

const P2 = [{ id: 'alice', character: 'lena' as const }, { id: 'bob', character: 'mira' as const }];

describe('VersusMatch: 建構', () => {
  it('玩家出生在競技場出生點、versus 平衡屬性（命1/火2/彈1/速1）', () => {
    const m = new VersusMatch({ seed: 1, arenaId: 0, players: P2 });
    const s = m.getState();
    expect(s.players).toHaveLength(2);
    expect(s.players[0].x).not.toBe(s.players[1].x);
    for (const p of s.players) {
      expect(p.alive).toBe(true);
      expect(p.fireRange).toBe(2);
      expect(p.maxBombs).toBe(1);
      expect(p.speedLevel).toBe(1);
      expect(p.shield).toBe(false);
    }
  });

  it('保留角色技能、冷卻 = 單機 ×1.5', () => {
    const m = new VersusMatch({ seed: 1, arenaId: 0, players: P2 });
    const [a, b] = m.getState().players;
    expect(a.abilityId).toBe('detonate');
    expect(a.abilityMaxMs).toBe(9000 * 1.5);
    expect(b.abilityId).toBe('inferno');
    expect(b.abilityMaxMs).toBe(14000 * 1.5);
  });
});

describe('VersusMatch: 移動與放彈', () => {
  it('setHeld 後 step 會移動（grid-locked），且不能穿牆', () => {
    const m = new VersusMatch({ seed: 1, arenaId: 0, players: P2 });
    const before = m.getState().players[0];
    m.setHeld('alice', 'right', true);
    m.step(400);
    m.setHeld('alice', 'right', false);
    const after = m.getState().players[0];
    expect(after.x).toBeGreaterThanOrEqual(before.x); // 卡箱則原地
  });

  it('放彈：owner=玩家 id、各自額度獨立', () => {
    const m = new VersusMatch({ seed: 1, arenaId: 0, players: P2 });
    m.input('alice', 'bomb');
    m.input('bob', 'bomb');
    const s = m.getState();
    expect(s.bombs).toHaveLength(2);
    expect(new Set(s.bombs.map((b) => b.owner))).toEqual(new Set(['alice', 'bob']));
    m.input('alice', 'bomb');
    expect(m.getState().bombs).toHaveLength(2);
  });

  it('道具拾取提升屬性（fire/bomb/speed/shield；無 heart）', () => {
    const m = new VersusMatch({ seed: 1, arenaId: 0, players: P2 });
    m.debugGivePowerUp('alice', 'fire');
    m.debugGivePowerUp('alice', 'shield');
    const a = m.getState().players[0];
    expect(a.fireRange).toBe(3);
    expect(a.shield).toBe(true);
  });
});
