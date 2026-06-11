// game.test.ts (Task 10 + Task 11 + Task 12 portion)
import { describe, it, expect } from 'vitest';
import { BomberGame } from './game';
import { SPAWN, SPEED_MS, BASE_BOMBS, BOMB_FUSE_MS, BLAST_TTL_MS, START_LIVES, INVULN_MS } from './constants';
import { SCORE } from './scoring';
import { enemyMoveMs } from './enemy';

describe('BomberGame: construction', () => {
  it('初始狀態：playing、floor 1、玩家在出生點、分數 0', () => {
    const g = new BomberGame({ seed: 1 });
    const s = g.getState();
    expect(s.status).toBe('playing');
    expect(s.floor).toBe(1);
    expect(s.player).toMatchObject({ x: SPAWN.x, y: SPAWN.y });
    expect(s.score).toBe(0);
    expect(s.bombs).toHaveLength(0);
  });
});

describe('BomberGame: movement', () => {
  it('按住 right 過一個移動週期後前進一格', () => {
    const g = new BomberGame({ seed: 1 });
    g.setHeld('right', true);
    g.step(SPEED_MS[0]); // 一個移動週期
    expect(g.getState().player.x).toBe(SPAWN.x + 1);
  });
  it('撞到 wall 不前進（往上是外框 wall）', () => {
    const g = new BomberGame({ seed: 1 });
    g.setHeld('up', true);
    g.step(SPEED_MS[0]);
    expect(g.getState().player.y).toBe(SPAWN.y);
  });
  it('單一 step 即使 dt 很大也只前進一格（冷卻擋住連走）', () => {
    const g = new BomberGame({ seed: 1 });
    g.setHeld('right', true);
    g.step(SPEED_MS[0] * 3);
    expect(g.getState().player.x).toBe(SPAWN.x + 1);
  });
});

describe('BomberGame: bomb placement', () => {
  it('放彈後場上多一顆，且站在炸彈格上', () => {
    const g = new BomberGame({ seed: 1 });
    g.input('bomb');
    const s = g.getState();
    expect(s.bombs).toHaveLength(1);
    expect(s.bombs[0]).toMatchObject({ x: SPAWN.x, y: SPAWN.y });
  });
  it('同時炸彈數受 maxBombs 限制', () => {
    const g = new BomberGame({ seed: 1 });
    g.input('bomb'); // 同一格只能放一顆
    g.input('bomb');
    expect(g.getState().bombs.length).toBe(BASE_BOMBS);
  });
  it('drainEvents 第二次呼叫為空', () => {
    const g = new BomberGame({ seed: 1 });
    g.input('bomb');
    g.drainEvents();
    expect(g.drainEvents()).toHaveLength(0);
  });
});

describe('BomberGame: explosions', () => {
  it('引信歸零後炸彈引爆並產生爆風', () => {
    const g = new BomberGame({ seed: 1 });
    g.input('bomb');
    g.step(BOMB_FUSE_MS); // 引爆
    const s = g.getState();
    expect(s.bombs).toHaveLength(0);
    expect(s.blasts.length).toBeGreaterThan(0);
  });
  it('爆風 TTL 過後消失', () => {
    const g = new BomberGame({ seed: 1 });
    g.input('bomb');
    g.step(BOMB_FUSE_MS);
    g.step(BLAST_TTL_MS + 1);
    expect(g.getState().blasts).toHaveLength(0);
  });
  it('炸到 crate 會破壞並加分', () => {
    // seed=1: grid[1][3] (x=3,y=1) is a crate.
    // Move right to (2,1) — guaranteed safe floor — then place bomb with fireRange=1.
    // Blast reaches right to (3,1)=crate (walls stop up/down; left is SPAWN floor).
    // Exactly one crate is broken → score must equal SCORE.crate (=10).
    const g = new BomberGame({ seed: 1 });
    g.setHeld('right', true);
    g.step(SPEED_MS[0]); // player advances one tile to (2,1)
    g.setHeld('right', false);
    expect(g.getState().player.x).toBe(SPAWN.x + 1); // sanity: now at (2,1)
    g.input('bomb'); // place bomb at (2,1)
    g.drainEvents(); // clear bombPlaced event
    g.step(BOMB_FUSE_MS); // detonate
    const events = g.drainEvents();
    const s = g.getState();
    expect(s.status).toBe('playing');
    expect(s.score).toBe(SCORE.crate); // exactly one crate at (3,1) was broken
    expect(events.some((e) => e.kind === 'crateBreak')).toBe(true);
  });
});

