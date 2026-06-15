// src/scripts/games/bomber/versus/versusRules.test.ts
import { describe, it, expect } from 'vitest';
import { VersusMatch } from './versusMatch';
import { BOMB_FUSE_MS } from '../engine/constants';

const P2 = [{ id: 'alice', character: 'lena' as const }, { id: 'bob', character: 'mira' as const }];
const P3 = [...P2, { id: 'carol', character: 'aya' as const }];

describe('VersusMatch: 傷害與淘汰', () => {
  it('被爆風炸到：無盾即死（playerDead 事件、placement 由淘汰順序回填）', () => {
    const m = new VersusMatch({ seed: 1, arenaId: 0, players: P2 });
    const bob = m.getState().players[1];
    // 把 bob 搬到 alice 旁邊，alice 放彈走開引爆
    const alice = m.getState().players[0];
    m.debugMovePlayer('bob', alice.x + 1, alice.y);
    m.input('alice', 'bomb');
    // 走開到中央安全格：range-2 爆風下臂可達出生點 +2 格，須完全離開十字爆風範圍才算逃脫
    m.debugMovePlayer('alice', 5, 5);
    m.step(BOMB_FUSE_MS + 50);
    const s = m.getState();
    expect(s.players[1].alive).toBe(false);
    expect(s.players[1].placement).toBe(2);   // 2 人場第一個死 = 第 2 名
    expect(s.status).toBe('finished');
    expect(s.winnerId).toBe('alice');
    expect(s.players[0].placement).toBe(1);
  });

  it('盾擋一次死：shield 消失、短暫無敵、不淘汰', () => {
    const m = new VersusMatch({ seed: 1, arenaId: 0, players: P2 });
    const alice = m.getState().players[0];
    m.debugGivePowerUp('bob', 'shield');
    m.debugMovePlayer('bob', alice.x + 1, alice.y);
    m.input('alice', 'bomb');
    m.debugMovePlayer('alice', alice.x, alice.y + 2);
    m.step(BOMB_FUSE_MS + 50);
    const bob = m.getState().players[1];
    expect(bob.alive).toBe(true);
    expect(bob.shield).toBe(false);
    expect(bob.invulnMs).toBeGreaterThan(0);
  });

  it('3 人場：同幀雙殺 → 兩人同名次、倖存者勝', () => {
    const m = new VersusMatch({ seed: 1, arenaId: 0, players: P3 });
    const a = m.getState().players[0];
    m.debugMovePlayer('bob', a.x + 1, a.y);
    m.debugMovePlayer('carol', a.x - 1 >= 1 ? a.x - 1 : a.x + 2, a.y);
    m.input('alice', 'bomb');
    m.debugMovePlayer('alice', 5, 5); // 同上：離開十字爆風到中央安全格
    m.step(BOMB_FUSE_MS + 50);
    const s = m.getState();
    expect(s.status).toBe('finished');
    expect(s.winnerId).toBe('alice');
    const placements = s.players.map((p) => p.placement).sort();
    expect(placements).toEqual([1, 2, 2]); // 同幀死共享第 2 名
  });

  it('全滅同幀 = 平局（winnerId null、全員 placement 1）', () => {
    const m = new VersusMatch({ seed: 1, arenaId: 0, players: P2 });
    const a = m.getState().players[0];
    m.debugMovePlayer('bob', a.x + 1, a.y);
    m.input('alice', 'bomb');
    // alice 不走開 → 同歸於盡
    m.step(BOMB_FUSE_MS + 50);
    const s = m.getState();
    expect(s.status).toBe('finished');
    expect(s.winnerId).toBeNull();
    expect(s.players.map((p) => p.placement)).toEqual([1, 1]);
  });
});

describe('VersusMatch: 技能', () => {
  it('lena 遙控起爆：引爆自己的彈、不動他人的彈', () => {
    const m = new VersusMatch({ seed: 1, arenaId: 0, players: P2 });
    m.input('alice', 'bomb');
    m.input('bob', 'bomb');
    m.input('alice', 'ability');
    m.step(50);
    const s = m.getState();
    expect(s.bombs.filter((b) => b.owner === 'alice')).toHaveLength(0); // 已爆
    expect(s.bombs.filter((b) => b.owner === 'bob')).toHaveLength(1);   // 不受影響
  });

  it('技能冷卻獨立計時', () => {
    const m = new VersusMatch({ seed: 1, arenaId: 0, players: P2 });
    m.input('alice', 'bomb');
    m.input('alice', 'ability');
    expect(m.getState().players[0].abilityCooldownMs).toBeGreaterThan(0);
    expect(m.getState().players[1].abilityCooldownMs).toBe(0);
  });
});
