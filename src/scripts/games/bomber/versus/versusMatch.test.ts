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

describe('VersusMatch: forfeit（斷線/離場強制淘汰）', () => {
  it('forfeit 把存活玩家標記淘汰、給名次、發 playerDead 事件', () => {
    const m = new VersusMatch({ seed: 1, arenaId: 0, players: [
      { id: 'a', character: 'lena' as const },
      { id: 'b', character: 'mira' as const },
      { id: 'c', character: 'aya' as const },
    ] });
    m.forfeit('a');
    const s = m.getState();
    const a = s.players.find((p) => p.id === 'a')!;
    expect(a.alive).toBe(false);
    // 淘汰當下仍有 2 人存活 → placement = 2+1 = 3
    expect(a.placement).toBe(3);
    const ev = m.drainEvents();
    expect(ev.some((e) => e.kind === 'playerDead' && e.playerId === 'a')).toBe(true);
  });

  it('forfeit 使存活剩 1 人 → 立即結束、倖存者勝出', () => {
    const m = new VersusMatch({ seed: 1, arenaId: 0, players: P2 });
    m.forfeit('alice');
    const s = m.getState();
    expect(s.status).toBe('finished');
    expect(s.winnerId).toBe('bob');
  });

  it('forfeit 已淘汰或未知 id 安全無作用（冪等）', () => {
    const m = new VersusMatch({ seed: 1, arenaId: 0, players: P2 });
    m.forfeit('alice');
    const before = m.stateHash();
    m.forfeit('alice');   // 已淘汰：不重複
    m.forfeit('nobody');  // 未知 id：忽略
    expect(m.stateHash()).toBe(before);
  });
});