describe('BomberGame: enemies & death', () => {
  it('爆風炸到敵人 -> 敵人死亡並加分', () => {
    const g = new BomberGame({ seed: 1 });
    const s0 = g.getState();
    const target = s0.enemies[0];
    // 直接把敵人挪到玩家旁，放彈炸它（測試用：透過 debug setter）
    g.debugMoveEnemy(target.id, g.getState().player.x + 1, g.getState().player.y);
    g.debugSetFire(3);
    g.input('bomb');
    g.step(2000); // 引爆
    expect(g.getState().enemies.find((e) => e.id === target.id)!.alive).toBe(false);
    expect(g.getState().score).toBeGreaterThan(0);
  });

  it('清空敵人後 exit 啟用', () => {
    const g = new BomberGame({ seed: 1 });
    for (const e of g.getState().enemies) g.debugKillEnemy(e.id);
    expect(g.getState().exitActive).toBe(true);
  });

  it('踩上啟用的 exit -> 下一層、保留道具、層數 +1', () => {
    const g = new BomberGame({ seed: 1 });
    g.debugSetFire(4); // 道具狀態
    for (const e of g.getState().enemies) g.debugKillEnemy(e.id);
    const exit = g.getState().exit;
    g.debugTeleportPlayer(exit.x, exit.y);
    g.step(1); // 觸發下樓檢查
    const s = g.getState();
    expect(s.floor).toBe(2);
    expect(s.player.fireRange).toBe(4); // 道具帶到下一層
    expect(s.score).toBeGreaterThanOrEqual(200);
  });

  it('無敵時被爆風波及不扣命', () => {
    const g = new BomberGame({ seed: 1 });
    g.debugSetInvuln(INVULN_MS);
    g.input('bomb');
    g.step(2000);
    expect(g.getState().player.lives).toBe(START_LIVES);
  });

  it('被炸且無護盾無敵 -> 扣一命並重生於出生點且短暫無敵', () => {
    const g = new BomberGame({ seed: 1 });
    g.debugTeleportPlayer(3, 1);
    g.debugSetInvuln(0);
    g.input('bomb');          // 在 (3,1) 放彈
    g.debugFreezePlayer();    // 測試用：放彈後不移動，確保被自己炸到
    g.step(2000);
    const s = g.getState();
    expect(s.player.lives).toBe(START_LIVES - 1);
    expect(s.player.invulnMs).toBeGreaterThan(0);
  });

  it('護盾吸收一次傷害 -> 命數不變、護盾消失、短暫無敵，且發出 shielded 事件', () => {
    const g = new BomberGame({ seed: 1 });
    g.debugTeleportPlayer(3, 1);
    g.debugSetInvuln(0);
    g.debugSetShield(true);
    g.input('bomb');
    g.debugFreezePlayer();
    g.step(BOMB_FUSE_MS);
    const s = g.getState();
    expect(s.player.lives).toBe(START_LIVES);
    expect(s.player.shield).toBe(false);
    expect(s.player.invulnMs).toBeGreaterThan(0);
    expect(g.drainEvents().some((e) => e.kind === 'playerHit' && e.shielded === true)).toBe(true);
  });

  it('命數歸零 -> status=gameover 並發出 gameover 事件', () => {
    const g = new BomberGame({ seed: 1 });
    g.debugTeleportPlayer(3, 1);
    g.debugSetInvuln(0);
    g.debugSetLives(1);
    g.input('bomb');
    g.debugFreezePlayer();
    g.step(BOMB_FUSE_MS);
    expect(g.getState().status).toBe('gameover');
    expect(g.drainEvents().some((e) => e.kind === 'gameover')).toBe(true);
  });
});

describe('BomberGame: mimic 寶箱怪', () => {
  it('玩家距離 >2 不甦醒；≤2 甦醒並發 mimicWake 事件', () => {
    const g = new BomberGame({ seed: 1 });
    const target = g.getState().enemies[0];
    g.debugSetEnemyKind(target.id, 'mimic');
    g.debugMoveEnemy(target.id, 7, 7);
    g.debugSetInvuln(999999);
    g.step(1000); // 玩家在 (1,1)，距離 12 → 不甦醒
    expect(g.getState().enemies.find((e) => e.id === target.id)!.awake).toBe(false);
    g.drainEvents();
    g.debugTeleportPlayer(7, 5); // 距離 2 → 甦醒
    g.step(50);
    const e = g.getState().enemies.find((q) => q.id === target.id)!;
    expect(e.awake).toBe(true);
    expect(g.drainEvents().some((ev) => ev.kind === 'mimicWake')).toBe(true);
  });
});

describe('BomberGame: tank 裝甲魔像', () => {
  it('兩滴血：第一發爆風不死（hp 2→1），冷卻後第二發才死', () => {
    const g = new BomberGame({ seed: 1 });
    const target = g.getState().enemies[0];
    g.debugSetEnemyKind(target.id, 'tank');
    g.debugSetInvuln(999999);
    // 放到玩家右側 2 格、fire 3 蓋得到
    g.debugMoveEnemy(target.id, 3, 1);
    g.debugSetFire(3);
    g.input('bomb');
    g.step(BOMB_FUSE_MS); // 第一發引爆
    let e = g.getState().enemies.find((q) => q.id === target.id)!;
    expect(e.alive).toBe(true);
    expect(e.hp).toBe(1);
    // 等爆風與受擊冷卻過去，再炸第二發
    g.step(2000);
    g.debugMoveEnemy(target.id, 3, 1); // 拉回原位（期間可能遊走）
    g.input('bomb');
    g.step(BOMB_FUSE_MS);
    e = g.getState().enemies.find((q) => q.id === target.id)!;
    expect(e.alive).toBe(false);
  });

  it('爆風殘留期間不會連續扣血（受擊冷卻）', () => {
    const g = new BomberGame({ seed: 1 });
    const target = g.getState().enemies[0];
    g.debugSetEnemyKind(target.id, 'tank');
    g.debugSetInvuln(999999);
    g.debugMoveEnemy(target.id, 3, 1);
    g.debugSetFire(3);
    g.input('bomb');
    g.step(BOMB_FUSE_MS); // 引爆（tank hp 2→1）
    // 爆風 480ms 殘留期間逐 tick 推進：不得再扣血
    for (let i = 0; i < 5; i++) {
      g.debugMoveEnemy(target.id, 3, 1);
      g.step(80);
    }
    const e = g.getState().enemies.find((q) => q.id === target.id)!;
    expect(e.alive).toBe(true);
    expect(e.hp).toBe(1);
  });
});

describe('BomberGame: 爆風判定使用敵人「視覺佔據格」', () => {
  it('剛起步（視覺仍在格外）的敵人不會被炸死；走過半（視覺進入爆風格）才死', () => {
    const g = new BomberGame({ seed: 1 });
    const target = g.getState().enemies[0];
    g.debugSetInvuln(999999); // 玩家不死，專注敵人判定

    // 炸彈在出生點 (1,1)，fire 1 → 爆風覆蓋 (2,1)
    g.input('bomb');
    g.step(BOMB_FUSE_MS - 1);

    // 引爆前一刻：敵人「剛從 (3,1) 起步走向 (2,1)」（進度≈0，視覺仍在 (3,1)）
    g.debugSetEnemyMotion(target.id, 3, 1, 2, 1, 0);
    g.step(1); // 引爆
    expect(g.getState().blasts.length).toBeGreaterThan(0); // sanity: 爆風存在
    expect(g.getState().enemies.find((e) => e.id === target.id)!.alive).toBe(true);

    // 走過半（視覺已進入爆風格 (2,1)）→ 應被炸死
    const moveMs = enemyMoveMs(target.kind, 1);
    g.debugSetEnemyMotion(target.id, 3, 1, 2, 1, Math.ceil(moveMs * 0.6));
    g.step(1); // 爆風仍在（BLAST_TTL_MS=480 內）
    expect(g.getState().enemies.find((e) => e.id === target.id)!.alive).toBe(false);
  });
});
